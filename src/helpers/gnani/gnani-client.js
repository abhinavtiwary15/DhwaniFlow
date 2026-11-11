/**
 * gnani-client.js
 *
 * Client for Gnani Vachana Speech-to-Text v3 API (prisma-v3.0).
 *
 * Enforces:
 * - Single-flight FIFO queue (concurrency strictly capped at 1)
 * - One retry on HTTP 429 with jittered backoff
 * - Timeout handling via AbortSignal
 * - Keep-alive agent for HTTP connection reuse
 * - Tolerant response parser (transcript, text, result.transcript)
 * - Typed errors with clear user-facing messages
 * - Absolute privacy: NEVER log API keys or transcripts
 */

const { validateWavHeader, computeDuration } = require("./wav-utils");
const { splitWav, joinTranscripts } = require("./chunker");
const { mapLanguageCode } = require("./language-map");
const { buildKeytermsPayload } = require("./keyterms");

// Custom Typed Errors
class GnaniError extends Error {
  constructor(message, code = "API_ERROR", details = {}) {
    super(message);
    this.name = "GnaniError";
    this.code = code;
    this.details = details;
  }
}

class GnaniNoKeyError extends GnaniError {
  constructor(message = "Gnani API key is not configured. Please set your key in settings.", details = {}) {
    super(message, "NO_KEY", details);
    this.name = "GnaniNoKeyError";
  }
}

class GnaniAuthError extends GnaniError {
  constructor(message = "Invalid Gnani API key. Please check your API key in settings.", details = {}) {
    super(message, "BAD_KEY", details);
    this.name = "GnaniAuthError";
  }
}

class GnaniRateLimitError extends GnaniError {
  constructor(message = "Gnani API rate limit exceeded (RATE_LIMITED). Please wait a moment and try again.", details = {}) {
    super(message, "RATE_LIMITED", details);
    this.name = "GnaniRateLimitError";
  }
}

class GnaniTimeoutError extends GnaniError {
  constructor(message = "Transcription request timed out. Please try again.", details = {}) {
    super(message, "TIMEOUT", details);
    this.name = "GnaniTimeoutError";
  }
}

class GnaniOfflineError extends GnaniError {
  constructor(message = "Network connection error (OFFLINE). Please check your internet connection.", details = {}) {
    super(message, "OFFLINE", details);
    this.name = "GnaniOfflineError";
  }
}

class GnaniAudioTooLongError extends GnaniError {
  constructor(message = "Audio clip exceeds the maximum supported duration (AUDIO_TOO_LONG).", details = {}) {
    super(message, "AUDIO_TOO_LONG", details);
    this.name = "GnaniAudioTooLongError";
  }
}

const DEFAULT_GNANI_API_URL = "https://api.vachana.ai/stt/v3";
const ALLOWED_PROD_HOST = "api.vachana.ai";

function isUnpackagedDevOrTest() {
  let isPackaged = false;
  try {
    const { app } = require("electron");
    if (app && typeof app.isPackaged === "boolean") {
      isPackaged = app.isPackaged;
    }
  } catch {
    isPackaged = false;
  }
  const env = process.env.NODE_ENV;
  return !isPackaged && (env === "development" || env === "test");
}

function validateAndResolveDestinationUrl(apiUrl) {
  const allowOverride = isUnpackagedDevOrTest();
  let targetUrl = apiUrl || (allowOverride ? process.env.GNANI_API_URL : null) || DEFAULT_GNANI_API_URL;

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new GnaniError(`Invalid Gnani API URL: ${targetUrl}`, "INVALID_URL");
  }

  if (!allowOverride) {
    if (parsed.protocol !== "https:") {
      throw new GnaniError(
        "Insecure Gnani API destination: HTTPS is strictly required in production",
        "INSECURE_DESTINATION"
      );
    }
    if (parsed.hostname !== ALLOWED_PROD_HOST) {
      throw new GnaniError(
        `Disallowed Gnani API destination host: ${parsed.hostname}. Production host must be ${ALLOWED_PROD_HOST}`,
        "DISALLOWED_DESTINATION"
      );
    }
  }

  return parsed.toString();
}

// Keep-alive agent dispatcher
let keepAliveDispatcher = null;
try {
  const { Agent } = require("undici");
  keepAliveDispatcher = new Agent({
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 120000,
  });
} catch {
  // Undici not available, standard fetch with keepalive will be used
}

/**
 * Computes backoff duration for HTTP 429 response.
 * Honors Retry-After header capped at maxCapMs (default 10,000 ms = 10s).
 * Falls back to jittered 1000-1500 ms window when header is absent, negative, or invalid.
 */
