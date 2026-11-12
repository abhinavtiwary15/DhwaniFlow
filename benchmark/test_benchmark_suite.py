#!/usr/bin/env python3
"""
test_benchmark_suite.py - Automated Unit & Integration Tests for Benchmark Suite

Tests:
1. Scoring edge cases (comma-formatted numbers, Devanagari digits, alias matching)
2. Number exactness and script-mix calculation
3. Telephony audio degrader (frequency filtering, sample rate, duration, measured SNR)
4. Caching behavior in benchmark runners
5. Immediate abort on HTTP 401 Unauthorized
6. Plain-language verdict rules, deltas, and confidence intervals
7. Metadata extraction and chart/report label consistency
"""

import sys
import os
import io
import time
import json
import argparse
import tempfile
import unittest
import unittest.mock
from unittest.mock import patch
from contextlib import redirect_stdout, redirect_stderr
import numpy as np
import soundfile as sf
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

# Import benchmark modules
sys.path.insert(0, str(Path(__file__).resolve().parent))
import score
from degrade_phone import apply_phone_codec, mix_noise_at_snr, resolve_ffmpeg_cmd
from report import generate_verdict, evaluate_verdict, bootstrap_ci
from make_chart import extract_whisper_metadata, validate_metadata_label

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


class TestScoreEdgeCases(unittest.TestCase):
    def test_comma_numbers_and_currency(self):
        # 1,50,000 matches 150000
        res = score.calculate_metrics(
            reference="order amount dedh lakh rupaye hai",
            hypothesis="order amount ₹1,50,000 hai",
            must_have_terms=["150000"],
            category="numbers"
        )
        self.assertEqual(res["term_accuracy"], 100.0)
        self.assertTrue(res["number_exact"])
        self.assertIn("150000", res["matched_terms"])

    def test_devanagari_numerals(self):
        # १५०००० matches 150000
        res = score.calculate_metrics(
            reference="order amount dedh lakh rupaye hai",
            hypothesis="ऑर्डर अमाउंट ₹१,५०,००० है",
            must_have_terms=["150000"],
            category="numbers"
        )
        self.assertEqual(res["term_accuracy"], 100.0)
        self.assertTrue(res["number_exact"])

    def test_technical_aliases(self):
        # Kubernetes ~ कुबेरनेट्स, useEffect ~ यूज़ इफ़ेक्ट
        res = score.calculate_metrics(
            reference="Kubernetes pod and useEffect hook",
            hypothesis="कुबेरनेट्स पॉड और यूज़ इफ़ेक्ट हुक",
            must_have_terms=["Kubernetes", "pod", "useEffect", "hook"],
            category="tech"
        )
        self.assertEqual(res["term_accuracy"], 100.0)
        self.assertEqual(len(res["matched_terms"]), 4)
        self.assertEqual(len(res["missing_terms"]), 0)

    def test_alternative_terms_jira(self):
        # JIRA-422 vs JIRA 422
        res = score.calculate_metrics(
            reference="ticket number J I R A dash char sau baais",
            hypothesis="ticket number JIRA 422",
            must_have_terms=[["JIRA-422", "JIRA 422"]],
            category="numbers"
        )
        self.assertEqual(res["term_accuracy"], 100.0)
        self.assertTrue(res["number_exact"])

    def test_script_mix_calculation(self):
        # Code-mixed text
        mix = score.calculate_script_mix("bhai PR merge kar do aur डिप्लॉय करो")
        self.assertGreater(mix["devanagari_pct"], 0.0)
        self.assertGreater(mix["latin_pct"], 0.0)
        self.assertIn(mix["dominant_script"], ["Latin", "Devanagari", "Code-Mixed"])


