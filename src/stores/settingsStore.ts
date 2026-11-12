import { create } from "zustand";
import type { SnippetEntryItem } from "../types/electron";
import { migrateSettings } from "../helpers/settingsMigration";

export { migrateSettings } from "../helpers/settingsMigration";

export const MIC_WARM_HOLD_CHOICES = [0, 10, 60, 900] as const;

export interface Snippet {
  id?: number | string;
  trigger: string;
  replacement: string;
}

export interface SettingsState {
  uiLanguage: string;
  dictationKey: string;
  activeDictationKey: string | null;
  commandKey: string;
  commandModeEnabled: boolean;
  activationMode: "tap" | "push";

  audioCuesEnabled: boolean;

  floatingIconAutoHide: boolean;
  startMinimized: boolean;
  panelStartPosition: string;
  microphoneSelectionMode: "system" | "built-in" | "specific";
  preferBuiltInMic: boolean;
  selectedMicDeviceId: string;
  selectedMicDeviceLabel: string;
  micWarmHoldSeconds: number;

  autoPasteEnabled: boolean;
  keepTranscriptionInClipboard: boolean;

  transcriptRetentionDays: number;
  dataRetentionEnabled: boolean;

  preferredLanguage: string;
  customDictionary: string[];
  snippets: Snippet[];

  // Gnani Speech Configuration
  gnaniLanguage: string;
  showLatencyBadge: boolean;

  // Actions
  setUiLanguage: (uiLanguage: string) => void;
  setDictationKey: (dictationKey: string) => void;
  setActiveDictationKey: (activeDictationKey: string | null) => void;
  setActivationMode: (activationMode: "tap" | "push") => void;
  setCommandKey: (commandKey: string) => void;
  setCommandModeEnabled: (enabled: boolean) => void;

  setAudioCuesEnabled: (enabled: boolean) => void;

  setFloatingIconAutoHide: (enabled: boolean) => void;
  setStartMinimized: (enabled: boolean) => void;
  setPanelStartPosition: (pos: string) => void;
  setMicrophoneSelectionMode: (mode: "system" | "built-in" | "specific") => void;
  setPreferBuiltInMic: (prefer: boolean) => void;
  setSelectedMicDevice: (id: string, label: string) => void;
  setMicWarmHoldSeconds: (seconds: number) => void;

  setAutoPasteEnabled: (enabled: boolean) => void;
  setKeepTranscriptionInClipboard: (enabled: boolean) => void;

  setTranscriptRetentionDays: (days: number) => void;
  setDataRetentionEnabled: (enabled: boolean) => void;
  setGnaniLanguage: (gnaniLanguage: string) => void;
  setShowLatencyBadge: (showLatencyBadge: boolean) => void;
  updateTranscriptionSettings: (patch: Partial<SettingsState>) => void;
  applyCustomDictionaryFromExternal: (words: string[]) => void;
  applySnippetsFromExternal: (snippets: Snippet[]) => void;
  setSnippets: (snippets: Snippet[]) => void;
  updateCustomDictionary: (patch: { add?: string[]; remove?: string[] }) => void;
}

