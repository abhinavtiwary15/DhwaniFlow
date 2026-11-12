# Known gaps

Public release remains conditional on a successful clean Windows installer run, native shortcut and paste tests, affirmative data deletion, and the full release checks. The current source changes must be tested together; historical audit results describe earlier revisions.

Project vocabulary scanning is a bounded worker-backed IPC helper, with symlinks skipped and literal/comment text excluded. It is not a user-visible automatic workspace index. Only saved dictionary terms and the built-in vocabulary participate in normal dictation.

There is no streaming preview, prompt rewriting, translation workflow, notes, uploads, meetings, account or billing feature. Hinglish output script and exact identifiers depend on the speech provider; keyterms cannot guarantee spelling.

The historical benchmark is small, single-speaker and partly synthetic. It establishes neither superiority to Windows voice typing nor production reliability. Historical Gnani median call time was approximately 4–5.5 seconds per clip, excluding capture. Provider settings and original audio provenance were not fully recorded.

OS-backed encryption cannot exclude secrets from process-memory crash dumps. Releasing JavaScript references cannot promise immediate erasure. Native paste may fail in elevated applications or when focus changes. A missing compiler or helper must stop release packaging with an actionable error.

Inert upstream controls for auto-learn corrections, media pausing, recording retention and streaming preview were removed.
