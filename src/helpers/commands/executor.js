const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("child_process"),
  { app, shell } = require("electron"),
  logger = require("../debugLogger");
const lexicon = require("./lexicon.json"),
  { COMMANDS } = require("./grammar");
const COOLDOWN_MS = 500;
let isExecuting = false,
  lastExecutionTime = 0,
  appIndexCache = null;
function buildAppIndex() {
  const index = new Map(),
    root = process.env.SystemRoot || "C:\\Windows";
  for (const [key, target] of Object.entries({
    notepad: path.join(root, "System32", "notepad.exe"),
    calculator: path.join(root, "System32", "calc.exe"),
    explorer: path.join(root, "explorer.exe"),
    terminal: path.join(root, "System32", "cmd.exe"),
  }))
    if (fs.existsSync(target)) index.set(key, { type: "exe", target });
  index.set("settings", { type: "protocol", target: "ms-settings:" });
  let count = 0;
  function scan(dir, depth = 0) {
    if (depth > 10 || count > 2000) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (++count > 2000) return;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full, depth + 1);
        else if (entry.name.toLowerCase().endsWith(".lnk"))
          index.set(entry.name.slice(0, -4).toLowerCase(), { type: "lnk", target: full });
      }
    } catch {
      /* Unreadable Start Menu folder. */
    }
  }
  if (process.platform === "win32")
    for (const base of [process.env.ProgramData, process.env.APPDATA].filter(Boolean))
      scan(path.join(base, "Microsoft", "Windows", "Start Menu", "Programs"));
  appIndexCache = index;
  return index;
}
function resolveApp(key) {
  if (typeof key !== "string") return null;
  const index = appIndexCache || buildAppIndex(),
    names = [key, ...(lexicon.apps[key] || [])].map((name) => name.toLowerCase());
  for (const name of names) if (index.has(name)) return index.get(name);
  for (const [name, entry] of index)
    if (names.some((candidate) => name.includes(candidate))) return entry;
  return null;
}
function isGrammarActionAllowed(id, params = {}) {
  const def = COMMANDS.find((command) => command.id === id);
  if (!def || !params || typeof params !== "object" || Array.isArray(params)) return false;
  const keys = new Set([
    ...(def.parameterSlots || []),
    ...Object.keys(def.fixedParams || {}),
    ...Object.keys(def.allowedParams || {}),
  ]);
  if (Object.keys(params).some((key) => !keys.has(key))) return false;
  if (params.text !== undefined && (typeof params.text !== "string" || params.text.length > 10000))
    return false;
  return Object.entries(def.allowedParams || {}).every(
    ([key, values]) => params[key] === undefined || values.includes(params[key])
  );
}
function invokeWindowsInputHelper(action, param1 = "", param2 = "", signal) {
  if (process.platform !== "win32")
    return Promise.resolve({
      success: false,
      error: "Windows command actions are unavailable on this platform",
    });
  const script = app?.isPackaged
    ? path.join(process.resourcesPath, "windows-command-helper.ps1")
    : path.resolve(__dirname, "../../../resources/windows-command-helper.ps1");
  if (!fs.existsSync(script))
    return Promise.resolve({ success: false, error: "Input helper script not found" });
  return new Promise((resolve) => {
    let child,
      timer,
      settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => {
      child?.kill();
      finish({ success: false, cancelled: true, error: "Command cancelled" });
    };
    try {
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          action,
          String(param1),
          String(param2),
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      child.stdout?.on("data", () => {});
      child.stderr?.on("data", () => {});
      child.once("error", () => finish({ success: false, error: "Input helper could not start" }));
      child.once("close", (code) =>
        finish(code === 0 ? { success: true } : { success: false, error: "Input helper failed" })
      );
      timer = setTimeout(() => {
        child.kill();
        finish({ success: false, error: "Input helper timed out" });
      }, 5000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    } catch {
      finish({ success: false, error: "Input helper could not start" });
    }
  });
}
async function executeAction(action, context = {}) {
  if (context.signal?.aborted) return { success: false, cancelled: true };
  const id = action?.commandId,
    params = action?.params || {};
  if (!isGrammarActionAllowed(id, params))
    return { success: false, commandId: id || "unknown", error: "Action not permitted by grammar" };
  if (isExecuting || Date.now() - lastExecutionTime < COOLDOWN_MS)
    return {
      success: false,
      commandId: id,
      error: "Command execution in progress or cooldown active",
      rateLimited: true,
    };
  isExecuting = true;
  try {
    if (
      !app?.isPackaged &&
      process.env.NODE_ENV === "test" &&
      process.env.DHWANIFLOW_TEST_EXECUTOR_SINK
    ) {
      try {
        fs.appendFileSync(
          process.env.DHWANIFLOW_TEST_EXECUTOR_SINK,
          JSON.stringify({ commandId: id, params, timestamp: Date.now() }) + "\n"
        );
        return { success: true, commandId: id };
      } catch {
        return { success: false, commandId: id, error: "Test action sink could not be written" };
      }
    }
    let result;
    if (id === "open_app") {
      const resolved = resolveApp(params.appKey);
      if (!resolved) result = { success: false, error: "Application not found" };
      else if (resolved.type === "protocol") {
        await shell.openExternal(resolved.target);
        result = { success: true };
      } else if (resolved.type === "lnk") {
        const error = await shell.openPath(resolved.target);
        result = { success: !error, error: error ? "Application could not start" : undefined };
      } else
        result = await new Promise((resolve) => {
          let child;
          const timer = setTimeout(
            () => resolve({ success: false, error: "Application launch timed out" }),
            3000
          );
          try {
            child = spawn(resolved.target, [], {
              detached: true,
              stdio: "ignore",
              windowsHide: true,
            });
            child.once("error", () => {
              clearTimeout(timer);
              resolve({ success: false, error: "Application could not start" });
            });
            child.once("spawn", () => {
              clearTimeout(timer);
              child.unref();
              resolve({ success: true });
            });
          } catch {
            clearTimeout(timer);
            resolve({ success: false, error: "Application could not start" });
          }
        });
    } else if (id === "type_text") {
      const { autoPasteEnabled = true, ...options } = context.pasteOptions || {};
      if (!autoPasteEnabled) result = { success: false, error: "Auto-paste is disabled" };
      else if (!context.clipboardManager?.pasteText)
        result = { success: false, error: "Paste service unavailable" };
      else {
        const delivery = await context.clipboardManager.pasteText(params.text || "", options);
        await delivery?.restoreComplete;
        result = {
          success: delivery?.pasted === true,
          error: delivery?.pasted === true ? undefined : "Text was not pasted",
        };
      }
    } else if (id === "cancel") result = { success: true, cancelled: true };
    else
      result = await invokeWindowsInputHelper(
        id,
        id === "switch_app"
          ? params.appKey
          : id === "press"
            ? params.key
            : id === "scroll"
              ? params.direction
              : id === "snap"
                ? params.side
                : params.action || "",
        id === "scroll" ? String(params.amount || 1) : "",
        context.signal
      );
    logger.info("Command executed", { commandId: id, success: result.success }, "commands");
    return { ...result, commandId: id };
  } catch {
    return { success: false, commandId: id, error: "Command execution failed" };
  } finally {
    isExecuting = false;
    lastExecutionTime = Date.now();
  }
}
function resetRateLimitForTesting() {
  isExecuting = false;
  lastExecutionTime = 0;
}
module.exports = {
  executeAction,
  buildAppIndex,
  resolveApp,
  isGrammarActionAllowed,
  invokeWindowsInputHelper,
  resetRateLimitForTesting,
  COOLDOWN_MS,
};
