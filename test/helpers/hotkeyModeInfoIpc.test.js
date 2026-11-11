const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const handlersModulePath = require.resolve("../../src/helpers/ipcHandlers");
const originalLoad = Module._load;
const handlers = new Map();
const sendListeners = new Map();

const electronStub = {
  app: {
    getPath: () => "/tmp",
    getName: () => "test",
    getVersion: () => "0.0.0",
    isPackaged: false,
    on: () => {},
    requestSingleInstanceLock: () => true,
  },
  ipcMain: {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, listener) => sendListeners.set(channel, listener),
    removeHandler: () => {},
  },
  net: { fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) },
  BrowserWindow: class BrowserWindow {
    static getAllWindows() {
      return [];
    }
    static fromWebContents() {
      return null;
    }
  },
  shell: {},
  dialog: {},
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 0, height: 0 } }) },
  systemPreferences: { getMediaAccessStatus: () => "granted" },
  session: { fromPartition: () => ({}) },
  clipboard: {},
  nativeImage: {},
  globalShortcut: {
    register: () => true,
    unregister: () => undefined,
    isRegistered: () => false,
    unregisterAll: () => undefined,
  },
  utilityProcess: {},
  MessageChannelMain: class {},
};

Module._load = function loadWithMocks(request, parent, isMain) {
  if (request === "electron") return electronStub;
  if (
    parent?.filename === handlersModulePath &&
    (request.startsWith("./") || request.startsWith("../"))
  ) {
    return anything();
  }
  return originalLoad.call(this, request, parent, isMain);
};

function anything() {
  return new Proxy(function () {}, {
    get: (_target, property) => {
      if (property === Symbol.toPrimitive || property === "toString") return () => "";
      if (property === "then") return undefined;
      return anything();
    },
    apply: () => anything(),
  });
}

const HotkeyManager = require("../../src/helpers/hotkeyManager");

let hotkeyManager;
let mockWindowManager;
let mockEnvironmentManager;

test.before(() => {
  delete require.cache[handlersModulePath];
  const IPCHandlers = require(handlersModulePath);

  hotkeyManager = new HotkeyManager();
  mockWindowManager = {
    hotkeyManager,
    _activationMode: "tap",
    getActivationMode() {
      return this._activationMode;
    },
    async setActivationModeCache(mode) {
      this._activationMode = mode;
      return true;
    },
    isUsingGnomeHotkeys: () => hotkeyManager.isUsingGnome(),
    isUsingHyprlandHotkeys: () => hotkeyManager.isUsingHyprland(),
    isUsingKDEHotkeys: () => hotkeyManager.isUsingKDE(),
    isUsingNativeShortcutHotkeys: () => hotkeyManager.isUsingNativeShortcut(),
    getHyprlandConfigStatus: () => ({ canWrite: true, path: "/mock/config" }),
    updateHotkeyCalls: [],
    async updateHotkey(hotkey) {
      this.updateHotkeyCalls.push(hotkey);
      return { success: true, hotkey };
    },
    cancelSlotRegistered: false,
    async registerCancelHotkey(key) {
      this.cancelSlotRegistered = true;
      return hotkeyManager.registerSlot("cancel", key, () => {});
    },
    unregisterCancelHotkey() {
      this.cancelSlotRegistered = false;
      hotkeyManager.unregisterSlot("cancel");
      return { success: true };
    },
    hotkeyChangedCalls: [],
    handleHotkeyChanged(hotkey) {
      this.hotkeyChangedCalls.push(hotkey);
    },
    activationModeChangedCalls: [],
    async handleActivationModeChanged(mode) {
      this.activationModeChangedCalls.push(mode);
      return this.setActivationModeCache(mode);
    },
    listeningModeEnabled: false,
    setHotkeyListeningMode(enabled) {
      this.listeningModeEnabled = enabled;
      return true;
    },
  };

  mockEnvironmentManager = {
    getHotkey: () => "Control+Space",
    setHotkey: () => true,
    getActivationMode: () => "push",
    saveActivationMode: () => true,
  };

  const target = {
    windowManager: mockWindowManager,
    environmentManager: mockEnvironmentManager,
  };

  IPCHandlers.prototype.setupHandlers.call(
    new Proxy(target, {
      get: (value, property) => (property in value ? value[property] : anything()),
    })
  );
});

