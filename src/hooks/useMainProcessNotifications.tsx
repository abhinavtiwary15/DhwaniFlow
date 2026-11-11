import { useEffect } from "react";
import type { TFunction } from "i18next";
import type { ToastContextType } from "../components/ui/useToast";

/**
 * Surfaces main-process notifications (hotkey fallback/failure) as toasts in the dictation window.
 */
export function useMainProcessNotifications({
  toast,
  t,
}: {
  toast: ToastContextType["toast"];
  dismiss?: ToastContextType["dismiss"];
  t: TFunction;
}): void {
  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title", "Hotkey changed"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title", "Hotkey unavailable"),
        description: data?.error || t("app.toasts.hotkeyUnavailable.description", "Could not register hotkey."),
        duration: 10000,
      });
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
    };
  }, [toast, t]);
}
