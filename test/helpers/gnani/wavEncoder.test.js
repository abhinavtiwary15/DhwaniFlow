const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { wavFromFloat32, TARGET_SAMPLE_RATE } = require("../../../src/audio/wav-encoder");
const { validateWavHeader, isValid16kMonoWav } = require("../../../src/helpers/gnani/wav-utils");

describe("wav-encoder", () => {
  describe("wavFromFloat32 (pure function)", () => {
    test("encodes Float32 samples at 16000 Hz into standard 44-byte 16 kHz mono WAV", () => {
      // 1.0 second of audio at 16000 Hz
      const numSamples = 16000;
      const floatSamples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        floatSamples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000);
      }

      const arrayBuffer = wavFromFloat32(floatSamples, 16000);
      assert.ok(arrayBuffer instanceof ArrayBuffer);
      assert.equal(arrayBuffer.byteLength, 44 + 16000 * 2);

      const nodeBuffer = Buffer.from(arrayBuffer);
      assert.equal(isValid16kMonoWav(nodeBuffer), true);

      const meta = validateWavHeader(nodeBuffer);
      assert.equal(meta.sampleRate, TARGET_SAMPLE_RATE);
      assert.equal(meta.numChannels, 1);
      assert.equal(meta.bitsPerSample, 16);
      assert.equal(meta.durationSeconds, 1.0);
    });

    test("resamples 44100 Hz Float32 audio to 16000 Hz", () => {
      // 1.0 second of 44.1 kHz audio
      const numSamples = 44100;
      const floatSamples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        floatSamples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
      }

      const arrayBuffer = wavFromFloat32(floatSamples, 44100);
      const nodeBuffer = Buffer.from(arrayBuffer);

      assert.equal(isValid16kMonoWav(nodeBuffer), true);
      const meta = validateWavHeader(nodeBuffer);
      assert.equal(meta.sampleRate, 16000);
      assert.equal(meta.numChannels, 1);
      // Duration should remain ~1.0 second
      assert.ok(
        Math.abs(meta.durationSeconds - 1.0) < 0.01,
        `Expected ~1.0s, got ${meta.durationSeconds}`
      );
    });

    test("resamples 48000 Hz Float32 audio to 16000 Hz", () => {
      // 0.5 seconds of 48 kHz audio (24000 samples)
      const numSamples = 24000;
      const floatSamples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        floatSamples[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
      }

      const arrayBuffer = wavFromFloat32(floatSamples, 48000);
      const nodeBuffer = Buffer.from(arrayBuffer);

      assert.equal(isValid16kMonoWav(nodeBuffer), true);
      const meta = validateWavHeader(nodeBuffer);
      assert.equal(meta.sampleRate, 16000);
      assert.ok(
        Math.abs(meta.durationSeconds - 0.5) < 0.01,
        `Expected ~0.5s, got ${meta.durationSeconds}`
      );
    });

    test("clamps out-of-range float values cleanly (-1.0 to 1.0)", () => {
      const floatSamples = new Float32Array([1.5, -2.0, 0.0]);
      const arrayBuffer = wavFromFloat32(floatSamples, 16000);
      const view = new DataView(arrayBuffer);

      // 44-byte header offset
      const sample0 = view.getInt16(44, true);
      const sample1 = view.getInt16(46, true);
      const sample2 = view.getInt16(48, true);

      assert.equal(sample0, 32767);  // clamped max
      assert.equal(sample1, -32768); // clamped min
      assert.equal(sample2, 0);
    });

    test("throws TypeError on invalid arguments", () => {
      assert.throws(() => wavFromFloat32(null, 16000), TypeError);
      assert.throws(() => wavFromFloat32(new Float32Array(10), 0), TypeError);
      assert.throws(() => wavFromFloat32(new Float32Array(10), -16000), TypeError);
      assert.throws(() => wavFromFloat32("not an array", 16000), TypeError);
    });
  });

  describe("is16kMonoWavBuffer", () => {
    const { is16kMonoWavBuffer } = require("../../../src/audio/wav-encoder");

    test("returns true for valid 16kHz mono WAV buffer", () => {
      const floatSamples = new Float32Array(1600);
      const arrayBuffer = wavFromFloat32(floatSamples, 16000);
      assert.equal(is16kMonoWavBuffer(arrayBuffer), true);
    });

    test("returns false for non-WAV or invalid buffers", () => {
      assert.equal(is16kMonoWavBuffer(null), false);
      assert.equal(is16kMonoWavBuffer(new ArrayBuffer(20)), false);
      assert.equal(is16kMonoWavBuffer(new ArrayBuffer(50)), false);
    });
  });

  describe("wavFromBlob", () => {
    const { wavFromBlob } = require("../../../src/audio/wav-encoder");

    test("throws TypeError when blob argument is missing or invalid", async () => {
      await assert.rejects(() => wavFromBlob(null), TypeError);
      await assert.rejects(() => wavFromBlob({}), TypeError);
    });

    test("fast-paths and returns buffer directly if already 16kHz mono WAV", async () => {
      const floatSamples = new Float32Array(1600);
      const arrayBuffer = wavFromFloat32(floatSamples, 16000);
      const mockBlob = {
        async arrayBuffer() {
          return arrayBuffer;
        },
      };

      const result = await wavFromBlob(mockBlob);
      assert.equal(result, arrayBuffer);
    });

    test("decodes and resamples via AudioContext when input is non-16k WAV", async () => {
      const origAudioContext = globalThis.AudioContext;
      try {
        globalThis.AudioContext = class MockAudioContext {
          async decodeAudioData(_buf) {
            return {
              sampleRate: 44100,
              numberOfChannels: 1,
              length: 4410,
              getChannelData(_c) {
                return new Float32Array(4410);
              },
            };
          }
          async close() {}
        };

        const mockBlob = {
          async arrayBuffer() {
            // Non-WAV arbitrary bytes
            return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
          },
        };

        const result = await wavFromBlob(mockBlob);
        assert.ok(result instanceof ArrayBuffer);
        const nodeBuffer = Buffer.from(result);
        assert.equal(isValid16kMonoWav(nodeBuffer), true);
      } finally {
        globalThis.AudioContext = origAudioContext;
      }
    });
  });
});
