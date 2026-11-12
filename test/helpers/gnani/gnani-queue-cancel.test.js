const ipcFixture = require("../harness/ipc-environment").installIpcEnvironment();
require("node:test").after(() => ipcFixture.restore());
process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");
const { transcribe, FifoQueue, GnaniError } = require("../../../src/helpers/gnani/gnani-client");
const { handleCancel } = require("../../../src/helpers/gnani/gnani-ipc");

function createTestWav(durationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("gnani-client bounded queue and cancel", () => {
  let slowServer;
  let slowPort;
  let requestsReceived = 0;

  before(async () => {
    slowServer = http.createServer((req, res) => {
      requestsReceived++;
      req.resume();
      let timer = setTimeout(() => {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ transcript: "slow response" }));
          } catch {}
        }
      }, 150);

      req.on("aborted", () => {
        if (timer) clearTimeout(timer);
      });
    });

    await new Promise((resolve) => {
      slowServer.listen(0, "127.0.0.1", () => {
        slowPort = slowServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (slowServer) {
      await new Promise((resolve) => slowServer.close(resolve));
    }
  });

  test("queue rejects with QUEUE_FULL error when pending jobs exceed MAX_PENDING_JOBS (3)", async () => {
    const queue = new FifoQueue();
    const slowUrl = `http://127.0.0.1:${slowPort}/stt/v3`;
    const wav = createTestWav(1.0);

    // Start 4 jobs to fill the queue (1 active + 3 pending = max 3 pending)
    const job1 = transcribe({
      wav,
      apiKey: "test-key-queue",
      apiUrl: slowUrl,
      queue,
      requestId: "req-1",
    });
    const job2 = transcribe({
      wav,
      apiKey: "test-key-queue",
      apiUrl: slowUrl,
      queue,
      requestId: "req-2",
    });
    const job3 = transcribe({
      wav,
      apiKey: "test-key-queue",
      apiUrl: slowUrl,
      queue,
      requestId: "req-3",
    });
    const job4 = transcribe({
      wav,
      apiKey: "test-key-queue",
      apiUrl: slowUrl,
      queue,
      requestId: "req-4",
    });

    // Small delay to ensure jobs are queued
    await new Promise((r) => setTimeout(r, 50));

    // 5th job must be rejected immediately (queue busy/full)
    await assert.rejects(
      () =>
        transcribe({ wav, apiKey: "test-key-queue", apiUrl: slowUrl, queue, requestId: "req-5" }),
      (err) => {
        assert.ok(err instanceof GnaniError, `Expected GnaniError, got ${err?.constructor?.name}`);
        assert.equal(err.code, "QUEUE_FULL", `Expected QUEUE_FULL code, got '${err.code}'`);
        assert.match(
          err.message.toLowerCase(),
          /busy|queue/,
          "Error message should mention busy or queue"
        );
        return true;
      }
    );

    // Cancel all running jobs to clean up
    queue.cancel("req-1");
    queue.cancel("req-2");
    queue.cancel("req-3");
    queue.cancel("req-4");
    await Promise.allSettled([job1, job2, job3, job4]);
    await new Promise((r) => setTimeout(r, 200));
  });

  test("queue rejects when pending bytes exceed byte ceiling", async () => {
    const queue = new FifoQueue({ maxPendingBytes: 1000 });
    const slowUrl = `http://127.0.0.1:${slowPort}/stt/v3`;
    const wav = createTestWav(1.0); // ~32KB > 1000 bytes

    await assert.rejects(
      () => transcribe({ wav, apiKey: "test-key-bytes", apiUrl: slowUrl, queue }),
      (err) => {
        assert.ok(err instanceof GnaniError);
        assert.equal(err.code, "QUEUE_FULL");
        return true;
      }
    );
  });

  test("cancel of a queued job removes it and it never reaches the server", async () => {
    const queue = new FifoQueue();
    const slowUrl = `http://127.0.0.1:${slowPort}/stt/v3`;
    const wav = createTestWav(1.0);

    const beforeCount = requestsReceived;

    // Start 1 active job (takes 1 second)
    const job1Promise = transcribe({
      wav,
      apiKey: "test-key-cancel",
      apiUrl: slowUrl,
      queue,
      requestId: "active-job",
    });

    // Small delay to let job1 reach the server
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(requestsReceived, beforeCount + 1, "job1 must reach server");

    // Queue job2 with requestId — it will be pending
    const job2Promise = transcribe({
      wav,
      apiKey: "test-key-cancel",
      apiUrl: slowUrl,
      queue,
      requestId: "queued-job-to-cancel",
    });

    // Cancel job2 while it is still pending in queue
    const cancelled = queue.cancel("queued-job-to-cancel");
    assert.equal(cancelled, true, "queue.cancel should return true for queued job");

    // job2 should reject with cancellation
    await assert.rejects(
      () => job2Promise,
      (err) => {
        assert.ok(err instanceof GnaniError);
        return true;
      }
    );

    // Wait for job1 to complete
    await job1Promise;

    // Server must NOT have received job2
    assert.equal(requestsReceived, beforeCount + 1, "Cancelled queued job must never reach server");
  });

  test("cancel of an active job aborts in-flight request", async () => {
    const queue = new FifoQueue();
    const slowUrl = `http://127.0.0.1:${slowPort}/stt/v3`;
    const wav = createTestWav(1.0);

    const jobPromise = transcribe({
      wav,
      apiKey: "test-key-cancel-active",
      apiUrl: slowUrl,
      queue,
      requestId: "active-to-cancel",
    });

    await new Promise((r) => setTimeout(r, 50));
    const cancelled = queue.cancel("active-to-cancel");
    assert.equal(cancelled, true, "queue.cancel should return true for active job");

    await assert.rejects(
      () => jobPromise,
      (err) => {
        assert.ok(
          err instanceof GnaniError || err.name.includes("Abort") || err.name.includes("Timeout")
        );
        return true;
      }
    );
  });
});

describe("gnani-ipc gnani:cancel handler", () => {
  test("handleCancel is exported from gnani-ipc and can cancel by requestId", async () => {
    assert.ok(
      typeof handleCancel === "function",
      "handleCancel must be exported from gnani-ipc for the gnani:cancel IPC channel"
    );

    const result = await handleCancel(ipcFixture.event, "non-existent-id");
    assert.equal(typeof result, "object");
  });
});
