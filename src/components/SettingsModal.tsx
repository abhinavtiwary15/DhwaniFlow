import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sliders,
  Mic,
  Wrench,
  Keyboard,
  Shield,
  Info,
} from "./icons";
import SidebarModal, { type SidebarItem } from "./ui/SidebarModal";
import SettingsPage from "./SettingsPage";
import {
  buildSettingsNav,
  resolveSettingsSection,
  type SettingsSectionType,
} from "../lib/settingsNav";

export type { SettingsSectionType };

const SECTION_ICONS: Record<SettingsSectionType, React.ComponentType<{ className?: string }>> = {
  general: Sliders,
  hotkeys: Keyboard,
  speechToText: Mic,
  privacyData: Shield,
  system: Wrench,
  about: Info,
};

const SECTION_LABELS: Record<SettingsSectionType, string> = {
  general: "General",
  hotkeys: "Hotkeys",
  speechToText: "Speech",
  privacyData: "Privacy",
  system: "System",
  about: "About",
};

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: string;
}

export default function SettingsModal({
  open,
  onOpenChange,
  initialSection,
}: SettingsModalProps) {
  const { t } = useTranslation();

  const navEntries = useMemo(() => buildSettingsNav(), []);

  const [activeSection, setActiveSection] = useState<SettingsSectionType>(() =>
    resolveSettingsSection(initialSection, navEntries)
  );

  const prevInitialSection = React.useRef(initialSection);
  React.useEffect(() => {
    if (initialSection && initialSection !== prevInitialSection.current) {
      prevInitialSection.current = initialSection;
      setActiveSection(resolveSettingsSection(initialSection, navEntries));
    }
  }, [initialSection, navEntries]);

  const sidebarItems: SidebarItem<SettingsSectionType>[] = useMemo(() => {
    return navEntries.map((entry) => ({
      id: entry.id,
      label: t(`settings.sections.${entry.id}`, SECTION_LABELS[entry.id] || entry.id),
      icon: SECTION_ICONS[entry.id],
    }));
  }, [navEntries, t]);

  return (
    <SidebarModal
      open={open}
      onOpenChange={onOpenChange}
      sidebarItems={sidebarItems}
      activeSection={activeSection}
      onSectionChange={(id) => setActiveSection(id)}
      title={t("settings.title", "Settings")}
    >
      <div className="p-6 h-full overflow-y-auto">
        <SettingsPage section={activeSection} />
      </div>
    </SidebarModal>
  );
}