class TestDegrader(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_phone_codec_preserves_container_and_duration(self):
        ffmpeg_cmd = resolve_ffmpeg_cmd()
        # Generate 1.5s 16kHz sine wave
        sr = 16000
        duration_sec = 1.5
        t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
        tone = (0.5 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)

        input_wav = self.tmp_path / "input.wav"
        output_wav = self.tmp_path / "output_phone.wav"
        sf.write(str(input_wav), tone, sr, subtype="PCM_16")

        apply_phone_codec(input_wav, output_wav, ffmpeg_cmd)

        self.assertTrue(output_wav.exists())
        data, out_sr = sf.read(str(output_wav))
        self.assertEqual(out_sr, 16000)
        out_duration = len(data) / out_sr
        self.assertAlmostEqual(out_duration, duration_sec, delta=0.1)

    def test_noise_mixer_snr(self):
        sr = 16000
        signal = (0.4 * np.sin(2 * np.pi * 500 * np.linspace(0, 1, sr))).astype(np.float32)
        noise = (0.1 * np.random.randn(sr)).astype(np.float32)

        mixed, measured_snr = mix_noise_at_snr(signal, noise, target_snr_db=10.0)
        self.assertEqual(len(mixed), len(signal))
        self.assertAlmostEqual(measured_snr, 10.0, delta=1.5)


class TestVerdictRules(unittest.TestCase):
    def test_verdict_cached_data_case(self):
        # Cached data numbers: Prisma ahead in all 3 conditions; CI excludes zero in phone8k_noise (1 of 3)
        gnani = {"clean": 85.34, "phone8k": 86.21, "phone8k_noise": 85.34}
        whisper = {"clean": 80.17, "phone8k": 81.03, "phone8k_noise": 73.85}
        ci = {"clean": (-6.9, 17.24), "phone8k": (-6.03, 16.38), "phone8k_noise": (2.59, 23.56)}

        verdict, rule = generate_verdict(gnani, whisper, ci)
        self.assertEqual(verdict, "Prisma ahead in 3 of 3 conditions (CI excludes zero in 1 of 3)")
        self.assertIn("outscored Whisper", rule)

        # Direct evaluate_verdict call verifying min and max deltas
        deltas = {"clean": 5.17, "phone8k": 5.18, "phone8k_noise": 11.49}
        v, r, min_d, max_d = evaluate_verdict(deltas, ci)
        self.assertEqual(v, "Prisma ahead in 3 of 3 conditions (CI excludes zero in 1 of 3)")
        self.assertEqual(min_d, 5.17)
        self.assertEqual(max_d, 11.49)

    def test_verdict_mixed_sign_case(self):
        # Mixed-sign case: some conditions positive, some negative -> no consistent difference
        gnani = {"clean": 82.0, "phone8k": 72.0, "phone8k_noise": 75.0}
        whisper = {"clean": 80.0, "phone8k": 76.0, "phone8k_noise": 75.0}
        ci = {"clean": (-2.0, 6.0), "phone8k": (-8.0, 0.0), "phone8k_noise": (-4.0, 4.0)}

        verdict, rule = generate_verdict(gnani, whisper, ci)
        self.assertEqual(verdict, "no consistent difference")
        self.assertIn("Mixed-sign", rule)

        # evaluate_verdict call with mixed signs (+2.0, -4.0, 0.0)
        deltas = {"clean": 2.0, "phone8k": -4.0, "phone8k_noise": 0.0}
        v, r, min_d, max_d = evaluate_verdict(deltas, ci)
        self.assertEqual(v, "no consistent difference")
        self.assertEqual(min_d, -4.0)
        self.assertEqual(max_d, 2.0)

    def test_verdict_mixed_sign_two_positive_one_negative(self):
        # Another mixed-sign case where Prisma wins 2 but loses 1
        deltas = {"clean": 5.0, "phone8k": -3.0, "phone8k_noise": 2.0}
        ci = {"clean": (1.0, 9.0), "phone8k": (-7.0, 1.0), "phone8k_noise": (-1.0, 5.0)}
        v, r, min_d, max_d = evaluate_verdict(deltas, ci)
        self.assertEqual(v, "no consistent difference")
        self.assertEqual(min_d, -3.0)
        self.assertEqual(max_d, 5.0)

    def test_verdict_whisper_ahead_case(self):
        # Whisper ahead in all 3 conditions
        gnani = {"clean": 60.0, "phone8k": 55.0, "phone8k_noise": 50.0}
        whisper = {"clean": 80.0, "phone8k": 75.0, "phone8k_noise": 70.0}
        ci = {"clean": (-25.0, -15.0), "phone8k": (-25.0, -15.0), "phone8k_noise": (-25.0, -15.0)}

        verdict, rule = generate_verdict(gnani, whisper, ci)
        self.assertEqual(verdict, "Whisper ahead in 3 of 3 conditions (CI excludes zero in 3 of 3)")
        self.assertIn("Whisper large-v3 prompted outscored", rule)

        deltas = {"clean": -20.0, "phone8k": -20.0, "phone8k_noise": -20.0}
        v, r, min_d, max_d = evaluate_verdict(deltas, ci)
        self.assertEqual(v, "Whisper ahead in 3 of 3 conditions (CI excludes zero in 3 of 3)")
        self.assertEqual(min_d, -20.0)
        self.assertEqual(max_d, -20.0)


class MockGnaniServer:
    def __init__(self, handler_factory):
        self.server = HTTPServer(("127.0.0.1", 0), handler_factory)
        self.port = self.server.server_address[1]
        self.url = f"http://127.0.0.1:{self.port}/stt/v3"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def shutdown(self):
        self.server.shutdown()
        self.server.server_close()


class TestGnaniRunnerFakeServer(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        # Every fake-server test owns its audio. No ignored developer recordings
        # or provider access are needed on a clean checkout.
        import wave
        audio_dir = self.tmp_path / "audio" / "clean"
        audio_dir.mkdir(parents=True)
        import shutil
        shutil.copytree(Path(__file__).resolve().parent / "data", self.tmp_path / "data")
        for index in range(1, 31):
            with wave.open(str(audio_dir / f"s{index:02d}.wav"), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(b"\x00\x00" * 1600)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_401_immediate_stop_and_exit(self):
        """HTTP 401 must stop execution immediately with code 1 and not retry."""
        calls = []

        class Handler401(BaseHTTPRequestHandler):
            def do_POST(self):
                calls.append(1)
                content_len = int(self.headers.get("Content-Length", 0))
                if content_len > 0:
                    self.rfile.read(content_len)
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized key"}')
            def log_message(self, *args): pass

        server = MockGnaniServer(Handler401)
        try:
            from run_gnani import run_gnani_benchmark
            args = argparse.Namespace(
                url=server.url,
                sentences="benchmark/sentences.json",
                variants=["codemix_kt"],
                conditions=["clean"],
                keyterms_file=None,
                lang="hi",
                project_test=False,
                limit=2,
                sample=False,
                force=True,
                yes=True,
            )
            raw_tmp = self.tmp_path / "raw_401.json"
            args.base_dir = self.tmp_path
            with unittest.mock.patch.dict("os.environ", {"GNANI_API_KEY": "test_key_401"}), \
                 unittest.mock.patch("run_gnani.get_raw_output_path", return_value=raw_tmp), \
                 unittest.mock.patch("run_gnani.save_credit_log"), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as cm:
                    run_gnani_benchmark(args)
                self.assertEqual(cm.exception.code, 1)

            # Stopped after exactly 1 call (did not continue to 2nd sentence or retry)
            self.assertEqual(len(calls), 1)
        finally:
            server.shutdown()

    def test_429_retry_once_with_backoff(self):
        """HTTP 429 must retry once with backoff and succeed on 2nd attempt."""
        calls = []

        class Handler429(BaseHTTPRequestHandler):
            def do_POST(self):
                calls.append(1)
                content_len = int(self.headers.get("Content-Length", 0))
                if content_len > 0:
                    self.rfile.read(content_len)
                if len(calls) == 1:
                    self.send_response(429)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(b'{"error": "Rate limit exceeded"}')
                else:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(b'{"transcript": "retry success transcript"}')
            def log_message(self, *args): pass

        server = MockGnaniServer(Handler429)
        try:
            from run_gnani import post_gnani_request
            dummy_wav = self.tmp_path / "audio" / "clean" / "s01.wav"
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                res = post_gnani_request(
                    url=server.url,
                    headers={"X-API-Key-ID": "test_key"},
                    form_data={"model": "prisma-v3.0", "language_code": "hi-IN", "format": "codemix"},
                    audio_path=dummy_wav,
                    timeout=10,
                )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json().get("transcript"), "retry success transcript")
            self.assertEqual(len(calls), 2)
        finally:
            server.shutdown()

    def test_strictly_one_request_at_a_time(self):
        """Requests must be executed sequentially with max concurrency == 1."""
        lock = threading.Lock()
        active = [0]
        max_active = [0]
        calls = []

        class ConcurrencyHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                with lock:
                    active[0] += 1
                    if active[0] > max_active[0]:
                        max_active[0] = active[0]
                content_len = int(self.headers.get("Content-Length", 0))
                if content_len > 0:
                    self.rfile.read(content_len)
                time.sleep(0.04)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"transcript": "concurrency test ok"}')
                with lock:
                    active[0] -= 1
                    calls.append(1)
            def log_message(self, *args): pass

        server = MockGnaniServer(ConcurrencyHandler)
        try:
            from run_gnani import run_gnani_benchmark
            args = argparse.Namespace(
                url=server.url,
                sentences="benchmark/sentences.json",
                variants=["codemix_kt"],
                conditions=["clean"],
                keyterms_file=None,
                lang="hi",
                project_test=False,
                limit=3,
                sample=False,
                force=True,
                yes=True,
            )
            raw_tmp = self.tmp_path / "raw_concur.json"
            args.base_dir = self.tmp_path
            with unittest.mock.patch.dict("os.environ", {"GNANI_API_KEY": "test_concur_key"}), \
                 unittest.mock.patch("run_gnani.get_raw_output_path", return_value=raw_tmp), \
                 unittest.mock.patch("run_gnani.save_credit_log"), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                run_gnani_benchmark(args)

            self.assertEqual(len(calls), 3)
            self.assertEqual(max_active[0], 1)
        finally:
            server.shutdown()

    def test_cache_skip_makes_zero_http_calls(self):
        """Sentences already cached must be skipped without making HTTP calls."""
        calls = []

        class NeverCalledHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                calls.append(1)
                self.send_response(200)
                self.end_headers()
            def log_message(self, *args): pass

        server = MockGnaniServer(NeverCalledHandler)
        try:
            from run_gnani import run_gnani_benchmark
            cached_data = [
                {"id": "s01", "category": "easy", "text": "hello", "must_have_terms": [], "transcript": "cached s01", "error": None},
                {"id": "s02", "category": "easy", "text": "world", "must_have_terms": [], "transcript": "cached s02", "error": None},
            ]
            raw_tmp = self.tmp_path / "raw_cached.json"
            with open(raw_tmp, "w", encoding="utf-8") as f:
                json.dump(cached_data, f)

            args = argparse.Namespace(
                url=server.url,
                sentences="benchmark/sentences.json",
                variants=["codemix_kt"],
                conditions=["clean"],
                keyterms_file=None,
                lang="hi",
                project_test=False,
                limit=2,
                sample=False,
                force=False,
                yes=True,
            )
            args.base_dir = self.tmp_path
            with unittest.mock.patch.dict("os.environ", {"GNANI_API_KEY": "test_key"}), \
                 unittest.mock.patch("run_gnani.get_raw_output_path", return_value=raw_tmp), \
                 unittest.mock.patch("run_gnani.save_credit_log"), \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                run_gnani_benchmark(args)

            self.assertEqual(len(calls), 0)
        finally:
            server.shutdown()

    def test_api_key_never_printed(self):
        """API key must never appear in stdout or stderr under any circumstances."""
        mock_auth_token = "placeholder-dummy-auth-token-12345"

        class NormalHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"transcript": "secret test transcript"}')
            def log_message(self, *args): pass

        server = MockGnaniServer(NormalHandler)
        try:
            from run_gnani import run_gnani_benchmark
            args = argparse.Namespace(
                url=server.url,
                sentences="benchmark/sentences.json",
                variants=["codemix_kt"],
                conditions=["clean"],
                keyterms_file=None,
                lang="hi",
                project_test=False,
                limit=1,
                sample=False,
                force=True,
                yes=True,
            )
            raw_tmp = self.tmp_path / "raw_secret.json"
            buf_out = io.StringIO()
            buf_err = io.StringIO()

            args.base_dir = self.tmp_path
            with unittest.mock.patch.dict("os.environ", {"GNANI_API_KEY": mock_auth_token}), \
                 unittest.mock.patch("run_gnani.get_raw_output_path", return_value=raw_tmp), \
                 unittest.mock.patch("run_gnani.save_credit_log"), \
                 unittest.mock.patch("sys.stdout", buf_out), \
                 unittest.mock.patch("sys.stderr", buf_err):
                run_gnani_benchmark(args)

            out_val = buf_out.getvalue()
            err_val = buf_err.getvalue()

            self.assertNotIn(mock_auth_token, out_val)
            self.assertNotIn(mock_auth_token, err_val)
        finally:
            server.shutdown()

    def test_runner_supports_variants_and_noisy_condition(self):
        """Runner must declare support for transcribe_nokt, transliterate_kt, and noisy condition."""
        from run_gnani import AVAILABLE_VARIANTS, AVAILABLE_CONDITIONS
        self.assertIn("transcribe_nokt", AVAILABLE_VARIANTS)
        self.assertIn("transliterate_kt", AVAILABLE_VARIANTS)
        self.assertIn("noisy", AVAILABLE_CONDITIONS)


