import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, Search, Trash2, BookOpen, Sparkles } from "./icons";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { PAGE_CONTENT_WIDTH_CLASS } from "./ui/pageWidth";
import { cn } from "./lib/utils";
import { CARD_SURFACE_CLASS } from "./ui/surfaces";
import { useSettingsStore } from "../stores/settingsStore";
import { DictionaryAddField } from "./dictionary/DictionaryAddField";
import { DictionaryWordList } from "./dictionary/DictionaryWordList";
import {
  buildRows,
  SORT_LABEL_KEYS,
  type SortKey,
  type DictionaryRow,
} from "./dictionary/dictionaryViewModel";
import { useDictionaryActions } from "./dictionary/useDictionaryActions";
import SnippetsView from "./SnippetsView";
import DictionaryEmptyIllustration from "./DictionaryEmptyIllustration";

export default function DictionaryView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"words" | "snippets">("words");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [confirmClear, setConfirmClear] = useState(false);

  const customDictionary = useSettingsStore((s) => s.customDictionary);
  const actions = useDictionaryActions();

  const rows = useMemo(() => {
    return buildRows({
      personal: customDictionary,
      search,
      sort,
      t,
    });
  }, [customDictionary, search, sort, t]);

  const handleAdd = useCallback(
    async (text: string): Promise<boolean> => {
      const words = text
        .split(/[,;\n]/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
      return actions.addPersonalWords(words);
    },
    [actions]
  );

  const cycleSort = useCallback(() => {
    const keys: SortKey[] = ["az", "za", "newest", "oldest"];
    const nextIdx = (keys.indexOf(sort) + 1) % keys.length;
    setSort(keys[nextIdx]);
  }, [sort]);

  return (
    <div className={cn(PAGE_CONTENT_WIDTH_CLASS, "px-6 pt-4 pb-6")}>
      {/* Header and Tab switcher */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("dictionary.title", "Dictionary & Snippets")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "dictionary.subtitle",
              "Teach DhwaniFlow unique terms, code vocabulary, and text expansions."
            )}
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-border/70 bg-card/60 p-0.5 dark:border-white/10 dark:bg-surface-1">
          <button
            onClick={() => setActiveTab("words")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "words"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen size={13} />
            <span>{t("dictionary.wordsTab", "Words")}</span>
            <span className="ms-1 rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px]">
              {customDictionary.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("snippets")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "snippets"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles size={13} />
            <span>{t("dictionary.snippetsTab", "Snippets")}</span>
          </button>
        </div>
      </div>

      {activeTab === "snippets" ? (
        <SnippetsView />
      ) : (
        <div className="space-y-4">
          {/* Add word field */}
          <DictionaryAddField
            onAdd={handleAdd}
            isInTarget={(word) => customDictionary.includes(word)}
            onImport={() => void actions.exportPersonal()}
          />

          {/* Search and List Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("dictionary.searchPlaceholder", "Search words...")}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cycleSort}
                className="h-8 text-xs text-muted-foreground"
              >
                {t(SORT_LABEL_KEYS[sort], sort)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void actions.exportPersonal()}
                className="h-8 text-xs text-muted-foreground"
                title={t("dictionary.export", "Export dictionary")}
              >
                <Download size={13} className="mr-1" />
                {t("dictionary.export", "Export")}
              </Button>
              {customDictionary.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirmClear) {
                      void actions.clearAll();
                      setConfirmClear(false);
                    } else {
                      setConfirmClear(true);
                    }
                  }}
                  className={cn(
                    "h-8 text-xs transition-colors",
                    confirmClear ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground"
                  )}
                >
                  <Trash2 size={13} className="mr-1" />
                  {confirmClear
                    ? t("dictionary.confirmClear", "Confirm Clear?")
                    : t("dictionary.clearAll", "Clear all")}
                </Button>
              )}
            </div>
          </div>

          {/* Word List or Empty State */}
          {rows.length === 0 ? (
            customDictionary.length === 0 ? (
              <div
                className={cn(
                  CARD_SURFACE_CLASS,
                  "flex min-h-64 flex-col items-center justify-center p-8 text-center rounded-2xl border border-border/70 dark:border-white/10"
                )}
              >
                <div className="mb-4">
                  <DictionaryEmptyIllustration variant="dictionary" />
                </div>
                <h3 className="text-base font-medium text-foreground">
                  {t("dictionary.emptyTitle", "Your dictionary is empty")}
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t(
                    "dictionary.emptyDesc",
                    "Add domain-specific jargon, variable names, or Hindi/Hinglish terms to improve transcription accuracy."
                  )}
                </p>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t("dictionary.noSearchResults", "No matching words found.")}
              </div>
            )
          ) : (
            <div
              className={cn(
                CARD_SURFACE_CLASS,
                "overflow-hidden rounded-2xl border border-border/70 dark:border-white/10"
              )}
            >
              <DictionaryWordList
                rows={rows}
                hiddenList={false}
                onEdit={(row, word) => actions.editRow(row, word)}
                onDelete={(row) => void actions.deletePersonalWords([row.word])}
                onHide={() => Promise.resolve(true)}
                onUnhide={() => Promise.resolve(true)}
                onDeleteForEveryone={() => {}}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
