# DhwaniFlow STT Benchmark Report: Gnani Prisma vs Whisper

> Historical measurements: raw result files and their SHA-256 manifest are retained under benchmark/results. Original recording hashes, provider configuration and collection provenance were not fully recorded. These reports do not establish current application latency or general superiority; historical Gnani median call time was roughly 4–5.5 seconds per clip, excluding capture.


> [!NOTE]
> **Dataset Dependency**: All test conditions (clean, phone8k, phone8k_noise) originate from the same 30 sentences and a single speaker, and are therefore not statistically independent.

**Benchmark Dataset**: 30 Hinglish developer sentences ([`sentences.json`](sentences.json))

**Whisper Engine Setup**: Whisper `large-v3` on `CPU` (int8)

**Keyterm Hints**: 31 hinted terms in `benchmark/data/dev-terms.json`, 43 held-out terms.

## 1. Executive Summary & Verdict

### Verdict: **`Prisma ahead in 3 of 3 conditions (CI excludes zero in 1 of 3)`**

- **Overall Term Accuracy Delta**: Min **+5.2%**, Max **+11.5%**
- **Held-Out Term Accuracy Delta**: Min **+3.7%**, Max **+11.1%**
- **Held-Out Verdict**: `Prisma ahead in 3 of 3 conditions (CI excludes zero in 0 of 3)`

> [!IMPORTANT]
> **Verdict Rule**: Gnani Prisma best variant outscored Whisper large-v3 prompted in 3 of 3 conditions (min delta: +5.2%, max delta: +11.5%), with 95% bootstrap CI excluding zero in 1 of 3 conditions.

### Condition Head-to-Head (Best Variant Comparison)
| Audio Condition | Gnani (All / Held-out) | Whisper large-v3 (Prompted - All / Held-out) | Delta Overall | Delta Held-Out | 95% Bootstrap CI (Overall) | 95% Bootstrap CI (Held-out) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **`clean`** | 85.3% / 88.3% | 80.2% / 79.0% | **+5.2%** | **+9.3%** | [-6.9%, +17.2%] | [-5.6%, +24.1%] |
| **`phone8k`** | 86.2% / 88.3% | 81.0% / 84.6% | **+5.2%** | **+3.7%** | [-6.0%, +16.4%] | [-7.4%, +14.8%] |
| **`phone8k_noise`** | 85.3% / 86.4% | 73.8% / 75.3% | **+11.5%** | **+11.1%** | [+2.6%, +23.6%] | [+0.0%, +25.9%] |

---
## 2. Headline Performance by Engine, Variant, and Condition
| Engine | Variant | Condition | Term Acc (All) | Hinted Acc | Held-Out Acc | Tech Acc | Number Exact % | Mean WER | Med Latency | Script (Dev / Lat) | Errors / Empty |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **gnani** | `codemix_kt` | `clean` | **84.48%** | 80.0% | **86.42%** | 82.35% | 75.0% | 71.24% | 5457 ms | 47.2% / 52.8% | 0 / 1 |
| **gnani** | `transcribe_kt` | `clean` | **85.34%** | 77.78% | **88.27%** | 80.88% | 87.5% | 71.37% | 4332 ms | 40.4% / 54.9% | 0 / 1 |
| **whisper-large-v3** | `whisper_prompted` | `clean` | **80.17%** | 77.22% | **79.01%** | 77.94% | 75.0% | 74.11% | 20376 ms | 47.1% / 48.7% | 0 / 1 |
| **whisper-small** | `whisper_prompted` | `clean` | **76.72%** | 75.0% | **77.78%** | 77.94% | 62.5% | 73.8% | 2154 ms | 6.2% / 88.0% | 0 / 1 |
| **gnani** | `codemix_kt` | `phone8k` | **86.21%** | 80.0% | **88.27%** | 82.35% | 87.5% | 70.91% | 4594 ms | 46.8% / 53.2% | 0 / 1 |
| **gnani** | `transcribe_kt` | `phone8k` | **86.21%** | 80.0% | **88.27%** | 82.35% | 87.5% | 71.09% | 4307 ms | 40.9% / 54.5% | 0 / 1 |
| **whisper-large-v3** | `whisper_prompted` | `phone8k` | **81.03%** | 72.78% | **84.57%** | 76.47% | 75.0% | 77.13% | 21597 ms | 51.4% / 44.4% | 0 / 1 |
| **whisper-small** | `whisper_prompted` | `phone8k` | **74.89%** | 70.56% | **74.69%** | 71.86% | 75.0% | 70.7% | 1909 ms | 5.3% / 88.9% | 0 / 1 |
| **gnani** | `codemix_kt` | `phone8k_noise` | **81.9%** | 79.44% | **82.72%** | 80.88% | 75.0% | 72.24% | 4223 ms | 47.6% / 52.4% | 0 / 1 |
| **gnani** | `transcribe_kt` | `phone8k_noise` | **85.34%** | 79.44% | **86.42%** | 80.88% | 87.5% | 71.26% | 4324 ms | 39.7% / 55.9% | 0 / 1 |
| **whisper-large-v3** | `whisper_prompted` | `phone8k_noise` | **73.85%** | 65.56% | **75.31%** | 70.1% | 62.5% | 78.09% | 23144 ms | 47.8% / 48.0% | 0 / 1 |
| **whisper-small** | `whisper_prompted` | `phone8k_noise` | **66.09%** | 63.89% | **68.83%** | 62.74% | 50.0% | 77.71% | 1945 ms | 0.0% / 93.7% | 0 / 1 |

