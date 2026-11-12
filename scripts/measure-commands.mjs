#!/usr/bin/env node
"use strict";

/**
 * scripts/measure-commands.mjs
 *
 * Accuracy and latency measurement benchmark for DhwaniFlow Voice Command Parser.
 * Evaluates:
 * - Positive utterance accuracy across all 21 commands (Latin, Devanagari, mixed)
 * - Negative / dictation rejection rate (must not trigger false positive actions)
 * - Safety filter blocking rate (banned destructive system operations)
 * - Microbenchmark parsing latency (mean, p50, p95, p99)
 */

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const { parseCommand } = require("../src/helpers/commands");
const { POSITIVE_TEST_CASES } = require("../test/helpers/commands/positiveUtterances.test.js");
const { BANNED_SAFETY_CASES } = require("../test/helpers/commands/bannedSafety.test.js");
const { NEGATIVE_TEST_CASES } = require("../test/helpers/commands/negativeUtterances.test.js");

console.log("=".repeat(70));
console.log("  DhwaniFlow Voice Command Benchmark & Accuracy Measurement");
console.log("=".repeat(70));

// 1. Positive Test Cases Evaluation
let positivePassed = 0;
let positiveFailed = 0;
const positiveFailures = [];

for (const testCase of POSITIVE_TEST_CASES) {
  const result = parseCommand(testCase.utterance);
  let ok = result.commandId === testCase.commandId;
  if (ok && testCase.params) {
    for (const [k, v] of Object.entries(testCase.params)) {
      if (result.params?.[k] !== v) {
        ok = false;
        break;
      }
    }
  }

  if (ok) {
    positivePassed++;
  } else {
    positiveFailed++;
    positiveFailures.push({
      utterance: testCase.utterance,
      expected: { commandId: testCase.commandId, params: testCase.params },
      actual: { commandId: result.commandId, params: result.params, unknown: result.unknown },
    });
  }
}

const positiveAccuracy = (positivePassed / POSITIVE_TEST_CASES.length) * 100;
console.log(`\n[Accuracy] Positive Utterances:`);
console.log(`  Total: ${POSITIVE_TEST_CASES.length}`);
console.log(`  Passed: ${positivePassed}`);
console.log(`  Failed: ${positiveFailed}`);
console.log(`  Accuracy: ${positiveAccuracy.toFixed(2)}%`);

// 2. Negative / Dictation Rejection Evaluation
let negativePassed = 0;
let negativeFailed = 0;
for (const phrase of NEGATIVE_TEST_CASES) {
  const result = parseCommand(phrase);
  if (result.unknown === true) {
    negativePassed++;
  } else {
    negativeFailed++;
  }
}
const negativeRejectionRate = (negativePassed / NEGATIVE_TEST_CASES.length) * 100;
console.log(`\n[Accuracy] Negative / Dictation Rejection:`);
console.log(`  Total: ${NEGATIVE_TEST_CASES.length}`);
console.log(`  Correctly Rejected (unknown): ${negativePassed}`);
console.log(`  False Triggers: ${negativeFailed}`);
console.log(`  Rejection Rate: ${negativeRejectionRate.toFixed(2)}%`);

// 3. Safety Filter Evaluation
let safetyPassed = 0;
let safetyFailed = 0;
for (const phrase of BANNED_SAFETY_CASES) {
  const result = parseCommand(phrase);
  if (result.blocked === true) {
    safetyPassed++;
  } else {
    safetyFailed++;
  }
}
const safetyBlockRate = (safetyPassed / BANNED_SAFETY_CASES.length) * 100;
console.log(`\n[Accuracy] Destructive Phrase Safety Block:`);
console.log(`  Total: ${BANNED_SAFETY_CASES.length}`);
console.log(`  Correctly Blocked: ${safetyPassed}`);
console.log(`  Missed Blocks: ${safetyFailed}`);
console.log(`  Block Rate: ${safetyBlockRate.toFixed(2)}%`);

// 4. Latency Benchmark
console.log(`\n[Latency] Benchmarking parser execution time (1,000 iterations)...`);
const samplePhrases = [
  "chrome kholo",
  "naya tab kholo",
  "aawaz badhao",
  "left snap karo",
  "copy karo",
  "minimize karo",
  "gana roko",
  "नोटपैड चालू करो",
  "अगला टैब खोलो",
  "cursor chalu karo",
];

// Warmup
for (let i = 0; i < 100; i++) {
  parseCommand(samplePhrases[i % samplePhrases.length]);
}

const latenciesUs = [];
const ITERATIONS = 1000;
for (let i = 0; i < ITERATIONS; i++) {
  const phrase = samplePhrases[i % samplePhrases.length];
  const t0 = performance.now();
  parseCommand(phrase);
  const t1 = performance.now();
  latenciesUs.push((t1 - t0) * 1000); // in microseconds
}

latenciesUs.sort((a, b) => a - b);
const minUs = latenciesUs[0];
const maxUs = latenciesUs[latenciesUs.length - 1];
const sumUs = latenciesUs.reduce((acc, v) => acc + v, 0);
const meanUs = sumUs / latenciesUs.length;
const p50Us = latenciesUs[Math.floor(latenciesUs.length * 0.5)];
const p95Us = latenciesUs[Math.floor(latenciesUs.length * 0.95)];
const p99Us = latenciesUs[Math.floor(latenciesUs.length * 0.99)];

console.log(`  Mean:   ${(meanUs / 1000).toFixed(3)} ms (${meanUs.toFixed(1)} µs)`);
console.log(`  Median: ${(p50Us / 1000).toFixed(3)} ms (${p50Us.toFixed(1)} µs)`);
console.log(`  p95:    ${(p95Us / 1000).toFixed(3)} ms (${p95Us.toFixed(1)} µs)`);
console.log(`  p99:    ${(p99Us / 1000).toFixed(3)} ms (${p99Us.toFixed(1)} µs)`);
console.log(`  Min:    ${(minUs / 1000).toFixed(3)} ms (${minUs.toFixed(1)} µs)`);
console.log(`  Max:    ${(maxUs / 1000).toFixed(3)} ms (${maxUs.toFixed(1)} µs)`);

// 5. Save Results
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  accuracy: {
    positiveCases: {
      total: POSITIVE_TEST_CASES.length,
      passed: positivePassed,
      failed: positiveFailed,
      accuracyPct: positiveAccuracy,
    },
    negativeCases: {
      total: NEGATIVE_TEST_CASES.length,
      rejected: negativePassed,
      falseTriggers: negativeFailed,
      rejectionRatePct: negativeRejectionRate,
    },
    safetyBannedCases: {
      total: BANNED_SAFETY_CASES.length,
      blocked: safetyPassed,
      missed: safetyFailed,
      blockRatePct: safetyBlockRate,
    },
  },
  latency: {
    iterations: ITERATIONS,
    meanMs: +(meanUs / 1000).toFixed(4),
    medianMs: +(p50Us / 1000).toFixed(4),
    p95Ms: +(p95Us / 1000).toFixed(4),
    p99Ms: +(p99Us / 1000).toFixed(4),
    minMs: +(minUs / 1000).toFixed(4),
    maxMs: +(maxUs / 1000).toFixed(4),
  },
};

const outputDir = path.join(REPO_ROOT, "benchmark", "results");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "command-mode-benchmark.json");
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\n[Results Saved] -> ${outputPath}`);
console.log("=".repeat(70));