test.after(() => {
  Module._load = originalLoad;
});

test("get-hotkey-mode-info returns populated info object", async () => {
  const handler = handlers.get("get-hotkey-mode-info");
  assert.ok(handler, "get-hotkey-mode-info handler must be registered");

  const info = await handler({}, "Control+Space");
  assert.equal(typeof info.supportsPushToTalk, "boolean");
  assert.equal(typeof info.isUsingNativeShortcut, "boolean");
  assert.equal(typeof info.isUsingGnome, "boolean");
  assert.equal(typeof info.isUsingHyprland, "boolean");
  assert.equal(typeof info.isUsingKDE, "boolean");
});

test("get-activation-mode reads windowManager mode in effect", async () => {
  const handler = handlers.get("get-activation-mode");
  assert.ok(handler);

  mockWindowManager._activationMode = "tap";
  assert.equal(await handler({}), "tap");

  mockWindowManager._activationMode = "push";
  assert.equal(await handler({}), "push");
});

test("activation-mode-changed forwards to windowManager.handleActivationModeChanged", async () => {
  const listener = sendListeners.get("activation-mode-changed");
  assert.ok(listener, "activation-mode-changed listener must be registered");

  listener({}, "push");
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(mockWindowManager.activationModeChangedCalls.includes("push"));
});

test("hotkey-changed notifies windowManager.handleHotkeyChanged", async () => {
  const listener = sendListeners.get("hotkey-changed");
  assert.ok(listener, "hotkey-changed listener must be registered");

  listener({}, "CommandOrControl+Shift+Space");
  assert.ok(mockWindowManager.hotkeyChangedCalls.includes("CommandOrControl+Shift+Space"));
});

test("register-hotkey and update-hotkey invoke windowManager.updateHotkey", async () => {
  const regHandler = handlers.get("register-hotkey");
  const updateHandler = handlers.get("update-hotkey");
  assert.ok(regHandler);
  assert.ok(updateHandler);

  const res1 = await regHandler({}, "Control+Shift+K");
  assert.equal(res1, true);

  const res2 = await updateHandler({}, "Control+Alt+D");
  assert.equal(res2.success, true);
  assert.ok(mockWindowManager.updateHotkeyCalls.includes("Control+Shift+K"));
  assert.ok(mockWindowManager.updateHotkeyCalls.includes("Control+Alt+D"));
});

test("unregister-hotkey unregisters dictation slot", async () => {
  const unregHandler = handlers.get("unregister-hotkey");
  assert.ok(unregHandler);

  const res = await unregHandler({});
  assert.equal(res, true);
});

test("get-registered-hotkey returns current hotkey", async () => {
  const handler = handlers.get("get-registered-hotkey");
  assert.ok(handler);

  hotkeyManager.slots.set("dictation", { hotkeys: ["Control+Space"], accelerators: [] });
  const key = await handler({});
  assert.equal(key, "Control+Space");
});

test("register-cancel-hotkey and unregister-cancel-hotkey manage cancel slot", async () => {
  const regCancel = handlers.get("register-cancel-hotkey");
  const unregCancel = handlers.get("unregister-cancel-hotkey");
  assert.ok(regCancel);
  assert.ok(unregCancel);

  const regRes = await regCancel({}, "Escape");
  assert.ok(regRes);
  assert.equal(mockWindowManager.cancelSlotRegistered, true);

  const unregRes = await unregCancel({});
  assert.equal(unregRes.success, true);
  assert.equal(mockWindowManager.cancelSlotRegistered, false);
});

test("set-hotkey-listening-mode forwards to windowManager", async () => {
  const handler = handlers.get("set-hotkey-listening-mode");
  assert.ok(handler);

  await handler({}, true);
  assert.equal(mockWindowManager.listeningModeEnabled, true);

  await handler({}, false);
  assert.equal(mockWindowManager.listeningModeEnabled, false);
});
