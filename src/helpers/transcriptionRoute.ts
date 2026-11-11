export const BYOK_FILE_SIZE_LIMIT = 25 * 1024 * 1024;

export function byokFileSizeLimit(_provider?: string): number {
  return BYOK_FILE_SIZE_LIMIT;
}

export const STREAMING_ONLY_PROVIDERS: string[] = [];

export function resolveByokModel(_settings?: any): string | null {
  return null;
}

export interface GnaniRoute {
  provider: "gnani";
  language_code: string;
  format: "transcribe";
}

export function resolveTranscriptionRoute(options?: any): GnaniRoute {
  return {
    provider: "gnani",
    language_code: options?.language_code || options?.language || options?.settings?.gnaniLanguage || "hi-IN",
    format: "transcribe",
  };
}
