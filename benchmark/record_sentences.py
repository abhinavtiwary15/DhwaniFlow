#!/usr/bin/env python3
"""
record_sentences.py - Interactive Audio Recording Helper for DhwaniFlow Benchmark

Records 16 kHz mono WAV audio clips for benchmark sentences using sounddevice & soundfile.
Interactive workflow:
  1. Displays sentence text and must-have terms.
  2. Press Enter to start recording, Enter to stop.
  3. Auto-trims leading/trailing silence conservatively.
  4. Checks audio health (duration <= 28s, clipping, low volume).
  5. Plays back recording and prompts to Accept, Redo, Replay, or Skip.

Usage:
  python record_sentences.py [--condition clean|noisy] [--redo] [--only s06,s07]
"""

import os
import sys
import time
import json
import argparse
import threading
from pathlib import Path
import numpy as np
import sounddevice as sd
import soundfile as sf

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SAMPLE_RATE = 16000
CHANNELS = 1


def trim_silence_conservative(audio: np.ndarray, sample_rate: int = 16000,
                              threshold: float = 0.015, pad_sec: float = 0.15) -> np.ndarray:
    """
    Conservatively trim leading and trailing silence from audio while preserving
    a pad_sec (150ms) buffer so no word onsets or offsets are clipped.
    """
    if len(audio) == 0:
        return audio

    abs_audio = np.abs(audio)
    non_silent = np.where(abs_audio > threshold)[0]

    if len(non_silent) == 0:
        return audio

    pad_samples = int(pad_sec * sample_rate)
    start_idx = max(0, non_silent[0] - pad_samples)
    end_idx = min(len(audio), non_silent[-1] + pad_samples + 1)

    return audio[start_idx:end_idx]


def record_clip_interactive(prompt_text: str) -> np.ndarray:
    """
    Waits for Enter to start, records audio continuously until Enter is pressed to stop.
    """
    recorded_chunks = []
    stop_event = threading.Event()

    def callback(indata, frames, time_info, status):
        if status:
            pass
        if not stop_event.is_set():
            recorded_chunks.append(indata.copy())

    input("\n👉 Press [ENTER] when ready to start recording...")

    # Start stream
    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
        callback=callback
    )

    with stream:
        print("🔴 RECORDING... Speak now! (Press [ENTER] to stop): ", end="", flush=True)
        # Wait for enter to stop
        sys.stdin.readline()
        stop_event.set()

    print("⏹ Stopped recording.")

    if not recorded_chunks:
        return np.array([], dtype=np.float32)

    audio_data = np.concatenate(recorded_chunks, axis=0).flatten()
    return audio_data


def check_audio_health(audio: np.ndarray, sample_rate: int = 16000):
    """
    Validates audio duration, peak level, and clipping.
    Prints helpful warnings to the user.
    """
    duration_sec = len(audio) / sample_rate
    peak = float(np.max(np.abs(audio))) if len(audio) > 0 else 0.0

    print(f"\n📊 Clip Details:")
    print(f"   Duration:   {duration_sec:.2f} seconds")
    print(f"   Peak Level: {peak:.3f} (-{20 * np.log10(max(1e-5, peak)):.1f} dBFS)")

    if duration_sec > 28.0:
        print(f"   ⚠️  WARNING: Clip exceeds 28s limit ({duration_sec:.1f}s). Gnani has a strict 30s limit!")
    elif duration_sec < 0.5:
        print(f"   ⚠️  WARNING: Clip is very short ({duration_sec:.2f}s). Did you speak?")

    if peak >= 0.98:
        print(f"   ⚠️  WARNING: Audio clipped or near maximum (peak: {peak:.2f})! Lower microphone gain.")
    elif peak < 0.05:
        print(f"   ⚠️  WARNING: Very quiet recording (peak: {peak:.3f}). Increase mic volume or speak closer.")


