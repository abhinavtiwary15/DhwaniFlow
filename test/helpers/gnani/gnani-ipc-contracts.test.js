const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { installIpcEnvironment } = require("../harness/ipc-environment");
const fixture = installIpcEnvironment();
const ipc = require("../../../src/helpers/gnani/gnani-ipc"),
  { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");
const credential = randomUUID(),
  environment = {
    getGnaniApiKey: () => credential,
    saveGnaniApiKey: async () => ({ success: true }),
  };
const wav = Buffer.concat([createWavHeader(32000), Buffer.alloc(32000)]);
test.after(() => fixture.restore());
test("IPC checks real audio brands, sizes, schemas, supported languages and IDs", async () => {
  for (const input of [
    null,
    Buffer.alloc(0),
    { length: 8, 0: 1 },
    { byteLength: 8, [Symbol.toStringTag]: "Uint8Array" },
    Buffer.alloc(26 * 1024 * 1024),
  ])
    await assert.rejects(ipc.handleTranscribe(fixture.event, input, {}, environment));
  for (const options of [
    { language: "xx-XX" },
    { language: {} },
    { format: "invalid" },
    { requestId: 42 },
    { requestId: "x".repeat(129) },
    { keyterms: Array(201).fill("word") },
    { keyterms: ["x".repeat(65)] },
    { apiUrl: "https://invalid.example" },
  ])
    await assert.rejects(ipc.handleTranscribe(fixture.event, wav, options, environment));
  await assert.rejects(
    ipc.handleTranscribe(fixture.event, Buffer.alloc(10), {}, environment),
    /WAV/
  );
  await assert.rejects(ipc.handleCancel(fixture.event, 42), /cancellation/);
});
test("every secret/status/cancel/scan handler rejects missing and foreign frames", async () => {
  const calls = [
    (e) => ipc.handleTestKey(e, credential, environment),
    (e) => ipc.handleSaveKey(e, credential, environment),
    (e) => ipc.handleGetStatus(e, environment),
    (e) => ipc.handleCancel(e),
    (e) => ipc.handleScanProject(e, [fixture.profile]),
    (e) => ipc.handleTranscribe(e, wav, {}, environment),
  ];
  for (const call of calls) {
    await assert.rejects(call(null), /IPC request rejected/);
    await assert.rejects(
      call({ sender: {}, senderFrame: fixture.event.senderFrame }),
      /IPC request rejected/
    );
  }
  const before = fixture.event.senderFrame.url;
  fixture.event.senderFrame.url = "file:///unowned/page.html";
  try {
    await assert.rejects(ipc.handleGetStatus(fixture.event, environment), /untrusted document/);
  } finally {
    fixture.event.senderFrame.url = before;
  }
});
test("key Test is local format-only and stored credentials never come back", async () => {
  const original = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    throw Error("No service allowed");
  };
  try {
    const result = await ipc.handleTestKey(fixture.event, credential, environment);
    assert.equal(result.valid, true);
    assert.match(result.status, /not verified/);
    assert.equal(requests, 0);
    assert.equal(JSON.stringify(result).includes(credential), false);
  } finally {
    global.fetch = original;
  }
  const status = await ipc.handleGetStatus(fixture.event, environment);
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes(credential), false);
});
test("secure save awaits failure and sanitizes even a secret-bearing backend error", async () => {
  let settled = false;
  const failed = {
    saveGnaniApiKey: async () => {
      await new Promise((done) => setTimeout(done, 10));
      settled = true;
      throw Error(credential);
    },
  };
  const result = await ipc.handleSaveKey(fixture.event, credential, failed);
  assert.equal(settled, true);
  assert.equal(result.success, false);
  assert.equal(JSON.stringify(result).includes(credential), false);
  assert.equal((await ipc.handleSaveKey(fixture.event, credential, environment)).success, true);
});
test("project scan worker ignores literals and oversized package metadata", async () => {
  const folder = path.join(fixture.profile, "project");
  fs.mkdirSync(folder);
  fs.writeFileSync(
    path.join(folder, "code.js"),
    "const developerIdentifier = 'privateLiteralMarker'; const password = 'privatePasswordMarker';"
  );
  fs.writeFileSync(
    path.join(folder, "package.json"),
    JSON.stringify({ name: "oversizePackageMarker", description: "x".repeat(600000) })
  );
  const result = await ipc.handleScanProject(fixture.event, [folder]);
  assert.equal(result.terms.includes("developerIdentifier"), true);
  assert.equal(result.terms.includes("privateLiteralMarker"), false);
  assert.equal(result.terms.includes("privatePasswordMarker"), false);
  assert.equal(result.terms.includes("oversizePackageMarker"), false);
});
test("standalone registration includes all six implemented Gnani channels", () => {
  ipc.registerGnaniIpc({ ipcMain: fixture.electron.ipcMain, environmentManager: environment });
  assert.equal(fixture.handlers.size, 6);
  assert.equal(fixture.handlers.has("gnani:cancel"), true);
});
