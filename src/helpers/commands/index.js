"use strict";

/**
 * index.js
 *
 * Deterministic Hinglish voice command parser for DhwaniFlow.
 * Pure function pipeline:
 * 1. Validates input
 * 2. Checks safety boundaries (banned terms, system destruction, file deletion)
 * 3. Identifies command intent via token matching & Levenshtein scoring
 * 4. Preserves verbatim text payloads for type_text commands
 *
 * Pure function with zero external I/O or network requests.
 */

const {
  normalize,
  transliterateDevanagari,
  convertDevanagariDigits,
  stripPunctuation,
} = require("./normalize");
const { checkSafety, requiresConfirmation, BANNED_TERMS } = require("./safety");
const {
  match,
  levenshtein,
  tokenSimilarity,
  SCORE_THRESHOLD,
  AMBIGUITY_MARGIN,
} = require("./matcher");
const { COMMANDS } = require("./grammar");
const lexicon = require("./lexicon.json");

/**
 * Extracts all app keys and synonyms from the lexicon for keyword biasing.
 * @returns {string[]}
 */
function getCommandKeyterms() {
  const terms = new Set();
  for (const [key, synonyms] of Object.entries(lexicon.apps)) {
    terms.add(key);
    for (const syn of synonyms) {
      if (typeof syn === "string" && syn.length > 0) {
        terms.add(syn);
      }
    }
  }
  return Array.from(terms);
}

/**
 * Parses a Hinglish voice transcript into a structured, safe command action.
 *
 * @param {string} transcript - The raw speech recognition transcript.
 * @param {object} [options] - Optional parser configuration (e.g. custom threshold).
 * @returns {object} Structured command object, blocked response, or unknown result.
 */
function parseCommand(transcript, options = {}) {
  if (typeof transcript !== "string") {
    return { unknown: true, transcript: "" };
  }

  const raw = transcript.trim();
  if (!raw || raw.length > 5000) {
    return { unknown: true, transcript: "" };
  }

  if (
    /(?:^|\s)(?:mat|nahi|nahin|na|no|not|never|don't|dont|मत|नहीं|नही|ना)(?=\s|[.!?,।]|$)/iu.test(
      raw
    )
  )
    return { unknown: true, transcript: raw };

  // 1. Safety verification
  const safetyResult = checkSafety(raw);
  if (safetyResult.blocked) {
    return {
      blocked: true,
      reason: safetyResult.reason || "Prohibited command",
      transcript: raw,
    };
  }

  // 2. Command matching
  return match(raw, options);
}

module.exports = {
  parseCommand,
  normalize,
  transliterateDevanagari,
  convertDevanagariDigits,
  stripPunctuation,
  checkSafety,
  requiresConfirmation,
  BANNED_TERMS,
  match,
  levenshtein,
  tokenSimilarity,
  SCORE_THRESHOLD,
  AMBIGUITY_MARGIN,
  COMMANDS,
  lexicon,
  getCommandKeyterms,
};
