#!/usr/bin/env node
/**
 * release-check.mjs
 * 
 * Release verification script with zero external dependencies.
 * Ensures repository hygiene, absence of secrets, personal paths,
 * stale working artifacts, and unapproved branding references.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Forbidden file name patterns
const FORBIDDEN_FILE_PATTERNS = [
  { name: '.env secrets file', regex: /^\.env(?!\.example$)/i },
  { name: 'Log file (*.log)', regex: /\.log$/i },
  { name: 'Certificate/key file (*.pem, *.key)', regex: /\.(pem|key)$/i },
  { name: 'credit_log.json', regex: /^credit_log\.json$/i },
  { name: 'probe-results*.json', regex: /^probe-results.*\.json$/i },
  { name: '.project.json', regex: /^\.project\.json$/i },
  { name: 'Agent transcript file (*.transcript*)', regex: /(?:^|\.)transcript(?:\.|$)/i },
  { name: 'Agent task file (*.task*)', regex: /(?:^|\.)task(?:\.|$)/i },
  { name: 'Handoff file (HANDOFF*.md)', regex: /^HANDOFF.*\.md$/i },
  { name: 'Ad-hoc script (*.cjs)', regex: /^(?:update|cleanup|fix)-.*\.cjs$/i }
];

// Forbidden text patterns
const FORBIDDEN_TEXT_PATTERNS = [
  { name: 'Windows User Path ("C:\\Users")', regex: /C:[\\/]Users/i },
  { name: 'Unix User Path ("/Users/")', regex: /\/Users\// },
  { name: 'Local Machine Username ("abhin")', regex: /\babhin(?!avtiwary15\b|av\b)/i },
  { name: 'Legacy Project Name ("BolCode")', regex: /BolCode/ },
  { name: 'Legacy Project Name ("bolcode")', regex: /bolcode/ },
  { name: 'Agent Marker ("Antigravity")', regex: /Antigravity/ },
  { name: 'Unresolved Marker ("TODO(verify)")', regex: /TODO\(verify\)/ },
  { name: 'Absolute File URI ("file:///")', regex: /file:\/\/\// },
  { 
    name: 'Suspicious API Key',
    regex: /(?:API[_-]?KEY|AUTH[_-]?TOKEN|SECRET[_-]?KEY)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/i,
    ignore: /your_gnani_vachana_key_here|your_api_key_here|placeholder|customApiKey|CustomApiKey|ApiKey|leaked-/i
  }
];

// Binary and ignorable extensions
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns',
  '.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a',
  '.bin', '.exe', '.dll', '.so', '.dylib', '.node',
  '.otf', '.ttf', '.woff', '.woff2', '.zip', '.tar', '.gz'
]);

// Ignored directories during inspection
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  '.scratch',
  'dist',
  'out',
  'coverage',
  '.nyc_output',
  'build'
]);

// Paths allowlisted from text content checks
const CONTENT_EXEMPT_PATHS = [];

// Lines allowlisted across any file
const ALLOWLISTED_LINES = [
  'DhwaniFlow is built on OpenWhispr (MIT)',
  'DhwaniFlow is built on OpenWhispr (MIT) by its contributors. See LICENSE.',
  'Built on OpenWhispr (MIT)',
  'Copyright (c) 2024 OpenWhispr Team',
  'Copyright (c) 2026 Abhinav Tiwary',
  'abhinavtiwary15'
];

function getTrackedFiles() {
  try {
    const stdout = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' });
    return stdout.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (err) {
    return getLocalFiles(repoRoot);
  }
}

function getLocalFiles(dir, base = '') {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const relPath = base ? path.join(base, entry.name) : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getLocalFiles(fullPath, relPath));
    } else {
      results.push(relPath.replace(/\\/g, '/'));
    }
  }
  return results;
}

console.log('[release-check] Starting repository hygiene inspection...');
const files = getTrackedFiles();
console.log(`[release-check] Inspecting ${files.length} tracked files.`);

const violations = [];

// Check for junctions and symlinks across the workspace
function checkSymlinks(dir, base = '') {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const rel = base ? path.join(base, entry.name) : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        violations.push({
          file: rel.replace(/\\/g, '/'),
          reason: 'Symlinks and junctions are forbidden'
        });
        continue;
      }
      if (entry.isDirectory()) {
        checkSymlinks(full, rel);
      }
    }
  } catch {
    // ignore unreadable directories
  }
}
checkSymlinks(repoRoot);

for (const relPath of files) {
  const normalizedRel = relPath.replace(/\\/g, '/');
  const fullPath = path.join(repoRoot, relPath);
  const fileName = path.basename(relPath);

  // Check tracked files in forbidden directories (.scratch/ or tools/)
  if (normalizedRel.startsWith('.scratch/') || normalizedRel === '.scratch' ||
      normalizedRel.startsWith('tools/') || normalizedRel === 'tools') {
    violations.push({
      file: relPath,
      reason: 'Tracked file in forbidden directory (.scratch/ or tools/)'
    });
  }

  // 1. Check file size and symlinks
  try {
    const lstat = fs.lstatSync(fullPath);
    if (lstat.isSymbolicLink()) {
      violations.push({
        file: relPath,
        reason: 'Forbidden symlink or junction'
      });
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE) {
      violations.push({
        file: relPath,
        reason: `File size exceeds 5 MB limit: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`
      });
      continue;
    }
  } catch {
    continue;
  }

  // 2. Check forbidden file name patterns
  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.regex.test(fileName)) {
      violations.push({
        file: relPath,
        reason: `Forbidden file name: ${pattern.name}`
      });
      break;
    }
  }

  // Skip content checks for binary files
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    continue;
  }

  // Skip self
  if (normalizedRel.endsWith('scripts/release-check.mjs')) {
    continue;
  }

  // Skip exempt upstream docs for content checks
  if (CONTENT_EXEMPT_PATHS.some(exempt => normalizedRel.startsWith(exempt) || normalizedRel === exempt)) {
    continue;
  }

  // 3. Check forbidden text patterns
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');
  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];

    // Check allowlisted exact line segments
    if (ALLOWLISTED_LINES.some(allowed => line.includes(allowed))) {
      continue;
    }

    for (const rule of FORBIDDEN_TEXT_PATTERNS) {
      // Under test/, ignore "file:///" and "/Users/" hits
      if (normalizedRel.startsWith('test/')) {
        if (rule.name === 'Absolute File URI ("file:///")' || rule.name === 'Unix User Path ("/Users/")') {
          continue;
        }
        if (line.includes('/Users/') || line.includes('file:///')) {
          continue;
        }
      }

      if (rule.regex.test(line)) {
        if (rule.ignore && rule.ignore.test(line)) {
          continue;
        }

        violations.push({
          file: relPath,
          line: lineNum,
          rule: rule.name,
          snippet: line.trim().slice(0, 100)
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n[release-check] FAILED: Found ${violations.length} hygiene violation(s):\n`);
  for (const v of violations) {
    if (v.line) {
      console.error(`  - ${v.file}:${v.line} [${v.rule}]`);
      console.error(`    Line: "${v.snippet}"`);
    } else {
      console.error(`  - ${v.file}: ${v.reason}`);
    }
  }
  console.error('\nPlease fix all violations above before committing or creating a release.\n');
  process.exit(1);
}

console.log('[release-check] SUCCESS: All files and contents passed release hygiene checks cleanly.');
process.exit(0);
