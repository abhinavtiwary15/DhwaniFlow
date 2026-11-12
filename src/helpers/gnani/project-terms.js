/**
 * project-terms.js
 *
 * Scans an explicit list of project folders chosen by the user to extract
 * and rank software identifiers, dependency names, and vocabulary for Gnani STT biasing.
 *
 * Security and privacy rules:
 * - Realpath-resolve and refuse symlink escapes
 * - Skip node_modules, .git, dist, build, .venv, and files over 500 KB
 * - Ignore .env* files and anything that looks like a secret or credential
 * - Return terms only, never file contents
 * - Cap results at 200 terms
 */

const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB limit
const DEFAULT_MAX_TERMS = 200;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".venv",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
]);

const CODE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".py",
  ".rs",
  ".go",
  ".html",
  ".css",
  ".scss",
  ".md",
  ".sql",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env/i,
  /\.(key|pem|p12|pfx|pkcs12|cert|crt)$/i,
  /id_rsa|id_ed25519|credentials\.json/i,
];

const SECRET_TOKEN_PATTERNS = [
  /^(?:api[_-]?key|auth[_-]?token|secret[_-]?key|client[_-]?secret|password|passwd)$/i,
  /^[A-Za-z0-9+/=]{40,}$/, // high entropy token
];

const DEFAULT_STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "have",
  "for",
  "not",
  "with",
  "you",
  "this",
  "but",
  "his",
  "from",
  "they",
  "say",
  "her",
  "she",
  "will",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "out",
  "about",
  "who",
  "get",
  "which",
  "when",
  "make",
  "can",
  "like",
  "time",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "are",
  "was",
  "were",
  "been",
  "has",
  "had",
  "does",
  "did",
  "doing",
  "shall",
  "should",
  "true",
  "false",
  "null",
  "undefined",
  "let",
  "var",
  "const",
  "return",
  "function",
  "this",
  "case",
  "default",
  "break",
  "continue",
  "while",
  "each",
  "else",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "void",
  "delete",
  "export",
  "import",
  "from",
  "class",
  "extends",
  "super",
  "self",
  "args",
  "kwargs",
  "file",
  "line",
  "test",
  "item",
  "list",
  "data",
]);

/**
 * Splits camelCase, PascalCase, snake_case, or kebab-case tokens into sub-tokens.
 * Returns array of [originalToken, ...subTokens].
 *
 * @param {string} token
 * @returns {string[]}
 */
function splitIdentifier(token) {
  if (!token || typeof token !== "string") return [];
  const clean = token.replace(/^[_\-.$]+|[_\-.$]+$/g, "");
  if (!clean || clean.length < 3) return [];

  const results = new Set();
  results.add(clean);

  // Split on delimiters (_ or -)
  const delimiterParts = clean.split(/[_-]+/).filter((p) => p.length >= 3);
  for (const part of delimiterParts) {
    results.add(part);

    // Split camelCase / PascalCase
    const camelParts = part
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(" ")
      .filter((p) => p.length >= 3);

    for (const cp of camelParts) {
      results.add(cp);
    }
  }

  return Array.from(results);
}

/**
 * Loads default developer vocabulary from JSON file.
 *
 * @param {string} [devTermsPath]
 * @returns {string[]}
 */
function loadDevTerms(devTermsPath) {
  const targetPath = devTermsPath || path.join(__dirname, "data", "dev-terms.json");
  try {
    if (fs.existsSync(targetPath)) {
      const content = fs.readFileSync(targetPath, "utf8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((t) => typeof t === "string" && t.trim().length >= 2);
      }
    }
  } catch {
    // Ignore read error, fallback below
  }
  return [
    "API",
    "useEffect",
    "useState",
    "Kubernetes",
    "Docker",
    "PR",
    "merge",
    "commit",
    "deploy",
    "backend",
    "frontend",
    "endpoint",
    "database",
    "token",
  ];
}

/**
 * Adds an identifier to the term frequency map.
 */
function addToken(termMap, token, filePath, weight = 1) {
  if (!token || token.length < 3) return;
  if (/^\d+$/.test(token)) return; // skip numbers

  for (const pattern of SECRET_TOKEN_PATTERNS) {
    if (pattern.test(token)) return;
  }

  const lower = token.toLowerCase();
  if (DEFAULT_STOPWORDS.has(lower)) return;

  let entry = termMap.get(lower);
  if (!entry) {
    entry = {
      key: lower,
      original: token,
      weight: 0,
      files: new Set(),
    };
    termMap.set(lower, entry);
  }

  // Preserve casing if current token has informative casing
  if (token !== token.toLowerCase() && entry.original === entry.original.toLowerCase()) {
    entry.original = token;
  }

  entry.weight += weight;
  if (filePath) {
    entry.files.add(filePath);
  }
}

/**
 * Extracts tokens from package.json.
 */
