const test = require("node:test"),
  assert = require("node:assert/strict"),
  Module = require("node:module"),
  { EventEmitter } = require("node:events");
const opened = [],
  spawned = [],
  load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return { shell: { openExternal: async (url) => opened.push(url) } };
  if (request === "child_process")
    return {
      spawn: (exe, args) => {
        spawned.push({ exe, args });
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit("spawn"));
        return child;
      },
    };
  return load.call(this, request, parent, isMain);
};
const { openExternalUrl } = require("../../src/helpers/externalUrlOpener");
Module._load = load;
test("approved HTTPS origin reaches the OS boundary", async () => {
  await openExternalUrl("https://api.vachana.ai/docs");
  assert.equal(opened.length + spawned.length, 1);
});
test("foreign origins and schemes never reach the OS", async () => {
  const before = opened.length + spawned.length;
  for (const url of [
    "https://example.com",
    "http://api.vachana.ai",
    "https://api.vachana.ai.evil.test",
    "https://user@api.vachana.ai",
    "https://api.vachana.ai:1234",
    "mailto:a@example.com",
    "file:///tmp/app",
  ])
    await assert.rejects(openExternalUrl(url), /not allowed/);
  assert.equal(opened.length + spawned.length, before);
});
