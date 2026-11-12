const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  createWavHeader,
  validateWavHeader,
  isValid16kMonoWav,
  computeDuration,
  sliceWav,
  WavValidationError,
} = require("../../../src/helpers/gnani/wav-utils");

function createSyntheticWav(
  durationSec = 1.0,
  sampleRate = 16000,
  numChannels = 1,
  bitsPerSample = 16
) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const header = createWavHeader(dataSize, sampleRate, numChannels, bitsPerSample);
  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe("wav-utils", () => {
  describe("createWavHeader and validateWavHeader", () => {
    test("creates and validates standard 16 kHz 16-bit mono WAV header", () => {
      const dataSize = 32000 * 2; // 2 seconds
      const header = createWavHeader(dataSize, 16000, 1, 16);
      assert.equal(header.length, 44);

      const wav = Buffer.concat([header, Buffer.alloc(dataSize)]);
      const meta = validateWavHeader(wav);
      assert.equal(meta.sampleRate, 16000);
      assert.equal(meta.numChannels, 1);
      assert.equal(meta.bitsPerSample, 16);
      assert.equal(meta.durationSeconds, 2.0);
      assert.equal(isValid16kMonoWav(wav), true);
      assert.throws(() => validateWavHeader(header), WavValidationError);
    });

    test("rejects buffers smaller than 44 bytes", () => {
      assert.throws(
        () => validateWavHeader(Buffer.alloc(20)),
        (err) => err instanceof WavValidationError && err.code === "INVALID_WAV_HEADER"
      );
      assert.equal(isValid16kMonoWav(Buffer.alloc(20)), false);
    });

    test("rejects non-RIFF or non-WAVE container", () => {
      const corrupted = Buffer.alloc(44);
      corrupted.write("AIFF", 0);
      corrupted.write("NONE", 8);
      assert.throws(() => validateWavHeader(corrupted), /Not a valid RIFF\/WAVE container/);
    });

    test("rejects non-16kHz sample rate", () => {
      const wav44k = createSyntheticWav(1.0, 44100, 1, 16);
      assert.throws(() => validateWavHeader(wav44k), /Expected 16000 Hz sample rate/);
      assert.equal(isValid16kMonoWav(wav44k), false);
    });

    test("rejects stereo audio (channels = 2)", () => {
      const stereoWav = createSyntheticWav(1.0, 16000, 2, 16);
      assert.throws(() => validateWavHeader(stereoWav), /Expected mono audio/);
      assert.equal(isValid16kMonoWav(stereoWav), false);
    });

    test("rejects non-16bit bit depth (e.g. 24-bit)", () => {
      const wav24 = createSyntheticWav(1.0, 16000, 1, 24);
      assert.throws(() => validateWavHeader(wav24), /Expected 16-bit audio/);
    });

    test("rejects declared data size exceeding actual buffer bytes", () => {
      const header = createWavHeader(32000, 16000, 1, 16);
      const actualPcm = Buffer.alloc(2); // only 2 bytes instead of 32000
      const corrupted = Buffer.concat([header, actualPcm]);

      assert.throws(
        () => validateWavHeader(corrupted),
        /exceeds actual buffer length|Corrupted|WavValidationError/i
      );
      assert.throws(
        () => computeDuration(corrupted),
        /exceeds actual buffer length|Corrupted|WavValidationError/i
      );
    });

    test("validates byteRate and blockAlign against sampleRate and bit depth", () => {
      const header = createWavHeader(32000, 16000, 1, 16);
      header.writeUInt32LE(99999, 28); // corrupt byteRate
      const pcm = Buffer.alloc(32000);
      const badByteRate = Buffer.concat([header, pcm]);

      assert.throws(() => validateWavHeader(badByteRate), /byte rate|WavValidationError/i);
    });
  });

  describe("computeDuration", () => {
    test("computes exact duration for standard WAV buffers", () => {
      const wav1s = createSyntheticWav(1.0);
      const wav3s = createSyntheticWav(3.5);
      assert.equal(computeDuration(wav1s), 1.0);
      assert.equal(computeDuration(wav3s), 3.5);
    });

    test("rejects malformed containers rather than guessing a duration", () => {
      assert.throws(() => computeDuration(null), WavValidationError);
      assert.throws(() => computeDuration(Buffer.alloc(10)), WavValidationError);
    });
  });

  describe("sliceWav", () => {
    test("slices PCM data accurately and produces valid header", () => {
      const original = createSyntheticWav(5.0);
      const sliced = sliceWav(original, 1.0, 3.0);

      assert.ok(isValid16kMonoWav(sliced));
      const meta = validateWavHeader(sliced);
      assert.equal(meta.durationSeconds, 2.0);
      assert.equal(sliced.length, 44 + 32000 * 2);
    });

    test("clamps negative start time to 0 and end time to file duration", () => {
      const original = createSyntheticWav(3.0);
      const sliced = sliceWav(original, -1.0, 5.0);

      assert.ok(isValid16kMonoWav(sliced));
      const meta = validateWavHeader(sliced);
      assert.equal(meta.durationSeconds, 3.0);
    });

    test("returns empty PCM when start >= end", () => {
      const original = createSyntheticWav(3.0);
      const sliced = sliceWav(original, 2.5, 2.0);
      assert.ok(isValid16kMonoWav(sliced));
      const meta = validateWavHeader(sliced);
      assert.equal(meta.durationSeconds, 0);
    });
  });
});
