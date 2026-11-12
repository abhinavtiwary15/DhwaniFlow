"use strict";

/**
 * normalize.js
 *
 * Deterministic Hinglish and Devanagari text normalizer.
 * Provides:
 * - Lowercasing
 * - Devanagari digit conversion (०-९ -> 0-9)
 * - Built-in phonetic Devanagari to Latin transliteration
 * - Phonetic alias normalization for loanwords and variants
 * - Punctuation stripping
 * - Repeated whitespace collapsing
 *
 * Both "क्रोम खोलो" and "chrome kholo" normalize to comparable strings.
 */

const DEVANAGARI_DIGITS = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const INDEPENDENT_VOWELS = {
  "अ": "a",
  "आ": "a",
  "इ": "i",
  "ई": "i",
  "उ": "u",
  "ऊ": "u",
  "ऋ": "ri",
  "ए": "e",
  "ऐ": "ai",
  "ओ": "o",
  "औ": "au",
  "ऍ": "e",
  "ऑ": "o",
};

const MATRAS = {
  "ा": "a",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "u",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ॅ": "e",
  "ॉ": "o",
};

const CONSONANTS = {
  "क": "k",
  "ख": "kh",
  "ग": "g",
  "घ": "gh",
  "ङ": "ng",
  "च": "ch",
  "छ": "chh",
  "ज": "j",
  "झ": "jh",
  "ञ": "ny",
  "ट": "t",
  "ठ": "th",
  "ड": "d",
  "ढ": "dh",
  "ण": "n",
  "त": "t",
  "थ": "th",
  "द": "d",
  "ध": "dh",
  "न": "n",
  "प": "p",
  "फ": "f",
  "ब": "b",
  "भ": "bh",
  "म": "m",
  "य": "y",
  "र": "r",
  "ल": "l",
  "ळ": "l",
  "व": "v",
  "श": "sh",
  "ष": "sh",
  "स": "s",
  "ह": "h",
  // Nukta consonants
  "क़": "k",
  "ख़": "kh",
  "ग़": "g",
  "ज़": "z",
  "ड़": "r",
  "ढ़": "rh",
  "फ़": "f",
};

const PHONETIC_CANONICAL_MAP = [
  [/\btaib\b/g, "tab"],
  [/\bkloj\b/g, "close"],
  [/\bsvich\b/g, "switch"],
  [/\bmyut\b/g, "mute"],
  [/\bkopi\b/g, "copy"],
  [/\bpest\b/g, "paste"],
  [/\bskrin\b/g, "screen"],
  [/\banadu\b/g, "undo"],
  [/\bselekt\b/g, "select"],
  [/\beskep\b/g, "escape"],
  [/\bbaikaspes\b/g, "backspace"],
  [/\bkainsil\b/g, "cancel"],
  [/\bnotapaid\b/g, "notepad"],
  [/\bnotpaid\b/g, "notepad"],
  [/\bkailakuletar\b/g, "calculator"],
  [/\bopan\b/g, "open"],
  [/\bavaj\b/g, "awaaz"],
  [/\baawaz\b/g, "awaaz"],
  [/\bawaz\b/g, "awaaz"],
  [/\bbarhao\b/g, "badhao"],
  [/\bagala\b/g, "agla"],
  [/\bagale\b/g, "agle"],
  [/\bpichhala\b/g, "pichhla"],
  [/\bpichhale\b/g, "pichhle"],
  [/\bminimaij\b/g, "minimize"],
  [/\bmaiksimaij\b/g, "maximize"],
  [/\bvindo\b/g, "window"],
  [/\bvapas\b/g, "wapas"],
  [/\bskrinashot\b/g, "screenshot"],
  [/\bkhincho\b/g, "kheecho"],
  [/\bsetings\b/g, "settings"],
  [/\bspotifai\b/g, "spotify"],
  [/\bvhatsaep\b/g, "whatsapp"],
  [/\btarminal\b/g, "terminal"],
  [/\bful\b/g, "full"],
  [/\bsnaip\b/g, "snap"],
  [/\brait\b/g, "right"],
];

/**
 * Converts Devanagari numerals (०-९) to ASCII digits (0-9).
 * @param {string} text
 * @returns {string}
 */
function convertDevanagariDigits(text) {
  if (!text) return "";
  return text.replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] || digit);
}

/**
 * Transliterates Devanagari script into Latin phonetic form.
 * Preserves consonant conjuncts (halant / virama) and supplies inherent
 * schwa vowels according to standard modern Hindi pronunciation rules.
 *
 * @param {string} text
 * @returns {string}
 */
function transliterateDevanagari(text) {
  if (!text) return "";
  let out = "";
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];

    // Combine nukta if followed by U+093C
    if (i + 1 < chars.length && chars[i + 1] === "़") {
      const combined = ch + "़";
      if (CONSONANTS[combined]) {
        ch = combined;
        i++;
      }
    }

    if (DEVANAGARI_DIGITS[ch]) {
      out += DEVANAGARI_DIGITS[ch];
      continue;
    }

    if (INDEPENDENT_VOWELS[ch]) {
      out += INDEPENDENT_VOWELS[ch];
      continue;
    }

    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];

      const next = chars[i + 1];
      if (next === "्") {
        i++; // Virama cancels inherent vowel
      } else if (next && MATRAS[next]) {
        out += MATRAS[next];
        i++; // Matra supplies explicit vowel
      } else if (next === "ं" || next === "ँ") {
        // Anusvara/candrabindu directly on consonant implies 'an'
        out += "an";
        i++;
      } else if (next && (CONSONANTS[next] || INDEPENDENT_VOWELS[next])) {
        // Non-final consonant followed by another consonant gets inherent 'a'
        out += "a";
      }
      continue;
    }

    if (MATRAS[ch]) {
      out += MATRAS[ch];
      continue;
    }

    if (ch === "ं" || ch === "ँ") {
      out += "n";
      continue;
    }

    if (ch === "ः") {
      out += "h";
      continue;
    }

    if (ch === "्") {
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Strips punctuation marks, including ASCII symbols and Indic dandas.
 * @param {string} text
 * @returns {string}
 */
function stripPunctuation(text) {
  if (!text) return "";
  return text.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”«»[\]|\\।॥]/g, " ");
}

/**
 * Normalizes an utterance:
 * 1. Convert to lowercase
 * 2. Convert Devanagari digits to 0-9
 * 3. Transliterate Devanagari characters to Latin phonetics
 * 4. Apply phonetic canonical loanword mapping
 * 5. Strip punctuation
 * 6. Collapse repeated whitespace and trim
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  if (typeof text !== "string") return "";
  let s = text.toLowerCase();
  s = convertDevanagariDigits(s);
  s = transliterateDevanagari(s);
  s = stripPunctuation(s);
  s = s.replace(/\s+/g, " ").trim();

  // Map transliterated phonetic variants to canonical equivalents
  for (const [pattern, replacement] of PHONETIC_CANONICAL_MAP) {
    s = s.replace(pattern, replacement);
  }

  return s;
}

module.exports = {
  normalize,
  transliterateDevanagari,
  convertDevanagariDigits,
  stripPunctuation,
  PHONETIC_CANONICAL_MAP,
};