> [!NOTE]
> **Headline Exclusion**: `whisper_plain` is excluded from all headline tables and the verdict because it forces `language=hi` and outputs Devanagari script. It is reported separately in Section 5 (Appendix).

---
## 3. Hinted vs Held-Out Technical Terms Breakdown

### Hinted Terms (31 terms present in `benchmark/data/dev-terms.json`)
These terms were passed in the keyterm dictionary/initial prompts to test keyword boosting:

`API`, `Docker`, `JWT`, `Kubernetes`, `PR`, `Redis`, `TypeScript`, `async`, `await`, `backend`, `branch`, `build`, `cache`, `client`, `commit`, `component`, `database`, `deploy`, `endpoint`, `error`, `function`, `lint`, `merge`, `pipeline`, `props`, `repo`, `session`, `state`, `token`, `useEffect`, `useState`

### Held-Out Terms (43 terms absent from `benchmark/data/dev-terms.json`)
These terms were withheld to test zero-shot generalization without dictionary assistance:

`100`, `110004`, `150000`, `245`, `2532`, `3000`, `500`, `550000`, `API key`, `CI`, `GST`, `GitHub Actions`, `JIRA 422`, `JIRA-422`, `TTL`, `bug`, `code`, `container`, `dashboard`, `demo`, `environment variable`, `feature`, `fix`, `loading`, `logs`, `meeting`, `mobile`, `null`, `optimize`, `pod`, `pull request`, `push`, `rebase`, `refresh`, `regex`, `review`, `staging`, `summary`, `test`, `tests`, `types`, `unit test`, `workflow`

### Per-Term Recognition Analysis
Shows miss rate (`misses/tested`) across evaluated headline engines and conditions:

| Technical Term | Type | gnani_codemix_kt_clean | gnani_codemix_kt_phone8k | gnani_codemix_kt_phone8k_noise | gnani_transcribe_kt_clean | gnani_transcribe_kt_phone8k | gnani_transcribe_kt_phone8k_noise | whisper-large-v3_whisper_prompted_clean | whisper-large-v3_whisper_prompted_phone8k | whisper-large-v3_whisper_prompted_phone8k_noise | whisper-small_whisper_prompted_clean | whisper-small_whisper_prompted_phone8k | whisper-small_whisper_prompted_phone8k_noise |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`100`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 |
| **`110004`** | [Held-Out] | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`150000`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 |
| **`245`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`2532`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 |
| **`3000`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`500`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 |
| **`550000`** | [Held-Out] | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 |
| **`API`** | [Hinted] | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`API key`** | [Held-Out] | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| **`CI`** | [Held-Out] | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`Docker`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`GST`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 |
| **`GitHub Actions`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 |
| **`JIRA 422`** | [Held-Out] | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 |
| **`JIRA-422`** | [Held-Out] | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 |
| **`JWT`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`Kubernetes`** | [Hinted] | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| **`PR`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`Redis`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| **`TTL`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 |
| **`TypeScript`** | [Hinted] | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 |
| **`async`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 |
| **`await`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`backend`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`branch`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`bug`** | [Held-Out] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`build`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| **`cache`** | [Hinted] | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 2/2 | 1/2 | 1/2 | 1/2 |
| **`client`** | [Hinted] | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |

