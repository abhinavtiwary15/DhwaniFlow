#!/usr/bin/env node
/**
 * scripts/run-retained-tests.mjs
 *
 * Runs all retained test suites in DhwaniFlow, ensuring execution completes
 * well under the 10-minute ceiling and exits with a non-zero code on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const testRoot = path.join(repoRoot, 'test');

const RETAINED_FOLDERS = [
  'components',
  'config',
  'helpers',
  'hooks',
  'lib',
  'locales',
  'scripts',
  'stores',
  'utils'
];

function findTestFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findTestFiles(full));
    } else if (/\.test\.(js|ts)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const testFiles = [];
for (const folder of RETAINED_FOLDERS) {
  const folderPath = path.join(testRoot, folder);
  testFiles.push(...findTestFiles(folderPath));
}

testFiles.sort();

console.log(`[run-retained-tests] Found ${testFiles.length} retained test files across ${RETAINED_FOLDERS.length} folders.`);

const CONCURRENCY = 6;
const passed = [];
const failed = [];
let index = 0;
let completed = 0;
const startTime = Date.now();

function runWorker() {
  if (index >= testFiles.length) return Promise.resolve();
  const file = testFiles[index++];
  const relPath = path.relative(repoRoot, file).replace(/\\/g, '/');

  return new Promise((resolve) => {
    exec(
      `node --import tsx --test "${file}"`,
      {
        cwd: repoRoot,
        timeout: 30000,
        env: {
          ...process.env,
          NODE_ENV: 'test'
        }
      },
      (err, stdout, stderr) => {
        completed++;
        if (err) {
          failed.push({
            file: relPath,
            error: (stdout || '') + '\n' + (stderr || '')
          });
          process.stdout.write('F');
        } else {
          passed.push(relPath);
          process.stdout.write('.');
        }

        if (completed % 50 === 0 || completed === testFiles.length) {
          console.log(` [${completed}/${testFiles.length}]`);
        }

        runWorker().then(resolve);
      }
    );
  });
}

const workers = Array.from({ length: CONCURRENCY }, () => runWorker());

Promise.all(workers).then(() => {
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n=== Retained Tests Execution Summary ===`);
  console.log(`Duration: ${durationSec}s (ceiling: 600s)`);
  console.log(`Passed:   ${passed.length}`);
  console.log(`Failed:   ${failed.length}`);

  if (failed.length > 0) {
    console.error(`\n[FAILURES] ${failed.length} test file(s) failed:`);
    for (const f of failed) {
      console.error(`\n--- ${f.file} ---`);
      console.error(f.error.trim().slice(0, 1000));
    }
    process.exit(1);
  }

  console.log(`\nSUCCESS: All ${passed.length} retained test suites passed cleanly.`);
  process.exit(0);
});
