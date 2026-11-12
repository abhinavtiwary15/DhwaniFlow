"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  executeAction,
  buildAppIndex,
  resolveApp,
  isGrammarActionAllowed,
  resetRateLimitForTesting,
  COOLDOWN_MS,
} = require("../../../src/helpers/commands/executor");

test("executor: grammar action validation", () => {
  // Allowed actions and params
  assert.equal(isGrammarActionAllowed("press", { key: "enter" }), true);
  assert.equal(isGrammarActionAllowed("press", { key: "escape" }), true);
  assert.equal(isGrammarActionAllowed("scroll", { direction: "up" }), true);
  assert.equal(isGrammarActionAllowed("volume", { action: "mute" }), true);
  assert.equal(isGrammarActionAllowed("snap", { side: "left" }), true);
  assert.equal(isGrammarActionAllowed("screenshot", {}), true);

  // Disallowed actions or params
  assert.equal(isGrammarActionAllowed("press", { key: "f12" }), false);
  assert.equal(isGrammarActionAllowed("scroll", { direction: "diagonal" }), false);
  assert.equal(isGrammarActionAllowed("snap", { side: "center" }), false);
  assert.equal(isGrammarActionAllowed("format_disk", {}), false);
  assert.equal(isGrammarActionAllowed("delete_files", {}), false);
});

test("executor: Start Menu and built-in app resolution", () => {
  const index = buildAppIndex();
  assert.ok(index.size > 0, "App index must contain entries");

  const notepad = resolveApp("notepad");
  assert.ok(notepad, "notepad must be resolved");

  const calculator = resolveApp("calculator");
  assert.ok(calculator, "calculator must be resolved");

  const unknown = resolveApp("non_existent_fake_app_xyz");
  assert.equal(unknown, null, "Unknown app must return null");
});

test("executor: test sink writes action under NODE_ENV=test", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-exec-test-"));
  const sinkPath = path.join(tmpDir, "executor-sink.jsonl");

  const origEnv = process.env.NODE_ENV;
  const origSink = process.env.DHWANIFLOW_TEST_EXECUTOR_SINK;

  try {
    process.env.NODE_ENV = "test";
    process.env.DHWANIFLOW_TEST_EXECUTOR_SINK = sinkPath;

    const res = await executeAction({ commandId: "press", params: { key: "enter" } });
    assert.equal(res.success, true);
    assert.equal(res.commandId, "press");

    assert.ok(fs.existsSync(sinkPath), "Sink file must be created");
    const lines = fs.readFileSync(sinkPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);

    const record = JSON.parse(lines[0]);
    assert.equal(record.commandId, "press");
    assert.deepEqual(record.params, { key: "enter" });
    assert.ok(record.timestamp > 0);
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origSink) {
      process.env.DHWANIFLOW_TEST_EXECUTOR_SINK = origSink;
    } else {
      delete process.env.DHWANIFLOW_TEST_EXECUTOR_SINK;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test("executor: rate limiting enforces cooldown between executions", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "df-exec-rl-"));
  const sinkPath = path.join(tmpDir, "executor-sink.jsonl");

  const origEnv = process.env.NODE_ENV;
  const origSink = process.env.DHWANIFLOW_TEST_EXECUTOR_SINK;

  try {
    resetRateLimitForTesting();
    process.env.NODE_ENV = "test";
    process.env.DHWANIFLOW_TEST_EXECUTOR_SINK = sinkPath;

    // First execution succeeds
    const res1 = await executeAction({ commandId: "copy", params: {} });
    assert.equal(res1.success, true);

    // Immediate second execution must be rate limited
    const res2 = await executeAction({ commandId: "paste", params: {} });
    assert.equal(res2.success, false);
    assert.equal(res2.rateLimited, true);

    // After waiting > COOLDOWN_MS, execution succeeds again
    await new Promise((r) => setTimeout(r, COOLDOWN_MS + 50));
    const res3 = await executeAction({ commandId: "paste", params: {} });
    assert.equal(res3.success, true);
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origSink) {
      process.env.DHWANIFLOW_TEST_EXECUTOR_SINK = origSink;
    } else {
      delete process.env.DHWANIFLOW_TEST_EXECUTOR_SINK;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
