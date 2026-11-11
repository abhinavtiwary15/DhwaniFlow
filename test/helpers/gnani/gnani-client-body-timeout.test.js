process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");
const {
  sendChunkRequest,
  GnaniTimeoutError,
} = require("../../../src/helpers/gnani/gnani-client");

function createTestWav(durationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("gnani-client body-stream timeout", () => {
  let stalledServer;
  let stalledPort;
  let openResponses = [];

  before(async () => {
    // Server that:
    //  1. Receives the full request body immediately
    //  2. Sends 200 headers immediately (so fetch() resolves fast — before timeout fires)
    //  3. NEVER sends the body, leaving response.json() to block forever
    //
    // The timeout MUST cover the entire request (headers + body read), not just the fetch phase.
    stalledServer = http.createServer((req, res) => {
      // Drain request body immediately
      req.resume();
      req.on("end", () => {
        // Send headers immediately — this allows fetch() to resolve quickly
        // The body is never sent, so response.json() will block indefinitely
        res.writeHead(200, { "Content-Type": "application/json" });
        // Intentionally do NOT call res.end() — body stream stalls
        openResponses.push(res);
      });
    });

    await new Promise((resolve) => {
      stalledServer.listen(0, "127.0.0.1", () => {
        stalledPort = stalledServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    for (const r of openResponses) {
      try { r.socket?.destroy(); } catch {}
    }
    openResponses = [];
    if (stalledServer) {
      await new Promise((resolve) => stalledServer.close(resolve));
    }
  });

  test("timeout fires through response body read when server sends headers then stalls body", async () => {
    const stallUrl = `http://127.0.0.1:${stalledPort}/stt/v3`;
    const chunkBuffer = createTestWav(1.0);

    const startMs = Date.now();

    // timeoutMs = 600ms — headers arrive fast (< 50ms), body hangs forever.
    // The abort signal MUST remain active through response.json() to enforce the deadline.
    await assert.rejects(
      () =>
        sendChunkRequest({
          chunkBuffer,
          apiKey: "test-body-timeout-key",
          apiUrl: stallUrl,
          timeoutMs: 600,
        }),
      (err) => {
        assert.ok(
          err instanceof GnaniTimeoutError,
          `Expected GnaniTimeoutError, got ${err?.constructor?.name}: ${err?.message}`
        );
        return true;
      }
    );

    const elapsedMs = Date.now() - startMs;
    // Must complete (via timeout) well before 3s
    assert.ok(
      elapsedMs < 3000,
      `Timeout did not fire in time through body read — elapsed ${elapsedMs}ms (body stream was not covered by abort signal after headers received)`
    );
  });
});
