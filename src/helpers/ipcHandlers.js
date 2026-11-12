const {
  ipcMain: rawIpc,
  app,
  shell,
  clipboard,
  BrowserWindow,
  dialog,
  systemPreferences,
} = require("electron");
const fs = require("node:fs/promises");
const { trustedIpc, validateSender } = require("./ipc-security");
const {
  validateSetting,
  filterSettings,
  allowedKeys,
  validateWords,
} = require("./settings-schema");
const { broadcastToWindows } = require("./windowBroadcast");
const { registerGnaniIpc, handleCancel } = require("./gnani/gnani-ipc");
const { commandHandler } = require("./commands/handler");
const { getCommandKeyterms } = require("./commands");
const debugLogger = require("./debugLogger");
const text = (value) => {
  if (typeof value !== "string" || value.length > 1048576) throw new Error("Invalid text");
  return value;
};
const id = (value) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid history ID");
  return value;
};
const bool = (value) => {
  if (typeof value !== "boolean") throw new Error("Expected boolean");
  return value;
};
const shortcut = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > 128 || /[\x00-\x1f]/.test(value))
    throw new Error("Invalid shortcut");
  return value;
};
class IPCHandlers {
  constructor(dependencies = {}) {
    Object.assign(this, dependencies);
    this.setupHandlers();
  }
  _validateSender(event) {
    return validateSender(event);
  }
  setupHandlers() {
    const ipcMain = trustedIpc(rawIpc),
      wm = this.windowManager,
      db = this.databaseManager,
      environment = this.environmentManager;
    commandHandler.setDependencies({
      windowManager: wm,
      clipboardManager: this.clipboardManager,
      historyEnabled: () => db.getSetting("dataRetentionEnabled", true),
      pasteOptions: () => ({
        autoPasteEnabled: db.getSetting("autoPasteEnabled", true),
        restoreClipboard: !db.getSetting("keepTranscriptionInClipboard", true),
      }),
    });
    ipcMain.handle("window-minimize", (event) =>
      BrowserWindow.fromWebContents(event.sender).minimize()
    );
    ipcMain.handle("window-maximize", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.handle("window-close", (event) => BrowserWindow.fromWebContents(event.sender).close());
    ipcMain.handle("window-is-maximized", (event) =>
      BrowserWindow.fromWebContents(event.sender).isMaximized()
    );
    ipcMain.handle("hide-window", (event) => BrowserWindow.fromWebContents(event.sender).hide());
    ipcMain.handle("show-dictation-panel", () => wm.showDictationPanel());
    ipcMain.handle("open-settings-section", async (_event, section) => {
      if (
        ![
          "general",
          "hotkeys",
          "speech",
          "speechToText",
          "privacy",
          "privacyData",
          "system",
          "about",
        ].includes(section)
      )
        throw new Error("Unsupported settings page");
      await wm.createControlPanelWindow();
      wm.showControlPanel();
      wm.sendToControlPanel("open-settings-section", section);
      return true;
    });
    ipcMain.handle("set-main-window-interactivity", (_event, value) =>
      wm.setMainWindowInteractivity(bool(value))
    );
    ipcMain.handle("set-main-window-input-region", (_event, region) => {
      if (
        region !== null &&
        (!region ||
          ["x", "y", "width", "height"].some(
            (key) => !Number.isFinite(region[key]) || Math.abs(region[key]) > 10000
          ))
      )
        throw new Error("Invalid input region");
      return wm.setMainWindowInputRegion(region);
    });
    ipcMain.handle("get-main-window-horizontal-direction", () =>
      wm.getMainWindowHorizontalDirection()
    );
    ipcMain.handle("resize-main-window", (_event, size) => {
      if (typeof size !== "string" || size.length > 64) throw new Error("Invalid window size");
      return wm.resizeMainWindow(size);
    });
    ipcMain.handle("resize-dictation-error-window-to-content", (_event, height) => {
      if (!Number.isFinite(height) || height < 0 || height > 10000)
        throw new Error("Invalid height");
      return wm.resizeDictationErrorWindowToContent(height);
    });
    ipcMain.handle("resize-assistant-window-to-content", (_event, height) => {
      if (!Number.isFinite(height) || height < 0 || height > 10000)
        throw new Error("Invalid height");
      return wm.resizeAssistantWindowToContent(height);
    });
    ipcMain.on("start-window-drag", () => wm.startWindowDrag());
    ipcMain.on("stop-window-drag", () => wm.stopWindowDrag());
    ipcMain.on("start-control-panel-drag", () => wm.startControlPanelDrag());
    ipcMain.on("stop-control-panel-drag", () => wm.stopControlPanelDrag());
    ipcMain.handle("onboarding-set-window-mode", (_event, mode) => {
      if (!["compact", "expanded", "restore"].includes(mode))
        throw new Error("Invalid onboarding mode");
      return wm.setOnboardingWindowMode(mode);
    });
    ipcMain.handle("onboarding-set-active", (_event, active) =>
      wm.setOnboardingActive(bool(active))
    );
    ipcMain.on("dictation-lifecycle-state-changed", (_event, state, kind) => {
      if (!["idle", "preparing", "recording", "processing"].includes(state) || kind !== "dictation")
        throw new Error("Invalid dictation state");
      wm.setDictationLifecycleState(state, kind);
    });
    ipcMain.on("dictation-audio-level-changed", (_event, level) => {
      if (!Number.isFinite(level) || level < 0 || level > 1) throw new Error("Invalid audio level");
      wm.setDictationAudioLevel(level);
    });
    ipcMain.handle("check-microphone-access", () =>
      process.platform === "darwin"
        ? {
            granted: systemPreferences.getMediaAccessStatus("microphone") === "granted",
          }
        : {
            granted: false,
            status: "unknown",
            requiresCaptureProbe: true,
          }
    );
    ipcMain.handle("request-microphone-access", async () => {
      if (process.platform !== "darwin")
        return {
          success: false,
          granted: false,
          requiresCaptureProbe: true,
        };
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return {
        granted,
        success: granted,
      };
    });
    ipcMain.handle("check-accessibility-permission", (_event, prompt = false) =>
      process.platform === "darwin"
        ? systemPreferences.isTrustedAccessibilityClient(bool(prompt))
        : true
    );
    ipcMain.handle("open-microphone-settings", () => this._openOsSettings("microphone"));
    ipcMain.handle("open-sound-input-settings", () => this._openOsSettings("sound"));
    ipcMain.handle("open-accessibility-settings", () => this._openOsSettings("accessibility"));
    ipcMain.handle("check-paste-tools", () => this.clipboardManager.checkPasteTools());
    ipcMain.handle("paste-text", async (_event, value, options = {}) => {
      text(value);
      if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options) ||
        Object.keys(options).some(
          (key) => !["restoreClipboard", "allowClipboardFallback"].includes(key)
        )
      )
        throw new Error("Invalid paste options");
      for (const option of Object.values(options)) bool(option);
      try {
        const result = await this.clipboardManager.pasteText(value, options);
        let restored = true;
        try {
          await result?.restoreComplete;
        } catch {
          restored = false;
          debugLogger.warn("Clipboard restoration failed");
        }
        return {
          success: result?.pasted === true,
          ok: result?.pasted === true,
          pasted: result?.pasted === true,
          method: result?.method || "unknown",
          clipboardRestored: restored,
          ...(typeof result?.reason === "string"
            ? {
                reason: result.reason,
              }
            : {}),
        };
      } catch {
        return {
          success: false,
          ok: false,
          pasted: false,
          error: "Text could not be pasted",
          code: "PASTE_FAILED",
        };
      }
    });
    ipcMain.handle("write-clipboard", (_event, value) => {
      clipboard.writeText(text(value));
      return {
        success: true,
      };
    });
    ipcMain.handle("read-clipboard", () => clipboard.readText());
    ipcMain.handle("register-hotkey", async (_event, key) =>
      Boolean((await wm.updateHotkey(shortcut(key)))?.success)
    );
    ipcMain.handle("set-hotkey", (_event, key) => wm.updateHotkey(shortcut(key)));
    ipcMain.handle("update-hotkey", (_event, key) => wm.updateHotkey(shortcut(key)));
    ipcMain.handle(
      "unregister-hotkey",
      async () => (await wm.hotkeyManager.unregisterSlot("dictation")) !== false
    );
    ipcMain.handle("get-registered-hotkey", () => wm.hotkeyManager.getCurrentHotkey());
    ipcMain.handle(
      "get-hotkey",
      () => wm.hotkeyManager.getCurrentHotkey() || environment.getDictationKey()
    );
    ipcMain.handle("get-hotkey-mode-info", (_event, key) => wm.getHotkeyModeInfo(key));
    ipcMain.handle("get-hyprland-config-status", () =>
      wm.isUsingHyprlandHotkeys() ? wm.getHyprlandConfigStatus() : null
    );
    ipcMain.handle("get-activation-mode", () => wm.getActivationMode());
    ipcMain.on("activation-mode-changed", (_event, mode) => {
      validateSetting("activationMode", mode);
      return wm.handleActivationModeChanged(mode);
    });
    ipcMain.on("hotkey-changed", (_event, key) => wm.handleHotkeyChanged(shortcut(key)));
    ipcMain.handle("register-cancel-hotkey", (_event, key) =>
      wm.registerCancelHotkey(shortcut(key))
    );
    ipcMain.handle("unregister-cancel-hotkey", () => wm.unregisterCancelHotkey());
    ipcMain.handle("set-hotkey-listening-mode", (_event, enabled) =>
      wm.setHotkeyListeningMode(bool(enabled))
    );
    ipcMain.handle("get-command-mode-enabled", () => environment.getCommandModeEnabled());
    ipcMain.handle("get-command-hotkey", () => environment.getCommandKey());
    ipcMain.handle("set-command-mode-enabled", (_event, enabled) =>
      this._setCommandEnabled(bool(enabled))
    );
    ipcMain.handle("execute-voice-command", async (_event, transcript) => {
      if (!environment.getCommandModeEnabled()) throw new Error("Command mode is disabled");
      if (typeof transcript !== "string" || transcript.length > 5000)
        throw new Error("Invalid command transcript");
      const registered = await wm.registerCancelHotkey("Escape");
      if (!registered || registered.success === false)
        throw new Error("Command cancellation shortcut unavailable");
      try {
        return await commandHandler.handleTranscript(transcript);
      } finally {
        wm.unregisterCancelHotkey();
      }
    });
    ipcMain.handle("cancel-voice-command", () => ({
      cancelled: commandHandler.cancelPending(),
    }));
    ipcMain.handle("get-command-history", () => commandHandler.getHistory());
    ipcMain.handle("clear-command-history", () => commandHandler.clearHistory());
    ipcMain.handle("get-command-keyterms", () => getCommandKeyterms());
    ipcMain.handle("get-setting", (_event, key, fallback) => {
      if (!allowedKeys.has(key)) throw new Error("Unsupported setting");
      return db.getSetting(key, fallback);
    });
    ipcMain.handle("set-setting", (_event, key, value) => this._setSetting(key, value));
    ipcMain.handle("get-settings", () => filterSettings(db.getSettings()));
    ipcMain.handle("get-ui-language", () => environment.getUiLanguage());
    ipcMain.handle("save-ui-language", (_event, language) => {
      validateSetting("uiLanguage", language);
      return environment.saveUiLanguage(language);
    });
    ipcMain.handle("db-get-dictionary", () => db.getDictionary());
    ipcMain.handle("db-set-dictionary", (_event, words) => {
      validateWords(words);
      const result = db.setDictionary(words);
      broadcastToWindows("dictionary-updated", db.getDictionary());
      return result;
    });
    ipcMain.handle("db-apply-dictionary-changes", (_event, changes) => {
      if (
        !changes ||
        typeof changes !== "object" ||
        Array.isArray(changes) ||
        Object.keys(changes).some((key) => !["add", "remove"].includes(key))
      )
        throw new Error("Invalid dictionary changes");
      validateWords(changes.add || []);
      validateWords(changes.remove || []);
      const result = db.applyDictionaryChanges(changes);
      broadcastToWindows("dictionary-updated", db.getDictionary());
      return result;
    });
    ipcMain.handle("export-dictionary", async (event, format) => {
      if (!["json", "txt"].includes(format)) throw new Error("Invalid export format");
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        defaultPath: `dictionary.${format}`,
        filters: [
          {
            name: "Dictionary",
            extensions: [format],
          },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      const words = db.getDictionary();
      await fs.writeFile(
        result.filePath,
        format === "json" ? JSON.stringify(words, null, 2) : words.join("\n"),
        "utf8"
      );
      return result.filePath;
    });
    ipcMain.handle("db-get-snippets", () => db.getSnippets());
    ipcMain.handle("db-save-snippets", (_event, snippets) => {
      const result = db.setSnippets(snippets);
      broadcastToWindows("snippets-updated", db.getSnippets());
      return result;
    });
    ipcMain.handle("db-save-transcription", (_event, value, rawText, options) => {
      if (!db.getSetting("dataRetentionEnabled", true))
        return {
          success: true,
          retained: false,
        };
      const result = db.saveTranscription(value, rawText, options);
      db.deleteTranscriptionsExpiredBefore(db.getSetting("transcriptRetentionDays", 30));
      broadcastToWindows("transcription-added", result.transcription);
      return result;
    });
    ipcMain.handle("db-get-transcriptions", (_event, limit, options) =>
      db.getTranscriptions(limit, options)
    );
    ipcMain.handle("db-delete-transcription", (_event, value) => {
      const result = db.deleteTranscription(id(value));
      broadcastToWindows("transcription-deleted", {
        id: value,
      });
      return result;
    });
    ipcMain.handle("db-clear-transcriptions", () => {
      const result = db.clearTranscriptions();
      broadcastToWindows("transcriptions-cleared");
      return result;
    });
    ipcMain.handle("get-transcription-by-id", (_event, value) =>
      db.getTranscriptionById(id(value))
    );
    ipcMain.handle("update-transcription-text", (_event, key, value, rawText) => {
      const result = db.updateTranscriptionText(id(key), value, rawText);
      broadcastToWindows("transcription-updated", {
        id: key,
        text: value,
      });
      return result;
    });
    ipcMain.handle("clear-app-data", (event) => this._clearAppData(event));
    ipcMain.handle("get-gpu-info", async () => {
      try {
        return {
          available: true,
          ...(await app.getGPUInfo("complete")),
        };
      } catch {
        return {
          available: false,
        };
      }
    });
    registerGnaniIpc({
      ipcMain,
      environmentManager: environment,
      databaseManager: db,
    });
    const logHandler = (_event, entry) => {
      if (
        !entry ||
        typeof entry.message !== "string" ||
        entry.message.length > 4096 ||
        JSON.stringify(entry.meta || {}).length > 32768
      )
        throw new Error("Invalid log entry");
      const level = ["error", "warn", "info", "debug"].includes(entry.level)
        ? entry.level
        : "debug";
      debugLogger[level](
        entry.message,
        entry.meta,
        typeof entry.scope === "string" ? entry.scope.slice(0, 64) : undefined
      );
    };
    ipcMain.handle("app-log", logHandler);
    ipcMain.on("app-log", logHandler);
    ipcMain.handle("get-log-level", () => debugLogger.getLevel());
    ipcMain.handle("get-app-version", () => ({
      version: app.getVersion(),
    }));
    ipcMain.handle("open-external", async (_event, url) => {
      if (!require("./navigationGuard").isExternalOpenUrl(url))
        throw new Error("External destination not allowed");
      await shell.openExternal(url);
      return true;
    });
  }
  async _setSetting(key, value) {
    validateSetting(key, value);
    const wm = this.windowManager,
      db = this.databaseManager;
    if (key === "activationMode") {
      const result = await wm.handleActivationModeChanged(value);
      value = wm.getActivationMode();
      db.setSetting(key, value);
      broadcastToWindows("setting-updated", {
        key,
        value,
      });
      return result;
    }
    if (
      key === "dictationKey" &&
      value !== wm.hotkeyManager.getCurrentHotkey() &&
      !(await wm.updateHotkey(value))?.success
    )
      throw new Error("Shortcut registration failed");
    if (key === "commandModeEnabled") return this._setCommandEnabled(value);
    if (key === "commandKey") {
      shortcut(value);
      if (this.environmentManager.getCommandModeEnabled()) {
        const result = await wm.hotkeyManager.registerSlot(
          "command",
          value,
          wm._commandHotkeyCallback,
          {
            atomic: true,
          }
        );
        if (!result?.success) throw new Error("Command shortcut registration failed");
      }
      await this.environmentManager.saveCommandKey(value);
    }
    db.setSetting(key, value);
    if (key === "transcriptRetentionDays") db.deleteTranscriptionsExpiredBefore(value);
    if (key === "floatingIconAutoHide") wm.setFloatingIconAutoHide(value);
    if (key === "startMinimized") await this.environmentManager.saveStartMinimized(value);
    if (key === "panelStartPosition") {
      await this.environmentManager.savePanelStartPosition(value);
      wm.setPanelStartPosition(value);
    }
    broadcastToWindows("setting-updated", {
      key,
      value,
    });
    return true;
  }
  async _setCommandEnabled(enabled) {
    const wm = this.windowManager;
    if (enabled) {
      const result = await wm.hotkeyManager.registerSlot(
        "command",
        this.environmentManager.getCommandKey(),
        wm._commandHotkeyCallback,
        {
          atomic: true,
        }
      );
      if (!result?.success) throw new Error("Command shortcut registration failed");
    } else await wm.hotkeyManager.unregisterSlot("command");
    await this.environmentManager.saveCommandModeEnabled(enabled);
    this.databaseManager.setSetting("commandModeEnabled", enabled);
    broadcastToWindows("setting-updated", {
      key: "commandModeEnabled",
      value: enabled,
    });
    return true;
  }
  async _openOsSettings(kind) {
    const urls =
      process.platform === "win32"
        ? {
            microphone: "ms-settings:privacy-microphone",
            sound: "ms-settings:sound",
            accessibility: "ms-settings:easeofaccess",
          }
        : process.platform === "darwin"
          ? {
              microphone:
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
              sound: "x-apple.systempreferences:com.apple.preference.sound?input",
              accessibility:
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            }
          : {};
    if (!urls[kind])
      return {
        success: false,
        error: "System settings unavailable",
      };
    await shell.openExternal(urls[kind]);
    return {
      success: true,
    };
  }
  async _clearAppData(event) {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
      type: "warning",
      buttons: ["Delete All App Data", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Delete all app data?",
      message:
        "Delete history, dictionary, snippets, settings, cached recordings and your saved API key?",
      detail: "This cannot be undone.",
    });
    if (result.response !== 0)
      return {
        success: false,
        cancelled: true,
      };
    commandHandler.cancelPending();
    commandHandler.clearHistory();
    await handleCancel(event);
    app.isResettingData = true;
    try {
      const windows = BrowserWindow.getAllWindows(),
        sessions = new Set(windows.map((win) => win.webContents.session));
      for (const win of windows) win.destroy();
      this.windowManager.hotkeyManager.unregisterAll();
      this.databaseManager.resetLocalData();
      await this.environmentManager.clearAllPersistedData();
      await this.windowManager.setActivationModeCache(this.environmentManager.getActivationMode());
      this.windowManager.setFloatingIconAutoHide(false);
      this.windowManager.setPanelStartPosition("center");
      for (const session of sessions) await session.clearStorageData();
      this.windowManager.mainWindow = null;
      this.windowManager.controlPanelWindow = null;
      await this.windowManager.createMainWindow();
      await this.windowManager.initializeHotkey();
      await this.windowManager.createControlPanelWindow();
      return {
        success: true,
      };
    } finally {
      app.isResettingData = false;
    }
  }
}
module.exports = IPCHandlers;
