const { KNOWN_INDIC_LANGUAGES } = require("./gnani/language-map");
const booleanKeys = new Set([
  "onboardingCompleted",
  "audioCuesEnabled",
  "floatingIconAutoHide",
  "startMinimized",
  "preferBuiltInMic",
  "autoPasteEnabled",
  "keepTranscriptionInClipboard",
  "dataRetentionEnabled",
  "showLatencyBadge",
  "commandModeEnabled",
]);
const enumKeys = {
  activationMode: ["tap", "push"],
  microphoneSelectionMode: ["system", "built-in", "specific"],
  panelStartPosition: ["bottom-left", "bottom-right", "center"],
};
const stringKeys = new Set([
  "uiLanguage",
  "dictationKey",
  "activeDictationKey",
  "commandKey",
  "selectedMicDeviceId",
  "selectedMicDeviceLabel",
]);
const numberKeys = { transcriptRetentionDays: [1, 3650], micWarmHoldSeconds: [0, 900] };
const allowedKeys = new Set([
  ...booleanKeys,
  ...Object.keys(enumKeys),
  ...stringKeys,
  ...Object.keys(numberKeys),
  "gnaniLanguage",
]);
function validateSetting(key, value) {
  if (!allowedKeys.has(key)) throw new Error("Unsupported setting");
  if (booleanKeys.has(key) && typeof value !== "boolean")
    throw new Error("Expected boolean setting");
  if (enumKeys[key] && !enumKeys[key].includes(value)) throw new Error("Unsupported setting value");
  if (
    stringKeys.has(key) &&
    (typeof value !== "string" || value.length > 512 || /[\x00-\x1f]/.test(value))
  )
    throw new Error("Invalid text setting");
  if (
    numberKeys[key] &&
    (!Number.isInteger(value) || value < numberKeys[key][0] || value > numberKeys[key][1])
  )
    throw new Error("Setting outside allowed range");
  if (
    key === "gnaniLanguage" &&
    (typeof value !== "string" ||
      value.split(/,\s*/).length > 4 ||
      !value
        .split(/,\s*/)
        .every(
          (code) =>
            code === "indic-auto" ||
            (/^[a-z]{2}-IN$/.test(code) && KNOWN_INDIC_LANGUAGES.has(code.slice(0, 2)))
        ))
  )
    throw new Error("Unsupported speech language");
  return value;
}
function filterSettings(values) {
  const result = {};
  for (const [key, value] of Object.entries(values || {})) {
    try {
      result[key] = validateSetting(key, value);
    } catch {
      /* Retired or invalid setting. */
    }
  }
  return result;
}
function validateWords(words) {
  if (
    !Array.isArray(words) ||
    words.length > 10000 ||
    words.some(
      (word) =>
        typeof word !== "string" || !word.trim() || word.length > 128 || /[\x00-\x1f]/.test(word)
    )
  )
    throw new Error("Invalid dictionary words");
  return words;
}
module.exports = { validateSetting, filterSettings, allowedKeys, validateWords };
