"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCommand } = require("../../../src/helpers/commands");

// Table of at least 150 positive utterances across all 21 commands,
// covering Latin, Devanagari, and mixed spellings with 3-5+ natural variants each.
const POSITIVE_TEST_CASES = [
  // 1. open_app (appKey)
  { utterance: "chrome kholo", commandId: "open_app", params: { appKey: "chrome" } },
  { utterance: "open vs code", commandId: "open_app", params: { appKey: "vscode" } },
  { utterance: "notepad chalu karo", commandId: "open_app", params: { appKey: "notepad" } },
  { utterance: "calculator start karo", commandId: "open_app", params: { appKey: "calculator" } },
  { utterance: "spotify open karo", commandId: "open_app", params: { appKey: "spotify" } },
  { utterance: "slack khol do", commandId: "open_app", params: { appKey: "slack" } },
  { utterance: "cursor chalu kar do", commandId: "open_app", params: { appKey: "cursor" } },
  { utterance: "explorer kholo", commandId: "open_app", params: { appKey: "explorer" } },
  { utterance: "terminal open karo", commandId: "open_app", params: { appKey: "terminal" } },
  { utterance: "settings kholo", commandId: "open_app", params: { appKey: "settings" } },
  { utterance: "whatsapp open kar do", commandId: "open_app", params: { appKey: "whatsapp" } },
  { utterance: "क्रोम खोलो", commandId: "open_app", params: { appKey: "chrome" } },
  { utterance: "नोटपैड चालू करो", commandId: "open_app", params: { appKey: "notepad" } },
  { utterance: "कैलकुलेटर ओपन करो", commandId: "open_app", params: { appKey: "calculator" } },
  { utterance: "स्पॉटिफाई खोलो", commandId: "open_app", params: { appKey: "spotify" } },
  { utterance: "टर्मिनल चालू करो", commandId: "open_app", params: { appKey: "terminal" } },
  { utterance: "सेटिंग्स खोलो", commandId: "open_app", params: { appKey: "settings" } },
  { utterance: "व्हाट्सएप खोलो", commandId: "open_app", params: { appKey: "whatsapp" } },
  { utterance: "Chrome खोलो", commandId: "open_app", params: { appKey: "chrome" } },
  { utterance: "VS Code चालू करो", commandId: "open_app", params: { appKey: "vscode" } },
  { utterance: "Spotify खोल दो", commandId: "open_app", params: { appKey: "spotify" } },
  { utterance: "WhatsApp open karo", commandId: "open_app", params: { appKey: "whatsapp" } },
  { utterance: "Cursor start karo", commandId: "open_app", params: { appKey: "cursor" } },
  { utterance: "Notepad chalu karo", commandId: "open_app", params: { appKey: "notepad" } },

  // 2. switch_app (appKey)
  { utterance: "chrome pe jao", commandId: "switch_app", params: { appKey: "chrome" } },
  { utterance: "switch to vs code", commandId: "switch_app", params: { appKey: "vscode" } },
  { utterance: "terminal par jao", commandId: "switch_app", params: { appKey: "terminal" } },
  { utterance: "spotify switch karo", commandId: "switch_app", params: { appKey: "spotify" } },
  { utterance: "slack pe jao", commandId: "switch_app", params: { appKey: "slack" } },
  { utterance: "cursor switch karo", commandId: "switch_app", params: { appKey: "cursor" } },
  { utterance: "notepad pe jao", commandId: "switch_app", params: { appKey: "notepad" } },
  { utterance: "क्रोम पे जाओ", commandId: "switch_app", params: { appKey: "chrome" } },
  { utterance: "टर्मिनल पर जाओ", commandId: "switch_app", params: { appKey: "terminal" } },
  { utterance: "स्पॉटिफाई पे जाओ", commandId: "switch_app", params: { appKey: "spotify" } },
  { utterance: "सेटिंग्स स्विच करो", commandId: "switch_app", params: { appKey: "settings" } },
  { utterance: "Chrome पे जाओ", commandId: "switch_app", params: { appKey: "chrome" } },
  { utterance: "VS Code par jao", commandId: "switch_app", params: { appKey: "vscode" } },
  { utterance: "Slack स्विच करो", commandId: "switch_app", params: { appKey: "slack" } },
  { utterance: "Cursor pe jao", commandId: "switch_app", params: { appKey: "cursor" } },

  // 3. new_tab
  { utterance: "new tab", commandId: "new_tab", params: {} },
  { utterance: "naya tab", commandId: "new_tab", params: {} },
  { utterance: "naya tab kholo", commandId: "new_tab", params: {} },
  { utterance: "open new tab", commandId: "new_tab", params: {} },
  { utterance: "ek naya tab", commandId: "new_tab", params: {} },
  { utterance: "नया टैब", commandId: "new_tab", params: {} },
  { utterance: "नया टैब खोलो", commandId: "new_tab", params: {} },
  { utterance: "एक नया टैब", commandId: "new_tab", params: {} },
  { utterance: "New टैब खोलो", commandId: "new_tab", params: {} },
  { utterance: "ek naya Tab kholo", commandId: "new_tab", params: {} },

  // 4. close_tab
  { utterance: "close tab", commandId: "close_tab", params: {} },
  { utterance: "tab band karo", commandId: "close_tab", params: {} },
  { utterance: "tab close karo", commandId: "close_tab", params: {} },
  { utterance: "tab hatao", commandId: "close_tab", params: {} },
  { utterance: "ye tab band karo", commandId: "close_tab", params: {} },
  { utterance: "टैब बंद करो", commandId: "close_tab", params: {} },
  { utterance: "टैब हटाओ", commandId: "close_tab", params: {} },
  { utterance: "टैब क्लोज करो", commandId: "close_tab", params: {} },
  { utterance: "Tab बंद करो", commandId: "close_tab", params: {} },
  { utterance: "Tab hatao", commandId: "close_tab", params: {} },
  { utterance: "ye Tab band karo", commandId: "close_tab", params: {} },

  // 5. next_tab
  { utterance: "next tab", commandId: "next_tab", params: {} },
  { utterance: "agla tab", commandId: "next_tab", params: {} },
  { utterance: "agle tab pe jao", commandId: "next_tab", params: {} },
  { utterance: "tab next", commandId: "next_tab", params: {} },
  { utterance: "agla tab kholo", commandId: "next_tab", params: {} },
  { utterance: "अगला टैब", commandId: "next_tab", params: {} },
  { utterance: "अगले टैब पे जाओ", commandId: "next_tab", params: {} },
  { utterance: "agla Tab", commandId: "next_tab", params: {} },
  { utterance: "agle Tab pe jao", commandId: "next_tab", params: {} },
  { utterance: "Next टैब", commandId: "next_tab", params: {} },

  // 6. previous_tab
  { utterance: "previous tab", commandId: "previous_tab", params: {} },
  { utterance: "prev tab", commandId: "previous_tab", params: {} },
  { utterance: "pichhla tab", commandId: "previous_tab", params: {} },
  { utterance: "pichla tab", commandId: "previous_tab", params: {} },
  { utterance: "pichhle tab pe jao", commandId: "previous_tab", params: {} },
  { utterance: "पिछला टैब", commandId: "previous_tab", params: {} },
  { utterance: "पिछले टैब पे जाओ", commandId: "previous_tab", params: {} },
  { utterance: "pichla Tab", commandId: "previous_tab", params: {} },
  { utterance: "pichhle Tab pe jao", commandId: "previous_tab", params: {} },
  { utterance: "Previous टैब", commandId: "previous_tab", params: {} },

  // 7. scroll (direction, amount)
  { utterance: "scroll up", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "upar scroll karo", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "scroll upar", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "upar jao", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "page up", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "scroll down", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "neeche scroll karo", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "niche scroll karo", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "scroll neeche", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "neeche jao", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "page down", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "ऊपर स्क्रोल करो", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "ऊपर जाओ", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "नीचे स्क्रोल करो", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "नीचे जाओ", commandId: "scroll", params: { direction: "down", amount: 1 } },
  { utterance: "upar Scroll karo", commandId: "scroll", params: { direction: "up", amount: 1 } },
  { utterance: "neeche Scroll karo", commandId: "scroll", params: { direction: "down", amount: 1 } },

  // 8. minimize
  { utterance: "minimize", commandId: "minimize", params: {} },
  { utterance: "minimize karo", commandId: "minimize", params: {} },
  { utterance: "window minimize karo", commandId: "minimize", params: {} },
  { utterance: "minimize window", commandId: "minimize", params: {} },
  { utterance: "chhota karo", commandId: "minimize", params: {} },
  { utterance: "मिनिमाइज करो", commandId: "minimize", params: {} },
  { utterance: "विंडो मिनिमाइज करो", commandId: "minimize", params: {} },
  { utterance: "छोटा करो", commandId: "minimize", params: {} },
  { utterance: "Window minimize karo", commandId: "minimize", params: {} },
  { utterance: "Screen minimize karo", commandId: "minimize", params: {} },

  // 9. maximize
  { utterance: "maximize", commandId: "maximize", params: {} },
  { utterance: "maximize karo", commandId: "maximize", params: {} },
  { utterance: "window maximize karo", commandId: "maximize", params: {} },
  { utterance: "fullscreen karo", commandId: "maximize", params: {} },
  { utterance: "bada karo", commandId: "maximize", params: {} },
  { utterance: "मैक्सिमाइज करो", commandId: "maximize", params: {} },
  { utterance: "विंडो मैक्सिमाइज करो", commandId: "maximize", params: {} },
  { utterance: "बड़ा करो", commandId: "maximize", params: {} },
  { utterance: "फुल स्क्रीन करो", commandId: "maximize", params: {} },
  { utterance: "Window maximize karo", commandId: "maximize", params: {} },

  // 10. snap (side)
  { utterance: "snap left", commandId: "snap", params: { side: "left" } },
  { utterance: "left snap karo", commandId: "snap", params: { side: "left" } },
  { utterance: "baayein snap karo", commandId: "snap", params: { side: "left" } },
  { utterance: "window left karo", commandId: "snap", params: { side: "left" } },
  { utterance: "snap right", commandId: "snap", params: { side: "right" } },
  { utterance: "right snap karo", commandId: "snap", params: { side: "right" } },
  { utterance: "daayein snap karo", commandId: "snap", params: { side: "right" } },
  { utterance: "window right karo", commandId: "snap", params: { side: "right" } },
  { utterance: "स्नैप लेफ्ट", commandId: "snap", params: { side: "left" } },
  { utterance: "स्नैप राइट", commandId: "snap", params: { side: "right" } },
  { utterance: "Left snap karo", commandId: "snap", params: { side: "left" } },
  { utterance: "Right snap karo", commandId: "snap", params: { side: "right" } },

  // 11. show_desktop
  { utterance: "show desktop", commandId: "show_desktop", params: {} },
  { utterance: "desktop dikhao", commandId: "show_desktop", params: {} },
  { utterance: "desktop pe jao", commandId: "show_desktop", params: {} },
  { utterance: "saare window minimize karo", commandId: "show_desktop", params: {} },
  { utterance: "डेस्कटॉप दिखाओ", commandId: "show_desktop", params: {} },
  { utterance: "डेस्कटॉप पे जाओ", commandId: "show_desktop", params: {} },
  { utterance: "Desktop dikhao", commandId: "show_desktop", params: {} },
  { utterance: "Desktop pe jao", commandId: "show_desktop", params: {} },

  // 12. volume (action)
  { utterance: "volume up", commandId: "volume", params: { action: "up" } },
  { utterance: "volume badhao", commandId: "volume", params: { action: "up" } },
  { utterance: "awaaz badhao", commandId: "volume", params: { action: "up" } },
  { utterance: "volume down", commandId: "volume", params: { action: "down" } },
  { utterance: "volume kam karo", commandId: "volume", params: { action: "down" } },
  { utterance: "awaaz kam karo", commandId: "volume", params: { action: "down" } },
  { utterance: "mute", commandId: "volume", params: { action: "mute" } },
  { utterance: "volume mute karo", commandId: "volume", params: { action: "mute" } },
  { utterance: "awaaz band karo", commandId: "volume", params: { action: "mute" } },
  { utterance: "chup karo", commandId: "volume", params: { action: "mute" } },
  { utterance: "आवाज बढ़ाओ", commandId: "volume", params: { action: "up" } },
  { utterance: "आवाज कम करो", commandId: "volume", params: { action: "down" } },
  { utterance: "म्यूट करो", commandId: "volume", params: { action: "mute" } },
  { utterance: "Volume बढ़ाओ", commandId: "volume", params: { action: "up" } },
  { utterance: "Volume kam karo", commandId: "volume", params: { action: "down" } },
  { utterance: "Volume mute karo", commandId: "volume", params: { action: "mute" } },

  // 13. media (action)
  { utterance: "play", commandId: "media", params: { action: "play_pause" } },
  { utterance: "pause", commandId: "media", params: { action: "play_pause" } },
  { utterance: "gana chalao", commandId: "media", params: { action: "play_pause" } },
  { utterance: "gana roko", commandId: "media", params: { action: "play_pause" } },
  { utterance: "next song", commandId: "media", params: { action: "next" } },
  { utterance: "agla gana", commandId: "media", params: { action: "next" } },
  { utterance: "previous song", commandId: "media", params: { action: "previous" } },
  { utterance: "pichhla gana", commandId: "media", params: { action: "previous" } },
  { utterance: "गाना चलाओ", commandId: "media", params: { action: "play_pause" } },
  { utterance: "गाना रोको", commandId: "media", params: { action: "play_pause" } },
  { utterance: "अगला गाना", commandId: "media", params: { action: "next" } },
  { utterance: "पिछला गाना", commandId: "media", params: { action: "previous" } },
  { utterance: "Gana chalao", commandId: "media", params: { action: "play_pause" } },
  { utterance: "Gana roko", commandId: "media", params: { action: "play_pause" } },
  { utterance: "Agla Song", commandId: "media", params: { action: "next" } },
  { utterance: "Pichhla Song", commandId: "media", params: { action: "previous" } },

  // 14. screenshot
  { utterance: "screenshot", commandId: "screenshot", params: {} },
  { utterance: "take screenshot", commandId: "screenshot", params: {} },
  { utterance: "screenshot lo", commandId: "screenshot", params: {} },
  { utterance: "screenshot kheecho", commandId: "screenshot", params: {} },
  { utterance: "screen capture", commandId: "screenshot", params: {} },
  { utterance: "स्क्रीनशॉट लो", commandId: "screenshot", params: {} },
  { utterance: "स्क्रीनशॉट खींचो", commandId: "screenshot", params: {} },
  { utterance: "Screenshot lo", commandId: "screenshot", params: {} },
  { utterance: "Screenshot le lo", commandId: "screenshot", params: {} },

  // 15. copy
  { utterance: "copy", commandId: "copy", params: {} },
  { utterance: "copy karo", commandId: "copy", params: {} },
  { utterance: "ise copy karo", commandId: "copy", params: {} },
  { utterance: "copy this", commandId: "copy", params: {} },
  { utterance: "कॉपी करो", commandId: "copy", params: {} },
  { utterance: "Text copy karo", commandId: "copy", params: {} },
  { utterance: "Ise copy karo", commandId: "copy", params: {} },

  // 16. paste
  { utterance: "paste", commandId: "paste", params: {} },
  { utterance: "paste karo", commandId: "paste", params: {} },
  { utterance: "yahan paste karo", commandId: "paste", params: {} },
  { utterance: "paste this", commandId: "paste", params: {} },
  { utterance: "पेस्ट करो", commandId: "paste", params: {} },
  { utterance: "Yahan paste karo", commandId: "paste", params: {} },
  { utterance: "Text paste karo", commandId: "paste", params: {} },

  // 17. undo
  { utterance: "undo", commandId: "undo", params: {} },
  { utterance: "undo karo", commandId: "undo", params: {} },
  { utterance: "wapas lo", commandId: "undo", params: {} },
  { utterance: "pehle jaisa karo", commandId: "undo", params: {} },
  { utterance: "अनडू करो", commandId: "undo", params: {} },
  { utterance: "वापस लो", commandId: "undo", params: {} },
  { utterance: "Undo करो", commandId: "undo", params: {} },
  { utterance: "Wapas lo", commandId: "undo", params: {} },

  // 18. select_all
  { utterance: "select all", commandId: "select_all", params: {} },
  { utterance: "select all text", commandId: "select_all", params: {} },
  { utterance: "sab select karo", commandId: "select_all", params: {} },
  { utterance: "saara select karo", commandId: "select_all", params: {} },
  { utterance: "सब सेलेक्ट करो", commandId: "select_all", params: {} },
  { utterance: "सारा सेलेक्ट करो", commandId: "select_all", params: {} },
  { utterance: "Sab select karo", commandId: "select_all", params: {} },

  // 19. press (key)
  { utterance: "press enter", commandId: "press", params: { key: "enter" } },
  { utterance: "enter dabao", commandId: "press", params: { key: "enter" } },
  { utterance: "enter maro", commandId: "press", params: { key: "enter" } },
  { utterance: "press escape", commandId: "press", params: { key: "escape" } },
  { utterance: "escape dabao", commandId: "press", params: { key: "escape" } },
  { utterance: "press tab", commandId: "press", params: { key: "tab" } },
  { utterance: "tab dabao", commandId: "press", params: { key: "tab" } },
  { utterance: "press backspace", commandId: "press", params: { key: "backspace" } },
  { utterance: "backspace dabao", commandId: "press", params: { key: "backspace" } },
  { utterance: "एंटर दबाओ", commandId: "press", params: { key: "enter" } },
  { utterance: "एस्केप दबाओ", commandId: "press", params: { key: "escape" } },
  { utterance: "टैब दबाओ", commandId: "press", params: { key: "tab" } },
  { utterance: "बैकस्पेस दबाओ", commandId: "press", params: { key: "backspace" } },
  { utterance: "Enter दबाओ", commandId: "press", params: { key: "enter" } },
  { utterance: "Escape दबाओ", commandId: "press", params: { key: "escape" } },
  { utterance: "Tab दबाओ", commandId: "press", params: { key: "tab" } },
  { utterance: "Backspace दबाओ", commandId: "press", params: { key: "backspace" } },

  // 20. type_text (text)
  { utterance: "likho: hello developer", commandId: "type_text", params: { text: "hello developer" } },
  { utterance: "type karo: npm test", commandId: "type_text", params: { text: "npm test" } },
  { utterance: "type: status code 200", commandId: "type_text", params: { text: "status code 200" } },
  { utterance: "लिखो: नया प्रोजेक्ट", commandId: "type_text", params: { text: "नया प्रोजेक्ट" } },
  { utterance: "टाइप करो: कोड समीक्षा", commandId: "type_text", params: { text: "कोड समीक्षा" } },
  { utterance: "likho: नमस्ते world", commandId: "type_text", params: { text: "नमस्ते world" } },
  { utterance: "type karo: const x = 10;", commandId: "type_text", params: { text: "const x = 10;" } },

  // 21. cancel
  { utterance: "cancel", commandId: "cancel", params: {} },
  { utterance: "ruko", commandId: "cancel", params: {} },
  { utterance: "cancel karo", commandId: "cancel", params: {} },
  { utterance: "bas karo", commandId: "cancel", params: {} },
  { utterance: "stop", commandId: "cancel", params: {} },
  { utterance: "ruk jao", commandId: "cancel", params: {} },
  { utterance: "रुको", commandId: "cancel", params: {} },
  { utterance: "कैंसिल करो", commandId: "cancel", params: {} },
  { utterance: "बस करो", commandId: "cancel", params: {} },
  { utterance: "Cancel करो", commandId: "cancel", params: {} },
  { utterance: "Ruk jao", commandId: "cancel", params: {} },
];

