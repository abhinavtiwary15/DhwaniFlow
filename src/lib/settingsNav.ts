export type SettingsSectionType =
  | "general"
  | "hotkeys"
  | "speechToText"
  | "privacyData"
  | "system"
  | "about";

export type SettingsNavGroup = "app" | "system";

export interface SettingsNavEntry {
  id: SettingsSectionType;
  group: SettingsNavGroup;
}

export interface SettingsNavInput {
  isSignedIn?: boolean;
  hasWorkspace?: boolean;
  canManageSettings?: boolean;
}

export const SECTION_ALIASES: Record<string, SettingsSectionType> = {
  transcription: "speechToText",
  speech: "speechToText",
  audio: "speechToText",
  hotkey: "hotkeys",
  privacy: "privacyData",
  permissions: "privacyData",
  developer: "system",
  softwareUpdates: "system",
  about: "about",
};

export function buildSettingsNav(_input?: SettingsNavInput): SettingsNavEntry[] {
  return [
    { id: "general", group: "app" },
    { id: "hotkeys", group: "app" },
    { id: "speechToText", group: "app" },
    { id: "privacyData", group: "system" },
    { id: "system", group: "system" },
    { id: "about", group: "system" },
  ];
}

export function resolveSettingsSection(
  requested: string | undefined,
  available: SettingsNavEntry[]
): SettingsSectionType {
  if (!requested) return "general";
  const section = SECTION_ALIASES[requested] ?? requested;
  if (available.some((entry) => entry.id === section)) return section as SettingsSectionType;
  return "general";
}
