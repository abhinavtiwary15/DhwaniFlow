import React from "react";
import { Settings } from "./icons";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { useControlPanelNavItems, type ControlPanelView } from "./controlPanelNav";

export type { ControlPanelView };

interface ControlPanelSidebarProps {
  activeView: ControlPanelView;
  onViewChange: (view: ControlPanelView) => void;
  onOpenSettings: () => void;
  updateAction?: React.ReactNode;
}

export default function ControlPanelSidebar({
  activeView,
  onViewChange,
  onOpenSettings,
  updateAction,
}: ControlPanelSidebarProps) {
  const { t } = useTranslation();
  const navItems = useControlPanelNavItems();

  return (
    <div className="w-48 h-full shrink-0 flex flex-col bg-surface-window border-r border-border/50">
      <div
        className="w-full h-10 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <nav className="flex flex-col gap-0.5 px-2 pt-2 pb-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "group relative flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md outline-none transition-colors duration-150 text-start",
                "focus-visible:ring-1 focus-visible:ring-primary/30",
                isActive
                  ? "bg-primary/8 dark:bg-primary/10 text-primary font-medium"
                  : "text-foreground/80 hover:bg-foreground/4 dark:hover:bg-white/4 active:bg-foreground/6"
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  isActive
                    ? "text-primary"
                    : "text-foreground/70 group-hover:text-foreground/90 dark:text-foreground/65 dark:group-hover:text-foreground/85"
                )}
              />
              <span className="text-[13px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {updateAction && <div className="px-2 pb-2">{updateAction}</div>}

      <div className="p-2 border-t border-border/40">
        <button
          onClick={onOpenSettings}
          className="group flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-start outline-none text-foreground/80 hover:bg-foreground/4 dark:hover:bg-white/4 transition-colors duration-150"
        >
          <Settings size={16} className="text-foreground/70 group-hover:text-foreground/90" />
          <span className="text-[13px]">{t("sidebar.settings", "Settings")}</span>
        </button>
      </div>
    </div>
  );
}
