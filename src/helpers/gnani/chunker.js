/**
 * chunker.js
 *
 * Splits audio recordings longer than 28 seconds into sequential sub-30s chunks
 * suitable for Gnani STT API limits, using plain JS RMS frame analysis.
 *
 * Rules:
 * - Clips <= 28 s: single chunk (no split).
 * - Clips > 28 s: evaluate 20 ms RMS frames in the [20s, 28s] window.
 * - If a quiet frame is found (RMS <= silenceThreshold), split at the quietest frame (no overlap).
 * - If no quiet point is found, hard cut at 28 s with 0.3 s overlap.
 * - Merges chunk transcripts with boundary word de-duplication.
 */

const { validateWavHeader, sliceWav } = require("./wav-utils");

const DEFAULT_MAX_CHUNK_SEC = 28.0;
const DEFAULT_WINDOW_MIN_SEC = 20.0;
const DEFAULT_WINDOW_MAX_SEC = 28.0;
const DEFAULT_HARD_CUT_OVERLAP_SEC = 0.3;
const DEFAULT_FRAME_MS = 20; // 20 ms RMS frame
const DEFAULT_SILENCE_RMS_THRESHOLD = 0.03; // ~ -30.5 dB

/**
 * Computes RMS energy of a frame of 16-bit PCM samples.
 *
 * @param {Buffer} buffer - Audio buffer containing 16-bit PCM data
 * @param {number} byteOffset - Start byte offset in buffer
 * @param {number} numSamples - Number of samples in frame (e.g. 320 for 20ms at 16kHz)
 * @returns {number} RMS normalized to [0, 1]
 */
function computeRms(buffer, byteOffset, numSamples) {
  let sumSquares = 0;
  let count = 0;

  for (let i = 0; i < numSamples; i++) {
    const pos = byteOffset + i * 2;
    if (pos + 2 > buffer.length) break;
    const sample = buffer.readInt16LE(pos) / 32768.0;
    sumSquares += sample * sample;
    count++;
  }

  if (count === 0) return 0;
  return Math.sqrt(sumSquares / count);
}

/**
 * Splits a 16 kHz 16-bit mono WAV buffer longer than 28 s into chunks.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} wavBuffer
 * @param {object} [options]
 * @param {number} [options.maxChunkSec=28.0]
 * @param {number} [options.windowMinSec=20.0]
 * @param {number} [options.windowMaxSec=28.0]
 * @param {number} [options.hardCutOverlapSec=0.3]
 * @param {number} [options.frameMs=20]
 * @param {number} [options.silenceThresholdRms=0.03]
 * @returns {Array<{ buffer: Buffer, start: number, end: number, duration: number, isHardCut: boolean }>}
 */
function splitWav(wavBuffer, options = {}) {
  const {
    maxChunkSec = DEFAULT_MAX_CHUNK_SEC,
    windowMinSec = DEFAULT_WINDOW_MIN_SEC,
    windowMaxSec = DEFAULT_WINDOW_MAX_SEC,
    hardCutOverlapSec = DEFAULT_HARD_CUT_OVERLAP_SEC,
    frameMs = DEFAULT_FRAME_MS,
    silenceThresholdRms = DEFAULT_SILENCE_RMS_THRESHOLD,
  } = options;

  const meta = validateWavHeader(wavBuffer);
  const buffer = Buffer.isBuffer(wavBuffer)
    ? wavBuffer
    : ArrayBuffer.isView(wavBuffer)
      ? Buffer.from(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength)
      : Buffer.from(wavBuffer);

  const totalDuration = meta.durationSeconds;

  // Single chunk if within duration limit
  if (totalDuration <= maxChunkSec) {
    return [
      {
        buffer: Buffer.from(buffer),
        start: 0,
        end: totalDuration,
        duration: totalDuration,
        isHardCut: false,
      },
    ];
  }

  const sampleRate = 16000;
  const bytesPerSec = 32000;
  const frameSamples = Math.floor((sampleRate * frameMs) / 1000); // 320 samples for 20 ms
  const frameBytes = frameSamples * 2;

  const chunks = [];
  let currentStart = 0.0;

  while (currentStart < totalDuration) {
    const remaining = totalDuration - currentStart;

    if (remaining <= maxChunkSec) {
      const chunkBuf = sliceWav(buffer, currentStart, totalDuration);
      chunks.push({
        buffer: chunkBuf,
        start: parseFloat(currentStart.toFixed(4)),
        end: parseFloat(totalDuration.toFixed(4)),
        duration: parseFloat((totalDuration - currentStart).toFixed(4)),
        isHardCut: false,
      });
      break;
    }

    // Inspect window [currentStart + windowMinSec, currentStart + windowMaxSec]
    const searchStartSec = currentStart + windowMinSec;
    const searchEndSec = Math.min(totalDuration, currentStart + windowMaxSec);

    let quietestRms = Infinity;
    let quietestSec = searchEndSec;

    // Slide in 20 ms steps through the 20s-28s window
    const startByte = meta.dataOffset + Math.floor(searchStartSec * bytesPerSec);
    const endByte = meta.dataOffset + Math.floor(searchEndSec * bytesPerSec);

    for (let bytePos = startByte; bytePos + frameBytes <= endByte; bytePos += frameBytes) {
      const rms = computeRms(buffer, bytePos, frameSamples);
      if (rms < quietestRms) {
        quietestRms = rms;
        const sampleOffset = (bytePos - meta.dataOffset) / 2;
        // Center of the quiet 20 ms frame
        quietestSec = (sampleOffset + frameSamples / 2) / sampleRate;
      }
    }

    const hasQuietPoint = quietestRms <= silenceThresholdRms;

    if (hasQuietPoint) {
      const cutPoint = Math.min(totalDuration, quietestSec);
      const chunkBuf = sliceWav(buffer, currentStart, cutPoint);
      chunks.push({
        buffer: chunkBuf,
        start: parseFloat(currentStart.toFixed(4)),
        end: parseFloat(cutPoint.toFixed(4)),
        duration: parseFloat((cutPoint - currentStart).toFixed(4)),
        isHardCut: false,
      });

      // Advance without overlap at natural quiet point
      currentStart = cutPoint;
    } else {
      // Hard cut at 28 s with 0.3 s overlap
      const cutPoint = Math.min(totalDuration, currentStart + windowMaxSec);
      const chunkBuf = sliceWav(buffer, currentStart, cutPoint);
      chunks.push({
        buffer: chunkBuf,
        start: parseFloat(currentStart.toFixed(4)),
        end: parseFloat(cutPoint.toFixed(4)),
        duration: parseFloat((cutPoint - currentStart).toFixed(4)),
        isHardCut: true,
      });

      // Next chunk overlaps by 0.3s
      currentStart = Math.max(0, cutPoint - hardCutOverlapSec);
    }
  }

  return chunks;
}

