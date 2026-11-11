const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createWavHeader } = require("../../../src/helpers/gnani/wav-utils");
const { splitWav, joinTranscripts, cleanWord } = require("../../../src/helpers/gnani/chunker");

/**
 * Helper to generate synthetic WAV with tone and silent sections.
 */
function createWavWithSilence(totalSec = 60.0, silenceStartSec = 24.0, silenceDurationSec = 1.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(totalSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);

  const silenceStartSample = Math.floor(silenceStartSec * sampleRate);
  const silenceEndSample = silenceStartSample + Math.floor(silenceDurationSec * sampleRate);

  for (let i = 0; i < numSamples; i++) {
    if (i >= silenceStartSample && i < silenceEndSample) {
      // Digital silence
      pcm.writeInt16LE(0, i * 2);
    } else {
      // 440 Hz tone (audible speech energy)
      const t = i / sampleRate;
      const sample = Math.floor(Math.sin(2 * Math.PI * 440 * t) * 12000);
      pcm.writeInt16LE(sample, i * 2);
    }
  }

  return Buffer.concat([header, pcm]);
}

/**
 * Helper to generate continuous tone with NO quiet points anywhere.
 */
function createContinuousToneWav(totalSec = 60.0) {
  const sampleRate = 16000;
  const numSamples = Math.floor(totalSec * sampleRate);
  const dataSize = numSamples * 2;
  const header = createWavHeader(dataSize, sampleRate, 1, 16);
  const pcm = Buffer.alloc(dataSize);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.floor(Math.sin(2 * Math.PI * 440 * t) * 12000);
    pcm.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcm]);
}

