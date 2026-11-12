"use strict";

/**
 * safety.js
 *
 * Safety boundary and policy enforcement for Hinglish voice commands.
 * Identifies and intercepts destructive, high-risk, or irreversible terms
 * (system modification, arbitrary execution, file deletion, financial transactions,
 * and data exfiltration).
 *
 * Rules:
 * - Unconditional banned terms (rm, del, delete, sudo, format, shutdown, etc.)
 * - Contextual rules:
 *   - "hatao" is permitted only for window/tab closure; file/code/data removal is blocked.
 *   - "band karo" is permitted only for windows, tabs, media, and audio; system shutdown is blocked.
 */

const { normalize } = require("./normalize");

const UNCONDITIONAL_BANNED_PATTERNS = [
  // System execution & shell commands
  { pattern: /\bpowershell(?:\.exe)?\s+-[a-zA-Z]/i, reason: "Arbitrary PowerShell execution is blocked" },
  { pattern: /\bcmd(?:\.exe)?\s+\/[a-zA-Z]/i, reason: "Arbitrary Command Prompt execution is blocked" },
  { pattern: /\bsudo\b/i, reason: "Elevated command execution (sudo) is blocked" },
  { pattern: /\brm\s+-[a-zA-Z]/i, reason: "Recursive file deletion (rm) is blocked" },
  { pattern: /\b(?:rm|del|rmdir|erase)\s+[a-zA-Z0-9_.*\\/-]+/i, reason: "Direct file/folder deletion is blocked" },
  { pattern: /\bkill\s+-9\b/i, reason: "Forced process termination is blocked" },

  // System reboot & shutdown
  { pattern: /\b(?:shutdown|shut down)\b/i, reason: "System shutdown is blocked" },
  { pattern: /शट\s*डाउन/i, reason: "System shutdown is blocked" },
  { pattern: /\b(?:restart|reboot)\b/i, reason: "System restart is blocked" },
  { pattern: /रीस्टार्ट|रिबूट/i, reason: "System restart is blocked" },

  // Formatting & disk operations
  { pattern: /\bformat\s+[a-zA-Z]:/i, reason: "Disk formatting is blocked" },
  { pattern: /\bformat\b/i, reason: "Format operations are blocked" },
  { pattern: /फॉर्मेट/i, reason: "Format operations are blocked" },

  // Unconditional file / database deletion
  { pattern: /\bdelete\b/i, reason: "Delete operations are blocked" },
  { pattern: /डिलीट/i, reason: "Delete operations are blocked" },
  { pattern: /\bremove\b/i, reason: "Remove operations are blocked" },
  { pattern: /रिमूव/i, reason: "Remove operations are blocked" },
  { pattern: /\b(?:drop\s+table|drop\s+database|truncate\s+table)\b/i, reason: "Database deletion is blocked" },
  { pattern: /\b(?:wipe|purge)\b/i, reason: "Data wiping/purging is blocked" },

  // Financial transactions & payments
  { pattern: /\b(?:buy|purchase)\b/i, reason: "Purchasing actions are blocked" },
  { pattern: /खरीदो|खरीद\s+लो/i, reason: "Purchasing actions are blocked" },
  { pattern: /\b(?:khareedo|kharido)\b/i, reason: "Purchasing actions are blocked" },
  { pattern: /\b(?:transfer|transfer\s+karo)\b/i, reason: "Financial/asset transfers are blocked" },
  { pattern: /ट्रांसफर/i, reason: "Financial/asset transfers are blocked" },
  { pattern: /\b(?:pay|payment|paisa\s+bhejo|paise\s+bhejo)\b/i, reason: "Payment operations are blocked" },
  { pattern: /पेमेंट|पैसे\s+भेजो|पैसा\s+भेजो/i, reason: "Payment operations are blocked" },

  // External submission & message sending
  { pattern: /\b(?:send\s+email|send\s+message|send\s+money|send\s+pr)\b/i, reason: "Sending operations are blocked" },
  { pattern: /\b(?:submit\s+form|submit\s+pr|submit\s+code)\b/i, reason: "Submission operations are blocked" },
  { pattern: /सबमिट\s+करो|सबमिट/i, reason: "Submission operations are blocked" },
  { pattern: /\b(?:bhejo|bhej\s+do)\b/i, reason: "Sending operations are blocked" },
  { pattern: /भेजो|भेज\s+दो/i, reason: "Sending operations are blocked" },

  // Software installation / uninstallation
  { pattern: /\b(?:install|uninstall)\b/i, reason: "Software installation/uninstallation is blocked" },
  { pattern: /इंस्टॉल|अनइंस्टॉल/i, reason: "Software installation/uninstallation is blocked" },

  // Hindi destructive phrases
  { pattern: /\b(?:mita\s+do|mitao|uda\s+do|ura\s+do)\b/i, reason: "Destructive deletion phrases are blocked" },
  { pattern: /मिटा\s+दो|मिटाओ|उड़ा\s+दो/i, reason: "Destructive deletion phrases are blocked" },
];

