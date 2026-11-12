const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { EventEmitter } = require("node:events");

function makeTrustedEvent(electron) {
  const root = path.resolve(__dirname, "../../..");
  electron.app.getAppPath = () => root;
  const frame = { parent: null, url: pathToFileURL(path.join(root, "src/dist/index.html")).href };
  const sender = { mainFrame: frame };
  const owner = { webContents: sender, isDestroyed: () => false };
  electron.BrowserWindow.fromWebContents = (candidate) => (candidate === sender ? owner : null);
  return { sender, senderFrame: frame };
}

function installIpcEnvironment() {
  const root = path.resolve(__dirname, "../../..");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dhwaniflow-ipc-test-"));
  const handlers = new Map(),
    events = new EventEmitter(),
    rendererEvents = new EventEmitter();
  const frame = { parent: null, url: pathToFileURL(path.join(root, "src/dist/index.html")).href };
  const sender = {
    mainFrame: frame,
    send: (channel, ...args) => rendererEvents.emit(channel, {}, ...args),
    session: { clearStorageData: async () => {} },
  };
  const owner = {
    webContents: sender,
    isDestroyed: () => false,
    minimize() {
      this.minimized = true;
    },
    maximize() {
      this.maximized = true;
    },
    unmaximize() {
      this.maximized = false;
    },
    isMaximized() {
      return !!this.maximized;
    },
    close() {
      this.closed = true;
    },
    hide() {
      this.hidden = true;
    },
    destroy() {
      this.destroyed = true;
    },
  };
  let clipboardText = "";
  const electron = {
    app: {
      isPackaged: false,
      getAppPath: () => root,
      getPath: () => profile,
      getName: () => "DhwaniFlow",
      getVersion: () => "test",
      on() {},
      getGPUInfo: async () => ({ gpuDevice: [] }),
    },
    BrowserWindow: {
      fromWebContents: (candidate) => (candidate === sender ? owner : null),
      getAllWindows: () => [owner],
    },
    ipcMain: {
      handle: (channel, callback) => {
        if (handlers.has(channel)) throw new Error("Duplicate IPC registration");
        handlers.set(channel, callback);
      },
      on: events.on.bind(events),
    },
    clipboard: {
      writeText: (value) => {
        clipboardText = value;
      },
      readText: () => clipboardText,
    },
    shell: {
      openExternal: async () => {
        throw new Error("External service is forbidden in tests");
      },
    },
    dialog: {
      showSaveDialog: async () => ({ canceled: true }),
      showMessageBox: async () => ({ response: 1 }),
    },
    systemPreferences: {},
  };
  const previousLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return electron;
    return previousLoad.call(this, request, parent, isMain);
  };
  const event = { sender, senderFrame: frame };
  return {
    electron,
    event,
    owner,
    profile,
    handlers,
    events,
    rendererEvents,
    restore() {
      Module._load = previousLoad;
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}
module.exports = { makeTrustedEvent, installIpcEnvironment };
