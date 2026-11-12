"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { COMMANDS } = require("../../../src/helpers/commands/grammar");

test("grammar safety: all command definitions contain no shell strings or paths", () => {
  assert.ok(Array.isArray(COMMANDS), "COMMANDS must be an array");
  assert.equal(COMMANDS.length, 21, "Must contain all 21 initial commands");

  // Forbidden shell execution commands, command line interpreters and filesystem paths
  const FORBIDDEN_SHELL_PATTERNS = [
    /\b(?:bash|sh|zsh|csh|tcsh)\s+-c/i,
    /\b(?:cmd|cmd\.exe)\s+\/[a-z]/i,
    /\b(?:powershell|pwsh)\s+-[a-z]/i,
    /\b(?:child_process|exec|execSync|spawn|spawnSync|fork)\b/i,
    /\b(?:rm\s+-rf|del\s+\/f|rmdir|erase|format\s+[a-z]:)\b/i,
    /\b(?:sudo|chmod|chown)\b/i,
    /[\\/](?:bin|usr|etc|var|tmp|Windows|System32)[\\/]/i,
  ];

  for (const cmd of COMMANDS) {
    assert.ok(cmd.id, "Command must have an id");
    assert.ok(cmd.actionType, `Command ${cmd.id} must have an actionType`);
    assert.ok(Array.isArray(cmd.parameterSlots), `Command ${cmd.id} must define parameterSlots`);

    // Serialize command definition to inspect all string values
    const serialized = JSON.stringify(cmd);

    for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
      assert.doesNotMatch(
        serialized,
        pattern,
        `Command ${cmd.id} contains prohibited shell pattern: ${pattern}`
      );
    }
  }
});
