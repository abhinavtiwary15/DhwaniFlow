const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

test("F39: release-check.mjs refuses to run and fails when file inventory is empty", async () => {
  const scriptPath = path.resolve(__dirname, "../../scripts/release-check.mjs");
  const tmpEmptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-empty-release-"));

  try {
    // Run release-check in an empty directory without git tracked files
    const res = spawnSync(process.execPath, [scriptPath], {
      cwd: tmpEmptyDir,
      encoding: "utf8",
    });

    assert.notEqual(res.status, 0, "release-check must exit with non-zero code on empty file inventory");
    assert.match(
      res.stdout + res.stderr,
      /empty|no files/i,
      "release-check output must report failure due to empty inventory"
    );
  } finally {
    try {
      fs.rmSync(tmpEmptyDir, { recursive: true, force: true });
    } catch {}
  }
});
