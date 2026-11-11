/**
 * Keyterms processing and formatting for Gnani STT API (v3).
 *
 * Gnani v3 supports contextual keyword biasing via the 'keyterms' field (max 200 terms).
 */

const MAX_KEYTERMS_COUNT = 200;
const DEFAULT_MAX_CHARS = 2000;

/**
 * Builds, cleans, and de-duplicates keyterms from multiple sources.
 *
 * Rules:
 * - Sources can be arrays, comma/semicolon/newline-delimited strings
 * - De-duplicates case-insensitively (preserves casing of first occurrence)
 * - Trims whitespace and drops empty tokens
 * - Caps at maxTerms (Gnani enforces max 200)
 * - Limits cumulative character count to maxChars
 *
 * @param {Array<string|string[]>} sources - Array of term lists or strings
 * @param {object} [options]
 * @param {number} [options.maxTerms=200]
 * @param {number} [options.maxChars=2000]
 * @returns {string[]}
 */
function buildKeyterms(sources = [], options = {}) {
  const { maxTerms = MAX_KEYTERMS_COUNT, maxChars = DEFAULT_MAX_CHARS } = options;
  const seen = new Set();
  const result = [];
  let currentChars = 0;

  for (const source of sources) {
    if (!source) continue;
    const terms = Array.isArray(source)
      ? source
      : String(source).split(/[,;\n]/);

    for (const rawTerm of terms) {
      const term = String(rawTerm).trim();
      if (!term) continue;

      const lower = term.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      if (result.length >= maxTerms) break;

      // Approximate delimiter cost (comma + space = 2 chars)
      const addedLen = term.length + (result.length > 0 ? 2 : 0);
      if (currentChars + addedLen > maxChars) {
        break;
      }

      result.push(term);
      currentChars += addedLen;
    }

    if (result.length >= maxTerms || currentChars >= maxChars) break;
  }

  return result;
}

/**
 * Formats a keyterm array into either CSV or JSON string.
 *
 * @param {string[]} terms
 * @param {"csv"|"json"} [style="csv"]
 * @returns {string}
 */
function formatKeyterms(terms, style = "csv") {
  if (!terms || terms.length === 0) return "";
  const normalizedStyle = (style || "csv").toLowerCase();

  if (normalizedStyle === "json") {
    return JSON.stringify(terms);
  }
  return terms.join(", ");
}

/**
 * Checks whether the 'format' field is applicable for the model.
 * Format is only valid for prisma-v3.0 models.
 *
 * @param {string} model
 * @returns {boolean}
 */
function shouldSendFormat(model) {
  if (!model || typeof model !== "string") return false;
  return model.toLowerCase().includes("v3");
}

const isV3Model = shouldSendFormat;

/**
 * Builds keyterms array and formatted payload string from sources.
 *
 * @param {string|string[]} prompt
 * @param {object} [options]
 * @returns {{ keytermsValue: string|null, terms: string[] }}
 */
function buildKeytermsPayload(prompt, options = {}) {
  const {
    sampleKeyterms = [],
    projectTerms = [],
    model = "prisma-v3.0",
    keytermsStyle = "csv",
    maxTerms = MAX_KEYTERMS_COUNT,
    maxChars = DEFAULT_MAX_CHARS,
  } = options;

  if (!shouldSendFormat(model)) {
    return { keytermsValue: null, terms: [] };
  }

  const terms = buildKeyterms([prompt, sampleKeyterms, projectTerms], {
    maxTerms,
    maxChars,
  });

  const keytermsValue = terms.length > 0 ? formatKeyterms(terms, keytermsStyle) : null;
  return { keytermsValue, terms };
}

module.exports = {
  buildKeyterms,
  formatKeyterms,
  shouldSendFormat,
  isV3Model,
  buildKeytermsPayload,
  MAX_KEYTERMS_COUNT,
};
