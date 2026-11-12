import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.exceptions = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown")
        this.exceptions.push(message.params.exceptionDetails.text);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DevTools connection timed out")), 5000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("DevTools connection failed"));
        },
        { once: true }
      );
    });
    return new DevTools(socket);
  }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools ${method} timed out`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("DevTools closed"));
    }
    this.pending.clear();
    this.socket.close();
  }
}

test(
  "final Windows package opens both windows with working preload and no external startup traffic",
  { timeout: 90000 },
  async (t) => {
    assert.equal(
      process.platform,
      "win32",
      "Run this release gate on Windows; it is not a mocked unit test"
    );
    const application = path.join(root, "dist/win-unpacked");
    for (const file of [
      "DhwaniFlow.exe",
      "resources/app.asar",
      "resources/bin/windows-key-listener.exe",
      "resources/bin/windows-fast-paste.exe",
      "resources/bin/windows-helpers.json",
      "resources/windows-command-helper.ps1",
      "resources/LICENSE.dhwaniflow",
      "resources/third-party-notices.md",
    ]) {
      assert.ok(fs.existsSync(path.join(application, file)), `Missing packaged resource: ${file}`);
    }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dhwaniflow-release-test-"));
    const attemptedHosts = [];
    const proxy = http.createServer((request, response) => {
      attemptedHosts.push(new URL(request.url).hostname);
      request.resume();
      response.writeHead(403);
      response.end();
    });
    proxy.on("connect", (request, socket) => {
      attemptedHosts.push(request.url.split(":")[0]);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const debugReservation = http.createServer();
    await new Promise((resolve) => debugReservation.listen(0, "127.0.0.1", resolve));
    const debugPort = debugReservation.address().port;
    await new Promise((resolve) => debugReservation.close(resolve));
    const env = { ...process.env, NODE_ENV: "production", DHWANIFLOW_CHANNEL: "production" };
    for (const name of ["GNANI_API_KEY", "GNANI_API_URL", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
      delete env[name];
    let child, launchError;
    const clients = [];
    t.after(async () => {
      clients.forEach((client) => client.close());
      if (child?.pid && child.exitCode === null)
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
          timeout: 5000,
        });
      await new Promise((resolve) => proxy.close(resolve));
      assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(profile).startsWith("dhwaniflow-release-test-"));
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    });
    child = spawn(
      path.join(application, "DhwaniFlow.exe"),
      [
        "--user-data-dir=" + profile,
        "--remote-debugging-port=" + debugPort,
        "--proxy-server=http://127.0.0.1:" + proxy.address().port,
        "--proxy-bypass-list=<-loopback>",
        "--disable-background-networking",
      ],
      { cwd: application, env, windowsHide: true, stdio: "ignore" }
    );
    child.on("error", (error) => {
      launchError = error.code;
    });
    let pages = [];
    for (let attempt = 0; attempt < 40; attempt++) {
      if (launchError) assert.fail(`Packaged executable could not start: ${launchError}`);
      assert.equal(child.exitCode, null, "Packaged executable exited during startup");
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
          signal: AbortSignal.timeout(1000),
        });
        pages = (await response.json()).filter((page) => page.type === "page");
        if (pages.length >= 2) break;
      } catch {
        /* Startup may not have opened DevTools yet. */
      }
      await pause(250);
    }
    assert.equal(pages.length, 2, "Both dictation and control-panel windows must exist");
    for (const page of pages) {
      const client = await DevTools.connect(page.webSocketDebuggerUrl);
      clients.push(client);
      await client.send("Runtime.enable");
      const result = await client.send("Runtime.evaluate", {
        expression:
          "(async()=>({bridge:!!window.electronAPI,configured:(await window.electronAPI.gnaniGetStatus()).configured}))()",
        returnByValue: true,
        awaitPromise: true,
      });
      assert.equal(result.exceptionDetails, undefined, "Packaged preload IPC must work");
      assert.equal(result.result.value.bridge, true);
      assert.equal(
        result.result.value.configured,
        false,
        "Fresh profile must have no API credential"
      );
    }
    await pause(60000);
    assert.equal(child.exitCode, null);
    for (const client of clients)
      assert.deepEqual(client.exceptions, [], "No renderer may throw during startup");
    assert.deepEqual(
      attemptedHosts.filter((host) => !["127.0.0.1", "localhost", "[::1]"].includes(host)),
      [],
      "Startup must not contact an external host"
    );
  }
);
