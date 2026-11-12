import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const notices = [];
const missing = [];
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative || entry.dev || !fs.existsSync(path.join(root, relative, "package.json"))) continue;
  const folder = path.join(root, relative);
  const pkg = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"));
  if (/\b(?:A?GPL)(?:-|\b)/i.test(pkg.license || ""))
    throw new Error(`Copyleft production dependency requires review: ${pkg.name}`);
  const files = fs
    .readdirSync(folder)
    .filter(
      (name) =>
        /^(?:licen[cs]e|copying|notice|ofl)(?:[.-]|$)/i.test(name) &&
        fs.statSync(path.join(folder, name)).isFile()
    );
  let fallback = "";
  if (!files.length) {
    const parentLicense = pkg.name.startsWith("@napi-rs/keyring-")
      ? "@napi-rs/keyring/LICENSE"
      : pkg.name === "react-remove-scroll-bar"
        ? "react-remove-scroll/LICENSE"
        : null;
    if (parentLicense)
      fallback = `Related package license (${parentLicense}):\n\n${fs.readFileSync(path.join(root, "node_modules", parentLicense), "utf8")}`;
    else if (pkg.name === "html-parse-stringify" && pkg.license === "MIT") {
      const mit = fs.readFileSync(path.join(root, "node_modules/@napi-rs/keyring/LICENSE"), "utf8");
      fallback = `Published package metadata: ${JSON.stringify({ author: pkg.author, license: pkg.license, repository: pkg.repository })}\n\nThe published package declares MIT but omits a standalone license file and copyright year. Attribution is reproduced from its metadata. Standard MIT terms follow:\n\n${mit.slice(mit.indexOf("Permission is hereby granted"))}`;
    } else missing.push(pkg.name);
  }
  notices.push(
    `### ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license || "See included text"}\n\n${fallback}\n` +
      files
        .map(
          (name) =>
            `\n${name}:\n\n\u0060\u0060\u0060text\n${fs.readFileSync(path.join(folder, name), "utf8")}\n\u0060\u0060\u0060\n`
        )
        .join("")
  );
}
if (missing.length) throw new Error(`Missing production license text: ${missing.join(", ")}`);
const destination = path.join(root, "THIRD_PARTY_NOTICES.md");
const previous = fs.readFileSync(destination, "utf8");
const fontsStart = previous.indexOf("## Bundled Fonts");
const fontsEnd = previous.indexOf("## Locked production dependency notices", fontsStart);
if (fontsStart < 0) throw new Error("Bundled-font notices are required");
const fonts = previous.slice(fontsStart, fontsEnd < 0 ? undefined : fontsEnd).trim();
fs.writeFileSync(
  destination,
  `# Third-party notices\n\nDhwaniFlow is built on OpenWhispr (MIT) by its contributors. See LICENSE.\n\nThe Windows key-listener and paste helpers are compiled from this project's MIT-licensed sources. Electron includes its own license and Chromium notices in the distribution. Platform-specific optional dependencies listed below are included only on their supported platform.\n\n${fonts}\n\n## Locked production dependency notices\n\nGenerated from package-lock.json and installed package license files.\n\n${notices.sort().join("\n")}\n`
);
console.log(
  `Included license texts for ${notices.length} installed production packages and bundled fonts.`
);
