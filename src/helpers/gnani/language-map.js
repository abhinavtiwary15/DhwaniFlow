/**
 * Language code mapping for Gnani STT API (v3).
 *
 * Maps language selections to Gnani-compatible language codes (e.g. hi-IN, en-IN, indic-auto).
 */

const KNOWN_INDIC_LANGUAGES = new Set([
  "hi", // Hindi
  "en", // English (Indian)
  "ta", // Tamil
  "te", // Telugu
  "kn", // Kannada
  "ml", // Malayalam
  "mr", // Marathi
  "bn", // Bengali
  "gu", // Gujarati
  "pa", // Punjabi
  "or", // Odia
  "ur", // Urdu
  "as", // Assamese
]);

/**
 * Normalizes a single language token to hi-IN style code or configured default.
 *
 * @param {string} token
 * @param {string} fallback
 * @returns {string}
 */
function normalizeSingleCode(token, fallback) {
  if (!token || typeof token !== "string") {
    return fallback;
  }

  const trimmed = token.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") {
    return fallback;
  }

  if (trimmed.toLowerCase() === "indic-auto") {
    return "indic-auto";
  }

  // Already has a region subtag (e.g. "hi-IN", "en_IN", "en-US")
  if (trimmed.includes("-") || trimmed.includes("_")) {
    const parts = trimmed.split(/[-_]/);
    if (parts.length === 2 && parts[0] && parts[1]) {
      return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
    }
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (KNOWN_INDIC_LANGUAGES.has(lower)) {
    return `${lower}-IN`;
  }

  // Unknown language code -> fallback to configured default
  return fallback;
}

/**
 * Maps incoming language input to Gnani-compatible code(s).
 *
 * Rules:
 * - Empty, "auto", undefined -> defaultLang ("hi-IN" by default)
 * - "indic-auto" -> "indic-auto"
 * - Known 2-letter codes -> "xx-IN" (e.g. "hi" -> "hi-IN")
 * - Codes with region -> normalize casing ("hi-in" -> "hi-IN")
 * - Comma-separated list (up to 4 codes) -> mapped individually
 * - Unknown language -> defaultLang
 *
 * @param {string|null|undefined} inputLang
 * @param {string} [defaultLang="hi-IN"]
 * @returns {string}
 */
function mapLanguageCode(inputLang, defaultLang = "hi-IN") {
  const fallback = defaultLang || "hi-IN";
  if (!inputLang || typeof inputLang !== "string") {
    return fallback;
  }

  const trimmed = inputLang.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") {
    return fallback;
  }

  if (trimmed.includes(",")) {
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 4); // Gnani accepts up to 4 comma-separated language codes

    if (parts.length === 0) return fallback;
    return parts.map((p) => normalizeSingleCode(p, fallback)).join(", ");
  }

  return normalizeSingleCode(trimmed, fallback);
}

module.exports = {
  KNOWN_INDIC_LANGUAGES,
  mapLanguageCode,
};
