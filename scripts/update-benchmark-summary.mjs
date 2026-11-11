#!/usr/bin/env node
/**
 * update-benchmark-summary.mjs
 * 
 * Extracts the head-to-head benchmark summary table from benchmark/results/report.md
 * and injects it into the placeholder section of README.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const reportPath = path.join(repoRoot, 'benchmark', 'results', 'report.md');
const readmePath = path.join(repoRoot, 'README.md');

if (!fs.existsSync(reportPath)) {
  console.warn(`[update-benchmark-summary] Report not found at ${reportPath}; skipping.`);
  process.exit(0);
}

if (!fs.existsSync(readmePath)) {
  console.error(`[update-benchmark-summary] README not found at ${readmePath}`);
  process.exit(1);
}

const reportContent = fs.readFileSync(reportPath, 'utf8');
const readmeContent = fs.readFileSync(readmePath, 'utf8');

// Find table in report.md
const tableMatch = reportContent.match(/### Condition Head-to-Head[^\n]*\n([\s\S]*?)(?=\n---|## 2|\n\n##)/);
if (!tableMatch) {
  console.error('[update-benchmark-summary] Could not find head-to-head table in report.md');
  process.exit(1);
}

const tableMarkdown = tableMatch[1].trim();

const START_MARKER = '<!-- BENCHMARK_TABLE_START -->';
const END_MARKER = '<!-- BENCHMARK_TABLE_END -->';

const startIdx = readmeContent.indexOf(START_MARKER);
const endIdx = readmeContent.indexOf(END_MARKER);

if (startIdx === -1 || endIdx === -1) {
  console.error(`[update-benchmark-summary] Markers ${START_MARKER} and ${END_MARKER} not found in README.md`);
  process.exit(1);
}

const updatedReadme = 
  readmeContent.slice(0, startIdx + START_MARKER.length) +
  '\n\n' + tableMarkdown + '\n\n' +
  readmeContent.slice(endIdx);

fs.writeFileSync(readmePath, updatedReadme, 'utf8');
console.log('[update-benchmark-summary] Successfully updated README.md with latest benchmark results table.');