class TestProjectTestDenominator(unittest.TestCase):
    def test_project_test_stated_n_matches_actual_denominator(self):
        base_dir = Path(__file__).resolve().parent
        sent_path = base_dir / "sentences_project.json"
        with open(sent_path, "r", encoding="utf-8") as f:
            sent_data = json.load(f)

        actual_n = sum(len(s.get("must_have_terms", [])) for s in sent_data)
        self.assertEqual(actual_n, 22)

        report_path = base_dir / "results" / "report_project_test.md"
        self.assertTrue(report_path.exists())
        with open(report_path, "r", encoding="utf-8") as f:
            content = f.read()

        import re
        n_matches = re.findall(r'n=(\d+)', content)
        self.assertGreater(len(n_matches), 0)
        for val in n_matches:
            self.assertEqual(int(val), actual_n, f"Report stated n={val} but actual denominator is {actual_n}")

        # Assert that if a wrong denominator (e.g. 24) were reported, the check would fail
        bad_content = content.replace("n=22", "n=24")
        with self.assertRaises(AssertionError):
            bad_matches = re.findall(r'n=(\d+)', bad_content)
            for val in bad_matches:
                self.assertEqual(int(val), actual_n)


class TestHintedHeldOutSplitAndCreditLog(unittest.TestCase):
    def test_hinted_heldout_split_accuracy(self):
        from report import compute_run_metrics
        dev_terms_set = {"api", "docker", "useeffect"}
        sentences = [
            {
                "id": "s06",
                "category": "tech",
                "text": "useEffect mein API call fail ho jaye toh error state set karo",
                "must_have_terms": ["useEffect", "API", "error", "state"],
            }
        ]
        # Hypothesis matches useEffect and API (hinted), misses error and state (held-out)
        run_data = {
            "s06": {
                "id": "s06",
                "transcript": "useEffect mein API call fail ho gaya",
                "latency_ms": 100,
                "error": None,
            }
        }
        metrics = compute_run_metrics(run_data, sentences, dev_terms_set)
        # 2 hinted terms (useEffect, API): both matched -> 100%
        self.assertEqual(metrics["hinted_accuracy"], 100.0)
        # 2 held-out terms (error, state): both missing -> 0%
        self.assertEqual(metrics["heldout_accuracy"], 0.0)
        # Overall term accuracy: 50%
        self.assertEqual(metrics["term_accuracy"], 50.0)

    def test_verdict_dual_evaluation(self):
        from report import evaluate_verdict
        # All positive deltas: Prisma ahead in 3 of 3 conditions
        deltas_overall = {"clean": 12.0, "phone8k": 11.0, "phone8k_noise": 4.0}
        ci_overall = {"clean": (2.0, 22.0), "phone8k": (1.0, 20.0), "phone8k_noise": (-2.0, 10.0)}
        # Mixed-sign deltas: no consistent difference
        deltas_mixed = {"clean": 2.0, "phone8k": -3.0, "phone8k_noise": 1.0}

        verdict_o, rule_o, min_o, max_o = evaluate_verdict(deltas_overall, ci_overall)
        verdict_m, rule_m, min_m, max_m = evaluate_verdict(deltas_mixed)

        self.assertEqual(verdict_o, "Prisma ahead in 3 of 3 conditions (CI excludes zero in 2 of 3)")
        self.assertEqual(verdict_m, "no consistent difference")
        self.assertEqual(min_o, 4.0)
        self.assertEqual(max_o, 12.0)
        self.assertEqual(min_m, -3.0)
        self.assertEqual(max_m, 2.0)

    def test_credit_log_persistence(self):
        from run_gnani import load_credit_log, save_credit_log
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".json") as f:
            temp_path = Path(f.name)
        try:
            log_data = {"sessions": [{"calls_attempted": 6, "calls_succeeded": 6}], "total_cumulative_calls": 6}
            save_credit_log(temp_path, log_data)
            loaded = load_credit_log(temp_path)
            self.assertEqual(loaded["total_cumulative_calls"], 6)
            self.assertEqual(len(loaded["sessions"]), 1)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def test_sample_sentence_ids(self):
        from run_gnani import SAMPLE_SENTENCE_IDS as gnani_samples
        from run_whisper import SAMPLE_SENTENCE_IDS as whisper_samples
        expected = ["s01", "s06", "s10", "s18", "s24", "s28"]
        self.assertEqual(gnani_samples, expected)
        self.assertEqual(whisper_samples, expected)

    def test_offline_cache_check(self):
        from run_whisper import check_offline_cache
        is_cached, path, size_gb = check_offline_cache("small")
        self.assertTrue(is_cached)
        self.assertEqual(size_gb, 0.5)

    def test_symmetrical_aliases_and_normalization(self):
        # JIRA-422 alias GIRA-422
        res_jira = score.calculate_metrics(
            reference="ticket number J I R A dash char sau baais",
            hypothesis="ticket number GIRA-422",
            must_have_terms=[["JIRA-422", "JIRA 422"]],
            category="numbers"
        )
        self.assertEqual(res_jira["term_accuracy"], 100.0)

        # 110004 spaced digits & code-mix text
        res_pin_spaced = score.calculate_metrics(
            reference="mera pincode ek ek zero zero zero chaar",
            hypothesis="pincode 1 1 0 0 0 4",
            must_have_terms=["110004"],
            category="numbers"
        )
        self.assertEqual(res_pin_spaced["term_accuracy"], 100.0)

        res_pin_words = score.calculate_metrics(
            reference="mera pincode ek ek zero zero zero chaar",
            hypothesis="mera pin code एक एक zero zero zero चार",
            must_have_terms=["110004"],
            category="numbers"
        )
        self.assertEqual(res_pin_words["term_accuracy"], 100.0)

        # 150000 1.5 लाख
        res_lakh = score.calculate_metrics(
            reference="order amount dedh lakh rupaye",
            hypothesis="order amount 1.5 लाख रुपये",
            must_have_terms=["150000"],
            category="numbers"
        )
        self.assertEqual(res_lakh["term_accuracy"], 100.0)

    def test_generate_verdict_with_ci(self):
        gnani_b = {"clean": 85.0, "phone8k": 86.0, "phone8k_noise": 85.0}
        whisper_b = {"clean": 76.0, "phone8k": 74.0, "phone8k_noise": 66.0}
        ci = {"clean": (-4.0, 20.0), "phone8k": (-1.0, 22.0), "phone8k_noise": (5.0, 30.0)}
        verdict, rule = generate_verdict(gnani_b, whisper_b, ci, include_ci_count=True)
        self.assertEqual(verdict, "Prisma ahead in 3 of 3 conditions (CI excludes zero in 1 of 3)")

    def test_whisper_output_path_model_naming(self):
        from run_whisper import get_raw_output_path
        p = get_raw_output_path(Path("/tmp"), "large-v3", "whisper_prompted", "clean")
        self.assertEqual(p.name, "whisper-large-v3__whisper_prompted__clean.json")

    def test_project_identifier_scoring(self):
        from score import check_identifier_match, calculate_identifier_metrics
        # Exact match
        exact, spaced = check_identifier_match("createMainWindow", "windowManager mein createMainWindow call karo")
        self.assertTrue(exact)
        self.assertTrue(spaced)

        # Spaced match
        exact, spaced = check_identifier_match("createMainWindow", "windowManager mein create main window call karo")
        self.assertFalse(exact)
        self.assertTrue(spaced)

        # No match
        exact, spaced = check_identifier_match("createMainWindow", "random function call karo")
        self.assertFalse(exact)
        self.assertFalse(spaced)

        # Metrics computation
        metrics = calculate_identifier_metrics(["createMainWindow", "setScreenContextProtection"],
                                              "createMainWindow call karke set screen context protection enable karo")
        self.assertEqual(metrics["exact_match_pct"], 50.0)
        self.assertEqual(metrics["spaced_match_pct"], 100.0)


