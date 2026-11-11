// Auto-updater is disabled for DhwaniFlow.
class UpdateManager {
  constructor() {
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.lastUpdateInfo = null;
    this.isInstalling = false;
    this.isDownloading = false;
    this.isQuittingForUpdate = false;
    this.windowManager = null;
    this.autoUpdatesEnabled = false;
  }

  setWindowManager(windowManager) {
    this.windowManager = windowManager;
  }

  setupAutoUpdater() {}

  checkForUpdatesOnStartup() {}

  checkForUpdates() {
    return Promise.resolve({ updateAvailable: false });
  }

  downloadUpdate() {
    return Promise.resolve(false);
  }

  installUpdate() {}

  setAutoUpdatesEnabled(_enabled) {
    this.autoUpdatesEnabled = false;
  }

  getAutoUpdatesEnabled() {
    return false;
  }

  cleanup() {}
}

module.exports = UpdateManager;
