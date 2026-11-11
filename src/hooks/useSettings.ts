import React, { createContext, useContext, useEffect, useRef } from "react";
import {
  useSettingsStore,
  initializeSettings,
  type SettingsState,
  type Snippet,
} from "../stores/settingsStore";
import logger from "../utils/logger";

export interface TranscriptionSettings {
  uiLanguage: string;
  preferredLanguage: string;
  gnaniLanguage: string;
  showLatencyBadge: boolean;
  customDictionary: string[];
  snippets: Snippet[];
  showTranscriptionPreview: boolean;
}

export interface HotkeySettings {
  dictationKey: string;
  activeDictationKey: string | null;
  activationMode: "tap" | "push";
}

export interface MicrophoneSettings {
  microphoneSelectionMode: "system" | "built-in" | "specific";
  preferBuiltInMic: boolean;
  selectedMicDeviceId: string;
  selectedMicDeviceLabel: string;
  micWarmHoldSeconds: number;
}

export interface PrivacySettings {
  audioRetentionDays: number;
  transcriptRetentionDays: number;
  dataRetentionEnabled: boolean;
  saveDiscardedTranscriptions: boolean;
}

export interface ThemeSettings {
  theme: "light" | "dark" | "auto";
}

function useSettingsInternal() {
  const store = useSettingsStore();

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    initializeSettings().catch((err) => {
      logger.warn(
        "Failed to initialize settings store",
        { error: (err as Error).message },
        "settings"
      );
    });
  }, []);

  return {
    ...store,
    theme: "auto" as const,
    setTheme: () => {},
  };
}

export type SettingsValue = ReturnType<typeof useSettingsInternal>;

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useSettingsInternal();
  return React.createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
