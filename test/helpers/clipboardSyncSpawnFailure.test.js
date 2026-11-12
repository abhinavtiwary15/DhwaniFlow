const test = require("node:test");
const assert = require("node:assert/strict");
const v8 = require("node:v8");
const Module = require("node:module");

const clipboardModulePath = require.resolve("../../src/helpers/clipboard");
const handlersModulePath = require.resolve("../../src/helpers/ipcHandlers");
const originalLoad = Module._load;

test("F35: Synchronous helper spawn exception containment and clipboard restore", async (t) => {
  let fakeClipboardText = "initial clipboard content";
  const fakeClipboard = {
    availableFormats: () => ["text/plain"],
    readText: () => fakeClipboardText,
    writeText: (text) => {
      fakeClipboardText = text;
    },
    readBuffer: () => Buffer.alloc(0),
    write: () => {},
    readImage: () => ({ isEmpty: () => true }),
    writeImage: () => {},
  };

  const handlers = new Map();
  const electronStub = {
    clipboard: fakeClipboard,
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
      on: () => {},
      removeHandler: () => {},
    },
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
    systemPreferences: {
      isTrustedAccessibilityClient: () => true,
      getMediaAccessStatus: () => "granted",
    },
    session: { fromPartition: () => ({}) },
    nativeImage: {},
    globalShortcut: {
      register: () => true,
      unregister: () => undefined,
      isRegistered: () => false,
      unregisterAll: () => undefined,
    },
  };

  const spawnSyncError = () => {
    const err = new Error("spawn UNKNOWN");
    err.code = "UNKNOWN";
    throw err;
  };

  delete require.cache[clipboardModulePath];
  delete require.cache[handlersModulePath];

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "electron") return electronStub;
    if (request === "child_process") {
      const realCp = jestOrRealCp();
      return {
        ...realCp,
        spawn: spawnSyncError,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  function jestOrRealCp() {
    return {
      execSync: () => Buffer.alloc(0),
      spawnSync: () => ({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
    };
  }

  const ClipboardManager = require(clipboardModulePath);
  const IPCHandlers = require(handlersModulePath);

  ClipboardManager.prototype._canAccessUinput = () => true;
  ClipboardManager.prototype._awaitModifierRelease = async () => ({
    state: "released",
    waitedMs: 0,
  });

  const clipboardManager = new ClipboardManager();
  clipboardManager.isDevelopment = false; // test privacy-aware logging
  clipboardManager.resolveWindowsFastPasteBinary = () => "fake-fast-paste.exe";
  clipboardManager.getNircmdPath = () => "fake-nircmd.exe";

  const target = {
    clipboardManager,
  };

  IPCHandlers.prototype.setupHandlers.call(
    new Proxy(target, {
      get: (value, prop) => (prop in value ? value[prop] : () => {}),
    })
  );

  const handler = handlers.get("paste-text");
  assert.ok(handler, "paste-text handler must be registered");

  await t.test(
    "helper spawn throwing synchronously inside timer settles and returns plain serialisable result",
    async () => {
      fakeClipboardText = "important user clipboard data";

      const validEvent = require("./harness/ipc-environment").makeTrustedEvent(electronStub);

      // Call paste-text which triggers delayed fast-paste spawn throwing synchronously
      const result = await handler(validEvent, "transcribed speech to paste", {
        restoreClipboard: true,
      });

      // Must settle cleanly without hanging
      assert.ok(result, "Paste handler must settle with a result");
      assert.equal(result.success, false, "Must report success: false when helper fails");
      assert.equal(result.ok, false, "Must report ok: false");
      assert.equal(result.pasted, false, "Must report pasted: false");
      assert.equal(result.error, "Text could not be pasted");

      // Must be a plain serialisable result (structured clone safe)
      assert.doesNotThrow(() => {
        const serialized = v8.serialize(result);
        const deserialized = v8.deserialize(serialized);
        assert.equal(deserialized.success, false);
        assert.equal(deserialized.pasted, false);
      }, "Result must be structured-clone safe");

      // Verify original clipboard content was safely restored
      assert.equal(
        fakeClipboardText,
        "important user clipboard data",
        "Original clipboard content must be restored after helper spawn failure"
      );
    }
  );

  Module._load = originalLoad;
});
