# Upstream Changes

This document tracks all modifications and additions relative to upstream OpenWhispr (`OpenWhispr/openwhispr` at commit `d5821a7`).

| File / Path | Change | Reason |
|:---|:---|:---|
| `package.json` | Updated package `name` to `dhwaniflow` and `productName` to `DhwaniFlow`. Added scripts `benchmark:test` and `test:ci`. | Identity rebranding and standardized automation commands for testing and local execution. |
| `electron-builder.json` | Updated `appId` to `io.github.abhinavtiwary15.dhwaniflow`, `productName` to `DhwaniFlow`, added `dhwaniflow` protocol scheme, and updated DMG title. | Packaging and OS desktop registration for DhwaniFlow releases. |
| `main.js` | Updated `BASE_WINDOWS_APP_ID`, macOS app name, and isolated `userData` path to `DhwaniFlow-${APP_CHANNEL}`. | Native OS window naming, app identification, and configuration isolation. |
| `src/index.html` | Updated document `<title>` to `DhwaniFlow`. | Browser and Electron window title display. |
| `src/components/SettingsPage.tsx` | Added explicit `"Built on OpenWhispr (MIT)"` attribution badge and Settings > About view. | Preserves transparent upstream attribution required by upstream license and project rules. |
| `src/helpers/devServerManager.js` | Bound `DEV_SERVER_URL` to `127.0.0.1` instead of `localhost`. | Node 24 resolves `localhost` to IPv6 `::1`, causing 30-second connection timeouts against Vite. |
| `src/helpers/windowConfig.js` | Added explicit `icon.ico` configuration for Windows control panel window. | Ensures taskbar correctly displays the application icon on Windows 10/11. |
| `src/helpers/windowManager.js` | Added temporary 500ms `setAlwaysOnTop(true)` pulse during window show on Windows. | Overcomes Windows OS foreground focus suppression when full-screen IDEs are active. |
| `src/hooks/useAudioRecording.js` | Applied optional chaining (`window.electronAPI?.setScreenContextEnabled?.(...)`). | Prevents crashes during web browser development preview when Electron IPC is absent. |
| `resources/nsis/installer.nsh` | Updated firewall rule name to `DhwaniFlow` and added uninstall cleanup for `io.github.abhinavtiwary15.dhwaniflow`. | Proper Windows firewall rule registration and clean uninstallation. |
| `resources/linux/after-install.sh` | Added `dhwaniflow` package check for Electron chrome-sandbox permissions. | Linux deb/rpm installation permissions. |
| `resources/linux/after-remove.sh` | Updated cache directory cleanup to `~/.cache/dhwaniflow`. | Clean uninstallation on Linux distributions. |
| `src/helpers/gnani/**` | In-process Gnani STT client, IPC handlers, keyterms composer, silence chunker, and wav utilities. | Direct low-latency Hinglish developer dictation without any local bridge daemon or FFmpeg. |
| `benchmark/**` | New service: benchmark suite evaluating Gnani Prisma vs OpenAI Whisper on Hinglish speech. | Rigorous evidence generation across clean, telephony, and noise conditions. |
| `docs/**` | Added `architecture.md`, `benchmark-methodology.md`, `gnani-api-notes.md`, `known-gaps.md`, `upstream-changes.md`. | Consolidated technical documentation adhering to project naming standards. |
| `LICENSE` | Preserved upstream MIT notice and added `Copyright (c) 2026 Abhinav Tiwary`. | Dual copyright compliance under MIT terms. |
| `.gitignore`, `.gitattributes` | Added ignore rules for `.scratch/`, `.env*`, `credit_log.json`, `dist/`, and normalized LF line endings. | Repository hygiene, secrets safety, and cross-platform line ending normalization. |
| `openwhispr-mobile/` | Deleted iOS mobile platform and associated mobile CI workflows. | Windows-first desktop focus; mobile application out of scope. |
| `nix/`, `flake.nix`, `flake.lock` | Deleted Nix packaging expressions, flake definitions, and update-nix workflow. | Streamlining packaging maintenance; NixOS out of current scope. |
| `native/meeting-aec-helper` | Deleted meeting acoustic echo cancellation native code and build/download scripts. | Meeting transcription helpers are out of scope for voice dictation. |
| Mic-listener helpers | Deleted Windows and macOS mic-listener native source files, build scripts, and workflows. | Background meeting microphone activity detection not used in dictation flow. |
| System audio helpers | Deleted Windows loopback, macOS audio-tap, and Linux system-audio native helpers and scripts. | System audio meeting recording helpers not used in dictation flow. |
| Text-monitor helpers | Deleted Windows, macOS, and Linux text-monitor native source files, build scripts, and workflows. | Direct clipboard and keystroke injection does not require external text monitoring. |
| `agent-skills/`, `examples/` | Deleted upstream agent skills and example ASR shim implementations. | Repository cleanliness and removal of unmaintained developer examples. |
| Upstream developer docs | Deleted `CHANGELOG.md`, `CLAUDE.md`, `DEBUG.md`, `TROUBLESHOOTING.md`, and `CONTRIBUTING.md`. | Pruning upstream development artifacts and unmaintained developer documentation. |
| Upstream `docs/` guides | Pruned upstream enterprise runbooks, Orukeet streaming docs, and obsolete architecture guides. | Retained only 5 authoritative documentation files relevant to DhwaniFlow. |
| `SECURITY.md` | Replaced upstream enterprise policy with a concise 5-line security advisory policy. | Streamlined vulnerability disclosure through GitHub private security advisories. |
| Upstream CI workflows | Deleted `mobile-ci.yml`, `update-nix.yml`, `update-winget.yml`, and meeting native build workflows. | Pruned CI automation for deleted platforms and native meeting helpers. |
| Accounts & Auth | Deleted better-auth, SSO, token store, session headers, and OAuth bridge handlers. | DhwaniFlow is a local desktop application without mandatory user accounts. |
| Billing & Plans | Deleted Stripe checkout, subscription tiers, plan switching, and upgrade banners. | Commercial subscription and checkout infrastructure removed. |
| Cloud Sync | Deleted syncService, debounced sync pushes, and cloud chunk policy coordinators. | Voice dictation and local history operate entirely on local SQLite database. |
| Workspaces & Policy | Deleted workspace manager, team spaces, member invites, and organization policy checks. | Enterprise multi-user workspaces removed in favor of single-user local focus. |
| Connectors & Integrations | Deleted GitHub, Gmail, Linear, Slack, MCP, and CLI tool bridges. | Out-of-process connector integrations removed. |
| Meetings & Calendars | Deleted Google, Microsoft, and Apple calendar managers, meeting detection engine, and diarization. | Voice dictation app does not include automated meeting recording. |
| Agent Mode & Chat | Deleted assistant chat panel, conversation stores, prompt studio, and agent skills. | Chatbot assistant mode removed; dictation directly outputs to active window. |
| Analytics Upload | Deleted telemetry sync service, analytics upload hooks, and leaderboard accounting. | Outbound analytics reporting removed to guarantee user privacy. |
| Non-Gnani Speech Providers | Deleted Whisper (local/cloud), Parakeet, Sherpa, Deepgram, AssemblyAI, Corti, Gemini STT, and Tinfoil. | Dedicated speech pipeline uses Gnani Prisma; resolveTranscriptionRoute throws until configured. |
| Local AI Infrastructure | Deleted local llama-server, Qdrant vector database, MiniLM embeddings, and GPU installers. | Heavy local LLM and vector database sidecars pruned. |
| Auto-updater | Disabled electron-updater feeds, startup checks, and automatic download routines. | Prevents unverified background binary updates. |
| Test Suites | Pruned test files for deleted features; added scripts/run-retained-tests.mjs for 279 retained test suites. | Test suite aligned with retained feature set and integrated into npm run test:ci. |
| Outbound Network Hosts | Audited all outbound HTTP/WS hosts via scripts/list-network-hosts.mjs. | All outbound calls restricted to 127.0.0.1, api.vachana.ai, and optional OpenAI-compatible text cleanup endpoint. |

