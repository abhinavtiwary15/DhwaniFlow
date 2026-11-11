const assert = require("node:assert/strict");
const test = require("node:test");
global.React = require("react");

test("onboarding flow steps are permissions, gnani, and dictation-hotkey", async () => {
  const {
    STEP_ORDER,
    getNextOnboardingStep,
    reconcileStepWithRoute,
    getOnboardingProgress,
  } = await import("../../src/components/onboarding/flow.ts");

  assert.deepEqual(STEP_ORDER, ["permissions", "gnani", "dictation-hotkey"]);

  assert.equal(getNextOnboardingStep("permissions"), "gnani");
  assert.equal(getNextOnboardingStep("gnani"), "dictation-hotkey");
  assert.equal(getNextOnboardingStep("dictation-hotkey"), null);

  assert.equal(reconcileStepWithRoute("gnani"), "gnani");
  assert.equal(reconcileStepWithRoute("unknown"), "permissions");

  assert.deepEqual(getOnboardingProgress("permissions"), { index: 0, total: 3 });
  assert.deepEqual(getOnboardingProgress("gnani"), { index: 1, total: 3 });
  assert.deepEqual(getOnboardingProgress("dictation-hotkey"), { index: 2, total: 3 });
});

test("GnaniSetupStep exports supported language options with hi-IN default", async () => {
  const { GNANI_LANGUAGES } = await import(
    "../../src/components/onboarding/gnaniLanguages.ts"
  );

  assert.ok(Array.isArray(GNANI_LANGUAGES));
  assert.ok(GNANI_LANGUAGES.length >= 10);
  assert.equal(GNANI_LANGUAGES[0].code, "hi-IN");
  assert.ok(GNANI_LANGUAGES.some((l) => l.code === "en-IN"));
  assert.ok(GNANI_LANGUAGES.some((l) => l.code === "indic-auto"));
});
