const { DatabaseSync } = require("node:sqlite");
// Exercises production SQL against SQLite while Node and Electron use different
// native ABIs. Packaged Electron smoke tests cover better-sqlite3 itself.
class SqliteAdapter {
  constructor(filename) {
    this.connection = new DatabaseSync(filename);
  }
  exec(sql) {
    return this.connection.exec(sql);
  }
  prepare(sql) {
    return this.connection.prepare(sql);
  }
  pragma(sql) {
    return this.connection.exec("PRAGMA " + sql);
  }
  transaction(callback) {
    return (...args) => {
      this.connection.exec("BEGIN");
      try {
        const result = callback(...args);
        this.connection.exec("COMMIT");
        return result;
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    };
  }
  close() {
    this.connection.close();
  }
}
module.exports = { SqliteAdapter };
