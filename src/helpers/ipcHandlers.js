const { ipcMain, app, shell, systemPreferences, dialog, BrowserWindow } = require("electron");
const debugLogger = require("./debugLogger");
const { broadcastToWindows } = require("./windowBroadcast");
const {
  handleTranscribe,
  handleCancel,
  handleTestKey,
  handleSaveKey,
  handleGetStatus,
  handleScanProject,
} = require("./gnani/gnani-ipc");

class IPCHandlers {
  constructor({
    environmentManager,
    databaseManager,
    clipboardManager,
    windowManager,
    windowsKeyManager,
    linuxKeyManager,
    textEditMonitor,
    selectionManager,
  } = {}) {
    this.environmentManager = environmentManager;
    this.databaseManager = databaseManager;
    this.clipboardManager = clipboardManager;
    this.windowManager = windowManager;
    this.windowsKeyManager = windowsKeyManager;
    this.linuxKeyManager = linuxKeyManager;
    this.textEditMonitor = textEditMonitor;
    this.selectionManager = selectionManager;

    this.setupHandlers();
  }

  setupHandlers() {
    // Window controls
    ipcMain.handle("window-minimize", () => this.windowManager?.minimizeWindow?.());
    ipcMain.handle("window-maximize", () => this.windowManager?.maximizeWindow?.());
    ipcMain.handle("window-close", () => this.windowManager?.closeWindow?.());
    ipcMain.handle("window-is-maximized", () => this.windowManager?.isWindowMaximized?.() ?? false);
    ipcMain.handle("hide-window", () => this.windowManager?.hideWindow?.());
    ipcMain.handle("show-dictation-panel", () => this.windowManager?.showDictationPanel?.());
    ipcMain.handle("open-settings-section", async (_event, section) => {
      return this.windowManager?.openSettingsSection?.(section);
    });
    ipcMain.handle("set-main-window-interactivity", (_event, interactive) =>
      this.windowManager?.setMainWindowInteractivity?.(interactive)
    );
    ipcMain.handle("set-main-window-input-region", (_event, region) =>
      this.windowManager?.setMainWindowInputRegion?.(region)
    );
    ipcMain.handle("get-main-window-horizontal-direction", () =>
      this.windowManager?.getMainWindowHorizontalDirection?.() ?? "left"
    );
    ipcMain.handle("resize-main-window", (_event, sizeKey) =>
      this.windowManager?.resizeMainWindow?.(sizeKey)
    );
    ipcMain.handle("resize-dictation-error-window-to-content", (_event, height) =>
      this.windowManager?.resizeDictationErrorWindowToContent?.(height)
    );
    ipcMain.handle("resize-assistant-window-to-content", (_event, height) =>
      this.windowManager?.resizeAssistantWindowToContent?.(height)
    );
    ipcMain.handle("set-notification-interactivity", (_event, interactive) =>
      this.windowManager?.setNotificationInteractivity?.(interactive)
    );

    // Window drag events
    ipcMain.on("start-window-drag", () => this.windowManager?.startWindowDrag?.());
    ipcMain.on("stop-window-drag", () => this.windowManager?.stopWindowDrag?.());
    ipcMain.on("start-control-panel-drag", () => this.windowManager?.startControlPanelDrag?.());
    ipcMain.on("stop-control-panel-drag", () => this.windowManager?.stopControlPanelDrag?.());

    // Onboarding & Permissions
    ipcMain.handle("onboarding-set-window-mode", (_event, mode) =>
      this.windowManager?.setOnboardingWindowMode?.(mode)
    );
    ipcMain.handle("onboarding-set-active", (_event, active) =>
      this.windowManager?.setOnboardingActive?.(active)
    );
    ipcMain.handle("permission-guide-open", (event, state) =>
      this.windowManager?.permissionGuide?.open?.(event, state)
    );
    ipcMain.handle("permission-guide-close", (event) =>
      this.windowManager?.permissionGuide?.closeFromOwner?.(event)
    );
    ipcMain.handle("permission-guide-state", (event) =>
      this.windowManager?.permissionGuide?.getState?.(event)
    );
    ipcMain.on("permission-guide-action", (event, action) =>
      this.windowManager?.permissionGuide?.handleAction?.(event, action)
    );
    ipcMain.on("permission-guide-drag", (event, target) =>
      this.windowManager?.permissionGuide?.handleDrag?.(event, target)
    );

    // Dictation target & permissions & audio devices
    ipcMain.handle("capture-dictation-target", async () =>
      this.windowManager?.captureDictationTarget?.() ?? {}
    );
    ipcMain.handle("capture-dictation-app-category", async () =>
      this.windowManager?.captureDictationAppCategory?.() ?? null
    );
    ipcMain.handle("force-stop-dictation", () =>
      this.windowManager?.forceStopDictation?.()
    );
    ipcMain.handle("check-microphone-access", async () => {
      if (process.platform === "darwin") {
        return { granted: systemPreferences.getMediaAccessStatus("microphone") === "granted" };
      }
      return { granted: true };
    });
    ipcMain.handle("request-microphone-access", async () => {
      if (process.platform === "darwin") {
        const granted = await systemPreferences.askForMediaAccess("microphone");
        return { success: granted, granted };
      }
      return { success: true, granted: true };
    });
    ipcMain.handle("open-microphone-settings", async () => {
      if (process.platform === "darwin") {
        shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
        return { success: true };
      }
      if (process.platform === "win32") {
        shell.openExternal("ms-settings:privacy-microphone");
        return { success: true };
      }
      return { success: false, error: "Not supported" };
    });
    ipcMain.handle("open-sound-input-settings", async () => {
      if (process.platform === "darwin") {
        shell.openExternal("x-apple.systempreferences:com.apple.preference.sound?input");
        return { success: true };
      }
      if (process.platform === "win32") {
        shell.openExternal("ms-settings:sound");
        return { success: true };
      }
      return { success: false, error: "Not supported" };
    });
    ipcMain.handle("check-accessibility-permission", async (_event, prompt = false) => {
      if (process.platform === "darwin") {
        return systemPreferences.isTrustedAccessibilityClient(Boolean(prompt));
      }
      return true;
    });
    ipcMain.handle("open-accessibility-settings", async () => {
      if (process.platform === "darwin") {
        shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
        return { success: true };
      }
      if (process.platform === "win32") {
        shell.openExternal("ms-settings:easeofaccess");
        return { success: true };
      }
      return { success: false, error: "Not supported" };
    });
    ipcMain.handle("check-paste-tools", async () => {
      if (this.clipboardManager?.checkPasteTools) {
        return this.clipboardManager.checkPasteTools();
      }
      return { platform: process.platform, available: true, method: "native", requiresPermission: false };
    });
    ipcMain.handle("get-microphones", async () => {
      return this.windowManager?.getMicrophones?.() ?? [];
    });
    ipcMain.handle("set-microphone", async (_event, id) => {
      return this.windowManager?.setMicrophone?.(id) ?? true;
    });
    ipcMain.handle("getSelectedMicrophone", async () => {
      return this.windowManager?.getSelectedMicrophone?.() ?? "default";
    });
    ipcMain.handle("get-selected-microphone", async () => {
      return this.windowManager?.getSelectedMicrophone?.() ?? "default";
    });
    ipcMain.handle("get-system-default-microphone", async () => {
      return this.windowManager?.getSystemDefaultMicrophone?.() ?? null;
    });
    ipcMain.handle("get-audio-diagnostics", async () => {
      return (
        this.windowManager?.getAudioDiagnostics?.() ?? {
          sampleRate: 16000,
          channelCount: 1,
          hasAudioInput: true,
        }
      );
    });
    ipcMain.handle("get-ffmpeg-availability", async () => ({ available: true }));

    // Dictation preview
    ipcMain.handle("start-dictation-preview", async (_event, opts) =>
      this.windowManager?.startDictationPreview?.(opts)
    );
    ipcMain.handle("update-dictation-preview", async (_event, text) =>
      this.windowManager?.updateDictationPreview?.(text)
    );
    ipcMain.handle("complete-dictation-preview", async (_event, payload) =>
      this.windowManager?.completeDictationPreview?.(payload)
    );
    ipcMain.handle("stop-dictation-preview", async () =>
      this.windowManager?.stopDictationPreview?.()
    );
    ipcMain.handle("hide-dictation-preview", async () =>
      this.windowManager?.hideDictationPreview?.()
    );
    ipcMain.handle("dismiss-dictation-preview", async () =>
      this.windowManager?.dismissDictationPreview?.()
    );
    ipcMain.on("dictation-preview-audio", (_event, chunk) =>
      this.windowManager?.handleDictationPreviewAudio?.(chunk)
    );
    ipcMain.on("screen-context-set-enabled", (_event, enabled) =>
      this.windowManager?.setScreenContextEnabled?.(enabled)
    );

    // Audio cues & lifecycle
    ipcMain.on("mic-warm-hold-changed", (_event, active) =>
      this.windowManager?.setMicWarmHold?.(active)
    );
    ipcMain.on("dictation-lifecycle-state-changed", (_event, state, inputKind) =>
      this.windowManager?.setDictationLifecycleState?.(state, inputKind)
    );
    ipcMain.on("dictation-audio-level-changed", (_event, level) =>
      this.windowManager?.setDictationAudioLevel?.(level)
    );

    // Paste, Selection & Clipboard
    ipcMain.handle("paste-text", async (_event, text, options) => {
      if (this.clipboardManager?.pasteText) {
        return this.clipboardManager.pasteText(text, options);
      }
      return { success: true, pasted: true };
    });
    ipcMain.handle("capture-selected-text", async (_event, options) => {
      if (this.selectionManager?.captureSelectedText) {
        return this.selectionManager.captureSelectedText(options);
      }
      return { status: "empty" };
    });
    ipcMain.handle("replace-selected-text", async (_event, sessionId, text, options) => {
      if (this.selectionManager?.replaceSelectedText) {
        return this.selectionManager.replaceSelectedText(sessionId, text, options);
      }
      return { success: false };
    });
    ipcMain.handle("paste-at-captured-target", async (_event, sessionId, text, options) => {
      if (this.selectionManager?.pasteAtCapturedTarget) {
        return this.selectionManager.pasteAtCapturedTarget(sessionId, text, options);
      }
      return { success: false };
    });
    ipcMain.handle("write-clipboard", async (_event, text) => {
      if (this.clipboardManager?.writeClipboard) {
        return this.clipboardManager.writeClipboard(text);
      }
      const { clipboard } = require("electron");
      clipboard.writeText(text);
      return { success: true };
    });
    ipcMain.handle("read-clipboard", async () => {
      if (this.clipboardManager?.readClipboard) {
        return this.clipboardManager.readClipboard();
      }
      const { clipboard } = require("electron");
      return clipboard.readText();
    });

    // Hotkeys & Push to talk
    ipcMain.handle("register-hotkey", async (_event, hotkey) => {
      if (this.windowManager?.updateHotkey) {
        const result = await this.windowManager.updateHotkey(hotkey);
        return Boolean(result?.success);
      }
      return false;
    });
    ipcMain.handle("unregister-hotkey", async () => {
      if (this.windowManager?.hotkeyManager?.unregisterSlot) {
        this.windowManager.hotkeyManager.unregisterSlot("dictation");
        return true;
      }
      return false;
    });
    ipcMain.handle("get-registered-hotkey", async () =>
      this.windowManager?.hotkeyManager?.getCurrentHotkey?.() ?? null
    );
    ipcMain.handle("get-hotkey", async () =>
      this.environmentManager?.getHotkey?.() ?? "Space"
    );
    ipcMain.handle("set-hotkey", async (_event, hotkey) => {
      if (this.environmentManager?.setHotkey) {
        return this.environmentManager.setHotkey(hotkey);
      }
      return true;
    });
    ipcMain.handle("update-hotkey", async (_event, hotkey) => {
      if (this.windowManager?.updateHotkey) {
        return this.windowManager.updateHotkey(hotkey);
      }
      return { success: false, message: "WindowManager unavailable" };
    });
    ipcMain.handle("get-hotkey-mode-info", async (_event, key) => {
      if (this.windowManager?.getHotkeyModeInfo) {
        return this.windowManager.getHotkeyModeInfo(key);
      }
      const hotkeyManager = this.windowManager?.hotkeyManager;
      if (!hotkeyManager) return {};
      const hotkey =
        typeof key === "string" && key.trim()
          ? key.split(",")[0].trim()
          : hotkeyManager.getCurrentHotkey?.() || "";
      const isUsingNativeShortcut = this.windowManager?.isUsingNativeShortcutHotkeys?.() ?? false;
      const supportsPushToTalk = hotkeyManager.supportsPushToTalk?.(hotkey) ?? true;
      return {
        isUsingGnome: this.windowManager?.isUsingGnomeHotkeys?.() ?? false,
        isUsingHyprland: this.windowManager?.isUsingHyprlandHotkeys?.() ?? false,
        isUsingKDE: this.windowManager?.isUsingKDEHotkeys?.() ?? false,
        isUsingNativeShortcut,
        supportsPushToTalk,
        pushToTalkUnavailableReason: supportsPushToTalk
          ? null
          : (hotkeyManager.getPushToTalkUnavailableReason?.(hotkey) ?? null),
        linuxInputAccessDenied:
          Boolean(hotkeyManager.reliesOnLinuxKeyListener?.()) &&
          hotkeyManager.nativeListenerProbe?.()?.reason === "input_access_denied",
      };
    });
    ipcMain.handle("get-hyprland-config-status", async () => {
      if (!this.windowManager?.isUsingHyprlandHotkeys?.()) return null;
      return this.windowManager?.getHyprlandConfigStatus?.() ?? null;
    });
    ipcMain.handle("get-activation-mode", async () =>
      this.windowManager?.getActivationMode?.() ??
      this.environmentManager?.getActivationMode?.() ??
      "tap"
    );
    ipcMain.handle("register-cancel-hotkey", async (_event, hotkey) => {
      if (this.windowManager?.registerCancelHotkey) {
        return this.windowManager.registerCancelHotkey(hotkey);
      }
      const hotkeyManager = this.windowManager?.hotkeyManager;
      if (!hotkeyManager || !hotkey) return false;
      const mainWindow = this.windowManager?.mainWindow;
      return hotkeyManager.registerSlot("cancel", hotkey, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("cancel-hotkey-pressed");
        }
      });
    });
    ipcMain.handle("unregister-cancel-hotkey", async () => {
      if (this.windowManager?.unregisterCancelHotkey) {
        return this.windowManager.unregisterCancelHotkey();
      }
      const hotkeyManager = this.windowManager?.hotkeyManager;
      if (!hotkeyManager) return { success: false };
      hotkeyManager.unregisterSlot("cancel");
      return { success: true };
    });
    ipcMain.handle("set-hotkey-listening-mode", async (_event, enabled) =>
      this.windowManager?.setHotkeyListeningMode?.(enabled) ?? true
    );
    ipcMain.on("hotkey-changed", (_event, hotkey) => {
      this.windowManager?.handleHotkeyChanged?.(hotkey);
    });
    let activationModeChangeQueue = Promise.resolve();
    ipcMain.on("activation-mode-changed", (_event, mode) => {
      activationModeChangeQueue = activationModeChangeQueue
        .then(() => this.windowManager?.handleActivationModeChanged?.(mode))
        .catch((err) => {
          debugLogger.error("Failed to change activation mode", { error: err.message }, "hotkey");
        });
    });
    ipcMain.on("floating-icon-auto-hide-changed", (_event, enabled) => {
      this.windowManager?.handleFloatingIconAutoHideChanged?.(enabled);
    });
    ipcMain.on("start-minimized-changed", (_event, enabled) => {
      this.windowManager?.handleStartMinimizedChanged?.(enabled);
    });
    ipcMain.on("panel-start-position-changed", (_event, pos) => {
      this.windowManager?.handlePanelStartPositionChanged?.(pos);
    });

    // Settings Store (backed by DatabaseManager)
    ipcMain.handle("get-setting", async (_event, key, defaultValue) => {
      if (this.databaseManager?.getSetting) {
        const val = this.databaseManager.getSetting(key);
        return val !== undefined ? val : defaultValue;
      }
      return defaultValue;
    });
    ipcMain.handle("set-setting", async (_event, key, value) => {
      if (this.databaseManager?.setSetting) {
        this.databaseManager.setSetting(key, value);
        broadcastToWindows("setting-updated", { key, value });
        return true;
      }
      return false;
    });
    ipcMain.handle("get-settings", async () => {
      if (this.databaseManager?.getSettings) {
        return this.databaseManager.getSettings();
      }
      return {};
    });
    ipcMain.handle("get-ui-language", async () => {
      if (this.environmentManager?.getUiLanguage) {
        return this.environmentManager.getUiLanguage();
      }
      return "en";
    });
    ipcMain.handle("save-ui-language", async (_event, lang) => {
      if (this.environmentManager?.saveUiLanguage) {
        return this.environmentManager.saveUiLanguage(lang);
      }
      return true;
    });

    // Local Dictionary & Snippets
    ipcMain.handle("db-get-dictionary", async () => {
      if (this.databaseManager?.getDictionary) {
        return this.databaseManager.getDictionary();
      }
      return [];
    });
    ipcMain.handle("db-apply-dictionary-changes", async (_event, changes) => {
      if (this.databaseManager?.applyDictionaryChanges) {
        const res = this.databaseManager.applyDictionaryChanges(changes);
        broadcastToWindows("dictionary-updated", this.databaseManager.getDictionary());
        return res;
      }
      return false;
    });
    ipcMain.handle("export-dictionary", async (_event, format) => {
      if (this.databaseManager?.exportDictionary) {
        return this.databaseManager.exportDictionary(format);
      }
      return null;
    });
    ipcMain.handle("db-get-snippets", async () => {
      if (this.databaseManager?.getSnippets) {
        return this.databaseManager.getSnippets();
      }
      return [];
    });
    ipcMain.handle("db-save-snippets", async (_event, snippets) => {
      if (this.databaseManager?.saveSnippets) {
        const res = this.databaseManager.saveSnippets(snippets);
        broadcastToWindows("snippets-updated", snippets);
        return res;
      }
      return false;
    });
    ipcMain.handle("dragon-import-pick-file", async () => ({ success: false, cancelled: true }));

    // Local Transcriptions (History)
    ipcMain.handle("db-save-transcription", async (_event, item) => {
      if (this.databaseManager?.saveTranscription) {
        const res = this.databaseManager.saveTranscription(item);
        broadcastToWindows("transcription-added", item);
        return res;
      }
      return false;
    });
    ipcMain.handle("db-get-transcriptions", async (_event, limit, options) => {
      if (this.databaseManager?.getTranscriptions) {
        return this.databaseManager.getTranscriptions(limit, options);
      }
      return [];
    });
    ipcMain.handle("db-clear-transcriptions", async () => {
      if (this.databaseManager?.clearTranscriptions) {
        const res = this.databaseManager.clearTranscriptions();
        broadcastToWindows("transcriptions-cleared");
        return res;
      }
      return { cleared: 0, success: true };
    });
    ipcMain.handle("clear-app-data", async (event) => {
      const win =
        (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
        this.windowManager?.controlPanelWindow;
      const { response } = await dialog.showMessageBox(win || undefined, {
        type: "warning",
        buttons: ["Clear App Data", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Confirm Clear Application Data",
        message: "Are you sure you want to clear all application data?",
        detail:
          "This permanently deletes all transcription history, custom dictionary words, and cached settings. This action cannot be undone.",
      });
      if (response !== 0) {
        return { success: false, cancelled: true };
      }
      if (this.databaseManager?.clearTranscriptions) {
        this.databaseManager.clearTranscriptions();
        broadcastToWindows("transcriptions-cleared");
      }
      if (this.environmentManager?.clearAllPersistedData) {
        await this.environmentManager.clearAllPersistedData();
      }
      return { success: true };
    });
    ipcMain.handle("db-delete-transcription", async (_event, id) => {
      if (this.databaseManager?.deleteTranscription) {
        const res = this.databaseManager.deleteTranscription(id);
        broadcastToWindows("transcription-deleted", { id });
        return res;
      }
      return { success: true };
    });
    ipcMain.handle("get-transcription-by-id", async (_event, id) => {
      if (this.databaseManager?.getTranscriptionById) {
        return this.databaseManager.getTranscriptionById(id);
      }
      return null;
    });
    ipcMain.handle("update-transcription-text", async (_event, id, text) => {
      if (this.databaseManager?.updateTranscriptionText) {
        const res = this.databaseManager.updateTranscriptionText(id, text);
        broadcastToWindows("transcription-updated", { id, text });
        return res;
      }
      return false;
    });
    ipcMain.handle("save-transcription-audio", async () => true);
    ipcMain.handle("get-audio-path", async () => null);
    ipcMain.handle("show-audio-in-folder", async () => false);
    ipcMain.handle("get-audio-buffer", async () => null);
    ipcMain.handle("delete-transcription-audio", async () => true);

    // GPU Info
    ipcMain.handle("get-gpu-info", async () => {
      try {
        const gpuInfo = await app.getGPUInfo("complete");
        return { available: true, ...gpuInfo };
      } catch {
        return { available: false };
      }
    });

    // Media Playback control
    ipcMain.handle("pause-media-playback", async () => true);
    ipcMain.handle("resume-media-playback", async () => true);

    // Gnani Speech-to-Text
    ipcMain.handle("gnani:transcribe", (event, audioBuffer, options) =>
      handleTranscribe(event, audioBuffer, options, this.environmentManager, this.databaseManager)
    );
    ipcMain.handle("gnani:cancel", (event, requestId) =>
      handleCancel(event, requestId)
    );
    ipcMain.handle("gnani:test-key", (event, keyToTest) =>
      handleTestKey(event, keyToTest, this.environmentManager)
    );
    ipcMain.handle("gnani:save-key", (event, key) =>
      handleSaveKey(event, key, this.environmentManager)
    );
    ipcMain.handle("gnani:scan-project", (event, folders) =>
      handleScanProject(event, folders)
    );
    ipcMain.handle("gnani:get-status", (event) =>
      handleGetStatus(event, this.environmentManager)
    );

    // Logging & Platform
    const logHandler = async (_event, entry) => {
      if (entry?.level === "error") {
        debugLogger.error(entry.message, entry.meta, entry.scope);
      } else if (entry?.level === "warn") {
        debugLogger.warn(entry.message, entry.meta, entry.scope);
      } else {
        debugLogger.debug(entry.message, entry.meta, entry.scope);
      }
    };
    ipcMain.handle("app-log", logHandler);
    ipcMain.on("app-log", logHandler);
    ipcMain.handle("get-logs", async () => debugLogger.getLogBuffer?.() || "");
    ipcMain.handle("open-logs-folder", async () => debugLogger.openLogsFolder?.());
    ipcMain.handle("set-debug-logging", async (_event, enabled) =>
      debugLogger.setDebugLogging?.(enabled)
    );
    ipcMain.handle("get-log-level", async () => debugLogger.getLevel?.() || "info");
    ipcMain.handle("get-platform", () => process.platform);
    ipcMain.handle("get-app-version", () => ({ version: app.getVersion() }));
    ipcMain.handle("open-external", async (_event, url) => shell.openExternal(url));
  }

  _cleanupTextEditMonitor() {
    if (this.textEditMonitor && this._textEditHandler) {
      this.textEditMonitor.removeListener("text-edited", this._textEditHandler);
      this._textEditHandler = null;
    }
  }
}

module.exports = IPCHandlers;
