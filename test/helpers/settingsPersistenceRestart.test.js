const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const fixture = require("./harness/ipc-environment").installIpcEnvironment();
const { SqliteAdapter } = require("./harness/sqlite-adapter");
const DatabaseManager = require("../../src/helpers/database");
test.after(() => fixture.restore());
test("production settings SQL survives close and restart without an ABI-dependent skip", () => {
  const options = { DatabaseClass: SqliteAdapter, userData: fixture.profile };
  const first = new DatabaseManager(options);
  const expected = {
    autoPasteEnabled: false,
    gnaniLanguage: "en-IN",
    startMinimized: true,
    panelStartPosition: "center",
  };
  for (const [key, value] of Object.entries(expected)) first.setSetting(key, value);
  first.cleanup();
  const second = new DatabaseManager(options);
  try {
    for (const [key, value] of Object.entries(expected))
      assert.equal(second.getSetting(key), value);
  } finally {
    second.cleanup();
  }
});
test("deleted auto-learn control is absent and documented", () => {
  assert.equal(
    fs
      .readFileSync(path.join(__dirname, "../../src/components/SettingsPage.tsx"), "utf8")
      .includes("settings.autoLearnCorrections"),
    false
  );
  assert.match(
    fs.readFileSync(path.join(__dirname, "../../docs/known-gaps.md"), "utf8"),
    /auto-learn corrections/i
  );
});
