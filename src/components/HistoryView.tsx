import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { useUiLocale } from "../hooks/useUiLocale";
import { PAGE_CONTENT_WIDTH_CLASS } from "./ui/pageWidth";
import { Loader2, Trash2, Archive } from "./icons";
import TranscriptionItem from "./ui/TranscriptionItem";
import ThemedEmptyIllustration from "./ui/ThemedEmptyIllustration";
import DictationHotkeyHint from "./ui/DictationHotkeyHint";
import { BIDI_VALUE_TOKEN, BidiInterpolatedText } from "./ui/BidiInterpolatedText";
import historyEmptyLight from "../assets/empty-states/home-history-light.svg";
import historyEmptyDark from "../assets/empty-states/home-history-dark.svg";
import type { TranscriptionItem as TranscriptionItemType } from "../types/electron";
import { formatDateGroup } from "../utils/dateFormatting";
import { useSettingsStore } from "../stores/settingsStore";

interface HistoryViewProps {
  history: TranscriptionItemType[];
  isLoading: boolean;
  hotkey: string;
  copyToClipboard: (text: string) => void;
  deleteTranscription: (id: number) => void;
  clearAllTranscriptions: () => void;
  onOpenSettings: (section?: string) => void;
  onShowAudioInFolder?: (id: number) => void;
  onRetryTranscription?: (id: number, options?: { isRecover?: boolean }) => Promise<void>;
  showDiscarded: boolean;
  onToggleDiscarded: () => void;
  userName?: string | null;
  aiCTADismissed?: boolean;
  setAiCTADismissed?: (dismissed: boolean) => void;
  useCleanupModel?: boolean;
  onOpenIntegrations?: () => void;
}

export default function HistoryView({
  history,
  isLoading,
  hotkey,
  copyToClipboard,
  deleteTranscription,
  clearAllTranscriptions,
  onOpenSettings,
  onShowAudioInFolder = () => {},
  onRetryTranscription = async () => {},
  showDiscarded,
  onToggleDiscarded,
  userName,
}: HistoryViewProps) {
  const { t } = useTranslation();
  const locale = useUiLocale();
  const dataRetentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);
  const firstName = userName?.trim().split(/\s+/)[0];
  const hasHistory = history.length > 0;

  const groupedHistory = useMemo(() => {
    if (history.length === 0) return [];

    const groups: { label: string; items: TranscriptionItemType[] }[] = [];
    let currentLabel: string | null = null;

    for (const item of history) {
      const label = formatDateGroup(item.timestamp, t, locale);

      if (label !== currentLabel) {
        groups.push({ label, items: [item] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }

    return groups;
  }, [history, t, locale]);

  const discardedToggle = (
    <button
      onClick={onToggleDiscarded}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/70 hover:!text-foreground hover:!bg-black/5 dark:hover:!bg-white/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 transition-all duration-200"
    >
      <Archive size={11} />
      <span>
        {showDiscarded
          ? t("controlPanel.history.discarded.hide", "Hide discarded")
          : t("controlPanel.history.discarded.show", "Show discarded")}
      </span>
    </button>
  );

  return (
    <div className={cn(PAGE_CONTENT_WIDTH_CLASS, "px-6 pt-4 pb-6")}>
      <h2 className={cn("mb-4 text-xl text-foreground", isLoading && !hasHistory && "invisible")}>
        {firstName ? (
          <BidiInterpolatedText
            text={t(
              hasHistory
                ? "controlPanel.history.welcomeBackNamed"
                : "controlPanel.history.welcomeNamed",
              { name: BIDI_VALUE_TOKEN }
            )}
            value={firstName}
            dir="auto"
          />
        ) : (
          t(hasHistory ? "controlPanel.history.welcomeBack" : "controlPanel.history.welcome")
        )}
      </h2>

      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          {!dataRetentionEnabled && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="text-amber-600 dark:text-amber-400 shrink-0 text-sm">⊘</span>
              <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
                {t("controlPanel.history.dataRetentionDisabled", "Local history is disabled in Settings.")}
              </p>
            </div>
          )}
          {isLoading && history.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card/50 dark:border-white/10 dark:bg-surface-2/60">
              <div className="flex items-center justify-center gap-2 py-10">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">{t("controlPanel.loading", "Loading...")}</span>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center px-4 pt-6 text-center">
              <ThemedEmptyIllustration
                light={historyEmptyLight}
                dark={historyEmptyDark}
                width={560}
                height={102}
                className="[mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]"
              />
              <h2 className="mt-6 text-lg font-semibold text-foreground">
                {t("controlPanel.history.empty", "No dictation history yet")}
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {t("controlPanel.history.emptyDescription", "Start speaking to see your transcriptions here.")}
              </p>
              <DictationHotkeyHint hotkey={hotkey} className="mt-2" />
            </div>
          ) : (
            <div className="group">
              {groupedHistory.map((group, index) => (
                <div key={group.label} className={index > 0 ? "mt-6" : ""}>
                  <div className="sticky -top-1 z-10 -mx-6 px-6 pt-2 pb-2.5 bg-background flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{group.label}</span>
                    {index === 0 && (
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                        {discardedToggle}
                        <button
                          onClick={clearAllTranscriptions}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/70 hover:!text-destructive hover:!bg-destructive/8 dark:hover:!bg-destructive/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 transition-all duration-200"
                        >
                          <Trash2 size={11} />
                          <span>{t("controlPanel.history.clearAll", "Clear all")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative z-0 overflow-clip rounded-2xl border border-border/70 bg-card/50 divide-y divide-border/60 dark:border-white/10 dark:bg-surface-2/60">
                    {group.items.map((item) => (
                      <TranscriptionItem
                        key={item.id}
                        item={item}
                        onCopy={copyToClipboard}
                        onDelete={deleteTranscription}
                        onShowAudioInFolder={onShowAudioInFolder}
                        onRetryTranscription={onRetryTranscription}
                        onOpenSettings={(section) => onOpenSettings(section ?? "speechToText")}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
