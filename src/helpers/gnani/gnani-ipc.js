/**
 * gnani-ipc.js
 *
 * IPC Handler registration for Gnani Speech-to-Text integration:
 * - gnani:transcribe(audioBuffer, options)
 * - gnani:test-key(key)
 * - gnani:save-key(key)
 * - gnani:scan-project(folders)
 * - gnani:get-status()
 *
 * Security & privacy:
 * - Validates all arguments (types, size under 25 MB, format and language allowlists)
 * - Reads key from encrypted secret store, NEVER sends it to the renderer
 * - gnani:test-key performs local format validation with zero credit spend
 */

const {
  transcribe,
  globalQueue,
  getQueueLength,
  getActiveRequests,
  GnaniAuthError,
  GnaniNoKeyError,
  GnaniAudioTooLongError,
  GnaniError,
} = require("./gnani-client");
const { mapLanguageCode } = require("./language-map");
const { scanProjectFolders } = require("./project-terms");
const { buildKeyterms } = require("./keyterms");
const devTerms = require("./data/dev-terms.json");

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB limit
const ALLOWED_FORMATS = new Set(["verbatim", "transcribe", "codemix", "transliterate"]);

/**
 * Validates that an audio buffer object is strictly a Buffer, Uint8Array, or ArrayBuffer.
 * Rejects plain objects, array-like objects, or spoofed buffers.
 */
function isValidAudioBufferType(buf) {
  if (!buf) return false;
  if (Buffer.isBuffer(buf)) return true;
  if (buf instanceof Uint8Array) return true;
  if (buf instanceof ArrayBuffer) return true;
  const tag = Object.prototype.toString.call(buf);
  return tag === "[object Uint8Array]" || tag === "[object ArrayBuffer]";
}

/**
 * Validates the IPC event sender frame.
 * Enforces:
 * - Top-level frame only (event.senderFrame.parent === null)
 * - App origin check (file:, app:, or dev localhost/127.0.0.1)
 * - Owned BrowserWindow check
 */
function validateSenderFrame(event) {
  if (!event) return;

  if (event.senderFrame) {
    if (event.senderFrame.parent !== null && event.senderFrame.parent !== undefined) {
      throw new GnaniError("IPC senderFrame must be top-level frame", "FORBIDDEN_FRAME");
    }

    if (event.senderFrame.url) {
      let parsed;
      try {
        parsed = new URL(event.senderFrame.url);
      } catch {
        throw new GnaniError("IPC senderFrame has invalid URL", "FORBIDDEN_FRAME");
      }

      const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
      const allowedProtocols = new Set(["file:", "app:", "chrome-extension:"]);
      const isAllowedProtocol = allowedProtocols.has(parsed.protocol);
      const isAllowedDevHost = isDevOrTest && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

      if (!isAllowedProtocol && !isAllowedDevHost) {
        throw new GnaniError(`IPC request rejected: untrusted sender origin '${parsed.origin}'`, "FORBIDDEN_FRAME");
      }
    }
  }

  if (event.sender) {
    try {
      const { BrowserWindow } = require("electron");
      if (BrowserWindow && typeof BrowserWindow.fromWebContents === "function") {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win && typeof BrowserWindow.getAllWindows === "function" && BrowserWindow.getAllWindows().length > 0) {
          throw new GnaniError("IPC request rejected: sender does not belong to an owned window", "FORBIDDEN_FRAME");
        }
      }
    } catch (err) {
      if (err instanceof GnaniError) throw err;
    }
  }
}

/**
 * Resolves the Gnani API key from the encrypted secret store through environmentManager.
 * Key is never exposed to the renderer process.
 *
 * @param {object} [environmentManager]
 * @returns {string}
 */
function resolveGnaniApiKey(environmentManager) {
  if (environmentManager) {
    if (typeof environmentManager.getGnaniApiKey === "function") {
      const k = environmentManager.getGnaniApiKey();
      if (k) return k;
    }
    if (typeof environmentManager._getKey === "function") {
      const k = environmentManager._getKey("GNANI_API_KEY");
      if (k) return k;
    }
  }
  return process.env.GNANI_API_KEY || "";
}

/**
 * Validates the structure and characters of a Gnani API key.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isValidKeyFormat(key) {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length < 16 || trimmed.length > 256) return false;
  if (/[\s\r\n]/.test(trimmed)) return false;
  // Key should contain standard API token characters (alphanumeric, dashes, underscores)
  return /^[A-Za-z0-9_\-]+$/.test(trimmed);
}

/**
 * Handler for gnani:transcribe IPC.
 */