describe("chunker", () => {
  describe("splitWav", () => {
    test("does not split audio clips <= 28 seconds", () => {
      const wav25s = createContinuousToneWav(25.0);
      const chunks = splitWav(wav25s);

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].start, 0);
      assert.equal(chunks[0].duration, 25.0);
      assert.equal(chunks[0].isHardCut, false);
    });

    test("splits at quietest 20 ms RMS frame in the 20-28s window", () => {
      // Silence placed at 24.5s for 0.5s
      const wav35s = createWavWithSilence(35.0, 24.5, 0.5);
      const chunks = splitWav(wav35s);

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, false);
      // Cut point should be near silence at 24.5s - 25.0s
      assert.ok(
        chunks[0].end >= 24.4 && chunks[0].end <= 25.1,
        `Expected cut point around 24.5s, got ${chunks[0].end}`
      );
      assert.equal(chunks[1].start, chunks[0].end); // no overlap on natural quiet cut
    });

    test("hard cuts at 28s with 0.3s overlap when there is no quiet point", () => {
      const wav35s = createContinuousToneWav(35.0);
      const chunks = splitWav(wav35s);

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, true);
      assert.equal(chunks[0].duration, 28.0);
      assert.equal(chunks[0].end, 28.0);

      // Second chunk starts with 0.3s overlap: 28.0 - 0.3 = 27.7
      assert.ok(
        Math.abs(chunks[1].start - 27.7) < 0.05,
        `Expected overlap start around 27.7, got ${chunks[1].start}`
      );
    });

    test("does not split at 27.0 seconds (below 28s threshold)", () => {
      const wav27s = createContinuousToneWav(27.0);
      const chunks = splitWav(wav27s);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].duration, 27.0);
      assert.equal(chunks[0].isHardCut, false);
    });

    test("does not split at exactly 28.0 seconds (inclusive threshold)", () => {
      const wav28s = createContinuousToneWav(28.0);
      const chunks = splitWav(wav28s);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].duration, 28.0);
      assert.equal(chunks[0].isHardCut, false);
    });

    test("splits at 28.001 seconds continuous audio using 28s hard cut with 0.3s overlap", () => {
      const wav28_001 = createContinuousToneWav(28.001);
      const chunks = splitWav(wav28_001);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, true);
      assert.equal(chunks[0].duration, 28.0);
      assert.ok(Math.abs(chunks[1].start - 27.7) < 0.05, `Expected start ~27.7, got ${chunks[1].start}`);
    });

    test("splits at 28.001 seconds silence-containing audio at quiet point without overlap", () => {
      const wav28_001_silence = createWavWithSilence(28.001, 24.5, 0.5);
      const chunks = splitWav(wav28_001_silence);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, false);
      assert.ok(chunks[0].end >= 24.4 && chunks[0].end <= 25.1);
      assert.equal(chunks[1].start, chunks[0].end);
    });

    test("splits at 31.0 seconds continuous audio using 28s hard cut with 0.3s overlap", () => {
      const wav31 = createContinuousToneWav(31.0);
      const chunks = splitWav(wav31);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, true);
      assert.equal(chunks[0].duration, 28.0);
      assert.ok(Math.abs(chunks[1].start - 27.7) < 0.05);
    });

    test("splits at 31.0 seconds silence-containing audio at natural quiet point", () => {
      const wav31_silence = createWavWithSilence(31.0, 24.0, 0.6);
      const chunks = splitWav(wav31_silence);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].isHardCut, false);
      assert.equal(chunks[1].start, chunks[0].end);
    });
  });

  describe("boundaryDedupe (cleanWord and joinTranscripts)", () => {
    test("cleanWord normalizes casing and punctuation", () => {
      assert.equal(cleanWord("Hello,"), "hello");
      assert.equal(cleanWord("नमस्ते।"), "नमस्ते");
      assert.equal(cleanWord('"deploy!"'), "deploy");
      assert.equal(cleanWord("(API)"), "api");
      assert.equal(cleanWord(""), "");
    });

    test("joins cleanly when no words overlap at chunk boundaries", () => {
      const chunk1 = "आज हम नया फीचर बनाएंगे";
      const chunk2 = "और उसके बाद टेस्ट करेंगे";
      assert.equal(
        joinTranscripts([chunk1, chunk2]),
        "आज हम नया फीचर बनाएंगे और उसके बाद टेस्ट करेंगे"
      );
    });

    test("deduplicates single overlapping word at boundary", () => {
      const chunk1 = "हम इस प्रोजेक्ट को डिप्लॉय करेंगे";
      const chunk2 = "करेंगे और फिर टेस्टिंग शुरू होगी";
      assert.equal(
        joinTranscripts([chunk1, chunk2]),
        "हम इस प्रोजेक्ट को डिप्लॉय करेंगे और फिर टेस्टिंग शुरू होगी"
      );
    });

    test("deduplicates multiple overlapping words across punctuation differences", () => {
      const chunk1 = "Please review the pull request,";
      const chunk2 = "pull request and let me know.";
      assert.equal(
        joinTranscripts([chunk1, chunk2]),
        "Please review the pull request, and let me know."
      );
    });

    test("preserves repeated boundary words across a silence cut (never drops words)", () => {
      // Across a silence cut, words repeated by the speaker must never be dropped
      const transcripts = ["please repeat", "repeat that"];
      assert.equal(
        joinTranscripts(transcripts, { isHardCut: false }),
        "please repeat repeat that"
      );
      assert.equal(
        joinTranscripts(transcripts, { chunks: [{ isHardCut: false }] }),
        "please repeat repeat that"
      );
    });

    test("deduplicates repeated boundary words across a hard cut with audio overlap", () => {
      const transcripts = ["please repeat", "repeat that"];
      assert.equal(
        joinTranscripts(transcripts, { isHardCut: true }),
        "please repeat that"
      );
      assert.equal(
        joinTranscripts(transcripts, { chunks: [{ isHardCut: true }] }),
        "please repeat that"
      );
    });

    test("handles empty and single transcripts gracefully", () => {
      assert.equal(joinTranscripts([]), "");
      assert.equal(joinTranscripts(["Only one chunk"]), "Only one chunk");
      assert.equal(
        joinTranscripts(["First chunk", "", "   ", "Second chunk"]),
        "First chunk Second chunk"
      );
    });
  });
});
