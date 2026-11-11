# DhwaniFlow STT Benchmark Harness: Gnani Prisma vs. Whisper

A reproducible benchmark harness comparing **Gnani Vachana v3 (`prisma-v3.0`)** against **OpenAI Whisper** on Hinglish developer speech across clean, telephony (8 kHz G.711 $\mu$-law), and background noise conditions.

---

> [!CAUTION]
> **Synthetic Numbers & Privacy Warning**: All numbers (order amounts, reference numbers, pincodes, ports, ticket IDs, and invoices in sentences `s18`–`s25`) are **100% synthetic test data**. **Do not speak or record real personal data, actual credit card/bank numbers, production API keys, or personal addresses.**

> [!TIP]
> **Credit Conservation & Sample Run**: Gnani is a paid API with a concurrency limit of 1 active call per account.
> - Run **`--sample` first** to test 6 spread-out sentences (`s01, s06, s10, s18, s24, s28`) at minimal credit cost (~12 API calls) before committing to a full run.
> - The runner caches every sentence in `results/raw/*.json` to ensure credits are never spent twice.
> - Session call counts are recorded in `benchmark/credit_log.json` and printed on each run.

---

## Benchmark Sentences & Term Split

The dataset contains 30 representative developer sentences in [`sentences.json`](sentences.json):
- **5 Easy sentences (`s01`–`s05`)**: Daily standup, bug mentions, meeting summaries, client demo scheduling.
- **17 Technical sentences (`s06`–`s17`, `s26`–`s30`)**: React hooks (`useEffect`, `useState`), Git workflows (`PR merge`, `rebase`), Docker/Kubernetes, TypeScript props, JWT tokens, Redis cache, CI pipelines, and GitHub Actions.
- **8 Numbers sentences (`s18`–`s25`)**: Amounts in Lakhs, reference numbers, pincodes, ports (`3000`), rate limits, build numbers, and JIRA ticket identifiers.

### Hinted vs. Held-Out Evaluation
The evaluation report splits term accuracy into:
1. **Hinted Terms (31 terms)**: Tokens that appear in `benchmark/data/dev-terms.json` (passed as keyterms / initial prompts).
2. **Held-Out Terms (43 terms)**: Technical terms withheld from the dictionary to measure zero-shot vocabulary generalization without hints.

---

## Step-by-Step Execution Guide

Run all commands from the repository root (`dhwaniflow/`):

### Step 1: Set the Benchmark Python Environment
```powershell
# Set the PYTHON environment variable pointing to the virtualenv interpreter:
$env:PYTHON = ".\tools\.venv\Scripts\python.exe"

# Alternatively activate the virtual environment:
.\tools\.venv\Scripts\Activate.ps1
```

---

### Step 2: Record Clean Audio (Microphone)
Launch the interactive recording helper:
```powershell
python benchmark/record_sentences.py --condition clean
```
- The prompt will display each sentence (`s01` to `s30`).
- Press <kbd>Enter</kbd> to start recording, speak into your microphone, then press <kbd>Enter</kbd> to stop.
- The tool checks duration ($\le 28\,\text{s}$), peak levels, trims leading/trailing silence, and offers playback.
- Press <kbd>Enter</kbd> to accept, <kbd>r</kbd> to redo, or <kbd>s</kbd> to skip.
- Outputs saved to: `benchmark/audio/clean/<id>.wav`.
- *Resume / selective recording*:
  ```powershell
  python benchmark/record_sentences.py --condition clean --only s01,s06,s10,s18,s24,s28
  ```

---

### Step 3: (Optional) Record Real Noisy Audio
If you want to record in a noisy environment (fan on, cafe, or office murmur):
```powershell
python benchmark/record_sentences.py --condition noisy
```
Outputs saved to: `benchmark/audio/noisy/<id>.wav`.

---

### Step 4: Degrade Clean Audio to Phone Quality & Noise
Run the telephone degradation pipeline:
```powershell
python benchmark/degrade_phone.py
```
- Applies telephony bandpass filtering ($300\,\text{Hz} - 3400\,\text{Hz}$), downsampling to $8\,\text{kHz}$, G.711 $\mu$-law compression, and unpacks back into standard $16\,\text{kHz}$ mono WAV.
- Synthesizes realistic traffic and horn noise mixed at $10\,\text{dB}$ SNR (or uses real loops if dropped in `benchmark/noise/`).
- Outputs:
  - `benchmark/audio/phone8k/<id>.wav`
  - `benchmark/audio/phone8k_noise/<id>.wav`

---

### Step 5: Supply Gnani API Credentials

The benchmark runner communicates directly with the Gnani Vachana STT API (`POST https://api.vachana.ai/stt/v3`) without requiring any local server or proxy.

Supply your API key using either of these two methods:

1. **Environment Variable** (recommended for terminal sessions):
   ```powershell
   $env:GNANI_API_KEY="your_api_key_here"
   ```
   Or on Linux/macOS:
   ```bash
   export GNANI_API_KEY="your_api_key_here"
   ```

2. **Git-Ignored `.env` File**:
   Create `benchmark/.env` (which is git-ignored):
   ```ini
   GNANI_API_KEY=your_api_key_here
   ```

> [!CAUTION]
> Never commit API keys or tokens to git. Both `benchmark/.env` and `.env` are git-ignored.

