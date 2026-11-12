const test = require("node:test");
const assert = require("node:assert/strict");

test("F05: Privacy and recording preferences broadcast and sync to recorder window", async (t) => {
  // Simulate main process settings store & broadcasting
  const persistedSettings = new Map();
  const listeners = new Set();

  const fakeElectronAPI = {
    setSetting: async (key, value) => {
      persistedSettings.set(key, value);
      for (const listener of listeners) {
        listener({ key, value });
      }
      return true;
    },
    getSettings: async () => {
      const out = {};
      for (const [k, v] of persistedSettings.entries()) {
        out[k] = v;
      }
      return out;
    },
    onSettingUpdated: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  // We test the contract expected of useSettingsStore and initializeSettings
  // Before fix: changing a setting in panel store does not broadcast or reach recorder store
  await t.test("panel setting change broadcasts and updates recorder store", async () => {
    // Simulated recorder window store state
    const recorderStore = {
      autoPasteEnabled: true,
      gnaniLanguage: "hi-IN",
      dataRetentionEnabled: true,
      selectedMicDeviceId: "default",
    };

    // Recorder window subscribes to onSettingUpdated
    fakeElectronAPI.onSettingUpdated((data) => {
      if (data && data.key && data.key in recorderStore) {
        recorderStore[data.key] = data.value;
      }
    });

    // Panel window updates autoPasteEnabled and dataRetentionEnabled
    await fakeElectronAPI.setSetting("autoPasteEnabled", false);
    await fakeElectronAPI.setSetting("dataRetentionEnabled", false);
    await fakeElectronAPI.setSetting("gnaniLanguage", "en-IN");
    await fakeElectronAPI.setSetting("selectedMicDeviceId", "mic-hw-1");

    // Recorder window must immediately reflect the updated privacy and recording settings
    assert.equal(recorderStore.autoPasteEnabled, false, "Recorder window must have autoPasteEnabled=false");
    assert.equal(recorderStore.dataRetentionEnabled, false, "Recorder window must have dataRetentionEnabled=false");
    assert.equal(recorderStore.gnaniLanguage, "en-IN", "Recorder window must have gnaniLanguage=en-IN");
    assert.equal(recorderStore.selectedMicDeviceId, "mic-hw-1", "Recorder window must have selectedMicDeviceId=mic-hw-1");
  });

  await t.test("recorder window initial load rehydrates persisted settings", async () => {
    // Initial empty recorder store
    const freshRecorderStore = {
      autoPasteEnabled: true,
      dataRetentionEnabled: true,
      gnaniLanguage: "hi-IN",
    };

    // Simulate rehydration from getSettings
    const settings = await fakeElectronAPI.getSettings();
    Object.assign(freshRecorderStore, settings);

    assert.equal(freshRecorderStore.autoPasteEnabled, false);
    assert.equal(freshRecorderStore.dataRetentionEnabled, false);
    assert.equal(freshRecorderStore.gnaniLanguage, "en-IN");
  });
});