async function handleTranscribe(event, audioBuffer, options = {}, environmentManager = null, databaseManager = null) {
  // 1. Sender verification
  validateSenderFrame(event);

  // 2. Audio buffer validation
  if (!audioBuffer) {
    throw new GnaniError("Missing audio buffer", "INVALID_ARGUMENT");
  }

  const byteLength = Buffer.isBuffer(audioBuffer)
    ? audioBuffer.length
    : (audioBuffer.byteLength !== undefined ? audioBuffer.byteLength : (audioBuffer.length || 0));

  if (byteLength === 0) {
    throw new GnaniError("Audio buffer cannot be empty", "INVALID_ARGUMENT");
  }

  if (byteLength > MAX_AUDIO_BYTES) {
    throw new GnaniAudioTooLongError(`Audio buffer exceeds maximum limit of 25 MB (${byteLength} bytes)`);
  }

  if (!isValidAudioBufferType(audioBuffer)) {
    throw new GnaniError("Invalid audio buffer type. Expected Buffer, Uint8Array, or ArrayBuffer", "INVALID_ARGUMENT");
  }

  let wavBuf;
  if (Buffer.isBuffer(audioBuffer)) {
    wavBuf = audioBuffer;
  } else if (audioBuffer instanceof Uint8Array || Object.prototype.toString.call(audioBuffer) === "[object Uint8Array]") {
    wavBuf = Buffer.from(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
  } else if (audioBuffer instanceof ArrayBuffer || Object.prototype.toString.call(audioBuffer) === "[object ArrayBuffer]") {
    wavBuf = Buffer.from(audioBuffer);
  } else {
    throw new GnaniError("Invalid audio buffer type", "INVALID_ARGUMENT");
  }

  const opts = options && typeof options === "object" ? options : {};

  // 3. Validate format allowlist
  let effectiveFormat = "codemix";
  if (opts.format !== undefined && opts.format !== null) {
    if (typeof opts.format !== "string" || !ALLOWED_FORMATS.has(opts.format)) {
      throw new GnaniError(
        `Invalid format: '${opts.format}'. Allowed: verbatim, transcribe, codemix, transliterate`,
        "INVALID_ARGUMENT"
      );
    }
    effectiveFormat = opts.format;
  }

  // 4. Validate and map language
  if (opts.language !== undefined && opts.language !== null) {
    if (typeof opts.language !== "string" || opts.language.length > 50 || !/^[A-Za-z0-9_\-,\s]+$/.test(opts.language)) {
      throw new GnaniError("Invalid language option: expected string", "INVALID_ARGUMENT");
    }
  }
  const effectiveLanguage = mapLanguageCode(opts.language, "hi-IN");

  // 5. Validate keyterms (array of <= 200 strings, each <= 64 chars)
  if (opts.keyterms !== undefined && opts.keyterms !== null) {
    if (!Array.isArray(opts.keyterms) && typeof opts.keyterms !== "string") {
      throw new GnaniError("Invalid keyterms option: expected string or array of strings", "INVALID_ARGUMENT");
    }
    if (Array.isArray(opts.keyterms)) {
      if (opts.keyterms.length > 200) {
        throw new GnaniError("Keyterms array cannot exceed 200 items", "INVALID_ARGUMENT");
      }
      for (const term of opts.keyterms) {
        if (typeof term !== "string") {
          throw new GnaniError("Each keyterm must be a string", "INVALID_ARGUMENT");
        }
        if (term.length > 64) {
          throw new GnaniError("Each keyterm must be at most 64 characters", "INVALID_ARGUMENT");
        }
      }
    } else if (typeof opts.keyterms === "string" && opts.keyterms.length > 2000) {
      throw new GnaniError("Keyterms string exceeds maximum allowed length", "INVALID_ARGUMENT");
    }
  }

  // Compose keyterms: dictionary words first, then dev-terms.json; dedupe, cap 200 and 2,000 characters
  let dictWords = [];
  if (databaseManager && typeof databaseManager.getDictionary === "function") {
    try {
      dictWords = databaseManager.getDictionary() || [];
    } catch {}
  }
  const callerTerms = Array.isArray(opts.keyterms)
    ? opts.keyterms
    : (opts.keyterms ? [opts.keyterms] : []);
  const composedKeyterms = buildKeyterms([dictWords, callerTerms, devTerms], {
    maxTerms: 200,
    maxChars: 2000,
  });

  // Retrieve secret key - never send to renderer
  const apiKey = resolveGnaniApiKey(environmentManager);
  if (!apiKey) {
    throw new GnaniNoKeyError("GNANI_API_KEY is not configured in secure storage");
  }

  try {
    return await transcribe({
      wav: wavBuf,
      language: effectiveLanguage,
      format: effectiveFormat,
      keyterms: composedKeyterms,
      apiKey,
      requestId: opts.requestId,
    });
  } catch (err) {
    if (err instanceof GnaniError) {
      throw err;
    }
    throw new GnaniError("Transcription failed due to an unexpected error.", "INTERNAL_ERROR");
  }
}

/**
 * Handler for gnani:test-key IPC.
 * Validates key format locally without making network calls or spending credits.
 */
async function handleTestKey(event, keyToTest, environmentManager = null) {
  const key = keyToTest || resolveGnaniApiKey(environmentManager);

  if (!isValidKeyFormat(key)) {
    return {
      valid: false,
      error: "Invalid API key format. Expected 16-256 alphanumeric characters without spaces.",
    };
  }

  return {
    valid: true,
    status: "saved, not verified",
    message: "saved, not verified",
  };
}

/**
 * Handler for gnani:save-key IPC.
 * Saves key into secure storage via environmentManager.
 */
async function handleSaveKey(event, key, environmentManager = null) {
  if (!key || typeof key !== "string" || !isValidKeyFormat(key)) {
    throw new GnaniError("Invalid API key format. Expected 16-256 alphanumeric characters without spaces.", "INVALID_ARGUMENT");
  }
  const trimmed = key.trim();
  if (!environmentManager) {
    return { success: false, error: "Secure storage is unavailable" };
  }

  let res;
  try {
    if (typeof environmentManager.saveGnaniApiKey === "function") {
      res = await environmentManager.saveGnaniApiKey(trimmed);
    } else if (typeof environmentManager._saveKey === "function") {
      res = await environmentManager._saveKey("GNANI_API_KEY", trimmed);
    } else {
      return { success: false, error: "Secure storage is unavailable" };
    }
  } catch (err) {
    return { success: false, error: err?.message || "Failed to persist key" };
  }

  if (res && res.success === false) {
    return { success: false, error: res.error || "Failed to save API key" };
  }

  return { success: true };
}

/**
 * Handler for gnani:scan-project IPC.
 */
async function handleScanProject(event, folders) {
  if (!Array.isArray(folders) || folders.length === 0) {
    throw new GnaniError("folders must be a non-empty array of directory paths", "INVALID_ARGUMENT");
  }

  for (const f of folders) {
    if (typeof f !== "string" || !f.trim()) {
      throw new GnaniError("Each folder path must be a non-empty string", "INVALID_ARGUMENT");
    }
  }

  const result = scanProjectFolders(folders);
  return {
    terms: result.terms,
    scannedFiles: result.scannedFiles,
  };
}

/**
 * Handler for gnani:get-status IPC.
 */
async function handleGetStatus(event, environmentManager = null) {
  const apiKey = resolveGnaniApiKey(environmentManager);
  return {
    configured: Boolean(apiKey && isValidKeyFormat(apiKey)),
    queueLength: getQueueLength(),
    activeRequests: getActiveRequests(),
    model: "prisma-v3.0",
    defaultLanguage: "hi-IN",
  };
}

/**
 * Handler for gnani:cancel IPC.
 * Aborts the active transcription or dequeues a pending job.
 */
async function handleCancel(event, requestId = null) {
  if (requestId) {
    const cancelled = globalQueue.cancel(requestId);
    return { success: true, cancelled };
  }
  const cancelled = globalQueue.cancelAll();
  return { success: true, cancelled };
}

/**
 * Registers all Gnani IPC handlers with ipcMain.
 *
 * @param {object} params
 * @param {object} [params.ipcMain] - Electron ipcMain or mock
 * @param {object} [params.environmentManager] - EnvironmentManager instance
 * @param {object} [params.databaseManager] - DatabaseManager instance
 */
function registerGnaniIpc({ ipcMain, environmentManager, databaseManager } = {}) {
  let main = ipcMain;
  if (!main) {
    try {
      main = require("electron").ipcMain;
    } catch {
      // Electron not available (e.g. running in pure unit test without mock)
      return;
    }
  }

  if (!main || typeof main.handle !== "function") return;

  main.handle("gnani:transcribe", (event, audioBuffer, options) =>
    handleTranscribe(event, audioBuffer, options, environmentManager, databaseManager)
  );

  main.handle("gnani:cancel", (event, requestId) =>
    handleCancel(event, requestId)
  );

  main.handle("gnani:test-key", (event, keyToTest) =>
    handleTestKey(event, keyToTest, environmentManager)
  );

  main.handle("gnani:save-key", (event, key) =>
    handleSaveKey(event, key, environmentManager)
  );

  main.handle("gnani:scan-project", (event, folders) =>
    handleScanProject(event, folders)
  );

  main.handle("gnani:get-status", (event) =>
    handleGetStatus(event, environmentManager)
  );
}

module.exports = {
  registerGnaniIpc,
  handleTranscribe,
  handleCancel,
  handleTestKey,
  handleSaveKey,
  handleScanProject,
  handleGetStatus,
  isValidKeyFormat,
  resolveGnaniApiKey,
  validateSenderFrame,
  isValidAudioBufferType,
  MAX_AUDIO_BYTES,
  ALLOWED_FORMATS,
};
