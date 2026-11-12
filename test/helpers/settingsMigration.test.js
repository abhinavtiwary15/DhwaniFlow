const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { migrateSettings, isRetiredKey } = require("../../src/helpers/settingsMigration");

describe("settingsMigration", () => {
  const oldStoredProfile = {
    // Current keys to keep
    dictationKey: "Control+Space",
    activationMode: "push",
    notificationsEnabled: true,
    audioCuesEnabled: true,
    pauseMediaOnDictation: true,
    autoPasteEnabled: true,
    keepTranscriptionInClipboard: true,
    customDictionary: ["react", "webpack"],
    transcriptRetentionDays: 30,

    // Retired keys to drop
    meetingKey: "Alt+M",
    voiceAgentKey: "Control+Shift+A",
    meetingHotkeyLayoutMode: "side-panel",
    notifyMeetingDetection: true,
    notifyCalendarReminders: true,
    noteFilesEnabled: false,
    noteFilesPath: "/some/path/to/notes",
    dictationSileroEnabled: true,
    noteRecordingSileroEnabled: true,
    meetingSileroEnabled: false,
    sileroVadEnabled: true,
    whisperVadThreshold: 0.5,
    whisperVadMinSpeechDurationMs: 250,
    whisperVadMinSilenceDurationMs: 500,
    whisperVadMaxSpeechDurationS: 30,
    whisperVadSpeechPadMs: 100,
    whisperVadSamplesOverlap: 2,
    cloudBackupEnabled: false,
    insightsSyncEnabled: false,
    telemetryEnabled: true,
    analyticsEnabled: false,
    workspaceId: "ws_12345",
    activeWorkspaceId: "ws_12345",
    workspaces: [{ id: "ws_12345", name: "Engineering" }],
    subscriptionTier: "pro",
    subscriptionStatus: "active",
    isSignedIn: true,
    licenseKey: "lic_999888",
    openaiApiKey: "sk-proj-oldkey1234567890",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiModel: "gpt-4o",
    useCleanupModel: true,
    cleanupModel: "gpt-4o-mini",
    cleanupProvider: "openai",
    cleanupRemoteUrl: "https://custom.api",
    cloudTranscriptionProvider: "groq",
    cloudTranscriptionMode: "byok",
    cloudTranscriptionModel: "whisper-large-v3",
    localTranscriptionProvider: "whisper",
    whisperModel: "base",
    parakeetModel: "parakeet-tdt-0.6b-v3",
    cohereModel: "cohere-v1",
    dictationAgentProvider: "openai",
    localDictationAgentModel: "llama3",
  };

  test("migrates an old stored profile cleanly", () => {
    const result = migrateSettings(oldStoredProfile);

    // Kept fields
    assert.equal(result.dictationKey, "Control+Space");
    assert.equal(result.activationMode, "push");
    assert.equal(result.autoPasteEnabled, true);
    assert.deepEqual(result.customDictionary, ["react", "webpack"]);
    assert.equal(result.transcriptRetentionDays, 30);

    // New required fields
    assert.equal(result.gnaniLanguage, "hi-IN");
    assert.equal(result.showLatencyBadge, true);

    // Dropped retired fields
    assert.equal(result.meetingKey, undefined);
    assert.equal(result.voiceAgentKey, undefined);
    assert.equal(result.meetingHotkeyLayoutMode, undefined);
    assert.equal(result.notifyMeetingDetection, undefined);
    assert.equal(result.notifyCalendarReminders, undefined);
    assert.equal(result.noteFilesEnabled, undefined);
    assert.equal(result.noteFilesPath, undefined);
    assert.equal(result.dictationSileroEnabled, undefined);
    assert.equal(result.noteRecordingSileroEnabled, undefined);
    assert.equal(result.meetingSileroEnabled, undefined);
    assert.equal(result.sileroVadEnabled, undefined);
    assert.equal(result.whisperVadThreshold, undefined);
    assert.equal(result.whisperVadMinSpeechDurationMs, undefined);
    assert.equal(result.whisperVadMinSilenceDurationMs, undefined);
    assert.equal(result.whisperVadMaxSpeechDurationS, undefined);
    assert.equal(result.whisperVadSpeechPadMs, undefined);
    assert.equal(result.whisperVadSamplesOverlap, undefined);
    assert.equal(result.cloudBackupEnabled, undefined);
    assert.equal(result.insightsSyncEnabled, undefined);
    assert.equal(result.telemetryEnabled, undefined);
    assert.equal(result.analyticsEnabled, undefined);
    assert.equal(result.workspaceId, undefined);
    assert.equal(result.activeWorkspaceId, undefined);
    assert.equal(result.workspaces, undefined);
    assert.equal(result.subscriptionTier, undefined);
    assert.equal(result.subscriptionStatus, undefined);
    assert.equal(result.isSignedIn, undefined);
    assert.equal(result.licenseKey, undefined);
    assert.equal(result.openaiApiKey, undefined);
    assert.equal(result.openaiBaseUrl, undefined);
    assert.equal(result.openaiModel, undefined);
    assert.equal(result.useCleanupModel, undefined);
    assert.equal(result.cleanupModel, undefined);
    assert.equal(result.cleanupProvider, undefined);
    assert.equal(result.cleanupRemoteUrl, undefined);
    assert.equal(result.cloudTranscriptionProvider, undefined);
    assert.equal(result.cloudTranscriptionMode, undefined);
    assert.equal(result.localTranscriptionProvider, undefined);
    assert.equal(result.whisperModel, undefined);
    assert.equal(result.parakeetModel, undefined);
    assert.equal(result.cohereModel, undefined);
    assert.equal(result.dictationAgentProvider, undefined);
    assert.equal(result.localDictationAgentModel, undefined);
  });

  test("handles empty or missing profile", () => {
    const result = migrateSettings(null);
    assert.deepEqual(result, {
      gnaniLanguage: "hi-IN",
      showLatencyBadge: true,
    });
  });

  test("preserves existing gnaniLanguage and showLatencyBadge", () => {
    const result = migrateSettings({
      gnaniLanguage: "en-IN",
      showLatencyBadge: false,
      dictationKey: "F8",
    });
    assert.equal(result.gnaniLanguage, "en-IN");
    assert.equal(result.showLatencyBadge, false);
    assert.equal(result.dictationKey, "F8");
  });

  test("identifies retired keys accurately", () => {
    assert.equal(isRetiredKey("meetingKey"), true);
    assert.equal(isRetiredKey("voiceAgentKey"), true);
    assert.equal(isRetiredKey("dictationKey"), false);
    assert.equal(isRetiredKey("activationMode"), false);
  });

  test("drops gnaniApiKey unconditionally and drops all unlisted settings fields", () => {
    const profile = {
      dictationKey: "F9",
      gnaniApiKey: "sk-gnani-secret-should-never-be-in-settings",
      gnaniLanguage: "hi-IN",
      arbitraryLegacyField: "foo-bar",
      unknownFlag: 12345,
      gnaniLegacyProvider: "old-value",
      openaiApiKey: "sk-openai-old",
    };
    const result = migrateSettings(profile);

    // Kept allowlisted settings
    assert.equal(result.dictationKey, "F9");
    assert.equal(result.gnaniLanguage, "hi-IN");
    assert.equal(result.showLatencyBadge, true);

    // Dropped sensitive and unlisted settings
    assert.equal(result.gnaniApiKey, undefined);
    assert.equal(result.arbitraryLegacyField, undefined);
    assert.equal(result.unknownFlag, undefined);
    assert.equal(result.gnaniLegacyProvider, undefined);
    assert.equal(result.openaiApiKey, undefined);

    // Exactly the allowlisted fields exist in result
    assert.deepEqual(
      Object.keys(result).sort(),
      ["dictationKey", "gnaniLanguage", "showLatencyBadge"].sort()
    );
  });

  test("allows the retained settings keys", () => {
    const { ALLOWED_SETTINGS_KEYS } = require("../../src/helpers/settingsMigration");
    assert.ok(ALLOWED_SETTINGS_KEYS, "Expected ALLOWED_SETTINGS_KEYS to be exported");
    assert.equal(ALLOWED_SETTINGS_KEYS.size, 23);
    assert.ok(!ALLOWED_SETTINGS_KEYS.has("gnaniApiKey"));

    const fullProfile = {};
    for (const key of ALLOWED_SETTINGS_KEYS) {
      fullProfile[key] = "test-value";
    }
    const result = migrateSettings(fullProfile);
    for (const key of ALLOWED_SETTINGS_KEYS) {
      assert.ok(key in result, `Expected ${key} to survive migration`);
    }
  });

  test("isRetiredKey identifies gnaniApiKey and unlisted keys as retired", () => {
    assert.equal(isRetiredKey("gnaniApiKey"), true);
    assert.equal(isRetiredKey("randomLegacySetting"), true);
    assert.equal(isRetiredKey("meetingKey"), true);
    assert.equal(isRetiredKey("dictationKey"), false);
    assert.equal(isRetiredKey("gnaniLanguage"), false);
    assert.equal(isRetiredKey("showLatencyBadge"), false);
  });
});