---

### Step 6: Quick Sample Run First (Recommended)
Before running the full 30 sentences, verify costs, latency, and output quality with the 6 sample sentences (`s01`, `s06`, `s10`, `s18`, `s24`, `s28`):

```powershell
# 1. Check Whisper offline cache & model availability
python benchmark/run_whisper.py --offline-check

# 2. Run Gnani on 6 sample sentences (clean condition only)
python benchmark/run_gnani.py --sample --conditions clean

# 3. Run Whisper on 6 sample sentences
python benchmark/run_whisper.py --sample --conditions clean --model large-v3

# 4. Inspect sample report
python benchmark/report.py
```

---

### Step 7: Full Benchmark Run

Once satisfied with sample results, proceed with the full evaluation:

```powershell
# 1. Run Gnani across clean, phone8k, and phone8k_noise
# (By default runs variants codemix_kt and transcribe_kt; caches every call)
python benchmark/run_gnani.py

# 2. Run Whisper large-v3 prompted on all conditions
python benchmark/run_whisper.py --model large-v3 --compute-type int8

# 3. (Optional) Ingest manual phone voice-typing comparison
python benchmark/make_manual_sheet.py

# 4. Generate final evaluation report, head-to-head table, and verdict
python benchmark/report.py

# 5. Run keyterms and project-vocabulary ablation analysis
python benchmark/report.py --ablation

# 6. Generate publication charts (1080x1080 and 1920x1080 into benchmark/results/charts/)
python benchmark/make_chart.py
```

Outputs:
- **`benchmark/results/report.md`**: Condition head-to-head, Hinted vs Held-Out accuracy, 95% bootstrap confidence intervals, per-term miss rates, top 10 divergent examples, and official verdict.
- **`benchmark/results/summary.csv`**: Full metric table per engine, variant, and condition with model, device, and compute type metadata.
- **`benchmark/results/charts/`**: High-resolution 1080x1080 square and 1920x1080 wide grouped bar charts.
- **`benchmark/results/report_ablation.md`**: Keyterm boosting and project-vocabulary ablation comparison with bootstrap CIs.

---

## Verdict Rules

The report engine compares Gnani's best variant (`transcribe_kt` or `codemix_kt`) against Whisper large-v3 prompted across all evaluated audio conditions:

- **`Prisma ahead in k of N conditions (CI excludes zero in m of N)`**: Gnani outscores Whisper large-v3 prompted across conditions without negative deltas.
- **`Whisper ahead in k of N conditions (CI excludes zero in m of N)`**: Whisper large-v3 prompted outscores Gnani best variant across conditions without positive deltas.
- **`no consistent difference`**: Mixed-sign deltas across conditions or tied scores; neither engine demonstrates consistent superiority.

The report engine always computes and displays the minimum and maximum delta and evaluates bootstrap 95% confidence intervals per condition. Whisper plain is strictly excluded from headline tables and verdict calculations because it forces `language=hi` (producing Devanagari script).

---

## Limitations

1. **Single Speaker**: All 30 benchmark sentences were recorded by a single male speaker with an Indian English accent. Results may vary across different regional accents, pitch profiles, and speaking rates.
2. **Small Sample Size**: The dataset comprises 30 sentences (74 technical terms and numbers). While offering high-density signal for developer dictation, sample sizes produce wide 95% bootstrap confidence intervals.
3. **Condition Dependency**: Telephony (`phone8k`) and noisy (`phone8k_noise`) conditions are synthetically derived from the exact same 30 clean microphone recordings. Because sentences and base acoustic waveforms are shared, observations across conditions are not statistically independent.
4. **Synthetic Degradation**: The telephony simulation applies G.711 $\mu$-law bandpass filtering ($300\,\text{Hz} - 3400\,\text{Hz}$) at 8 kHz downsampling, and background traffic noise is synthesized at 10 dB SNR. Real cellular networks exhibit packet loss, jitter, adaptive codecs, and non-stationary acoustic reverberation not fully captured by synthetic pipelines.
5. **Latency Incomparability**: Whisper latencies represent local offline inference running on CPU with 8-bit integer quantization (`int8`), whereas Gnani latencies represent cloud API round-trip network response times. These metrics reflect distinct deployment trade-offs rather than direct engine-speed parity.
6. **Self-Measured Gnani Numbers**: Benchmark results were self-measured using developer-chosen vocabulary and prompt configurations. Independent third-party validation is recommended for mission-critical deployments.
7. **Runs Not Yet Done**:
   - Gnani keyterm ablation runs without keyterms (`transcribe_nokt`, `codemix_nokt`) have not been executed on live APIs to conserve credit quotas (requires 180 API calls).
   - Project-vocabulary evaluations under telephony degradation (`phone8k`, `phone8k_noise`) have not yet been run (requires 48 Gnani API calls).

---

## Running Automated Suite Tests

```powershell
# Using the test runner script (honours PYTHON variable and reports import issues):
node scripts/run-benchmark-tests.cjs

# Or running pytest / unittest directly:
python benchmark/test_benchmark_suite.py
```
*(Runs 25 automated unit tests covering scoring, numbers, aliases, degrader, 401 stop, credit log, offline cache check, verdict rules, deltas, and metadata label consistency).*
