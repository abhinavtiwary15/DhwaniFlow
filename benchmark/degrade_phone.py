#!/usr/bin/env python3
"""
degrade_phone.py - Telephony Audio Degradation Pipeline for DhwaniFlow Benchmark

Simulates real-world telephone network conditions:
1. Phone Chain:
   - Bandpass filter: 300 Hz - 3400 Hz (PSTN speech bandwidth)
   - Downsample to 8 kHz
   - G.711 mu-law (8-bit non-linear logarithmic PCM) encode & decode
   - Resample back into standard 16 kHz mono WAV container
   -> Output: benchmark/audio/phone8k/<id>.wav

2. Phone + Noise Chain:
   - Takes phone8k audio and mixes background noise at target SNR (default: 10 dB)
   - Uses real ambient loops from benchmark/noise/*.wav if present
   - Otherwise synthesizes pink/brown noise with periodic vehicle horn bursts
   -> Output: benchmark/audio/phone8k_noise/<id>.wav
"""

import os
import sys
import math
import shutil
import tempfile
import argparse
import subprocess
from pathlib import Path
from typing import Tuple
import numpy as np
import soundfile as sf

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def resolve_ffmpeg_cmd() -> str:
    """Find ffmpeg in PATH or standard Windows WinGet locations."""
    if shutil.which("ffmpeg"):
        return "ffmpeg"

    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        candidates = [
            Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe",
            Path(local_app_data) / "Microsoft" / "WinGet" / "Packages" / "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe" / "ffmpeg-9.0.2-full_build" / "bin" / "ffmpeg.exe",
        ]
        for c in candidates:
            if c.exists():
                return str(c)

    return "ffmpeg"


def apply_phone_codec(input_wav: Path, output_wav: Path, ffmpeg_cmd: str):
    """
    Applies the telephone codec degradation:
    1. Bandpass filter: 300Hz to 3400Hz
    2. Resample to 8000 Hz with G.711 mu-law encoding
    3. Decode back into a 16 kHz mono 16-bit WAV container
    """
    output_wav.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        stage1_8k = Path(tmp_dir) / "stage1_mulaw_8k.wav"

        # Stage 1: Bandpass + 8kHz + pcm_mulaw
        cmd1 = [
            ffmpeg_cmd, "-y",
            "-i", str(input_wav),
            "-af", "highpass=f=300,lowpass=f=3400,aresample=8000",
            "-ac", "1",
            "-c:a", "pcm_mulaw",
            str(stage1_8k)
        ]
        res1 = subprocess.run(cmd1, capture_output=True, text=True)
        if res1.returncode != 0:
            raise RuntimeError(f"FFmpeg stage 1 failed: {res1.stderr[-250:]}")

        # Stage 2: Decode back to 16 kHz mono PCM container
        cmd2 = [
            ffmpeg_cmd, "-y",
            "-i", str(stage1_8k),
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            str(output_wav)
        ]
        res2 = subprocess.run(cmd2, capture_output=True, text=True)
        if res2.returncode != 0:
            raise RuntimeError(f"FFmpeg stage 2 failed: {res2.stderr[-250:]}")


