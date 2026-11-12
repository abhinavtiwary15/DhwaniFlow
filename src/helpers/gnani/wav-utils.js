/**
 * wav-utils.js
 *
 * WAV validation, header generation, slicing, and duration calculation
 * for 16 kHz 16-bit mono PCM audio (Gnani STT specification).
 */

class WavValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WavValidationError";
    this.code = "INVALID_WAV_HEADER";
    this.details = details;
  }
}

/**
 * Creates a valid 44-byte standard RIFF PCM WAV header.
 *
 * @param {number} dataLength - PCM payload size in bytes
 * @param {number} [sampleRate=16000] - Audio sample rate in Hz
 * @param {number} [numChannels=1] - Number of audio channels
 * @param {number} [bitsPerSample=16] - Bit depth
 * @returns {Buffer}
 */
function createWavHeader(dataLength, sampleRate = 16000, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");

  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Validates that a buffer is a valid 16 kHz 16-bit mono PCM WAV file.
 * Returns parsed header metadata or throws WavValidationError.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} inputBuffer
 * @returns {{ sampleRate: number, numChannels: number, bitsPerSample: number, dataOffset: number, dataSize: number, durationSeconds: number }}
 */
function validateWavHeader(inputBuffer) {
  if (!inputBuffer) {
    throw new WavValidationError("Missing WAV buffer");
  }

  const buffer = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : ArrayBuffer.isView(inputBuffer)
      ? Buffer.from(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength)
      : Buffer.from(inputBuffer);

  if (buffer.length < 44) {
    throw new WavValidationError("Buffer is too small to contain a valid WAV header", {
      bufferLength: buffer.length,
      minimumRequired: 44,
    });
  }

  const riff = buffer.toString("ascii", 0, 4);
  const riffSize = buffer.readUInt32LE(4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new WavValidationError("Not a valid RIFF/WAVE container", {
      riffMagic: riff,
      waveMagic: wave,
    });
  }

  if (riffSize + 8 !== buffer.length) {
    throw new WavValidationError(
      `Corrupted WAV container: declared RIFF size ${riffSize} exceeds buffer length ${buffer.length}`,
      { riffSize, bufferLength: buffer.length }
    );
  }

  let offset = 12;
  let fmtFound = false;
  let dataFound = false;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + chunkSize + (chunkSize % 2) > buffer.length)
      throw new WavValidationError("WAV chunk extends beyond container");

    if (chunkId === "fmt ") {
      if (fmtFound) throw new WavValidationError("Duplicate WAV format chunk");
      if (offset + 8 + chunkSize > buffer.length || chunkSize < 16) {
        throw new WavValidationError("Corrupted or incomplete fmt chunk");
      }
      fmtFound = true;
      audioFormat = buffer.readUInt16LE(offset + 8);
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16);
      blockAlign = buffer.readUInt16LE(offset + 20);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      if (dataFound) throw new WavValidationError("Duplicate WAV data chunk");
      dataFound = true;
      dataOffset = offset + 8;
      dataSize = chunkSize;
      if (dataOffset + dataSize > buffer.length) {
        throw new WavValidationError(
          `Corrupted data chunk: declared size ${dataSize} exceeds actual buffer length (available: ${buffer.length - dataOffset})`,
          { declaredSize: dataSize, availableBytes: buffer.length - dataOffset }
        );
      }
    }

    const paddedChunkSize = chunkSize + (chunkSize % 2);
    offset += 8 + paddedChunkSize;
  }

  if (!fmtFound) {
    throw new WavValidationError("Missing fmt chunk in WAV file");
  }

  if (audioFormat !== 1) {
    throw new WavValidationError(`Expected PCM format (1), got format ${audioFormat}`, {
      audioFormat,
    });
  }

  if (numChannels !== 1) {
    throw new WavValidationError(`Expected mono audio (1 channel), got ${numChannels} channels`, {
      numChannels,
    });
  }

  if (sampleRate !== 16000) {
    throw new WavValidationError(`Expected 16000 Hz sample rate, got ${sampleRate} Hz`, {
      sampleRate,
    });
  }

  if (bitsPerSample !== 16) {
    throw new WavValidationError(`Expected 16-bit audio, got ${bitsPerSample}-bit`, {
      bitsPerSample,
    });
  }

  const expectedByteRate = sampleRate * numChannels * (bitsPerSample / 8);
  if (byteRate !== expectedByteRate) {
    throw new WavValidationError(
      `Invalid byte rate ${byteRate}, expected ${expectedByteRate} for ${sampleRate}Hz ${bitsPerSample}-bit mono`,
      { byteRate, expectedByteRate }
    );
  }

  const expectedBlockAlign = numChannels * (bitsPerSample / 8);
  if (blockAlign !== expectedBlockAlign) {
    throw new WavValidationError(
      `Invalid block alignment ${blockAlign}, expected ${expectedBlockAlign}`,
      { blockAlign, expectedBlockAlign }
    );
  }

  if (!dataFound) {
    throw new WavValidationError("Missing data chunk in WAV file");
  }

  if (
    offset !== buffer.length ||
    dataSize % blockAlign !== 0 ||
    buffer.length < dataOffset + dataSize
  ) {
    throw new WavValidationError(
      `Corrupted data chunk: declared size ${dataSize} exceeds actual buffer length (available: ${buffer.length - dataOffset})`
    );
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const durationSeconds = parseFloat((dataSize / bytesPerSecond).toFixed(4));

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationSeconds,
  };
}

/**
 * Checks whether an audio buffer is already a valid 16 kHz 16-bit mono WAV.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {boolean}
 */
function isValid16kMonoWav(buffer) {
  try {
    validateWavHeader(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes duration in seconds of a 16 kHz 16-bit mono WAV buffer.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {number}
 */
function computeDuration(buffer) {
  const meta = validateWavHeader(buffer);
  return meta.durationSeconds;
}

/**
 * Slices a 16 kHz 16-bit mono WAV buffer between startSec and endSec.
 * Produces a newly allocated valid WAV Buffer.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} inputBuffer
 * @param {number} startSec
 * @param {number} endSec
 * @returns {Buffer}
 */
function sliceWav(inputBuffer, startSec, endSec) {
  const meta = validateWavHeader(inputBuffer);
  const buffer = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : ArrayBuffer.isView(inputBuffer)
      ? Buffer.from(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength)
      : Buffer.from(inputBuffer);

  const bytesPerSec = 32000; // 16000 * 1 * (16 / 8)
  const dataStart = meta.dataOffset;
  const maxPcmEnd = dataStart + meta.dataSize;

  const rawStart = dataStart + Math.floor(Math.max(0, startSec) * bytesPerSec);
  const rawEnd = Math.min(maxPcmEnd, dataStart + Math.floor(Math.max(0, endSec) * bytesPerSec));

  // Align to 2-byte sample boundary
  const alignedStart = rawStart - ((rawStart - dataStart) % 2);
  const alignedEnd = rawEnd - ((rawEnd - dataStart) % 2);

  if (alignedEnd <= alignedStart) {
    const emptyHeader = createWavHeader(0, 16000, 1, 16);
    return emptyHeader;
  }

  const pcmSlice = buffer.subarray(alignedStart, alignedEnd);
  const header = createWavHeader(pcmSlice.length, 16000, 1, 16);
  return Buffer.concat([header, pcmSlice]);
}

module.exports = {
  WavValidationError,
  createWavHeader,
  validateWavHeader,
  isValid16kMonoWav,
  computeDuration,
  sliceWav,
  sliceWavBuffer: sliceWav,
};
