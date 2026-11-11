import {
  useId,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { CornerDownLeft, Upload } from "../icons";
import { Input } from "../ui/input";
import { cn } from "../lib/utils";

export type AddTarget = "personal";

export interface AddTargetOption {
  target: AddTarget;
  label: string;
}

interface DictionaryAddFieldProps {
  target?: AddTarget;
  targets?: AddTargetOption[];
  onTargetChange?: (target: AddTarget) => void;
  onAdd: (text: string) => Promise<boolean>;
  isInTarget: (word: string) => boolean;
  isHiddenInTarget?: (word: string) => boolean;
  onUnhide?: (word: string) => Promise<boolean>;
  onImport: () => void;
  importMenu?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

export function DictionaryAddField({
  onAdd,
  isInTarget,
  onImport,
  importMenu,
  inputRef,
  disabled = false,
}: DictionaryAddFieldProps): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const noticeId = useId();

  const trimmed = text.trim();
  const alreadyAdded = trimmed !== "" && !trimmed.includes(",") && isInTarget(trimmed);
  const notice = alreadyAdded ? t("dictionary.alreadyIn", "Already in dictionary") : null;
  const canAdd = trimmed !== "" && notice === null && !busy && !disabled;

  const submit = async (): Promise<void> => {
    if (!canAdd) return;
    const submitted = text;
    setText("");
    setBusy(true);
    let added = false;
    try {
      added = await onAdd(submitted);
    } finally {
      setBusy(false);
      if (!added) {
        setText((current) => (current.trim() === "" ? submitted : current));
      }
    }
  };

  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card ps-3 pe-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-surface-1",
        disabled && "opacity-60"
      )}
    >
      <Input
        dir="auto"
        ref={inputRef}
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) void submit();
        }}
        placeholder={t("dictionary.addPlaceholder", "Add word or comma-separated words...")}
        aria-invalid={notice !== null || undefined}
        aria-describedby={notice !== null ? noticeId : undefined}
        className="input-inline h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none placeholder:text-foreground/45 hover:border-0 focus-visible:ring-0 dark:bg-transparent"
      />
      {notice !== null ? (
        <span
          id={noticeId}
          title={notice}
          className="min-w-0 truncate text-[11px] text-foreground/45"
        >
          {notice}
        </span>
      ) : (
        trimmed !== "" && (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canAdd}
            aria-label={t("dictionary.addWord", "Add word")}
            className="flex shrink-0 items-center gap-1 text-[11px] text-foreground/45 transition-colors enabled:hover:text-primary"
          >
            {t("dictionary.add", "Add")}
            <CornerDownLeft size={11} />
          </button>
        )
      )}
      <div className="h-4 w-px bg-foreground/10 dark:bg-white/8" />
      {importMenu ?? (
        <button
          type="button"
          onClick={onImport}
          disabled={disabled}
          aria-label={t("dictionary.importWords", "Import words")}
          className="grid size-6 shrink-0 place-items-center rounded-[5px] text-foreground/45 transition-colors enabled:hover:bg-foreground/5 enabled:hover:text-foreground/70"
        >
          <Upload size={13} />
        </button>
      )}
    </div>
  );
}