function compute429Backoff(retryAfterHeader, maxCapMs = 10000) {
  if (retryAfterHeader) {
    const parsed = parseFloat(retryAfterHeader);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(parsed * 1000, maxCapMs);
    }
  }
  return 1000 + Math.floor(Math.random() * 500);
}

/**
 * Sequential FIFO Queue guaranteeing max concurrency = 1 and bounded capacity.
 */
class FifoQueue {
  constructor({ maxPendingJobs = 3, maxPendingBytes = 50 * 1024 * 1024 } = {}) {
    this.maxPendingJobs = maxPendingJobs;
    this.maxPendingBytes = maxPendingBytes;
    this.activeCount = 0;
    this.pendingCount = 0;
    this.pendingBytes = 0;
    this._queue = [];
    this._activeJob = null;
    this._processing = false;
  }

  checkCapacity(byteLength = 0) {
    if (this.pendingCount >= this.maxPendingJobs) {
      throw new GnaniError("Speech service is busy. Too many pending transcription requests.", "QUEUE_FULL");
    }
    if (this.pendingBytes + (byteLength || 0) > this.maxPendingBytes) {
      throw new GnaniError("Speech service is busy. Audio byte ceiling exceeded.", "QUEUE_FULL");
    }
  }

  enqueue(fn, options = {}) {
    const requestId = options?.requestId || null;
    const byteSize = options?.byteSize || 0;
    const signal = options?.signal || null;

    this.checkCapacity(byteSize);

    const id = requestId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const abortController = new AbortController();

    if (signal) {
      if (signal.aborted) {
        abortController.abort(signal.reason || new GnaniError("Transcription aborted by caller", "CANCELLED"));
      } else {
        signal.addEventListener(
          "abort",
          () => {
            abortController.abort(signal.reason || new GnaniError("Transcription aborted by caller", "CANCELLED"));
          },
          { once: true }
        );
      }
    }

    return new Promise((resolve, reject) => {
      const job = {
        id,
        fn,
        byteSize: byteSize || 0,
        abortController,
        resolve,
        reject,
        status: "pending",
      };

      this.pendingCount++;
      this.pendingBytes += job.byteSize;
      this._queue.push(job);

      this._drain();
    });
  }

  _drain() {
    if (this._processing || this._queue.length === 0) {
      return;
    }

    const job = this._queue.shift();
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.pendingBytes = Math.max(0, this.pendingBytes - job.byteSize);

    if (job.status === "cancelled") {
      this._drain();
      return;
    }

    this._processing = true;
    this.activeCount = 1;
    this._activeJob = job;
    job.status = "active";

    Promise.resolve()
      .then(() => job.fn(job.abortController.signal))
      .then((res) => {
        if (job.status !== "cancelled") {
          job.resolve(res);
        }
      })
      .catch((err) => {
        if (job.status !== "cancelled") {
          job.reject(err);
        }
      })
      .finally(() => {
        this.activeCount = 0;
        this._activeJob = null;
        this._processing = false;
        this._drain();
      });
  }

  cancel(requestId) {
    if (!requestId) return false;

    // Check if active job matches
    if (this._activeJob && (this._activeJob.id === requestId || this._activeJob.id.startsWith(requestId + "_"))) {
      const job = this._activeJob;
      job.status = "cancelled";
      const cancelErr = new GnaniError("Transcription request cancelled by user", "CANCELLED");
      job.abortController.abort(cancelErr);
      job.reject(cancelErr);
      return true;
    }

    // Check pending queue
    const index = this._queue.findIndex((j) => j.id === requestId || j.id.startsWith(requestId + "_"));
    if (index !== -1) {
      const [job] = this._queue.splice(index, 1);
      job.status = "cancelled";
      this.pendingCount = Math.max(0, this.pendingCount - 1);
      this.pendingBytes = Math.max(0, this.pendingBytes - job.byteSize);
      const cancelErr = new GnaniError("Transcription request cancelled by user", "CANCELLED");
      job.abortController.abort(cancelErr);
      job.reject(cancelErr);
      return true;
    }

    return false;
  }

  cancelAll() {
    let cancelledAny = false;
    if (this._activeJob) {
      this.cancel(this._activeJob.id);
      cancelledAny = true;
    }
    while (this._queue.length > 0) {
      this.cancel(this._queue[0].id);
      cancelledAny = true;
    }
    return cancelledAny;
  }
}

const globalQueue = new FifoQueue();

