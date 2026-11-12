import test from "node:test";
import assert from "node:assert/strict";

test("F05: useSettingsStore notifies IPC and handles broadcast for privacy settings", async () => {
  const ipcSetCalls: Array<{ key: string; value: any }> = [];
  let onSettingUpdatedListener: ((data: { key?: string; value?: any }) => void) | null = null;

  (globalThis as any).window = {
    electronAPI: {
      setSetting: (key: string, value: any) => {
        ipcSetCalls.push({ key, value });
        return Promise.resolve(true);
      },
      getSettings: () => Promise.resolve({ autoPasteEnabled: false, gnaniLanguage: "en-IN" }),
      onSettingUpdated: (cb: (data: { key?: string; value?: any }) => void) => {
        onSettingUpdatedListener = cb;
        return () => {
          onSettingUpdatedListener = null;
        };
      },
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  };

  const { useSettingsStore, initializeSettings, getSettings } = await import(
    "../../src/stores/settingsStore"
  );

  // 1. Changing autoPasteEnabled must invoke setSetting IPC
  useSettingsStore.getState().setAutoPasteEnabled(false);
  assert.ok(
    ipcSetCalls.some((c) => c.key === "autoPasteEnabled" && c.value === false),
    "setAutoPasteEnabled must persist via setSetting IPC"
  );

  // 2. Initializing settings must rehydrate getSettings() from main process
  await initializeSettings();
  assert.equal(
    getSettings().gnaniLanguage,
    "en-IN",
    "initializeSettings must rehydrate gnaniLanguage from getSettings IPC"
  );

  // 3. Receiving onSettingUpdated broadcast for dataRetentionEnabled must update store
  assert.ok(onSettingUpdatedListener, "onSettingUpdated must be registered");
  onSettingUpdatedListener!({ key: "dataRetentionEnabled", value: false });
  assert.equal(
    getSettings().dataRetentionEnabled,
    false,
    "Broadcast for dataRetentionEnabled must update recorder store state"
  );
});
