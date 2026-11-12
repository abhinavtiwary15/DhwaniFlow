const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  v8 = require("node:v8");
const { installIpcEnvironment } = require("./harness/ipc-environment");
const { SqliteAdapter } = require("./harness/sqlite-adapter");
const fixture = installIpcEnvironment();
const DatabaseManager = require("../../src/helpers/database");
const IPCHandlers = require("../../src/helpers/ipcHandlers");
const db = new DatabaseManager({ DatabaseClass: SqliteAdapter, userData: fixture.profile });
const manager = { mainWindow: fixture.owner };
const delivery = { pasted: true, method: "test-os-boundary", restoreComplete: Promise.resolve() };
const environment = {};
new IPCHandlers({
  databaseManager: db,
  windowManager: manager,
  environmentManager: environment,
  clipboardManager: { pasteText: async () => delivery },
});
let api;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../preload.js"), "utf8"), {
  process: { platform: process.platform },
  require: () => ({
    contextBridge: {
      exposeInMainWorld: (_name, value) => {
        api = value;
      },
    },
    ipcRenderer: {
      invoke: async (channel, ...args) => fixture.handlers.get(channel)(fixture.event, ...args),
      send: (channel, ...args) => fixture.events.emit(channel, fixture.event, ...args),
      on: fixture.rendererEvents.on.bind(fixture.rendererEvents),
      removeListener: fixture.rendererEvents.removeListener.bind(fixture.rendererEvents),
    },
  }),
});
test.after(() => {
  db.cleanup();
  fixture.restore();
});

test("real preload→handler→SQLite dictionary replace/add/delete preserves restart data", async () => {
  await api.setDictionary(["React", "Electron"]);
  await api.addDictionaryEntries([{ word: "Prisma" }]);
  await api.deleteDictionaryEntry("React");
  assert.deepEqual(await api.getDictionary(), ["Electron", "Prisma"]);
  await api.setDictionary(["Prisma"]);
  assert.deepEqual(await api.getDictionary(), ["Prisma"]);
  const reopened = new DatabaseManager({ DatabaseClass: SqliteAdapter, userData: fixture.profile });
  try {
    assert.deepEqual(reopened.getDictionary(), ["Prisma"]);
  } finally {
    reopened.cleanup();
  }
});
test("real bridge keeps failed history metadata, raw text and client ID", async () => {
  const saved = await api.saveTranscription("kept words", "raw words", {
    status: "failed",
    errorMessage: "Local fake failed",
    errorCode: "TEST",
    clientTranscriptionId: "client-id",
  });
  const row = await api.getTranscriptionById(saved.id);
  assert.equal(row.raw_text, "raw words");
  assert.equal(row.status, "failed");
  assert.equal(row.error_message, "Local fake failed");
  assert.equal(row.error_code, "TEST");
  assert.equal(row.client_transcription_id, "client-id");
  await api.updateTranscriptionText(saved.id, "edited", "edited raw");
  assert.equal((await api.getTranscriptionById(saved.id)).raw_text, "edited raw");
  await api.deleteTranscription(saved.id);
  assert.equal(await api.getTranscriptionById(saved.id), null);
});
test("snippets save/edit/delete persists through actual SQLite", async () => {
  await api.setSnippets([{ trigger: "brb", replacement: "be right back" }]);
  assert.equal((await api.getSnippets())[0].replacement, "be right back");
  await api.setSnippets([{ trigger: "brb", replacement: "back soon" }]);
  assert.equal((await api.getSnippets())[0].replacement, "back soon");
  await api.setSnippets([]);
  assert.deepEqual(await api.getSnippets(), []);
});
test("window methods reach the sender's actual native-window boundary", async () => {
  await api.windowMinimize();
  assert.equal(fixture.owner.minimized, true);
  await api.windowMaximize();
  assert.equal(await api.windowIsMaximized(), true);
  await api.windowMaximize();
  assert.equal(await api.windowIsMaximized(), false);
  await api.hideWindow();
  assert.equal(fixture.owner.hidden, true);
  await api.windowClose();
  assert.equal(fixture.owner.closed, true);
});
test("all registered invokes reject absent, foreign and child-frame senders", async () => {
  for (const callback of fixture.handlers.values()) {
    assert.throws(() => callback(null), /IPC request rejected/);
    assert.throws(
      () =>
        callback({ sender: {}, senderFrame: { parent: null, url: fixture.event.senderFrame.url } }),
      /IPC request rejected/
    );
    assert.throws(
      () =>
        callback({ ...fixture.event, senderFrame: { ...fixture.event.senderFrame, parent: {} } }),
      /IPC request rejected/
    );
  }
});
test("strict settings and payload validation cannot save credentials or spoof words", async () => {
  await assert.rejects(
    api.setSetting("gnaniApiKey", "not-a-real-credential"),
    /Unsupported setting/
  );
  await assert.rejects(api.setSetting("startMinimized", "true"), /boolean/);
  await assert.rejects(
    api.applyDictionaryChanges({ added: ["wrong-shape"] }),
    /Invalid dictionary/
  );
  await assert.rejects(
    api.setSnippets([{ trigger: "x".repeat(101), replacement: "x" }]),
    /Invalid snippets/
  );
});
test("paste returns a structured-clone-safe DTO after restore completes", async () => {
  let completed = false;
  delivery.restoreComplete = Promise.resolve().then(() => {
    completed = true;
  });
  const result = await api.pasteText("synthetic words", { restoreClipboard: true });
  assert.equal(completed, true);
  assert.equal(result.pasted, true);
  assert.doesNotThrow(() => v8.serialize(result));
});
test("history privacy and expiry operate in the production database", async () => {
  await api.setSetting("dataRetentionEnabled", false);
  const before = (await api.getTranscriptions()).length;
  await api.saveTranscription("must not be retained", null, { status: "completed" });
  assert.equal((await api.getTranscriptions()).length, before);
  await api.setSetting("dataRetentionEnabled", true);
  const row = db.saveTranscription("old", null, { analyticsOccurredAt: "2000-01-01T00:00:00Z" });
  db.deleteTranscriptionsExpiredBefore(7);
  assert.equal(db.getTranscriptionById(row.id), null);
});
test("data reset clears every database table and retained store", () => {
  db.setDictionary(["private vocabulary"]);
  db.setSnippets([{ trigger: "xx", replacement: "private snippet" }]);
  db.setSetting("startMinimized", true);
  db.resetLocalData();
  assert.deepEqual(db.getDictionary(), []);
  assert.deepEqual(db.getSnippets(), []);
  assert.deepEqual(db.getSettings(), {});
  assert.deepEqual(db.getTranscriptions(), []);
});

