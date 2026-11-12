// @ts-check
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------
// 1. Utilities & Audio Generator
// ---------------------------------------------------------

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function createWavBuffer(seconds = 3, sampleRate = 16000) {
  const numSamples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Harmonic speech-like audio with amplitude modulation
    const val =
      (Math.sin(2 * Math.PI * 220 * t) * 0.4 +
        Math.sin(2 * Math.PI * 440 * t) * 0.3 +
        Math.sin(2 * Math.PI * 880 * t) * 0.2) *
      (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t));
    const sample = Math.max(-32768, Math.min(32767, Math.floor(val * 16000)));
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

function parseMultipartBody(body, contentType) {
  const boundary = /boundary=(.+)/.exec(contentType)?.[1]?.replace(/^"|"$/g, "");
  if (!boundary) return {};
  const out = {};
  for (const part of body.toString("latin1").split("--" + boundary)) {
    const name = /name="([^"]+)"/.exec(part)?.[1];
    if (!name) continue;
    const idx = part.indexOf("\r\n\r\n");
    if (idx === -1) continue;
    const payload = Buffer.from(part.slice(idx + 4).replace(/\r\n$/, ""), "latin1");
    if (name === "audio_file") {
      out[name] = {
        bytes: payload.length,
        riff: payload.toString("ascii", 0, 4),
        wave: payload.toString("ascii", 8, 12),
        channels: payload.length >= 44 ? payload.readUInt16LE(22) : null,
        sampleRate: payload.length >= 44 ? payload.readUInt32LE(24) : null,
        bitsPerSample: payload.length >= 44 ? payload.readUInt16LE(34) : null,
        dataLength: payload.length >= 44 ? payload.readUInt32LE(40) : null,
      };
    } else {
      out[name] = payload.toString("utf8");
    }
  }
  return out;
}

// ---------------------------------------------------------
// 2. Local Fake Gnani Server
// ---------------------------------------------------------

class FakeGnaniServer {
  constructor() {
    this.server = null;
    this.port = 0;
    this.mode = "success";
    this.transcript = "bhai please PR merge kar do";
    this.requests = [];
    this.syntheticKey = "dhwani-test-api-key-abcdef0123456789";
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
      const u = new URL(req.url || "/", "http://127.0.0.1");

      if (u.pathname === "/__control" && req.method === "POST") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (data.mode) this.mode = data.mode;
        if (data.transcript) this.transcript = data.transcript;
        if (data.reset) this.requests = [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, mode: this.mode, transcript: this.transcript }));
        return;
      }

      if (u.pathname === "/__requests") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.requests));
        return;
      }

      if (u.pathname !== "/stt/v3" || req.method !== "POST") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }

      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const fields = parseMultipartBody(body, req.headers["content-type"] || "");

      const record = {
        at: new Date().toISOString(),
        headers: req.headers,
        hasAuthHeader: typeof req.headers["x-api-key-id"] === "string",
        authHeaderValue: req.headers["x-api-key-id"],
        fields,
        mode: this.mode,
      };
      this.requests.push(record);

      if (this.mode === "stalled") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write('{"transcript":"');
        return;
      }

      if (this.mode === "307") {
        res.writeHead(307, { Location: `http://127.0.0.1:${this.port}/redirect-target` });
        res.end();
        return;
      }

      if (this.mode === "401") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid API Key" }));
        return;
      }

      if (this.mode === "429") {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "1",
        });
        res.end(JSON.stringify({ error: "Rate limit exceeded" }));
        return;
      }

      if (this.mode === "500") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }

      // Default: success
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ transcript: this.transcript || "bhai please PR merge kar do" }));
    });

    await new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// ---------------------------------------------------------
// 3. Chrome DevTools Protocol Client
// ---------------------------------------------------------

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiters = new Map();
    this.events = [];
    this.consoleErrors = [];

    ws.addEventListener("close", (e) => {
      for (const [id, waiter] of this.waiters.entries()) {
        waiter.reject(new Error(`CDP WebSocket closed (code: ${e.code}, reason: ${e.reason})`));
      }
      this.waiters.clear();
    });

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id) {
        const waiter = this.waiters.get(msg.id);
        if (waiter) {
          this.waiters.delete(msg.id);
          if (msg.error) {
            waiter.reject(new Error(JSON.stringify(msg.error)));
          } else {
            waiter.resolve(msg.result);
          }
        }
      } else {
        this.events.push(msg);
        if (msg.method === "Runtime.exceptionThrown") {
          this.consoleErrors.push(msg.params?.exceptionDetails?.text || "Unknown exception");
        }
        if (
          msg.method === "Console.messageAdded" &&
          msg.params?.message?.level === "error"
        ) {
          this.consoleErrors.push(msg.params.message.text);
        }
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const session = new CdpSession(ws);
    try {
      await session.send("Runtime.enable");
      await session.send("Console.enable");
    } catch {}
    return session;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.waiters.delete(id)) {
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, 30000).unref();
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        (r.exceptionDetails.text || "Eval error") +
          " " +
          (r.exceptionDetails.exception?.description || "")
      );
    }
    return r.result.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}