/**
 * Normalizes a word for comparison (lowercases and strips punctuation).
 *
 * @param {string} w
 * @returns {string}
 */
function cleanWord(w) {
  if (!w || typeof w !== "string") return "";
  return w.toLowerCase().replace(/^[\s.,!?;:।'"“”‘’()[\]{}]+|[\s.,!?;:।'"“”‘’()[\]{}]+$/g, "");
}

/**
 * Joins an array of sequential chunk transcripts.
 * Repeated boundary words are deduplicated ONLY at hard-cut boundaries
 * (where audio overlap exists, i.e. isHardCut === true).
 * Silence cuts (isHardCut === false) have no audio overlap and must NEVER drop words.
 *
 * @param {string[]} transcripts - Array of transcript strings from sequential chunks
 * @param {number|object} [options] - Options object or maxOverlapWords number
 * @param {number} [options.maxOverlapWords=4] - Maximum words to inspect for boundary overlap
 * @param {Array<{ isHardCut: boolean }>} [options.chunks] - Chunk metadata from splitWav
 * @param {boolean} [options.isHardCut] - Explicit hard cut flag for all boundaries
 * @returns {string}
 */
function joinTranscripts(transcripts, options = {}) {
  if (!transcripts || transcripts.length === 0) return "";
  const valid = transcripts.map((t) => (t || "").trim());

  const maxOverlapWords = typeof options === "number" ? options : (options?.maxOverlapWords ?? 4);
  const chunks = Array.isArray(options) ? options : (options?.chunks ?? null);
  const explicitHardCut =
    typeof options === "object" && options !== null && typeof options.isHardCut === "boolean"
      ? options.isHardCut
      : null;

  let result = valid[0];

  for (let i = 1; i < valid.length; i++) {
    const nextText = valid[i];
    if (!nextText) continue;
    if (!result) {
      result = nextText;
      continue;
    }

    // Determine if this boundary was a hard cut (with audio overlap)
    let isHardCut = true;
    if (explicitHardCut !== null) {
      isHardCut = explicitHardCut;
    } else if (chunks && chunks[i - 1] && valid[i - 1]) {
      isHardCut = Boolean(chunks[i - 1].isHardCut);
    } else if (chunks) {
      isHardCut = false;
    }

    // Silence cuts must NEVER drop words — only hard cuts with overlap get deduplicated
    if (!isHardCut) {
      result += " " + nextText;
      continue;
    }

    const prevWords = result.split(/\s+/);
    const nextWords = nextText.split(/\s+/);

    let overlapFound = 0;
    const maxCheck = Math.min(prevWords.length, nextWords.length, maxOverlapWords);

    // Look for largest matching word sequence from maxCheck down to 1
    for (let k = maxCheck; k >= 1; k--) {
      const prevSlice = prevWords.slice(-k).map(cleanWord);
      const nextSlice = nextWords.slice(0, k).map(cleanWord);

      let matches = true;
      for (let j = 0; j < k; j++) {
        if (!prevSlice[j] || !nextSlice[j] || prevSlice[j] !== nextSlice[j]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        overlapFound = k;
        break;
      }
    }

    if (overlapFound > 0) {
      const remainingNextWords = nextWords.slice(overlapFound);
      if (remainingNextWords.length > 0) {
        result += " " + remainingNextWords.join(" ");
      }
    } else {
      result += " " + nextText;
    }
  }

  return result.replace(/\s+/g, " ").trim();
}

module.exports = {
  splitWav,
  cleanWord,
  joinTranscripts,
  computeRms,
  DEFAULT_MAX_CHUNK_SEC,
  DEFAULT_WINDOW_MIN_SEC,
  DEFAULT_WINDOW_MAX_SEC,
  DEFAULT_HARD_CUT_OVERLAP_SEC,
  DEFAULT_FRAME_MS,
  DEFAULT_SILENCE_RMS_THRESHOLD,
};