test("positive table-driven: at least 150 utterances across all 21 commands pass cleanly", () => {
  assert.ok(
    POSITIVE_TEST_CASES.length >= 150,
    `Must contain at least 150 positive test cases (got ${POSITIVE_TEST_CASES.length})`
  );

  const fuzzyMatches = [];

  for (const tc of POSITIVE_TEST_CASES) {
    const result = parseCommand(tc.utterance);

    assert.equal(
      result.blocked,
      undefined,
      `Utterance should not be blocked: "${tc.utterance}" (got reason: ${result.reason})`
    );

    assert.equal(
      result.unknown,
      undefined,
      `Utterance should not be unknown: "${tc.utterance}" (got: ${JSON.stringify(result)})`
    );

    assert.equal(
      result.commandId,
      tc.commandId,
      `Expected commandId "${tc.commandId}" for "${tc.utterance}", got "${result.commandId}"`
    );

    assert.deepEqual(
      result.params,
      tc.params,
      `Expected params ${JSON.stringify(tc.params)} for "${tc.utterance}", got ${JSON.stringify(result.params)}`
    );

    assert.ok(
      result.confidence >= 0.70,
      `Confidence must be >= 0.70 for "${tc.utterance}" (got ${result.confidence})`
    );

    if (result.confidence < 1.0) {
      fuzzyMatches.push({
        utterance: tc.utterance,
        commandId: result.commandId,
        confidence: result.confidence,
      });
    }
  }

  // Verify that all 21 commands are represented in test cases
  const testedCommandIds = new Set(POSITIVE_TEST_CASES.map((c) => c.commandId));
  assert.equal(
    testedCommandIds.size,
    21,
    `All 21 commands must be tested (tested ${testedCommandIds.size})`
  );
});

module.exports = {
  POSITIVE_TEST_CASES,
};