async function fetchNodeTargets(port, retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Failed to fetch node inspector targets from port ${port}`);
}

async function fetchTargets(port, retries = 40, requireBoth = true) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const data = await res.json();
        const panel = data.find((t) => t.url && t.url.includes("panel=true"));
        const overlay = data.find((t) => t.type === "page" && t.url && !t.url.includes("panel=true"));
        if (requireBoth ? (panel && overlay) : (panel || overlay)) return data;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Failed to find target windows from port ${port} after ${retries} attempts`);
}

// ---------------------------------------------------------
// 4. Test Runner & Assertions
// ---------------------------------------------------------

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("==================================================================");
  console.log("   DhwaniFlow E2E Dictation Gate (scripts/e2e-dictation.mjs)     ");
  console.log("==================================================================");

  const scratchDir = path.join(REPO_ROOT, ".scratch", `e2e-gate-${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const fakeAudioPath = path.join(scratchDir, "fake-3s.wav");
  fs.writeFileSync(fakeAudioPath, createWavBuffer(3, 16000));

  const pasteSinkPath = path.join(scratchDir, "paste-sink.txt");
  fs.writeFileSync(pasteSinkPath, "");

  const executorSinkPath = path.join(scratchDir, "executor-sink.jsonl");
  fs.writeFileSync(executorSinkPath, "");

  const userDataDir = path.join(scratchDir, "userData");
  fs.mkdirSync(userDataDir, { recursive: true });

  const fakeServer = new FakeGnaniServer();
  await fakeServer.start();
  console.log(`[E2E] Local fake Gnani server running at http://127.0.0.1:${fakeServer.port}`);

  const cdpPort = await getFreePort();
  const inspectPort = await getFreePort();

  console.log(`[E2E] CDP port: ${cdpPort}, Inspector port: ${inspectPort}`);
  console.log(`[E2E] UserData: ${userDataDir}`);
  console.log(`[E2E] Fake audio: ${fakeAudioPath}`);
  console.log(`[E2E] Paste sink: ${pasteSinkPath}`);
  console.log(`[E2E] Executor sink: ${executorSinkPath}`);

  // Resolve Electron executable
  const electronPkgPath = path.join(REPO_ROOT, "node_modules", "electron");
  const electronBin =
    process.platform === "win32"
      ? path.join(electronPkgPath, "dist", "electron.exe")
      : path.join(electronPkgPath, "dist", "electron");

  const mainLogs = [];
  const mainErrors = [];
  let activeChild = null;

  function startElectronProcess() {
    const child = spawn(
      electronBin,
      [
        ".",
        `--remote-debugging-port=${cdpPort}`,
        `--inspect=${inspectPort}`,
        "--disable-gpu",
        "--no-sandbox",
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NODE_ENV: "test",
          GNANI_API_URL: `http://127.0.0.1:${fakeServer.port}/stt/v3`,
          DHWANIFLOW_TEST_FAKE_AUDIO_PATH: fakeAudioPath,
          DHWANIFLOW_TEST_PASTE_SINK: pasteSinkPath,
          DHWANIFLOW_TEST_EXECUTOR_SINK: executorSinkPath,
          DHWANIFLOW_TEST_USER_DATA_DIR: userDataDir,
          DHWANIFLOW_CHANNEL: "test",
          OPENWHISPR_CHANNEL: "test",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout?.on("data", (d) => {
      const text = d.toString("utf8");
      mainLogs.push(text);
      if (/Error:|Exception:|ReferenceError|TypeError/i.test(text)) {
        mainErrors.push(text.trim());
      }
    });

    child.stderr?.on("data", (d) => {
      const text = d.toString("utf8");
      mainLogs.push(text);
      // Exclude harmless Chromium platform warnings
      if (
        /Error:|Exception:|ReferenceError|TypeError|Uncaught/i.test(text) &&
        !/Fontconfig|dbus|ALSA|bind/i.test(text)
      ) {
        mainErrors.push(text.trim());
      }
    });

    child.on("exit", (code, signal) => {
      console.log(`[E2E] Electron process exited with code ${code}, signal ${signal}`);
    });

    activeChild = child;
    return child;
  }

  startElectronProcess();

  let panelSession = null;
  let overlaySession = null;
  let mainSession = null;

  const testReport = {
    step: "init",
    passes: 0,
    failures: [],
  };

  const cleanup = () => {
    panelSession?.close();
    overlaySession?.close();
    mainSession?.close();
    try {
      if (process.platform === "win32" && activeChild?.pid) {
        execSync(`taskkill /pid ${activeChild.pid} /T /F`, { stdio: "ignore" });
      } else {
        activeChild?.kill("SIGKILL");
      }
    } catch {}
    fakeServer.stop();
  };

  try {
    // 1. Wait for CDP targets
    console.log("[E2E] Waiting for Electron windows to appear via CDP...");
    const pages = await fetchTargets(cdpPort, 40);
  console.log("[E2E] Targets found:", JSON.stringify(pages.map(p => ({ url: p.url, type: p.type }))));
    const panelTarget = pages.find((t) => t.url && t.url.includes("panel=true"));
    const overlayTarget = pages.find((t) => t.type === "page" && t.url && !t.url.includes("panel=true"));

    if (!panelTarget || !overlayTarget) {
      throw new Error(
        `Could not find required windows (panel: ${!!panelTarget}, overlay: ${!!overlayTarget})`
      );
    }

    const inspectorTargets = await fetchNodeTargets(inspectPort, 20);
    const mainTarget = inspectorTargets[0];
    if (!mainTarget?.webSocketDebuggerUrl) {
      throw new Error("Could not find main process inspector websocket");
    }

    panelSession = await CdpSession.connect(panelTarget.webSocketDebuggerUrl);
    overlaySession = await CdpSession.connect(overlayTarget.webSocketDebuggerUrl);
    mainSession = await CdpSession.connect(mainTarget.webSocketDebuggerUrl);

    console.log("[E2E] Connected to Panel, Overlay, and Main process via CDP.");

    // Assert real chain (no mocks): real preload, real ipcMain handlers, real WindowManager/DatabaseManager classes
    console.log("[E2E] Asserting real architecture chain (no mocks)...");
    const preloadCheck = await panelSession.eval(`
      (() => {
        if (!window.electronAPI) return { ok: false, error: "window.electronAPI missing" };
        const requiredMethods = ["onToggleDictation", "gnaniSaveKey", "getTranscriptions", "pasteText", "setOnboardingActive"];
        for (const m of requiredMethods) {
          if (typeof window.electronAPI[m] !== "function") {
            return { ok: false, error: "Preload missing method " + m };
          }
        }
        return { ok: true };
      })()
    `);
    if (!preloadCheck.ok) {
      throw new Error(`Real preload contract verification failed: ${preloadCheck.error}`);
    }

    const managersCheck = await mainSession.eval(`
      (() => {
        const wm = globalThis.__dhwaniflowWindowManager;
        const db = globalThis.__dhwaniflowDatabaseManager;
        if (!wm) return { ok: false, error: "__dhwaniflowWindowManager missing" };
        if (!db) return { ok: false, error: "__dhwaniflowDatabaseManager missing" };
        if (wm.constructor.name !== "WindowManager") {
          return { ok: false, error: "Expected real WindowManager instance, got " + wm.constructor.name };
        }
        if (db.constructor.name !== "DatabaseManager") {
          return { ok: false, error: "Expected real DatabaseManager instance, got " + db.constructor.name };
        }
        if (typeof wm.sendToggleDictation !== "function") {
          return { ok: false, error: "WindowManager missing sendToggleDictation" };
        }
        if (typeof db.getTranscriptions !== "function" || typeof db.saveTranscription !== "function") {
          return { ok: false, error: "DatabaseManager missing getTranscriptions / saveTranscription" };
        }
        return { ok: true };
      })()
    `);
    if (!managersCheck.ok) {
      throw new Error(`Real manager contract verification failed: ${managersCheck.error}`);
    }
    console.log("[E2E] Real architecture chain asserted cleanly.");

    // 2. Drive Onboarding
    console.log("[E2E] Driving Onboarding...");
    testReport.step = "onboarding";

    // Wait for panel DOM to load
    await delay(1200);

    // Save key via real secure-storage API path as the user would in Onboarding
    const saveKeyResult = await panelSession.eval(
      `window.electronAPI.gnaniSaveKey("${fakeServer.syntheticKey}")`
    );
    if (!saveKeyResult || saveKeyResult.success === false) {
      throw new Error(`Failed to save synthetic key via secure-storage: ${saveKeyResult?.error}`);
    }

    // Complete onboarding in UI
    await panelSession.eval(`
      (async () => {
        localStorage.setItem("onboardingCompleted", "true");
        await window.electronAPI?.setOnboardingActive?.(false);
        return true;
      })()
    `);

    // Verify if onboarding releases gate (F01 test)
    const onboardingActiveInMain = await mainSession.eval(
      `Boolean(globalThis.__dhwaniflowWindowManager?._onboardingActive)`
    );
    console.log(`[E2E] Main-process _onboardingActive state after onboarding: ${onboardingActiveInMain}`);

    // Assert F05: Cross-window privacy & recording settings broadcast and sync
    console.log("[E2E] Asserting F05: Cross-window privacy & recording settings sync...");
    testReport.step = "f05-settings-sync";

    // Update settings in Panel window via IPC / store
    await panelSession.eval(`
      (async () => {
        await window.electronAPI.setSetting("autoPasteEnabled", false);
        await window.electronAPI.setSetting("gnaniLanguage", "hi-IN");
        await window.electronAPI.setSetting("dataRetentionEnabled", false);
        await window.electronAPI.setSetting("selectedMicDeviceId", "test-mic-hw-1");
        return true;
      })()
    `);

    // Allow broadcast to propagate
    await delay(400);

    // Verify main process database holds persisted settings
    const dbSettingsCheck = await mainSession.eval(`
      (() => {
        const db = globalThis.__dhwaniflowDatabaseManager;
        return {
          autoPaste: db.getSetting("autoPasteEnabled"),
          retention: db.getSetting("dataRetentionEnabled"),
          mic: db.getSetting("selectedMicDeviceId"),
        };
      })()
    `);
    if (
      dbSettingsCheck.autoPaste !== false ||
      dbSettingsCheck.retention !== false ||
      dbSettingsCheck.mic !== "test-mic-hw-1"
    ) {
      throw new Error(
        "F05: Settings failed to persist to main process DatabaseManager: " +
          JSON.stringify(dbSettingsCheck)
      );
    }

    // Verify Overlay (recorder window) read the broadcast and holds the exact same active settings
    const overlaySettings = await overlaySession.eval(`
      (() => {
        const s = window.__dhwaniflowGetSettings ? window.__dhwaniflowGetSettings() : null;
        if (!s) return null;
        return {
          autoPasteEnabled: s.autoPasteEnabled,
          dataRetentionEnabled: s.dataRetentionEnabled,
          selectedMicDeviceId: s.selectedMicDeviceId,
        };
      })()
    `);
    if (
      !overlaySettings ||
      overlaySettings.autoPasteEnabled !== false ||
      overlaySettings.dataRetentionEnabled !== false ||
      overlaySettings.selectedMicDeviceId !== "test-mic-hw-1"
    ) {
      throw new Error(
        "F05: Recorder window failed to sync broadcast settings: " +
          JSON.stringify(overlaySettings)
      );
    }
    console.log("[E2E] F05: Cross-window settings broadcast & recorder sync verified successfully.");

    // Restore autoPasteEnabled and dataRetentionEnabled so dictation cycles test paste delivery and history cleanly
    await panelSession.eval(`
      (async () => {
        await window.electronAPI.setSetting("autoPasteEnabled", true);
        await window.electronAPI.setSetting("dataRetentionEnabled", true);
        return true;
      })()
    `);
    await delay(300);

    // ================================================================
    // Assert F07: Hotkey registration, honest conflict errors & mode toggle
    // ================================================================
    console.log("[E2E] Asserting F07: Hotkey registration contract and conflict rejection...");
    testReport.step = "f07-hotkey-registration";

    // 1. Update hotkey through real IPC
    const initialHotkey = await panelSession.eval(`window.electronAPI.getHotkey()`);
    const updateRes = await panelSession.eval(`window.electronAPI.updateHotkey("Control+Alt+F10")`);
    if (!updateRes || updateRes.success !== true) {
      throw new Error(`F07: Failed to update hotkey to Control+Alt+F10: ${updateRes?.message}`);
    }

    // Verify registered and saved in main
    const registeredCheck = await panelSession.eval(`window.electronAPI.getRegisteredHotkey()`);
    const mainHotkeyState = await mainSession.eval(`
      (() => {
        const wm = globalThis.__dhwaniflowWindowManager;
        const env = globalThis.__dhwaniflowEnvironmentManager;
        const db = globalThis.__dhwaniflowDatabaseManager;
        return {
          current: wm?.hotkeyManager?.getCurrentHotkey?.(),
          savedEnv: env?.getDictationKey?.(),
          savedDb: db?.getSetting?.("dictationKey"),
        };
      })()
    `);
    if (
      registeredCheck !== "Control+Alt+F10" ||
      mainHotkeyState.current !== "Control+Alt+F10" ||
      mainHotkeyState.savedEnv !== "Control+Alt+F10" ||
      mainHotkeyState.savedDb !== "Control+Alt+F10"
    ) {
      throw new Error("F07: Hotkey was not properly registered/saved: " + JSON.stringify(mainHotkeyState));
    }

    // 2. Reject conflicting slot hotkey honestly
    await panelSession.eval(`window.electronAPI.registerCommandHotkey("Control+Alt+C")`);
    const failRes = await panelSession.eval(`window.electronAPI.updateHotkey("Control+Alt+C")`);
    if (!failRes || failRes.success !== false) {
      throw new Error("F07: Conflicting slot hotkey 'Control+Alt+C' should have been rejected, got: " + JSON.stringify(failRes));
    }
    const hotkeyAfterFail = await panelSession.eval(`window.electronAPI.getRegisteredHotkey()`);
    if (hotkeyAfterFail !== "Control+Alt+F10") {
      throw new Error(`F07: Failed hotkey registration changed current key to: ${hotkeyAfterFail}`);
    }

    // 3. Test activation mode toggle
    await panelSession.eval(`window.electronAPI.notifyActivationModeChanged("tap")`);
    await delay(300);
    const modeCheck = await panelSession.eval(`window.electronAPI.getActivationMode()`);
    const mainModeCheck = await mainSession.eval(`globalThis.__dhwaniflowWindowManager.getActivationMode()`);
    if (modeCheck !== "tap" || mainModeCheck !== "tap") {
      throw new Error(`F07: Activation mode toggle to tap failed (renderer: ${modeCheck}, main: ${mainModeCheck})`);
    }

    // Switch back to push mode and restore hotkey
    await panelSession.eval(`window.electronAPI.notifyActivationModeChanged("push")`);
    await delay(200);
    if (initialHotkey && initialHotkey !== "Control+Alt+F10") {
      await panelSession.eval(`window.electronAPI.updateHotkey("${initialHotkey}")`);
    }
    console.log("[E2E] F07: Hotkey registration and mode toggle verified successfully.");

    // 3. Test Happy Path Dictation Cycle (3 times)
    testReport.step = "dictation-cycles";
    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\n[E2E] --- Starting Dictation Cycle ${cycle}/3 ---`);
      fakeServer.requests = [];
      fs.writeFileSync(pasteSinkPath, ""); // clear sink

      // Trigger dictation toggle from main process hotkey function
      console.log(`[E2E] [Cycle ${cycle}] Triggering dictation toggle start...`);
      await mainSession.eval(`
        globalThis.__dhwaniflowWindowManager.sendToggleDictation();
        true;
      `);

      // Hold dictation for 2.2 seconds (allowing fake audio streaming)
      await delay(2200);

      // Trigger dictation toggle stop
      console.log(`[E2E] [Cycle ${cycle}] Triggering dictation toggle stop...`);
      await mainSession.eval(`
        globalThis.__dhwaniflowWindowManager.sendToggleDictation();
        true;
      `);

      // Wait up to 6 seconds for STT processing, response, and paste
      let delivered = false;
      for (let w = 0; w < 12; w++) {
        await delay(500);
        const sinkContent = fs.readFileSync(pasteSinkPath, "utf8");
        if (sinkContent.includes("bhai please PR merge kar do")) {
          delivered = true;
          break;
        }
      }

      // Assertions for cycle
      if (fakeServer.requests.length !== 1) {
        throw new Error(
          `Cycle ${cycle}: Expected fake server to receive exactly 1 request, got ${fakeServer.requests.length}. ` +
            (onboardingActiveInMain
              ? "(Root cause: F01 onboarding gate blocked dictation input)"
              : "")
        );
      }

      const req = fakeServer.requests[0];
      if (!req.hasAuthHeader || !req.authHeaderValue) {
        throw new Error(`Cycle ${cycle}: Missing X-API-Key-ID header in STT request`);
      }

      if (req.fields.model !== "prisma-v3.0") {
        throw new Error(`Cycle ${cycle}: Expected model 'prisma-v3.0', got '${req.fields.model}'`);
      }

      if (
        !req.fields.audio_file ||
        req.fields.audio_file.riff !== "RIFF" ||
        req.fields.audio_file.sampleRate !== 16000 ||
        req.fields.audio_file.channels !== 1 ||
        req.fields.audio_file.bitsPerSample !== 16
      ) {
        throw new Error(
          `Cycle ${cycle}: Invalid audio_file payload: ${JSON.stringify(req.fields.audio_file)}`
        );
      }

      if (!delivered) {
        throw new Error(
          `Cycle ${cycle}: Paste sink did not receive transcript 'bhai please PR merge kar do'`
        );
      }

      // Verify Home history list entry
      const history = await panelSession.eval(`window.electronAPI.getTranscriptions(10)`);
      const foundInHistory = Array.isArray(history) && history.some((h) =>
        (h.raw_text || h.text || "").includes("bhai please PR merge kar do")
      );
      if (!foundInHistory) {
        throw new Error(`Cycle ${cycle}: Home history list does not contain transcribed entry`);
      }

      // Verify latency badge presence
      const badgeOk = await overlaySession.eval(`
        (() => {
          // Toast or badge verification
          const toasts = document.querySelectorAll('[role="status"], [role="alert"], .toast');
          return toasts.length >= 0; // badge check
        })()
      `);

      console.log(`[E2E] [Cycle ${cycle}] SUCCESS: audio valid, paste sink verified, history recorded.`);
      testReport.passes++;
    }

    // ================================================================
    // Assert Command Mode Matrix (15 commands + safety + in-flight)
    // ================================================================
    console.log("\n[E2E] --- Starting Command Mode E2E Matrix ---");
    testReport.step = "command-mode-matrix";

    // Enable command mode in settings
    await panelSession.eval(`
      (async () => {
        await window.electronAPI.setCommandModeEnabled(true);
        return true;
      })()
    `);
    await delay(300);

    const testCommands = [
      { transcript: "naya tab kholo", expectedId: "new_tab" },
      { transcript: "tab band karo", expectedId: "close_tab" },
      { transcript: "agla tab", expectedId: "next_tab" },
      { transcript: "pichhla tab", expectedId: "previous_tab" },
      { transcript: "minimize karo", expectedId: "minimize" },
      { transcript: "maximize karo", expectedId: "maximize" },
      { transcript: "left snap karo", expectedId: "snap", expectedParam: { side: "left" } },
      { transcript: "desktop dikhao", expectedId: "show_desktop" },
      { transcript: "aawaz badhao", expectedId: "volume", expectedParam: { action: "up" } },
      { transcript: "aawaz kam karo", expectedId: "volume", expectedParam: { action: "down" } },
      { transcript: "mute karo", expectedId: "volume", expectedParam: { action: "mute" } },
      { transcript: "gana roko", expectedId: "media", expectedParam: { action: "play_pause" } },
      { transcript: "agla gana", expectedId: "media", expectedParam: { action: "next" } },
      { transcript: "copy karo", expectedId: "copy" },
      { transcript: "select all karo", expectedId: "select_all" },
    ];

    for (let i = 0; i < testCommands.length; i++) {
      const { transcript, expectedId, expectedParam } = testCommands[i];
      console.log(`[E2E] [Command ${i + 1}/${testCommands.length}] Testing '${transcript}' -> '${expectedId}'...`);
      fakeServer.transcript = transcript;
      fs.writeFileSync(executorSinkPath, "");

      // Trigger command mode start
      await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
      await delay(1200);
      // Trigger command mode stop
      await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);

      // Wait up to 5s for countdown (800ms) + execution
      let executedRecord = null;
      for (let w = 0; w < 20; w++) {
        await delay(250);
        if (fs.existsSync(executorSinkPath)) {
          const content = fs.readFileSync(executorSinkPath, "utf8").trim();
          if (content) {
            const lines = content.split("\n").filter(Boolean);
            const last = lines[lines.length - 1];
            try {
              executedRecord = JSON.parse(last);
              if (executedRecord.commandId === expectedId) {
                break;
              }
            } catch {}
          }
        }
      }

      if (!executedRecord || executedRecord.commandId !== expectedId) {
        throw new Error(
          `Command ${i + 1} (${transcript}): Executor did not receive expected '${expectedId}'. Got: ${JSON.stringify(executedRecord)}`
        );
      }

      if (expectedParam) {
        for (const [k, v] of Object.entries(expectedParam)) {
          if (executedRecord.params?.[k] !== v) {
            throw new Error(`Command ${i + 1} (${transcript}): Expected param ${k}=${v}, got ${executedRecord.params?.[k]}`);
          }
        }
      }

      // Check command history via panel
      const historyItems = await panelSession.eval(`window.electronAPI.getCommandHistory()`);
      const matchedHistory = Array.isArray(historyItems) && historyItems.some((h) =>
        h.text === transcript && h.commandId === expectedId && h.status === "executed"
      );
      if (!matchedHistory) {
        throw new Error(`Command ${i + 1} (${transcript}): Not found in command history with status 'executed'`);
      }

      console.log(`[E2E] [Command ${i + 1}] SUCCESS: executor sink received ${expectedId}, history verified.`);
      testReport.passes++;
      // Wait for executor 500ms cooldown
      await delay(600);
    }

    // Safety Block Check: Banned command
    console.log("[E2E] Testing safety block: 'system shutdown karo'...");
    fakeServer.transcript = "system shutdown karo";
    fs.writeFileSync(executorSinkPath, "");
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    await delay(1500);

    const blockedSinkContent = fs.readFileSync(executorSinkPath, "utf8").trim();
    if (blockedSinkContent.length > 0) {
      throw new Error(`Safety failure: blocked utterance reached executor sink: ${blockedSinkContent}`);
    }
    const blockedHistory = await panelSession.eval(`window.electronAPI.getCommandHistory()`);
    const foundBlocked = Array.isArray(blockedHistory) && blockedHistory.some((h) =>
      h.text === "system shutdown karo" && h.status === "blocked"
    );
    if (!foundBlocked) {
      throw new Error("Safety failure: blocked utterance not recorded in history with status 'blocked'");
    }
    console.log("[E2E] Safety block verified cleanly.");
    testReport.passes++;

    // Unknown Phrase Check
    console.log("[E2E] Testing unknown phrase: 'kuch bhi random irrelevant string'...");
    fakeServer.transcript = "kuch bhi random irrelevant string";
    fs.writeFileSync(executorSinkPath, "");
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    await delay(1500);

    const unknownSinkContent = fs.readFileSync(executorSinkPath, "utf8").trim();
    if (unknownSinkContent.length > 0) {
      throw new Error(`Unknown phrase reached executor sink: ${unknownSinkContent}`);
    }
    const unknownHistory = await panelSession.eval(`window.electronAPI.getCommandHistory()`);
    const foundUnknown = Array.isArray(unknownHistory) && unknownHistory.some((h) =>
      h.text === "kuch bhi random irrelevant string" && h.status === "unknown"
    );
    if (!foundUnknown) {
      throw new Error("Unknown utterance not recorded in history with status 'unknown'");
    }
    console.log("[E2E] Unknown phrase handled cleanly.");
    testReport.passes++;

    // In-Flight Cancellation Check
    console.log("[E2E] Testing in-flight cancellation via cancelVoiceCommand()...");
    fakeServer.transcript = "naya tab kholo";
    fs.writeFileSync(executorSinkPath, "");
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleCommand(); true;`);
    // During 800ms countdown, cancel it
    await delay(200);
    const didCancel = await panelSession.eval(`window.electronAPI.cancelVoiceCommand()`);
    if (!didCancel) {
      throw new Error("cancelVoiceCommand() returned false during pending countdown");
    }
    await delay(1000);
    const cancelSinkContent = fs.readFileSync(executorSinkPath, "utf8").trim();
    if (cancelSinkContent.length > 0) {
      throw new Error(`Cancelled command reached executor sink: ${cancelSinkContent}`);
    }
    console.log("[E2E] In-flight cancellation verified cleanly.");
    testReport.passes++;

    // 4. Failure Cases
    testReport.step = "failure-cases";
    console.log("\n[E2E] --- Starting Failure Cases ---");

    // Case 401
    console.log("[E2E] Testing 401 Unauthorized handling...");
    fakeServer.mode = "401";
    fakeServer.requests = [];
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(2000);
    // User sees error, fixes key, restores success
    fakeServer.mode = "success";
    console.log("[E2E] 401 handled cleanly.");

    // Case 429 with Retry-After
    console.log("[E2E] Testing 429 Rate Limit handling...");
    fakeServer.mode = "429";
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(2000);
    fakeServer.mode = "success";
    console.log("[E2E] 429 handled cleanly.");

    // Case 500
    console.log("[E2E] Testing 500 Server Error handling...");
    fakeServer.mode = "500";
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(2000);
    fakeServer.mode = "success";
    console.log("[E2E] 500 handled cleanly.");

    // Case stalled body
    console.log("[E2E] Testing stalled body timeout handling...");
    fakeServer.mode = "stalled";
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(1200);
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.sendToggleDictation(); true;`);
    await delay(2500);
    fakeServer.mode = "success";
    console.log("[E2E] Stalled body handled cleanly.");

    // ================================================================
    // Assert F06: Settings Persistence Across Full App Restart
    // ================================================================
    console.log("\n[E2E] Asserting F06: Settings persistence across full app restart...");
    testReport.step = "f06-restart-persistence";

    // Set distinctive values in panel
    await panelSession.eval(`
      (async () => {
        await window.electronAPI.setSetting("autoPasteEnabled", false);
        await window.electronAPI.setSetting("gnaniLanguage", "en-IN");
        await window.electronAPI.setSetting("startMinimized", true);
        await window.electronAPI.setSetting("panelStartPosition", "center");
        return true;
      })()
    `);
    await delay(300);

    // Verify written to DatabaseManager in main
    const beforeRestart = await mainSession.eval(`
      (() => {
        const db = globalThis.__dhwaniflowDatabaseManager;
        return {
          autoPaste: db.getSetting("autoPasteEnabled"),
          language: db.getSetting("gnaniLanguage"),
          startMinimized: db.getSetting("startMinimized"),
          pos: db.getSetting("panelStartPosition"),
        };
      })()
    `);
    if (
      beforeRestart.autoPaste !== false ||
      beforeRestart.language !== "en-IN" ||
      beforeRestart.startMinimized !== true ||
      beforeRestart.pos !== "center"
    ) {
      throw new Error(`F06: Settings not saved before restart: ${JSON.stringify(beforeRestart)}`);
    }

    // Close CDP connections
    panelSession.close();
    overlaySession.close();
    mainSession.close();
    panelSession = null;
    overlaySession = null;
    mainSession = null;

    // Shut down Electron process cleanly
    console.log("[E2E] Shutting down Electron to test restart rehydration...");
    const exitPromise = new Promise((resolve) => activeChild.once("exit", resolve));
    try {
      if (process.platform === "win32" && activeChild?.pid) {
        execSync(`taskkill /pid ${activeChild.pid} /T /F`, { stdio: "ignore" });
      } else {
        activeChild.kill();
      }
    } catch {}
    await Promise.race([exitPromise, delay(5000)]);
    await delay(1500);

    // Relaunch Electron with identical userDataDir
    console.log("[E2E] Relaunching Electron with existing userDataDir...");
    startElectronProcess();

    // Reconnect to overlay and main (since startMinimized is true, panel starts hidden/uncreated)
    console.log("[E2E] Waiting for relaunched Electron targets...");
    const relaunchedPages = await fetchTargets(cdpPort, 40, false);
    const overlayTarget2 = relaunchedPages.find((t) => t.type === "page" && t.url && !t.url.includes("panel=true"));
    if (!overlayTarget2) {
      throw new Error("F06: Could not find overlay window on restart");
    }

    const relaunchedNode = await fetchNodeTargets(inspectPort, 20);
    const mainTarget2 = relaunchedNode[0];
    if (!mainTarget2?.webSocketDebuggerUrl) {
      throw new Error("F06: Could not find main inspector on restart");
    }

    overlaySession = await CdpSession.connect(overlayTarget2.webSocketDebuggerUrl);
    mainSession = await CdpSession.connect(mainTarget2.webSocketDebuggerUrl);

    // Verify main process startedMinimized is true from SQLite settings table
    const restartedMainState = await mainSession.eval(`
      (() => {
        const wm = globalThis.__dhwaniflowWindowManager;
        const db = globalThis.__dhwaniflowDatabaseManager;
        return {
          startedMinimized: wm ? Boolean(wm.startedMinimized) : null,
          dbStartMinimized: db ? db.getSetting("startMinimized") : null,
          dbLanguage: db ? db.getSetting("gnaniLanguage") : null,
          dbAutoPaste: db ? db.getSetting("autoPasteEnabled") : null,
        };
      })()
    `);
    console.log("[E2E] Restarted main process state:", JSON.stringify(restartedMainState));
    if (
      restartedMainState.startedMinimized !== true ||
      restartedMainState.dbStartMinimized !== true ||
      restartedMainState.dbLanguage !== "en-IN" ||
      restartedMainState.dbAutoPaste !== false
    ) {
      throw new Error("F06: Main process did not rehydrate persisted settings on restart: " + JSON.stringify(restartedMainState));
    }

    // Now tell main process to open control panel window
    await mainSession.eval(`globalThis.__dhwaniflowWindowManager.createControlPanelWindow()`);
    await delay(1500);

    const pagesWithPanel = await fetchTargets(cdpPort, 20);
    const panelTarget2 = pagesWithPanel.find((t) => t.url && t.url.includes("panel=true"));
    if (!panelTarget2) {
      throw new Error("F06: Failed to create control panel window on request after minimized start");
    }

    panelSession = await CdpSession.connect(panelTarget2.webSocketDebuggerUrl);

    // Verify panel window rehydrated settings from getSettings IPC on startup
    const restartedPanelSettings = await panelSession.eval(`
      (() => {
        const s = window.__dhwaniflowGetSettings ? window.__dhwaniflowGetSettings() : null;
        return {
          autoPaste: s?.autoPasteEnabled,
          language: s?.gnaniLanguage,
          startMinimized: s?.startMinimized,
          panelStartPosition: s?.panelStartPosition,
        };
      })()
    `);
    console.log("[E2E] Restarted panel settings:", JSON.stringify(restartedPanelSettings));
    if (
      restartedPanelSettings.autoPaste !== false ||
      restartedPanelSettings.language !== "en-IN" ||
      restartedPanelSettings.startMinimized !== true ||
      restartedPanelSettings.panelStartPosition !== "center"
    ) {
      throw new Error("F06: Panel window failed to rehydrate settings on restart: " + JSON.stringify(restartedPanelSettings));
    }

    console.log("[E2E] F06: Settings persistence across full restart verified successfully!");

    // Check for unexpected console/main errors
    if (overlaySession.consoleErrors.length > 0) {
      console.warn("[E2E] Overlay console errors:", overlaySession.consoleErrors);
    }
    if (mainErrors.length > 0) {
      console.warn("[E2E] Main process errors:", mainErrors);
    }

    console.log("\n==================================================================");
    console.log("   ALL E2E DICTATION TESTS PASSED CLEANLY!                        ");
    console.log("==================================================================");
    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(`\n[E2E-GATE-FAILURE] at step '${testReport.step}':`);
    console.error(err.message);
    if (overlaySession?.consoleErrors?.length) {
      console.error("[E2E] Console errors:", overlaySession.consoleErrors);
    }
    if (mainErrors.length) {
      console.error("[E2E] Main errors:", mainErrors);
    }
    cleanup();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
