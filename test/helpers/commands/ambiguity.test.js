"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand } = require("../../../src/helpers/commands");

test("ambiguity: conflicting commands within 10% score margin must return unknown", () => {
  const ambiguousCases = [
    {
      utterance: "window minimize maximize",
      expectedReason: "ambiguous",
      expectedCommandIds: ["minimize", "maximize"],
    },
    {
      utterance: "next previous tab",
      expectedReason: "ambiguous",
      expectedCommandIds: ["next_tab", "previous_tab"],
    },
    {
      utterance: "open switch chrome",
      expectedReason: "ambiguous",
      expectedCommandIds: ["open_app", "switch_app"],
    },
    {
      utterance: "scroll upar neeche",
      expectedReason: "ambiguous",
      expectedCommandIds: ["scroll"],
    },
    {
      utterance: "volume up down",
      expectedReason: "ambiguous",
      expectedCommandIds: ["volume"],
    },
    // Single isolated multi-command homonyms that don't satisfy threshold
    {
      utterance: "tab",
      expectedReason: undefined,
    },
    {
      utterance: "scroll",
      expectedReason: undefined,
    },
    {
      utterance: "volume",
      expectedReason: undefined,
    },
    {
      utterance: "snap",
      expectedReason: undefined,
    },
    {
      utterance: "press",
      expectedReason: undefined,
    },
  ];

  for (const c of ambiguousCases) {
    const res = parseCommand(c.utterance);
    assert.equal(
      res.unknown,
      true,
      `Expected unknown for ambiguous input: "${c.utterance}", got: ${JSON.stringify(res)}`
    );

    if (c.expectedReason === "ambiguous") {
      assert.equal(
        res.reason,
        "ambiguous",
        `Expected ambiguity reason for: "${c.utterance}"`
      );
      assert.ok(
        Array.isArray(res.alternatives),
        `Must provide alternatives for: "${c.utterance}"`
      );
      assert.ok(
        res.alternatives.length >= 2,
        `Must list at least 2 alternative candidates for: "${c.utterance}"`
      );
    }
  }
});
