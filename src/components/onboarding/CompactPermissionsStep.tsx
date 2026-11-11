import { useState, type ReactNode } from "react";
import { CircleCheck } from "../icons";
import { useTranslation } from "react-i18next";
import microphoneIcon from "@/assets/onboarding-permission-microphone.webp";
import accessibilityIcon from "@/assets/onboarding-permission-accessibility.webp";
import type { UsePermissionsReturn } from "../../hooks/usePermissions";
import { getPlatform } from "../../utils/platform";
import { areRequiredPermissionsMet } from "../../utils/permissions";
import OnboardingShell from "./OnboardingShell";

interface CompactPermissionsStepProps {
  permissions: UsePermissionsReturn;
  onBack?: () => void;
  onContinue: () => void;
  progress?: any;
}

interface PermissionRowProps {
  title: string;
  description: string;
  badge?: string;
  granted: boolean;
  busy: boolean;
  disabled?: boolean;
  iconSrc?: string;
  icon?: ReactNode;
  onRequest: () => Promise<void>;
}

function PermissionRow({
  title,
  description,
  badge,
  granted,
  busy,
  disabled = false,
  iconSrc,
  icon,
  onRequest,
}: PermissionRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-16 items-center gap-3">
      {icon ?? (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          decoding="async"
          draggable={false}
          className="size-10 shrink-0 select-none"
        />
      )}

      <div className="min-w-0 flex-1 text-start">
        <p className="text-sm font-medium leading-5 text-foreground">
          {title}
          {badge && (
            <span className="ms-1.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 align-middle text-[10px] font-normal leading-4 text-muted-foreground">
              {badge}
            </span>
          )}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
          {description}
        </p>
      </div>

      <button
        type="button"
        disabled={busy || disabled || granted}
        onClick={() => void onRequest()}
        className={`inline-flex h-8 min-w-20 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-normal transition-colors disabled:cursor-default ${
          granted
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {granted && !busy && <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />}
        {busy
          ? t("common.loading", "Loading...")
          : granted
            ? t("onboarding.rehaul.permissions.enabled", "Enabled")
            : t("onboarding.rehaul.permissions.enable", "Enable")}
      </button>
    </div>
  );
}

export default function CompactPermissionsStep({
  permissions,
  onBack,
  onContinue,
  progress,
}: CompactPermissionsStepProps) {
  const { t } = useTranslation();
  const [busyMic, setBusyMic] = useState(false);
  const [busyAcc, setBusyAcc] = useState(false);
  const platform = getPlatform();
  const requiredGranted = areRequiredPermissionsMet(permissions.micPermissionGranted);
  const showAccessibility = platform === "darwin";

  const handleRequestMic = async () => {
    setBusyMic(true);
    try {
      await permissions.requestMicPermission();
    } finally {
      setBusyMic(false);
    }
  };

  const handleRequestAcc = async () => {
    setBusyAcc(true);
    try {
      await permissions.requestAccessibilityPermission();
    } finally {
      setBusyAcc(false);
    }
  };

  return (
    <OnboardingShell
      onBack={onBack}
      onContinue={onContinue}
      continueLabel={t("common.continue", "Continue")}
      progress={progress}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("onboarding.rehaul.permissions.title", "Grant Permissions")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "onboarding.rehaul.permissions.subtitle",
              "DhwaniFlow needs microphone access to transcribe your speech."
            )}
          </p>
        </div>

        <div className="divide-y divide-border/60">
          <PermissionRow
            title={t("onboarding.rehaul.permissions.microphone.title", "Microphone")}
            description={t(
              "onboarding.rehaul.permissions.microphone.description",
              "Required for voice recording and dictation."
            )}
            granted={permissions.micPermissionGranted}
            busy={busyMic}
            iconSrc={microphoneIcon}
            onRequest={handleRequestMic}
          />

          {showAccessibility && (
            <PermissionRow
              title={t("onboarding.rehaul.permissions.accessibility.title", "Accessibility")}
              description={t(
                "onboarding.rehaul.permissions.accessibility.description",
                "Allows typing transcriptions directly into active apps."
              )}
              granted={permissions.accessibilityPermissionGranted}
              busy={busyAcc}
              iconSrc={accessibilityIcon}
              onRequest={handleRequestAcc}
            />
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}
