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
  activationMode: "tap" | "push";
  notificationsEnabled: boolean;
  autoUpdatesEnabled: boolean;
  audioCuesEnabled: boolean;
  pauseMediaOnDictation: boolean;
  floatingIconAutoHide: boolean;
  startMinimized: boolean;
  panelStartPosition: string;
  microphoneSelectionMode: "system" | "built-in" | "specific";
  preferBuiltInMic: boolean;
  selectedMicDeviceId: string;
  selectedMicDeviceLabel: string;
  micWarmHoldSeconds: number;
  autoLearnCorrections: boolean;
  showTranscriptionPreview: boolean;
  autoPasteEnabled: boolean;
  keepTranscriptionInClipboard: boolean;
  audioRetentionDays: number;
  transcriptRetentionDays: number;
  dataRetentionEnabled: boolean;
  saveDiscardedTranscriptions: boolean;
  preferredLanguage: string;
  customDictionary: string[];
  snippets: Snippet[];
  customPrompts: Record<string, string>;

  // Gnani Speech Configuration
  gnaniLanguage: string;
  showLatencyBadge: boolean;

  // Actions
  setUiLanguage: (uiLanguage: string) => void;
  setDictationKey: (dictationKey: string) => void;
  setActiveDictationKey: (activeDictationKey: string | null) => void;
  setActivationMode: (activationMode: "tap" | "push") => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAutoUpdatesEnabled: (enabled: boolean) => void;
  setAudioCuesEnabled: (enabled: boolean) => void;
  setPauseMediaOnDictation: (enabled: boolean) => void;
  setFloatingIconAutoHide: (enabled: boolean) => void;
  setStartMinimized: (enabled: boolean) => void;
  setPanelStartPosition: (pos: string) => void;
  setMicrophoneSelectionMode: (mode: "system" | "built-in" | "specific") => void;
  setPreferBuiltInMic: (prefer: boolean) => void;
  setSelectedMicDevice: (id: string, label: string) => void;
  setMicWarmHoldSeconds: (seconds: number) => void;
  setAutoLearnCorrections: (enabled: boolean) => void;
  setShowTranscriptionPreview: (enabled: boolean) => void;
  setAutoPasteEnabled: (enabled: boolean) => void;
  setKeepTranscriptionInClipboard: (enabled: boolean) => void;
  setSaveDiscardedTranscriptions: (enabled: boolean) => void;
  setAudioRetentionDays: (days: number) => void;
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

