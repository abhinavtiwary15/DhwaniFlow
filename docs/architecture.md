# Architecture

DhwaniFlow uses a sandboxed renderer with context isolation and a narrow preload bridge. The renderer captures microphone audio, converts it to 16 kHz mono 16-bit PCM WAV, and sends the buffer and validated options through gnani:transcribe. The main process owns the API key, validates the requesting application frame and WAV container, and performs serialized HTTPS requests to api.vachana.ai. Packaged builds cannot override that origin; redirects are rejected.

The client holds at most one active request and bounded queued jobs. The timeout includes reading the body, which has a separate size ceiling. A 429 gets one retry with bounded Retry-After or jitter. Audio above 28 seconds is split around silence or with overlap at hard cuts. De-duplication applies only to actual adjacent hard-cut overlap. Capture is capped at approximately two minutes.

Returned text passes through snippets and then the main-process clipboard service. The paste result includes actual delivery and restoration outcomes. History, dictionary, snippets and settings use SQLite. Retention is enforced at startup, periodically and after history writes. Keys use OS-backed encrypted storage and never travel back across preload.

Capture blobs and WAV buffers remain in process memory. Clearing references permits garbage collection; this is not secure erasure and does not exclude OS crash dumps. No intentional audio files or IndexedDB recording spool are used by the current capture path.

Voice commands are an opt-in deterministic Windows preview. The parser rejects negation and blocked intents, and the handler offers a countdown, cancellation and bounded execution. A packaged PowerShell helper performs allowlisted native actions. Native clipboard and keyboard operations remain subject to Windows focus, integrity level and application-control restrictions.
