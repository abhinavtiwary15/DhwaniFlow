# Known Gaps and Technical Limitations

This document tracks known constraints, open technical debt, and architectural trade-offs in DhwaniFlow.

---

## 1. Speech-to-Text Concurrency Ceiling

- **Constraint**: Gnani Vachana API tiers restrict accounts to a single active transcription in-flight.
- **Current Mitigation**: `src/helpers/gnani/gnani-client.js` implements a serialized in-memory FIFO queue (`FifoQueue`). Rapid double-taps on the dictation hotkey are processed sequentially rather than concurrently, with automatic exponential backoff on HTTP 429 rate limit responses.
- **Future Direction**: Support connection pooling across multiple keys or enterprise multi-tenant credentials.

---

## 2. Unused Project-Scanning IPC

- **Status**: Library logic (`src/helpers/gnani/project-terms.js`) and IPC handler (`gnani:scan-project`) are implemented and tested, but omitted from the active dictation hot path and hidden from the user interface.
- **Reason**: Scanning large codebases (e.g. traversing deep trees or `node_modules`) introduces noticeable latency spikes if invoked synchronously on dictation key release. Furthermore, benchmark results showed that while keyword biasing helped, Whisper large-v3 out-performed Prisma on exact camelCase identifier matches (72.7% vs 22.7%, n = 22).
- **Future Direction**: Run asynchronous background project indexing with debounced watcher caching when a workspace directory is selected.

---

## 3. Roman Hinglish Mode

- **Status**: Unfinished / Planned.
- **Constraint**: Gnani Prisma v3.0 STT returns Hindi vocabulary in Devanagari script by default when `language_code: "hi-IN"` is selected. While technical English terms retain Latin script, colloquial Hindi particles and verbs appear in Devanagari.
- **Current State**: Dictation outputs standard mixed script (Devanagari for Indic words, Latin script for English/technical words). An automated transliteration layer to render pure Latin-alphabet Roman Hinglish (e.g., "bhai function bana do") is not yet wired into the transcription flow.
- **Future Direction**: Implement a client-side or post-processing transliteration pipeline to provide a dedicated Roman Hinglish toggle.

---

## 4. Prompt Mode (Hinglish to Structured English)

- **Status**: Unfinished / Planned.
- **Constraint**: Transforming conversational developer rambling into structured prompts for coding assistants requires piping raw transcripts through a secondary reasoning model.
- **Current State**: The underlying cloud LLM providers and reasoning services were pruned to keep DhwaniFlow strictly focused on lightweight local dictation. The prompt mode pipeline is therefore disabled until a dedicated, privacy-respecting LLM endpoint is integrated.
- **Future Direction**: Expose an optional Bring-Your-Own-Key OpenAI-compatible or local Ollama endpoint specifically for prompt restructuring.

---

## 5. Timbre Text-to-Speech Read-Back

- **Status**: Unfinished / Planned.
- **Constraint**: Audio read-back of recognized dictations using Gnani's Timbre TTS engine is not implemented.
- **Current State**: DhwaniFlow solely performs Speech-to-Text dictation into the OS clipboard and active window.
- **Future Direction**: Add an optional auditory feedback loop using Timbre TTS to confirm recognized code commands.

---

## 6. Pruned Feature Dead Weight in `database.js`

- **Constraint**: `src/helpers/database.js` contains inline implementations of three helpers (`normalizeStoredSpeakerCount`, `buildNoteSearchQuery`, `parseEventTime`).
- **Context**: These helpers previously resided in separate modules (`speakerCount.js`, `noteSearch.js`, `calendarAvailability.js`) that were deleted during core pruning. They service legacy Notes and Calendar database methods that DhwaniFlow does not ship or expose.
- **Impact**: Harmless at runtime (unreachable from active UI/IPC flows), but constitutes dead weight.
- **Future Direction**: Prune remaining legacy note-search, note-sync, and calendar-query methods from `database.js` in a future database consolidation pass.

---

## 7. Control Panel Sandbox Settings

- **Status**: Unhooked / Dead UI Controls.
- **Constraint**: Development settings relating to sandbox configuration, mock modes, and experimental flags in the Control Panel overlay remain unhooked from backend stores.
- **Current State**: The active settings window (`SettingsModal` / `SettingsPage`) manages real application state (hotkeys, mic selection, Gnani API key, data retention, GPU display). Sandbox controls in the dev panel are inert.
- **Future Direction**: Consolidate developer debug toggles into a dedicated Advanced section within `SettingsPage`.

---

## 8. Real-Time Streaming Audio

- **Constraint**: Voice dictation currently operates in push-to-talk or tap-to-talk mode (recording stops, sends audio, and pastes transcript).
- **Finding**: While Gnani provides a WebSocket streaming API, it does not currently stream partial word confidence or partial token events. Audio is therefore delivered as 16 kHz WAV via HTTP REST.
- **Future Direction**: Re-evaluate WebSocket streaming when Gnani introduces partial token streaming events.

---

## 9. Benchmark Dataset & Speaker Diversity

- **Constraint**: The initial benchmark corpus comprises 30 developer sentences and 12 project-vocabulary sentences recorded by a single male native Hindi speaker.
- **Impact**: While statistical bootstrapping indicates clear directional advantage in noise and technical held-out vocabulary, confidence intervals are wide ($[-6.9\%, +17.2\%]$ in clean audio).
- **Future Direction**: Expand the benchmark to 10+ speakers across diverse regional Indian accents (North, South, East, West) and female speakers.

---

## 10. CI Scope and Testing

- **Constraint**: Upstream OpenWhispr contained native C/Swift helper binaries (e.g. `fast-paste`, `audio-tap`, `globe-listener`) designed for macOS and Windows that fail on standard Ubuntu runners due to missing display servers and COM APIs.
- **Current Scope**: `.github/workflows/ci.yml` strictly tests DhwaniFlow's verified components:
  1. Benchmark Test Suite (31 tests via Python 3.12)
  2. Retained Test Suites (280 test suites via Node 24 test runner)
  3. IPC Surface Consistency (`scripts/check-ipc-surface.mjs`)
  4. TypeScript compilation (`tsc --noEmit`)
  5. ESLint verification (`npm run lint`)
  6. Release hygiene verification (`scripts/release-check.mjs`)

---

## 11. Live External Gnani API Verification

- **Constraint**: In automated CI and developer testing, all Gnani transcription tests run against synthetic 16 kHz PCM buffers and local mock responses.
- **Reason**: Calling the live endpoint (`https://api.vachana.ai/stt/v3`) during automated tests requires an active subscription key and network access, risking key exposure, rate limiting, and flaky tests.
- **Current State**: End-to-end functionality is verified against mock HTTP servers and contract tests; live production validation is performed manually by entering a user key into Settings.

---

## 12. Cross-Platform Operating System Support

- **Constraint**: DhwaniFlow is developed and verified primarily on Windows 10/11 (64-bit).
- **Status**: While scripts and cross-platform build configs exist for macOS and Linux, native desktop helpers (fast-paste and key-listener) and system tray integration are optimized and verified on Windows. macOS and Linux environments remain experimental and community-maintained.
