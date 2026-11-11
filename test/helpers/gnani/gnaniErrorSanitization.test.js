process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { transcribe, GnaniError } = require("../../../src/helpers/gnani/gnani-client");
const { handleTranscribe } = require("../../../src/helpers/gnani/gnani-ipc");
const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");

function createTestWav() {
  const header = createWavHeader(32000, 16000, 1, 16);
  return Buffer.concat([header, Buffer.alloc(32000)]);
}

describe("P0-1c Error Sanitization", () => {
  let fakeServer;
  let serverUrl;
  let responseMode = "echo_key_400";
  const SYNTHETIC_KEY = "sk-gnani-secret-token-abcdef123456";

  before(async () => {
    fakeServer = http.createServer(async (req, res) => {
      const apiKeyHeader = req.headers["x-api-key-id"] || "";

      if (responseMode === "echo_key_400") {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "X-Echoed-Secret": apiKeyHeader,
        });
        res.end(JSON.stringify({
          error: `Invalid token: ${apiKeyHeader}`,
          message: `Authentication failed for key ${apiKeyHeader}`,
        }));
        return;
      }

      if (responseMode === "echo_key_500_text") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Internal Server Error: Database rejected token ${apiKeyHeader}`);
        return;
      }

      if (responseMode === "malformed_json_200") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(`{ invalid json token: ${apiKeyHeader} }`);
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ transcript: "ok" }));
    });

    await new Promise((resolve) => {
      fakeServer.listen(0, "127.0.0.1", () => {
        serverUrl = `http://127.0.0.1:${fakeServer.address().port}/stt/v3`;
        resolve();
      });
    });
  });

  after(async () => {
    if (fakeServer) await new Promise((r) => fakeServer.close(r));
  });

  test("HTTP 400 echoing synthetic key in body never leaks key in thrown error", async () => {
    responseMode = "echo_key_400";
    const wav = createTestWav();

    try {
      await transcribe({
        wav,
        apiKey: SYNTHETIC_KEY,
        apiUrl: serverUrl,
      });
      assert.fail("Expected HTTP 400 to throw");
    } catch (err) {
      assert.ok(err instanceof GnaniError);
      // Assert synthetic key is absent
      assert.ok(!err.message.includes(SYNTHETIC_KEY), "Key leaked in err.message");
      assert.ok(!JSON.stringify(err).includes(SYNTHETIC_KEY), "Key leaked in serialized err");
      // Assert status code is NOT in message
      assert.ok(!err.message.includes("400"), "Status code leaked in err.message");
      // Assert stable allow-listed message
      assert.equal(err.message, "Speech API request was invalid.");
    }
  });

  test("HTTP 500 echoing synthetic key in plain text never leaks key or status code", async () => {
    responseMode = "echo_key_500_text";
    const wav = createTestWav();

    try {
      await transcribe({
        wav,
        apiKey: SYNTHETIC_KEY,
        apiUrl: serverUrl,
      });
      assert.fail("Expected HTTP 500 to throw");
    } catch (err) {
      assert.ok(err instanceof GnaniError);
      assert.ok(!err.message.includes(SYNTHETIC_KEY), "Key leaked in err.message");
      assert.ok(!err.message.includes("500"), "Status code leaked in err.message");
      assert.equal(err.message, "Speech API service error. Please try again later.");
    }
  });

  test("Malformed 200 JSON echoing synthetic key throws stable parse error without token", async () => {
    responseMode = "malformed_json_200";
    const wav = createTestWav();

    try {
      await transcribe({
        wav,
        apiKey: SYNTHETIC_KEY,
        apiUrl: serverUrl,
      });
      assert.fail("Expected malformed JSON to throw");
    } catch (err) {
      assert.ok(err instanceof GnaniError);
      assert.ok(!err.message.includes(SYNTHETIC_KEY), "Key leaked in err.message");
      assert.equal(err.message, "Failed to parse speech response.");
    }
  });

  test("handleTranscribe IPC handler rejects without leaking synthetic key", async () => {
    responseMode = "echo_key_400";
    const wav = createTestWav();
    const envManager = {
      getGnaniApiKey: () => SYNTHETIC_KEY,
      _getKey: () => SYNTHETIC_KEY,
    };
    process.env.GNANI_API_URL = serverUrl;

    try {
      await handleTranscribe({}, wav, {}, envManager);
      assert.fail("Expected handleTranscribe to reject");
    } catch (err) {
      assert.ok(!err.message.includes(SYNTHETIC_KEY), "Key leaked in IPC error message");
      assert.equal(err.message, "Speech API request was invalid.");
    } finally {
      delete process.env.GNANI_API_URL;
    }
  });
});
