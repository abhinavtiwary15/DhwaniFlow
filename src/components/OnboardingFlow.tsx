import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import OnboardingShell from "./onboarding/OnboardingShell";
import CompactPermissionsStep from "./onboarding/CompactPermissionsStep";
import GnaniSetupStep from "./onboarding/GnaniSetupStep";
import ShortcutSetupStep from "./onboarding/ShortcutSetupStep";
import { usePermissions } from "../hooks/usePermissions";
import { useSettingsStore } from "../stores/settingsStore";
import {
  type OnboardingStepId,
  clearOnboardingSession,
  getOnboardingProgress,
  STEP_ORDER,
} from "./onboarding/flow";
import { getDefaultHotkey } from "../utils/hotkeys";

interface OnboardingFlowProps {
  onComplete: (options?: { openSettings?: boolean }) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const permissions = usePermissions();

  const [currentStep, setCurrentStep] = useState<OnboardingStepId>(() => {
    return permissions.micPermissionGranted ? "gnani" : "permissions";
  });

  const [hotkey, setHotkey] = useState<string>(() => {
    return useSettingsStore.getState().dictationKey || getDefaultHotkey();
  });

  const handleFinish = useCallback(() => {
    useSettingsStore.setState({
      dictationKey: hotkey,
    });
    if (window.electronAPI?.setHotkey) {
      window.electronAPI.setHotkey(hotkey);
    }
    clearOnboardingSession();
    onComplete({ openSettings: false });
  }, [hotkey, onComplete]);

  const progress = getOnboardingProgress(currentStep, STEP_ORDER);

  if (currentStep === "permissions") {
    return (
      <CompactPermissionsStep
        permissions={permissions}
        onContinue={() => setCurrentStep("gnani")}
        progress={progress}
      />
    );
  }

  if (currentStep === "gnani") {
    return (
      <GnaniSetupStep
        onBack={() => setCurrentStep("permissions")}
        onContinue={() => setCurrentStep("dictation-hotkey")}
        progress={progress}
      />
    );
  }

  return (
    <OnboardingShell
      onBack={() => setCurrentStep("gnani")}
      onContinue={handleFinish}
      continueLabel={t("onboarding.getStarted", "Start Dictating")}
      progress={progress}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("onboarding.shortcut.title", "Dictation Shortcut")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "onboarding.shortcut.subtitle",
              "Press and hold this shortcut anywhere to speak, then release to paste."
            )}
          </p>
        </div>
        <ShortcutSetupStep
          value={hotkey}
          onChange={setHotkey}
          recommended={["Control+Space", "Alt+Space"]}
          captureLabel={t("onboarding.shortcut.capture", "Press shortcut...")}
          recommendedLabel={t("onboarding.shortcut.recommended", "Recommended")}
          chooseAnotherLabel={t("onboarding.shortcut.chooseAnother", "Choose another")}
        />
      </div>
    </OnboardingShell>
  );
}