## Network Audit Host Justifications

| Host | Code Location | Justification |
|:---|:---|:---|
| `127.0.0.1` | `src/helpers/devServerManager.js` | Local development server. Allowed. |
| `api.vachana.ai` | `src/helpers/gnani/gnani-client.js` | Official Gnani Vachana v3 STT API endpoint. Allowed. |
| `api.openai.com` | `src/config/constants.ts`, `src/helpers/providerConnectionTest.js` | Default endpoint for optional OpenAI-compatible text cleanup provider. Allowed. |
| `github.com` | `src/helpers/menuManager.js`, `src/components/onboarding/OnboardingShell.tsx` | DhwaniFlow open-source repository documentation and license URLs. |
| `lucide.dev` | `src/components/icons/primitives.tsx` | Upstream icon attribution documentation link in code comment. |
| `ui.shadcn.com` | `src/components.json` | JSON schema reference in configuration file. |
| `vite.dev` | `src/vite.config.mjs` | Vite documentation reference in comment. |
| `server`, `myresource.openai.azure.com`, `your-resource.cognitiveservices.azure.com` | `src/locales/*/translation.json` | Input field placeholder example strings in translation files. |


## Removed Production Dependencies & Pruning Evidence

The following 46 production packages were audited with ripgrep across all source files, scripts, and configurations. Each was verified to have zero import statements or references in retained code, and was safely removed from `package.json` to eliminate dead code and licensing risks (notably GPL-licensed `ffmpeg-static`):

