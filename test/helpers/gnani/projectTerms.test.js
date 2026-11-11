const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  splitIdentifier,
  scanProjectFolders,
} = require("../../../src/helpers/gnani/project-terms");

describe("project-terms", () => {
  let tmpRoot;
  let projectDir;
  let outsideDir;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "df-terms-test-"));
    projectDir = path.join(tmpRoot, "my-app");
    outsideDir = path.join(tmpRoot, "outside-secret-area");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // 1. Outside directory with sensitive secret that should NEVER be reached
    fs.writeFileSync(
      path.join(outsideDir, "classified.txt"),
      "SUPER_SECRET_EXTERNAL_TOKEN = 'secret-token-outside-tree'"
    );

    // 2. Project structure
    fs.mkdirSync(path.join(projectDir, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "node_modules", "some-dep"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, ".git"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "build"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, ".venv"), { recursive: true });

    // package.json
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "dhwaniflow-sample",
        scripts: { build: "vite build", test: "node --test" },
        dependencies: {
          "better-sqlite3": "^11.0.0",
          "@deepgram/sdk": "^3.0.0",
        },
      })
    );

    // Code files
    fs.writeFileSync(
      path.join(projectDir, "src", "audioService.js"),
      `
      import { transcribeWav } from 'gnani-client';
      export class AudioChunkManager {
        constructor() {
          this.activeStreams = new Map();
        }
        processBuffer(buffer) {
          return transcribeWav(buffer);
        }
      }
      `
    );

    fs.writeFileSync(
      path.join(projectDir, "src", "components", "SpeechWidget.jsx"),
      `
      import React, { useState } from 'react';
      export function SpeechWidget() {
        const [isRecording, setIsRecording] = useState(false);
        return <div>Record</div>;
      }
      `
    );

    // Ignored directories content
    fs.writeFileSync(
      path.join(projectDir, "node_modules", "some-dep", "leak.js"),
      "export const leakedNodeModulesIdentifier = 1;"
    );
    fs.writeFileSync(
      path.join(projectDir, "dist", "bundle.js"),
      "export const leakedDistIdentifier = 2;"
    );

    // Secret files that must be ignored
    fs.writeFileSync(
      path.join(projectDir, ".env"),
      "API_KEY=leaked-api-key\nPRIVATE_TOKEN=leaked-token"
    );
    fs.writeFileSync(
      path.join(projectDir, ".env.local"),
      "SECRET_KEY=leaked-local-key"
    );
    fs.writeFileSync(
      path.join(projectDir, "server.key"),
      "MIIEowIBAAKCAQEA0leakedPrivateKey"
    );

    // File exceeding 500 KB limit
    const largeBuf = Buffer.alloc(550 * 1024, "x");
    fs.writeFileSync(path.join(projectDir, "src", "hugeFile.js"), largeBuf);

    // Symlink escape attempt: symlink inside project pointing outside projectDir
    try {
      fs.symlinkSync(outsideDir, path.join(projectDir, "src", "escapelink"), "dir");
    } catch {
      // Symlinks may require elevated privileges on Windows, test continues if unavailable
    }
  });

  after(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  describe("splitIdentifier", () => {
    test("splits camelCase and PascalCase into whole and components", () => {
      const parts = splitIdentifier("useAudioRecorder");
      assert.ok(parts.includes("useAudioRecorder"));
      assert.ok(parts.includes("use"));
      assert.ok(parts.includes("Audio"));
      assert.ok(parts.includes("Recorder"));
    });

    test("splits snake_case and kebab-case", () => {
      const parts = splitIdentifier("audio_chunk_processor");
      assert.ok(parts.includes("audio_chunk_processor"));
      assert.ok(parts.includes("audio"));
      assert.ok(parts.includes("chunk"));
      assert.ok(parts.includes("processor"));
    });

    test("drops short tokens and empty input", () => {
      assert.deepEqual(splitIdentifier(""), []);
      assert.deepEqual(splitIdentifier(null), []);
      assert.deepEqual(splitIdentifier("ab"), []);
    });
  });

  describe("scanProjectFolders", () => {
    test("scans chosen folders and extracts identifiers from code and package.json", () => {
      const res = scanProjectFolders([projectDir]);

      assert.ok(Array.isArray(res.terms));
      assert.ok(res.terms.length > 0);
      assert.ok(res.scannedFiles >= 2);

      const termsLower = res.terms.map((t) => t.toLowerCase());

      // Dependencies & code identifiers
      assert.ok(termsLower.includes("sqlite") || termsLower.includes("better-sqlite3"));
      assert.ok(termsLower.includes("audiochunkmanager") || termsLower.includes("speechwidget"));

      // Seeded dev terms
      assert.ok(termsLower.includes("api") || termsLower.includes("useeffect"));
    });

    test("skips node_modules, dist, build, .venv, and files over 500 KB", () => {
      const res = scanProjectFolders([projectDir]);
      const termsLower = res.terms.map((t) => t.toLowerCase());

      assert.equal(termsLower.includes("leakednodemodulesidentifier"), false);
      assert.equal(termsLower.includes("leakeddistidentifier"), false);
      assert.equal(termsLower.includes("hugefile"), false);
    });

    test("ignores .env* files, .key files, and secrets", () => {
      const res = scanProjectFolders([projectDir]);
      const termsLower = res.terms.map((t) => t.toLowerCase());

      assert.equal(termsLower.includes("leaked-api-key"), false);
      assert.equal(termsLower.includes("leaked-token"), false);
      assert.equal(termsLower.includes("leaked-local-key"), false);
      assert.equal(termsLower.includes("leakedprivatekey"), false);
    });

    test("refuses symlink escapes outside the allowed directory tree", () => {
      const res = scanProjectFolders([projectDir]);
      const termsLower = res.terms.map((t) => t.toLowerCase());

      // Should never have scanned outsideDir through symlink
      assert.equal(termsLower.includes("classified"), false);
      assert.equal(termsLower.includes("secret-token-outside-tree"), false);
    });

    test("caps at 200 terms and returns terms only, never file contents", () => {
      const res = scanProjectFolders([projectDir], { maxTerms: 250 });
      assert.ok(res.terms.length <= 200);

      // Verify no term contains code syntax, newlines, or file contents
      for (const term of res.terms) {
        assert.equal(typeof term, "string");
        assert.ok(!term.includes("\n"), "Term must not contain newlines");
        assert.ok(!term.includes("{"), "Term must not contain braces");
        assert.ok(!term.includes(";"), "Term must not contain semicolons");
      }
    });
  });
});
