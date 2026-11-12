import React, { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import App from "./App.jsx";
import { useControlPanelWindowDrag } from "./hooks/useControlPanelWindowDrag";
import { useTheme } from "./hooks/useTheme";
import { isControlPanelWindow } from "./utils/windowContext.ts";

const ControlPanel = React.lazy(() => import("./components/ControlPanel.tsx"));
const OnboardingFlow = React.lazy(() => import("./components/OnboardingFlow.tsx"));

export default function AppRouter() {
  useTheme();
  return <MainApp />;
}

function MainApp() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postOnboardingSettingsSection, setPostOnboardingSettingsSection] = useState(undefined);

  const isControlPanel = isControlPanelWindow();
  useControlPanelWindowDrag(isControlPanel);

  useEffect(() => {
    const onboardingCompleted = localStorage.getItem("onboardingCompleted") === "true";
    if (isControlPanel && !onboardingCompleted) {
      setShowOnboarding(true);
      window.electronAPI?.setOnboardingActive?.(true);
    } else if (onboardingCompleted) {
      window.electronAPI?.setOnboardingActive?.(false);
    }
    setIsLoading(false);
  }, [isControlPanel]);

  const handleOnboardingComplete = (options) => {
    if (options?.openSettings) {
      setPostOnboardingSettingsSection("speechToText");
    }
    setShowOnboarding(false);
    localStorage.setItem("onboardingCompleted", "true");
    window.electronAPI?.setOnboardingActive?.(false);
  };

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (isControlPanel && showOnboarding) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return isControlPanel ? (
    <Suspense fallback={<LoadingFallback />}>
      <ControlPanel initialSettingsSection={postOnboardingSettingsSection} />
    </Suspense>
  ) : (
    <App />
  );
}

function LoadingFallback({ message }) {
  const { t } = useTranslation();
  const fallbackMessage = message || t("common.loading", "Loading...");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-7 h-7 rounded-full border-[2.5px] border-transparent border-t-primary animate-[spinner-rotate_0.8s_cubic-bezier(0.4,0,0.2,1)_infinite]" />
        {fallbackMessage && (
          <p className="text-[13px] font-medium text-muted-foreground tracking-[-0.01em]">
            {fallbackMessage}
          </p>
        )}
      </div>
    </div>
  );
}
