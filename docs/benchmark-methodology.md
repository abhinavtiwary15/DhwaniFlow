# DhwaniFlow STT Benchmark Methodology

This document outlines the benchmark methodology, dataset construction, metrics, statistical testing framework, and error analysis used to evaluate Speech-to-Text performance for Hinglish developer dictation.

---

## 1. Datasets

### 1.1 General Hinglish Developer Dataset (`benchmark/sentences.json`)
- **Size**: 30 natural Hinglish developer sentences.
- **Coverage**: Git commands, frontend state management (`useState`, `useEffect`), backend routing, Kubernetes deployments, database queries, and error triage.
- **Technical Vocabulary**:
  - **Hinted Terms (31 terms)**: Passed in the prompt/keyterms payload to evaluate contextual boosting (`API`, `Docker`, `JWT`, `Kubernetes`, `PR`, `Redis`, `TypeScript`, `async`, `await`, `backend`, `branch`, `build`, `cache`, `client`, `commit`, `component`, `database`, `deploy`, `endpoint`, `error`, `function`, `lint`, `merge`, `pipeline`, `props`, `repo`, `session`, `state`, `token`, `useEffect`, `useState`).
  - **Held-Out Terms (43 terms)**: Withheld from prompt hints to evaluate zero-shot acoustic recognition.

### 1.2 Repository-Specific Vocabulary Dataset (`benchmark/sentences_project.json`)
- **Size**: 12 sentences featuring 22 real camelCase, PascalCase, and kebab-case identifiers extracted directly from the application codebase (e.g., `createMainWindow`, `normalizeToAccelerator`, `spawnWlCopy`, `useSettingsStore`).

---

## 2. Acoustic Conditions

Every sentence was recorded under clean acoustic conditions and subsequently passed through two standardized degradation pipelines:

1. **`clean`**: 16 kHz mono WAV audio recorded in a quiet indoor room using a studio microphone.
2. **`phone8k`**: Narrowband telephony simulation:
   - Resampled to 8,000 Hz.
   - G.711 $\mu$-law companding codec applied to replicate cellular/VoIP compression.
   - Bandpass filtered between 300 Hz and 3,400 Hz.
   - Upsampled back to 16 kHz for engine consumption.
3. **`phone8k_noise`**: Telephony degradation compounded with realistic background acoustic noise:
   - Real-world synthetic traffic and café noise mixed at exactly $+10\text{ dB}$ Signal-to-Noise Ratio (SNR).

---

## 3. Evaluation Metrics

1. **Term Accuracy (Primary Metric)**:
   $$\text{Term Accuracy} = \frac{\sum_{i=1}^{M} \mathbb{I}(\text{term}_i \in \text{normalized\_hyp})}{\text{Total Ground Truth Terms}}$$
   Calculated separately for **All Terms**, **Hinted Terms**, and **Held-Out Terms**.
2. **Word Error Rate (WER)**: Standard Levenshtein distance normalized by reference length.
   > **Note on Script Bias**: Standard WER heavily penalizes script transliteration differences (e.g. Roman Hindi vs Devanagari script) even when words are recognized with acoustic fidelity. Term accuracy provides a more reliable signal for coding assistants.
3. **Exact Number Match**: Accuracy on numerical identifiers (e.g. PIN codes `110004`, ticket IDs `422`, port numbers).
4. **Script Mix**: Percentage of tokens transcribed in Latin script vs Devanagari script.
5. **Median Latency**: End-to-end elapsed time from audio submission to completed transcript.

---

## 4. Statistical Testing & Confidence Intervals

All head-to-head comparisons report $95\%$ bootstrap confidence intervals:
- **Resampling Method**: Non-parametric paired bootstrap with $B = 1,000$ iterations.
- **Delta**: $\Delta = \text{Accuracy}_{\text{Gnani}} - \text{Accuracy}_{\text{Whisper}}$.
- **Statistical Significance**: A condition is considered statistically significant if the $95\%$ confidence interval strictly excludes zero ($[\text{lower}, \text{upper}] > 0$ or $< 0$).

---

## 5. Persistent Miss & Error Analysis

Automated inspection via `python benchmark/report.py --misses` analyzes recurring engine failures across conditions:

1. **Acoustic Confusion**:
   - `cache`: Frequently transcribed as *"gates enable"* or *"cats enable"* due to English pronunciation variants in rapid speech.
   - `error state`: Transcribed as *"as a state"* under noisy conditions.
2. **Script Divergence**:
   - Without prompt biasing, Whisper outputs purely Devanagari script for Hindi carrier words, failing exact Latin matches unless provided initial English prompts.
3. **Number Grouping**:
   - Postal codes like `110004` frequently transcribe as *"11 00 04"* or spoken words (*"gyarah sau chaar"*). Symmetrical normalization ensures fair scoring across both engines.

---

## 6. Honest Limitations & Threats to Validity

1. **Single Speaker**: Current benchmark audio was recorded by a single native speaker. Multi-speaker dialectal variability across different Indian regions remains to be validated.
2. **Dataset Scale**: 30 general sentences provide strong directional signal but wide confidence intervals ($[-6.9\%, +17.2\%]$ in clean audio).
3. **Synthetic Noise**: Ambient noise was applied digitally rather than recorded in situ.

---

## 7. Engine Execution & Authentication

The benchmark execution suite operates independently of application code or intermediate background processes:

1. **Gnani Direct API Execution**:
   - The Gnani benchmark runner (`benchmark/run_gnani.py`) submits multipart requests directly to `POST https://api.vachana.ai/stt/v3` with the `X-API-Key-ID` authentication header.
   - API credentials must be supplied via the `GNANI_API_KEY` environment variable (`export GNANI_API_KEY="key"` or `$env:GNANI_API_KEY="key"`) or stored locally in a git-ignored `benchmark/.env` file. Keys are never logged, printed, or committed.
   - Requests are executed strictly sequentially (single concurrency) with rate-limit backoff on HTTP 429 and immediate abort on HTTP 401.

2. **Whisper Local Execution**:
   - The Whisper runner (`benchmark/run_whisper.py`) runs local inference via `faster-whisper` on CPU (`int8` quantization) without external network dependencies.

