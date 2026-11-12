#!/usr/bin/env node
/**
 * scripts/check-ipc-surface.mjs
 *
 * Verifies that:
 * 1. Every IPC channel exposed by preload.js has a corresponding handler or sender in the main process.
 * 2. Every electronAPI method called by the renderer (src/) is exposed in preload.js.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const preloadPath = path.join(repoRoot, "preload.js");
const preloadContent = fs.readFileSync(preloadPath, "utf8");

// 1. Extract exposed properties and channels from preload.js using AST
const exposedMethods = new Set();
const ast = parse(preloadContent, { sourceType: "module" });

for (const node of ast.program.body) {
  if (
    node.type === "ExpressionStatement" &&
    node.expression.type === "CallExpression" &&
    node.expression.callee.property?.name === "exposeInMainWorld" &&
    node.expression.arguments[0]?.value === "electronAPI" &&
    node.expression.arguments[1]?.type === "ObjectExpression"
  ) {
    for (const prop of node.expression.arguments[1].properties) {
      if (prop.key?.name) {
        exposedMethods.add(prop.key.name);
      }
    }
  }
}

if (exposedMethods.size === 0) {
  console.error("[check-ipc-surface] ERROR: Could not locate electronAPI block in preload.js");
  process.exit(1);
}

const preloadInvokes = new Set();
const preloadSends = new Set();
const preloadListeners = new Set();

const invokeRegex = /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g;
const sendRegex = /ipcRenderer\.send\(\s*["']([^"']+)["']/g;
const listenerRegex = /registerListener\(\s*["']([^"']+)["']/g;

let m;
while ((m = invokeRegex.exec(preloadContent)) !== null) preloadInvokes.add(m[1]);
while ((m = sendRegex.exec(preloadContent)) !== null) preloadSends.add(m[1]);
while ((m = listenerRegex.exec(preloadContent)) !== null) preloadListeners.add(m[1]);

// 2. Extract main process handlers and senders
const mainFiles = [
  path.join(repoRoot, "main.js"),
  path.join(repoRoot, "src", "helpers", "ipcHandlers.js"),
  path.join(repoRoot, "src", "helpers", "windowManager.js"),
  path.join(repoRoot, "src", "helpers", "hotkeyManager.js"),
  path.join(repoRoot, "src", "helpers", "database.js"),
];

// Also gather any additional js files in src/helpers and src/utils recursively
function gatherJsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...gatherJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

for (const sub of ["src/helpers", "src/utils"]) {
  for (const full of gatherJsFiles(path.join(repoRoot, sub))) {
    if (!mainFiles.includes(full)) mainFiles.push(full);
  }
}

const mainHandles = new Set();
const mainOns = new Set();
const mainSends = new Set();

const handleRegex = /ipcMain\.handle\(\s*["']([^"']+)["']/g;
const onRegex = /ipcMain\.on\(\s*["']([^"']+)["']/g;
const webSendRegex =
  /(?:webContents\.send|broadcastToWindows|_sendDictationToggle|sendToControlPanel)\(\s*["']([^"']+)["']/g;

for (const file of mainFiles) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    while ((m = handleRegex.exec(content)) !== null) mainHandles.add(m[1]);
    while ((m = onRegex.exec(content)) !== null) mainOns.add(m[1]);
    while ((m = webSendRegex.exec(content)) !== null) mainSends.add(m[1]);
  }
}

// 3. Scan renderer files for calls to electronAPI
function findRendererFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".scratch")
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRendererFiles(full));
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.includes(".test.")) {
      files.push(full);
    }
  }
  return files;
}

const rendererFiles = findRendererFiles(path.join(repoRoot, "src"));
const rendererCalls = new Map();
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

for (const file of rendererFiles) {
  // Skip pure test fixtures or harnesses under src if any
  const rel = path.relative(repoRoot, file);
  if (rel.includes("test") || rel.includes("spec")) continue;
  const content = fs.readFileSync(file, "utf8");
  const rendererAst = parse(content, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] });
  walk(rendererAst, (node) => {
    if (!["MemberExpression", "OptionalMemberExpression"].includes(node.type)) return;
    const object = node.object;
    const isApi =
      (object?.type === "Identifier" && object.name === "electronAPI") ||
      (["MemberExpression", "OptionalMemberExpression"].includes(object?.type) &&
        object.object?.name === "window" &&
        object.property?.name === "electronAPI");
    if (!isApi) return;
    const methodName = node.computed ? node.property?.value : node.property?.name;
    if (typeof methodName !== "string") return;
    if (!rendererCalls.has(methodName)) {
      rendererCalls.set(methodName, new Set());
    }
    rendererCalls.get(methodName).add(rel);
  });
}

let errorCount = 0;

// A registered handler is insufficient if it calls a missing implementation.
const managers = {
  windowManager: "windowManager.js",
  environmentManager: "environment.js",
  databaseManager: "database.js",
  clipboardManager: "clipboard.js",
};
const declared = new Map();
for (const [name, file] of Object.entries(managers)) {
  const methods = new Set();
  walk(
    parse(fs.readFileSync(path.join(repoRoot, "src/helpers", file), "utf8"), {
      sourceType: "unambiguous",
    }),
    (node) => {
      if (node.type === "ClassMethod") methods.add(node.key?.name);
    }
  );
  declared.set(name, methods);
}
const handlerAst = parse(
  fs.readFileSync(path.join(repoRoot, "src/helpers/ipcHandlers.js"), "utf8"),
  { sourceType: "unambiguous" }
);
const aliases = new Map();
walk(handlerAst, (node) => {
  if (
    node.type === "VariableDeclarator" &&
    node.id?.type === "Identifier" &&
    node.init?.object?.type === "ThisExpression" &&
    declared.has(node.init.property?.name)
  ) {
    aliases.set(node.id.name, node.init.property.name);
  }
});
walk(handlerAst, (node) => {
  if (!["CallExpression", "OptionalCallExpression"].includes(node.type)) return;
  const callee = node.callee;
  const owner = callee?.object;
  const manager =
    owner?.type === "Identifier"
      ? aliases.get(owner.name)
      : owner?.object?.type === "ThisExpression"
        ? owner.property?.name
        : undefined;
  if (!declared.has(manager)) return;
  const method = callee.property?.name;
  if (method && !declared.get(manager).has(method)) {
    console.error(`[check-ipc-surface] ERROR: handler references missing ${manager}.${method}`);
    errorCount++;
  }
});

// Verify preload invokes have main handlers
for (const ch of preloadInvokes) {
  if (!mainHandles.has(ch)) {
    console.error(
      `[check-ipc-surface] ERROR: preload invokes channel '${ch}' but no ipcMain.handle registered.`
    );
    errorCount++;
  }
}

// Verify preload sends have main listeners
for (const ch of preloadSends) {
  if (!mainOns.has(ch)) {
    console.error(
      `[check-ipc-surface] ERROR: preload sends channel '${ch}' but no ipcMain.on registered.`
    );
    errorCount++;
  }
}

// Verify preload listeners are sent from main
for (const ch of preloadListeners) {
  if (!mainSends.has(ch)) {
    console.error(
      `[check-ipc-surface] ERROR: preload listens on channel '${ch}' but no sender found in main.`
    );
    errorCount++;
  }
}

// Verify renderer calls exist in preload
for (const [method, callers] of rendererCalls.entries()) {
  if (!exposedMethods.has(method)) {
    console.error(
      `[check-ipc-surface] ERROR: renderer calls missing electronAPI.${method} in: ${[...callers].join(", ")}`
    );
    errorCount++;
  }
}

if (errorCount > 0) {
  console.error(`\n[check-ipc-surface] FAILED: Found ${errorCount} IPC surface mismatch(es).`);
  process.exit(1);
}

console.log(
  `[check-ipc-surface] SUCCESS: IPC surface verified cleanly (${exposedMethods.size} methods, ${preloadInvokes.size + preloadSends.size + preloadListeners.size} channels).`
);
process.exit(0);
