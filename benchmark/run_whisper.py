#!/usr/bin/env python3
"""
run_whisper.py - Whisper Benchmark Runner using faster-whisper (Sequential & Cached)

Runs faster-whisper on benchmark audio clips.
Auto-detects GPU (CUDA) or falls back to CPU.
Supports:
  - whisper_plain    : language="hi", no initial prompt [default]
  - whisper_prompted : language="hi", initial_prompt built from dev-terms.json [default]
  - whisper_auto     : language=None (auto-detection)

Outputs per (variant, condition):
  benchmark/results/raw/whisper__<variant>__<condition>.json
"""

import os
import sys
import time
import json
import re
import argparse
from pathlib import Path
from typing import List, Tuple, Dict, Optional
import soundfile as sf
import ctranslate2
from faster_whisper import WhisperModel

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

AVAILABLE_VARIANTS = ["whisper_plain", "whisper_prompted", "whisper_auto"]
DEFAULT_VARIANTS = ["whisper_plain", "whisper_prompted"]
AVAILABLE_CONDITIONS = ["clean", "phone8k", "phone8k_noise", "noisy"]
AVAILABLE_MODELS = ["small", "medium", "large-v3"]
SAMPLE_SENTENCE_IDS = ["s01", "s06", "s10", "s18", "s24", "s28"]

MODEL_DOWNLOAD_SIZES_GB = {
    "small": 0.5,
    "medium": 1.5,
    "large-v3": 3.1,
}


def detect_output_script(text: str) -> str:
    """Detect whether output script is Devanagari, Latin, Nastaliq (Urdu), or Other."""
    if not text:
        return "empty"

    devanagari = len(re.findall(r"[\u0900-\u097F]", text))
    urdu = len(re.findall(r"[\u0600-\u06FF]", text))
    latin = len(re.findall(r"[a-zA-Z]", text))

    counts = [("Devanagari", devanagari), ("Nastaliq (Urdu)", urdu), ("Latin", latin)]
    counts.sort(key=lambda x: x[1], reverse=True)

    if counts[0][1] == 0:
        return "Other"

    # If top two are close (code-mixed)
    if devanagari > 0 and latin > 0 and (abs(devanagari - latin) / max(devanagari, latin) < 0.4):
        return "Code-Mixed"

    return counts[0][0]


def get_available_conditions(audio_dir: Path) -> List[str]:
    """Finds all audio condition folders that exist and contain .wav files."""
    candidates = ["clean", "phone8k", "phone8k_noise", "noisy"]
    found = []
    for c in candidates:
        cond_dir = audio_dir / c
        if cond_dir.exists() and any(cond_dir.glob("*.wav")):
            found.append(c)
    return found if found else ["clean"]


def check_offline_cache(model_name: str) -> Tuple[bool, Path, float]:
    """
    Checks if the model is fully cached locally in Hugging Face hub cache.
    Returns (is_cached, path, size_gb).
    """
    size_gb = MODEL_DOWNLOAD_SIZES_GB.get(model_name, 1.0)
    hf_home = os.environ.get("HF_HOME")
    hub_dir = Path(hf_home) / "hub" if hf_home else Path.home() / ".cache" / "huggingface" / "hub"

    model_dir = hub_dir / f"models--Systran--faster-whisper-{model_name}"
    if not model_dir.exists():
        return False, model_dir, size_gb

    snapshots = model_dir / "snapshots"
    if snapshots.exists():
        for snap in snapshots.iterdir():
            if snap.is_dir():
                model_bin = snap / "model.bin"
                if model_bin.exists() and model_bin.is_file() and model_bin.stat().st_size > 10_000_000:
                    return True, model_dir, size_gb

    return False, model_dir, size_gb


def load_dev_terms(terms_path: Path) -> str:
    """Load default developer keyterms from dev-terms.json as initial prompt for Whisper."""
    if terms_path.exists():
        try:
            with open(terms_path, "r", encoding="utf-8") as f:
                terms = json.load(f)
            if isinstance(terms, list):
                return ", ".join(terms[:60])
        except Exception:
            pass
    return "API, useEffect, useState, Kubernetes, Docker, PR, deploy, merge, backend, frontend"


def get_raw_output_path(base_dir: Path, model_size: str, variant: str, condition: str) -> Path:
    raw_dir = base_dir / "results" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    return raw_dir / f"whisper-{model_size}__{variant}__{condition}.json"


