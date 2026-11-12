const test = require("node:test"),
  assert = require("node:assert/strict"),
  Module = require("node:module"),
  { EventEmitter } = require("node:events");
const fixture = require("../harness/ipc-environment").installIpcEnvironment();
let mode = "stall",
  killed = 0;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "child_process")
    return {
      spawn: () => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.unref = () => {};
        child.kill = () => {
          killed++;
        };
        if (mode === "error")
          queueMicrotask(() => child.emit("error", new Error("Synthetic spawn failure")));
        return child;
      },
    };
  return originalLoad.call(this, request, parent, isMain);
};
const executor = require("../../../src/helpers/commands/executor");
const { CommandHandler } = require("../../../src/helpers/commands/handler");
const { parseCommand } = require("../../../src/helpers/commands");
Module._load = originalLoad;
test.after(() => fixture.restore());
test("negated commands cannot execute positive grammar matches", () => {
  for (const phrase of [
    "chrome khol do mat",
    "naya tab mat kholo",
    "sab select mat karo",
    "क्रोम मत खोल दो",
    "do not open chrome",
    "don't close tab",
    "chrome nahi kholo",
  ]) {
    const result = parseCommand(phrase);
    assert.ok(result.unknown || result.blocked, phrase);
    assert.equal(result.commandId, undefined);
  }
});
test("rejecting execution settles the handler and the next command works", async () => {
  let attempts = 0;
  const handler = new CommandHandler({
    execute: async () => {
      if (++attempts === 1) throw Error("Synthetic failure");
      return { success: true };
    },
  });
  try {
    assert.equal((await handler.handleTranscript("naya tab kholo")).success, false);
    assert.equal((await handler.handleTranscript("naya tab kholo")).success, true);
  } finally {
    clearTimeout(handler.dismissTimer);
    handler.cancelPending();
  }
});
test("a stalled executor is cancelled and cannot leave pending work forever", async () => {
  const handler = new CommandHandler({ execute: () => new Promise(() => {}) });
  const pending = handler.handleTranscript("naya tab kholo");
  await new Promise((resolve) => setTimeout(resolve, 850));
  assert.equal(handler.cancelPending(), true);
  assert.equal((await pending).cancelled, true);
  clearTimeout(handler.dismissTimer);
  assert.equal(handler.pending, null);
});
test("command history is bounded and disabling history clears it", async () => {
  const handler = new CommandHandler();
  for (let i = 0; i < 70; i++) await handler.handleTranscript("unrecognized utterance " + i);
  assert.equal(handler.history.length, 50);
  handler.historyEnabled = () => false;
  assert.deepEqual(handler.getHistory(), []);
  assert.equal(handler.history.length, 0);
  clearTimeout(handler.dismissTimer);
});
test("command typing awaits actual paste restoration and honours auto-paste", async () => {
  executor.resetRateLimitForTesting();
  let restored = false,
    calls = 0;
  const clipboardManager = {
    pasteText: async () => {
      calls++;
      return {
        pasted: true,
        restoreComplete: Promise.resolve().then(() => {
          restored = true;
        }),
      };
    },
  };
  assert.equal(
    (
      await executor.executeAction(
        { commandId: "type_text", params: { text: "synthetic words" } },
        { clipboardManager, pasteOptions: { restoreClipboard: true } }
      )
    ).success,
    true
  );
  assert.equal(restored, true);
  executor.resetRateLimitForTesting();
  assert.equal(
    (
      await executor.executeAction(
        { commandId: "type_text", params: { text: "synthetic words" } },
        { clipboardManager, pasteOptions: { autoPasteEnabled: false } }
      )
    ).success,
    false
  );
  assert.equal(calls, 1);
});
test("native helper timeout kills the child and releases the executor slot", async () => {
  executor.resetRateLimitForTesting();
  mode = "stall";
  const result = await executor.executeAction({ commandId: "press", params: { key: "enter" } });
  assert.equal(result.success, false);
  assert.match(result.error, /timed out|unavailable/i);
  if (process.platform === "win32") assert.ok(killed > 0);
  executor.resetRateLimitForTesting();
  mode = "error";
  assert.equal(
    (await executor.executeAction({ commandId: "press", params: { key: "enter" } })).success,
    false
  );
});
