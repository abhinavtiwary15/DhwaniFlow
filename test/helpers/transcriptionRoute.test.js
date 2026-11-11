const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

describe("transcriptionRoute", () => {
  test("returns a single gnani route with default language_code hi-IN and format transcribe", async () => {
    const { resolveTranscriptionRoute } = await import("../../src/helpers/transcriptionRoute.ts");
    const route = resolveTranscriptionRoute();
    assert.deepEqual(route, {
      provider: "gnani",
      language_code: "hi-IN",
      format: "transcribe",
    });
  });

  test("respects gnaniLanguage configured in settings", async () => {
    const { resolveTranscriptionRoute } = await import("../../src/helpers/transcriptionRoute.ts");
    const route = resolveTranscriptionRoute({
      settings: { gnaniLanguage: "en-IN" },
    });
    assert.deepEqual(route, {
      provider: "gnani",
      language_code: "en-IN",
      format: "transcribe",
    });
  });

  test("respects language override in request options", async () => {
    const { resolveTranscriptionRoute } = await import("../../src/helpers/transcriptionRoute.ts");
    const route = resolveTranscriptionRoute({
      language_code: "ta-IN",
    });
    assert.deepEqual(route, {
      provider: "gnani",
      language_code: "ta-IN",
      format: "transcribe",
    });
  });
});