def record_sentence(item: dict, output_file: Path, redo: bool = False):
    """
    Presents a sentence to the user and manages recording, playback, and confirmation.
    """
    item_id = item["id"]
    category = item.get("category", "")
    text = item["text"]
    terms = item.get("must_have_terms", [])

    print("\n" + "=" * 70)
    print(f"Sentence ID:  {item_id} [{category.upper()}]")
    print(f"Spoken Text:  \"{text}\"")
    if terms:
        print(f"Key Terms:    {', '.join(terms)}")
    print("=" * 70)

    while True:
        raw_audio = record_clip_interactive(text)
        if len(raw_audio) == 0:
            print("No audio recorded. Retrying...")
            continue

        trimmed_audio = trim_silence_conservative(raw_audio, sample_rate=SAMPLE_RATE)
        check_audio_health(trimmed_audio, sample_rate=SAMPLE_RATE)

        # Offer playback and confirmation
        while True:
            choice = input("\nOptions: [ENTER] Accept & Save | (p) Playback | (r) Redo | (s) Skip: ").strip().lower()

            if choice == "p":
                print("🔊 Playing back audio...")
                sd.play(trimmed_audio, SAMPLE_RATE)
                sd.wait()
                continue
            elif choice == "r":
                print("🔄 Redoing sentence...")
                break
            elif choice == "s":
                print(f"⏭ Skipped {item_id}.")
                return False
            elif choice == "":
                # Save WAV file
                output_file.parent.mkdir(parents=True, exist_ok=True)
                sf.write(str(output_file), trimmed_audio, SAMPLE_RATE, subtype="PCM_16")
                print(f"✅ Saved to: {output_file}")
                return True
            else:
                print("Invalid option. Enter 'p', 'r', 's', or press Enter.")


def main():
    parser = argparse.ArgumentParser(description="Interactive sentence recording for DhwaniFlow benchmark.")
    parser.add_argument("--condition", default="clean",
                        help="Audio condition (e.g. clean, noisy, phone8k_noise)")
    parser.add_argument("--set", choices=["general", "project"], default="general",
                        help="Sentence set: 'general' (sentences.json) or 'project' (sentences_project.json)")
    parser.add_argument("--sentences", default="benchmark/sentences.json",
                        help="Path to sentences.json")
    parser.add_argument("--output-dir", default=None,
                        help="Override output directory (default: benchmark/audio/<condition>)")
    parser.add_argument("--redo", action="store_true",
                        help="Re-record sentences that already have WAV files")
    parser.add_argument("--only", default=None,
                        help="Comma-separated IDs to record (e.g. s06,s07)")
    parser.add_argument("--list-devices", action="store_true",
                        help="List available audio input devices and exit")

    args = parser.parse_args()

    if args.list_devices:
        print("Available Audio Devices:")
        print(sd.query_devices())
        return

    # Safety check: Never record without interactive terminal
    if not sys.stdin.isatty():
        print("Error: record_sentences.py requires an interactive terminal (TTY) for user confirmation.")
        print("To run automated test generation without a microphone, use synthetic test generators.")
        sys.exit(1)

    base_dir = Path(__file__).resolve().parent
    if args.set == "project" and args.sentences == "benchmark/sentences.json":
        sentences_path = base_dir / "sentences_project.json"
    else:
        sentences_path = Path(args.sentences)

    if not sentences_path.exists():
        print(f"Error: Sentences file not found: {sentences_path}")
        sys.exit(1)

    with open(sentences_path, "r", encoding="utf-8") as f:
        sentences = json.load(f)

    only_filter = set(args.only.split(",")) if args.only else None

    if args.output_dir:
        out_dir = Path(args.output_dir)
    elif args.set == "project":
        out_dir = base_dir / "audio" / "project" / args.condition
    else:
        out_dir = base_dir / "audio" / args.condition
    out_dir.mkdir(parents=True, exist_ok=True)

    print("==================================================")
    print(f"     DhwaniFlow Benchmark Audio Recorder [{args.condition.upper()}]")
    print("==================================================")
    print(f"Sentences:   {sentences_path} ({len(sentences)} items)")
    print(f"Destination: {out_dir}")
    print(f"Redo Mode:   {args.redo}")
    if only_filter:
        print(f"Filtering:   {', '.join(sorted(only_filter))}")
    print("==================================================")

    recorded_count = 0
    skipped_count = 0

    for idx, item in enumerate(sentences, 1):
        item_id = item["id"]
        if only_filter and item_id not in only_filter:
            continue

        wav_path = out_dir / f"{item_id}.wav"
        if wav_path.exists() and not args.redo and (not only_filter or item_id not in only_filter):
            print(f"[{idx}/{len(sentences)}] Skipping {item_id}: already exists ({wav_path.name})")
            skipped_count += 1
            continue

        print(f"\n[{idx}/{len(sentences)}] Recording sentence {item_id}...")
        success = record_sentence(item, wav_path, redo=args.redo)
        if success:
            recorded_count += 1

    print("\n==================================================")
    print("               Recording Session Done             ")
    print("==================================================")
    print(f"Total Sentences: {len(sentences)}")
    print(f"Recorded/Saved:  {recorded_count}")
    print(f"Skipped/Exist:   {skipped_count}")
    print(f"Folder:          {out_dir}")
    print("==================================================")


if __name__ == "__main__":
    main()
