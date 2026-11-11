import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/useToast";
import { useSettingsStore } from "../../stores/settingsStore";
import type { DictionaryRow } from "./dictionaryViewModel";

export type EditFailure = { refused?: boolean; message?: string; };

export function useDictionaryActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const customDictionary = useSettingsStore((s) => s.customDictionary);
  const applyCustomDictionaryFromExternal = useSettingsStore(
    (s) => s.applyCustomDictionaryFromExternal
  );

  const addPersonalWords = useCallback(
    async (words: string[]): Promise<boolean> => {
      const valid = words
        .map((w) => w.trim())
        .filter((w) => w.length > 0 && !customDictionary.includes(w));
      if (valid.length === 0) return true;

      const next = [...customDictionary, ...valid];
      applyCustomDictionaryFromExternal(next);
      if (window.electronAPI?.setDictionary) {
        await window.electronAPI.setDictionary(next);
      }
      toast({
        title: t("dictionary.wordsAdded", { count: valid.length }),
      });
      return true;
    },
    [customDictionary, applyCustomDictionaryFromExternal, toast, t]
  );

  const deletePersonalWords = useCallback(
    async (words: string[]): Promise<boolean> => {
      const set = new Set(words);
      const next = customDictionary.filter((w) => !set.has(w));
      applyCustomDictionaryFromExternal(next);
      if (window.electronAPI?.setDictionary) {
        await window.electronAPI.setDictionary(next);
      }
      toast({
        title: t("dictionary.wordsDeleted", { count: words.length }),
      });
      return true;
    },
    [customDictionary, applyCustomDictionaryFromExternal, toast, t]
  );

  const editRow = useCallback(
    async (row: DictionaryRow, newWord: string): Promise<EditFailure | null> => {
    const trimmed = newWord.trim();
    if (!trimmed) return { refused: true, message: "Empty word" };
      if (!trimmed || trimmed === row.word) return null;
      const next = customDictionary.map((w) => (w === row.word ? trimmed : w));
      applyCustomDictionaryFromExternal(next);
      if (window.electronAPI?.setDictionary) {
        await window.electronAPI.setDictionary(next);
      }
      return null;
    },
    [customDictionary, applyCustomDictionaryFromExternal]
  );

  const exportPersonal = useCallback(async (): Promise<void> => {
    if (window.electronAPI?.exportDictionary) {
      await window.electronAPI.exportDictionary("json");
    } else {
      const blob = new Blob([JSON.stringify(customDictionary, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dhwaniflow-dictionary.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [customDictionary]);

  const clearAll = useCallback(async (): Promise<void> => {
    applyCustomDictionaryFromExternal([]);
    if (window.electronAPI?.setDictionary) {
      await window.electronAPI.setDictionary([]);
    }
    toast({
      title: t("dictionary.dictionaryCleared", "Dictionary cleared"),
    });
  }, [applyCustomDictionaryFromExternal, toast, t]);

  return {
    addPersonalWords,
    deletePersonalWords,
    editRow,
    exportPersonal,
    clearAll,
    setRowsHidden: async () => true,
    hideRow: async () => true,
    requestDeleteForEveryone: () => {},
  };
}
