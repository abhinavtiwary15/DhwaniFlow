const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/recordingErrors.ts");
const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);

test("a classified provider failure gets the surface title and translated description", async () => {
  const { getRecordingErrorTitle, getRecordingErrorDescription } = await load();
  const report = {
    title: "Transcription Error",
    description: "Mistral rejected your API key.",
    code: "PROVIDER_AUTH_FAILED",
    surface: "transcription",
    messageKey: "providerErrors.authFailed",
    messageParams: { provider: "Mistral" },
  };
  assert.equal(getRecordingErrorTitle(report, t), "providerErrors.titles.transcription");
  assert.equal(
    getRecordingErrorDescription(report, t),
    'providerErrors.authFailed|{"provider":"Mistral"}'
  );
});

test("the rate-limit title is unchanged", async () => {
  const { getRecordingErrorTitle } = await load();
  assert.equal(
    getRecordingErrorTitle({ title: "x", code: "PROVIDER_RATE_LIMITED" }, t),
    "hooks.audioRecording.errorTitles.providerRateLimited"
  );
});

test("unclassified reports keep their own title and description", async () => {
  const { getRecordingErrorTitle, getRecordingErrorDescription } = await load();
  const report = { title: "Transcription Error", description: "Transcription failed: boom" };
  assert.equal(getRecordingErrorTitle(report, t), "Transcription Error");
  assert.equal(getRecordingErrorDescription(report, t), "Transcription failed: boom");
});

test("a selection failure retains its localized title alongside a local model error code", async () => {
  const { getRecordingErrorTitle } = await load();
  assert.equal(
    getRecordingErrorTitle(
      { title: "Selection Edit Failed", code: "CONTEXT_TOO_LARGE", selectionEditFatal: true },
      t
    ),
    "hooks.audioRecording.selectionEditing.notAppliedTitle"
  );
});

test("short overlay error messages for NO_KEY, BAD_KEY, RATE_LIMITED, OFFLINE, AUDIO_TOO_LONG", async () => {
  const { getRecordingErrorTitle, getRecordingErrorDescription } = await load();

  const noKey = { title: "Error", code: "NO_KEY" };
  assert.equal(getRecordingErrorTitle(noKey, t), "No API Key");
  assert.equal(getRecordingErrorDescription(noKey, t), "Please set your Gnani API key in Settings.");

  const badKey = { title: "Error", code: "BAD_KEY" };
  assert.equal(getRecordingErrorTitle(badKey, t), "Invalid API Key");
  assert.equal(getRecordingErrorDescription(badKey, t), "Your Gnani API key is invalid or unauthorized.");

  const rateLimit = { title: "Error", code: "RATE_LIMITED" };
  assert.equal(getRecordingErrorTitle(rateLimit, t), "hooks.audioRecording.errorTitles.providerRateLimited");
  assert.equal(getRecordingErrorDescription(rateLimit, t), "Rate limit reached. Please wait a moment.");

  const offline = { title: "Error", code: "OFFLINE" };
  assert.equal(getRecordingErrorTitle(offline, t), "hooks.audioRecording.errorTitles.offline");
  assert.equal(getRecordingErrorDescription(offline, t), "Network connection unavailable. Please check your internet connection.");

  const tooLong = { title: "Error", code: "AUDIO_TOO_LONG" };
  assert.equal(getRecordingErrorTitle(tooLong, t), "Recording Too Long");
  assert.equal(getRecordingErrorDescription(tooLong, t), "Recording exceeds the maximum supported duration.");

  const tooLongAlt = { title: "Error", code: "TOO_LONG" };
  assert.equal(getRecordingErrorTitle(tooLongAlt, t), "Recording Too Long");
  assert.equal(getRecordingErrorDescription(tooLongAlt, t), "Recording exceeds the maximum supported duration.");
});
