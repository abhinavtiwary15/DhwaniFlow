#!/usr/bin/env python3
"""
run_gnani.py - Gnani STT Benchmark Runner (Sequential & Cached)

Makes direct requests to Gnani Vachana STT API v3 (POST https://api.vachana.ai/stt/v3)
strictly one request at a time. Caches results to avoid wasting credits.

Supported Variants:
  - codemix_kt       : format=codemix, with keyterms from dev-terms.json [default]
  - transcribe_kt    : format=transcribe, with keyterms from dev-terms.json [default]
  - transliterate_kt : format=transliterate, with keyterms from dev-terms.json
  - codemix_nokt     : format=codemix, without keyterms
  - transcribe_nokt  : format=transcribe, without keyterms

Outputs per (variant, condition):
  benchmark/results/raw/gnani__<variant>__<condition>.json
"""

import os
import sys
import time
import json
import random
import argparse
import datetime
from pathlib import Path
from typing import List, Dict, Optional
import requests

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

AVAILABLE_VARIANTS = ["codemix_kt", "transcribe_kt", "transliterate_kt", "codemix_nokt", "transcribe_nokt"]
DEFAULT_VARIANTS = ["codemix_kt", "transcribe_kt"]
AVAILABLE_CONDITIONS = ["clean", "phone8k", "phone8k_noise", "noisy"]
SAMPLE_SENTENCE_IDS = ["s01", "s06", "s10", "s18", "s24", "s28"]
DEFAULT_API_URL = "https://api.vachana.ai/stt/v3"


def get_gnani_api_key(base_dir: Path) -> str:
    """
    Retrieves Gnani API key from GNANI_API_KEY environment variable
    or git-ignored benchmark/.env. Never prints or logs the key.
    """
    # 1. Environment variable
    key = os.environ.get("GNANI_API_KEY", "").strip()
    if key:
        return key

    # 2. Benchmark .env or base_dir .env
    env_candidates = [
        base_dir / ".env",
        base_dir.parent / ".env",
    ]
    for env_path in env_candidates:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if line.startswith("GNANI_API_KEY="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val:
                                return val
            except Exception:
                pass
    return ""


def load_dev_terms(terms_path: Path) -> str:
    """Load default developer keyterms from dev-terms.json as comma-separated string."""
    if terms_path.exists():
        try:
            with open(terms_path, "r", encoding="utf-8") as f:
                terms = json.load(f)
            if isinstance(terms, list):
                return ", ".join(terms[:100])
        except Exception:
            pass
    return "API, useEffect, useState, Kubernetes, Docker, PR, deploy, merge, backend, frontend"


def get_available_conditions(audio_dir: Path) -> List[str]:
    """Finds all audio condition folders that exist and contain .wav files."""
    candidates = ["clean", "phone8k", "phone8k_noise", "noisy"]
    found = []
    for c in candidates:
        cond_dir = audio_dir / c
        if cond_dir.exists() and any(cond_dir.glob("*.wav")):
            found.append(c)
    return found if found else ["clean"]


def load_credit_log(log_path: Path) -> Dict:
    """Loads credit_log.json if present."""
    if log_path.exists():
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"sessions": [], "total_cumulative_calls": 0}


def save_credit_log(log_path: Path, log_data: Dict):
    """Saves credit_log.json safely without logging any secret."""
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Failed to update credit log: {e}")


def get_raw_output_path(base_dir: Path, engine: str, variant: str, condition: str) -> Path:
    raw_dir = base_dir / "results" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    return raw_dir / f"{engine}__{variant}__{condition}.json"


