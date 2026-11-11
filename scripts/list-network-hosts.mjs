#!/usr/bin/env node
/**
 * scripts/list-network-hosts.mjs
 *
 * Extracts every http, https, ws, and wss host referenced in src/, main.js, and preload.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const TARGET_PATHS = [
  path.join(repoRoot, 'main.js'),
  path.join(repoRoot, 'preload.js'),
  path.join(repoRoot, 'src')
];

const URL_REGEX = /(?:https?|wss?):\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(?:\/[^\s"'`<>()]*)?/gi;

function getFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return [target];

  let results = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === '.scratch') continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (/\.(js|jsx|ts|tsx|json|mjs|cjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const hostsMap = new Map();

for (const target of TARGET_PATHS) {
  const files = getFiles(target);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(URL_REGEX);
      if (matches) {
        for (const match of matches) {
          try {
            // Clean up trailing punctuation if matched
            const cleaned = match.replace(/[.,;:)\]]+$/, '');
            const urlObj = new URL(cleaned);
            const host = urlObj.hostname;
            if (!host) continue;
            // Ignore standard XML/SVG namespaces
            if (host === 'www.w3.org') continue;

            const relFile = path.relative(repoRoot, file).replace(/\\/g, '/');
            if (!hostsMap.has(host)) {
              hostsMap.set(host, []);
            }
            hostsMap.get(host).push({
              file: relFile,
              line: i + 1,
              url: cleaned
            });
          } catch {
            // ignore malformed URLs
          }
        }
      }
    }
  }
}

console.log('=== DhwaniFlow Outbound Network Hosts Audit ===\n');
const sortedHosts = [...hostsMap.keys()].sort();

for (const host of sortedHosts) {
  const refs = hostsMap.get(host);
  console.log(`Host: ${host} (${refs.length} references)`);
  for (const ref of refs.slice(0, 5)) {
    console.log(`  - ${ref.file}:${ref.line} -> ${ref.url}`);
  }
  if (refs.length > 5) {
    console.log(`  ... and ${refs.length - 5} more`);
  }
  console.log('');
}

console.log(`Total unique outbound hosts found: ${sortedHosts.length}`);
