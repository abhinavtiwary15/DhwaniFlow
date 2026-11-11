// electron-builder afterPack hook
//
// Runs after electron-builder assembles the output directory but before the
// final installer (NSIS/DMG/AppImage) is created.
//
// 1. Wraps the Linux binary in a shell script that forces XWayland, reads
//    user flags from ~/.config/dhwaniflow-flags.conf, and falls back to
//    --no-sandbox where the Chromium sandbox cannot work.
// 2. Fails the build if required binaries (windows-key-listener, windows-fast-paste)
//    are missing from resources/bin/.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildLinuxWrapperScript } = require("./lib/linux-launcher");

// ---------------------------------------------------------------------------
// macOS resource binary signing
// ---------------------------------------------------------------------------

function resolveAppPath(context) {
  if (context.electronPlatformName !== "darwin") {
    return context.appOutDir;
  }

  if (context.appOutDir.endsWith(".app")) {
    return context.appOutDir;
  }

  return path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
}

function resolveResourcesDir(context) {
  return context.electronPlatformName === "darwin"
    ? path.join(resolveAppPath(context), "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
}

function collectFiles(rootDir, skipDirs = new Set()) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (skipDirs.has(fullPath)) continue;
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function collectFrameworks(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const out = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name.endsWith(".framework")) {
        out.push(fullPath);
        continue;
      }
      queue.push(fullPath);
    }
  }

  return out;
}

function isMachOBinary(filePath) {
  try {
    const description = execFileSync("file", ["-b", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return description.includes("Mach-O");
  } catch {
    return false;
  }
}

function registerMacResourceBinariesForSigning(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const resourcesDir = resolveResourcesDir(context);
  const frameworks = collectFrameworks(resourcesDir);
  const skipDirs = new Set(frameworks);
  const machOFiles = collectFiles(resourcesDir, skipDirs).filter(isMachOBinary);
  const toRegister = [...frameworks, ...machOFiles];

  if (toRegister.length === 0) {
    return;
  }

  const macConfig = context.packager.platformSpecificBuildOptions;
  const existingBinaries = Array.isArray(macConfig.binaries) ? macConfig.binaries : [];

  macConfig.binaries = [...new Set([...existingBinaries, ...toRegister])];

  console.log(
    `  afterPack: registered ${frameworks.length} framework(s) and ${machOFiles.length} loose Mach-O file(s) under Contents/Resources for signing`
  );
}

// ---------------------------------------------------------------------------
// Linux XWayland wrapper
// ---------------------------------------------------------------------------

function wrapLinuxBinary(context) {
  if (context.electronPlatformName !== "linux") return;

  const appDir = context.appOutDir;
  const binaryName = context.packager.executableName;
  const binaryPath = path.join(appDir, binaryName);
  const realBinaryPath = path.join(appDir, binaryName + "-app");

  fs.renameSync(binaryPath, realBinaryPath);

  fs.writeFileSync(binaryPath, buildLinuxWrapperScript(binaryName), { mode: 0o755 });
}

// ---------------------------------------------------------------------------
// Native Binary Verifications
// ---------------------------------------------------------------------------

function verifyWindowsKeyListener(binDir) {
  const listenerPath = path.join(binDir, "windows-key-listener.exe");
  if (!fs.existsSync(listenerPath)) {
    throw new Error(
      `afterPack: missing ${listenerPath} — run npm run compile:winkeys on Windows; Push-to-Talk and hotkeys require the key listener`
    );
  }
}

function verifyWindowsFastPaste(binDir) {
  const pastePath = path.join(binDir, "windows-fast-paste.exe");
  if (!fs.existsSync(pastePath)) {
    throw new Error(
      `afterPack: missing ${pastePath} — run npm run compile:winpaste on Windows; fast-paste helper binary is missing`
    );
  }
}

function verifyUnpackedBinaries(context) {
  const isWindows = context.electronPlatformName === "win32";

  if (isWindows) {
    const binDir = path.join(resolveResourcesDir(context), "bin");
    verifyWindowsKeyListener(binDir);
    verifyWindowsFastPaste(binDir);
  }

  console.log("  afterPack: verified unpacked bundled binaries");
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

exports.default = async function (context) {
  wrapLinuxBinary(context);
  verifyUnpackedBinaries(context);
  registerMacResourceBinariesForSigning(context);
};

exports.verifyWindowsKeyListener = verifyWindowsKeyListener;
exports.verifyWindowsFastPaste = verifyWindowsFastPaste;
