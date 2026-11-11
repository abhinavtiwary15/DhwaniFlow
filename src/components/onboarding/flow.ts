export const ONBOARDING_SESSION_KEY = "onboardingSessionV2";
export const LEGACY_ONBOARDING_STEP_KEY = "onboardingCurrentStep";
export const ONBOARDING_FLOW_VERSION = 2;

export interface OnboardingProgressState {
  index: number;
  total: number;
}

export type OnboardingStepId = "permissions" | "gnani" | "dictation-hotkey";

export const STEP_ORDER: OnboardingStepId[] = [
  "permissions",
  "gnani",
  "dictation-hotkey",
];

export interface OnboardingSession {
  version: typeof ONBOARDING_FLOW_VERSION;
  currentStepId: OnboardingStepId;
  history: OnboardingStepId[];
}

export function parseOnboardingSession(raw: string | null): OnboardingSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && data.version === ONBOARDING_FLOW_VERSION && STEP_ORDER.includes(data.currentStepId)) {
      return data;
    }
  } catch {}
  return null;
}

export function persistOnboardingSession(
  session: OnboardingSession,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(session));
}

export function clearOnboardingSession(
  storage: Pick<Storage, "removeItem"> = localStorage
): void {
  storage.removeItem(ONBOARDING_SESSION_KEY);
  storage.removeItem(LEGACY_ONBOARDING_STEP_KEY);
}

export function getNextOnboardingStep(
  currentStepId: OnboardingStepId,
  route: OnboardingStepId[] = STEP_ORDER
): OnboardingStepId | null {
  const index = route.indexOf(currentStepId);
  return index >= 0 ? (route[index + 1] ?? null) : (route[0] ?? null);
}

export function reconcileStepWithRoute(
  stepId: OnboardingStepId,
  route: OnboardingStepId[] = STEP_ORDER
): OnboardingStepId {
  if (route.includes(stepId)) return stepId;
  return route[0] ?? "permissions";
}

export function getOnboardingProgress(
  stepId: OnboardingStepId,
  route: OnboardingStepId[] = STEP_ORDER
): { index: number; total: number } | null {
  const index = route.indexOf(stepId);
  if (index === -1) return null;
  return { index, total: route.length };
}

export function isRequiredModelsOnboardingStepActive(_sessionValue: string | null): boolean {
  return false;
}
