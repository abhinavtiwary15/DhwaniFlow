"use strict";

/**
 * matcher.js
 *
 * Deterministic Hinglish voice command matcher.
 * Evaluates candidate commands using token-based scoring, Levenshtein distance
 * tolerance scaled by token length, verb-plus-object composition, and confidence thresholds.
 *
 * Rejects ambiguous matches where top two distinct candidates differ by less than 10%.
 * Preserves verbatim text payloads for type_text commands.
 */

const { normalize } = require("./normalize");
const { COMMANDS } = require("./grammar");
const lexicon = require("./lexicon.json");

const SCORE_THRESHOLD = 0.70;
const AMBIGUITY_MARGIN = 0.10; // 10% tolerance between top two candidates

const TYPE_TRIGGER_REGEX =
  /^\s*(likho\s*:\s*|likho\s+|type\s+karo\s*:\s*|type\s+karo\s+|type\s*:\s*|लिखो\s*:\s*|लिखो\s+|टाइप\s+करो\s*:\s*|टाइप\s+करो\s+)([\s\S]+)$/i;

/**
 * Computes Levenshtein edit distance between strings a and b.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let v0 = new Int32Array(lb + 1);
  let v1 = new Int32Array(lb + 1);
  for (let j = 0; j <= lb; j++) v0[j] = j;

  for (let i = 0; i < la; i++) {
    v1[0] = i + 1;
    const aChar = a.charCodeAt(i);
    for (let j = 0; j < lb; j++) {
      const cost = aChar === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= lb; j++) v0[j] = v1[j];
  }
  return v1[lb];
}

const OPPOSITE_PAIRS = [
  ["baayein", "daayein"],
  ["bayen", "dayen"],
  ["left", "right"],
  ["up", "down"],
  ["upar", "neeche"],
  ["upar", "niche"],
  ["next", "previous"],
  ["next", "prev"],
  ["agla", "pichhla"],
  ["agla", "pichla"],
  ["agle", "pichhle"],
  ["agle", "pichle"],
];

function areOpposites(w1, w2) {
  if (
    (w1.startsWith("min") && w2.startsWith("max")) ||
    (w1.startsWith("max") && w2.startsWith("min"))
  ) {
    return true;
  }
  for (const [o1, o2] of OPPOSITE_PAIRS) {
    if ((w1 === o1 && w2 === o2) || (w1 === o2 && w2 === o1)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates similarity between two single tokens based on length-scaled tolerance:
 * - length <= 3: exact match only (maxDist = 0)
 * - 4 <= length <= 6: maxDist = 1
 * - length >= 7: maxDist = 2
 *
 * @param {string} w1
 * @param {string} w2
 * @returns {number} 0.0 to 1.0
 */
function tokenSimilarity(w1, w2) {
  if (w1 === w2) return 1.0;

  // Antonyms and directional opposites must never be matched as spelling variants
  if (areOpposites(w1, w2)) {
    return 0.0;
  }

  const minLen = Math.min(w1.length, w2.length);
  const maxLen = Math.max(w1.length, w2.length);

  let maxAllowedDist = 0;
  if (minLen >= 7) {
    maxAllowedDist = 2;
  } else if (minLen >= 4) {
    maxAllowedDist = 1;
  } else {
    maxAllowedDist = 0;
  }

  const dist = levenshtein(w1, w2);
  if (dist > maxAllowedDist) return 0.0;
  return 1.0 - dist / maxLen;
}

/**
 * Pre-compiled pattern cache.
 * Expands parameter slots and synonyms into normalized token lists.
 */
function buildCompiledRules() {
  const rules = [];

  for (const cmd of COMMANDS) {
    if (cmd.id === "type_text") continue;

    if (cmd.id === "open_app" || cmd.id === "switch_app") {
      const appKeys = cmd.allowedParams.appKey;
      for (const patternStr of cmd.patterns) {
        for (const appKey of appKeys) {
          const synonyms = lexicon.apps[appKey] || [appKey];
          for (const syn of synonyms) {
            const resolvedStr = patternStr.replace("{appKey}", syn);
            const norm = normalize(resolvedStr);
            const tokens = norm.split(" ").filter(Boolean);
            if (tokens.length > 0) {
              rules.push({
                commandId: cmd.id,
                params: { appKey },
                tokens,
                patternStr: resolvedStr,
              });
            }
          }
        }
      }
      continue;
    }

    if (Array.isArray(cmd.patterns)) {
      for (const p of cmd.patterns) {
        if (typeof p === "string") {
          const norm = normalize(p);
          const tokens = norm.split(" ").filter(Boolean);
          if (tokens.length > 0) {
            rules.push({
              commandId: cmd.id,
              params: { ...cmd.fixedParams },
              tokens,
              patternStr: p,
            });
          }
        } else if (typeof p === "object" && p.pattern) {
          const norm = normalize(p.pattern);
          const tokens = norm.split(" ").filter(Boolean);
          if (tokens.length > 0) {
            rules.push({
              commandId: cmd.id,
              params: { ...cmd.fixedParams, ...p.params },
              tokens,
              patternStr: p.pattern,
            });
          }
        }
      }
    }
  }

  return rules;
}

const COMPILED_RULES = buildCompiledRules();

/**
 * Scores an ordered pattern sequence against transcript tokens.
 * Computes forward token alignment and applies penalties for unmatched extraneous tokens.
 *
 * @param {string[]} patternTokens
 * @param {string[]} transcriptTokens
 * @returns {{ matched: boolean, score: number, matchedIndices: number[] }}
 */
