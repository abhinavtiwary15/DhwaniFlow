process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");
const {
  transcribe,
  compute429Backoff,
  FifoQueue,
  GnaniAuthError,
  GnaniRateLimitError,
  GnaniTimeoutError,
  GnaniOfflineError,
} = require("../../../src/helpers/gnani/gnani-client");

function createTestWav(durationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("gnani-client", () => {
  let fakeServer;
  let serverPort;
  let serverUrl;
  let activeConcurrency = 0;
  let peakConcurrency = 0;
  let requestCount = 0;
  let forceStatus = null;
  let capturedHeaders = [];
  let capturedBodies = [];

  before(async () => {
    fakeServer = http.createServer(async (req, res) => {
      activeConcurrency++;
      peakConcurrency = Math.max(peakConcurrency, activeConcurrency);
      requestCount++;

      capturedHeaders.push({ ...req.headers });

      // Read body
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      capturedBodies.push(Buffer.concat(chunks).toString("utf8"));

      // Small async delay to simulate network & model processing
      await new Promise((r) => setTimeout(r, 40));

      activeConcurrency--;

      if (forceStatus) {
        const code = forceStatus;
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Simulated error ${code}` }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ transcript: "Transcription success" }));
    });

    await new Promise((resolve) => {
      fakeServer.listen(0, "127.0.0.1", () => {
        serverPort = fakeServer.address().port;
        serverUrl = `http://127.0.0.1:${serverPort}/stt/v3`;
        resolve();
      });
    });
  });

  after(async () => {
    if (fakeServer) {
      await new Promise((resolve) => fakeServer.close(resolve));
    }
  });

  test("concurrency never above 1 under concurrent calls", async () => {
    forceStatus = null;
    peakConcurrency = 0;
    const queue = new FifoQueue();

    const wav = createTestWav(1.0);
    const promises = [
      transcribe({ wav, apiKey: "secret-key-1", apiUrl: serverUrl, queue }),
      transcribe({ wav, apiKey: "secret-key-1", apiUrl: serverUrl, queue }),
      transcribe({ wav, apiKey: "secret-key-1", apiUrl: serverUrl, queue }),
      transcribe({ wav, apiKey: "secret-key-1", apiUrl: serverUrl, queue }),
    ];

    const results = await Promise.all(promises);
    assert.equal(results.length, 4);
    assert.ok(requestCount >= 4);
    for (const r of results) {
      assert.equal(r.transcript, "Transcription success");
    }

    assert.equal(peakConcurrency, 1, `Max concurrency exceeded 1: peak was ${peakConcurrency}`);
  });

  test("retries once on HTTP 429 with backoff and succeeds", async () => {
    let callCount = 0;
    const retryServer = http.createServer(async (req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "RATE_LIMITED" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ transcript: "Recovered after 429 retry" }));
      }
    });

    await new Promise((resolve) => retryServer.listen(0, "127.0.0.1", resolve));
    const retryUrl = `http://127.0.0.1:${retryServer.address().port}/stt/v3`;

    try {
      const wav = createTestWav(1.0);
      const res = await transcribe({
        wav,
        apiKey: "test-retry-key",
        apiUrl: retryUrl,
        queue: new FifoQueue(),
      });

      assert.equal(res.transcript, "Recovered after 429 retry");
      assert.equal(callCount, 2, "Expected exactly 2 attempts (initial + 1 retry)");
    } finally {
      await new Promise((resolve) => retryServer.close(resolve));
    }
  });

  test("throws GnaniRateLimitError if 429 persists across retry", async () => {
    const rateLimitServer = http.createServer((req, res) => {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "RATE_LIMITED" }));
    });

    await new Promise((resolve) => rateLimitServer.listen(0, "127.0.0.1", resolve));
    const rateLimitUrl = `http://127.0.0.1:${rateLimitServer.address().port}/stt/v3`;

    try {
      const wav = createTestWav(1.0);
      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "test-persist-key",
            apiUrl: rateLimitUrl,
            queue: new FifoQueue(),
          }),
        (err) => err instanceof GnaniRateLimitError && err.code === "RATE_LIMITED"
      );
    } finally {
      await new Promise((resolve) => rateLimitServer.close(resolve));
    }
  });

  test("single retry on 429 honors Retry-After capped at 10s and drains body", async () => {
    // 1. Verify header backoff computation & capping
    assert.equal(compute429Backoff("999"), 10000, "Retry-After of 999 must cap to 10s (10,000 ms)");
    assert.equal(compute429Backoff("120"), 10000, "Retry-After of 120 must cap to 10s");
    assert.equal(compute429Backoff("3"), 3000, "Retry-After of 3 must be 3000 ms");

    const fallback1 = compute429Backoff(null);
    assert.ok(fallback1 >= 1000 && fallback1 <= 1500, "Missing header falls back to 1000-1500ms");

    const fallback2 = compute429Backoff("-10");
    assert.ok(fallback2 >= 1000 && fallback2 <= 1500, "Negative header falls back to 1000-1500ms");

    const fallback3 = compute429Backoff("invalid-str");
    assert.ok(fallback3 >= 1000 && fallback3 <= 1500, "Invalid header falls back to 1000-1500ms");

    // 2. Integration test with fast Retry-After (0.05s) to verify retry count & body consumption
    let attempts = 0;
    let bodyDrained = false;
    const testServer = http.createServer((req, res) => {
      attempts++;
      if (attempts === 1) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "0.05",
        });
        res.end(JSON.stringify({ error: "rate limit" }));
        bodyDrained = true;
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ transcript: "success on retry" }));
      }
    });

    await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
    const testUrl = `http://127.0.0.1:${testServer.address().port}/stt/v3`;

    try {
      const wav = createTestWav(1.0);
      const res = await transcribe({
        wav,
        apiKey: "test-retry-after-key",
        apiUrl: testUrl,
        queue: new FifoQueue(),
      });

      assert.equal(attempts, 2, "Must retry exactly once (2 attempts total)");
      assert.equal(bodyDrained, true, "First 429 response body must be consumed");
      assert.equal(res.transcript, "success on retry");
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test("handles timeout and abort via AbortSignal", async () => {
    const hangingServer = http.createServer((_req, _res) => {
      // intentionally never responds
    });

    await new Promise((resolve) => hangingServer.listen(0, "127.0.0.1", resolve));
    const hangingUrl = `http://127.0.0.1:${hangingServer.address().port}/stt/v3`;

    try {
      const wav = createTestWav(1.0);
      const controller = new AbortController();

      // Trigger abort after 50ms
      setTimeout(() => controller.abort(), 50);

      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "test-timeout-key",
            apiUrl: hangingUrl,
            signal: controller.signal,
            queue: new FifoQueue(),
          }),
        (err) => err instanceof GnaniTimeoutError && err.code === "TIMEOUT"
      );
    } finally {
      await new Promise((resolve) => hangingServer.close(resolve));
    }
  });

  test("tolerant response parser parses transcript, text, or result.transcript", async () => {
    const testCases = [
      { body: { transcript: "Direct transcript text" }, expected: "Direct transcript text" },
      { body: { text: "Text field transcript" }, expected: "Text field transcript" },
      { body: { result: { transcript: "Nested result transcript" } }, expected: "Nested result transcript" },
    ];

    for (const tc of testCases) {
      const tolerantServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(tc.body));
      });

      await new Promise((resolve) => tolerantServer.listen(0, "127.0.0.1", resolve));
      const url = `http://127.0.0.1:${tolerantServer.address().port}/stt/v3`;

      try {
        const wav = createTestWav(1.0);
        const res = await transcribe({
          wav,
          apiKey: "test-tolerant-key",
          apiUrl: url,
          queue: new FifoQueue(),
        });
        assert.equal(res.transcript, tc.expected);
      } finally {
        await new Promise((resolve) => tolerantServer.close(resolve));
      }
    }
  });

  test("throws GnaniAuthError on HTTP 401 or 403 (bad key)", async () => {
    for (const code of [401, 403]) {
      forceStatus = code;
      const wav = createTestWav(1.0);

      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "bad-key-xyz",
            apiUrl: serverUrl,
            queue: new FifoQueue(),
          }),
        (err) => err instanceof GnaniAuthError && err.code === "BAD_KEY"
      );
    }
    forceStatus = null;
  });

  test("throws GnaniOfflineError on connection failure / offline", async () => {
    const wav = createTestWav(1.0);
    // Connect to unused local port where no server is listening
    const unreachableUrl = "http://127.0.0.1:59998/stt/v3";

    await assert.rejects(
      () =>
        transcribe({
          wav,
          apiKey: "test-offline-key",
          apiUrl: unreachableUrl,
          queue: new FifoQueue(),
        }),
      (err) => err instanceof GnaniOfflineError && err.code === "OFFLINE"
    );
  });

  test("key never appears in captured logs or error details", async () => {
    const sensitiveKey = "super-secret-gnani-api-token-9999";
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const capturedConsole = [];
    console.log = (...args) => capturedConsole.push(args.join(" "));
    console.warn = (...args) => capturedConsole.push(args.join(" "));
    console.error = (...args) => capturedConsole.push(args.join(" "));

    try {
      forceStatus = 401;
      const wav = createTestWav(1.0);

      try {
        await transcribe({
          wav,
          apiKey: sensitiveKey,
          apiUrl: serverUrl,
          queue: new FifoQueue(),
        });
      } catch (err) {
        // Assert key never appears in error message or error details
        assert.ok(!err.message.includes(sensitiveKey), "Error message leaked API key");
        assert.ok(!JSON.stringify(err).includes(sensitiveKey), "Error object leaked API key");
      }

      // Assert key never appears in any console log
      for (const line of capturedConsole) {
        assert.ok(!line.includes(sensitiveKey), `Console output leaked API key: ${line}`);
      }
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      forceStatus = null;
    }
  });

  test("HTTP 307 redirect to second origin fails and NEVER forwards X-API-Key-ID header", async () => {
    let serverBReceivedRequest = false;
    let serverBCapturedHeaders = null;

    // Second origin (Server B) listening on port B
    const serverB = http.createServer(async (req, res) => {
      serverBReceivedRequest = true;
      serverBCapturedHeaders = { ...req.headers };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ transcript: "leaked-data" }));
    });

    await new Promise((resolve) => serverB.listen(0, "127.0.0.1", resolve));
    const portB = serverB.address().port;

    // First origin (Server A) returning HTTP 307 redirect to Server B
    const serverA = http.createServer((req, res) => {
      res.writeHead(307, {
        Location: `http://127.0.0.1:${portB}/redirected-stt`,
      });
      res.end();
    });

    await new Promise((resolve) => serverA.listen(0, "127.0.0.1", resolve));
    const portA = serverA.address().port;
    const serverAUrl = `http://127.0.0.1:${portA}/stt/v3`;

    try {
      const wav = createTestWav(1.0);
      const testToken = "test-token-redirect-xyz";

      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: testToken,
            apiUrl: serverAUrl,
            queue: new FifoQueue(),
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(!err.message.includes(testToken));
          return true;
        }
      );

      // CRITICAL SECURITY ASSERTION: Server B must never have been contacted
      assert.equal(serverBReceivedRequest, false, "Redirect target server B was contacted!");
      assert.equal(serverBCapturedHeaders, null, "Redirect target server B received headers!");
    } finally {
      await new Promise((resolve) => serverA.close(resolve));
      await new Promise((resolve) => serverB.close(resolve));
    }
  });

  test("production destination strictly enforces HTTPS and api.vachana.ai host", async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const wav = createTestWav(1.0);

      // 1. Insecure HTTP scheme must reject
      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "valid-key-prod",
            apiUrl: "http://api.vachana.ai/stt/v3",
            queue: new FifoQueue(),
          }),
        (err) => err.name === "GnaniError" && err.code === "INSECURE_DESTINATION"
      );

      // 2. Disallowed host must reject
      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "valid-key-prod",
            apiUrl: "https://evil-spoof.com/stt/v3",
            queue: new FifoQueue(),
          }),
        (err) => err.name === "GnaniError" && err.code === "DISALLOWED_DESTINATION"
      );

      // 3. Localhost/IP in production must reject
      await assert.rejects(
        () =>
          transcribe({
            wav,
            apiKey: "valid-key-prod",
            apiUrl: "http://127.0.0.1:8080/stt/v3",
            queue: new FifoQueue(),
          }),
        (err) => err.name === "GnaniError"
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
