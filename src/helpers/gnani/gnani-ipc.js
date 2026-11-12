const { types } = require("node:util");
const path = require("node:path");
const {
  transcribe,
  globalQueue,
  getQueueLength,
  getActiveRequests,
  GnaniError,
  GnaniNoKeyError,
  GnaniAudioTooLongError,
} = require("./gnani-client");
const { validateSender: validateSenderFrame } = require("../ipc-security");
const { validateWavHeader } = require("./wav-utils");
const { mapLanguageCode, KNOWN_INDIC_LANGUAGES } = require("./language-map");
const { buildKeyterms } = require("./keyterms");
const { scanProjectFoldersAsync } = require("./project-terms");
const devTerms = require("./data/dev-terms.json");
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["verbatim", "transcribe", "codemix", "transliterate"]);
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const invalid = (message) => new GnaniError(message, "INVALID_ARGUMENT");
function isValidAudioBufferType(value) {
  return Buffer.isBuffer(value) || types.isUint8Array(value) || types.isArrayBuffer(value);
}
function isValidKeyFormat(key) {
  return typeof key === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(key.trim());
}
function resolveGnaniApiKey(environment) {
  return environment?.getGnaniApiKey?.() || environment?._getKey?.("GNANI_API_KEY") || "";
}

async function handleTranscribe(event, audio, options = {}, environment, database) {
  validateSenderFrame(event);
  if (!isValidAudioBufferType(audio)) throw invalid("Invalid audio buffer type");
  if (!audio.byteLength) throw invalid("Audio cannot be empty");
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new GnaniAudioTooLongError();
  const wav = types.isArrayBuffer(audio)
    ? Buffer.from(audio)
    : Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  try {
    if (!validateWavHeader(wav).dataSize) throw invalid("No audio samples");
  } catch {
    throw invalid("Invalid WAV audio");
  }
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !["language", "format", "keyterms", "requestId"].includes(key)
    )
  )
    throw invalid("Invalid transcription options");
  if (options.requestId !== undefined && !validId(options.requestId))
    throw invalid("Invalid request ID");
  const format = options.format ?? "transcribe";
  if (!ALLOWED_FORMATS.has(format)) throw invalid("Invalid speech format");
  const language = options.language ?? "hi-IN";
  if (
    typeof language !== "string" ||
    language.length > 50 ||
    language.split(",").length > 4 ||
    !language
      .split(",")
      .every(
        (part) =>
          /^(?:auto|indic-auto)$/i.test(part.trim()) ||
          (/^[a-z]{2}(?:[-_]IN)?$/i.test(part.trim()) &&
            KNOWN_INDIC_LANGUAGES.has(part.trim().slice(0, 2).toLowerCase()))
      )
  )
    throw invalid("Unsupported speech language");
  let caller = options.keyterms ?? [];
  if (typeof caller === "string")
    caller = caller
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
  if (
    !Array.isArray(caller) ||
    caller.length > 200 ||
    caller.some((term) => typeof term !== "string" || term.length > 64) ||
    caller.join(", ").length > 2000
  )
    throw invalid("Invalid keyterms");
  const key = resolveGnaniApiKey(environment);
  if (!key) throw new GnaniNoKeyError();
  const keyterms = buildKeyterms([database?.getDictionary?.() || [], caller, devTerms], {
    maxTerms: 200,
    maxChars: 2000,
  });
  return transcribe({
    wav,
    apiKey: key,
    language: mapLanguageCode(language, "hi-IN"),
    format,
    keyterms,
    requestId: options.requestId,
  });
}
async function handleCancel(event, requestId = null) {
  validateSenderFrame(event);
  if (requestId !== null && !validId(requestId)) throw invalid("Invalid cancellation ID");
  return {
    success: true,
    cancelled: requestId ? globalQueue.cancel(requestId) : globalQueue.cancelAll(),
  };
}
async function handleTestKey(event, entered, environment) {
  validateSenderFrame(event);
  if (!isValidKeyFormat(entered || resolveGnaniApiKey(environment)))
    return { valid: false, error: "Invalid key format" };
  return {
    valid: true,
    status: "format valid, not verified",
    message: "Format checked locally. The speech service has not verified this key.",
  };
}
async function handleSaveKey(event, key, environment) {
  validateSenderFrame(event);
  if (!isValidKeyFormat(key)) throw invalid("Invalid key format");
  if (!environment?.saveGnaniApiKey) return { success: false, error: "Secure storage unavailable" };
  try {
    require("../debugLogger").registerSecret(key.trim());
    const result = await environment.saveGnaniApiKey(key.trim());
    if (result?.success === false)
      return { success: false, error: "Secure storage could not save the key" };
    return { success: true };
  } catch {
    return { success: false, error: "Secure storage could not save the key" };
  }
}
async function handleGetStatus(event, environment) {
  validateSenderFrame(event);
  return {
    configured: isValidKeyFormat(resolveGnaniApiKey(environment)),
    queueLength: getQueueLength(),
    activeRequests: getActiveRequests(),
    model: "prisma-v3.0",
    defaultLanguage: "hi-IN",
  };
}
async function handleScanProject(event, folders) {
  validateSenderFrame(event);
  if (
    !Array.isArray(folders) ||
    !folders.length ||
    folders.length > 8 ||
    folders.some(
      (folder) =>
        typeof folder !== "string" ||
        folder.length > 4096 ||
        folder.includes("\0") ||
        !path.isAbsolute(folder)
    )
  )
    throw invalid("Invalid project folders");
  return scanProjectFoldersAsync(folders);
}
function registerGnaniIpc({
  ipcMain = require("electron").ipcMain,
  environmentManager,
  databaseManager,
} = {}) {
  ipcMain.handle("gnani:transcribe", (event, audio, options) =>
    handleTranscribe(event, audio, options, environmentManager, databaseManager)
  );
  ipcMain.handle("gnani:cancel", handleCancel);
  ipcMain.handle("gnani:test-key", (event, key) => handleTestKey(event, key, environmentManager));
  ipcMain.handle("gnani:save-key", (event, key) => handleSaveKey(event, key, environmentManager));
  ipcMain.handle("gnani:get-status", (event) => handleGetStatus(event, environmentManager));
  ipcMain.handle("gnani:scan-project", handleScanProject);
}
module.exports = {
  registerGnaniIpc,
  handleTranscribe,
  handleCancel,
  handleTestKey,
  handleSaveKey,
  handleGetStatus,
  handleScanProject,
  validateSenderFrame,
  isValidAudioBufferType,
  isValidKeyFormat,
  resolveGnaniApiKey,
  MAX_AUDIO_BYTES,
  ALLOWED_FORMATS,
};
