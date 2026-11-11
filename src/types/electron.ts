export type TranscriptionErrorCode = string;

export interface MainWindowInputRegion {
  [key: string]: any;
}

export type TranscriptionStatus = "completed" | "failed" | "pending" | "discarded";

export interface TranscriptionItem {
  id: number;
  text: string;
  raw_text?: string | null;
  timestamp: string;
  created_at?: string;
  has_audio?: number;
  audio_duration_ms?: number | null;
  provider?: string | null;
  model?: string | null;
  status: TranscriptionStatus;
  error_message?: string | null;
  error_code?: string | null;
  route_kind?: string | null;
  client_transcription_id?: string;
  cloud_id?: string | null;
  sync_status?: "synced" | "pending" | "error";
  deleted_at?: string | null;
}

export interface DictionaryEntryItem {
  id: number;
  word: string;
  source?: "manual" | "learned";
  created_at: string;
  updated_at: string;
  client_dict_id?: string;
  cloud_id?: string | null;
  sync_status?: "synced" | "pending" | "error";
  deleted_at?: string | null;
  shared_at?: string | null;
  shared_at_dirty?: number;
  fallback_retired?: number;
}

export interface SnippetEntryItem {
  id: number;
  trigger: string;
  replacement: string;
  prefixContext?: string;
  suffixContext?: string;
  caseSensitive?: boolean;
  wordBoundary?: boolean;
  created_at: string;
  updated_at: string;
  client_snippet_id?: string;
  cloud_id?: string | null;
  sync_status?: "synced" | "pending" | "error";
  deleted_at?: string | null;
}

export interface GpuDevice {
  name: string;
  vendor: string;
  type: string;
  driverVersion?: string;
  memoryMb?: number;
}

export interface GpuInfo {
  available: boolean;
  type?: string;
  name?: string;
  vendor?: string;
  memoryMb?: number;
  devices?: GpuDevice[];
  gpuDevice?: Array<{ description?: string; driverVendor?: string }>;
}

export interface FFmpegAvailabilityResult {
  available: boolean;
  path?: string;
}

export interface AudioDiagnosticsResult {
  sampleRate: number;
  channelCount: number;
  activeInputDevice?: string;
  hasAudioInput: boolean;
}

export interface PasteToolsResult {
  platform: "darwin" | "win32" | "linux";
  available: boolean;
  method: string | null;
  requiresPermission: boolean;
  isWayland?: boolean;
  xwaylandAvailable?: boolean;
  terminalAware?: boolean;
  hasNativeBinary?: boolean;
  hasUinput?: boolean;
  hasWtype?: boolean;
  isWlroots?: boolean;
  isCosmic?: boolean;
  wlCopyMissing?: boolean;
  tools?: string[];
  recommendedInstall?: string;
}

export interface AppVersionResult {
  version: string;
  channel?: string;
}