function matchPattern(patternTokens, transcriptTokens) {
  const pLen = patternTokens.length;
  const tLen = transcriptTokens.length;

  if (pLen === 0 || tLen === 0) {
    return { matched: false, score: 0, matchedIndices: [] };
  }

  // Find best sequential alignment
  let tIndex = 0;
  let totalSim = 0;
  const matchedIndices = [];

  for (let pIndex = 0; pIndex < pLen; pIndex++) {
    const pWord = patternTokens[pIndex];
    let bestSim = 0;
    let bestIdx = -1;

    for (let j = tIndex; j < tLen; j++) {
      const sim = tokenSimilarity(pWord, transcriptTokens[j]);
      if (sim > bestSim && sim > 0) {
        bestSim = sim;
        bestIdx = j;
        if (sim === 1.0) break; // exact match
      }
    }

    if (bestIdx !== -1) {
      totalSim += bestSim;
      matchedIndices.push(bestIdx);
      tIndex = bestIdx + 1;
    } else {
      // Missing required pattern token
      return { matched: false, score: 0, matchedIndices: [] };
    }
  }

  const patternCoverage = totalSim / pLen;
  const transcriptCoverage = matchedIndices.length / tLen;

  // Confidence combines how well the pattern words matched and
  // penalizes transcripts dominated by unrelated dictation words.
  const confidence = patternCoverage * Math.pow(transcriptCoverage, 0.65);

  return {
    matched: true,
    score: confidence,
    matchedIndices,
  };
}

function areParamsEqual(p1, p2) {
  if (p1 === p2) return true;
  if (!p1 || !p2) return false;
  const k1 = Object.keys(p1);
  const k2 = Object.keys(p2);
  if (k1.length !== k2.length) return false;
  for (const k of k1) {
    if (p1[k] !== p2[k]) return false;
  }
  return true;
}

/**
 * Matches a transcript string against the grammar rules.
 *
 * @param {string} transcript
 * @param {object} [options]
 * @returns {object}
 */
function match(transcript, options = {}) {
  if (typeof transcript !== "string") {
    return { unknown: true, transcript: "" };
  }

  const raw = transcript.trim();
  if (!raw) {
    return { unknown: true, transcript: "" };
  }

  // 1. Check for type_text trigger (verbatim payload preservation)
  const typeMatch = raw.match(TYPE_TRIGGER_REGEX);
  if (typeMatch) {
    const triggerText = typeMatch[1].trim();
    const payload = typeMatch[2]; // verbatim, untouched
    return {
      commandId: "type_text",
      params: { text: payload },
      confidence: 1.0,
      matchedText: triggerText,
      alternatives: [],
    };
  }

  // 2. Normalize transcript for command matching
  const normalized = normalize(raw);
  if (!normalized) {
    return { unknown: true, transcript: raw };
  }

  const transcriptTokens = normalized.split(" ").filter(Boolean);
  if (transcriptTokens.length === 0) {
    return { unknown: true, transcript: raw };
  }

  // 3. Evaluate all compiled rules
  const candidatesByCommand = new Map();

  for (const rule of COMPILED_RULES) {
    const res = matchPattern(rule.tokens, transcriptTokens);
    if (!res.matched || res.score < 0.50) continue;

    const key = `${rule.commandId}:${JSON.stringify(rule.params)}`;
    const existing = candidatesByCommand.get(key);

    if (!existing || res.score > existing.score) {
      candidatesByCommand.set(key, {
        commandId: rule.commandId,
        params: rule.params,
        score: res.score,
        patternStr: rule.patternStr,
        matchedTokens: res.matchedIndices.map((i) => transcriptTokens[i]).join(" "),
      });
    }
  }

  if (candidatesByCommand.size === 0) {
    return { unknown: true, transcript: raw };
  }

  const sortedCandidates = Array.from(candidatesByCommand.values()).sort(
    (a, b) => b.score - a.score
  );

  const best = sortedCandidates[0];

  // 4. Threshold check
  const threshold = options.threshold || SCORE_THRESHOLD;
  if (best.score < threshold) {
    return { unknown: true, transcript: raw };
  }

  // 5. Ambiguity check: if 2nd candidate is a different command action and score difference is < 10%
  if (sortedCandidates.length > 1) {
    const second = sortedCandidates[1];
    const isDifferentAction =
      second.commandId !== best.commandId ||
      !areParamsEqual(second.params, best.params);

    if (isDifferentAction) {
      const relativeDiff = (best.score - second.score) / best.score;
      if (relativeDiff < AMBIGUITY_MARGIN) {
        return {
          unknown: true,
          transcript: raw,
          reason: "ambiguous",
          alternatives: [
            { commandId: best.commandId, params: best.params, confidence: Math.round(best.score * 100) / 100 },
            { commandId: second.commandId, params: second.params, confidence: Math.round(second.score * 100) / 100 },
          ],
        };
      }
    }
  }

  return {
    commandId: best.commandId,
    params: best.params,
    confidence: Math.round(best.score * 100) / 100,
    matchedText: best.matchedTokens || raw,
    alternatives: sortedCandidates.slice(1, 4).map((c) => ({
      commandId: c.commandId,
      params: c.params,
      confidence: Math.round(c.score * 100) / 100,
    })),
  };
}

module.exports = {
  match,
  levenshtein,
  tokenSimilarity,
  COMPILED_RULES,
  SCORE_THRESHOLD,
  AMBIGUITY_MARGIN,
};