def synthesize_ambient_noise(num_samples: int, sample_rate: int = 16000, seed: int = 42) -> np.ndarray:
    """
    Synthesize street-like Indian ambient noise in pure NumPy:
    - Pink noise (1/f) background rumble via Paul Kellet's filter
    - Periodic dual-frequency horn bursts (800 Hz + 1040 Hz)
    """
    rng = np.random.RandomState(seed)

    # 1. White noise source
    white = rng.randn(num_samples).astype(np.float64)

    # 2. Pink noise via Paul Kellet's filter (pure numpy, 3dB/octave slope)
    pink = np.empty(num_samples, dtype=np.float64)
    b0, b1, b2, b3, b4, b5, b6 = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    for i in range(num_samples):
        w = white[i]
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.76160 * b5 - w * 0.0168980
        pink[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
        b6 = w * 0.115926

    # Remove DC offset
    pink -= np.mean(pink)

    # 3. Add periodic burst transients mimicking Indian traffic / horn bursts
    noise = pink.copy()
    horn_duration = int(0.25 * sample_rate)
    burst_interval = int(1.8 * sample_rate)

    t = np.arange(horn_duration) / sample_rate
    horn_tone = 0.6 * np.sin(2 * np.pi * 820 * t) + 0.4 * np.sin(2 * np.pi * 1040 * t)
    envelope = np.hanning(horn_duration)
    horn_burst = horn_tone * envelope

    pos = int(0.5 * sample_rate)
    while pos + horn_duration < num_samples:
        noise[pos:pos + horn_duration] += horn_burst * 0.4
        pos += burst_interval + rng.randint(-sample_rate // 4, sample_rate // 4)

    # Normalize
    noise = noise / (np.max(np.abs(noise)) + 1e-6)
    return noise.astype(np.float32)


def load_or_create_noise(num_samples: int, noise_dir: Path, sample_rate: int = 16000, seed: int = 42) -> np.ndarray:
    """
    Loads noise loops from noise_dir if available, otherwise generates synthetic noise.
    """
    if noise_dir.exists():
        wav_files = list(noise_dir.glob("*.wav")) + list(noise_dir.glob("*.mp3"))
        if wav_files:
            chosen = wav_files[seed % len(wav_files)]
            data, sr = sf.read(str(chosen), dtype="float32")
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            # Resample / repeat if needed
            if len(data) < num_samples:
                reps = int(math.ceil(num_samples / len(data)))
                data = np.tile(data, reps)
            start_pos = (seed * 1337) % (len(data) - num_samples + 1)
            return data[start_pos:start_pos + num_samples]

    return synthesize_ambient_noise(num_samples, sample_rate=sample_rate, seed=seed)


def mix_noise_at_snr(signal: np.ndarray, noise: np.ndarray, target_snr_db: float = 10.0) -> Tuple[np.ndarray, float]:
    """
    Mix signal and noise at specified target SNR (dB).
    Returns (mixed_audio, measured_snr_db).
    """
    # Calculate signal power (RMS squared)
    signal_power = np.mean(signal ** 2)
    if signal_power < 1e-10:
        return signal, target_snr_db

    noise_power = np.mean(noise ** 2)
    if noise_power < 1e-10:
        return signal, 99.0

    # P_noise_target = P_signal / (10 ^ (SNR / 10))
    target_noise_power = signal_power / (10.0 ** (target_snr_db / 10.0))
    scale = np.sqrt(target_noise_power / noise_power)
    scaled_noise = noise * scale

    mixed = signal + scaled_noise

    # Prevent hard clipping
    peak = np.max(np.abs(mixed))
    if peak > 0.95:
        mixed = (mixed / peak) * 0.95
        # Re-estimate powers after peak scaling
        scaled_noise = scaled_noise * (0.95 / peak)
        signal = signal * (0.95 / peak)

    actual_sig_pow = np.mean(signal ** 2)
    actual_noi_pow = np.mean(scaled_noise ** 2)
    measured_snr = 10.0 * np.log10(max(1e-12, actual_sig_pow) / max(1e-12, actual_noi_pow))

    return mixed.astype(np.float32), round(float(measured_snr), 2)


def process_clean_folder(clean_dir: Path, output_base: Path, noise_dir: Path,
                          target_snr_db: float = 10.0, seed: int = 42):
    """
    Processes all WAV files in clean_dir and generates both phone8k and phone8k_noise sets.
    """
    ffmpeg_cmd = resolve_ffmpeg_cmd()

    phone8k_dir = output_base / "phone8k"
    phone8k_noise_dir = output_base / "phone8k_noise"
    phone8k_dir.mkdir(parents=True, exist_ok=True)
    phone8k_noise_dir.mkdir(parents=True, exist_ok=True)

    wav_files = sorted(list(clean_dir.glob("*.wav")))
    if not wav_files:
        print(f"No WAV files found in {clean_dir}.")
        print("Please record clean sentences first with:")
        print("  python benchmark/record_sentences.py --condition clean")
        return

    print("==================================================")
    print("      DhwaniFlow Audio Phone-Quality Degrader        ")
    print("==================================================")
    print(f"Input:        {clean_dir} ({len(wav_files)} files)")
    print(f"Phone 8k Out: {phone8k_dir}")
    print(f"Noise Out:    {phone8k_noise_dir}")
    print(f"Target SNR:   {target_snr_db} dB")
    print(f"FFmpeg Path:  {ffmpeg_cmd}")
    if noise_dir.exists() and list(noise_dir.glob("*.wav")):
        print(f"Noise Source: Real WAV files in {noise_dir}")
    else:
        print(f"Noise Source: Synthetic pink/brown traffic & horn noise (deterministic seed)")
        print(f"              [Tip: Drop real ambient WAVs into {noise_dir} for authentic street audio]")
    print("==================================================\n")

    for idx, clean_path in enumerate(wav_files, 1):
        item_id = clean_path.stem
        phone8k_path = phone8k_dir / f"{item_id}.wav"
        phone8k_noise_path = phone8k_noise_dir / f"{item_id}.wav"

        # 1. Apply Phone Codec (G.711 + Bandpass)
        apply_phone_codec(clean_path, phone8k_path, ffmpeg_cmd)

        # 2. Read degraded phone audio
        phone_audio, sr = sf.read(str(phone8k_path), dtype="float32")

        # 3. Mix noise
        noise = load_or_create_noise(len(phone_audio), noise_dir, sample_rate=sr, seed=seed + idx)
        noisy_audio, measured_snr = mix_noise_at_snr(phone_audio, noise, target_snr_db=target_snr_db)

        # 4. Save phone8k_noise
        sf.write(str(phone8k_noise_path), noisy_audio, sr, subtype="PCM_16")

        print(f"[{idx:02d}/{len(wav_files):02d}] {item_id}: Created phone8k + phone8k_noise (Measured SNR: {measured_snr:.1f} dB)")

    print("\n==================================================")
    print("Degradation pipeline complete!")
    print(f"Phone 8k clips:       {len(wav_files)} saved to {phone8k_dir}")
    print(f"Phone 8k+noise clips: {len(wav_files)} saved to {phone8k_noise_dir}")
    print("==================================================")


def main():
    parser = argparse.ArgumentParser(description="Degrade clean benchmark audio to phone-quality 8kHz G.711 and noise.")
    parser.add_argument("--clean-dir", default="benchmark/audio/clean",
                        help="Input directory containing clean 16kHz WAVs")
    parser.add_argument("--output-base", default="benchmark/audio",
                        help="Output directory base (writes to phone8k/ and phone8k_noise/)")
    parser.add_argument("--noise-dir", default="benchmark/noise",
                        help="Folder containing real background noise WAV files")
    parser.add_argument("--snr", type=float, default=10.0,
                        help="Target Signal-to-Noise Ratio (dB) for phone8k_noise (default: 10.0)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for deterministic synthetic noise")

    args = parser.parse_args()

    clean_dir = Path(args.clean_dir)
    output_base = Path(args.output_base)
    noise_dir = Path(args.noise_dir)

    process_clean_folder(
        clean_dir=clean_dir,
        output_base=output_base,
        noise_dir=noise_dir,
        target_snr_db=args.snr,
        seed=args.seed
    )


if __name__ == "__main__":
    main()
