"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand } = require("../../../src/helpers/commands");

test("type_text: preserves text payload exactly without normalization or casing changes", () => {
  const cases = [
    {
      input: 'likho: Hello, World!',
      expectedText: 'Hello, World!',
    },
    {
      input: 'likho: def calculate_total(price, tax = 0.18):',
      expectedText: 'def calculate_total(price, tax = 0.18):',
    },
    {
      input: 'type karo: SELECT * FROM `orders` WHERE status = "PENDING";',
      expectedText: 'SELECT * FROM `orders` WHERE status = "PENDING";',
    },
    {
      input: 'type: const url = "https://example.com/api?v=1&q=test#heading";',
      expectedText: 'const url = "https://example.com/api?v=1&q=test#heading";',
    },
    {
      input: 'likho   Capitalized Text With PUNCTUATION!!',
      expectedText: 'Capitalized Text With PUNCTUATION!!',
    },
    {
      input: 'type karo   multi   spaced    token    stream',
      expectedText: 'multi   spaced    token    stream',
    },
    {
      input: 'लिखो: नमस्ते दुनिया, यह एक परीक्षण है।',
      expectedText: 'नमस्ते दुनिया, यह एक परीक्षण है।',
    },
    {
      input: 'टाइप करो: if (x > 10 && y <= 20) { return true; }',
      expectedText: 'if (x > 10 && y <= 20) { return true; }',
    },
    {
      input: 'likho: {"key": "Value", "count": 123, "active": true}',
      expectedText: '{"key": "Value", "count": 123, "active": true}',
    },
    {
      input: 'type karo: git commit -m "feat(parser): add type_text support"',
      expectedText: 'git commit -m "feat(parser): add type_text support"',
    },
  ];

  for (const c of cases) {
    const res = parseCommand(c.input);
    assert.equal(res.commandId, "type_text", `Expected commandId type_text for input: ${c.input}`);
    assert.deepEqual(
      res.params,
      { text: c.expectedText },
      `Payload must match exactly for input: ${c.input}`
    );
    assert.equal(res.confidence, 1.0, `Confidence must be 1.0 for type_text: ${c.input}`);
    assert.ok(res.matchedText, `matchedText must be present for input: ${c.input}`);
  }
});