export const useSettingsStore = create<SettingsState>()((set) => ({
  uiLanguage: "en",
  dictationKey: "Control+Space",
  activeDictationKey: null,
  activationMode: "push",
  notificationsEnabled: true,
  autoUpdatesEnabled: false,
  audioCuesEnabled: true,
  pauseMediaOnDictation: false,
  floatingIconAutoHide: false,
  startMinimized: false,
  panelStartPosition: "center",
  microphoneSelectionMode: "system",
  preferBuiltInMic: false,
  selectedMicDeviceId: "",
  selectedMicDeviceLabel: "",
  micWarmHoldSeconds: 0,
  autoLearnCorrections: false,
  showTranscriptionPreview: true,
  autoPasteEnabled: true,
  keepTranscriptionInClipboard: true,
  audioRetentionDays: 30,
  transcriptRetentionDays: 30,
  dataRetentionEnabled: true,
  saveDiscardedTranscriptions: false,
  preferredLanguage: "auto",
  customDictionary: [],
  snippets: [],
  customPrompts: {},

  gnaniLanguage: "hi-IN",
  showLatencyBadge: true,

  setUiLanguage: (uiLanguage) => set({ uiLanguage }),
  setDictationKey: (dictationKey) => {
    set({ dictationKey });
    window.electronAPI?.notifyHotkeyChanged?.(dictationKey);
  },
  setActiveDictationKey: (activeDictationKey) => set({ activeDictationKey }),
  setActivationMode: (activationMode) => {
    set({ activationMode });
    window.electronAPI?.notifyActivationModeChanged?.(activationMode);
  },
  setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
  setAutoUpdatesEnabled: (autoUpdatesEnabled) => set({ autoUpdatesEnabled }),
  setAudioCuesEnabled: (audioCuesEnabled) => set({ audioCuesEnabled }),
  setPauseMediaOnDictation: (pauseMediaOnDictation) => set({ pauseMediaOnDictation }),
  setFloatingIconAutoHide: (floatingIconAutoHide) => set({ floatingIconAutoHide }),
  setStartMinimized: (startMinimized) => set({ startMinimized }),
  setPanelStartPosition: (panelStartPosition) => set({ panelStartPosition }),
  setMicrophoneSelectionMode: (microphoneSelectionMode) => set({ microphoneSelectionMode }),
  setPreferBuiltInMic: (preferBuiltInMic) => set({ preferBuiltInMic }),
  setSelectedMicDevice: (selectedMicDeviceId, selectedMicDeviceLabel) =>
    set({ selectedMicDeviceId, selectedMicDeviceLabel }),
  setMicWarmHoldSeconds: (micWarmHoldSeconds) => set({ micWarmHoldSeconds }),
  setAutoLearnCorrections: (autoLearnCorrections) => set({ autoLearnCorrections }),
  setShowTranscriptionPreview: (showTranscriptionPreview) => set({ showTranscriptionPreview }),
  setAutoPasteEnabled: (autoPasteEnabled) => set({ autoPasteEnabled }),
  setKeepTranscriptionInClipboard: (keepTranscriptionInClipboard) =>
    set({ keepTranscriptionInClipboard }),
  setSaveDiscardedTranscriptions: (saveDiscardedTranscriptions) =>
    set({ saveDiscardedTranscriptions }),
  setAudioRetentionDays: (audioRetentionDays) => set({ audioRetentionDays }),
  setTranscriptRetentionDays: (transcriptRetentionDays) => set({ transcriptRetentionDays }),
  setDataRetentionEnabled: (dataRetentionEnabled) => set({ dataRetentionEnabled }),
  setGnaniLanguage: (gnaniLanguage) => set({ gnaniLanguage }),
  setShowLatencyBadge: (showLatencyBadge) => set({ showLatencyBadge }),
  updateTranscriptionSettings: (patch) => set((s) => ({ ...s, ...patch })),
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

export async function initializeSettings(): Promise<void> {
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
      if (key) useSettingsStore.setState({ dictationKey: key });
    }
    if (window.electronAPI.getActivationMode) {
      const mode = await window.electronAPI.getActivationMode();
      if (mode) useSettingsStore.setState({ activationMode: mode });
    }
    if (window.electronAPI.onSettingUpdated) {
      window.electronAPI.onSettingUpdated((data: { key?: string; value?: any }) => {
        if (!data || !data.key) return;
        if (data.key === "activationMode" && (data.value === "tap" || data.value === "push")) {
          useSettingsStore.setState({ activationMode: data.value });
        }
        if (data.key === "dictationKey" && typeof data.value === "string") {
          useSettingsStore.setState({ dictationKey: data.value });
        }
      });
    }
    if (window.electronAPI.getDictionaryEntries) {
      const entries = await window.electronAPI.getDictionaryEntries();
      if (Array.isArray(entries)) {
        useSettingsStore.setState({
          customDictionary: entries.map((e) => (typeof e === "string" ? e : e.word)),
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

export function getEffectiveCleanupModel(_state?: SettingsState): string {
  return "";
}

export function isCloudCleanupMode(_state?: SettingsState): boolean {
  return false;
}

export function isCloudDictationAgentMode(_state?: SettingsState): boolean {
  return false;
}

export function isCloudTranslationMode(_state?: SettingsState): boolean {
  return false;
}

export function selectResolvedLLMConfig(_state?: SettingsState, _scope?: string) {
  return {
    model: "",
    provider: "gnani",
    url: "",
    apiKey: "",
  };
}

export function getLlmDictionaryWords(settings: SettingsState = getSettings(), _options?: any): string[] {
  return settings.customDictionary || [];
}

export function getDictionaryHintTiers(settings: SettingsState = getSettings()): string[][] {
  return [settings.customDictionary || []];
}

export function getCloudLlmDictionaryFields(settings: SettingsState = getSettings()) {
  return {
    customDictionary: settings.customDictionary || [],
  };
}

export function matchesDictionaryPrompt(_text: string, _prompt: any): boolean {
  return false;
}

export function resolveDictationToneStyle(..._args: any[]): null {
  return null;
}

export function selectLocalServerPrefs(..._args: any[]): Record<string, unknown> {
  return {};
}
