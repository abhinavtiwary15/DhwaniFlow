const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const { app } = require("electron");
const debugLogger = require("./debugLogger");
const { normalizeUiLanguage } = require("./i18nMain");
const secretCrypto = require("./secretCrypto");
const SECRET_KEYS = ["GNANI_API_KEY"];

const SECRET_KEY_SET = new Set(SECRET_KEYS);

const PERSISTED_KEYS = [
  ...SECRET_KEYS,
  "DICTATION_KEY",
  "COMMAND_KEY",
  "COMMAND_MODE_ENABLED",
  "ACTIVATION_MODE",
  "FLOATING_ICON_AUTO_HIDE",
  "PANEL_START_POSITION",
  "START_MINIMIZED",
  "UI_LANGUAGE",
];

// Module-level so writes are serialized across all instances — hotkeyManager
// creates its own EnvironmentManager alongside the main.js singleton.
let envWriteQueue = Promise.resolve();

class EnvironmentManager {
  constructor() {
    this._secrets = new Map();
    this.loadEnvironmentVariables();
  }

  loadEnvironmentVariables() {
    // App config (.env in userData) takes precedence over system env vars,
    // so keys saved by the user in Settings always win.
    const userDataEnv = path.join(app.getPath("userData"), ".env");
    try {
      if (fs.existsSync(userDataEnv)) {
        require("dotenv").config({ path: userDataEnv, override: true });
      }
    } catch {}

    const fallbackPaths = [
      path.join(__dirname, "..", "..", ".env"), // Development
      path.join(process.resourcesPath, ".env"),
      path.join(process.resourcesPath, "app.asar.unpacked", ".env"),
      path.join(process.resourcesPath, "app", ".env"), // Legacy
    ];

    for (const envPath of fallbackPaths) {
      try {
        if (fs.existsSync(envPath)) {
          require("dotenv").config({ path: envPath });
        }
      } catch {}
    }
  }

  // Encryption initializes lazily. Probing it eagerly would touch the macOS
  // Keychain before any window is visible. Migration and _loadAllSecrets are
  // both no-ops on fresh installs, so neither path triggers Keychain until
  // the user actually saves their first secret.
  async init() {
    if (process.env.GNANI_API_KEY)
      await this._saveSecretKey("GNANI_API_KEY", process.env.GNANI_API_KEY);
    if (!fs.existsSync(this._getMigrationSentinelPath())) {
      await this._migrateToSecureStorage();
    }
    await this._loadAllSecrets();
  }

  _getMigrationSentinelPath() {
    return path.join(this._getSecureKeysDir(), ".migrated");
  }

  _encryptionAvailable() {
    try {
      return secretCrypto.isAvailable();
    } catch {
      return false;
    }
  }

  _getSecureKeysDir() {
    return path.join(app.getPath("userData"), "secure-keys");
  }

  _getSecretFilePath(envVarName) {
    return path.join(this._getSecureKeysDir(), `${envVarName}.enc`);
  }

  async _loadAllSecrets() {
    await Promise.all(SECRET_KEYS.map((name) => this._loadSecretKey(name)));
  }

  async _loadSecretKey(envVarName) {
    const filePath = this._getSecretFilePath(envVarName);
    try {
      const buffer = await fsPromises.readFile(filePath);
      const { value, needsReencrypt } = secretCrypto.decrypt(buffer);
      debugLogger.registerSecret(value);
      this._secrets.set(envVarName, value);
      delete process.env[envVarName];
      if (needsReencrypt) await this._saveSecretKey(envVarName, value);
    } catch (error) {
      if (error.code === "ENOENT") return;
      debugLogger.error(
        "Failed to decrypt secret — user must re-enter",
        { key: envVarName, code: error.code, error: error.message },
        "environment"
      );
    }
  }

  async _saveSecretKey(envVarName, value) {
    debugLogger.registerSecret(value);
    if (!value) {
      await this._deleteSecretKey(envVarName);
      return;
    }

    delete process.env[envVarName];

    const dir = this._getSecureKeysDir();
    await fsPromises.mkdir(dir, { recursive: true });

    const filePath = this._getSecretFilePath(envVarName);
    const tmpPath = `${filePath}.tmp`;
    const encrypted = secretCrypto.encrypt(value);

    await fsPromises.writeFile(tmpPath, encrypted);
    await fsPromises.rename(tmpPath, filePath);
    this._secrets.set(envVarName, value);
  }