test("onboarding IPC changes the real gate boundary only for the owned frame", async () => {
  manager.setOnboardingActive = (value) => {
    manager.onboardingActive = value;
  };
  await api.setOnboardingActive(true);
  assert.equal(manager.onboardingActive, true);
  await api.setOnboardingActive(false);
  assert.equal(manager.onboardingActive, false);
  await assert.rejects(api.setOnboardingActive("false"), /boolean/);
});

test("hotkey bridge preserves registration failure, effective mode and cancellation", async () => {
  let registered = "Control+Space",
    cancelled = false;
  manager.hotkeyManager = {
    getCurrentHotkey: () => registered,
    unregisterSlot: async () => {
      registered = null;
      return true;
    },
  };
  manager.updateHotkey = async (key) =>
    key === "Control+F10" ? ((registered = key), { success: true }) : { success: false };
  manager.getActivationMode = () => "tap";
  manager.getHotkeyModeInfo = () => ({ activationMode: "tap", supported: true });
  manager.registerCancelHotkey = async () => {
    cancelled = true;
    return { success: true };
  };
  manager.unregisterCancelHotkey = () => {
    cancelled = false;
    return { success: true };
  };
  assert.equal(await api.registerHotkey("Control+F10"), true);
  assert.equal(await api.getRegisteredHotkey(), "Control+F10");
  assert.equal(await api.registerHotkey("Control+F11"), false);
  assert.equal(await api.getRegisteredHotkey(), "Control+F10");
  assert.equal(await api.getActivationMode(), "tap");
  await api.registerCancelHotkey("Escape");
  assert.equal(cancelled, true);
  await api.unregisterCancelHotkey();
  assert.equal(cancelled, false);
  await api.unregisterHotkey();
  assert.equal(await api.getRegisteredHotkey(), null);
});

test("confirmed reset clears data and active command shortcuts before recreating windows", async () => {
  let registered = true,
    cleared = false,
    mode;
  fixture.electron.dialog.showMessageBox = async () => ({ response: 0 });
  manager.hotkeyManager = {
    unregisterAll() {
      registered = false;
    },
  };
  manager.setActivationModeCache = async (value) => {
    mode = value;
  };
  manager.initializeHotkey = async () => {};
  manager.setFloatingIconAutoHide = () => {};
  manager.setPanelStartPosition = () => {};
  manager.createMainWindow = async () => {};
  manager.createControlPanelWindow = async () => {};
  environment.clearAllPersistedData = async () => {
    cleared = true;
  };
  environment.getActivationMode = () => "push";
  db.setDictionary(["synthetic reset"]);
  assert.equal((await api.clearAppData()).success, true);
  assert.equal(registered, false);
  assert.equal(cleared, true);
  assert.equal(mode, "push");
  assert.deepEqual(db.getDictionary(), []);
  assert.equal(fixture.electron.app.isResettingData, false);
});
