const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  handleTranscribe,
  handleTestKey,
  handleSaveKey,
  handleScanProject,
  handleGetStatus,
  isValidKeyFormat,
  resolveGnaniApiKey,
  registerGnaniIpc,
  MAX_AUDIO_BYTES,
} = require("../../../src/helpers/gnani/gnani-ipc");
const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");

function createTestBuffer(durationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("gnani-ipc", () => {
  const mockEnvManager = {
    _key: "valid-mock-api-key-12345",
    getGnaniApiKey() {
      return this._key;
    },
    _getKey(name) {
      if (name === "GNANI_API_KEY") return this._key;
      return "";
    },
  };

  describe("isValidKeyFormat", () => {
    test("validates valid key formats", () => {
      assert.equal(isValidKeyFormat("1234567890abcdef123456"), true);
      assert.equal(isValidKeyFormat("gnani_key_prod_9988776655"), true);
      assert.equal(isValidKeyFormat("sk-vachana-valid-token-12345"), true);
    });

    test("rejects invalid key formats", () => {
      assert.equal(isValidKeyFormat(""), false);
      assert.equal(isValidKeyFormat(null), false);
      assert.equal(isValidKeyFormat("short"), false); // < 16 chars
      assert.equal(isValidKeyFormat("key with spaces in the middle"), false);
      assert.equal(isValidKeyFormat("key\nwith\nnewlines"), false);
    });
  });

  describe("resolveGnaniApiKey", () => {
    test("reads from getGnaniApiKey when available", () => {
      const key = resolveGnaniApiKey(mockEnvManager);
      assert.equal(key, "valid-mock-api-key-12345");
    });

    test("falls back to _getKey when getGnaniApiKey is missing", () => {
      const fallbackEnv = {
        _getKey(name) {
          if (name === "GNANI_API_KEY") return "fallback-key-999999";
          return "";
        },
      };
      assert.equal(resolveGnaniApiKey(fallbackEnv), "fallback-key-999999");
    });
  });

  describe("IPC argument validation", () => {
    test("handleTranscribe rejects empty or missing audio buffer", async () => {
      await assert.rejects(
        () => handleTranscribe({}, null, {}, mockEnvManager),
        /Missing audio buffer/
      );

      await assert.rejects(
        () => handleTranscribe({}, Buffer.alloc(0), {}, mockEnvManager),
        /Audio buffer cannot be empty/
      );
    });

    test("handleTranscribe rejects buffer exceeding 25 MB limit", async () => {
      const oversized = { byteLength: MAX_AUDIO_BYTES + 100 };
      await assert.rejects(
        () => handleTranscribe({}, oversized, {}, mockEnvManager),
        /exceeds maximum limit of 25 MB/
      );
    });

    test("handleTranscribe rejects invalid format option outside allowlist", async () => {
      const buf = createTestBuffer(0.5);
      await assert.rejects(
        () => handleTranscribe({}, buf, { format: "invalid_format_xyz" }, mockEnvManager),
        /Invalid format: 'invalid_format_xyz'/
      );
    });

    test("handleTranscribe rejects non-string language option", async () => {
      const buf = createTestBuffer(0.5);
      await assert.rejects(
        () => handleTranscribe({}, buf, { language: 12345 }, mockEnvManager),
        /Invalid language option/
      );
    });

    test("handleTranscribe rejects non-array and non-string keyterms", async () => {
      const buf = createTestBuffer(0.5);
      await assert.rejects(
        () => handleTranscribe({}, buf, { keyterms: { wrong: "object" } }, mockEnvManager),
        /Invalid keyterms option/
      );
    });

    test("handleTranscribe rejects array-like object with huge length (rejects array spoofing)", async () => {
      const spoofed = { length: Number.MAX_SAFE_INTEGER, byteLength: 1 };
      await assert.rejects(
        () => handleTranscribe({}, spoofed, {}, mockEnvManager),
        /Invalid audio buffer type/
      );
    });

    test("handleTranscribe rejects keyterms array exceeding 200 items", async () => {
      const buf = createTestBuffer(0.5);
      const hugeKeyterms = Array.from({ length: 201 }, (_, i) => `term${i}`);
      await assert.rejects(
        () => handleTranscribe({}, buf, { keyterms: hugeKeyterms }, mockEnvManager),
        /Keyterms array cannot exceed 200 items/
      );
    });

    test("handleTranscribe rejects keyterms item exceeding 64 characters", async () => {
      const buf = createTestBuffer(0.5);
      const oversizedTerm = "a".repeat(65);
      await assert.rejects(
        () => handleTranscribe({}, buf, { keyterms: [oversizedTerm] }, mockEnvManager),
        /Each keyterm must be at most 64 characters/
      );
    });

    test("handleTranscribe rejects nested senderFrame (parent !== null)", async () => {
      const buf = createTestBuffer(0.5);
      const nestedFrameEvent = {
        senderFrame: {
          parent: { id: "parent-frame-id" },
          url: "file:///app/index.html",
        },
      };
      await assert.rejects(
        () => handleTranscribe(nestedFrameEvent, buf, {}, mockEnvManager),
        /senderFrame must be top-level frame/
      );
    });

    test("handleTranscribe rejects untrusted sender frame origin", async () => {
      const buf = createTestBuffer(0.5);
      const untrustedOriginEvent = {
        senderFrame: {
          parent: null,
          url: "https://malicious-attacker.com/index.html",
        },
      };
      await assert.rejects(
        () => handleTranscribe(untrustedOriginEvent, buf, {}, mockEnvManager),
        /untrusted sender origin/
      );
    });
  });

  describe("handleTestKey", () => {
    test("validates key format locally and returns 'saved, not verified' with 0 network calls", async () => {
      const res = await handleTestKey({}, "sample-valid-api-key-12345", mockEnvManager);
      assert.equal(res.valid, true);
      assert.equal(res.status, "saved, not verified");
      assert.equal(res.message, "saved, not verified");
    });

    test("returns valid=false on invalid key format without throwing", async () => {
      const res = await handleTestKey({}, "short", mockEnvManager);
      assert.equal(res.valid, false);
      assert.ok(res.error);
    });
  });

  describe("handleScanProject", () => {
    test("rejects invalid folders arguments", async () => {
      await assert.rejects(
        () => handleScanProject({}, null),
        /folders must be a non-empty array/
      );

      await assert.rejects(
        () => handleScanProject({}, []),
        /folders must be a non-empty array/
      );

      await assert.rejects(
        () => handleScanProject({}, [123]),
        /Each folder path must be a non-empty string/
      );
    });
  });

  describe("handleGetStatus", () => {
    test("returns configuration and queue metrics without exposing secrets", async () => {
      const status = await handleGetStatus({}, mockEnvManager);
      assert.equal(typeof status.configured, "boolean");
      assert.equal(status.configured, true);
      assert.equal(typeof status.queueLength, "number");
      assert.equal(typeof status.activeRequests, "number");
      assert.equal(status.model, "prisma-v3.0");
      assert.equal(status.defaultLanguage, "hi-IN");

      // Verify no secret keys or transcripts leaked
      assert.equal(JSON.stringify(status).includes("valid-mock-api-key-12345"), false);
      assert.equal(status.apiKey, undefined);
    });
  });

  describe("handleSaveKey", () => {
    test("saves valid key via environmentManager", async () => {
      let savedKey = "";
      const env = {
        saveGnaniApiKey(k) {
          savedKey = k;
        },
      };
      const res = await handleSaveKey({}, "sample-valid-api-key-12345", env);
      assert.equal(res.success, true);
      assert.equal(savedKey, "sample-valid-api-key-12345");
    });

    test("rejects invalid key format", async () => {
      await assert.rejects(
        () => handleSaveKey({}, "short", mockEnvManager),
        /Invalid API key format/
      );
    });
  });

  describe("registerGnaniIpc", () => {
    test("registers all 5 handlers with ipcMain", () => {
      const registered = new Map();
      const mockIpcMain = {
        handle(channel, handler) {
          registered.set(channel, handler);
        },
      };

      registerGnaniIpc({ ipcMain: mockIpcMain, environmentManager: mockEnvManager });

      assert.ok(registered.has("gnani:transcribe"));
      assert.ok(registered.has("gnani:test-key"));
      assert.ok(registered.has("gnani:save-key"));
      assert.ok(registered.has("gnani:scan-project"));
      assert.ok(registered.has("gnani:get-status"));
    });
  });
});
