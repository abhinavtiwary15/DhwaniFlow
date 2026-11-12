# DhwaniFlow

DhwaniFlow is a Windows-first Electron app for recording Hindi-English speech, transcribing it through Gnani Prisma v3.0, and pasting the result into the focused application. DhwaniFlow is built on OpenWhispr (MIT) by its contributors. See LICENSE.

## Current release status

Release verification is in progress. A successful renderer build does not establish that a Windows installer, global shortcuts, or native paste work on a clean machine. Do not distribute an installer until the Windows checks in [the manual test guide](docs/manual-test.md) have passed.

## Getting started

Use Windows 10/11 x64. On first launch, grant browser microphone access, save a Gnani key, and select a shortcut. The default dictation shortcut is Control+Space, with push-to-talk enabled. Hold the shortcut, speak, and release to transcribe; tap mode is available in Settings. Check the shortcut displayed by the app because registration can fail or require a different activation mode.

Saving a key requires OS-backed secure storage. The Test button checks its format locally; it does not authenticate it with Gnani. Authentication is established only by a successful transcription. The key stays in the main process and encrypted credential storage; saving fails if secure storage is unavailable.

## Recording and privacy

The renderer captures audio with MediaRecorder and decodes and encodes it as 16 kHz, mono, 16-bit PCM WAV. The main process validates the container and sends it to https://api.vachana.ai/stt/v3. Requests are serialized with bounded pending work. A 429 receives one retry, using Retry-After when valid (capped at ten seconds), otherwise a jittered delay. Redirects are rejected. The request timeout includes reading the response body.

Long recordings are split into chunks no longer than 28 seconds, preferring silence around the boundary. Hard cuts have overlap. Recording is capped at approximately two minutes and bounded in memory. Cancellation suppresses late results. There is no live streaming transcript.

Audio is held in memory for capture and transcription; the app does not intentionally write recordings to disk. References are released after processing or cancellation. JavaScript garbage collection and operating-system crash dumps prevent a guarantee of immediate secure erasure. Dictionary, snippets, and optional transcription history are stored locally in SQLite. Disabling history prevents new retained transcripts. Retention expiry runs at startup, periodically, and after saves. Delete All App Data requires confirmation and resets local data and credentials.

## Features and limits

- Dictionary entries are sent as keyterms along with a bounded developer vocabulary. Keyterms are hints, not an accuracy guarantee.
- Snippets replace configured triggers in returned dictation text.
- Microphone choice, activation mode, clipboard behavior, local history retention, floating icon, and latency display are configurable.
- Voice commands are an opt-in Windows preview. A fixed grammar selects bounded actions, with a confirmation delay and Escape cancellation. Negated commands are rejected. Native focus and permission constraints can still prevent an action.
- Paste uses the Windows helper when available, with platform fallbacks. Elevated target windows may reject input. Clipboard restoration is awaited and failures are reported.
- Notes, uploads, accounts, billing, meetings, AI agents, and alternative speech providers are outside this product.

## Latency and benchmark evidence

The historical single-speaker benchmark measured roughly 4–5.5 seconds median per clip for the Gnani call alone. This excludes recording time and does not establish interactive end-to-end latency. The latency badge measures processing elapsed time after capture; local fake-server measurements say nothing about production speech latency.

See [benchmark methodology](docs/benchmark-methodology.md) and the historical reports under benchmark/results. Raw results are retained with SHA-256 manifests. Historical provider configuration, original recording provenance, and unpublished audio cannot be reconstructed completely from those files. Small single-speaker results with wide confidence intervals do not establish superiority to Windows voice typing or general Hinglish accuracy.

## Development and Windows packaging

Use Node 24 and the dependencies pinned in package-lock.json. Run npm run dev:renderer and NODE_ENV=development node scripts/run-electron.js --dev in separate terminals (PowerShell: set the NODE_ENV environment variable first).

For isolated speech tests only, GNANI_API_URL accepts a loopback endpoint in development. Packaged builds ignore the override and pin the HTTPS production origin. Never use a real key with a test server.

npm run dist:win first prepares both Windows native helpers. Build in a Visual Studio Developer terminal or with an x64 MinGW/LLVM C compiler. Alternatively supply DHWANIFLOW_NATIVE_ARTIFACT_DIR containing helpers and a windows-helpers.json manifest whose source and binary hashes match. The preparation step fails without valid artifacts; it does not download binaries. Artifact provenance must be established by the release builder in addition to hash validation.

Public Windows releases use npm run dist:win:release, which requires code signing. The tag build expects WINDOWS_SIGNING_CERTIFICATE and WINDOWS_SIGNING_PASSWORD in the repository's protected secret configuration, verifies trusted executable signatures, and runs the packaged startup gate before uploading an installer. Keep certificate material outside the repository. The unsigned development command remains available for local diagnostics.

Run npm run typecheck, npm run build:renderer, npm run lint, npm run benchmark:test, node scripts/run-retained-tests.mjs, npm run ipc:check, and node scripts/release-check.mjs. After building on Windows, npm run test:release:win must pass against the actual packaged application; CI requires it before uploading an installer. This startup gate uses a fresh profile, a rejecting network proxy and no API credential. Test the resulting installer and physical hotkey/paste behavior in a fresh Windows profile before release. An unsigned local build is not a signed public release.

## License

MIT; see LICENSE and THIRD_PARTY_NOTICES.md for upstream, dependency, and bundled font attribution.