def load_cached_results(raw_path: Path) -> dict:
    if raw_path.exists():
        try:
            with open(raw_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {item["id"]: item for item in data if isinstance(item, dict) and "id" in item}
        except Exception:
            pass
    return {}


def map_language_code(lang: str) -> str:
    """Maps language input to Gnani language_code."""
    if not lang or lang.strip().lower() in ("hi", "hi-in"):
        return "hi-IN"
    trimmed = lang.strip()
    if "-" in trimmed:
        return trimmed
    return f"{trimmed}-IN"


def post_gnani_request(url: str, headers: Dict[str, str], form_data: Dict[str, str],
                        audio_path: Path, timeout: int = 35) -> requests.Response:
    """
    Submits a single multipart transcription request to Gnani STT API.
    Retries once on HTTP 429 with jittered backoff.
    """
    def _do_post():
        with open(audio_path, "rb") as af:
            files = {"audio_file": (audio_path.name, af, "audio/wav")}
            return requests.post(url, headers=headers, data=form_data, files=files, timeout=timeout)

    res = _do_post()
    if res.status_code == 429:
        backoff = round(1.0 + random.uniform(0.1, 0.5), 2)
        print(f"⚠️  Rate limited (HTTP 429). Retrying after {backoff}s backoff...", flush=True)
        time.sleep(backoff)
        res = _do_post()

    return res


def run_gnani_benchmark(args):
    base_dir = Path(__file__).resolve().parent
    if args.project_test and args.sentences == "benchmark/sentences.json":
        sentences_path = base_dir / "sentences_project.json"
    else:
        sentences_path = Path(args.sentences)

    dev_terms_path = Path(args.keyterms_file) if args.keyterms_file else base_dir / "data" / "dev-terms.json"
    project_terms_path = base_dir / "data" / "project-terms.json"
    credit_log_path = base_dir / "credit_log.json"

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

    api_url = args.url or os.environ.get("GNANI_API_URL") or DEFAULT_API_URL

    if args.project_test and not args.variants:
        variants = ["generic_kt", "project_kt"]
    elif args.variants:
        variants = []
        for v in args.variants:
            for sub_v in v.split(","):
                sub_v = sub_v.strip()
                if sub_v and sub_v not in variants:
                    variants.append(sub_v)
    else:
        variants = DEFAULT_VARIANTS

    if args.conditions:
        conditions = []
        for c in args.conditions:
            for sub_c in c.split(","):
                sub_c = sub_c.strip()
                if sub_c and sub_c not in conditions:
                    conditions.append(sub_c)
    else:
        audio_root = (base_dir / "audio" / "project") if (args.project_test and (base_dir / "audio" / "project").exists()) else (base_dir / "audio")
        conditions = get_available_conditions(audio_root)

    dev_prompt = load_dev_terms(dev_terms_path)
    proj_prompt = load_dev_terms(project_terms_path) if project_terms_path.exists() else dev_prompt
    credit_log = load_credit_log(credit_log_path)
    cumulative_prior = credit_log.get("total_cumulative_calls", 0)

    # 1. Pre-flight check: count cached vs needed calls
    total_calls_planned = 0
    plan_details = []

    for variant in variants:
        for condition in conditions:
            if args.project_test:
                raw_dir = base_dir / "results" / "raw"
                raw_dir.mkdir(parents=True, exist_ok=True)
                raw_path = raw_dir / f"project_test__gnani__{variant}__{condition}.json"
            else:
                raw_path = get_raw_output_path(base_dir, "gnani", variant, condition)
            cached = {} if args.force else load_cached_results(raw_path)

            needed = 0
            for s in sentences:
                s_id = s["id"]
                audio_path = (base_dir / "audio" / "project" / condition / f"{s_id}.wav") if (args.project_test and (base_dir / "audio" / "project" / condition / f"{s_id}.wav").exists()) else (base_dir / "audio" / condition / f"{s_id}.wav")
                if not audio_path.exists():
                    continue
                if s_id not in cached or cached[s_id].get("error"):
                    needed += 1

            total_calls_planned += needed
            plan_details.append((variant, condition, len(cached), needed, raw_path))

    print("==================================================")
    print("        DhwaniFlow / Gnani STT Benchmark Runner      ")
    print("==================================================")
    print(f"Endpoint:         {api_url}")
    print(f"Sentences:        {len(sentences)} items" + (" (SAMPLE MODE)" if args.sample else "") + (f" (LIMIT: {args.limit})" if args.limit else ""))
    print(f"Variants:         {', '.join(variants)}")
    print(f"Conditions:       {', '.join(conditions)}")
    print(f"Force Mode:       {args.force}")
    print(f"Cumulative Calls: {cumulative_prior} calls logged to date")
    print("--------------------------------------------------")
    print("Execution Plan:")
    for var, cond, cached_count, needed_count, _ in plan_details:
        print(f"  • gnani__{var}__{cond}: {cached_count} cached, {needed_count} new calls required")
    print(f"\nTotal planned Gnani API calls: {total_calls_planned}")
    print("==================================================")

    if total_calls_planned == 0:
        print("\nAll requested sentences are already cached! Use --force to re-run.")
        return

    # User confirmation unless --yes
    if not args.yes:
        resp = input(f"\nProceed with {total_calls_planned} API call(s)? [y/N]: ").strip().lower()
        if resp != "y" and resp != "yes":
            print("Aborted by user.")
            sys.exit(0)

    # Validate API key
    api_key = get_gnani_api_key(base_dir)
    if not api_key:
        print("\n🛑 Error: GNANI_API_KEY is not set.")
        print("Please set the GNANI_API_KEY environment variable or create benchmark/.env.\n")
        sys.exit(1)

    headers = {
        "X-API-Key-ID": api_key,
    }
    lang_code = map_language_code(args.lang)

    session_attempted = 0
    session_succeeded = 0
    session_failed = 0

    try:
        # 2. Execution loop - strictly one request at a time
        for variant, condition, _, _, raw_path in plan_details:
            print(f"\n>>> Running Gnani: variant={variant}, condition={condition} <<<")
            cached = {} if args.force else load_cached_results(raw_path)
            results_map = dict(cached)

            # Determine format and prompt for this variant
            if variant.startswith("codemix"):
                fmt = "codemix"
            elif variant.startswith("transcribe"):
                fmt = "transcribe"
            elif variant.startswith("transliterate"):
                fmt = "transliterate"
            else:
                fmt = "codemix"

            use_kt = not variant.endswith("_nokt")
            if args.project_test:
                prompt_val = proj_prompt if "project" in variant else dev_prompt
            else:
                prompt_val = dev_prompt if use_kt else ""

            for idx, item in enumerate(sentences, 1):
                s_id = item["id"]
                audio_path = (base_dir / "audio" / "project" / condition / f"{s_id}.wav") if (args.project_test and (base_dir / "audio" / "project" / condition / f"{s_id}.wav").exists()) else (base_dir / "audio" / condition / f"{s_id}.wav")

                if not audio_path.exists():
                    print(f"  [{idx:02d}/{len(sentences):02d}] {s_id}: Audio file missing ({audio_path.name}), skipping.")
                    continue

                if s_id in results_map and not results_map[s_id].get("error") and not args.force:
                    print(f"  [{idx:02d}/{len(sentences):02d}] {s_id}: Cached.")
                    continue

                print(f"  [{idx:02d}/{len(sentences):02d}] Calling Gnani for {s_id} ({condition}) ...", end=" ", flush=True)

                form_data = {
                    "model": "prisma-v3.0",
                    "language_code": lang_code,
                    "format": fmt,
                }
                if use_kt and prompt_val:
                    form_data["keyterms"] = prompt_val

                start_t = time.perf_counter()
                session_attempted += 1

                try:
                    res = post_gnani_request(api_url, headers, form_data, audio_path, timeout=35)
                    latency_ms = round((time.perf_counter() - start_t) * 1000)

                    if res.status_code in (401, 403):
                        session_failed += 1
                        print(f"\n\n🛑 FATAL HTTP {res.status_code} Unauthorized from Gnani API!")
                        print("Invalid or missing GNANI_API_KEY. Please verify your environment variable or benchmark/.env.")
                        sys.exit(1)

                    if res.status_code == 200:
                        session_succeeded += 1
                        resp_json = res.json()
                        transcript = (
                            resp_json.get("transcript")
                            or resp_json.get("text")
                            or (resp_json.get("result", {}).get("transcript") if isinstance(resp_json.get("result"), dict) else "")
                            or ""
                        ).strip()
                        print(f"OK ({latency_ms}ms) -> \"{transcript[:50]}\"")
                        results_map[s_id] = {
                            "id": s_id,
                            "category": item.get("category", ""),
                            "text": item.get("text", ""),
                            "must_have_terms": item.get("must_have_terms", []),
                            "audio_file": str(audio_path.relative_to(base_dir)),
                            "transcript": transcript,
                            "latency_ms": latency_ms,
                            "error": None,
                        }
                    else:
                        session_failed += 1
                        err_msg = res.text[:150]
                        print(f"HTTP {res.status_code} ({latency_ms}ms) -> {err_msg}")
                        results_map[s_id] = {
                            "id": s_id,
                            "category": item.get("category", ""),
                            "text": item.get("text", ""),
                            "must_have_terms": item.get("must_have_terms", []),
                            "audio_file": str(audio_path.relative_to(base_dir)),
                            "transcript": "",
                            "latency_ms": latency_ms,
                            "error": f"HTTP_{res.status_code}: {err_msg}",
                        }
                except SystemExit:
                    raise
                except Exception as e:
                    session_failed += 1
                    latency_ms = round((time.perf_counter() - start_t) * 1000)
                    print(f"ERROR ({latency_ms}ms) -> {e}")
                    results_map[s_id] = {
                        "id": s_id,
                        "category": item.get("category", ""),
                        "text": item.get("text", ""),
                        "must_have_terms": item.get("must_have_terms", []),
                        "audio_file": str(audio_path.relative_to(base_dir)),
                        "transcript": "",
                        "latency_ms": latency_ms,
                        "error": str(e),
                    }

                # Save progress after every sentence
                with open(raw_path, "w", encoding="utf-8") as f:
                    json.dump(list(results_map.values()), f, ensure_ascii=False, indent=2)

                # Strictly sequential: pause between calls
                time.sleep(0.15)

    finally:
        # Record credit usage in credit_log.json
        if session_attempted > 0:
            session_entry = {
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "calls_attempted": session_attempted,
                "calls_succeeded": session_succeeded,
                "calls_failed": session_failed,
                "variants": variants,
                "conditions": conditions,
            }
            credit_log["sessions"].append(session_entry)
            credit_log["total_cumulative_calls"] = cumulative_prior + session_succeeded
            save_credit_log(credit_log_path, credit_log)
            print("\n--------------------------------------------------")
            print(f"[Credit Monitor] Session logged {session_attempted} call(s) ({session_succeeded} OK, {session_failed} failed).")
            print(f"[Credit Monitor] Cumulative Gnani calls to date: {credit_log['total_cumulative_calls']}")
            print("--------------------------------------------------")

    print("\n==================================================")
    print("All requested Gnani benchmark runs completed!")
    print("==================================================")


def main():
    parser = argparse.ArgumentParser(description="Run Gnani benchmark sequentially with caching.")
    parser.add_argument("--url", default=os.environ.get("GNANI_API_URL") or DEFAULT_API_URL,
                        help=f"Gnani STT API endpoint URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--sentences", default="benchmark/sentences.json",
                        help="Sentences JSON path")
    parser.add_argument("--variants", nargs="*", default=None,
                        help=f"Variants to test (available: {', '.join(AVAILABLE_VARIANTS)})")
    parser.add_argument("--keyterms-file", default=None,
                        help="Path to custom keyterms JSON file to override dev-terms.json")
    parser.add_argument("--conditions", nargs="*", default=None,
                        help=f"Conditions to test (available: {', '.join(AVAILABLE_CONDITIONS)})")
    parser.add_argument("--lang", default="hi", help="Language code (mapped to hi-IN by default)")
    parser.add_argument("--project-test", action="store_true",
                        help="Run project-vocabulary test using sentences_project.json and project-terms.json")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N sentences")
    parser.add_argument("--sample", action="store_true",
                        help="Run 6 spread-out sample sentences (s01, s06, s10, s18, s24, s28)")
    parser.add_argument("--force", action="store_true", help="Ignore cache and re-call API")
    parser.add_argument("-y", "--yes", action="store_true", help="Bypass confirmation prompt")

    args = parser.parse_args()
    run_gnani_benchmark(args)


if __name__ == "__main__":
    main()
