const { parseCommand } = require("./index");
const { executeAction } = require("./executor");
const COUNTDOWN_MS = 800,
  OVERLAY_DISMISS_MS = 1200;
class CommandHandler {
  constructor({ execute = executeAction } = {}) {
    this.execute = execute;
    this.history = [];
    this.pending = null;
    this.historyEnabled = () => true;
    this.pasteOptions = () => ({});
  }
  setDependencies({ windowManager, clipboardManager, historyEnabled, pasteOptions }) {
    this.windowManager = windowManager;
    this.clipboardManager = clipboardManager;
    if (historyEnabled) this.historyEnabled = historyEnabled;
    if (pasteOptions) this.pasteOptions = pasteOptions;
  }
  getHistory() {
    if (!this.historyEnabled()) this.history = [];
    return this.history.slice();
  }
  clearHistory() {
    this.history = [];
    return { success: true };
  }
  _remember(entry) {
    if (!this.historyEnabled()) {
      this.history = [];
      return;
    }
    this.history.unshift({ id: Date.now() + Math.random(), timestamp: Date.now(), ...entry });
    this.history.length = Math.min(50, this.history.length);
  }
  _notifyOverlay(payload) {
    clearTimeout(this.dismissTimer);
    const win = this.windowManager?.mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send("command-overlay-update", payload);
  }
  _dismissAfter(ms) {
    clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this._notifyOverlay(null), ms);
  }
  cancelPending() {
    const pending = this.pending;
    if (!pending) return false;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.controller.abort();
    pending.resolve({ success: true, cancelled: true });
    this._notifyOverlay({ state: "cancelled", text: "cancelled" });
    this._dismissAfter(800);
    return true;
  }
  async handleTranscript(transcript) {
    if (typeof transcript !== "string" || !transcript.trim() || transcript.length > 5000)
      return { unknown: true };
    this.cancelPending();
    const raw = transcript.trim(),
      parsed = parseCommand(raw);
    if (parsed.blocked || parsed.unknown) {
      const state = parsed.blocked ? "blocked" : "unknown";
      this._notifyOverlay({ state, text: parsed.blocked ? "blocked" : "samajh nahi aaya" });
      this._dismissAfter(OVERLAY_DISMISS_MS);
      this._remember({ text: raw, status: state, reason: parsed.reason });
      return parsed;
    }
    if (parsed.commandId === "cancel") {
      this._remember({ text: raw, commandId: "cancel", status: "cancelled" });
      this._notifyOverlay({ state: "cancelled", text: "cancelled" });
      this._dismissAfter(800);
      return { success: true, cancelled: true };
    }
    this._notifyOverlay({
      state: "confirming",
      text: `heard: ${raw} → ${this._formatActionLabel(parsed)}`,
      durationMs: COUNTDOWN_MS,
    });
    return new Promise((resolve) => {
      const controller = new AbortController(),
        pending = { resolve, controller, timer: null };
      this.pending = pending;
      pending.timer = setTimeout(async () => {
        const timeout = setTimeout(() => controller.abort(), 6000);
        const cancelled = new Promise((done) =>
          controller.signal.addEventListener(
            "abort",
            () =>
              done({ success: false, cancelled: true, error: "Command cancelled or timed out" }),
            { once: true }
          )
        );
        let result;
        try {
          result = await Promise.race([
            this.execute(
              { commandId: parsed.commandId, params: parsed.params },
              {
                clipboardManager: this.clipboardManager,
                pasteOptions: this.pasteOptions(),
                signal: controller.signal,
              }
            ),
            cancelled,
          ]);
        } catch {
          result = { success: false, error: "Command execution failed" };
        } finally {
          clearTimeout(timeout);
        }
        if (this.pending !== pending) return;
        this.pending = null;
        this._remember({
          text: raw,
          commandId: parsed.commandId,
          status: result.success ? "executed" : "failed",
          error: result.error,
        });
        this._notifyOverlay(null);
        resolve(result);
      }, COUNTDOWN_MS);
    });
  }
  _formatActionLabel(result) {
    const values = Object.values(result.params || {});
    return (
      result.commandId +
      (result.commandId !== "type_text" && values.length ? `(${values.join(", ")})` : "")
    );
  }
}
const commandHandler = new CommandHandler();
module.exports = { CommandHandler, commandHandler, COUNTDOWN_MS, OVERLAY_DISMISS_MS };