def load_cached_results(raw_path: Path) -> dict:
    if raw_path.exists():
        try:
            with open(raw_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {item["id"]: item for item in data if isinstance(item, dict) and "id" in item}
        except Exception:
            pass
    return {}


def select_device_and_model(requested_model: Optional[str] = None,
                            requested_compute: Optional[str] = None) -> Tuple[str, str, str]:
    """Select best device, model size, and compute type."""
    has_cuda = False
    try:
        has_cuda = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        has_cuda = False

    device = "cuda" if has_cuda else "cpu"

    if requested_model:
        model_size = requested_model
    else:
        env_model = os.environ.get("WHISPER_MODEL", "").strip()
        if env_model:
            model_size = env_model
        else:
            model_size = "large-v3" if has_cuda else "small"

    if requested_compute:
        compute_type = requested_compute
    else:
        compute_type = "float16" if has_cuda else "int8"

    return model_size, device, compute_type


def run_whisper_benchmark(args):
    base_dir = Path(__file__).resolve().parent
    if args.project_test and args.sentences == "benchmark/sentences.json":
        sentences_path = base_dir / "sentences_project.json"
    else:
        sentences_path = Path(args.sentences)

    dev_terms_path = base_dir / "data" / "dev-terms.json"
    project_terms_path = base_dir / "data" / "project-terms.json"

    # Select hardware device and default compute type
    has_cuda = False
    try:
        has_cuda = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        has_cuda = False

    device = "cuda" if has_cuda else "cpu"
    compute_type = args.compute_type or ("float16" if has_cuda else "int8")

    # Handle --offline-check
    if args.offline_check:
        print("==================================================")
        print("       Whisper Offline Model Cache Check          ")
        print("==================================================")
        for m in AVAILABLE_MODELS:
            is_cached, path, size_gb = check_offline_cache(m)
            status = "CACHED (Ready for offline use)" if is_cached else f"NOT CACHED (will download ~{size_gb} GB from HF Hub)"
            mark = "✓" if is_cached else "✗"
            print(f"  [{mark}] {m:<10}: {status}")
            print(f"      Location: {path}")
        print("==================================================")
        return

    if not sentences_path.exists():
        print(f"Error: Sentences file not found: {sentences_path}")
        sys.exit(1)

    with open(sentences_path, "r", encoding="utf-8") as f:
        sentences = json.load(f)

    # Filter sentences if --sample or --limit specified
    if args.sample:
        sentences = [s for s in sentences if s["id"] in SAMPLE_SENTENCE_IDS]
    if args.limit and args.limit > 0:
        sentences = sentences[:args.limit]

    # Parse requested models
    models_to_run = []
    if args.models:
        for m in args.models:
            for sub_m in m.split(","):
                sub_m = sub_m.strip()
                if sub_m:
                    if sub_m not in AVAILABLE_MODELS:
                        print(f"Error: Unknown model '{sub_m}'. Available: {', '.join(AVAILABLE_MODELS)}")
                        sys.exit(1)
                    if sub_m not in models_to_run:
                        models_to_run.append(sub_m)
    if not models_to_run:
        env_model = os.environ.get("WHISPER_MODEL", "").strip()
        if env_model and env_model in AVAILABLE_MODELS:
            models_to_run = [env_model]
        else:
            models_to_run = ["large-v3" if device == "cuda" else "small"]

    # Parse requested variants
    if args.project_test and not args.variants:
        variants = ["whisper_generic_prompted", "whisper_project_prompted"]
    elif args.variants:
        variants = []
        for v in args.variants:
            for sub_v in v.split(","):
                sub_v = sub_v.strip()
                if sub_v and sub_v not in variants:
                    variants.append(sub_v)
    else:
        variants = DEFAULT_VARIANTS

    # Parse requested conditions
    if args.conditions:
        conditions = []
        for c in args.conditions:
            for sub_c in c.split(","):
                sub_c = sub_c.strip()
                if sub_c and sub_c not in conditions:
                    conditions.append(sub_c)
    else:
        audio_root = (base_dir / "audio" / "project") if (base_dir / "audio" / "project").exists() else (base_dir / "audio")
        conditions = get_available_conditions(audio_root)

    dev_prompt = load_dev_terms(dev_terms_path)
    proj_prompt = load_dev_terms(project_terms_path) if project_terms_path.exists() else dev_prompt

    for model_size in models_to_run:
        print("==================================================")
        print("        DhwaniFlow / Whisper STT Benchmark Runner    ")
        print("==================================================")
        print(f"Whisper Model: {model_size}")
        print(f"Device:        {device.upper()} (compute_type: {compute_type})")
        print(f"Sentences:     {len(sentences)} items" + (" (SAMPLE MODE)" if args.sample else "") + (f" (LIMIT: {args.limit})" if args.limit else ""))
        print(f"Variants:      {', '.join(variants)}")
        print(f"Conditions:    {', '.join(conditions)}")
        print(f"Force Mode:    {args.force}")
        print(f"Language Mode: {args.language or 'variant-default'}")
        print("==================================================")

        # Runtime estimation
        est_per_clip_sec = {
            ("cuda", "small"): 0.3,
            ("cuda", "medium"): 0.8,
            ("cuda", "large-v3"): 1.8,
            ("cpu", "small"): 2.5,
            ("cpu", "medium"): 7.0,
            ("cpu", "large-v3"): 16.0,
        }.get((device, model_size), 3.0)

        pending_clips = 0
        total_clips = 0
        for v in variants:
            for c in conditions:
                raw_p = get_raw_output_path(base_dir, model_size, v, c)
                leg_p = base_dir / "results" / "raw" / f"whisper__{v}__{c}.json"
                cached_ids = set()
                if not args.force:
                    if raw_p.exists():
                        cached_ids = set(load_cached_results(raw_p).keys())
                    elif leg_p.exists() and model_size == "small":
                        cached_ids = set(load_cached_results(leg_p).keys())
                for s in sentences:
                    audio_p = (base_dir / "audio" / "project" / c / f"{s['id']}.wav") if (base_dir / "audio" / "project" / c / f"{s['id']}.wav").exists() else (base_dir / "audio" / c / f"{s['id']}.wav")
                    if audio_p.exists():
                        total_clips += 1
                        if s["id"] not in cached_ids:
                            pending_clips += 1

        est_seconds = round(pending_clips * est_per_clip_sec)
        est_minutes = round(est_seconds / 60, 1)

        print(f"Clips To Process: {pending_clips} pending ({total_clips - pending_clips} cached / {total_clips} total)")
        print(f"Estimated Runtime: ~{est_seconds}s (~{est_minutes} min) on {device.upper()} ({model_size})")
        print("==================================================\n")

        # Check cache status of selected model
        is_cached, path, size_gb = check_offline_cache(model_size)
        if not is_cached:
            print(f"Notice: Model '{model_size}' is not yet cached locally. First run will download ~{size_gb} GB from Hugging Face hub.\n")

        # Initialize model once
        print(f"Loading Whisper model '{model_size}' on {device} ({compute_type})...")
        load_start = time.perf_counter()
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        load_time_sec = round(time.perf_counter() - load_start, 2)
        print(f"Model loaded successfully in {load_time_sec}s.\n")
        for variant in variants:
            for condition in conditions:
                if args.project_test:
                    raw_dir = base_dir / "results" / "raw"
                    raw_dir.mkdir(parents=True, exist_ok=True)
                    raw_path = raw_dir / f"project_test__whisper-{model_size}__{variant}__{condition}.json"
                else:
                    raw_path = get_raw_output_path(base_dir, model_size, variant, condition)
                legacy_path = base_dir / "results" / "raw" / f"whisper__{variant}__{condition}.json"
                cached = {}
                if not args.force:
                    if raw_path.exists():
                        cached = load_cached_results(raw_path)
                    elif legacy_path.exists() and model_size == "small" and not args.project_test:
                        cached = load_cached_results(legacy_path)
                results_map = dict(cached)

                print(f">>> Running Whisper: model={model_size}, variant={variant}, condition={condition} <<<")

                is_prompted = ("prompted" in variant)
                is_auto = (variant == "whisper_auto")
                if args.project_test:
                    prompt_val = proj_prompt if "project" in variant else dev_prompt
                else:
                    prompt_val = dev_prompt if is_prompted else None

                if args.language == "auto":
                    lang_val = None
                elif args.language == "hi":
                    lang_val = "hi"
                else:
                    lang_val = None if is_auto else "hi"

                for idx, item in enumerate(sentences, 1):
                    s_id = item["id"]
                    audio_path = (base_dir / "audio" / "project" / condition / f"{s_id}.wav") if (base_dir / "audio" / "project" / condition / f"{s_id}.wav").exists() else (base_dir / "audio" / condition / f"{s_id}.wav")

                    if not audio_path.exists():
                        print(f"  [{idx:02d}/{len(sentences):02d}] {s_id}: Audio missing ({audio_path.name}), skipping.")
                        continue

                    if s_id in results_map and not results_map[s_id].get("error") and not args.force:
                        print(f"  [{idx:02d}/{len(sentences):02d}] {s_id}: Cached.")
                        continue

                    print(f"  [{idx:02d}/{len(sentences):02d}] Transcribing {s_id} ({condition}) ...", end=" ", flush=True)

                    start_t = time.perf_counter()
                    try:
                        audio_data, sr = sf.read(str(audio_path), dtype="float32")
                        if audio_data.ndim > 1:
                            audio_data = audio_data.mean(axis=1)

                        segments, info = model.transcribe(
                            audio_data,
                            language=lang_val,
                            initial_prompt=prompt_val,
                            beam_size=5,
                            vad_filter=True,
                        )

                        text_parts = [seg.text for seg in segments]
                        transcript = " ".join(text_parts).strip()
                        latency_ms = round((time.perf_counter() - start_t) * 1000)

                        detected_lang = info.language
                        lang_prob = round(info.language_probability, 3)
                        script = detect_output_script(transcript)

                        print(f"OK ({latency_ms}ms) [{detected_lang}:{lang_prob}, {script}] -> \"{transcript[:45]}\"")

                        results_map[s_id] = {
                            "id": s_id,
                            "category": item.get("category", ""),
                            "text": item.get("text", ""),
                            "must_have_terms": item.get("must_have_terms", []),
                            "audio_file": str(audio_path.relative_to(base_dir)),
                            "engine": f"whisper-{model_size}",
                            "model": model_size,
                            "device": device,
                            "compute_type": compute_type,
                            "transcript": transcript,
                            "latency_ms": latency_ms,
                            "detected_language": detected_lang,
                            "language_probability": lang_prob,
                            "script": script,
                            "error": None,
                        }
                    except Exception as e:
                        latency_ms = round((time.perf_counter() - start_t) * 1000)
                        print(f"ERROR ({latency_ms}ms) -> {e}")
                        results_map[s_id] = {
                            "id": s_id,
                            "category": item.get("category", ""),
                            "text": item.get("text", ""),
                            "must_have_terms": item.get("must_have_terms", []),
                            "audio_file": str(audio_path.relative_to(base_dir)),
                            "engine": f"whisper-{model_size}",
                            "model": model_size,
                            "device": device,
                            "compute_type": compute_type,
                            "transcript": "",
                            "latency_ms": latency_ms,
                            "detected_language": None,
                            "language_probability": 0.0,
                            "script": "error",
                            "error": str(e),
                        }

                    # Save progress after every sentence
                    with open(raw_path, "w", encoding="utf-8") as f:
                        json.dump(list(results_map.values()), f, ensure_ascii=False, indent=2)

    print("\n==================================================")
    print("All requested Whisper benchmark runs completed!")
    print("==================================================")


def main():
    parser = argparse.ArgumentParser(description="Run Whisper benchmark with faster-whisper.")
    parser.add_argument("--sentences", default="benchmark/sentences.json",
                        help="Sentences JSON path")
    parser.add_argument("--variants", nargs="*", default=None,
                        help=f"Variants to test (available: {', '.join(AVAILABLE_VARIANTS)})")
    parser.add_argument("--language", choices=["hi", "auto"], default=None,
                        help="Force transcription language ('hi' or 'auto'; overrides variant default)")
    parser.add_argument("--conditions", nargs="*", default=None,
                        help=f"Conditions to test (available: {', '.join(AVAILABLE_CONDITIONS)}; default: all folders with audio)")
    parser.add_argument("--model", "--models", dest="models", nargs="*", default=None,
                        help=f"Whisper model size(s) (choices: {', '.join(AVAILABLE_MODELS)}; e.g. small large-v3)")
    parser.add_argument("--compute-type", default=None,
                        help="Compute type (default: float16 on CUDA, int8 on CPU)")
    parser.add_argument("--offline-check", action="store_true",
                        help="Verify if models are cached in local Hugging Face hub cache")
    parser.add_argument("--project-test", action="store_true",
                        help="Run project-vocabulary test using sentences_project.json and project-terms.json")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N sentences")
    parser.add_argument("--sample", action="store_true",
                        help="Run 6 spread-out sample sentences (s01, s06, s10, s18, s24, s28)")
    parser.add_argument("--force", action="store_true", help="Ignore cache and re-run transcription")

    args = parser.parse_args()
    run_whisper_benchmark(args)


if __name__ == "__main__":
    main()
