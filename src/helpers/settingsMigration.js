/**
 * settingsMigration.js
 *
 * Migration for stored settings profiles:
 * Drops retired keys:
 * - meetingKey, voiceAgentKey, meetingHotkeyLayoutMode
 * - notifyMeetingDetection, notifyCalendarReminders
 * - noteFilesEnabled, noteFilesPath
 * - Silero keys (dictationSileroEnabled, noteRecordingSileroEnabled, meetingSileroEnabled, sileroVadEnabled, etc.)
 * - whisperVad keys (whisperVadThreshold, whisperVadMinSpeechDurationMs, etc.)
 * - cloudBackupEnabled, insightsSyncEnabled
 * - all provider keys (openaiApiKey, openaiBaseUrl, cleanupModel, cleanupProvider, cloudTranscription*, localTranscription*, whisperModel, parakeetModel, etc.)
 * - all workspace keys (workspaceId, activeWorkspaceId, etc.)
 * - all telemetry keys (telemetryEnabled, analyticsEnabled, etc.)
 * - all subscription keys (subscriptionTier, isSignedIn, licenseKey, etc.)
 *
 * Adds/ensures:
 * - gnaniLanguage (default "hi-IN")
 * - showLatencyBadge (default true)
 */

const RETIRED_EXACT_KEYS = new Set([
  "meetingKey",
  "voiceAgentKey",
  "meetingHotkeyLayoutMode",
  "notifyMeetingDetection",
  "notifyCalendarReminders",
  "noteFilesEnabled",
  "noteFilesPath",
  "dictationSileroEnabled",
  "noteRecordingSileroEnabled",
  "meetingSileroEnabled",
  "sileroVadEnabled",
  "sileroSensitivity",
  "whisperVadThreshold",
  "whisperVadMinSpeechDurationMs",
  "whisperVadMinSilenceDurationMs",
  "whisperVadMaxSpeechDurationS",
  "whisperVadSpeechPadMs",
  "whisperVadSamplesOverlap",
  "cloudBackupEnabled",
  "insightsSyncEnabled",
  "telemetryEnabled",
  "analyticsEnabled",
  "workspaceId",
  "activeWorkspaceId",
  "workspaces",
  "subscriptionTier",
  "subscriptionStatus",
  "subscription",
  "isSignedIn",
  "licenseKey",
  "license",
  "openaiApiKey",
  "openaiBaseUrl",
  "openaiModel",
  "useCleanupModel",
  "cleanupModel",
  "cleanupProvider",
  "cleanupRemoteUrl",
  "cloudTranscriptionProvider",
  "cloudTranscriptionMode",
  "cloudTranscriptionModel",
  "localTranscriptionProvider",
  "whisperModel",
  "parakeetModel",
  "cohereModel",
  "dictationAgentProvider",
  "localDictationAgentModel",
  "azureApiKey",
  "azureEndpoint",
  "azureDeployment",
  "azureApiVersion",
  "vertexApiKey",
  "vertexProject",
  "vertexLocation",
  "groqApiKey",
  "anthropicApiKey",
  "geminiApiKey",
  "mistralApiKey",
]);

const ALLOWED_SETTINGS_KEYS = new Set([
  "uiLanguage",
  "dictationKey",
  "activeDictationKey",
  "activationMode",
  "notificationsEnabled",
  "autoUpdatesEnabled",
  "audioCuesEnabled",
  "pauseMediaOnDictation",
  "floatingIconAutoHide",
  "startMinimized",
  "panelStartPosition",
  "microphoneSelectionMode",
  "preferBuiltInMic",
  "selectedMicDeviceId",
  "selectedMicDeviceLabel",
  "micWarmHoldSeconds",
  "autoLearnCorrections",
  "showTranscriptionPreview",
  "autoPasteEnabled",
  "keepTranscriptionInClipboard",
  "audioRetentionDays",
  "transcriptRetentionDays",
  "dataRetentionEnabled",
  "saveDiscardedTranscriptions",
  "preferredLanguage",
  "customDictionary",
  "snippets",
  "customPrompts",
  "gnaniLanguage",
  "showLatencyBadge",
]);

function isRetiredKey(key) {
  if (key === "gnaniApiKey") return true;
  return !ALLOWED_SETTINGS_KEYS.has(key);
}

/**
 * Migrates a raw settings profile by dropping all retired keys and ensuring new required keys.
 *
 * @param {Record<string, any>} profile
 * @returns {Record<string, any>}
 */
function migrateSettings(profile) {
  if (!profile || typeof profile !== "object") {
    return {
      gnaniLanguage: "hi-IN",
      showLatencyBadge: true,
    };
  }

  const migrated = {};

  for (const [key, value] of Object.entries(profile)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key) || key === "gnaniApiKey") {
      continue;
    }
    migrated[key] = value;
  }

  // Ensure gnaniLanguage and showLatencyBadge
  migrated.gnaniLanguage = typeof profile.gnaniLanguage === "string" && profile.gnaniLanguage.trim()
    ? profile.gnaniLanguage.trim()
    : "hi-IN";

  migrated.showLatencyBadge = profile.showLatencyBadge !== undefined
    ? Boolean(profile.showLatencyBadge)
    : true;

  return migrated;
}

export {
  migrateSettings,
  isRetiredKey,
  ALLOWED_SETTINGS_KEYS,
  RETIRED_EXACT_KEYS,
};

const m = typeof module !== "undefined" ? module : null;
if (m && m.exports) {
  m.exports = {
    migrateSettings,
    isRetiredKey,
    ALLOWED_SETTINGS_KEYS,
    RETIRED_EXACT_KEYS,
  };
}
