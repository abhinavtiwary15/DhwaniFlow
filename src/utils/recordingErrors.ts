import { TFunction } from "i18next";
import { describeProviderError } from "./describeProviderError";

type RecordingError = {
  code?: string;
  title: string;
  description?: string;
  messageKey?: string;
  messageParams?: Record<string, string | number | boolean>;
  surface?: string;
  selectionEditFatal?: boolean;
  /** Toast variant; defaults to destructive for genuine failures. */
  variant?: "default" | "destructive";
};

export function getRecordingErrorTitle(error: RecordingError, t: TFunction): string {
  if (error.code === "ACCESSIBILITY_PERMISSION_REQUIRED") {
    return t("hooks.audioRecording.pastePermission.title");
  }
  if (error.code === "PASTE_FAILED") return t("hooks.audioRecording.pasteFailed.title");
  if (error.selectionEditFatal) {
    return t("hooks.audioRecording.selectionEditing.notAppliedTitle");
  }
  if (error.code === "NETWORK_ERROR") return t(error.title);
  if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_REQUIRED") {
    return t("hooks.audioRecording.errorTitles.sessionExpired");
  }
  if (error.code === "OFFLINE") return t("hooks.audioRecording.errorTitles.offline");
  if (error.code === "AGENT_REASONING_FAILED") {
    return t("hooks.audioRecording.errorTitles.agentUnavailable");
  }
  if (error.code === "SCREEN_CONTEXT_SKIPPED") {
    return t("hooks.audioRecording.errorTitles.screenContextSkipped");
  }
  if (error.code === "LIMIT_REACHED")
    return t("hooks.audioRecording.errorTitles.cloudLimitReached");
  if (error.code === "PROVIDER_RATE_LIMITED" || error.code === "RATE_LIMITED")
    return t("hooks.audioRecording.errorTitles.providerRateLimited");
  if (error.code === "NO_KEY") return "No API Key";
  if (error.code === "BAD_KEY") return "Invalid API Key";
  if (error.code === "AUDIO_TOO_LONG" || error.code === "TOO_LONG") return "Recording Too Long";
  if (error.code?.startsWith("PROVIDER_")) {
    return t(
      error.surface === "llm" ? "providerErrors.titles.llm" : "providerErrors.titles.transcription"
    );
  }
  return error.title;
}

export function getRecordingErrorDescription(error: RecordingError, t: TFunction): string {
  if (error.code === "ACCESSIBILITY_PERMISSION_REQUIRED") {
    return t("hooks.audioRecording.pastePermission.description");
  }
  if (error.code === "NO_KEY") {
    return "Please set your Gnani API key in Settings.";
  }
  if (error.code === "BAD_KEY") {
    return "Your Gnani API key is invalid or unauthorized.";
  }
  if (error.code === "RATE_LIMITED" || error.code === "PROVIDER_RATE_LIMITED") {
    return "Rate limit reached. Please wait a moment.";
  }
  if (error.code === "OFFLINE") {
    return "Network connection unavailable. Please check your internet connection.";
  }
  if (error.code === "AUDIO_TOO_LONG" || error.code === "TOO_LONG") {
    return "Recording exceeds the maximum supported duration.";
  }
  if (error.messageKey) return describeProviderError(error, t).description;
  return error.description ?? "";
}
