const ALLOWED_SETTINGS_KEYS = new Set([
  "uiLanguage",
  "dictationKey",
  "activeDictationKey",
  "activationMode",
  "commandKey",
  "commandModeEnabled",
  "audioCuesEnabled",
  "floatingIconAutoHide",
  "startMinimized",
  "panelStartPosition",
  "microphoneSelectionMode",
  "preferBuiltInMic",
  "selectedMicDeviceId",
  "selectedMicDeviceLabel",
  "micWarmHoldSeconds",
  "autoPasteEnabled",
  "keepTranscriptionInClipboard",
  "transcriptRetentionDays",
  "dataRetentionEnabled",
  "customDictionary",
  "snippets",
  "gnaniLanguage",
  "showLatencyBadge",
]);

function isRetiredKey(key) {
  return !ALLOWED_SETTINGS_KEYS.has(key);
}

function migrateSettings(profile) {
  const migrated = { gnaniLanguage: "hi-IN", showLatencyBadge: true };
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return migrated;
  for (const [key, value] of Object.entries(profile))
    if (ALLOWED_SETTINGS_KEYS.has(key)) migrated[key] = value;
  if (typeof migrated.gnaniLanguage !== "string" || !migrated.gnaniLanguage)
    migrated.gnaniLanguage = "hi-IN";
  if (typeof migrated.showLatencyBadge !== "boolean") migrated.showLatencyBadge = true;
  return migrated;
}

export { migrateSettings, isRetiredKey, ALLOWED_SETTINGS_KEYS };
const m = typeof module !== "undefined" ? module : null;
if (m && m.exports) m.exports = { migrateSettings, isRetiredKey, ALLOWED_SETTINGS_KEYS };
