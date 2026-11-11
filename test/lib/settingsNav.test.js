const test = require("node:test");
const assert = require("node:assert/strict");

// Since src/lib/settingsNav.ts is TypeScript, import or replicate the pure logic
// or use tsx if running with node --import tsx.
// Let's test the navigation entries and resolver.
const {
  buildSettingsNav,
  resolveSettingsSection,
} = require("../../src/lib/settingsNav.ts");

test("buildSettingsNav returns all active navigation sections including about", () => {
  const nav = buildSettingsNav();
  const ids = nav.map((n) => n.id);

  assert.deepEqual(ids, [
    "general",
    "hotkeys",
    "speechToText",
    "privacyData",
    "system",
    "about",
  ]);

  const aboutEntry = nav.find((n) => n.id === "about");
  assert.ok(aboutEntry);
  assert.equal(aboutEntry.group, "system");
});

test("resolveSettingsSection handles direct section, aliases, and unknown fallback", () => {
  const nav = buildSettingsNav();

  // Direct matches
  assert.equal(resolveSettingsSection("general", nav), "general");
  assert.equal(resolveSettingsSection("about", nav), "about");
  assert.equal(resolveSettingsSection("speechToText", nav), "speechToText");

  // Aliases
  assert.equal(resolveSettingsSection("speech", nav), "speechToText");
  assert.equal(resolveSettingsSection("audio", nav), "speechToText");
  assert.equal(resolveSettingsSection("transcription", nav), "speechToText");
  assert.equal(resolveSettingsSection("hotkey", nav), "hotkeys");
  assert.equal(resolveSettingsSection("privacy", nav), "privacyData");
  assert.equal(resolveSettingsSection("permissions", nav), "privacyData");
  assert.equal(resolveSettingsSection("developer", nav), "system");

  // Undefined or unknown fallback
  assert.equal(resolveSettingsSection(undefined, nav), "general");
  assert.equal(resolveSettingsSection("unknown-section", nav), "general");
});