---
## 4. Side-by-Side Divergence Examples (10 Top Differences)
| ID | Spoken Reference | Must-Have Terms | Gnani Hypothesis | Whisper Hypothesis |
|:---|:---|:---|:---|:---|
| **s18** | "order amount dedh lakh rupaye hai" | `150000` | order amount देख लेना, 1.5 लाख रुपये है। | order amount देख लेना देड़ लाक रुपया है |
| **s20** | "mera pincode ek ek zero zero zero chaar hai" | `110004` | मेरा pin code 10004 है। | मेरा पिन कोड 110004 है |
| **s03** | "ye bug kal se aa raha hai fix kar do please" | `bug, fix` | ये bug कल से आ रहा है, fix कर दो please। | ये बक कल से आ रहा है, फिक्स कर दो प्लीज |
| **s16** | "Redis cache mein user session store karo aur TTL ek ghanta rakho" | `Redis, cache, session, TTL` | Redis cache में user session store करो और TTL 1 घंटे रखो। | redis cache में user accession store करूँगा और detail एक घंट रखूँगा |
| **s25** | "invoice ka total paanch lakh pachaas hazaar hai GST alag se" | `550000, GST` | invoice का total 5,50,000 है, GST अलग से। | invoice का टोटल पांच लाग पचास हजार है GST अलग से |
| **s06** | "useEffect mein API call fail ho jaye toh error state set karo" | `useEffect, API, error, state` | use effect में एक ही call fail हो जाए, तो as a state कर देना है। | useEffects में एक ही call fail हो जाये तो error state कर देना है |
| **s12** | "main branch se naya feature branch banao aur commit push karo" | `branch, feature, commit, push` | main branch से नया feature branch बनाओ और commit push करो। | main branch से नया feature ब्रांच बनाओ और commit पुस्ट करो |
| **s01** | "bhai kal ka standup kitne baje hai" | `` | भाई, कल का standup कितने बजे है? | भाई कल का स्टेंडअप कितने बजे है? |
| **s02** | "mujhe ek minute do main apna code dekh leta hoon" | `code` | मुझे एक minute दो, मैं अपना code देख लेता हूँ। | मुझे एक इनिट दो, मैं अपना code देख लेता हूँ |
| **s04** | "meeting ke baad mujhe summary bhej dena" | `meeting, summary` | meeting के बाद मुझे summary भेज देना। | meeting के बाद मुझे summary भेज देना |

---
## 5. Appendix: Excluded Whisper Plain Baseline (Devanagari Script)

> [!NOTE]
> `whisper_plain` forces `language=hi` and outputs Devanagari script. Because technical developer terms and identifiers in the test set references are formatted in Latin script, `whisper_plain` cannot match them and is excluded from all headline comparison tables and the official verdict. These baseline runs are retained for reference only.

| Engine | Variant | Condition | Term Acc (All) | Hinted Acc | Held-Out Acc | Tech Acc | Number Exact % | Mean WER | Med Latency | Script (Dev / Lat) | Errors / Empty | Note |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **whisper-large-v3** | `[Appendix] whisper_plain` | `clean` | 68.39% | 60.0% | 67.9% | 63.73% | 75.0% | 93.31% | 19028 ms | 76.5% / 18.6% | 0 / 1 | Excluded (Devanagari forced) |
| **whisper-small** | `[Appendix] whisper_plain` | `clean` | 15.57% | 16.11% | 13.89% | 17.74% | 0.0% | 104.31% | 1917 ms | 100.0% / 0.0% | 0 / 1 | Excluded (Devanagari forced) |
| **whisper-large-v3** | `[Appendix] whisper_plain` | `phone8k` | 63.22% | 63.89% | 62.35% | 57.84% | 62.5% | 92.98% | 9077 ms | 76.4% / 19.3% | 0 / 1 | Excluded (Devanagari forced) |
| **whisper-small** | `[Appendix] whisper_plain` | `phone8k` | 12.59% | 11.11% | 11.11% | 12.65% | 0.0% | 102.19% | 3809 ms | 100.0% / 0.0% | 0 / 1 | Excluded (Devanagari forced) |
| **whisper-large-v3** | `[Appendix] whisper_plain` | `phone8k_noise` | 59.2% | 49.44% | 64.2% | 48.04% | 62.5% | 102.77% | 13483 ms | 89.7% / 6.0% | 0 / 1 | Excluded (Devanagari forced) |
| **whisper-small** | `[Appendix] whisper_plain` | `phone8k_noise` | 7.99% | 8.89% | 6.48% | 10.69% | 0.0% | 111.04% | 4123 ms | 95.4% / 4.5% | 0 / 1 | Excluded (Devanagari forced) |
