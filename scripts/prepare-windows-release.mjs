import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "resources", "bin");
fs.mkdirSync(output, { recursive: true });
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const artifacts = [];
for (const name of ["windows-key-listener", "windows-fast-paste"]) {
  const source = path.join(root, "resources", name + ".c");
  const binary = path.join(output, name + ".exe");
  const supplied = process.env.DHWANIFLOW_NATIVE_ARTIFACT_DIR;
  if (supplied) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(supplied, "windows-helpers.json"), "utf8")
    );
    const entry = manifest.find((entry) => entry.name === name);
    const candidate = path.join(supplied, name + ".exe");
    if (!entry || entry.sourceSha256 !== hash(source) || entry.binarySha256 !== hash(candidate))
      throw new Error("Native artifact manifest does not match release source");
    fs.copyFileSync(candidate, binary);
  } else {
    if (process.platform !== "win32")
      throw new Error(
        "Build Windows native helpers on Windows, or supply verified artifacts with DHWANIFLOW_NATIVE_ARTIFACT_DIR"
      );
    let built = false;
    for (const [compiler, args] of [
      [
        "cl.exe",
        [
          "/O2",
          "/nologo",
          "/Brepro",
          source,
          "/Fe:" + binary,
          "/Fo:" + path.join(output, name + ".obj"),
          "user32.lib",
          "/link",
          "/Brepro",
        ],
      ],
      ["gcc.exe", ["-O2", source, "-o", binary, "-luser32"]],
      ["clang.exe", ["-O2", source, "-o", binary, "-luser32"]],
    ]) {
      const result = spawnSync(compiler, args, { cwd: root, windowsHide: true, stdio: "pipe" });
      if (!result.error && result.status === 0) {
        built = true;
        break;
      }
    }
    if (!built)
      throw new Error(
        "Windows C compiler unavailable or compilation failed. Run from a Visual Studio Developer terminal, install MinGW/LLVM, or provide verified native artifacts. No download was attempted."
      );
  }
  const pe = fs.readFileSync(binary);
  if (pe.toString("ascii", 0, 2) !== "MZ" || pe.readUInt16LE(pe.readUInt32LE(0x3c) + 4) !== 0x8664)
    throw new Error("Expected an x64 Windows helper");
  if (name === "windows-fast-paste" && process.platform === "win32") {
    const result = spawnSync(binary, ["--capabilities"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 3000,
    });
    if (result.status !== 0 || !result.stdout?.includes("selection-copy-v1"))
      throw new Error(
        `Fast-paste helper capability check failed (${result.error?.code || result.status}). Check Windows application-control policy and signing; no keystrokes were sent.`
      );
  }
  artifacts.push({ name, sourceSha256: hash(source), binarySha256: hash(binary) });
}
fs.writeFileSync(
  path.join(output, "windows-helpers.json"),
  JSON.stringify(artifacts, null, 2) + "\n"
);
console.log("Windows helper artifacts verified against release sources.");
