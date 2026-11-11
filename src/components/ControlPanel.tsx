import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useHotkey } from "../hooks/useHotkey";
import { useToast } from "./ui/useToast";
import {
  useTranscriptions,
  initializeTranscriptions,
  removeTranscription as removeFromStore,
  clearTranscriptions as clearStore,
} from "../stores/transcriptionStore";
import ControlPanelSidebar, { type ControlPanelView } from "./ControlPanelSidebar";
import ControlPanelTopBar from "./ControlPanelTopBar";
import HistoryView from "./HistoryView";
import SettingsModal from "./SettingsModal";
import CommandSearch from "./CommandSearch";

const DictionaryView = React.lazy(() => import("./DictionaryView"));

interface ControlPanelProps {
  initialSettingsSection?: string;
}

export default function ControlPanel({ initialSettingsSection }: ControlPanelProps = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const history = useTranscriptions();
  const [activeTab, setActiveTab] = useState<ControlPanelView>("home");
  const [showSettings, setShowSettings] = useState(!!initialSettingsSection);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(
    initialSettingsSection
  );
  const [showCommandSearch, setShowCommandSearch] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const hotkey = useHotkey();

  useEffect(() => {
    setIsLoading(true);
    initializeTranscriptions()
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Global hotkey for Command Search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandSearch((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const copyToClipboard = useCallback(
    (text: string) => {
      if (window.electronAPI?.writeClipboard) {
        window.electronAPI.writeClipboard(text);
      } else {
        navigator.clipboard.writeText(text);
      }
      toast({
        title: t("controlPanel.copied", "Copied to clipboard"),
      });
    },
    [toast, t]
  );

  const deleteTranscription = useCallback(
    async (id: number) => {
      removeFromStore(id);
      if (window.electronAPI?.deleteTranscription) {
        await window.electronAPI.deleteTranscription(id);
      }
    },
    []
  );

  const clearAllTranscriptions = useCallback(async () => {
    clearStore();
    if (window.electronAPI?.clearTranscriptions) {
      await window.electronAPI.clearTranscriptions();
    }
    toast({
      title: t("controlPanel.cleared", "All transcriptions cleared"),
    });
  }, [toast, t]);

  const openSettings = useCallback((section?: string) => {
    setSettingsSection(section);
    setShowSettings(true);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background select-none">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <ControlPanelSidebar
          activeView={activeTab}
          onViewChange={setActiveTab}
          onOpenSettings={() => openSettings("general")}
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <ControlPanelTopBar
          title={
            activeTab === "home"
              ? t("sidebar.home", "Home")
              : t("sidebar.dictionary", "Dictionary")
          }
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenSearch={() => setShowCommandSearch(true)}
          isSidePanelLayout={false}
          onExitSidePanel={() => {}}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === "home" && (
            <HistoryView
              history={history}
              isLoading={isLoading}
              hotkey={hotkey.hotkey || "Control+Space"}
              copyToClipboard={copyToClipboard}
              deleteTranscription={deleteTranscription}
              clearAllTranscriptions={clearAllTranscriptions}
              onOpenSettings={openSettings}
              showDiscarded={showDiscarded}
              onToggleDiscarded={() => setShowDiscarded(!showDiscarded)}
            />
          )}

          {activeTab === "dictionary" && (
            <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">{t("common.loading", "Loading...")}</div>}>
              <DictionaryView />
            </Suspense>
          )}
        </main>
      </div>

      {/* Modals */}
      <SettingsModal
        open={showSettings}
        onOpenChange={setShowSettings}
        initialSection={settingsSection}
      />

      <CommandSearch
        open={showCommandSearch}
        onOpenChange={setShowCommandSearch}
        onNavigate={(view) => setActiveTab(view)}
        onOpenSettings={openSettings}
      />
    </div>
  );
}
