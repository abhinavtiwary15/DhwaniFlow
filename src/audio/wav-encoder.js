/**
 * wav-encoder.js
 *
 * Audio encoding utilities for DhwaniFlow:
 * - wavFromFloat32: Pure function resampling audio samples to 16 kHz 16-bit mono WAV ArrayBuffer
 * - wavFromBlob: Async helper decoding recorded browser Blobs with AudioContext and mixing to mono
 */

const TARGET_SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/**
 * Pure function that resamples Float32 audio samples to 16 kHz 16-bit mono PCM
 * and returns a standard 44-byte WAV ArrayBuffer.
 *
 * @param {Float32Array|number[]} samples - Mono audio samples in [-1.0, 1.0]
 * @param {number} sampleRate - Original sample rate in Hz (e.g. 44100, 48000, 16000)
 * @returns {ArrayBuffer} Standard 44-byte WAV ArrayBuffer containing 16 kHz 16-bit mono PCM
 */
function wavFromFloat32(samples, sampleRate) {
  if (
    !samples ||
    typeof samples === "string" ||
    (!Array.isArray(samples) && !(samples instanceof Float32Array))
  ) {
    throw new TypeError("samples must be a Float32Array or array of numbers");
  }
  if (!sampleRate || typeof sampleRate !== "number" || sampleRate <= 0) {
    throw new TypeError("sampleRate must be a positive number");
  }

  let resampled;

  if (sampleRate === TARGET_SAMPLE_RATE) {
    resampled = samples;
  } else {
    // Linear interpolation resampling
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    const targetLength = Math.round(samples.length / ratio);
    resampled = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, samples.length - 1);
      const t = srcIdx - idx0;
      resampled[i] = samples[idx0] * (1 - t) + samples[idx1] * t;
    }
  }

  const numSamples = resampled.length;
  const pcmByteLength = numSamples * 2;
  const totalLength = 44 + pcmByteLength;
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // 1. RIFF Header
  view.setUint8(0, 0x52); // R
  view.setUint8(1, 0x49); // I
  view.setUint8(2, 0x46); // F
  view.setUint8(3, 0x46); // F
  view.setUint32(4, 36 + pcmByteLength, true); // fileSize - 8
  view.setUint8(8, 0x57);  // W
  view.setUint8(9, 0x41);  // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E

  // 2. 'fmt ' Sub-chunk
  view.setUint8(12, 0x66); // f
  view.setUint8(13, 0x6d); // m
  view.setUint8(14, 0x74); // t
  view.setUint8(15, 0x20); // ' '
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true);  // PCM format = 1
  view.setUint16(22, NUM_CHANNELS, true); // Mono = 1
  view.setUint32(24, TARGET_SAMPLE_RATE, true); // 16000 Hz
  const byteRate = TARGET_SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  view.setUint32(28, byteRate, true); // 32000 bytes/sec
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  view.setUint16(32, blockAlign, true); // 2 bytes
  view.setUint16(34, BITS_PER_SAMPLE, true); // 16-bit

  // 3. 'data' Sub-chunk
  view.setUint8(36, 0x64); // d
  view.setUint8(37, 0x61); // a
  view.setUint8(38, 0x74); // t
  view.setUint8(39, 0x61); // a
  view.setUint32(40, pcmByteLength, true);

  // 4. PCM Samples
  let byteOffset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1.0, Math.min(1.0, resampled[i]));
    const int16 = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7fff);
    view.setInt16(byteOffset, int16, true);
    byteOffset += 2;
  }

  return arrayBuffer;
}

/**
 * Checks whether an ArrayBuffer contains a standard 16 kHz 16-bit mono PCM WAV.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {boolean}
 */
function is16kMonoWavBuffer(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 44) return false;
  const v = new DataView(arrayBuffer);
  // RIFF ... WAVE
  if (
    v.getUint8(0) !== 0x52 ||
    v.getUint8(1) !== 0x49 ||
    v.getUint8(2) !== 0x46 ||
    v.getUint8(3) !== 0x46 ||
    v.getUint8(8) !== 0x57 ||
    v.getUint8(9) !== 0x41 ||
    v.getUint8(10) !== 0x56 ||
    v.getUint8(11) !== 0x45
  ) {
    return false;
  }
  // Check fmt chunk
  if (
    v.getUint8(12) === 0x66 &&
    v.getUint8(13) === 0x6d &&
    v.getUint8(14) === 0x74 &&
    v.getUint8(15) === 0x20
  ) {
    const audioFormat = v.getUint16(20, true);
    const numChannels = v.getUint16(22, true);
    const sampleRate = v.getUint32(24, true);
    const bitsPerSample = v.getUint16(34, true);
    if (audioFormat === 1 && numChannels === 1 && sampleRate === 16000 && bitsPerSample === 16) {
      return true;
    }
  }
  return false;
}

/**
 * Decodes a recorded audio Blob with AudioContext, mixes channels down to mono,
 * and converts to a 16 kHz 16-bit mono WAV ArrayBuffer.
 *
 * @param {Blob} blob - Audio blob recorded from MediaRecorder
 * @returns {Promise<ArrayBuffer>}
 */
async function wavFromBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    throw new TypeError("blob must be a Blob or File instance with arrayBuffer()");
  }

  const rawBuffer = await blob.arrayBuffer();
  if (is16kMonoWavBuffer(rawBuffer)) {
    return rawBuffer;
  }

  const AudioCtx = typeof window !== "undefined"
    ? (window.AudioContext || window.webkitAudioContext)
    : (globalThis.AudioContext || globalThis.webkitAudioContext);

  if (!AudioCtx) {
    throw new Error("AudioContext is not supported in this runtime environment");
  }

  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(rawBuffer);
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoSamples = new Float32Array(length);

    for (let c = 0; c < numChannels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        monoSamples[i] += channelData[i] / numChannels;
      }
    }

    return wavFromFloat32(monoSamples, audioBuffer.sampleRate);
  } finally {
    if (typeof ctx.close === "function") {
      await ctx.close();
    }
  }
}

export {
  wavFromFloat32,
  wavFromBlob,
  is16kMonoWavBuffer,
  TARGET_SAMPLE_RATE,
};

const m = typeof module !== "undefined" ? module : null;
if (m && m.exports) {
  m.exports = {
    wavFromFloat32,
    wavFromBlob,
    is16kMonoWavBuffer,
    TARGET_SAMPLE_RATE,
  };
}
