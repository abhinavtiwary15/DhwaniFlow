# Gnani Vachana STT v3 API Reference & Integration Notes

This document describes the API specifications, verified upstream facts, and architectural considerations when integrating Gnani's **Vachana Speech-to-Text v3** (`prisma-v3.0`) into DhwaniFlow.

---

## 1. Verified Upstream Facts (from Gnani Published Docs)

All integration points strictly conform to Gnani's documented v3 REST STT contract:

- **Endpoint**: `POST https://api.vachana.ai/stt/v3`
- **Request Type**: `multipart/form-data`
- **Authentication Header**: `X-API-Key-ID: <GNANI_API_KEY>`
- **Audio Constraints**:
  - Maximum 30 seconds per request
  - Recommended format: 16 kHz 16-bit mono PCM WAV
- **Concurrency Limit**:
  - Exactly **1 active request per account** at any time. Exceeding this triggers `HTTP 429 Too Many Requests`.
- **Response Format**:
  - JSON payload containing `"transcript"` (tolerant parser also supports `"text"` and `"result.transcript"`).

### Multipart Request Form Fields

| Field Name | Type | Required | Description |
|:---|:---|:---:|:---|
| `audio_file` | File (Binary) | Yes | Binary audio stream (16 kHz 16-bit mono PCM WAV). |
| `language_code` | String | Yes | Language code: `hi-IN`, `en-IN`, `indic-auto`, or up to 4 comma-separated codes (e.g. `hi-IN, en-IN`). |
| `model` | String | Yes | STT foundation model; must be `prisma-v3.0`. |
| `format` | String | No | Formatting style: `verbatim`, `transcribe`, `codemix`, or `transliterate`. |
| `keyterms` | String | No | Comma-separated or JSON list of contextual keywords to bias recognition (maximum 200 terms). |

### Output Script Format Modes

| Format Mode | Description |
|:---|:---|
| `codemix` | Preserves Latin script for English/technical terminology; renders Indic carrier words in native script (Devanagari for Hindi). Default developer mode. |
| `transcribe` | Latin script transcription for both English and transcribed Indic terms. |
| `transliterate` | Phonetic Latin transcription of spoken words. |
| `verbatim` | Strict native Indic script rendering. |

---

## 2. Table of Unknowns & Unverified Behaviors

The published documentation leaves several operational edge cases unspecified. DhwaniFlow implements conservative, defensive mitigations for each:

| Operational Dimension | Unknown / Ambiguity in Published Docs | DhwaniFlow Handling & Mitigation |
|:---|:---|:---|
| **Rate Limit (RPM / Daily Quota)** | Published docs specify single-concurrency enforcement (429 on simultaneous calls), but do not publish requests-per-minute (RPM), requests-per-day (RPD), or credit metering rates. | Single-flight FIFO queue serializes all requests to guarantee active concurrency $\le 1$. Retries once on 429 with jittered backoff ($1,000\text{ ms} - 1,500\text{ ms}$). |
| **Silence Behavior** | How the upstream API behaves when presented with absolute digital silence or low-energy background audio (empty transcript, null field, or error status). | Tolerant parser safely falls back to empty string without throwing; UI avoids injecting garbage text into user documents. |
| **Keyterms Cumulative Length Limit** | While maximum item count is documented as 200 terms, no cumulative character or byte payload cap is specified for the `keyterms` field. | Enforces a conservative 2,000-character budget in `keyterms.js` alongside the 200-term ceiling, dropping lowest-ranked terms when budget is reached. |
| **Authentication Verification** | No documented zero-cost or lightweight endpoint exists to validate API key credentials without initiating a paid transcription. | `gnani:test-key` performs local syntax validation and returns `"saved, not verified"` without consuming user transcription credits. |

---

## 3. Architecture & Implementation in DhwaniFlow

- **`src/helpers/gnani/gnani-client.js`**: Core STT client with single-flight FIFO queue, persistent keep-alive connection reuse, 429 jittered retry, AbortSignal timeout, and typed errors. Never logs keys or transcripts.
- **`src/helpers/gnani/wav-utils.js`**: Validates 16 kHz 16-bit mono PCM headers, computes audio durations, and slices WAV buffers with aligned sample boundaries.
- **`src/helpers/gnani/chunker.js`**: Splits audio clips $> 28\text{ s}$ at the quietest 20 ms RMS frame in the 20–28 s window. Falls back to a hard cut at 28 s with 0.3 s overlap if no quiet point exists. Merges chunk transcripts with boundary word deduplication.
- **`src/helpers/gnani/keyterms.js` & `language-map.js`**: Normalizes language tags to `hi-IN` format and manages keyterms formatting and deduplication.
- **`src/helpers/gnani/project-terms.js`**: Scans user-chosen folders to extract identifiers and dependencies while refusing symlink escapes and ignoring secrets/`.env*` files.
- **`src/audio/wav-encoder.js`**: Resamples browser audio to 16 kHz 16-bit mono PCM WAV ArrayBuffer.
