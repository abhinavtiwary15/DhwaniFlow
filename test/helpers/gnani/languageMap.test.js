const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { mapLanguageCode } = require("../../../src/helpers/gnani/language-map");

describe("language-map", () => {
  test("maps 2-letter codes to -IN region codes", () => {
    assert.equal(mapLanguageCode("hi"), "hi-IN");
    assert.equal(mapLanguageCode("en"), "en-IN");
    assert.equal(mapLanguageCode("ta"), "ta-IN");
    assert.equal(mapLanguageCode("te"), "te-IN");
    assert.equal(mapLanguageCode("kn"), "kn-IN");
    assert.equal(mapLanguageCode("ml"), "ml-IN");
    assert.equal(mapLanguageCode("mr"), "mr-IN");
    assert.equal(mapLanguageCode("bn"), "bn-IN");
    assert.equal(mapLanguageCode("gu"), "gu-IN");
    assert.equal(mapLanguageCode("pa"), "pa-IN");
    assert.equal(mapLanguageCode("or"), "or-IN");
    assert.equal(mapLanguageCode("ur"), "ur-IN");
    assert.equal(mapLanguageCode("as"), "as-IN");
  });

  test("passes through values with region", () => {
    assert.equal(mapLanguageCode("hi-IN"), "hi-IN");
    assert.equal(mapLanguageCode("en-IN"), "en-IN");
    assert.equal(mapLanguageCode("en_IN"), "en-IN");
    assert.equal(mapLanguageCode("en-US"), "en-US");
    assert.equal(mapLanguageCode("ta-IN"), "ta-IN");
  });

  test("passes through indic-auto", () => {
    assert.equal(mapLanguageCode("indic-auto"), "indic-auto");
    assert.equal(mapLanguageCode("INDIC-AUTO"), "indic-auto");
  });

  test("handles empty, auto, and null/undefined with defaultLang", () => {
    assert.equal(mapLanguageCode(""), "hi-IN");
    assert.equal(mapLanguageCode("   "), "hi-IN");
    assert.equal(mapLanguageCode(null), "hi-IN");
    assert.equal(mapLanguageCode(undefined), "hi-IN");
    assert.equal(mapLanguageCode("auto"), "hi-IN");
    assert.equal(mapLanguageCode("AUTO"), "hi-IN");
  });

  test("uses custom defaultLang when provided", () => {
    assert.equal(mapLanguageCode("", "indic-auto"), "indic-auto");
    assert.equal(mapLanguageCode("auto", "en-IN"), "en-IN");
    assert.equal(mapLanguageCode(null, "ta-IN"), "ta-IN");
  });

  test("supports up to four comma-separated language codes", () => {
    assert.equal(mapLanguageCode("hi, en"), "hi-IN, en-IN");
    assert.equal(mapLanguageCode("hi, en, ta, te"), "hi-IN, en-IN, ta-IN, te-IN");
  });

  test("falls back to defaultLang on unknown language codes", () => {
    assert.equal(mapLanguageCode("unknown"), "hi-IN");
    assert.equal(mapLanguageCode("xyz", "en-IN"), "en-IN");
    assert.equal(mapLanguageCode("fr"), "hi-IN");
    assert.equal(mapLanguageCode("es"), "hi-IN");
  });
});
