#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let pythonBin = null;

// 1. Honour PYTHON environment variable first
if (process.env.PYTHON && process.env.PYTHON.trim()) {
  pythonBin = process.env.PYTHON.trim();
} else {
  // 2. Search known virtual environment locations
  const fallbackCandidates = [
    path.join(__dirname, '..', 'tools', '.venv', 'Scripts', 'python.exe'),
    path.join(__dirname, '..', 'tools', '.venv', 'bin', 'python'),
    path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe'),
    path.join(__dirname, '..', '.venv', 'bin', 'python'),
    path.join(__dirname, '..', 'benchmark', '.venv', 'Scripts', 'python.exe'),
    path.join(__dirname, '..', 'benchmark', '.venv', 'bin', 'python'),
  ];

  for (const cand of fallbackCandidates) {
    try {
      if (fs.existsSync(cand)) {
        pythonBin = cand;
        break;
      }
    } catch {}
  }

  // 3. Fall back to system python
  if (!pythonBin) {
    pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  }
}

const scriptPath = path.join(__dirname, '..', 'benchmark', 'test_benchmark_suite.py');
const result = spawnSync(pythonBin, [scriptPath], { encoding: 'utf8' });

if (result.error) {
  console.error(`[run-benchmark-tests] Failed to execute Python interpreter (${pythonBin}): ${result.error.message}`);
  process.exit(1);
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  const stderrText = result.stderr || '';
  const missingModMatch =
    stderrText.match(/ModuleNotFoundError:\s+No module named\s+['"]([^'"]+)['"]/i) ||
    stderrText.match(/ImportError:\s+cannot import name\s+.*?from\s+['"]([^'"]+)['"]/i) ||
    stderrText.match(/ImportError:\s+No module named\s+['"]([^'"]+)['"]/i);

  if (missingModMatch) {
    const missingModule = missingModMatch[1];
    console.error(`\n[run-benchmark-tests] Error: Python import failed due to missing module '${missingModule}'.`);
    console.error(`Ensure benchmark dependencies are installed or set the PYTHON environment variable to a valid virtualenv.`);
  }
  process.exit(result.status ?? 1);
}

process.exit(0);