  async _deleteSecretKey(envVarName) {
    this._secrets.delete(envVarName);
    delete process.env[envVarName];
    try {
      await fsPromises.unlink(this._getSecretFilePath(envVarName));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async _migrateToSecureStorage() {
    const dir = this._getSecureKeysDir();
    await fsPromises.mkdir(dir, { recursive: true });

    const migrated = [];
    try {
      for (const name of SECRET_KEYS) {
        const value = process.env[name];
        if (!value) continue;
        await this._saveSecretKey(name, value);
        // Round-trip verify before stripping plaintext .env.
        const buffer = await fsPromises.readFile(this._getSecretFilePath(name));
        if (secretCrypto.decrypt(buffer).value !== value) {
          throw new Error(`round-trip verification failed for ${name}`);
        }
        migrated.push(name);
      }
    } catch (error) {
      debugLogger.error(
        "Secret migration aborted — plaintext .env preserved",
        { error: error.message, migrated },
        "environment"
      );
      return;
    }

    // Write sentinel before stripping plaintext from .env so a crash mid-rewrite is recoverable.
    await fsPromises.writeFile(this._getMigrationSentinelPath(), "");
    const envPath = path.join(app.getPath("userData"), ".env");
    if (fs.existsSync(envPath)) await this._writeEnvFileAtomic(envPath);
    debugLogger.info(
      "Migrated secrets to encrypted storage",
      { count: migrated.length },
      "environment"
    );
  }

  _writeEnvFileAtomic(envPath) {
    // Concurrent write+rename pairs share the same .env.tmp path, and the
    // loser's rename throws ENOENT (#903).
    envWriteQueue = envWriteQueue.catch(() => {}).then(() => this._writeEnvFile(envPath));
    return envWriteQueue;
  }

  async _writeEnvFile(envPath) {
    let envContent = "# DhwaniFlow preferences\n";
    for (const key of PERSISTED_KEYS) {
      if (key === "GNANI_API_KEY" || SECRET_KEY_SET.has(key)) continue;
      if (process.env[key]) {
        envContent += `${key}=${process.env[key]}\n`;
      }
    }
    const tmpPath = `${envPath}.tmp`;
    await fsPromises.writeFile(tmpPath, envContent, "utf8");
    await fsPromises.rename(tmpPath, envPath);
  }

  _getKey(envVarName) {
    if (SECRET_KEY_SET.has(envVarName)) {
      return this._secrets.get(envVarName) || "";
    }
    return process.env[envVarName] || "";
  }

  async _saveKey(envVarName, key) {
    if (SECRET_KEY_SET.has(envVarName)) {
      if (!this._encryptionAvailable()) {
        return { success: false, error: "Secure storage is unavailable" };
      }
      try {
        await this._saveSecretKey(envVarName, key);
        return { success: true };
      } catch (error) {
        debugLogger.error(
          "Failed to persist encrypted secret",
          { key: envVarName, error: error.message },
          "environment"
        );
        return { success: false, error: error.message };
      }
    } else if (key) {
      process.env[envVarName] = key;
    } else {
      delete process.env[envVarName];
    }
    return { success: true };
  }

  getDictationKey() {
    return this._getKey("DICTATION_KEY");
  }

  saveDictationKey(key) {
    const result = this._saveKey("DICTATION_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getCommandKey() {
    return (
      this._getKey("COMMAND_KEY") ||
      (process.platform === "darwin" ? "Control+Option+Space" : "Control+Alt+Space")
    );
  }

  saveCommandKey(key) {
    const result = this._saveKey("COMMAND_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getCommandModeEnabled() {
    return this._getKey("COMMAND_MODE_ENABLED") === "true";
  }

  saveCommandModeEnabled(enabled) {
    const result = this._saveKey("COMMAND_MODE_ENABLED", String(Boolean(enabled)));
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getActivationMode() {
    const mode = this._getKey("ACTIVATION_MODE");
    return mode === "push" ? "push" : "tap";
  }

  saveActivationMode(mode) {
    const validMode = mode === "push" ? "push" : "tap";
    const result = this._saveKey("ACTIVATION_MODE", validMode);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getFloatingIconAutoHide() {
    return this._getKey("FLOATING_ICON_AUTO_HIDE") === "true";
  }

  saveFloatingIconAutoHide(enabled) {
    const result = this._saveKey("FLOATING_ICON_AUTO_HIDE", String(enabled));
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getStartMinimized() {
    return this._getKey("START_MINIMIZED") === "true";
  }

  saveStartMinimized(enabled) {
    const result = this._saveKey("START_MINIMIZED", String(enabled));
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getPanelStartPosition() {
    const v = this._getKey("PANEL_START_POSITION");
    if (v === "bottom-right" || v === "center" || v === "bottom-left") return v;
    return "bottom-right";
  }

  savePanelStartPosition(position) {
    const result = this._saveKey("PANEL_START_POSITION", position);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getUiLanguage(fallbackLanguage = "") {
    const language = this._getKey("UI_LANGUAGE") || fallbackLanguage;
    return language ? normalizeUiLanguage(language) : "";
  }

  saveUiLanguage(language) {
    const normalized = normalizeUiLanguage(language);
    const result = this._saveKey("UI_LANGUAGE", normalized);
    this.saveAllKeysToEnvFile().catch(() => {});
    return { ...result, language: normalized };
  }

  async saveAllKeysToEnvFile() {
    const envPath = path.join(app.getPath("userData"), ".env");
    await this._writeEnvFileAtomic(envPath);
    require("dotenv").config({ path: envPath });
    return { success: true, path: envPath };
  }

  saveDebugLogging(enabled) {
    const logLevel = enabled ? "debug" : "info";
    const envPath = path.join(app.getPath("userData"), ".env");
    // Queue the entire read-modify-write so other saves cannot restore a stale level.
    envWriteQueue = envWriteQueue
      .catch(() => {})
      .then(async () => {
        let content = "";
        try {
          content = await fsPromises.readFile(envPath, "utf8");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }

        const lines = content.split("\n");
        const logLevelIndex = lines.findIndex((line) =>
          line.trim().startsWith("OPENWHISPR_LOG_LEVEL=")
        );
        const logLevelLine = `OPENWHISPR_LOG_LEVEL=${logLevel}`;
        if (logLevelIndex !== -1) {
          lines[logLevelIndex] = logLevelLine;
        } else {
          if (lines[lines.length - 1] !== "") lines.push("");
          lines.push(logLevelLine);
        }

        const tmpPath = `${envPath}.tmp`;
        await fsPromises.writeFile(tmpPath, lines.join("\n"), "utf8");
        await fsPromises.rename(tmpPath, envPath);
        process.env.OPENWHISPR_LOG_LEVEL = logLevel;
      });
    return envWriteQueue;
  }

  async clearAllPersistedData() {
    await envWriteQueue.catch(() => {});
    this._secrets.clear();
    for (const envVarName of PERSISTED_KEYS) {
      delete process.env[envVarName];
    }
    delete process.env.CUSTOM_REASONING_API_KEY;

    await Promise.all([
      fsPromises.rm(path.join(app.getPath("userData"), ".env"), { force: true }),
      fsPromises.rm(this._getSecureKeysDir(), { recursive: true, force: true }),
    ]);
    return { success: true };
  }

  // Removes a single key's line from .env, preserving every other line
  // verbatim. saveAllKeysToEnvFile() would instead regenerate the file from
  // PERSISTED_KEYS, dropping hand-added lines and materializing session/shell
  // env values into the file.
  removeKeyFromEnvFile(key) {
    const envPath = path.join(app.getPath("userData"), ".env");
    envWriteQueue = envWriteQueue.catch(() => {}).then(() => this._removeKeyLine(envPath, key));
    return envWriteQueue;
  }

  async _removeKeyLine(envPath, key) {
    let content;
    try {
      content = await fsPromises.readFile(envPath, "utf8");
    } catch {
      return; // No .env — nothing to remove.
    }
    const keyLine = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    const lines = content.split("\n");
    const kept = lines.filter((line) => !keyLine.test(line));
    if (kept.length === lines.length) return;
    const tmpPath = `${envPath}.tmp`;
    await fsPromises.writeFile(tmpPath, kept.join("\n"), "utf8");
    await fsPromises.rename(tmpPath, envPath);
  }

  getGnaniApiKey() {
    return this._getKey("GNANI_API_KEY");
  }

  async saveGnaniApiKey(key) {
    return await this._saveKey("GNANI_API_KEY", key);
  }
}

module.exports = EnvironmentManager;
