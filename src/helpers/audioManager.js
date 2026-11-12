import { wavFromBlob } from "../audio/wav-encoder";
import { getSettings, useSettingsStore } from "../stores/settingsStore";
import { resolvePreferredMicrophone } from "./microphoneSelection";
import { MicStreamHold } from "./micStreamHold";

const MAX_RECORDING_MS = 120000;
const MAX_RECORDING_BYTES = 8 * 1024 * 1024;

function classifyError(error) {
  const message = String(error?.message || "");
  if (error?.name === "NotAllowedError")
    return {
      code: "MICROPHONE_DENIED",
      title: "Microphone permission denied",
      description: "Allow microphone access in Windows Settings and try again.",
    };
  if (error?.name === "NotFoundError")
    return {
      code: "MICROPHONE_MISSING",
      title: "Microphone unavailable",
      description: "Connect the selected microphone or choose another input.",
    };
  if (/GnaniAuthError|BAD_KEY|401|unauthorized/i.test(message))
    return {
      code: "BAD_KEY",
      title: "Invalid API Key",
      description: "Check your Gnani API key in Settings.",
    };
  if (/NoKey|NO_KEY|not configured/i.test(message))
    return {
      code: "NO_KEY",
      title: "No API Key",
      description: "Save your Gnani API key in Settings.",
    };
  if (/RateLimit|rate.limit|429/i.test(message))
    return {
      code: "RATE_LIMITED",
      title: "Provider Rate Limited",
      description: "Wait a moment before trying again.",
    };
  if (/Offline|network|connection/i.test(message))
    return {
      code: "OFFLINE",
      title: "Connection unavailable",
      description: "Check your internet connection and try again.",
    };
  if (/timeout|timed out/i.test(message))
    return {
      code: "TIMEOUT",
      title: "Transcription timed out",
      description: "The speech service did not finish in time. Try again.",
    };
  return {
    code: "TRANSCRIPTION_FAILED",
    title: "Transcription Error",
    description: "The recording could not be transcribed. Try again.",
  };
}

export default class AudioManager {
  constructor({
    mediaDevices = navigator.mediaDevices,
    Recorder = MediaRecorder,
    encode = wavFromBlob,
    preferences = getSettings,
    api = window.electronAPI,
  } = {}) {
    this.mediaDevices = mediaDevices;
    this.Recorder = Recorder;
    this.encode = encode;
    this.preferences = preferences;
    this.api = api;
    this.generation = 0;
    this.isRecording = false;
    this.isProcessing = false;
    this.isPreparing = false;
    this.disposed = false;
    this.isCommandMode = false;
    this.chunks = [];
    this.hold = new MicStreamHold({
      isBusy: () => this.isRecording || this.isPreparing,
      onHoldChange: () => this._emit(),
    });
    this.unsubscribe = useSettingsStore.subscribe(() =>
      this.hold.setHoldSeconds(this.preferences().micWarmHoldSeconds)
    );
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }
  setCommandMode(enabled) {
    this.isCommandMode = Boolean(enabled);
  }
  getState() {
    return {
      isRecording: this.isRecording,
      isProcessing: this.isProcessing,
      isPreparing: this.isPreparing,
      micCaptureStatus:
        this.isRecording || this.isPreparing || this.hold.active ? "active" : "inactive",
    };
  }
  _emit() {
    if (!this.disposed) this.callbacks?.onStateChange?.(this.getState());
  }
  _error(error) {
    if (!this.disposed) this.callbacks?.onError?.(classifyError(error));
  }

