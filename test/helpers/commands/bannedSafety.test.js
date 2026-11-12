"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand, checkSafety } = require("../../../src/helpers/commands");

const BANNED_SAFETY_CASES = [
  // 1. Direct shell invocations & command execution
  "powershell -c Get-Process",
  "powershell.exe -ExecutionPolicy Bypass",
  "cmd /c dir C:\\",
  "cmd /k echo pwned",
  "sudo apt update",
  "sudo rm -rf /",
  "rm -rf node_modules",
  "rm main.js",
  "del important.txt",
  "kill -9 4821",

  // 2. Destructive file and data deletion ("hatao" on files/code/data)
  "file hatao",
  "ye file hata do",
  "folder hatao",
  "code hatao",
  "data hatao",
  "database hatao",
  "directory hata do",
  "delete this file",
  "file delete karo",
  "फ़ाइल हटाओ",
  "फाइल हटा दो",
  "कोड हटाओ",
  "डेटा हटाओ",
  "मेटा डेटा मिटा दो",
  "पुराना कोड उड़ा दो",

  // 3. Dangerous OS shutdown & restart ("band karo" on system/pc/laptop)
  "shutdown computer",
  "shut down now",
  "system band karo",
  "computer band karo",
  "laptop band karo",
  "pc band karo",
  "मशीन बंद करो",
  "सिस्टम बंद करो",
  "कंप्यूटर बंद करो",
  "restart system",
  "reboot karo",
  "शट डाउन करो",
  "रीस्टार्ट करो",

  // 4. Formatting and disk operations
  "format c:",
  "format disk",
  "पूरा ड्राइव फॉर्मेट करो",

  // 5. Financial payments and purchases
  "buy domain",
  "purchase premium",
  "paisa bhejo",
  "paise bhejo",
  "transfer karo 5000",
  "pay karo 100",
  "पैसे भेजो",
  "यह सामान खरीदो",

  // 6. External submission, exfiltration, installation
  "send email to client",
  "send message to group",
  "submit form now",
  "सबमिट करो फॉर्म",
  "install backdoor",
  "uninstall antivirus",
  "इंस्टॉल करो नया ऐप",
];

test("safety: 35 banned-term utterances must be blocked", () => {
  const bannedUtterances = BANNED_SAFETY_CASES;

  assert.ok(
    bannedUtterances.length >= 30,
    `Must test at least 30 banned utterances (got ${bannedUtterances.length})`
  );

  for (const utterance of bannedUtterances) {
    const directSafety = checkSafety(utterance);
    assert.equal(
      directSafety.blocked,
      true,
      `checkSafety must block: "${utterance}"`
    );
    assert.ok(
      directSafety.reason,
      `checkSafety must provide a reason for: "${utterance}"`
    );

    const parsed = parseCommand(utterance);
    assert.equal(
      parsed.blocked,
      true,
      `parseCommand must block: "${utterance}"`
    );
    assert.ok(
      parsed.reason,
      `parseCommand must provide a reason for: "${utterance}"`
    );
  }
});

module.exports = {
  BANNED_SAFETY_CASES,
};
