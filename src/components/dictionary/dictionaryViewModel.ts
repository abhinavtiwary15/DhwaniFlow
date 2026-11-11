import type { TFunction } from "i18next";
import { dictionaryWordKey } from "../../utils/snippets";

export type SortKey = "az" | "za" | "newest" | "oldest";

export const SORT_LABEL_KEYS: Record<SortKey, string> = {
  az: "dictionary.shared.sort.az",
  za: "dictionary.shared.sort.za",
  newest: "dictionary.shared.sort.newest",
  oldest: "dictionary.shared.sort.oldest",
};

export type SharedAccessState = "available";

export interface DictionaryRow {
  id: string;
  key: string;
  word: string;
  kind: "personal" | "shared";
  source?: "manual" | "learned";
  hidden?: boolean;
  deletable: boolean;
  editable: boolean;
  attribution?: any;
  badge?: string;
  otherLists?: any;
  usedInDictation?: boolean;
}

export function sortWords(words: string[], sort: SortKey): string[] {
  const copy = [...words];
  switch (sort) {
    case "az":
      return copy.sort((a, b) => a.localeCompare(b));
    case "za":
      return copy.sort((a, b) => b.localeCompare(a));
    case "newest":
    case "oldest":
    default:
      return copy;
  }
}

export function shownPersonalWords(words: string[]): string[] {
  return words;
}

export function listsShowingWord(_word: string): string[] {
  return ["personal"];
}

export function buildPicker(_input?: any) {
  return [
    { key: "personal", label: "Personal", count: _input?.personal?.length ?? 0, locked: false, group: "top" },
  ];
}

export function buildRows(input: {
  personal: string[];
  search?: string;
  sort: SortKey;
  t?: TFunction;
}): DictionaryRow[] {
  let list = input.personal || [];
  if (input.search && input.search.trim()) {
    const q = input.search.trim().toLowerCase();
    list = list.filter((w) => w.toLowerCase().includes(q));
  }
  list = sortWords(list, input.sort);

  return list.map((word) => {
    const k = dictionaryWordKey(word);
    return {
      id: k,
      key: k,
      word,
      kind: "personal" as const,
      deletable: true,
      editable: true,
    };
  });
}
