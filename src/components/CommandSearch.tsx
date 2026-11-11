import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Search,
  Mic,
  Sliders,
  Keyboard,
  Shield,
  Wrench,
  BookOpen,
} from "./icons";
import { cn } from "./lib/utils";
import type { TranscriptionItem } from "../types/electron";
import { useTranscriptions } from "../stores/transcriptionStore";

interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: "home" | "dictionary") => void;
  onOpenSettings: (section?: string) => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Settings" | "History";
  icon: any;
  action: () => void;
}

export default function CommandSearch({
  open,
  onOpenChange,
  onNavigate,
  onOpenSettings,
}: CommandSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptions = useTranscriptions();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: "nav-home",
        title: t("sidebar.home", "Home (History)"),
        category: "Navigation",
        icon: Mic,
        action: () => {
          onNavigate("home");
          onOpenChange(false);
        },
      },
      {
        id: "nav-dictionary",
        title: t("sidebar.dictionary", "Dictionary & Snippets"),
        category: "Navigation",
        icon: BookOpen,
        action: () => {
          onNavigate("dictionary");
          onOpenChange(false);
        },
      },
      {
        id: "settings-general",
        title: t("settings.sections.general", "General Settings"),
        category: "Settings",
        icon: Sliders,
        action: () => {
          onOpenSettings("general");
          onOpenChange(false);
        },
      },
      {
        id: "settings-hotkeys",
        title: t("settings.sections.hotkeys", "Hotkeys & Activation"),
        category: "Settings",
        icon: Keyboard,
        action: () => {
          onOpenSettings("hotkeys");
          onOpenChange(false);
        },
      },
      {
        id: "settings-speech",
        title: t("settings.sections.speechToText", "Speech to Text"),
        category: "Settings",
        icon: Mic,
        action: () => {
          onOpenSettings("speechToText");
          onOpenChange(false);
        },
      },
      {
        id: "settings-privacy",
        title: t("settings.sections.privacyData", "Privacy & Data"),
        category: "Settings",
        icon: Shield,
        action: () => {
          onOpenSettings("privacyData");
          onOpenChange(false);
        },
      },
      {
        id: "settings-system",
        title: t("settings.sections.system", "System & Hardware"),
        category: "Settings",
        icon: Wrench,
        action: () => {
          onOpenSettings("system");
          onOpenChange(false);
        },
      },
    ];

    if (query.trim()) {
      const q = query.toLowerCase();
      // Add matching transcriptions
      const matchingHistory = transcriptions
        .filter((t) => t.text?.toLowerCase().includes(q))
        .slice(0, 5)
        .map((t) => ({
          id: `history-${t.id}`,
          title: t.text,
          category: "History" as const,
          icon: Mic,
          action: () => {
            onNavigate("home");
            onOpenChange(false);
          },
        }));

      return [...list.filter((item) => item.title.toLowerCase().includes(q)), ...matchingHistory];
    }

    return list;
  }, [query, t, transcriptions, onNavigate, onOpenSettings, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].action();
        }
      }
    },
    [items, selectedIndex]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-150" />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-md transition-all duration-150 animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
            <Search size={16} className="text-muted-foreground/70" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={t("commandSearch.placeholder", "Type a command or search...")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
            {items.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {t("commandSearch.noResults", "No results found.")}
              </p>
            ) : (
              items.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-xs transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-foreground/80 hover:bg-foreground/5"
                    )}
                  >
                    <Icon size={14} className={isSelected ? "text-primary-foreground" : "text-muted-foreground"} />
                    <span className="flex-1 truncate">{item.title}</span>
                    <span
                      className={cn(
                        "text-[10px] opacity-60",
                        isSelected ? "text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {item.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
