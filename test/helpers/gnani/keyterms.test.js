const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKeyterms,
  formatKeyterms,
  shouldSendFormat,
  buildKeytermsPayload,
  MAX_KEYTERMS_COUNT,
} = require("../../../src/helpers/gnani/keyterms");

describe("keyterms", () => {
  describe("buildKeyterms", () => {
    test("merges sources and deduplicates case-insensitively", () => {
      const list1 = ["React", "Kubernetes", "api"];
      const list2 = "API, docker, react, Docker";
      const result = buildKeyterms([list1, list2]);
      assert.deepEqual(result, ["React", "Kubernetes", "api", "docker"]);
    });

    test("drops empty and whitespace-only terms", () => {
      const result = buildKeyterms(["  ", "", null, undefined, "Term1, , Term2  "]);
      assert.deepEqual(result, ["Term1", "Term2"]);
    });

    test("respects maxTerms cap (defaults to 200)", () => {
      const many = Array.from({ length: 250 }, (_, i) => `term_${i}`);
      const result = buildKeyterms([many]);
      assert.equal(result.length, MAX_KEYTERMS_COUNT);
      assert.equal(result[0], "term_0");
      assert.equal(result[MAX_KEYTERMS_COUNT - 1], `term_${MAX_KEYTERMS_COUNT - 1}`);
    });

    test("respects custom maxTerms", () => {
      const many = Array.from({ length: 100 }, (_, i) => `term_${i}`);
      const result = buildKeyterms([many], { maxTerms: 25 });
      assert.equal(result.length, 25);
    });

    test("respects maxChars budget", () => {
      const words = ["supercalifragilistic", "expialidocious", "something", "extra"];
      const result = buildKeyterms([words], { maxChars: 40 });
      // "supercalifragilistic" (20) + ", " (2) + "expialidocious" (14) = 36 chars.
      // "something" (9) would exceed 40.
      assert.deepEqual(result, ["supercalifragilistic", "expialidocious"]);
    });
  });

  describe("formatKeyterms", () => {
    test("formats as CSV by default", () => {
      assert.equal(formatKeyterms(["apple", "banana"]), "apple, banana");
    });

    test("formats as JSON when style is json", () => {
      assert.equal(formatKeyterms(["apple", "banana"], "json"), '["apple","banana"]');
    });

    test("handles empty lists gracefully", () => {
      assert.equal(formatKeyterms([], "csv"), "");
      assert.equal(formatKeyterms([], "json"), "");
      assert.equal(formatKeyterms(null), "");
    });
  });

  describe("shouldSendFormat", () => {
    test("returns true for v3 models", () => {
      assert.equal(shouldSendFormat("prisma-v3.0"), true);
      assert.equal(shouldSendFormat("v3.0"), true);
      assert.equal(shouldSendFormat("PRISMA-V3"), true);
    });

    test("returns false for older models or undefined", () => {
      assert.equal(shouldSendFormat("prisma-v2.5"), false);
      assert.equal(shouldSendFormat("v2.5"), false);
      assert.equal(shouldSendFormat(""), false);
      assert.equal(shouldSendFormat(null), false);
      assert.equal(shouldSendFormat(undefined), false);
    });
  });

  describe("buildKeytermsPayload", () => {
    test("returns formatted payload and terms for v3 model", () => {
      const payload = buildKeytermsPayload("React, Redux", {
        sampleKeyterms: ["Docker"],
        model: "prisma-v3.0",
      });
      assert.ok(payload.keytermsValue);
      assert.deepEqual(payload.terms, ["React", "Redux", "Docker"]);
    });

    test("returns null keytermsValue for non-v3 models", () => {
      const payload = buildKeytermsPayload("React, Redux", {
        model: "prisma-v2.0",
      });
      assert.equal(payload.keytermsValue, null);
      assert.deepEqual(payload.terms, []);
    });
  });
});
