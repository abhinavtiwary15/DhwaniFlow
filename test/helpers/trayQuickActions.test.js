const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function loadTrayWithStubs(request, parent, isMain) {
  if (request === "electron") return { Tray: class {}, Menu: {}, nativeImage: {}, app: {} };
  if (request === "./debugLogger") return { info: () => undefined, debug: () => undefined };
  if (request === "./dockManager") return {};
  if (request === "./i18nMain") return { i18nMain: { t: (key) => key } };
  return originalLoad.call(this, request, parent, isMain);
};
const TrayManager = require("../../src/helpers/tray");
Module._load = originalLoad;

function createTrayManager(calls, { dictating = false, meetingRefusal = null } = {}) {
  const trayManager = new TrayManager();
  trayManager.windowManager = {
    isDictationPanelVisible: () => false,
    isDictating: () => dictating,
    sendStartDictation: () => calls.push("start-dictation"),
    sendStopDictation: () => calls.push("stop-dictation"),
    sendOpenAssistantPanel: () => calls.push("assistant"),
    startManualMeeting: () => calls.push("meeting"),
    getMeetingRecordingRefusal: () => meetingRefusal,
  };
  return trayManager;
}

test("the tray exposes listening and no retired actions", () => {
  const calls = [],
    menu = createTrayManager(calls);
  const items = menu.buildContextMenuTemplate();
  assert.equal(items[0].label, "app.commandMenu.startListening");
  assert.equal(items[1].type, "separator");
  assert.equal(
    items.some((item) => /assistant|meeting/i.test(item.label || "")),
    false
  );
  items[0].click();
  assert.deepEqual(calls, ["start-dictation"]);
});

test("the tray's listen item stops the recording it reflects", () => {
  const calls = [];
  const [listen] = createTrayManager(calls, { dictating: true }).buildContextMenuTemplate();

  assert.equal(listen.label, "app.commandMenu.stopListening");
  listen.click();
  assert.deepEqual(calls, ["stop-dictation"]);
});
