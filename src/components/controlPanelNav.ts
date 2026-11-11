import type React from "react";
import { useTranslation } from "react-i18next";
import { Home, BookOpen } from "./icons";

export type ControlPanelView = "home" | "dictionary";

export interface ControlPanelNavItem {
  id: ControlPanelView;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * Single source of truth for main-window navigation: Home and Dictionary.
 */
export function useControlPanelNavItems(): ControlPanelNavItem[] {
  const { t } = useTranslation();

  return [
    { id: "home", label: t("sidebar.home", "Home"), icon: Home },
    { id: "dictionary", label: t("sidebar.dictionary", "Dictionary"), icon: BookOpen },
  ];
}
