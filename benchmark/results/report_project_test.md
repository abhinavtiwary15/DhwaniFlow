# DhwaniFlow Project-Vocabulary Benchmark Report

**Dataset**: 12 Hinglish developer sentences with 22 real repo code identifiers ([`sentences_project.json`](sentences_project.json))

**Identifiers Tested**: 22 camelCase/PascalCase identifiers (n=22)

## 1. Headline Metric: Exact Identifier Match vs Spaced Form

| Engine | Arm / Variant | Condition | Exact Identifier Match % (Headline, n=22) | Spaced Form Match % (n=22) | Mean WER % | Median Latency |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **gnani** | `generic_kt` | `clean` | **0.0% (0/22, n=22)** | 59.1% (13/22, n=22) | 124.98% | 6191 ms |
| **gnani** | `project_kt` | `clean` | **22.7% (5/22, n=22)** | 63.6% (14/22, n=22) | 107.96% | 9828 ms |
| **whisper-large-v3** | `whisper_generic_prompted` | `clean` | **0.0% (0/22, n=22)** | 31.8% (7/22, n=22) | 122.91% | 27222 ms |
| **whisper-large-v3** | `whisper_project_prompted` | `clean` | **72.7% (16/22, n=22)** | 81.8% (18/22, n=22) | 69.33% | 24862 ms |
| **whisper-small** | `whisper_generic_prompted` | `clean` | **0.0% (0/22, n=22)** | 31.8% (7/22, n=22) | 91.46% | 2448 ms |
| **whisper-small** | `whisper_project_prompted` | `clean` | **59.1% (13/22, n=22)** | 72.7% (16/22, n=22) | 82.33% | 2475 ms |

## 2. Vocabulary Boosting Impact (Project vs Generic Hints with 95% CIs)

| Engine | Exact Match (Generic -> Project, n=22) | Delta Exact (Headline, n=22) | 95% Bootstrap CI | Spaced Match (Generic -> Project, n=22) | Delta Spaced (n=22) | 95% Bootstrap CI | Identifiers Tested |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **gnani** | 0.0% -> 22.7% (n=22) | **+22.7% (n=22)** | [+9.1%, +40.9%] | 59.1% -> 63.6% (n=22) | **+4.5% (n=22)** | [-18.2%, +27.3%] | 22 |
| **whisper-large-v3** | 0.0% -> 72.7% (n=22) | **+72.7% (n=22)** | [+54.5%, +90.9%] | 31.8% -> 81.8% (n=22) | **+50.0% (n=22)** | [+27.3%, +72.7%] | 22 |
| **whisper-small** | 0.0% -> 59.1% (n=22) | **+59.1% (n=22)** | [+40.9%, +77.3%] | 31.8% -> 72.7% (n=22) | **+40.9% (n=22)** | [+18.2%, +63.6%] | 22 |

## 3. Missing Conditions (Not Run)

| Engine | Condition | Status | Exact Command | API Calls Required |
|:---|:---|:---:|:---|:---:|
| **Gnani** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_gnani.py --project-test --conditions phone8k,phone8k_noise` | 48 calls (12 sentences * 2 variants * 2 conditions) |
| **Whisper large-v3** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_whisper.py --project-test --model large-v3 --conditions phone8k,phone8k_noise` | 0 calls (local model) |
| **Whisper small** | `phone8k,phone8k_noise` | NOT RUN | `python benchmark/run_whisper.py --project-test --model small --conditions phone8k,phone8k_noise` | 0 calls (local model) |

> [!NOTE]
> **Exact Identifier Match** requires the unbroken camelCase identifier (e.g. `createMainWindow`).
> **Spaced Form Match** accepts either the exact unbroken identifier or the space-separated words (e.g. `create main window`).
