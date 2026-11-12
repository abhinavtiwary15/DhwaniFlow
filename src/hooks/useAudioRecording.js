import { useState, useEffect, useRef, useCallback } from "react";
import AudioManager from "../helpers/audioManager";
import { getSettings } from "../stores/settingsStore";
import { expandSnippets } from "../utils/snippets";
import { playStartCue, playStopCue } from "../utils/dictationCues";

export function useAudioRecording(toast, options = {}) {
  const [state, setState] = useState({
    isRecording: false,
    isProcessing: false,
    isPreparing: false,
    micCaptureStatus: "inactive",
  });
  const [transcript, setTranscript] = useState("");
  const manager = useRef(null);
  const callbacks = useRef({ toast, options });
  callbacks.current = { toast, options };
  const cancellingRef = useRef(false);
  const reportError = useCallback((error) => {
    const { options, toast } = callbacks.current;
    options.onDictationError?.(error);
    toast({
      title: error.title,
      description: error.description,
      variant: "destructive",
      presentation: "dictation-error",
      actions: [
        { label: "Retry", icon: "retry", onClick: () => callbacks.current.start?.() },
        ...(["BAD_KEY", "NO_KEY"].includes(error.code)
          ? [
              {
                label: "Open Settings",
                icon: "settings",
                onClick: () => window.electronAPI.openSettingsSection("speech"),
              },
            ]
          : []),
      ],
    });
  }, []);

  const startRecording = useCallback(
    async (commandMode = false) => {
      const current = manager.current;
      if (!current || current.isRecording || current.isProcessing || current.isPreparing)
        return false;
      cancellingRef.current = false;
      current.setCommandMode(commandMode === true);
      callbacks.current.options.dismissDictationError?.();
      setTranscript("");
      const started = await current.startRecording();
      if (started && current.isRecording) {
        if (getSettings().audioCuesEnabled) void playStartCue();
        try {
          const registration = await window.electronAPI.registerCancelHotkey("Escape");
          if (!registration || registration.success === false)
            throw new Error("Shortcut unavailable");
        } catch {
          current.cancelRecording();
          reportError({
            code: "CANCEL_SHORTCUT",
            title: "Escape is unavailable",
            description: "Close the application holding the Escape shortcut and try again.",
          });
          return false;
        }
      }
      return started;
    },
    [reportError]
  );
  const stopRecording = useCallback(() => {
    const stopped = manager.current?.stopRecording();
    if (stopped) {
      if (getSettings().audioCuesEnabled) void playStopCue();
    }
    return stopped;
  }, []);
  callbacks.current.start = startRecording;
  const cancelRecording = useCallback(() => {
    cancellingRef.current = true;
    manager.current?.cancelRecording();
    window.electronAPI.unregisterCancelHotkey().catch(() => {});
    window.electronAPI.cancelVoiceCommand().catch(() => {});
  }, []);
  const cancelProcessing = useCallback(() => {
    cancellingRef.current = true;
    manager.current?.cancelProcessing();
    window.electronAPI.cancelVoiceCommand().catch(() => {});
  }, []);
  const toggleListening = useCallback(
    async (commandMode = false) => {
      const current = manager.current;
      callbacks.current.options.onToggle?.();
      if (current?.isRecording || current?.isPreparing) return stopRecording();
      if (!current?.isProcessing) return startRecording(commandMode === true);
      return false;
    },
    [startRecording, stopRecording]
  );

  useEffect(() => {
    const audio = new AudioManager();
    manager.current = audio;
    audio.setCallbacks({
      onStateChange: (next) => {
        setState(next);
        if (!next.isPreparing && !next.isRecording && !next.isProcessing)
          window.electronAPI.unregisterCancelHotkey().catch(() => {});
        window.electronAPI.dictationLifecycleStateChanged(
          next.isPreparing
            ? "preparing"
            : next.isRecording
              ? "recording"
              : next.isProcessing
                ? "processing"
                : "idle",
          "dictation"
        );
      },
      onError: reportError,
      onNoAudio: () =>
        reportError({
          code: "NO_AUDIO",
          title: "We didn’t catch that",
          description: "Check your microphone and try again.",
        }),
      onTranscriptionComplete: async (result) => {
        const settings = getSettings();
        if (result.commandMode) {
          const execution = await window.electronAPI.executeVoiceCommand(result.text);
          if (!execution?.success && !execution?.unknown && !execution?.blocked)
            reportError({
              title: "Command not completed",
              description: "Check the target application and try again.",
            });
          return;
        }
        const text = expandSnippets(result.text, settings.snippets);
        setTranscript(text);

        if (settings.dataRetentionEnabled) {
          try {
            await window.electronAPI.saveTranscription(text, result.rawText, {
              status: "completed",
            });
          } catch {
            callbacks.current.toast({
              title: "History could not be saved",
              description: "Your transcript is still available.",
              variant: "destructive",
            });
          }
        }
        if (cancellingRef.current) return;
        if (settings.autoPasteEnabled) {
          const delivery = await window.electronAPI.pasteText(text, {
            restoreClipboard: !settings.keepTranscriptionInClipboard,
          });
          if (!delivery?.pasted) {
            callbacks.current.options.onShowTranscript?.(text);
            reportError({
              code: "PASTE_FAILED",
              title: "Text was not pasted",
              description:
                "Your transcript is available to copy. Check paste permissions and try again.",
            });
            return;
          }
          if (delivery.clipboardRestored === false)
            callbacks.current.toast({
              title: "Clipboard could not be restored",
              description:
                "Your dictation was pasted, but the previous clipboard content was not restored.",
              variant: "destructive",
            });
          if (settings.showLatencyBadge && result.releasedAt) {
            const latency = Math.round(performance.now() - result.releasedAt);
            callbacks.current.toast({
              title: `${latency}ms`,
              description: `Latency: ${latency}ms (key release to paste)`,
              duration: 3000,
            });
          }
        } else {
          if (settings.keepTranscriptionInClipboard) await window.electronAPI.writeClipboard(text);
          callbacks.current.options.onShowTranscript?.(text);
        }
      },
    });
    const listen = (method, callback) =>
      window.electronAPI[method]?.((...args) => {
        Promise.resolve(callback(...args)).catch(() =>
          reportError({ title: "Dictation failed", description: "Try again or check Settings." })
        );
      });
    const unsubscribe = [
      listen("onToggleDictation", () => toggleListening()),
      listen("onToggleCommand", () => toggleListening(true)),
      listen("onStartDictation", () => startRecording()),
      listen("onStopDictation", stopRecording),
      listen("onPrepareDictation", () => audio.prepareMicCapture()),
      listen("onCancelDictationPreparation", () => audio.cancelPreparedMicCapture()),
      listen("onCancelDictation", cancelRecording),
      listen("onCancelHotkeyPressed", cancelRecording),
      listen("onDictationForceStopped", stopRecording),
    ];
    const disposeOnUnload = () => audio.cleanup();
    window.addEventListener("beforeunload", disposeOnUnload);
    return () => {
      unsubscribe.forEach((dispose) => dispose?.());
      window.removeEventListener("beforeunload", disposeOnUnload);
      audio.cleanup();
      if (manager.current === audio) manager.current = null;
    };
  }, [startRecording, stopRecording, cancelRecording, reportError, toggleListening]);

  const getAudioLevel = useCallback(() => manager.current?.getRecordingAudioLevel() || 0, []);
  return {
    ...state,
    transcript,
    cancellingRef,
    startRecording,
    stopRecording,
    cancelRecording,
    cancelProcessing,
    toggleListening,
    getAudioLevel,
  };
}
