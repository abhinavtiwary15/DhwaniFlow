const Database = require("better-sqlite3");
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { validateWords, validateSetting, filterSettings } = require("./settings-schema");

class DatabaseManager {
  constructor({ DatabaseClass = Database, userData = app.getPath("userData") } = {}) {
    this.DatabaseClass = DatabaseClass;
    this.userData = userData;
    this.filename = path.join(
      userData,
      process.env.NODE_ENV === "development" ? "transcriptions-dev.db" : "transcriptions.db"
    );
    this.initDatabase();
    this.deleteTranscriptionsExpiredBefore(this.getSetting("transcriptRetentionDays", 30));
    this.retentionTimer = setInterval(
      () => this.deleteTranscriptionsExpiredBefore(this.getSetting("transcriptRetentionDays", 30)),
      3600000
    );
    this.retentionTimer.unref?.();
  }

  initDatabase() {
    fs.mkdirSync(this.userData, { recursive: true });
    this.db = new this.DatabaseClass(this.filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transcriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS custom_dictionary (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT NOT NULL, replacement TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    `);
    const columns = {
      transcriptions: {
        raw_text: "TEXT",
        status: "TEXT NOT NULL DEFAULT 'completed'",
        error_message: "TEXT",
        error_code: "TEXT",
        route_kind: "TEXT",
        client_transcription_id: "TEXT",
        provider: "TEXT",
        model: "TEXT",
        audio_duration_ms: "INTEGER",
        deleted_at: "TEXT",
      },
      custom_dictionary: { deleted_at: "TEXT" },
      snippets: { deleted_at: "TEXT" },
    };
    for (const [table, definitions] of Object.entries(columns)) {
      const existing = new Set(
        this.db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((column) => column.name)
      );
      for (const [name, type] of Object.entries(definitions))
        if (!existing.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
    // Retired preferences (including any old plaintext credentials) are not
    // settings in this product. The encrypted Gnani store is separate.
    const accepted = filterSettings(this.getSettings());
    for (const { key } of this.db.prepare("SELECT key FROM settings").all())
      if (!Object.hasOwn(accepted, key))
        this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  saveTranscription(text, rawText = null, options = {}) {
    if (
      typeof text !== "string" ||
      text.length > 1048576 ||
      (rawText !== null && (typeof rawText !== "string" || rawText.length > 1048576))
    )
      throw new Error("Invalid transcription text");
    const {
      status = "completed",
      errorMessage = null,
      errorCode = null,
      routeKind = null,
      clientTranscriptionId = randomUUID(),
      provider = "gnani",
      model = "prisma-v3.0",
      audioDurationMs = null,
    } = options;
    if (!["completed", "failed"].includes(status)) throw new Error("Invalid transcription status");
    for (const value of [
      errorMessage,
      errorCode,
      routeKind,
      clientTranscriptionId,
      provider,
      model,
    ])
      if (value !== null && (typeof value !== "string" || value.length > 4096))
        throw new Error("Invalid transcription metadata");
    if (
      audioDurationMs !== null &&
      (!Number.isFinite(audioDurationMs) || audioDurationMs < 0 || audioDurationMs > 121000)
    )
      throw new Error("Invalid recording duration");
    const timestamp = options.analyticsOccurredAt
      ? new Date(options.analyticsOccurredAt).toISOString()
      : new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO transcriptions (text, raw_text, status, error_message, error_code, route_kind, client_transcription_id, provider, model, audio_duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        text,
        rawText,
        status,
        errorMessage,
        errorCode,
        routeKind,
        clientTranscriptionId,
        provider,
        model,
        audioDurationMs,
        timestamp
      );
    const id = Number(result.lastInsertRowid);
    return { success: true, id, transcription: this.getTranscriptionById(id) };
  }

  getTranscriptions(limit = 100, { includeDiscarded = false } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
      throw new Error("Invalid history limit");
    return this.db
      .prepare(
        `SELECT * FROM transcriptions WHERE deleted_at IS NULL ${includeDiscarded ? "" : "AND status <> 'discarded'"} ORDER BY id DESC LIMIT ?`
      )
      .all(limit);
  }
  getTranscriptionById(id) {
    return (
      this.db.prepare("SELECT * FROM transcriptions WHERE id = ? AND deleted_at IS NULL").get(id) ||
      null
    );
  }
  deleteTranscription(id) {
    return {
      success: true,
      deleted: this.db.prepare("DELETE FROM transcriptions WHERE id = ?").run(id).changes,
    };
  }
  clearTranscriptions() {
    return { success: true, cleared: this.db.prepare("DELETE FROM transcriptions").run().changes };
  }
  updateTranscriptionText(id, text, rawText) {
    if (
      typeof text !== "string" ||
      text.length > 1048576 ||
      (rawText !== undefined && rawText !== null && typeof rawText !== "string")
    )
      throw new Error("Invalid transcription text");
    if (rawText === undefined)
      return (
        this.db.prepare("UPDATE transcriptions SET text = ? WHERE id = ?").run(text, id).changes > 0
      );
    return (
      this.db
        .prepare("UPDATE transcriptions SET text = ?, raw_text = ? WHERE id = ?")
        .run(text, rawText, id).changes > 0
    );
  }
  deleteTranscriptionsExpiredBefore(days) {
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      throw new Error("Invalid history retention");
    const before = new Date(Date.now() - days * 86400000).toISOString();
    return {
      success: true,
      deleted: this.db
        .prepare("DELETE FROM transcriptions WHERE datetime(timestamp) < datetime(?)")
        .run(before).changes,
    };
  }

  getSetting(key, fallback = undefined) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  }
  setSetting(key, value) {
    validateSetting(key, value);
    this.db
      .prepare(
        "INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
      )
      .run(key, JSON.stringify(value), Date.now());
    return true;
  }
  getSettings() {
    const values = {};
    for (const row of this.db.prepare("SELECT key,value FROM settings").all()) {
      try {
        values[row.key] = JSON.parse(row.value);
      } catch {
        /* Ignore corrupt setting. */
      }
    }
    return values;
  }
  clearSettings() {
    this.db.prepare("DELETE FROM settings").run();
    return true;
  }

  getDictionary() {
    return this.db
      .prepare("SELECT word FROM custom_dictionary WHERE deleted_at IS NULL ORDER BY id")
      .all()
      .map((row) => row.word);
  }
  applyDictionaryChanges({ add = [], remove = [] } = {}) {
    validateWords(add);
    validateWords(remove);
    const key = (word) => word.normalize("NFC").trim().toLowerCase();
    return this.db.transaction(() => {
      let added = 0,
        removed = 0;
      const existing = new Map(
        this.db
          .prepare("SELECT id,word,deleted_at FROM custom_dictionary")
          .all()
          .map((row) => [key(row.word), row])
      );
      for (const word of remove) {
        const row = existing.get(key(word));
        if (row) {
          this.db.prepare("DELETE FROM custom_dictionary WHERE id = ?").run(row.id);
          existing.delete(key(word));
          removed++;
        }
      }
      for (const word of add) {
        const row = existing.get(key(word));
        if (row && !row.deleted_at) continue;
        if (row) this.db.prepare("DELETE FROM custom_dictionary WHERE id = ?").run(row.id);
        const result = this.db
          .prepare("INSERT INTO custom_dictionary (word) VALUES (?)")
          .run(word.normalize("NFC").trim());
        existing.set(key(word), { id: result.lastInsertRowid, word, deleted_at: null });
        added++;
      }
      return { success: true, added, removed };
    })();
  }
  setDictionary(words) {
    validateWords(words);
    const keys = new Set(words.map((word) => word.normalize("NFC").trim().toLowerCase()));
    return this.applyDictionaryChanges({
      add: words,
      remove: this.getDictionary().filter(
        (word) => !keys.has(word.normalize("NFC").trim().toLowerCase())
      ),
    });
  }
  getSnippets() {
    return this.db
      .prepare("SELECT id,trigger,replacement FROM snippets WHERE deleted_at IS NULL ORDER BY id")
      .all();
  }
  setSnippets(snippets) {
    if (
      !Array.isArray(snippets) ||
      snippets.length > 1000 ||
      snippets.some(
        (item) =>
          !item ||
          typeof item.trigger !== "string" ||
          !item.trigger.trim() ||
          item.trigger.length > 100 ||
          typeof item.replacement !== "string" ||
          item.replacement.length > 10000
      )
    )
      throw new Error("Invalid snippets");
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM snippets").run();
      const insert = this.db.prepare("INSERT INTO snippets (trigger,replacement) VALUES (?,?)");
      const seen = new Set();
      for (const item of snippets) {
        const key = item.trigger.trim().toLowerCase();
        if (!seen.has(key)) {
          insert.run(item.trigger.trim(), item.replacement);
          seen.add(key);
        }
      }
    })();
    return true;
  }
  resetLocalData() {
    if (path.resolve(path.dirname(this.filename)) !== path.resolve(this.userData))
      throw new Error("Invalid database reset scope");
    this.db.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(this.filename + suffix, { force: true });
    this.initDatabase();
  }
  cleanup() {
    clearInterval(this.retentionTimer);
    this.db.close();
  }
}

module.exports = DatabaseManager;
