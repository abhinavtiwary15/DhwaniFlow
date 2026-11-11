import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "../icons";
import { useSettingsStore } from "../../stores/settingsStore";
import OnboardingShell from "./OnboardingShell";

interface GnaniSetupStepProps {
  onBack?: () => void;
  onContinue: () => void;
  progress?: { index: number; total: number } | null;
}
import { GNANI_LANGUAGES } from "./gnaniLanguages";

export default function GnaniSetupStep({
  onBack,
  onContinue,
  progress,
}: GnaniSetupStepProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const [keyInput, setKeyInput] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ status?: "success" | "error"; message?: string } | null>(null);

  useEffect(() => {
    if (window.electronAPI?.gnaniGetStatus) {
      window.electronAPI.gnaniGetStatus().then((status) => {
        setIsConfigured(Boolean(status?.configured));
      }).catch(() => {});
    }
  }, []);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI?.gnaniSaveKey?.(keyInput.trim());
      if (res?.success) {
        setIsConfigured(true);
        setKeyInput("");
        setFeedback({ status: "success", message: t("onboarding.gnani.keySaved", "API key saved securely.") });
      } else {
        setFeedback({ status: "error", message: t("onboarding.gnani.saveFailed", "Failed to save key.") });
      }
    } catch (err: any) {
      setFeedback({ status: "error", message: err?.message || t("onboarding.gnani.saveFailed", "Failed to save key.") });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI?.gnaniTestKey?.(keyInput.trim() || undefined);
      if (res?.valid) {
        setFeedback({ status: "success", message: res.message || t("onboarding.gnani.keyValid", "Key verified successfully.") });
      } else {
        setFeedback({ status: "error", message: res?.error || t("onboarding.gnani.keyInvalid", "Invalid API key.") });
      }
    } catch (err: any) {
      setFeedback({ status: "error", message: err?.message || t("onboarding.gnani.testFailed", "Validation failed.") });
    } finally {
      setIsTesting(false);
    }
  };

  const handleContinue = async () => {
    if (keyInput.trim() && window.electronAPI?.gnaniSaveKey) {
      try {
        await window.electronAPI.gnaniSaveKey(keyInput.trim());
      } catch {}
    }
    onContinue();
  };

  return (
    <OnboardingShell
      onBack={onBack}
      onContinue={handleContinue}
      continueLabel={t("common.continue", "Continue")}
      progress={progress}
    >
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("onboarding.gnani.title", "Configure Speech API")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "onboarding.gnani.subtitle",
              "Enter your Gnani API key and select your preferred dictation language."
            )}
          </p>
        </div>

        {/* API Key Box */}
        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              {t("onboarding.gnani.apiKey", "Gnani API Key")}
            </label>
            {isConfigured ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <Check className="size-3" />
                {t("onboarding.gnani.configuredBadge", "Configured")}
              </span>
            ) : (
              <span className="inline-flex items-center text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                {t("onboarding.gnani.notConfiguredBadge", "Not Configured")}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={isConfigured ? "••••••••••••••••" : t("onboarding.gnani.apiKeyPlaceholder", "Enter Gnani API key...")}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={!keyInput.trim() || isSaving}
              onClick={handleSaveKey}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                t("onboarding.gnani.saveKey", "Save")
              )}
            </button>
            <button
              type="button"
              disabled={(!keyInput.trim() && !isConfigured) || isTesting}
              onClick={handleTestKey}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {isTesting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                t("onboarding.gnani.testKey", "Test")
              )}
            </button>
          </div>

          {feedback && (
            <p
              className={`text-xs ${
                feedback.status === "success" ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {feedback.message}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            {t(
              "onboarding.gnani.optionalNotice",
              "You can also configure or update your key later in Settings > Speech."
            )}
          </p>
        </div>

        {/* Language Selection */}
        <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-2">
          <div>
            <label className="text-sm font-medium text-foreground">
              {t("onboarding.gnani.language", "Dictation Language")}
            </label>
            <p className="text-xs text-muted-foreground">
              {t(
                "onboarding.gnani.languageDesc",
                "Target language and script style for speech recognition."
              )}
            </p>
          </div>

          <select
            value={settings.gnaniLanguage || "hi-IN"}
            onChange={(e) => settings.setGnaniLanguage(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {GNANI_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </OnboardingShell>
  );
}