/**
 * Helper to pause execution for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level call to Gnani STT API for a single chunk (<= 30s).
 *
 * A single AbortController deadline covers the entire request lifecycle:
 * fetch headers phase AND response body read (response.text/response.json).
 * The timer is NOT cleared after fetch() resolves — it stays active until
 * the full body has been consumed, ensuring a stalled body stream is aborted.
 */
async function sendChunkRequest({
  chunkBuffer,
  language = "hi-IN",
  format = "codemix",
  keyterms = null,
  signal = null,
  apiKey = "",
  apiUrl = null,
  timeoutMs = 25000,
}) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GnaniNoKeyError();
  }

  const targetUrl = validateAndResolveDestinationUrl(apiUrl);
  const effectiveLang = mapLanguageCode(language, "hi-IN");

  // Single AbortController and timer covering the ENTIRE request (headers + body read).
  // The timer must NOT be cleared until after response.text()/response.json() completes.
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new GnaniTimeoutError());
  }, timeoutMs);

  let removeExternalAbort = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw signal.reason instanceof Error ? signal.reason : new GnaniTimeoutError("Transcription aborted by caller");
    }
    const onAbort = () => {
      abortController.abort(signal.reason || new Error("Transcription aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    removeExternalAbort = () => signal.removeEventListener("abort", onAbort);
  }

  /**
   * Executes a single fetch attempt, returning the Response object.
   * Does NOT clear the abort timer — the caller is responsible.
   */
  async function executeSingleAttempt() {
    const formData = new FormData();
    const blob = new Blob([chunkBuffer], { type: "audio/wav" });
    formData.append("audio_file", blob, "audio.wav");
    formData.append("language_code", effectiveLang);
    formData.append("model", "prisma-v3.0");

    if (format) {
      formData.append("format", format);
    }

    if (keyterms) {
      const termsStr = typeof keyterms === "string" ? keyterms : keyterms.join(", ");
      if (termsStr.trim()) {
        formData.append("keyterms", termsStr);
      }
    }

    const fetchOpts = {
      method: "POST",
      headers: {
        "X-API-Key-ID": apiKey.trim(),
      },
      body: formData,
      signal: abortController.signal,
      redirect: "error",
      keepalive: true,
    };

    if (keepAliveDispatcher) {
      fetchOpts.dispatcher = keepAliveDispatcher;
    }

    try {
      return await fetch(targetUrl, fetchOpts);
    } catch (err) {
      if (abortController.signal.aborted) {
        const r = abortController.signal.reason || signal?.reason;
        if (r instanceof GnaniError) throw r;
        if (signal?.aborted) {
          throw new GnaniTimeoutError("Transcription aborted by caller");
        }
        throw new GnaniTimeoutError();
      }

      if (
        err.name === "TypeError" &&
        (err.message?.includes("redirect") || err.cause?.message?.includes("redirect"))
      ) {
        throw new GnaniError("HTTP redirect not allowed for speech API", "REDIRECT_NOT_ALLOWED");
      }

      const msg = (err.message || "").toLowerCase();
      if (
        msg.includes("enotfound") ||
        msg.includes("econnrefused") ||
        msg.includes("fetch failed") ||
        msg.includes("network")
      ) {
        throw new GnaniOfflineError();
      }

      throw new GnaniError("Network error communicating with speech API.", "NETWORK_ERROR");
    }
  }

  try {
    // First attempt
    let response = await executeSingleAttempt();

    // Defense-in-depth redirect check
    if (response.status >= 300 && response.status < 400) {
      throw new GnaniError(`Speech API redirect rejected (${response.status})`, "REDIRECT_NOT_ALLOWED");
    }

    // Retry once on HTTP 429 with jittered backoff, honoring Retry-After (capped at 10s)
    if (response.status === 429) {
      // Consume the first response body before retrying to free the connection
      try { await response.text(); } catch {}

      const retryAfterHeader = response.headers?.get?.("Retry-After");
      const backoffMs = compute429Backoff(retryAfterHeader, 10000);

      await sleep(backoffMs);

      if (signal?.aborted || abortController.signal.aborted) {
        throw new GnaniTimeoutError("Transcription aborted during retry backoff");
      }

      response = await executeSingleAttempt();

      if (response.status >= 300 && response.status < 400) {
        throw new GnaniError(`Speech API redirect rejected (${response.status})`, "REDIRECT_NOT_ALLOWED");
      }
    }

    if (!response.ok) {
      // Consume error body under the same timeout deadline
      try {
        await response.text();
      } catch {}

      const status = response.status;
      if (status === 401 || status === 403) {
        throw new GnaniAuthError();
      }
      if (status === 429) {
        throw new GnaniRateLimitError();
      }
      if (status === 413) {
        throw new GnaniAudioTooLongError();
      }
      if (status === 400) {
        throw new GnaniError("Speech API request was invalid.", "INVALID_REQUEST");
      }
      if (status >= 500 && status <= 599) {
        throw new GnaniError("Speech API service error. Please try again later.", "SERVER_ERROR");
      }
      throw new GnaniError("Speech API request failed. Please try again.", "API_ERROR");
    }

    // Tolerant response parser: transcript, text, result.transcript.
    // response.json() runs under the same AbortController signal — body stall triggers timeout.
    try {
      const data = await response.json();
      if (abortController.signal.aborted) {
        throw new GnaniTimeoutError();
      }
      const text = data.transcript ?? data.text ?? data.result?.transcript ?? "";
      return String(text).trim();
    } catch (err) {
      if (err instanceof GnaniTimeoutError) throw err;
      if (abortController.signal.aborted) throw new GnaniTimeoutError();
      throw new GnaniError("Failed to parse speech response.", "PARSE_ERROR");
    }
  } finally {
    // Clear the single deadline timer only after the entire request (headers + body) completes.
    clearTimeout(timeoutId);
    if (removeExternalAbort) removeExternalAbort();
  }
}

/**
 * Transcribes audio via Gnani STT API (v3).
 *
 * Automatically splits recordings longer than 28s and manages single-flight queue.
 *
 * @param {object} params
 * @param {Buffer|Uint8Array|ArrayBuffer} params.wav - 16 kHz 16-bit mono WAV buffer
 * @param {string} [params.language="hi-IN"] - Target language code
 * @param {string} [params.format="codemix"] - Script format (verbatim, transcribe, codemix, transliterate)
 * @param {string|string[]} [params.keyterms] - Vocabulary biasing terms
 * @param {AbortSignal} [params.signal] - Optional cancellation signal
 * @param {string} [params.apiKey] - Gnani API key (defaults to GNANI_API_KEY environment variable)
 * @param {string} [params.apiUrl] - Endpoint URL override
 * @param {FifoQueue} [params.queue] - Optional queue instance (defaults to shared queue)
 * @returns {Promise<{ transcript: string, text: string, chunks: number }>}
 */
async function transcribe({
  wav,
  language = "hi-IN",
  format = "codemix",
  keyterms = null,
  signal = null,
  apiKey = process.env.GNANI_API_KEY || "",
  apiUrl = null,
  queue = globalQueue,
  requestId = null,
}) {
  if (!wav) {
    throw new GnaniError("Missing WAV audio input", "INVALID_INPUT");
  }

  const byteLength = wav.byteLength || wav.length || 0;
  // Bounded queue check BEFORE copying or splitting audio
  if (queue && typeof queue.checkCapacity === "function") {
    queue.checkCapacity(byteLength);
  }

  const durationSec = computeDuration(wav);
  if (durationSec <= 0) {
    return { transcript: "", text: "", chunks: 0 };
  }

  const resolvedUrl = validateAndResolveDestinationUrl(apiUrl);
  const effectiveId = requestId || `gnani_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Split into chunks if duration exceeds 28s
  const chunks = splitWav(wav);
  const chunkTranscripts = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (signal?.aborted) {
      throw new GnaniTimeoutError("Transcription aborted by caller");
    }

    const chunkId = chunks.length === 1 ? effectiveId : `${effectiveId}_chunk_${i}`;
    const chunkText = await queue.enqueue(
      async (jobSignal) => {
        return await sendChunkRequest({
          chunkBuffer: chunk.buffer,
          language,
          format,
          keyterms,
          signal: jobSignal || signal,
          apiKey,
          apiUrl: resolvedUrl,
        });
      },
      { requestId: chunkId, byteSize: chunk.buffer?.byteLength || chunk.length || 0, signal }
    );

    chunkTranscripts.push(chunkText);
  }

  const merged = joinTranscripts(chunkTranscripts, { chunks });
  return {
    transcript: merged,
    text: merged,
    chunks: chunks.length,
    requestId: effectiveId,
  };
}

module.exports = {
  transcribe,
  sendChunkRequest,
  compute429Backoff,
  validateAndResolveDestinationUrl,
  FifoQueue,
  globalQueue,
  GnaniError,
  GnaniNoKeyError,
  GnaniAuthError,
  GnaniRateLimitError,
  GnaniTimeoutError,
  GnaniOfflineError,
  GnaniAudioTooLongError,
  getQueueLength: () => globalQueue.pendingCount,
  getActiveRequests: () => globalQueue.activeCount,
};
