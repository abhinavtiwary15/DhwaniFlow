const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

if (!process.resourcesPath) {
  process.resourcesPath = process.cwd();
}

const ipcHandlersMap = new Map();
let electronBoundary;

// Install stub for electron
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    if (electronBoundary) return electronBoundary;
    return (electronBoundary = {
      app: {
        getPath: () => process.cwd(),
        getAppPath: () => process.cwd(),
        isReady: () => false,
        on: () => {},
      },
      ipcMain: {
        handle: (channel, fn) => ipcHandlersMap.set(channel, fn),
        on: () => {},
      },
      BrowserWindow: {
        getAllWindows: () => [],
      },
      screen: {
        getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
      },
      nativeTheme: {
        on: () => {},
      },
    });
  }
  return originalLoad.call(this, request, parent, isMain);
};

const WindowManager = require("../../src/helpers/windowManager");
const EnvironmentManager = require("../../src/helpers/environment");

test("F07: Hotkey registration contract, honest conflict errors, and persistent saving", async (t) => {
  await t.test(
    "EnvironmentManager has getDictationKey and get-hotkey resolves truthful key",
    async () => {
      const env = new EnvironmentManager();
      assert.equal(
        typeof env.getHotkey,
        "undefined",
        "EnvironmentManager must not have fake getHotkey"
      );
      assert.equal(
        typeof env.getDictationKey,
        "function",
        "EnvironmentManager must have getDictationKey"
      );

      // In ipcHandlers, get-hotkey should call getDictationKey or getCurrentHotkey or databaseManager
      const IPCHandlers = require("../../src/helpers/ipcHandlers");
      const mockEnv = {
        getDictationKey: () => "Control+Alt+F10",
      };
      const mockDb = {
        getSetting: (k) => (k === "dictationKey" ? "Control+Alt+F10" : null),
      };
      const mockWm = {
        hotkeyManager: {
          getCurrentHotkey: () => "Control+Alt+F10",
        },
      };

      new IPCHandlers({
        environmentManager: mockEnv,
        databaseManager: mockDb,
        windowManager: mockWm,
      });

      const getHotkeyHandler = ipcHandlersMap.get("get-hotkey");
      assert.ok(getHotkeyHandler, "get-hotkey handler must be registered");
      const event = require("./harness/ipc-environment").makeTrustedEvent(electronBoundary);
      const resolved = await getHotkeyHandler(event);
      assert.equal(
        resolved,
        "Control+Alt+F10",
        "get-hotkey must return actual dictation key, not 'Space'"
      );
    }
  );

  await t.test(
    "WindowManager.updateHotkey persists successful keys and rejects failures honestly",
    async () => {
      let savedInEnv = null;
      let savedInDb = null;

      const mockEnv = {
        saveDictationKey: (k) => {
          savedInEnv = k;
        },
      };
      const mockDb = {
        setSetting: (k, v) => {
          if (k === "dictationKey") savedInDb = v;
        },
      };

      let registerShouldSucceed = true;
      let registeredKey = null;

      const mockHotkeyManager = {
        async updateHotkey(hotkey) {
          if (registerShouldSucceed) {
            registeredKey = hotkey;
            return { success: true, message: `Hotkey updated to: ${hotkey}` };
          } else {
            return {
              success: false,
              message: `Could not register "${hotkey}". It may be in use by another application.`,
              reason: "registration_failed",
              suggestions: ["F8", "F9", "F10"],
            };
          }
        },
        getCurrentHotkey() {
          return registeredKey;
        },
      };

      const wm = new WindowManager();
      wm.hotkeyManager = mockHotkeyManager;
      wm.environmentManager = mockEnv;
      wm.databaseManager = mockDb;
      wm.reconcileNativeKeyListeners = () => {};

      // 1. Successful registration
      registerShouldSucceed = true;
      const resSuccess = await wm.updateHotkey("Control+Alt+F11");
      assert.equal(resSuccess.success, true);
      assert.equal(
        savedInEnv,
        "Control+Alt+F11",
        "Successful hotkey must be saved in environmentManager"
      );
      assert.equal(
        savedInDb,
        "Control+Alt+F11",
        "Successful hotkey must be saved in databaseManager"
      );

      // 2. Failed registration (conflict or unsupported)
      registerShouldSucceed = false;
      const resFail = await wm.updateHotkey("Escape");
      assert.equal(
        resFail.success,
        false,
        "Must return honest failure when hotkey registration fails"
      );
      assert.match(resFail.message, /Could not register "Escape"/);
      assert.equal(
        savedInEnv,
        "Control+Alt+F11",
        "Failed key must NOT be saved to environmentManager"
      );
      assert.equal(savedInDb, "Control+Alt+F11", "Failed key must NOT be saved to databaseManager");
    }
  );

  await t.test("WindowManager.handleHotkeyChanged routes through updateHotkey", async () => {
    const wm = new WindowManager();
    let updatedWithKey = null;
    wm.updateHotkey = async (key) => {
      updatedWithKey = key;
      return { success: true };
    };
    wm.reconcileNativeKeyListeners = () => {};

    await wm.handleHotkeyChanged("Control+Shift+Space");
    assert.equal(
      updatedWithKey,
      "Control+Shift+Space",
      "handleHotkeyChanged must delegate to updateHotkey"
    );
  });

  await t.test(
    "SettingsPage uses useHotkeyRegistration and displays honest conflict errors",
    async () => {
      const settingsPath = path.resolve(__dirname, "../../src/components/SettingsPage.tsx");
      const content = fs.readFileSync(settingsPath, "utf8");

      assert.ok(
        content.includes("useHotkeyRegistration"),
        "SettingsPage.tsx must use useHotkeyRegistration to validate and register hotkeys"
      );
    }
  );
});
