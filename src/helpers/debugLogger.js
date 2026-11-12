const fs = require("fs");
const os = require("os");
const path = require("path");
const { app } = require("electron");

const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const normalizeLevel = (value) => {
  if (!value) return null;
  const lower = String(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(LOG_LEVELS, lower) ? lower : null;
};

const readArgLogLevel = () => {
  const argv = process.argv || [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--log-level" && argv[i + 1]) {
      return argv[i + 1];
    }
    if (arg.startsWith("--log-level=")) {
      return arg.split("=", 2)[1];
    }
  }
  return null;
};

const hasConsoleLogOptIn = () => (process.argv || []).includes("--console-logs");

const SENSITIVE_KEY_REGEX =
  /^(?:gnani)?[_-]?(?:api[_-]?key|secret|token|password|authorization|x-api-key(?:-id)?|client[_-]?secret|access[_-]?token)$/i;

const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9_.-]{10,}/gi,
  /\b(?:sk|gnani|vachana|key)[_-][A-Za-z0-9_-]{8,}\b/gi,
  /X-API-Key(?:-ID)?:\s*[^\s,;]+/gi,
  /(api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}["']?/gi,
];
const configuredSecrets = new Set();

function redactString(str) {
  if (typeof str !== "string" || !str) return str;
  let result = str;
  for (const secret of configuredSecrets) result = result.split(secret).join("[REDACTED]");

  // Stored environment API key
  const envKey = process.env.GNANI_API_KEY;
  if (envKey && typeof envKey === "string" && envKey.trim().length >= 8) {
    result = result.split(envKey.trim()).join("[REDACTED]");
  }

  // Token patterns
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (/^Bearer\s+/i.test(match)) return "Bearer [REDACTED]";
      if (/^X-API-Key/i.test(match)) return "X-API-Key-ID: [REDACTED]";
      if (/(?:api[_-]?key|secret|password|token)\s*[:=]/i.test(match)) {
        const prefix = match.split(/[:=]/)[0];
        return `${prefix}=[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }

  return result;
}

function redactValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const serialized = {
      name: value.name,
      message: redactString(value.message),
      ...(value.code ? { code: value.code } : {}),
      ...(value.stack ? { stack: redactString(value.stack) } : {}),
    };
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        serialized[key] = "[REDACTED]";
      } else {
        serialized[key] = redactValue(value[key], seen);
      }
    }
    return serialized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const redactedObj = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      redactedObj[key] = "[REDACTED]";
    } else {
      redactedObj[key] = redactValue(val, seen);
    }
  }
  return redactedObj;
}

class DebugLogger {
  constructor() {
    this.logLevel = this.resolveLogLevel();
    this.levelValue = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info;
    this.debugMode = this.isDebugEnabled();
    this.logFile = null;
    this.logStream = null;
    this.fileLoggingEnabled = false;
    this.fileLoggingPending = this.debugMode; // Track if we need to initialize file logging later
    this.consoleLoggingEnabled = this.resolveConsoleLogging();

    // IMPORTANT: Do NOT call initializeFileLogging() here!
    // It uses app.getPath() which is unsafe before app.whenReady().
    // File logging will be initialized on first log write or via ensureFileLogging().
  }

  initializeFileLogging() {
    if (this.fileLoggingEnabled) return;

    // Check if app is ready before accessing app.getPath()
    // This is critical because app.getPath() can hang or fail before app.whenReady()
    if (!app.isReady()) {
      // App not ready yet, will try again later via ensureFileLogging() or write()
      return;
    }

    try {
      const logsDir = path.join(app.getPath("userData"), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.logFile = path.join(logsDir, `debug-${timestamp}.log`);

      this.logStream = fs.createWriteStream(this.logFile, { flags: "a" });
      this.fileLoggingEnabled = true;
      this.fileLoggingPending = false;

      this.debug("Debug logging enabled", { logFile: this.logFile });
      this.info("System Info", {
        appVersion: app.getVersion(),
        platform: process.platform,
        // The OS build decides which system-audio capture a meeting can use
        // (Windows process loopback needs 10 2004+, the macOS tap 14.2+).
        osRelease: os.release(),
        osVersion: os.version(),
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        appPath: app.getAppPath(),
        userDataPath: app.getPath("userData"),
        resourcesPath: process.resourcesPath,
        environment: process.env.NODE_ENV,
      });
    } catch (error) {
      this.fileLoggingEnabled = false;
      this.fileLoggingPending = false;
      console.error("Failed to initialize debug logging:", error);
    }
  }

  /**
   * Ensures file logging is initialized if debug mode is enabled.
   * This should be called after app.whenReady() to safely initialize file logging.
   */
  ensureFileLogging() {
    if (this.fileLoggingPending && !this.fileLoggingEnabled) {
      this.initializeFileLogging();
    }
  }

  resolveLogLevel() {
    const argLevel = normalizeLevel(readArgLogLevel());
    if (argLevel) {
      return argLevel;
    }

    const envLevel = normalizeLevel(process.env.OPENWHISPR_LOG_LEVEL || process.env.LOG_LEVEL);
    if (envLevel) {
      return envLevel;
    }

    return "info";
  }

  resolveConsoleLogging() {
    // Packaged Windows apps can inherit the launching shell's standard handles.
    return process.platform !== "win32" || !app?.isPackaged || hasConsoleLogOptIn();
  }

  refreshLogLevel() {
    const nextLevel = this.resolveLogLevel();
    if (nextLevel === this.logLevel) return;

    this.logLevel = nextLevel;
    this.levelValue = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info;
    this.debugMode = this.isDebugEnabled();

    if (this.debugMode && !this.fileLoggingEnabled) {
      this.initializeFileLogging();
    }
  }

  getLevel() {
    return this.logLevel;
  }

  isDebugEnabled() {
    return this.levelValue <= LOG_LEVELS.debug;
  }

  shouldLog(level) {
    const normalized = normalizeLevel(level) || "info";
    return LOG_LEVELS[normalized] >= this.levelValue;
  }

  serializeValue(value) {
    return redactValue(value);
  }

  formatArgs(args) {
    return args
      .map((arg) => {
        const sanitized = redactValue(arg);
        if (sanitized !== null && typeof sanitized === "object") {
          try {
            return JSON.stringify(sanitized, null, 2);
          } catch {
            return String(sanitized);
          }
        }
        return String(sanitized);
      })
      .join(" ");
  }

  formatMeta(meta) {
    if (meta === undefined) return "";
    const sanitized = redactValue(meta);
    if (typeof sanitized === "string") return sanitized;
    try {
      return JSON.stringify(sanitized, null, 2);
    } catch {
      return String(sanitized);
    }
  }

  write(level, message, meta, scope, source) {
    const normalized = normalizeLevel(level) || "info";
    if (!this.shouldLog(normalized)) return;

    // Try to initialize file logging if pending and app is ready
    if (this.fileLoggingPending && !this.fileLoggingEnabled) {
      this.initializeFileLogging();
    }

    const sanitizedMessage =
      typeof message === "string" ? redactString(message) : redactValue(message);
    const sanitizedMeta = meta !== undefined ? redactValue(meta) : undefined;

    const timestamp = new Date().toISOString();
    const scopeTag = scope ? `[${scope}]` : "";
    const sourceTag = source ? `[${source}]` : "";
    const levelTag = `[${normalized.toUpperCase()}]`;
    const baseLine = `[${timestamp}] ${levelTag}${scopeTag}${sourceTag} ${sanitizedMessage}`;
    const metaText = this.formatMeta(sanitizedMeta);
    const logLine = metaText ? `${baseLine} ${metaText}\n` : `${baseLine}\n`;

    if (this.consoleLoggingEnabled) {
      const consoleFn =
        normalized === "error" || normalized === "fatal"
          ? console.error
          : normalized === "warn"
            ? console.warn
            : console.log;

      if (sanitizedMeta !== undefined) {
        // Pass the prefix as a %s arg, not as a format string. See CodeQL js/tainted-format-string.
        consoleFn("%s", `${levelTag}${scopeTag}${sourceTag} ${sanitizedMessage}`, sanitizedMeta);
      } else {
        consoleFn(`${levelTag}${scopeTag}${sourceTag} ${sanitizedMessage}`);
      }
    }

    if (this.logStream) {
      this.logStream.write(logLine);
    }
  }

  log(...args) {
    this.write("debug", this.formatArgs(args));
  }

  debug(message, meta, scope, source) {
    this.write("debug", message, meta, scope, source);
  }

  trace(message, meta, scope, source) {
    this.write("trace", message, meta, scope, source);
  }

  info(message, meta, scope, source) {
    this.write("info", message, meta, scope, source);
  }

  warn(message, meta, scope, source) {
    this.write("warn", message, meta, scope, source);
  }

  logReasoning(stage, details) {
    this.debug(stage, details, "reasoning");
  }

  error(...args) {
    const message = `ERROR: ${this.formatArgs(args)}`;
    this.write("error", message);
  }

  fatal(...args) {
    const message = `FATAL: ${this.formatArgs(args)}`;
    this.write("fatal", message);
  }

  logEntry(entry) {
    if (!entry || typeof entry !== "object") return;
    const normalized = normalizeLevel(entry.level) || "info";
    const message = entry.message ? String(entry.message) : "";
    const scope = entry.scope ? String(entry.scope) : undefined;
    const source = entry.source ? String(entry.source) : "renderer";
    this.write(normalized, message, entry.meta, scope, source);
  }

  logFFmpegDebug(context, ffmpegPath, additionalInfo = {}) {
    if (!this.isDebugEnabled()) return;

    const debugInfo = {
      context,
      ffmpegPath,
      exists: ffmpegPath ? fs.existsSync(ffmpegPath) : false,
      platform: process.platform,
      ...additionalInfo,
    };

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      try {
        const stats = fs.statSync(ffmpegPath);
        debugInfo.fileInfo = {
          size: stats.size,
          isFile: stats.isFile(),
          // Skip X_OK check on Windows (not reliable)
          isExecutable: process.platform !== "win32" ? !!(stats.mode & fs.constants.X_OK) : false,
          executableCheckSkipped: process.platform === "win32",
          permissions: stats.mode.toString(8),
          modified: stats.mtime,
        };
      } catch (e) {
        debugInfo.statError = e.message;
      }
    }

    // Check parent directory permissions
    if (ffmpegPath) {
      const dir = path.dirname(ffmpegPath);
      try {
        fs.accessSync(dir, fs.constants.R_OK);
        debugInfo.dirReadable = true;
      } catch (e) {
        debugInfo.dirReadable = false;
        debugInfo.dirError = e.message;
      }
    }

    // Platform-specific path checks
    let possiblePaths = [];
    if (process.platform === "win32") {
      possiblePaths = [
        ffmpegPath,
        ffmpegPath?.replace(/app\.asar([/\\])/, "app.asar.unpacked$1"),
        path.join(
          process.resourcesPath || "",
          "app.asar.unpacked",
          "node_modules",
          "ffmpeg-static",
          "ffmpeg.exe"
        ),
        path.join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin", "ffmpeg.exe"),
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
      ].filter(Boolean);
    } else {
      possiblePaths = [
        ffmpegPath,
        ffmpegPath?.replace("app.asar", "app.asar.unpacked"),
        path.join(
          process.resourcesPath || "",
          "app.asar.unpacked",
          "node_modules",
          "ffmpeg-static",
          "ffmpeg"
        ),
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/bin/ffmpeg",
      ].filter(Boolean);
    }

    debugInfo.pathChecks = possiblePaths.map((p) => ({
      path: p,
      exists: fs.existsSync(p),
      normalized: path.normalize(p),
    }));

    this.debug(`FFmpeg Debug - ${context}`, debugInfo, "ffmpeg");
  }

  logAudioData(context, audioBlob) {
    if (!this.isDebugEnabled()) return;

    const audioInfo = {
      context,
      type: audioBlob?.type || "unknown",
      size: audioBlob?.size || 0,
      constructor: audioBlob?.constructor?.name || "unknown",
    };

    if (audioBlob instanceof ArrayBuffer) {
      audioInfo.byteLength = audioBlob.byteLength;
      // Check first few bytes
      const view = new Uint8Array(audioBlob, 0, Math.min(16, audioBlob.byteLength));
      audioInfo.firstBytes = Array.from(view)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    } else if (audioBlob instanceof Uint8Array) {
      audioInfo.byteLength = audioBlob.byteLength;
      const view = audioBlob.slice(0, Math.min(16, audioBlob.byteLength));
      audioInfo.firstBytes = Array.from(view)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    }

    this.debug("Audio Data Debug", audioInfo, "audio");
  }

  logProcessStart(command, args, options = {}) {
    if (!this.isDebugEnabled()) return;

    this.debug(
      "Starting process",
      {
        command,
        args,
        cwd: options.cwd || process.cwd(),
        env: {
          FFMPEG_PATH: options.env?.FFMPEG_PATH,
          FFMPEG_EXECUTABLE: options.env?.FFMPEG_EXECUTABLE,
          FFMPEG_BINARY: options.env?.FFMPEG_BINARY,
          PATH_preview: options.env?.PATH?.substring(0, 200) + "...",
        },
      },
      "process"
    );
  }

  logProcessOutput(processName, type, data) {
    if (!this.isDebugEnabled()) return;

    const output = data.toString().trim();
    if (output) {
      this.debug(`${processName} ${type}`, output, "process");
    }
  }

  logWhisperPipeline(stage, details) {
    if (!this.isDebugEnabled()) return;
    this.debug(`Whisper Pipeline - ${stage}`, details, "whisper");
  }

  logSTTPipeline(stage, details) {
    if (!this.isDebugEnabled()) return;
    this.debug(`STT Pipeline - ${stage}`, details, "stt");
  }

  getLogPath() {
    return this.logFile;
  }

  isEnabled() {
    return this.isDebugEnabled();
  }

  close() {
    if (this.logStream) {
      this.log("📝 Debug logger closing");
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Singleton instance
const debugLogger = new DebugLogger();
debugLogger.registerSecret = (value) => {
  if (typeof value === "string" && value.length >= 8) {
    configuredSecrets.add(value);
    while (configuredSecrets.size > 16)
      configuredSecrets.delete(configuredSecrets.values().next().value);
  }
};

module.exports = debugLogger;