  async _acquireStream() {
    const generation = this.generation;
    const settings = this.preferences();
    this.hold.setHoldSeconds(settings.micWarmHoldSeconds);
    const selection = await resolvePreferredMicrophone({
      settings,
      mediaDevices: this.mediaDevices,
    });
    if (selection.mode === "specific" && !selection.device)
      throw new DOMException("Selected microphone unavailable", "NotFoundError");
    const deviceId = selection.device?.deviceId;
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {}),
      },
    };
    const key = JSON.stringify(constraints);
    const held = this.hold.acquireClone(key);
    if (held) return held;
    const stream = await this.mediaDevices.getUserMedia(constraints);
    if (this.disposed || generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    return this.hold.adoptAndClone(stream, key);
  }

  prepareMicCapture() {
    if (this.disposed || this.isRecording || this.isProcessing) return Promise.resolve(null);
    if (!this.prepared) {
      const generation = this.generation;
      this.prepared = this._acquireStream().then((stream) => {
        if (generation !== this.generation || this.disposed) {
          stream?.getTracks().forEach((track) => track.stop());
          return null;
        }
        return stream;
      });
      this.prepared.catch(() => {});
    }
    return this.prepared;
  }

  cancelPreparedMicCapture() {
    if (this.isRecording) return;
    this.generation++;
    this.prepared
      ?.then((stream) => stream?.getTracks().forEach((track) => track.stop()))
      .catch(() => {});
    this.prepared = null;
    this.hold.drop();
    this.isPreparing = false;
    this._emit();
  }

  async startRecording() {
    if (this.startPromise || this.isRecording || this.isProcessing || this.disposed) return false;
    const generation = this.generation;
    this.stopRequested = false;
    this.isPreparing = true;
    this._emit();
    const start = async () => {
      try {
        const stream = await (this.prepared || this._acquireStream());
        this.prepared = null;
        if (!stream || generation !== this.generation || this.disposed) {
          stream?.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.stream = stream;
        this.chunks = [];
        this.recordedBytes = 0;
        const recorder = new this.Recorder(stream);
        this.mediaRecorder = recorder;
        this._startMeter(stream);
        recorder.ondataavailable = (event) => {
          if (generation !== this.generation || !event.data?.size) return;
          this.recordedBytes += event.data.size;
          if (this.recordedBytes > MAX_RECORDING_BYTES) {
            this.cancelRecording();
            this.callbacks?.onError?.({
              code: "RECORDING_LIMIT",
              title: "Recording limit reached",
              description: "Recordings are limited to two minutes and 8 MB.",
            });
            return;
          }
          this.chunks.push(event.data);
        };
        recorder.onerror = (event) => {
          this.cancelRecording();
          this._error(event.error);
        };
        recorder.onstop = async () => {
          if (generation !== this.generation) return;
          const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
          this.chunks = [];
          this.isRecording = false;
          this._releaseStream();
          await this.processAudio(blob, generation);
        };
        recorder.start(250);
        this.startedAt = performance.now();
        this.isPreparing = false;
        this.isRecording = true;
        this.limitTimer = setTimeout(() => this.stopRecording(), MAX_RECORDING_MS);
        this._emit();
        if (this.stopRequested) this.stopRecording();
        return true;
      } catch (error) {
        if (generation === this.generation) {
          this._releaseStream();
          this.isPreparing = false;
          this._error(error);
          this._emit();
        }
        return false;
      }
    };
    this.startPromise = start();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  stopRecording() {
    if (!this.stopRequested) this.releasedAt = performance.now();
    if (this.isPreparing) {
      this.stopRequested = true;
      return true;
    }
    if (!this.isRecording || this.mediaRecorder?.state !== "recording") return false;
    this.isRecording = false;
    this.isProcessing = true;
    clearTimeout(this.limitTimer);
    this.mediaRecorder.stop();
    this._emit();
    return true;
  }

  async processAudio(blob, generation = this.generation) {
    this.isProcessing = true;
    this._emit();
    try {
      if (!blob.size) {
        this.callbacks?.onNoAudio?.();
        return;
      }
      const wav = await this.encode(blob);
      if (generation !== this.generation || this.disposed) return;
      if (wav.byteLength > 16000 * 2 * 121 + 44) throw new Error("Recording exceeds capture limit");
      const samples = new Int16Array(wav, 44);
      if (!samples.some((sample) => sample !== 0)) {
        this.callbacks?.onNoAudio?.();
        return;
      }
      const requestId = "dictation_" + crypto.randomUUID();
      this.requestId = requestId;
      const settings = this.preferences();
      const terms = this.isCommandMode ? await this.api.getCommandKeyterms() : undefined;
      const result = await this.api.gnaniTranscribe(wav, {
        requestId,
        language: settings.gnaniLanguage,
        format: "transcribe",
        ...(terms?.length ? { keyterms: terms } : {}),
      });
      if (generation !== this.generation || this.disposed) return;
      const text = result.text || result.transcript || "";
      if (!text.trim()) {
        this.callbacks?.onNoAudio?.();
        return;
      }
      await this.callbacks?.onTranscriptionComplete?.({
        text,
        rawText: text,
        commandMode: this.isCommandMode,
        releasedAt: this.releasedAt,
      });
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      const failure = classifyError(error);
      if (this.preferences().dataRetentionEnabled) {
        try {
          await this.api.saveTranscription("", null, {
            status: "failed",
            errorMessage: failure.description,
            errorCode: failure.code,
          });
        } catch {
          /* Report original recording failure below. */
        }
      }
      this.callbacks?.onError?.(failure);
    } finally {
      if (generation === this.generation) {
        this.requestId = null;
        this.isProcessing = false;
        this.isRecording = false;
        this._emit();
      }
    }
  }

  cancelProcessing() {
    this.generation++;
    const requestId = this.requestId;
    this.requestId = null;
    if (requestId) this.api.gnaniCancel(requestId).catch(() => {});
    this.isProcessing = false;
    this._emit();
    return true;
  }

  cancelRecording() {
    this.cancelProcessing();
    this.prepared
      ?.then((stream) => stream?.getTracks().forEach((track) => track.stop()))
      .catch(() => {});
    this.prepared = null;
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.isPreparing = false;
    this.isRecording = false;
    this.chunks = [];
    this._releaseStream();
    this.hold.drop();
    this._emit();
    return true;
  }

  _startMeter(stream) {
    try {
      this.meterContext = new AudioContext();
      this.analyser = this.meterContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.meterSource = this.meterContext.createMediaStreamSource(stream);
      this.meterSource.connect(this.analyser);
      this.meterSamples = new Uint8Array(256);
    } catch {
      /* Metering is optional; recording still reports actual capture errors. */
    }
  }

  getRecordingAudioLevel() {
    if (!this.isRecording || !this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.meterSamples);
    const sum = this.meterSamples.reduce((total, sample) => total + ((sample - 128) / 128) ** 2, 0);
    return Math.min(1, Math.sqrt(sum / this.meterSamples.length) * 4);
  }

  _releaseStream() {
    clearTimeout(this.limitTimer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.meterSource?.disconnect();
    this.meterContext?.close().catch(() => {});
    this.meterContext = null;
    this.analyser = null;
    this.hold.touch();
  }

  cleanup() {
    this.disposed = true;
    this.cancelRecording();
    this.unsubscribe?.();
    this.callbacks = null;
  }
}