declare global {
  interface Window {
    electronAPI: {
      // Window operations
      hideWindow?: () => Promise<void>;
      showDictationPanel?: () => Promise<void>;
      openSettingsSection?: (section: string) => Promise<{ success?: boolean } | void>;
      minimizeWindow?: () => Promise<void>;
      windowMinimize?: () => Promise<void>;
      windowMaximize?: () => Promise<void>;
      windowClose?: () => Promise<void>;
      windowIsMaximized?: () => Promise<boolean>;
      maximizeWindow?: () => Promise<void>;
      closeWindow?: () => Promise<void>;
      isWindowMaximized?: () => Promise<boolean>;
      onMaximizedStatusChanged?: (callback: (maximized: boolean) => void) => () => void;
      getAppVersion?: () => Promise<AppVersionResult | string>;
      getPlatform?: () => "darwin" | "win32" | "linux";
      openExternal?: (url: string) => Promise<void>;
      getLogs?: () => Promise<string>;
      openLogFolder?: () => Promise<void>;
      setMainWindowInputRegions?: (regions: MainWindowInputRegion[]) => Promise<void>;
      setMainWindowInputRegion?: (region: MainWindowInputRegion) => Promise<boolean>;
      onMainWindowVisibilityChanged?: (callback: (visible: boolean) => void) => () => void;
      setMainWindowInteractivity?: (interactive: boolean) => Promise<void>;
      onMainWindowHorizontalDirectionChanged?: (callback: (dir: "left" | "right") => void) => () => void;
      getMainWindowHorizontalDirection?: () => Promise<"left" | "right">;
      resizeMainWindow?: (sizeKey: string) => Promise<void>;
      resizeDictationErrorWindowToContent?: (height: number) => Promise<any>;

      // Dictation & Audio
      captureDictationTarget?: () => Promise<{ appName?: string; appTitle?: string; bundleId?: string; pid?: number }>;
      captureDictationAppCategory?: () => Promise<string | null>;
      onToggleDictation?: (callback: () => void) => () => void;
      onStartDictation?: (callback: () => void) => () => void;
      onStopDictation?: (callback: () => void) => () => void;
      onPrepareDictation?: (callback: (options: any) => void) => () => void;
      onCancelDictationPreparation?: (callback: () => void) => () => void;
      onCancelDictation?: (callback: () => void) => () => void;
      onDictationForceStopped?: (callback: (payload: any) => void) => () => void;
      micWarmHoldChanged?: (active: boolean) => void;
      dictationLifecycleStateChanged?: (state: string, inputKind?: string) => void;
      dictationAudioLevelChanged?: (level: number) => void;
      openMicrophoneSettings?: () => Promise<{ success: boolean; error?: string }>;
      openSoundInputSettings?: () => Promise<{ success: boolean; error?: string }>;
      requestMicrophoneAccess?: () => Promise<{ success: boolean; error?: string; granted?: boolean } | boolean>;
      checkMicrophoneAccess?: () => Promise<{ granted: boolean }>;
      checkAccessibilityPermission?: (prompt?: boolean) => Promise<boolean>;
      openAccessibilitySettings?: () => Promise<{ success: boolean; error?: string }>;
      checkPasteTools?: () => Promise<PasteToolsResult>;
      getMicrophones?: () => Promise<Array<{ id: string; name: string }>>;
      setMicrophone?: (id: string) => Promise<boolean>;
      getSelectedMicrophone?: () => Promise<string>;
      getSystemDefaultMicrophone?: () => Promise<any>;
      getAudioDiagnostics?: () => Promise<AudioDiagnosticsResult>;
      getFFmpegAvailability?: () => Promise<FFmpegAvailabilityResult>;

      // Paste, Selection & Clipboard
      pasteText?: (text: string, options?: any) => Promise<{ success: boolean; pasted?: boolean; reason?: string }>;
      captureSelectedText?: (options?: any) => Promise<{ status: "ok" | "empty" | "error"; text?: string; sessionId?: string }>;
      replaceSelectedText?: (sessionId: string, text: string, options?: any) => Promise<{ success: boolean }>;
      pasteAtCapturedTarget?: (sessionId: string, text: string, options?: any) => Promise<{ success: boolean }>;
      writeClipboard?: (text: string) => Promise<{ success: boolean }>;
      readClipboard?: () => Promise<string>;
      getPasteTools?: () => Promise<PasteToolsResult>;

      // Hotkeys & Push to talk
      registerHotkey?: (hotkey: string) => Promise<boolean>;
      unregisterHotkey?: () => Promise<boolean>;
      getRegisteredHotkey?: () => Promise<string | null>;
      getHotkeyModeInfo?: (key?: string) => Promise<any>;
      getHyprlandConfigStatus?: () => Promise<any>;
      getHotkey?: () => Promise<string>;
      setHotkey?: (hotkey: string) => Promise<boolean>;
      updateHotkey?: (hotkey: string) => Promise<{ success: boolean; message?: string }>;
      onHotkeyFallbackUsed?: (callback: (data: { original: string; fallback: string }) => void) => () => void;
      onHotkeyRegistrationFailed?: (callback: (data: { error?: string }) => void) => () => void;
      getActivationMode?: () => Promise<"tap" | "push">;
      notifyActivationModeChanged?: (mode: "tap" | "push") => void;
      onPushToTalkDown?: (callback: () => void) => () => void;
      onPushToTalkUp?: (callback: () => void) => () => void;
      onToggleHotkeyDown?: (callback: () => void) => () => void;
      notifyHotkeyChanged?: (hotkey: string) => Promise<boolean>;
      registerCancelHotkey?: (hotkey?: string) => Promise<boolean>;
      unregisterCancelHotkey?: () => Promise<boolean>;
      onCancelHotkeyPressed?: (callback: () => void) => () => void;
      setHotkeyListeningMode?: (enabled: boolean) => Promise<boolean>;
      onGlobeKeyPressed?: (callback: () => void) => () => void;
      onGlobeKeyReleased?: (callback: () => void) => () => void;

      // Settings Store
      getSetting?: <T = any>(key: string, defaultValue?: T) => Promise<T>;
      setSetting?: <T = any>(key: string, value: T) => Promise<boolean>;
      getSettings?: () => Promise<Record<string, any>>;
      onSettingsChanged?: (callback: (settings: Record<string, any>) => void) => () => void;
      onSettingUpdated?: (callback: (data: { key: string; value: any }) => void) => () => void;
      getUiLanguage?: () => Promise<string>;
      setUiLanguage?: (language: string) => Promise<boolean>;
      saveUiLanguage?: (language: string) => Promise<boolean>;
      notifyStartMinimizedChanged?: (startMinimized: boolean) => Promise<boolean>;
      onFloatingIconAutoHideChanged?: (callback: (autoHide: boolean) => void) => () => void;

      // Dictionary & Snippets (Local)
      getDictionary?: () => Promise<string[]>;
      setDictionary?: (words: string[]) => Promise<boolean>;
      applyDictionaryChanges?: (changes: { added: string[]; removed: string[] }) => Promise<boolean>;
      onDictionaryUpdated?: (callback: (words: string[]) => void) => () => void;
      getSnippets?: () => Promise<SnippetEntryItem[]>;
      setSnippets?: (snippets: SnippetEntryItem[]) => Promise<boolean>;
      onSnippetsUpdated?: (callback: (snippets: SnippetEntryItem[]) => void) => () => void;
      exportDictionary?: (format: "json" | "txt") => Promise<string | null>;
      getDictionaryEntries?: () => Promise<DictionaryEntryItem[]>;
      addDictionaryEntries?: (entries: Array<{ word: string; definition?: string }>) => Promise<any>;
      deleteDictionaryEntry?: (id: number) => Promise<any>;
      dragonImportPickFile?: () => Promise<any>;

      // Transcriptions (Local History)
      saveTranscription?: (item: TranscriptionItem) => Promise<boolean>;
      getTranscriptions?: (limit?: number, options?: { includeDiscarded?: boolean }) => Promise<TranscriptionItem[]>;
      clearTranscriptions?: (...args: any[]) => Promise<{ cleared: number; success: boolean }>;
      deleteTranscription?: (id: number) => Promise<{ success: boolean }>;
      getTranscriptionById?: (id: number) => Promise<TranscriptionItem | null>;
      onTranscriptionAdded?: (callback: (item: TranscriptionItem) => void) => () => void;
      onTranscriptionUpdated?: (callback: (item: TranscriptionItem) => void) => () => void;
      onTranscriptionDeleted?: (callback: (payload: { id: number }) => void) => () => void;
      onTranscriptionsCleared?: (callback: () => void) => () => void;
      updateTranscriptionText?: (id: number, text: string) => Promise<boolean>;

      // GPU Info
      getGpuInfo?: () => Promise<GpuInfo>;

      // Media Playback control (during dictation)
      pauseMediaPlayback?: () => Promise<boolean>;
      resumeMediaPlayback?: () => Promise<boolean>;

      // Gnani Speech-to-Text
      gnaniTranscribe?: (
        audioBuffer: ArrayBuffer | Uint8Array,
        options?: { language?: string; format?: string; keyterms?: string[] | string; requestId?: string }
      ) => Promise<{ transcript: string; text: string; chunks: number; requestId?: string }>;
      gnaniCancel?: (
        requestId?: string
      ) => Promise<{ success: boolean; cancelled?: boolean }>;
      gnaniTestKey?: (
        key?: string
      ) => Promise<{ valid: boolean; status?: string; message?: string; error?: string }>;
      gnaniSaveKey?: (key: string) => Promise<{ success: boolean }>;
      gnaniGetStatus?: () => Promise<{
        configured: boolean;
        queueLength?: number;
        activeRequests?: number;
        model?: string;
        defaultLanguage?: string;
      }>;

      // Logging
      getLogLevel?: () => Promise<string>;
      log?: (entry: {
        level: string;
        message: string;
        meta?: any;
        scope?: string;
        source?: string;
      }) => Promise<void>;
      sendDebugLog?: (message: string) => void;
    };
  }
}