| Package | ripgrep Import Check | Rationale & Status |
|:---|:---|:---|
| `@ai-sdk/amazon-bedrock` | 0 occurrences | Bedrock AI assistant integration pruned. |
| `@ai-sdk/anthropic` | 0 occurrences | Anthropic Claude assistant integration pruned. |
| `@ai-sdk/azure` | 0 occurrences | Azure OpenAI assistant integration pruned. |
| `@ai-sdk/google` | 0 occurrences | Google Gemini assistant integration pruned. |
| `@ai-sdk/google-vertex` | 0 occurrences | Google Vertex AI assistant integration pruned. |
| `@ai-sdk/groq` | 0 occurrences | Groq LLM assistant integration pruned. |
| `@ai-sdk/openai` | 0 occurrences | OpenAI assistant integration pruned. |
| `@ai-sdk/provider` | 0 occurrences | AI SDK provider core pruned. |
| `@aws-sdk/client-bedrock` | 0 occurrences | AWS Bedrock client SDK pruned. |
| `@aws-sdk/credential-providers` | 0 occurrences | AWS credential provider SDK pruned. |
| `@better-auth/sso` | 0 occurrences | Enterprise SSO authentication pruned. |
| `@qdrant/js-client-rest` | 0 occurrences | Qdrant vector database client pruned. |
| `@tiptap/core` | 0 occurrences | Upstream rich-text notes editor pruned. |
| `@tiptap/extension-bubble-menu` | 0 occurrences | Upstream notes editor bubble menu pruned. |
| `@tiptap/extension-floating-menu` | 0 occurrences | Upstream notes editor floating menu pruned. |
| `@tiptap/extension-horizontal-rule` | 0 occurrences | Upstream notes editor horizontal rule pruned. |
| `@tiptap/extension-mention` | 0 occurrences | Upstream notes editor mentions pruned. |
| `@tiptap/extension-placeholder` | 0 occurrences | Upstream notes editor placeholder pruned. |
| `@tiptap/extension-table` | 0 occurrences | Upstream notes editor tables pruned. |
| `@tiptap/extension-task-item` | 0 occurrences | Upstream notes editor task item pruned. |
| `@tiptap/extension-task-list` | 0 occurrences | Upstream notes editor task list pruned. |
| `@tiptap/pm` | 0 occurrences | ProseMirror core pruned. |
| `@tiptap/react` | 0 occurrences | React notes editor wrapper pruned. |
| `@tiptap/starter-kit` | 0 occurrences | Starter kit extension set pruned. |
| `@tiptap/suggestion` | 0 occurrences | Upstream notes editor suggestion engine pruned. |
| `agent-base` | 0 occurrences | Unused HTTP agent proxy base pruned. |
| `ai` | 0 occurrences | Vercel AI SDK core pruned. |
| `better-auth` | 0 occurrences | User accounts, auth sessions, and OAuth pruned. |
| `canvas-confetti` | 0 occurrences | Celebration confetti animations pruned. |
| `electron-updater` | 0 occurrences | Background auto-updater disabled and pruned. |
| `ffmpeg-static` | 0 occurrences | GPL binary distribution pruned (audio uses native WAV). |
| `flatted` | 0 occurrences | Unused circular JSON serializer pruned. |
| `https-proxy-agent` | 0 occurrences | Unused HTTPS proxy agent pruned. |
| `js-yaml` | 0 occurrences | Unused YAML parser pruned. |
| `kysely` | 0 occurrences | Unused SQL query builder pruned (`better-sqlite3` used directly). |
| `object-assign` | 0 occurrences | Legacy polyfill pruned. |
| `onnxruntime-node` | 0 occurrences | Local ONNX worker and sherpa sidecar pruned. |
| `ps-list` | 0 occurrences | Dead process-list cache helper pruned. |
| `shadcn-ui` | 0 occurrences | Development CLI mistakenly listed in production dependencies. |
| `tar` | 0 occurrences | Local model tarball extraction pruned. |
| `tiptap-markdown` | 0 occurrences | Upstream notes markdown serializer pruned. |
| `tw-animate-css` | 0 occurrences | Unused CSS animation utility pruned. |
| `unbzip2-stream` | 0 occurrences | Local model bzip2 stream extraction pruned. |
| `unzipper` | 0 occurrences | Prebuilt binary zip extractor pruned. |
| `ws` | 0 occurrences | Local sherpa WebSocket client pruned. |
| `zod` | 0 occurrences | Unused schema validation library pruned. |