/**
 * Checks contextual safety rules:
 * 1. "hatao": allowed only for tabs or windows. If applied to files, folders, code, data, etc. -> blocked.
 * 2. "band karo": allowed for tabs, windows, apps, volume/mute, media. If applied to system/pc/laptop -> blocked.
 *
 * @param {string} raw
 * @param {string} norm
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkContextualSafety(raw, norm) {
  const hasFileTarget =
    /\b(?:file|folder|code|data|doc|document|directory|repo|branch|database|disk|fail|faail|foldar|kod|daata)\b/i.test(norm) ||
    /(?:फ़ाइल|फाइल|फ़ोल्डर|फोल्डर|कोड|डेटा|डाटा|दस्तावेज़|दस्तावेज)/.test(raw);

  const hasSystemTarget =
    /\b(?:system|computer|pc|laptop|machine|mashin|sistam|kamputara|kamputar)\b/i.test(norm) ||
    /(?:सिस्टम|कंप्यूटर|कम्प्यूटर|लैपटॉप|मशीन|पीसी)/.test(raw);

  const hasHatao =
    /\b(?:hatao|hataao|hata\s+do|hataa\s+do)\b/i.test(norm) ||
    /(?:हटाओ|हटा\s+दो)/.test(raw);

  if (hasHatao && hasFileTarget) {
    return {
      blocked: true,
      reason: 'File and data deletion ("hatao") is blocked',
    };
  }

  const hasBandKaro =
    /\b(?:band\s+karo|band\s+kar\s+do|banda\s+karo)\b/i.test(norm) ||
    /(?:बंद\s+करो|बंद\s+कर\s+दो)/.test(raw);

  if (hasBandKaro && hasSystemTarget) {
    return {
      blocked: true,
      reason: 'System shutdown ("system band karo") is blocked',
    };
  }

  return { blocked: false };
}

/**
 * Checks whether an utterance contains any prohibited term or action.
 *
 * @param {string} transcript
 * @returns {{ safe: boolean, blocked?: boolean, reason?: string }}
 */
function checkSafety(transcript) {
  if (typeof transcript !== "string") {
    return { safe: true };
  }

  const raw = transcript.trim();
  const norm = normalize(raw);

  // 1. Contextual safety checks
  const contextCheck = checkContextualSafety(raw, norm);
  if (contextCheck.blocked) {
    return { safe: false, blocked: true, reason: contextCheck.reason };
  }

  // 2. Unconditional pattern checks
  for (const item of UNCONDITIONAL_BANNED_PATTERNS) {
    if (item.pattern.test(raw) || item.pattern.test(norm)) {
      return {
        safe: false,
        blocked: true,
        reason: item.reason,
      };
    }
  }

  return { safe: true };
}

/**
 * Indicates whether a command requires explicit user confirmation before dispatch.
 * In the initial deterministic command set, all supported actions are non-destructive.
 *
 * @param {string} commandId
 * @returns {boolean}
 */
function requiresConfirmation(_commandId) {
  return false;
}

const BANNED_TERMS = UNCONDITIONAL_BANNED_PATTERNS.map((p) => p.reason);

module.exports = {
  checkSafety,
  requiresConfirmation,
  BANNED_TERMS,
};
