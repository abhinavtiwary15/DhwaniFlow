process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { handleTranscribe, MAX_AUDIO_BYTES } = require("../../../src/helpers/gnani/gnani-ipc");
const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");

function createTestWav(durationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("gnani-ipc integration with fake server", () => {
  let fakeServer;
  let serverPort;
  let serverUrl;
  let originalApiUrl;
  let capturedHeaders = [];
  let capturedBodies = [];
  let forceStatus = null;

  const mockEnvManager = {
    _key: "valid-integration-api-key-54321",
    getGnaniApiKey() {
      return this._key;
    },
    _getKey() {
      return this._key;
    },
  };

  const mockDbManager = {
    getDictionary() {
      return ["react", "webpack", "typescript"];
    },
  };

  before(async () => {
    originalApiUrl = process.env.GNANI_API_URL;

    fakeServer = http.createServer(async (req, res) => {
      capturedHeaders.push({ ...req.headers });
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      capturedBodies.push(Buffer.concat(chunks).toString("utf8"));

      if (forceStatus) {
        const code = forceStatus;
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Simulated error ${code}` }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          transcript: "namaste dosto welcome to DhwaniFlow",
        })
      );
    });

    await new Promise((resolve) => {
      fakeServer.listen(0, "127.0.0.1", () => {
        serverPort = fakeServer.address().port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        process.env.GNANI_API_URL = serverUrl;
        resolve();
      });
    });
  });

  after(async () => {
    if (originalApiUrl !== undefined) {
      process.env.GNANI_API_URL = originalApiUrl;
    } else {
      delete process.env.GNANI_API_URL;
    }
    if (fakeServer) {
      await new Promise((r) => fakeServer.close(r));
    }
  });

  test("handleTranscribe composes keyterms and successfully transcribes audio", async () => {
    capturedHeaders = [];
    capturedBodies = [];
    forceStatus = null;

    const audioBuf = createTestWav(1.0);
    const result = await handleTranscribe(
      {},
      audioBuf,
      {
        language: "hi-IN",
        format: "transcribe",
        keyterms: ["customterm", "dhwaniflow"],
      },
      mockEnvManager,
      mockDbManager
    );

    assert.equal(result.transcript, "namaste dosto welcome to DhwaniFlow");
    assert.equal(result.text, "namaste dosto welcome to DhwaniFlow");
    assert.equal(result.chunks, 1);

    // Verify headers and body sent to fake server
    assert.equal(capturedHeaders.length, 1);
    assert.equal(capturedHeaders[0]["x-api-key-id"], "valid-integration-api-key-54321");

    const body = capturedBodies[0];
    assert.ok(body.includes('name="language_code"\r\n\r\nhi-IN'));
    assert.ok(body.includes('name="format"\r\n\r\ntranscribe'));

    // Keyterms should include dict words first, then caller terms, then dev-terms
    assert.ok(body.includes('name="keyterms"'));
    assert.ok(body.includes("react"));
    assert.ok(body.includes("typescript"));
    assert.ok(body.includes("customterm"));
  });

  test("handleTranscribe maps 401 error to BAD_KEY", async () => {
    forceStatus = 401;
    const audioBuf = createTestWav(0.5);

    try {
      await handleTranscribe(
        {},
        audioBuf,
        { language: "hi-IN", format: "transcribe" },
        mockEnvManager,
        mockDbManager
      );
      assert.fail("Expected 401 to throw");
    } catch (err) {
      assert.equal(err.code, "BAD_KEY");
    } finally {
      forceStatus = null;
    }
  });

  test("handleTranscribe maps 429 error to RATE_LIMITED", async () => {
    forceStatus = 429;
    const audioBuf = createTestWav(0.5);

    try {
      await handleTranscribe(
        {},
        audioBuf,
        { language: "hi-IN", format: "transcribe" },
        mockEnvManager,
        mockDbManager
      );
      assert.fail("Expected 429 to throw");
    } catch (err) {
      assert.equal(err.code, "RATE_LIMITED");
    } finally {
      forceStatus = null;
    }
  });

  test("handleTranscribe throws NO_KEY when API key is missing", async () => {
    const emptyEnv = {
      getGnaniApiKey() {
        return "";
      },
      _getKey() {
        return "";
      },
    };
    const audioBuf = createTestWav(0.5);

    try {
      await handleTranscribe(
        {},
        audioBuf,
        { language: "hi-IN", format: "transcribe" },
        emptyEnv,
        mockDbManager
      );
      assert.fail("Expected missing key to throw");
    } catch (err) {
      assert.equal(err.code, "NO_KEY");
    }
  });

  test("handleTranscribe maps network connection failure to OFFLINE", async () => {
    // Point to non-existent port
    const orig = process.env.GNANI_API_URL;
    process.env.GNANI_API_URL = "http://127.0.0.1:59999/unreachable";
    const audioBuf = createTestWav(0.5);

    try {
      await handleTranscribe(
        {},
        audioBuf,
        { language: "hi-IN", format: "transcribe" },
        mockEnvManager,
        mockDbManager
      );
      assert.fail("Expected unreachable server to throw");
    } catch (err) {
      assert.equal(err.code, "OFFLINE");
    } finally {
      process.env.GNANI_API_URL = orig;
    }
  });

  test("handleTranscribe throws AUDIO_TOO_LONG when audio buffer exceeds limit", async () => {
    const oversized = { byteLength: MAX_AUDIO_BYTES + 1024 };

    try {
      await handleTranscribe(
        {},
        oversized,
        { language: "hi-IN", format: "transcribe" },
        mockEnvManager,
        mockDbManager
      );
      assert.fail("Expected oversized audio to throw");
    } catch (err) {
      assert.equal(err.code, "AUDIO_TOO_LONG");
    }
  });

  test("handleTestKey, handleSaveKey, and handleGetStatus integration with environment", async () => {
    const { handleTestKey, handleSaveKey, handleGetStatus } = require("../../../src/helpers/gnani/gnani-ipc");

    let storedKey = "";
    const testEnv = {
      getGnaniApiKey() {
        return storedKey;
      },
      saveGnaniApiKey(k) {
        storedKey = k;
      },
    };

    // Initially not configured
    const statusBefore = await handleGetStatus({}, testEnv);
    assert.equal(statusBefore.configured, false);
    assert.equal(statusBefore.model, "prisma-v3.0");

    // Test invalid key
    const testInvalid = await handleTestKey({}, "too-short", testEnv);
    assert.equal(testInvalid.valid, false);

    // Test valid key
    const validKey = "valid-integration-test-key-987654";
    const testValid = await handleTestKey({}, validKey, testEnv);
    assert.equal(testValid.valid, true);

    // Save key
    const saveRes = await handleSaveKey({}, validKey, testEnv);
    assert.equal(saveRes.success, true);
    assert.equal(storedKey, validKey);

    // Status now configured
    const statusAfter = await handleGetStatus({}, testEnv);
    assert.equal(statusAfter.configured, true);
  });
});
