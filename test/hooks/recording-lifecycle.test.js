const test = require("node:test"),
  assert = require("node:assert/strict"),
  React = require("react"),
  { createRoot } = require("react-dom/client");
const {
  createRendererServer,
  installBrowserGlobals,
  installHookDom,
} = require("../lib/rendererTestHarness");

async function setup(t) {
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  const events = new Map(),
    pastes = [],
    requests = [],
    toasts = [],
    errors = [];
  let cancelRegistered = false;
  const api = {
    registerCancelHotkey: async () => {
      cancelRegistered = true;
      return true;
    },
    unregisterCancelHotkey: async () => {
      cancelRegistered = false;
      return true;
    },
    cancelVoiceCommand: async () => true,
    gnaniCancel: async () => true,
    dictationLifecycleStateChanged() {},
    pasteText: async (value) => {
      pastes.push(value);
      return { pasted: true };
    },
    gnaniTranscribe: async (wav, options) => {
      requests.push({ wav, options });
      return { text: "synthetic dictated text" };
    },
    writeClipboard: async () => ({ success: true }),
  };
  for (const name of [
    "onToggleDictation",
    "onToggleCommand",
    "onStartDictation",
    "onStopDictation",
    "onPrepareDictation",
    "onCancelDictationPreparation",
    "onCancelDictation",
    "onCancelHotkeyPressed",
    "onDictationForceStopped",
  ])
    api[name] = (callback) => {
      events.set(name, callback);
      return () => events.delete(name);
    };
  installBrowserGlobals(t, { window: { electronAPI: api } });
  const container = installHookDom(t);
  const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    recorderBefore = globalThis.MediaRecorder;
  const tracks = [];
  const mediaDevices = {
    enumerateDevices: async () => [],
    getUserMedia: async () => {
      const track = {
        readyState: "live",
        stop() {
          this.readyState = "ended";
        },
      };
      tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices } });
  class Recorder {
    static instances = [];
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/webm";
      Recorder.instances.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["synthetic recorder data"]) });
      this.completion = Promise.resolve(this.onstop?.());
    }
  }
  globalThis.MediaRecorder = Recorder;
  t.after(() => {
    if (navigatorBefore) Object.defineProperty(globalThis, "navigator", navigatorBefore);
    else delete globalThis.navigator;
    globalThis.MediaRecorder = recorderBefore;
    delete globalThis.__releaseEncode;
  });
  const vite = await createRendererServer(t, {
    cachePrefix: "dhwaniflow-recording-",
    mockModules: {
      "/audio/wav-encoder":
        "export const wavFromBlob=(...args)=>globalThis.__releaseEncode(...args);",
    },
  });
  const { wavFromFloat32 } = await vite.ssrLoadModule("/audio/wav-encoder.js");
  globalThis.__releaseEncode = async () =>
    wavFromFloat32(
      Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * 0.3),
      16000
    );
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  useSettingsStore.setState({
    audioCuesEnabled: false,
    dataRetentionEnabled: false,
    micWarmHoldSeconds: 0,
    autoPasteEnabled: true,
    keepTranscriptionInClipboard: false,
  });
  const { useAudioRecording } = await vite.ssrLoadModule("/hooks/useAudioRecording.js");
  let recording;
  function Harness({ version }) {
    recording = useAudioRecording((value) => toasts.push(value), {
      onDictationError: (error) => errors.push(error),
      onShowTranscript() {},
    });
    return null;
  }
  root = createRoot(container);
  const render = async (version) =>
    React.act(async () => root.render(React.createElement(Harness, { version })));
  await render(0);
  return {
    api,
    mediaDevices,
    Recorder,
    tracks,
    pastes,
    requests,
    toasts,
    errors,
    events,
    render,
    get cancelRegistered() {
      return cancelRegistered;
    },
    get recording() {
      return recording;
    },
  };
}
test("actual React hook keeps the production manager and capture alive across rerenders", async (t) => {
  const x = await setup(t);
  await React.act(async () => {
    assert.equal(await x.recording.startRecording(), true);
  });
  const recorder = x.Recorder.instances[0];
  for (let i = 1; i <= 3; i++) await x.render(i);
  assert.equal(x.Recorder.instances.length, 1);
  assert.equal(recorder.state, "recording");
  assert.equal(x.recording.isRecording, true);
  await React.act(async () => {
    x.recording.stopRecording();
    await recorder.completion;
  });
  assert.equal(x.pastes.length, 1);
  assert.equal(x.pastes[0], "synthetic dictated text");
  assert.equal(x.recording.isProcessing, false);
  const bytes = new DataView(x.requests[0].wav);
  assert.equal(bytes.getUint32(24, true), 16000);
  assert.equal(bytes.getUint16(22, true), 1);
  assert.equal(bytes.getUint16(34, true), 16);
  assert.equal(x.requests[0].options.format, "transcribe");
  assert.equal(x.tracks[0].readyState, "ended");
});
test("permission denial clears preparing and produces an actual error presentation", async (t) => {
  const x = await setup(t);
  x.mediaDevices.getUserMedia = async () => {
    throw new DOMException("Synthetic denial", "NotAllowedError");
  };
  await React.act(async () => {
    assert.equal(await x.recording.startRecording(), false);
  });
  assert.equal(x.recording.isPreparing, false);
  assert.equal(x.recording.isRecording, false);
  assert.equal(x.toasts.at(-1).presentation, "dictation-error");
  assert.match(x.toasts.at(-1).title, /permission denied/i);
});
test("cancel during upload prevents a late transcript from pasting", async (t) => {
  const x = await setup(t);
  let finish;
  x.api.gnaniTranscribe = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await React.act(async () => {
    await x.recording.startRecording();
  });
  const recorder = x.Recorder.instances[0];
  await React.act(async () => {
    x.recording.stopRecording();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(typeof finish, "function");
  assert.equal(x.cancelRegistered, true, "Escape remains registered throughout the upload");
  await React.act(async () => {
    x.recording.cancelProcessing();
    finish({ text: "late text" });
    await recorder.completion;
  });
  assert.equal(x.pastes.length, 0);
  assert.equal(x.recording.isProcessing, false);
});
