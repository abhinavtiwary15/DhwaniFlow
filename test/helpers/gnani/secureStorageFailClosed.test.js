const ipcFixture = require("../harness/ipc-environment").installIpcEnvironment();
require("node:test").after(() => ipcFixture.restore());
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const { handleSaveKey, resolveGnaniApiKey } = require("../../../src/helpers/gnani/gnani-ipc");

function loadEnvironmentManager(
  t,
  userDataDir,
  { encryptionAvailable = true, throwOnEncrypt = false } = {}
) {
  const envPath = require.resolve("../../../src/helpers/environment");
  const origModule = require.cache[envPath];
  const origLoad = Module._load;
  delete require.cache[envPath];

  Module._load = function (request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          getPath: () => userDataDir,
          getAppPath: () => userDataDir,
          isReady: () => false,
        },
        safeStorage: { isEncryptionAvailable: () => encryptionAvailable },
      };
    }
    if (request === "./secretCrypto") {
      return {
        isAvailable: () => encryptionAvailable,
        encrypt: (val) => {
          if (throwOnEncrypt) throw new Error("OS Keychain write failed");
          return Buffer.from(`enc:${val}`);
        },
        decrypt: (buf) => ({ value: buf.toString().replace(/^enc:/, ""), needsReencrypt: false }),
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    return require(envPath);
  } finally {
    Module._load = origLoad;
    t.after(() => {
      if (origModule) require.cache[envPath] = origModule;
      else delete require.cache[envPath];
    });
  }
}

describe("P0-1d Secure Storage Fail-Closed & Env Isolation", () => {
  const origResourcesPath = process.resourcesPath;

  test("fails closed when encryption is unavailable: returns false, does not set process.env, does not write to .env", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-store-fail-closed-"));
    process.resourcesPath = tmpDir;
    delete process.env.GNANI_API_KEY;

    t.after(() => {
      delete process.env.GNANI_API_KEY;
      process.resourcesPath = origResourcesPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const EnvironmentManager = loadEnvironmentManager(t, tmpDir, { encryptionAvailable: false });
    const envManager = new EnvironmentManager();

    // 1. Calling saveGnaniApiKey directly must fail closed
    const saveRes = await envManager.saveGnaniApiKey("valid-secret-key-12345");
    assert.equal(saveRes.success, false);
    assert.match(saveRes.error, /unavailable/i);

    // 2. process.env must NOT contain the key
    assert.equal(process.env.GNANI_API_KEY, undefined);

    // 3. handleSaveKey IPC handler must return failure to renderer
    const ipcRes = await handleSaveKey(ipcFixture.event, "valid-secret-key-12345", envManager);
    assert.equal(ipcRes.success, false);
    assert.equal(process.env.GNANI_API_KEY, undefined);

    // 4. Writing .env file must NEVER write GNANI_API_KEY
    const envFile = path.join(tmpDir, ".env");
    await envManager._writeEnvFile(envFile);
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, "utf8");
      assert.doesNotMatch(content, /GNANI_API_KEY/);
    }
  });

  test("asynchronous persistence failure is awaited and returns failure to renderer", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-store-async-fail-"));
    process.resourcesPath = tmpDir;
    delete process.env.GNANI_API_KEY;

    t.after(() => {
      delete process.env.GNANI_API_KEY;
      process.resourcesPath = origResourcesPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const EnvironmentManager = loadEnvironmentManager(t, tmpDir, {
      encryptionAvailable: true,
      throwOnEncrypt: true,
    });
    const envManager = new EnvironmentManager();

    // Calling saveGnaniApiKey must await rejection and return failure
    const saveRes = await envManager.saveGnaniApiKey("valid-secret-key-12345");
    assert.equal(saveRes.success, false);
    assert.match(saveRes.error, /Keychain write failed/);

    // IPC handler must await and return failure
    const ipcRes = await handleSaveKey(ipcFixture.event, "valid-secret-key-12345", envManager);
    assert.equal(ipcRes.success, false);
    assert.equal(ipcRes.error, "Secure storage could not save the key");

    // process.env must NOT contain the key
    assert.equal(process.env.GNANI_API_KEY, undefined);
  });

  test("GNANI_API_KEY is NEVER written to .env file under any circumstance", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-store-no-env-"));
    process.resourcesPath = tmpDir;
    delete process.env.GNANI_API_KEY;

    t.after(() => {
      delete process.env.GNANI_API_KEY;
      process.resourcesPath = origResourcesPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const EnvironmentManager = loadEnvironmentManager(t, tmpDir, { encryptionAvailable: true });
    const envManager = new EnvironmentManager();

    // Force dirty process.env to simulate legacy leak
    process.env.GNANI_API_KEY = "leaked-key-in-env-object";

    const envFile = path.join(tmpDir, ".env");
    await envManager._writeEnvFile(envFile);

    const content = fs.readFileSync(envFile, "utf8");
    assert.doesNotMatch(content, /GNANI_API_KEY/);
    assert.doesNotMatch(content, /leaked-key-in-env-object/);
  });

  test("stored key is maintained in secure memory and storage, NOT exposed on process.env", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-store-memory-iso-"));
    process.resourcesPath = tmpDir;
    delete process.env.GNANI_API_KEY;

    t.after(() => {
      delete process.env.GNANI_API_KEY;
      process.resourcesPath = origResourcesPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const EnvironmentManager = loadEnvironmentManager(t, tmpDir, { encryptionAvailable: true });
    const envManager = new EnvironmentManager();

    const saveRes = await envManager.saveGnaniApiKey("valid-secret-key-12345");
    assert.equal(saveRes.success, true);

    // Plaintext key retrievable from manager and resolver
    assert.equal(envManager.getGnaniApiKey(), "valid-secret-key-12345");
    assert.equal(resolveGnaniApiKey(envManager), "valid-secret-key-12345");

    // CRITICAL: process.env MUST remain undefined
    assert.equal(process.env.GNANI_API_KEY, undefined);

    // Verify on-disk file is encrypted
    const secretPath = path.join(tmpDir, "secure-keys", "GNANI_API_KEY.enc");
    assert.ok(fs.existsSync(secretPath));
    const encryptedContent = fs.readFileSync(secretPath, "utf8");
    assert.equal(encryptedContent, "enc:valid-secret-key-12345");
  });

  test("handleSaveKey returns failure when environmentManager is missing", async () => {
    delete process.env.GNANI_API_KEY;
    const res = await handleSaveKey(ipcFixture.event, "valid-secret-key-12345", null);
    assert.equal(res.success, false);
    assert.equal(process.env.GNANI_API_KEY, undefined);
  });
});