function extractFromPackageJson(filePath, termMap) {
  try {
    if (fs.statSync(filePath).size > MAX_FILE_SIZE_BYTES) return;
    const raw = fs.readFileSync(filePath, "utf8");
    const pkg = JSON.parse(raw);

    const names = [];
    if (pkg.name) names.push(pkg.name);
    if (pkg.scripts) names.push(...Object.keys(pkg.scripts));
    if (pkg.dependencies) names.push(...Object.keys(pkg.dependencies));
    if (pkg.devDependencies) names.push(...Object.keys(pkg.devDependencies));
    if (pkg.peerDependencies) names.push(...Object.keys(pkg.peerDependencies));

    for (const name of names) {
      const cleanName = name.replace(/^@[^/]+\//, "");
      const parts = splitIdentifier(cleanName);
      for (const p of parts) {
        addToken(termMap, p, filePath, 5);
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
}

/**
 * Extracts tokens from a code file while ignoring secrets.
 */
function extractFromCodeFile(filePath, termMap) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) return;

    // Add filename tokens
    const baseName = path.basename(filePath, path.extname(filePath));
    const baseParts = splitIdentifier(baseName);
    for (const bp of baseParts) {
      addToken(termMap, bp, filePath, 3);
    }

    const source = fs.readFileSync(filePath, "utf8");

    // Extract import/require module names
    const importRegex =
      /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
      const moduleName = match[1] || match[2];
      if (moduleName && /^@?[\w/-]+$/.test(moduleName) && !moduleName.startsWith(".")) {
        const parts = splitIdentifier(moduleName.replace(/^@[^/]+\//, ""));
        for (const p of parts) {
          addToken(termMap, p, filePath, 3);
        }
      }
    }

    // Extract declared functions, classes, components, identifiers
    const content = source
      .replace(/(["'`])(?:\\[\s\S]|(?!\1)[\s\S])*?\1/g, " ")
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/g, " ");
    const identRegex = /[a-zA-Z_$][a-zA-Z0-9_$]{2,}/g;
    while ((match = identRegex.exec(content)) !== null) {
      const ident = match[0];
      const parts = splitIdentifier(ident);
      for (const p of parts) {
        addToken(termMap, p, filePath, 1);
      }
    }
  } catch {
    // Ignore unreadable files
  }
}

/**
 * Checks if a path or filename looks like a secret.
 */
function isSecretFile(entryName) {
  for (const pat of SECRET_FILE_PATTERNS) {
    if (pat.test(entryName)) return true;
  }
  return false;
}

/**
 * Recursively scans a directory with symlink escape protection.
 *
 * @param {string} dirPath
 * @param {string} rootRealPath
 * @param {Map} termMap
 * @param {{ files: number }} counter
 */
function scanDirectorySafe(dirPath, rootRealPath, termMap, counter) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      counter.files >= 2000 ||
      counter.bytes >= 8 * 1024 * 1024 ||
      Date.now() > counter.deadline ||
      termMap.size > 20000
    ) {
      counter.truncated = true;
      return;
    }
    const fullPath = path.join(dirPath, entry.name);

    // Skip secret files (.env*, certificates, keys)
    if (isSecretFile(entry.name)) {
      continue;
    }

    // Symlink escape check
    try {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        continue;
      }
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      scanDirectorySafe(fullPath, rootRealPath, termMap, counter);
    } else if (entry.isFile()) {
      counter.files++;
      const size = fs.statSync(fullPath).size;
      if (size > MAX_FILE_SIZE_BYTES || counter.bytes + size > 8 * 1024 * 1024) continue;
      counter.bytes += size;
      if (entry.name === "package.json") {
        extractFromPackageJson(fullPath, termMap);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          extractFromCodeFile(fullPath, termMap);
        }
      }
    }
  }
}

/**
 * Scans an explicit list of user-provided folders and returns ranked terms (max 200).
 *
 * @param {string|string[]} folders - Explicit folder or list of folders chosen by user
 * @param {object} [options]
 * @param {number} [options.maxTerms=200]
 * @param {string} [options.devTermsPath]
 * @returns {{ terms: string[], scannedFiles: number, totalExtracted: number }}
 */
function scanProjectFolders(folders, options = {}) {
  const maxTerms = Math.min(options.maxTerms || DEFAULT_MAX_TERMS, 200);
  const folderList = Array.isArray(folders) ? folders : [folders];
  const termMap = new Map();
  const counter = { files: 0, bytes: 0, deadline: Date.now() + 1000, truncated: false };

  // Seed default dev terms
  const devTerms = loadDevTerms(options.devTermsPath);
  for (const dt of devTerms) {
    addToken(termMap, dt, null, 1);
  }

  for (const rawFolder of folderList) {
    if (!rawFolder || typeof rawFolder !== "string") continue;
    if (!fs.existsSync(rawFolder)) continue;

    let rootRealPath;
    try {
      rootRealPath = fs.realpathSync(rawFolder);
      const stat = fs.statSync(rootRealPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    scanDirectorySafe(rootRealPath, rootRealPath, termMap, counter);
  }

  // Rank terms: (fileCount * 10) + weight
  const scored = [];
  for (const entry of termMap.values()) {
    const fileCount = entry.files ? entry.files.size : 0;
    const score = fileCount * 10 + entry.weight;
    scored.push({ original: entry.original, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const topTerms = scored.slice(0, maxTerms).map((s) => s.original);

  return {
    terms: topTerms,
    scannedFiles: counter.files,
    totalExtracted: scored.length,
    truncated: counter.truncated,
  };
}

module.exports = {
  splitIdentifier,
  loadDevTerms,
  scanProjectFolders,
  scanProject: (p, opts) => scanProjectFolders(p, opts), // backwards compatibility alias
  DEFAULT_STOPWORDS,
  MAX_FILE_SIZE_BYTES,
};
const { Worker, isMainThread, workerData, parentPort } = require("node:worker_threads");
if (!isMainThread && workerData?.kind === "project-terms")
  parentPort.postMessage(scanProjectFolders(workerData.folders));
module.exports.scanProjectFoldersAsync = (folders) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { kind: "project-terms", folders },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Project scan timed out"));
    }, 3000);
    worker.once("message", (result) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Project scan failed"));
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Project scan stopped"));
    });
  });
