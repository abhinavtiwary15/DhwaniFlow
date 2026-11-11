# DhwaniFlow Keyterm & Vocabulary Ablation Report

## 1. Gnani Keyterm Ablation (General Sentences)

| Condition | Variant | Status | Term Accuracy | Command / API Calls |
|:---|:---|:---:|:---:|:---|
| `clean` | `transcribe_kt` | CACHED | 85.3% | Evaluated in cache |
| `clean` | `codemix_kt` | CACHED | 84.5% | Evaluated in cache |
| `clean` | `transcribe_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants transcribe_nokt --conditions clean` (30 calls) |
| `clean` | `codemix_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants codemix_nokt --conditions clean` (30 calls) |
| `phone8k` | `transcribe_kt` | CACHED | 86.2% | Evaluated in cache |
| `phone8k` | `codemix_kt` | CACHED | 86.2% | Evaluated in cache |
| `phone8k` | `transcribe_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants transcribe_nokt --conditions phone8k` (30 calls) |
| `phone8k` | `codemix_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants codemix_nokt --conditions phone8k` (30 calls) |
| `phone8k_noise` | `transcribe_kt` | CACHED | 85.3% | Evaluated in cache |
| `phone8k_noise` | `codemix_kt` | CACHED | 81.9% | Evaluated in cache |
| `phone8k_noise` | `transcribe_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants transcribe_nokt --conditions phone8k_noise` (30 calls) |
| `phone8k_noise` | `codemix_nokt` | NOT RUN | - | `python benchmark/run_gnani.py --variants codemix_nokt --conditions phone8k_noise` (30 calls) |

**Combined command for missing Gnani runs**:
```powershell
python benchmark/run_gnani.py --variants transcribe_nokt,codemix_nokt --conditions clean,phone8k,phone8k_noise
```
**API calls required**: 180 calls.

## 2. Project-Vocabulary Test: Generic vs Project Keyterms

**Dataset**: 12 Hinglish developer sentences with 22 real repo code identifiers ([`sentences_project.json`](sentences_project.json))

| Engine | Generic Exact % (n=22) | Project Exact % (n=22) | Delta Exact (Headline, n=22) | 95% Bootstrap CI | Spaced Generic % (n=22) | Spaced Project % (n=22) | Delta Spaced (n=22) | 95% Bootstrap CI | Identifiers Tested |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Gnani** | 0.0% (n=22) | 22.7% (n=22) | **+22.7% (n=22)** | [+9.1%, +40.9%] | 59.1% (n=22) | 63.6% (n=22) | **+4.5% (n=22)** | [-18.2%, +27.3%] | 22 |
| **Whisper large-v3** | 0.0% (n=22) | 72.7% (n=22) | **+72.7% (n=22)** | [+54.5%, +90.9%] | 31.8% (n=22) | 81.8% (n=22) | **+50.0% (n=22)** | [+27.3%, +72.7%] | 22 |
| **Whisper small** | 0.0% (n=22) | 59.1% (n=22) | **+59.1% (n=22)** | [+40.9%, +77.3%] | 31.8% (n=22) | 72.7% (n=22) | **+40.9% (n=22)** | [+18.2%, +63.6%] | 22 |

## 3. Missing Project-Vocabulary Telephony Runs

| Engine | Condition | Status | Exact Command | API Calls Required |
|:---|:---|:---:|:---|:---:|
| **Gnani** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_gnani.py --project-test --conditions phone8k,phone8k_noise` | 48 calls (12 sentences * 2 variants * 2 conditions) |
| **Whisper large-v3** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_whisper.py --project-test --model large-v3 --conditions phone8k,phone8k_noise` | 0 calls (local model) |
| **Whisper small** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_whisper.py --project-test --model small --conditions phone8k,phone8k_noise` | 0 calls (local model) |