async function persistSetting(key: string, value: any) {
  if (typeof window !== "undefined") {
    try {
      await window.electronAPI?.setSetting?.(key, value);
      const accepted = await window.electronAPI?.getSetting?.(key, value);
      if (accepted !== undefined) value = accepted;
      useSettingsStore.setState({ [key]: value });
    } catch {
      try {
        const persisted = await window.electronAPI?.getSettings?.();
        if (persisted) useSettingsStore.setState(migrateSettings(persisted));
      } catch {}
      console.warn("Settings change was not saved");
      return;
    }
    try {
      if (window.localStorage) {
        const raw = window.localStorage.getItem("dhwaniflow-settings");
        const curr = raw ? JSON.parse(raw) : {};
        curr[key] = value;
        window.localStorage.setItem("dhwaniflow-settings", JSON.stringify(curr));
      }
    } catch {}
  }
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  uiLanguage: "en",
  dictationKey: "Control+Space",
  activeDictationKey: null,
  commandKey: "Control+Alt+Space",
  commandModeEnabled: false,
  activationMode: "push",

  audioCuesEnabled: true,

  floatingIconAutoHide: false,
  startMinimized: false,
  panelStartPosition: "center",
  microphoneSelectionMode: "system",
  preferBuiltInMic: false,
  selectedMicDeviceId: "",
  selectedMicDeviceLabel: "",
  micWarmHoldSeconds: 0,

  autoPasteEnabled: true,
  keepTranscriptionInClipboard: true,

  transcriptRetentionDays: 30,
  dataRetentionEnabled: true,

  preferredLanguage: "auto",
  customDictionary: [],
  snippets: [],

  gnaniLanguage: "hi-IN",
  showLatencyBadge: true,

  setUiLanguage: (uiLanguage) => {
    set({ uiLanguage });
    persistSetting("uiLanguage", uiLanguage);
  },
  setDictationKey: (dictationKey) => {
    set({ dictationKey });
    persistSetting("dictationKey", dictationKey);
  },
  setActiveDictationKey: (activeDictationKey) => set({ activeDictationKey }),
  setCommandKey: (commandKey) => {
    set({ commandKey });
    persistSetting("commandKey", commandKey);
  },
  setCommandModeEnabled: (commandModeEnabled) => {
    set({ commandModeEnabled });
    persistSetting("commandModeEnabled", commandModeEnabled);
  },
  setActivationMode: (activationMode) => {
    set({ activationMode });
    persistSetting("activationMode", activationMode);
  },

  setAudioCuesEnabled: (audioCuesEnabled) => {
    set({ audioCuesEnabled });
    persistSetting("audioCuesEnabled", audioCuesEnabled);
  },

  setFloatingIconAutoHide: (floatingIconAutoHide) => {
    set({ floatingIconAutoHide });
    persistSetting("floatingIconAutoHide", floatingIconAutoHide);
  },
  setStartMinimized: (startMinimized) => {
    set({ startMinimized });
    persistSetting("startMinimized", startMinimized);
  },
  setPanelStartPosition: (panelStartPosition) => {
    set({ panelStartPosition });
    persistSetting("panelStartPosition", panelStartPosition);
  },
  setMicrophoneSelectionMode: (microphoneSelectionMode) => {
    set({ microphoneSelectionMode });
    persistSetting("microphoneSelectionMode", microphoneSelectionMode);
  },
  setPreferBuiltInMic: (preferBuiltInMic) => {
    set({ preferBuiltInMic });
    persistSetting("preferBuiltInMic", preferBuiltInMic);
  },
  setSelectedMicDevice: (selectedMicDeviceId, selectedMicDeviceLabel) => {
    set({ selectedMicDeviceId, selectedMicDeviceLabel });
    persistSetting("selectedMicDeviceId", selectedMicDeviceId);
    persistSetting("selectedMicDeviceLabel", selectedMicDeviceLabel);
  },
  setMicWarmHoldSeconds: (micWarmHoldSeconds) => {
    set({ micWarmHoldSeconds });
    persistSetting("micWarmHoldSeconds", micWarmHoldSeconds);
  },

  setAutoPasteEnabled: (autoPasteEnabled) => {
    set({ autoPasteEnabled });
    persistSetting("autoPasteEnabled", autoPasteEnabled);
  },
  setKeepTranscriptionInClipboard: (keepTranscriptionInClipboard) => {
    set({ keepTranscriptionInClipboard });
    persistSetting("keepTranscriptionInClipboard", keepTranscriptionInClipboard);
  },

  setTranscriptRetentionDays: (transcriptRetentionDays) => {
    set({ transcriptRetentionDays });
    persistSetting("transcriptRetentionDays", transcriptRetentionDays);
  },
  setDataRetentionEnabled: (dataRetentionEnabled) => {
    set({ dataRetentionEnabled });
    persistSetting("dataRetentionEnabled", dataRetentionEnabled);
  },
  setGnaniLanguage: (gnaniLanguage) => {
    set({ gnaniLanguage });
    persistSetting("gnaniLanguage", gnaniLanguage);
  },
  setShowLatencyBadge: (showLatencyBadge) => {
    set({ showLatencyBadge });
    persistSetting("showLatencyBadge", showLatencyBadge);
  },
  updateTranscriptionSettings: (patch) => {
    set((s) => ({ ...s, ...patch }));
    for (const [k, v] of Object.entries(patch)) {
      persistSetting(k, v);
    }
  },
  applyCustomDictionaryFromExternal: (customDictionary) => set({ customDictionary }),
  applySnippetsFromExternal: (snippets) => set({ snippets }),
  setSnippets: (snippets) => set({ snippets }),
  updateCustomDictionary: ({ add = [], remove = [] }) =>
    set((state) => {
      const remSet = new Set(remove);
      const next = [...state.customDictionary.filter((w) => !remSet.has(w)), ...add];
      return { customDictionary: next };
    }),
}));

