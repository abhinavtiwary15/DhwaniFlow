"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand } = require("../../../src/helpers/commands");

const NEGATIVE_TEST_CASES = [
  // 1. Conversational Hinglish dictation
  "bhai please PR merge kar do",
  "aaj shaam ko meeting me chalte hain",
  "kal ka build fail ho gaya tha",
  "kya tum mujhe ye function samjha sakte ho",
  "is ticket ka status in progress kar diya hai",
  "mai chai peene ja raha hu",
  "production me deployment complete ho gayi hai",
  "design review kab schedule karna hai",
  "ye component refactor karna padega",
  "merge conflict resolve ho gaya kya",
  "chalo ab lunch karne chalte hain",
  "kal dopahar tak PR ready ho jayega",

  // 2. English dictation & prose
  "let us review the architecture tomorrow morning",
  "the quick brown fox jumps over the lazy dog",
  "we need to increase unit test coverage on this module",
  "the database connection pool size is twenty",
  "today is a great day for coding in TypeScript",
  "our engineering team achieved all quarterly goals",
  "we should refactor the logging utility across services",
  "the weather in Bengaluru is very pleasant today",
  "react fiber architecture improves concurrent rendering performance",
  "microservices should maintain isolated database boundaries",

  // 3. Developer code snippets & terminal commands
  "const totalItems = items.length",
  "export default function UserProfile({ id }) {",
  "import { useEffect, useState } from 'react'",
  "console.log('debugging application state')",
  "return response.status(200).json(result)",
  "git checkout -b feature/auth-flow",
  "npm run build:renderer",
  "docker compose up in detached mode",
  "while (low <= high) { mid = Math.floor((low + high) / 2); }",
  "interface DatabaseRecord { id: string; timestamp: number; }",

  // 4. Devanagari conversational sentences (free of banned terms)
  "आज का मौसम बहुत अच्छा है",
  "क्या हम कल सुबह बात कर सकते हैं",
  "इस कोड में एक छोटा सा बग है",
  "यह नया फीचर बहुत उपयोगी है",
  "कॉफी पीने का समय हो गया",
  "मीटिंग का समय बदल गया है",
  "प्रोजेक्ट का नया अपडेट आ गया है",
  "यह विवरण बहुत लंबा है",

  // 5. Short conversational fillers & colloquialisms
  "chalo bhai",
  "achha theek hai",
];

test("matcher: 42 negative and dictation-like utterances must return unknown", () => {
  const negativeUtterances = NEGATIVE_TEST_CASES;

  assert.ok(
    negativeUtterances.length >= 40,
    `Must test at least 40 negative utterances (got ${negativeUtterances.length})`
  );

  for (const utterance of negativeUtterances) {
    const res = parseCommand(utterance);
    assert.equal(
      res.unknown,
      true,
      `Expected unknown for utterance: "${utterance}", but got: ${JSON.stringify(res)}`
    );
    assert.equal(
      res.transcript,
      utterance,
      `Result must retain original transcript for: "${utterance}"`
    );
  }
});

module.exports = {
  NEGATIVE_TEST_CASES,
};
