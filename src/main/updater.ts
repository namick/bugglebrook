import { app } from 'electron';
import electronUpdater from 'electron-updater';

/**
 * Check GitHub Releases for a newer version. Only runs in packaged builds and
 * never in tests. Draft releases are invisible to the updater, so nothing
 * reaches players until a release is published by hand.
 */
export function startAutoUpdates(testMode: boolean): void {
  if (!app.isPackaged || testMode || process.env.BUGGLEBROOK_NO_UPDATES === '1') return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.warn('Update check failed:', err);
  });
}