export function getSettings(): SettingsState {
  return useSettingsStore.getState();
}

export function selectPolicyEffectiveSettings<T extends SettingsState>(state: T): T {
  return state;
}

let settingsInitialization: Promise<void> | null = null;
export function initializeSettings(): Promise<void> {
  if (!settingsInitialization) settingsInitialization = loadSettings();
  return settingsInitialization;
}

async function loadSettings(): Promise<void> {
  if (typeof window === "undefined" || !window.electronAPI) return;
  try {
    if (window.localStorage) {
      try {
        const raw = window.localStorage.getItem("dhwaniflow-settings");
        if (raw) {
          const parsed = JSON.parse(raw);
          const migrated = migrateSettings(parsed);
          useSettingsStore.setState(migrated as Partial<SettingsState>);
        }
      } catch {}
    }
    if (window.electronAPI.getHotkey) {
      const key = await window.electronAPI.getHotkey();
      if (key) useSettingsStore.setState({ dictationKey: key, activeDictationKey: key });
    }
    if (window.electronAPI.getRegisteredHotkey) {
      const reg = await window.electronAPI.getRegisteredHotkey();
      if (reg) useSettingsStore.setState({ activeDictationKey: reg });
    }
    if (window.electronAPI.getCommandHotkey) {
      const cmdKey = await window.electronAPI.getCommandHotkey();
      if (cmdKey) useSettingsStore.setState({ commandKey: cmdKey });
    }
    if (window.electronAPI.getCommandModeEnabled) {
      const enabled = await window.electronAPI.getCommandModeEnabled();
      useSettingsStore.setState({ commandModeEnabled: Boolean(enabled) });
    }
    if (window.electronAPI.getActivationMode) {
      const mode = await window.electronAPI.getActivationMode();
      if (mode) useSettingsStore.setState({ activationMode: mode });
    }
    if (window.electronAPI.getSettings) {
      try {
        const persisted = await window.electronAPI.getSettings();
        if (persisted && typeof persisted === "object" && Object.keys(persisted).length > 0) {
          const migrated = migrateSettings(persisted);
          useSettingsStore.setState(migrated as Partial<SettingsState>);
        }
      } catch {}
    }
    if (window.electronAPI.onSettingUpdated) {
      window.electronAPI.onSettingUpdated((data: { key?: string; value?: any }) => {
        if (!data || !data.key) return;
        useSettingsStore.setState({ [data.key]: data.value });
      });
    }
    if (window.electronAPI.getDictionaryEntries) {
      const entries = await window.electronAPI.getDictionaryEntries();
      if (Array.isArray(entries)) {
        useSettingsStore.setState({
          customDictionary: entries,
        });
      }
    }
    if (window.electronAPI.getSnippets) {
      const snippets = await window.electronAPI.getSnippets();
      if (Array.isArray(snippets)) {
        useSettingsStore.setState({
          snippets: snippets.map((s) => ({
            id: s.id,
            trigger: (s as any).trigger || (s as any).prefix || "",
            replacement: s.replacement,
          })),
        });
      }
    }
  } catch (_e) {
    // Non-fatal initialization error
  }
}

if (typeof window !== "undefined") {
  (window as any).__dhwaniflowGetSettings = getSettings;
}
