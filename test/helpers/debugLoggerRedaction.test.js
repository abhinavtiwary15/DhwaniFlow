const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("debugLogger redacts stored keys, tokens, and Error stacks before write", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-redact-"));
  const electronPath = require.resolve("electron");
  const loggerPath = require.resolve("../../src/helpers/debugLogger.js");
  const originalElectronCache = require.cache[electronPath];
  const originalLoggerCache = require.cache[loggerPath];

  const STORED_SECRET = "gnani_live_secret_token_1234567890";
  const SYNTHETIC_KEY = "sk-gnani-synthetic-token-998877";
  const BEARER_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token12345";
  process.env.GNANI_API_KEY = STORED_SECRET;

  require.cache[electronPath] = {
    exports: {
      app: {
        isReady: () => true,
        getPath: () => tempDir,
        getAppPath: () => "/mock/app",
        getVersion: () => "1.0.0-test",
        isPackaged: false,
      },
    },
  };
  delete require.cache[loggerPath];

  const capturedConsole = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => capturedConsole.push(args.join(" "));
  console.error = (...args) => capturedConsole.push(args.join(" "));

  try {
    const debugLogger = require(loggerPath);
    debugLogger.initializeFileLogging();

    // 1. Log stored key in string message
    debugLogger.info(`Configuring client with key ${STORED_SECRET}`);

    // 2. Log Bearer and prefixed token patterns
    debugLogger.debug(`Request headers: Authorization: ${BEARER_TOKEN}`);
    debugLogger.debug(`Target token: ${SYNTHETIC_KEY}`);

    // 3. Log object with sensitive property names
    debugLogger.info("Settings payload", {
      gnaniApiKey: STORED_SECRET,
      apiKey: SYNTHETIC_KEY,
      normalField: "safe-value",
    });

    // 4. Log Error with key in message and stack
    const sensitiveErr = new Error(`Connection failed with key ${STORED_SECRET}`);
    sensitiveErr.code = "AUTH_ERROR";
    debugLogger.error("Failed speech request", sensitiveErr);

    // Close and flush log file
    const logFile = debugLogger.getLogPath();
    const stream = debugLogger.logStream;
    if (stream && typeof stream.fd !== "number") {
      await new Promise((resolve) => stream.once("open", resolve));
    }
    debugLogger.close();
    if (stream) {
      await new Promise((resolve) => stream.once("finish", resolve));
    }

    const logFileContent = fs.readFileSync(logFile, "utf8");

    // Assert STORED_SECRET never appears anywhere
    assert.ok(!logFileContent.includes(STORED_SECRET), "STORED_SECRET leaked in log file");
    for (const line of capturedConsole) {
      assert.ok(!line.includes(STORED_SECRET), `STORED_SECRET leaked in console: ${line}`);
    }

    // Assert SYNTHETIC_KEY never appears anywhere
    assert.ok(!logFileContent.includes(SYNTHETIC_KEY), "SYNTHETIC_KEY leaked in log file");
    for (const line of capturedConsole) {
      assert.ok(!line.includes(SYNTHETIC_KEY), `SYNTHETIC_KEY leaked in console: ${line}`);
    }

    // Assert BEARER_TOKEN raw secret never appears
    assert.ok(!logFileContent.includes("token12345"), "Bearer token leaked in log file");

    // Assert [REDACTED] was written in their place
    assert.ok(logFileContent.includes("[REDACTED]"), "Missing [REDACTED] tag in log file");
  } finally {
    console.log = originalLog;
    console.error = originalError;
    delete process.env.GNANI_API_KEY;
    delete require.cache[loggerPath];
    if (originalLoggerCache) require.cache[loggerPath] = originalLoggerCache;
    if (originalElectronCache) require.cache[electronPath] = originalElectronCache;
    else delete require.cache[electronPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
