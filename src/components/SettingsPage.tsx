import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Sliders, Mic, Shield, Wrench, Keyboard, Info, Trash2, Cpu, Check } from "./icons";
import { useSettings } from "../hooks/useSettings";
import { SettingsSection, SettingsRow } from "./ui/SettingsSection";
import MicrophoneSettings from "./ui/MicrophoneSettings";
import HotkeyInput from "./ui/HotkeyInput";
import { useToast } from "./ui/useToast";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import type { SettingsSectionType } from "../lib/settingsNav";
import type { GpuInfo } from "../types/electron";

interface SettingsPageProps {
  section: SettingsSectionType;
}

export default function SettingsPage({ section }: SettingsPageProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const { toast } = useToast();

  const {
    registerHotkey,
    lastError: hotkeyError,
    clearError,
  } = useHotkeyRegistration({
    onSuccess: (val) => {
      settings.setDictationKey(val);
    },
    showAlert: ({ title, description }) => {
      toast({ title, description, variant: "destructive" });
    },
  });

  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string>("");
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyFeedback, setKeyFeedback] = useState<{
    status?: string;
    message?: string;
    error?: string;
  } | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getGpuInfo) {
      window.electronAPI
        .getGpuInfo()
        .then(setGpuInfo)
        .catch(() => {});
    }
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI
        .getAppVersion()
        .then((v) => {
          setAppVersion(typeof v === "string" ? v : v.version || "");
        })
        .catch(() => {});
    }
    if (window.electronAPI?.gnaniGetStatus) {
      window.electronAPI
        .gnaniGetStatus()
        .then((status) => {
          setIsKeyConfigured(Boolean(status?.configured));
        })
        .catch(() => {});
    }
  }, []);

  const handleSaveGnaniKey = async () => {
    if (!keyInput.trim()) return;
    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      const res = await window.electronAPI?.gnaniSaveKey?.(keyInput.trim());
      if (res?.success) {
        setIsKeyConfigured(true);
        setKeyInput("");
        setKeyFeedback({ status: "success", message: "API key saved securely." });
      } else {
        setKeyFeedback({ error: "Failed to save key" });
      }
    } catch (err: any) {
      setKeyFeedback({ error: err?.message || "Failed to save key" });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestGnaniKey = async () => {
    setIsTestingKey(true);
    setKeyFeedback(null);
    try {
      const res = await window.electronAPI?.gnaniTestKey?.(keyInput.trim() || undefined);
      if (res?.valid) {
        setKeyFeedback({ status: "success", message: res.message || "Key format verified." });
      } else {
        setKeyFeedback({ error: res?.error || "Invalid key format." });
      }
    } catch (err: any) {
      setKeyFeedback({ error: err?.message || "Validation failed" });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.electronAPI?.clearTranscriptions) {
      await window.electronAPI.clearTranscriptions();
      setConfirmClearHistory(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl pb-10">
      {/* General Settings */}
      {section === "general" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Sliders size={18} className="text-primary" />
              {t("settings.general.title", "General")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("settings.general.description", "Application behavior and system integration.")}
            </p>
          </div>

          <SettingsSection title={t("settings.general.behavior", "Dictation Behavior")}>
            <SettingsRow
              label={t("settings.general.autoPaste", "Auto-paste into active application")}
              description={t(
                "settings.general.autoPasteDesc",
                "Automatically paste recognized speech into the focused application upon completion."
              )}
            >
              <input
                type="checkbox"
                checked={settings.autoPasteEnabled}
                onChange={(e) => settings.setAutoPasteEnabled(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            <SettingsRow
              label={t("settings.general.keepClipboard", "Keep in clipboard")}
              description={t(
                "settings.general.keepClipboardDesc",
                "Keep transcriptions copied in system clipboard after dictation."
              )}
            >
              <input
                type="checkbox"
                checked={settings.keepTranscriptionInClipboard}
                onChange={(e) => settings.setKeepTranscriptionInClipboard(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            <SettingsRow
              label={t("settings.general.audioCues", "Sound cues")}
              description={t(
                "settings.general.audioCuesDesc",
                "Play audio chimes when dictation starts and stops."
              )}
            >
              <input
                type="checkbox"
                checked={settings.audioCuesEnabled}
                onChange={(e) => settings.setAudioCuesEnabled(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            <SettingsRow
              label={t("settings.general.startMinimized", "Start minimized")}
              description={t(
                "settings.general.startMinimizedDesc",
                "Launch DhwaniFlow silently to system tray on start."
              )}
            >
              <input
                type="checkbox"
                checked={settings.startMinimized}
                onChange={(e) => settings.setStartMinimized(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            <SettingsRow
              label={t("settings.general.latencyBadge", "Show latency badge")}
              description={t(
                "settings.general.latencyBadgeDesc",
                "Display dictation latency badge (key release to paste) after completion."
              )}
            >
              <input
                type="checkbox"
                checked={settings.showLatencyBadge}
                onChange={(e) => settings.setShowLatencyBadge(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {/* Hotkeys Settings */}
      {section === "hotkeys" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Keyboard size={18} className="text-primary" />
              {t("settings.hotkeys.title", "Hotkeys")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.hotkeys.description",
                "Customize global keyboard shortcuts and recording mode."
              )}
            </p>
          </div>

          <SettingsSection title={t("settings.hotkeys.primary", "Primary Dictation Shortcut")}>
            <div className="py-2">
              <HotkeyInput
                value={settings.dictationKey}
                onChange={async (val) => {
                  clearError();
                  await registerHotkey(val);
                }}
              />
              {hotkeyError && (
                <p className="text-xs text-destructive mt-1.5 font-medium">{hotkeyError}</p>
              )}
            </div>

            <SettingsRow
              label={t("settings.hotkeys.mode", "Activation Mode")}
              description={t(
                "settings.hotkeys.modeDesc",
                "Choose between Push-to-Talk (hold hotkey) or Tap-to-Toggle (press to start, press to stop)."
              )}
            >
              <div className="flex rounded-md border border-border/80 bg-background/50 p-0.5">
                <button
                  type="button"
                  onClick={() => settings.setActivationMode("push")}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    settings.activationMode === "push"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("settings.hotkeys.pushToTalk", "Push-to-Talk")}
                </button>
                <button
                  type="button"
                  onClick={() => settings.setActivationMode("tap")}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    settings.activationMode === "tap"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("settings.hotkeys.tapToToggle", "Tap-to-Toggle")}
                </button>
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t("settings.commands.title", "Voice Command Mode")}>
            <SettingsRow
              label={t("settings.commands.enable", "Enable Command Mode")}
              description={t(
                "settings.commands.enableDesc",
                "Control apps, windows, browser tabs, media, and text using natural Hinglish voice commands."
              )}
            >
              <input
                type="checkbox"
                checked={settings.commandModeEnabled}
                onChange={(e) => settings.setCommandModeEnabled(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            {settings.commandModeEnabled && (
              <>
                <div className="py-2">
                  <span className="text-xs font-medium text-foreground">
                    {t("settings.commands.hotkey", "Command Shortcut")}
                  </span>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {t(
                      "settings.commands.hotkeyDesc",
                      "Hold or press this shortcut while speaking your command."
                    )}
                  </p>
                  <HotkeyInput
                    value={settings.commandKey}
                    onChange={(val) => settings.setCommandKey(val)}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border/70 bg-card/40 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>{t("settings.commands.catalogTitle", "Supported Commands")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(
                      "settings.commands.catalogDesc",
                      "Commands are matched deterministically against a safe, fixed grammar. Arbitrary system commands and shell scripts are never executed."
                    )}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
                      <span className="font-semibold text-foreground">Apps & Windows</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        "Chrome kholo", "VS Code band karo", "minimize karo", "maximize karo", "left
                        snap karo", "desktop dikhao"
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
                      <span className="font-semibold text-foreground">Browser Tabs</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        "Naya tab kholo", "tab band karo", "agla tab", "pichhla tab"
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
                      <span className="font-semibold text-foreground">Media & Volume</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        "Aawaz badhao", "aawaz kam karo", "mute karo", "gana roko", "gana chalao",
                        "agla gana"
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
                      <span className="font-semibold text-foreground">Edit & Text</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        "Copy karo", "paste karo", "undo karo", "sab select karo", "type karo
                        &lt;text&gt;"
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </SettingsSection>
        </div>
      )}

      {/* Speech-to-Text */}
      {section === "speechToText" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Mic size={18} className="text-primary" />
              {t("settings.speech.title", "Speech")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.speech.description",
                "Gnani Hinglish voice dictation engine configuration."
              )}
            </p>
          </div>

          <SettingsSection title={t("settings.speech.engine", "Gnani Speech API")}>
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {t("settings.speech.apiKey", "Gnani API Key")}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.speech.apiKeyDesc", "Your Vachana STT v3 API authentication key.")}
                  </p>
                </div>
                {isKeyConfigured ? (
                  <Badge
                    variant="outline"
                    className="text-[11px] border-emerald-500/40 text-emerald-500 bg-emerald-500/10 flex items-center gap-1"
                  >
                    <Check size={12} />
                    {t("settings.speech.configured", "Configured")}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[11px] border-amber-500/40 text-amber-500 bg-amber-500/10"
                  >
                    {t("settings.speech.notConfigured", "Not Configured")}
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={
                    isKeyConfigured
                      ? "••••••••••••••••"
                      : t("settings.speech.keyPlaceholder", "Enter Gnani API key...")
                  }
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  size="sm"
                  onClick={handleSaveGnaniKey}
                  disabled={!keyInput.trim() || isSavingKey}
                >
                  {isSavingKey ? t("common.saving", "Saving...") : t("common.save", "Save")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestGnaniKey}
                  disabled={(!keyInput.trim() && !isKeyConfigured) || isTestingKey}
                >
                  {isTestingKey ? t("common.testing", "Testing...") : t("common.test", "Test")}
                </Button>
              </div>

              {keyFeedback?.message && (
                <p className="text-xs text-emerald-500">{keyFeedback.message}</p>
              )}
              {keyFeedback?.error && (
                <p className="text-xs text-destructive">{keyFeedback.error}</p>
              )}
            </div>

            <SettingsRow
              label={t("settings.speech.language", "Dictation Language")}
              description={t(
                "settings.speech.languageDesc",
                "Target language and script style for speech recognition."
              )}
            >
              <select
                value={settings.gnaniLanguage || "hi-IN"}
                onChange={(e) => settings.setGnaniLanguage(e.target.value)}
                className="text-xs rounded border border-border bg-background p-1.5 text-foreground"
              >
                <option value="hi-IN">Hindi / Hinglish (hi-IN)</option>
                <option value="en-IN">Indian English (en-IN)</option>
                <option value="indic-auto">Auto-detect Indic (indic-auto)</option>
                <option value="ta-IN">Tamil (ta-IN)</option>
                <option value="te-IN">Telugu (te-IN)</option>
                <option value="kn-IN">Kannada (kn-IN)</option>
                <option value="mr-IN">Marathi (mr-IN)</option>
                <option value="bn-IN">Bengali (bn-IN)</option>
                <option value="gu-IN">Gujarati (gu-IN)</option>
                <option value="pa-IN">Punjabi (pa-IN)</option>
                <option value="ml-IN">Malayalam (ml-IN)</option>
                <option value="ur-IN">Urdu (ur-IN)</option>
                <option value="or-IN">Odia (or-IN)</option>
                <option value="as-IN">Assamese (as-IN)</option>
              </select>
            </SettingsRow>
          </SettingsSection>
        </div>
      )}

      {/* Privacy & Data Settings */}
      {section === "privacyData" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              {t("settings.privacy.title", "Privacy")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("settings.privacy.description", "Control local data retention and storage.")}
            </p>
          </div>

          <SettingsSection title={t("settings.privacy.history", "Local History Retention")}>
            <SettingsRow
              label={t("settings.privacy.enableHistory", "Store transcription history locally")}
              description={t(
                "settings.privacy.enableHistoryDesc",
                "Keep a history of your past dictations on this device. Disabling will stop saving new dictations."
              )}
            >
              <input
                type="checkbox"
                checked={settings.dataRetentionEnabled}
                onChange={(e) => settings.setDataRetentionEnabled(e.target.checked)}
                className="rounded border-border"
              />
            </SettingsRow>

            <SettingsRow
              label={t("settings.privacy.retentionDays", "History retention period")}
              description={t(
                "settings.privacy.retentionDaysDesc",
                "Automatically purge transcriptions older than the specified number of days."
              )}
            >
              <select
                value={settings.transcriptRetentionDays}
                onChange={(e) => settings.setTranscriptRetentionDays(Number(e.target.value))}
                className="text-xs rounded border border-border bg-background p-1"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </SettingsRow>

            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              <div>
                <p className="text-xs font-medium text-foreground">
                  {t("settings.privacy.clearHistory", "Clear all history")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "settings.privacy.clearHistoryDesc",
                    "Permanently delete all stored dictations from local database."
                  )}
                </p>
              </div>
              <Button
                variant={confirmClearHistory ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  if (confirmClearHistory) {
                    void handleClearHistory();
                  } else {
                    setConfirmClearHistory(true);
                  }
                }}
                className="h-8 text-xs"
              >
                <Trash2 size={13} className="mr-1" />
                {confirmClearHistory
                  ? t("common.confirm", "Confirm Delete?")
                  : t("settings.privacy.clearBtn", "Clear History")}
              </Button>
            </div>
          </SettingsSection>
        </div>
      )}

      {/* System Settings */}
      {section === "system" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Wrench size={18} className="text-primary" />
              {t("settings.system.title", "System")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.system.description",
                "Input devices, GPU acceleration, and diagnostics."
              )}
            </p>
          </div>

          <SettingsSection title={t("settings.system.audioInput", "Audio Input")}>
            <MicrophoneSettings
              microphoneSelectionMode={settings.microphoneSelectionMode}
              selectedMicDeviceId={settings.selectedMicDeviceId}
              selectedMicDeviceLabel={settings.selectedMicDeviceLabel}
              micWarmHoldSeconds={settings.micWarmHoldSeconds}
              onSelectionModeChange={settings.setMicrophoneSelectionMode}
              onDeviceSelect={settings.setSelectedMicDevice}
              onMicWarmHoldSecondsChange={settings.setMicWarmHoldSeconds}
            />
          </SettingsSection>

          <SettingsSection title={t("settings.system.hardware", "Hardware Acceleration & GPU")}>
            <div className="p-3 rounded-lg border border-border/60 bg-card/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Cpu size={14} className="text-primary" />
                <span>Detected Graphics Hardware</span>
              </div>
              {gpuInfo && gpuInfo.gpuDevice && gpuInfo.gpuDevice.length > 0 ? (
                <div className="space-y-1">
                  {gpuInfo.gpuDevice.map((dev, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground flex justify-between">
                      <span>{dev.description || "Generic GPU"}</span>
                      {dev.driverVendor && (
                        <span className="text-[11px] opacity-75">{dev.driverVendor}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Standard system display adapter detected.
                </p>
              )}
            </div>
          </SettingsSection>

          <div className="text-center pt-4 text-xs text-muted-foreground/60">
            DhwaniFlow {appVersion ? `v${appVersion}` : ""} · Windows First Desktop Voice Dictation
          </div>
        </div>
      )}

      {/* About Settings */}
      {section === "about" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Info size={18} className="text-primary" />
              {t("settings.about.title", "About")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.about.description",
                "Application version, licensing, and upstream attribution."
              )}
            </p>
          </div>

          <SettingsSection title={t("settings.about.appInfo", "Application Information")}>
            <SettingsRow
              label={t("settings.about.versionLabel", "Version")}
              description={t("settings.about.versionDesc", "Installed DhwaniFlow release")}
            >
              <Badge variant="outline" className="font-mono text-xs">
                {appVersion ? `v${appVersion}` : "v1.11.0"}
              </Badge>
            </SettingsRow>

            <SettingsRow
              label={t("settings.about.licenseLabel", "License")}
              description={t("settings.about.licenseDesc", "Open-source software license")}
            >
              <span>MIT License</span>
            </SettingsRow>

            <SettingsRow
              label={t("settings.about.repoLabel", "Source Repository")}
              description={t("settings.about.repoDesc", "Official GitHub repository")}
            >
              <span>github.com/abhinavtiwary15/DhwaniFlow</span>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t("settings.about.creditsTitle", "Credits & Attribution")}>
            <div className="p-3 rounded-lg border border-border/60 bg-card/40 space-y-2">
              <p className="text-xs text-foreground font-medium">
                DhwaniFlow is built on OpenWhispr (MIT)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Speech-to-Text foundation model powered by Gnani Prisma v3.0 STT API.
              </p>
            </div>
          </SettingsSection>
        </div>
      )}
    </div>
  );
}
