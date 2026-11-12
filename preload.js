const { contextBridge, ipcRenderer } = require("electron");

/**
 * Helper to register an IPC listener and return a cleanup function.
 * Ensures renderer code can easily remove listeners to avoid leaks.
 */
const registerListener = (channel, handlerFactory) => {
  return (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener =
      typeof handlerFactory === "function"
        ? handlerFactory(callback)
        : (event, ...args) => callback(event, ...args);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
};
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  showDictationPanel: () => ipcRenderer.invoke("show-dictation-panel"),
  openSettingsSection: (section) => ipcRenderer.invoke("open-settings-section", section),
  onOpenSettingsSection: registerListener(
    "open-settings-section",
    (callback) => (_event, section) => callback(section)
  ),
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getPlatform: () => process.platform,
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  setMainWindowInputRegions: (regions) =>
    ipcRenderer.invoke("set-main-window-input-region", regions?.[0] || regions),
  setMainWindowInputRegion: (region) => ipcRenderer.invoke("set-main-window-input-region", region),
  onMainWindowVisibilityChanged: registerListener(
    "main-window-visibility-changed",
    (callback) => (_event, visible) => callback(visible)
  ),
  setMainWindowInteractivity: (interactive) =>
    ipcRenderer.invoke("set-main-window-interactivity", interactive),
  onMainWindowHorizontalDirectionChanged: registerListener(
    "main-window-horizontal-direction-changed",
    (callback) => (_event, dir) => callback(dir)
  ),
  getMainWindowHorizontalDirection: () =>
    ipcRenderer.invoke("get-main-window-horizontal-direction"),
  resizeMainWindow: (sizeKey) => ipcRenderer.invoke("resize-main-window", sizeKey),
  resizeDictationErrorWindowToContent: (height) =>
    ipcRenderer.invoke("resize-dictation-error-window-to-content", height),
  resizeAssistantWindowToContent: (height) =>
    ipcRenderer.invoke("resize-assistant-window-to-content", height),
  startWindowDrag: () => ipcRenderer.send("start-window-drag"),
  stopWindowDrag: () => ipcRenderer.send("stop-window-drag"),
  startControlPanelDrag: () => ipcRenderer.send("start-control-panel-drag"),
  stopControlPanelDrag: () => ipcRenderer.send("stop-control-panel-drag"),
  // Onboarding & Permissions
  setOnboardingWindowMode: (mode) => ipcRenderer.invoke("onboarding-set-window-mode", mode),
  setOnboardingActive: (active) => ipcRenderer.invoke("onboarding-set-active", active),
  // Dictation & Audio

  onToggleDictation: registerListener(
    "toggle-dictation",
    (callback) => (_event, opts) => callback(opts)
  ),
  onToggleCommand: registerListener(
    "toggle-command",
    (callback) => (_event, opts) => callback(opts)
  ),
  onStartDictation: registerListener("start-dictation", (callback) => () => callback()),
  onStopDictation: registerListener("stop-dictation", (callback) => () => callback()),
  onPrepareDictation: registerListener(
    "prepare-dictation",
    (callback) => (_event, opts) => callback(opts)
  ),
  onCancelDictationPreparation: registerListener(
    "cancel-dictation-preparation",
    (callback) => () => callback()
  ),
  onCancelDictation: registerListener("cancel-dictation", (callback) => () => callback()),
  onDictationForceStopped: registerListener(
    "dictation-force-stopped",
    (callback) => (_event, payload) => callback(payload)
  ),
  onMainWindowWillResize: registerListener(
    "main-window-will-resize",
    (callback) => (_event, plan) => callback(plan)
  ),
  ackMainWindowResizeMask: (token) => ipcRenderer.send("main-window-resize-mask-ready", token),
  dictationLifecycleStateChanged: (state, inputKind) =>
    ipcRenderer.send("dictation-lifecycle-state-changed", state, inputKind),
  dictationAudioLevelChanged: (level) => ipcRenderer.send("dictation-audio-level-changed", level),
  openMicrophoneSettings: () => ipcRenderer.invoke("open-microphone-settings"),
  openSoundInputSettings: () => ipcRenderer.invoke("open-sound-input-settings"),
  requestMicrophoneAccess: () => ipcRenderer.invoke("request-microphone-access"),
  checkMicrophoneAccess: () => ipcRenderer.invoke("check-microphone-access"),
  checkAccessibilityPermission: (prompt) =>
    ipcRenderer.invoke("check-accessibility-permission", prompt),
  openAccessibilitySettings: () => ipcRenderer.invoke("open-accessibility-settings"),
  checkPasteTools: () => ipcRenderer.invoke("check-paste-tools"),
  // Paste, Selection & Clipboard
  pasteText: (text, options) => ipcRenderer.invoke("paste-text", text, options),
  writeClipboard: (text) => ipcRenderer.invoke("write-clipboard", text),
  readClipboard: () => ipcRenderer.invoke("read-clipboard"),
  getPasteTools: () => ipcRenderer.invoke("check-paste-tools"),
  // Hotkeys & Push to talk
  registerHotkey: (hotkey) => ipcRenderer.invoke("register-hotkey", hotkey),
  unregisterHotkey: () => ipcRenderer.invoke("unregister-hotkey"),
  getRegisteredHotkey: () => ipcRenderer.invoke("get-registered-hotkey"),
  getHotkey: () => ipcRenderer.invoke("get-hotkey"),
  setHotkey: (hotkey) => ipcRenderer.invoke("set-hotkey", hotkey),
  updateHotkey: (hotkey) => ipcRenderer.invoke("update-hotkey", hotkey),
  getHotkeyModeInfo: (key) => ipcRenderer.invoke("get-hotkey-mode-info", key),
  getHyprlandConfigStatus: () => ipcRenderer.invoke("get-hyprland-config-status"),
  onHotkeyFallbackUsed: registerListener(
    "hotkey-fallback-used",
    (callback) => (_event, data) => callback(data)
  ),
  onHotkeyRegistrationFailed: registerListener(
    "hotkey-registration-failed",
    (callback) => (_event, data) => callback(data)
  ),
  getActivationMode: () => ipcRenderer.invoke("get-activation-mode"),
  notifyActivationModeChanged: (mode) => ipcRenderer.send("activation-mode-changed", mode),
  notifyHotkeyChanged: (hotkey) => ipcRenderer.send("hotkey-changed", hotkey),
  registerCancelHotkey: (hotkey) => ipcRenderer.invoke("register-cancel-hotkey", hotkey),
  unregisterCancelHotkey: () => ipcRenderer.invoke("unregister-cancel-hotkey"),
  onCancelHotkeyPressed: registerListener("cancel-hotkey-pressed", (callback) => () => callback()),
  setHotkeyListeningMode: (enabled) => ipcRenderer.invoke("set-hotkey-listening-mode", enabled),
  registerCommandHotkey: (hotkey) => ipcRenderer.invoke("register-command-hotkey", hotkey),
  getCommandModeEnabled: () => ipcRenderer.invoke("get-command-mode-enabled"),
  setCommandModeEnabled: (enabled) => ipcRenderer.invoke("set-command-mode-enabled", enabled),
  getCommandHotkey: () => ipcRenderer.invoke("get-command-hotkey"),
  executeVoiceCommand: (transcript) => ipcRenderer.invoke("execute-voice-command", transcript),
  cancelVoiceCommand: () => ipcRenderer.invoke("cancel-voice-command"),
  getCommandHistory: () => ipcRenderer.invoke("get-command-history"),
  clearCommandHistory: () => ipcRenderer.invoke("clear-command-history"),
  getCommandKeyterms: () => ipcRenderer.invoke("get-command-keyterms"),
  onCommandOverlayUpdate: registerListener(
    "command-overlay-update",
    (callback) => (_event, data) => callback(data)
  ),
  onGlobeKeyPressed: registerListener("globe-key-pressed", (callback) => () => callback()),
  onGlobeKeyReleased: registerListener("globe-key-released", (callback) => () => callback()),
  notifyStartMinimizedChanged: (startMinimized) =>
    ipcRenderer.send("start-minimized-changed", startMinimized),
  onFloatingIconAutoHideChanged: registerListener(
    "floating-icon-auto-hide-changed",
    (callback) => (_event, autoHide) => callback(autoHide)
  ),
  // Settings Store
  getSetting: (key, defaultValue) => ipcRenderer.invoke("get-setting", key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke("set-setting", key, value),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  onSettingUpdated: registerListener(
    "setting-updated",
    (callback) => (_event, data) => callback(data)
  ),
  getUiLanguage: () => ipcRenderer.invoke("get-ui-language"),
  setUiLanguage: (language) => ipcRenderer.invoke("save-ui-language", language),
  saveUiLanguage: (language) => ipcRenderer.invoke("save-ui-language", language),
  // Dictionary & Snippets (Local)
  getDictionary: () => ipcRenderer.invoke("db-get-dictionary"),
  setDictionary: (words) => ipcRenderer.invoke("db-set-dictionary", words),
  applyDictionaryChanges: (changes) => ipcRenderer.invoke("db-apply-dictionary-changes", changes),
  onDictionaryUpdated: registerListener(
    "dictionary-updated",
    (callback) => (_event, words) => callback(words)
  ),
  getSnippets: () => ipcRenderer.invoke("db-get-snippets"),
  setSnippets: (snippets) => ipcRenderer.invoke("db-save-snippets", snippets),
  onSnippetsUpdated: registerListener(
    "snippets-updated",
    (callback) => (_event, snippets) => callback(snippets)
  ),
  exportDictionary: (format) => ipcRenderer.invoke("export-dictionary", format),
  getDictionaryEntries: () => ipcRenderer.invoke("db-get-dictionary"),
  addDictionaryEntries: (entries) =>
    ipcRenderer.invoke("db-apply-dictionary-changes", {
      add: (entries || []).map((e) => (typeof e === "string" ? e : e.word)),
      remove: [],
    }),
  deleteDictionaryEntry: (word) =>
    ipcRenderer.invoke("db-apply-dictionary-changes", {
      add: [],
      remove: [word],
    }),
  // Transcriptions (Local History)
  saveTranscription: (text, rawText, options) =>
    ipcRenderer.invoke("db-save-transcription", text, rawText, options),
  getTranscriptions: (limit, options) =>
    ipcRenderer.invoke("db-get-transcriptions", limit, options),
  clearTranscriptions: (...args) => ipcRenderer.invoke("db-clear-transcriptions", ...args),
  clearAppData: () => ipcRenderer.invoke("clear-app-data"),
  deleteTranscription: (id) => ipcRenderer.invoke("db-delete-transcription", id),
  getTranscriptionById: (id) => ipcRenderer.invoke("get-transcription-by-id", id),
  updateTranscriptionText: (id, text, rawText) =>
    ipcRenderer.invoke("update-transcription-text", id, text, rawText),
  onTranscriptionAdded: registerListener(
    "transcription-added",
    (callback) => (_event, item) => callback(item)
  ),
  onTranscriptionUpdated: registerListener(
    "transcription-updated",
    (callback) => (_event, item) => callback(item)
  ),
  onTranscriptionDeleted: registerListener(
    "transcription-deleted",
    (callback) => (_event, payload) => callback(payload)
  ),
  onTranscriptionsCleared: registerListener(
    "transcriptions-cleared",
    (callback) => () => callback()
  ),
  // GPU Info
  getGpuInfo: () => ipcRenderer.invoke("get-gpu-info"),
  // Media Playback control

  // Gnani Speech-to-Text
  gnaniTranscribe: (audioBuffer, options) =>
    ipcRenderer.invoke("gnani:transcribe", audioBuffer, options),
  gnaniCancel: (requestId) => ipcRenderer.invoke("gnani:cancel", requestId),
  gnaniTestKey: (key) => ipcRenderer.invoke("gnani:test-key", key),
  gnaniSaveKey: (key) => ipcRenderer.invoke("gnani:save-key", key),
  gnaniGetStatus: () => ipcRenderer.invoke("gnani:get-status"),
  // Logging & Platform
  getLogLevel: () => ipcRenderer.invoke("get-log-level"),
  log: (entry) => ipcRenderer.invoke("app-log", entry),
  sendDebugLog: (message) =>
    ipcRenderer.send("app-log", {
      level: "debug",
      message,
    }),
});