class TestMetadataAndLabelConsistency(unittest.TestCase):
    def test_raw_whisper_metadata_is_large_v3(self):
        raw_dir = Path(__file__).resolve().parent / "results" / "raw"
        meta = extract_whisper_metadata(raw_dir)
        self.assertEqual(meta["model"], "large-v3")
        self.assertEqual(meta["device"], "cpu")
        self.assertEqual(meta["compute_type"], "int8")

    def test_chart_data_model_label_matches_metadata(self):
        from make_chart import load_chart_data
        base_dir = Path(__file__).resolve().parent
        summary_csv = base_dir / "results" / "summary.csv"
        raw_dir = base_dir / "results" / "raw"

        if summary_csv.exists() and raw_dir.exists():
            g_t, g_c, w_p, meta = load_chart_data(summary_csv, raw_dir)
            self.assertEqual(meta["model"], "large-v3")
            self.assertNotEqual(meta["model"], "small")
            # Label validation passes
            self.assertTrue(validate_metadata_label(meta, f"Whisper {meta['model']} Prompted"))

    def test_label_disagreement_with_metadata_fails(self):
        # If metadata is large-v3, but label says 'small' (previous regression), it must raise ValueError
        meta_large = {"model": "large-v3", "device": "cpu", "compute_type": "int8"}
        with self.assertRaises(ValueError):
            validate_metadata_label(meta_large, "Whisper small (Prompted)")
        with self.assertRaises(ValueError):
            validate_metadata_label(meta_large, "Whisper small")

        # Correct large-v3 label passes
        self.assertTrue(validate_metadata_label(meta_large, "Whisper large-v3 Prompted"))
        self.assertTrue(validate_metadata_label(meta_large, "Whisper large-v3 (Prompted)"))

        # Reversed mismatch (metadata small, label large-v3) must also fail
        meta_small = {"model": "small", "device": "cpu", "compute_type": "int8"}
        with self.assertRaises(ValueError):
            validate_metadata_label(meta_small, "Whisper large-v3 Prompted")
        self.assertTrue(validate_metadata_label(meta_small, "Whisper small Prompted"))

    def test_report_whisper_setup_matches_metadata(self):
        base_dir = Path(__file__).resolve().parent
        report_path = base_dir / "results" / "report.md"
        raw_dir = base_dir / "results" / "raw"

        if report_path.exists() and raw_dir.exists():
            meta = extract_whisper_metadata(raw_dir)
            with open(report_path, "r", encoding="utf-8") as f:
                content = f.read()

            # The report must contain large-v3 and not claim small for the headline setup
            self.assertIn(f"`{meta['model']}`", content)
            self.assertIn(f"`{meta['device'].upper()}`", content)
            self.assertIn(f"({meta['compute_type']})", content)


if __name__ == "__main__":
    unittest.main()
