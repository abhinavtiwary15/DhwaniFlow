# Manual Test & Screenshot Capture Checklist

This document details the manual testing steps and visual asset capture requirements for DhwaniFlow. All screenshots must be saved as optimized PNG files under 300 KB in `docs/assets/`.

---

## 1. Environment & Prerequisites

1. **Clean Installation**:
   - Run `npm install` and ensure all build targets are compiled (`npm run build:renderer`).
   - Launch the application via `npm start`.
2. **Display Configuration**:
   - Window scaling: Standard 100% or high-DPI 200% (downsampled to 1x equivalent).
   - Theme: Light mode or dark mode according to system default, ensuring high contrast.
   - Screen bounds: Capture only the relevant application window or overlay panel without extraneous desktop background.
3. **Optimization Target**:
   - Output format: PNG (8-bit or 24-bit with alpha channel).
   - File size ceiling: Under 300 KB per image.
   - Optimization tools: Use `oxipng -o 4` or `pngquant --quality=80-95` to compress assets before committing.

---

## 2. Screenshot Capture Checklist

### View A: Home Dashboard
- **Target File**: `docs/assets/home.png`
- **Navigation**: Launch DhwaniFlow and navigate to the Home view.
- **Verification Elements**:
  - Left navigation sidebar showing exact items: **Home**, **Dictionary**, and **Settings** (General, Hotkeys, Speech, Privacy, System, About).
  - Empty or sample dictation history with timestamps and language badges.
  - Global hotkey indicator banner or tooltip displaying current dictation trigger.
  - Title and branding showing "DhwaniFlow". No upstream branding or broken links.
- **Framing**: Full main application window (recommended size: ~1024x720).

### View B: Speech Settings (Gnani Integration)
- **Target File**: `docs/assets/settings-speech.png`
- **Navigation**: Click **Settings** in the sidebar -> Select **Speech** section (`speechToText`).
- **Verification Elements**:
  - Section header labeled **Speech**.
  - Gnani API Key input with masking / show-hide toggle.
  - "Test Connection" and "Save Key" action buttons.
  - Status badge indicating configuration state (e.g., "Configured" or "Not configured").
  - Gnani Speech Language dropdown displaying language choices with **Hindi / Hinglish (hi-IN)** selected as default.
  - Audio input selection dropdown displaying available microphones.
- **Framing**: Settings modal or settings page content area focused on Speech options.

### View C: Dictation Overlay Panel
- **Target File**: `docs/assets/dictation-panel.png`
- **Navigation**: Trigger global dictation hotkey (e.g., `Ctrl+Space` or configured shortcut) while an active editor (VS Code, terminal, or text area) is focused.
- **Verification Elements**:
  - Compact floating HUD overlay centered or docked near the cursor/bottom.
  - Live animated audio waveform reacting to microphone input.
  - Streaming transcription preview showing Hinglish text (e.g., *"function createServer banao"*).
  - Status/latency badge showing connection health.
  - Stop/Finish action indicator.
- **Framing**: Cropped overlay window with subtle drop shadow on dark or neutral background (~600x240).

### View D: Onboarding Flow (Gnani Step)
- **Target File**: `docs/assets/onboarding-gnani.png` (Optional supplementary asset)
- **Navigation**: Trigger onboarding (`onboarding=true` or initial clean launch).
- **Verification Elements**:
  - Step progression: Step 2 of 3 (after Permissions, before Dictation Hotkey).
  - Clean card container with title "Connect Gnani Speech Service".
  - Secure API key input field with clear paste instructions.
  - Language selection dropdown defaulting to `hi-IN`.
  - Next / Continue navigation button.
- **Framing**: Centered onboarding dialog modal (~640x520).

---

## 3. Manual Functional Verification Steps

### Test 1: Navigation Integrity
- Click each sidebar link (**Home**, **Dictionary**, **Settings**).
- Verify each settings section renders cleanly: **General**, **Hotkeys**, **Speech**, **Privacy**, **System**, **About**.
- Verify no empty navigation groups, missing icons, or dead external links exist.
- Verify Settings > About displays:
  - DhwaniFlow version.
  - MIT License notice.
  - The exact attribution line: `"DhwaniFlow is built on OpenWhispr (MIT)"`.
  - No broken or dead upstream links.

### Test 2: Onboarding Flow Progression
- Trigger onboarding view.
- Step 1 (**Permissions**): Microphone and Accessibility checks render with Grant/Check buttons.
- Step 2 (**Gnani Setup**): Input test key, verify validation button feedback, select language from dropdown, verify persistence.
- Step 3 (**Hotkey Setup**): Record and save a global dictation shortcut.
- Completion: Modal closes and transitions seamlessly to Home dashboard.

### Test 3: Dictionary Management
- Open **Dictionary** from sidebar.
- Add sample Hinglish terminology / domain vocabulary (e.g., technical jargon, acronyms).
- Verify entries persist and can be edited or deleted.

### Test 4: Offline / Headless Fallback
- Disconnect network and ensure app fails gracefully with user-friendly notification.
- Verify app functions correctly when headless or when platform audio permissions are pending.
