import { BrowserWindow, app } from 'electron';
import electronUpdater from 'electron-updater';
import { IPC } from '../shared/ipc';
import type { RotatingLog } from './log';
import { describeError } from './log';
import { UPDATE_CHECK_EVERY_MS, updateBlock } from './policy';

/**
 * Auto-updates from GitHub Releases (the `publish` block in
 * electron-builder.yml writes `app-update.yml` into packaged builds).
 *
 * The updater checks at launch and every few hours, downloads in the
 * background, and installs on quit. When a download is ready, the renderer
 * shows a wordless toast with a restart button. Draft releases are invisible
 * to it, so nothing reaches players until a person publishes a release.
 *
 * Off in dev runs, in tests, with `BUGGLEBROOK_NO_UPDATES=1`, and in builds
 * made without the updater (`__BB_UPDATER__`, for Steam).
 */
export class Updates {
  /** The version downloaded and waiting to install, if any. */
  private ready: string | null = null;
  private enabled = false;

  constructor(private readonly log: RotatingLog) {}

  start(testMode: boolean): void {
    const block = updateBlock({
      packaged: app.isPackaged,
      testMode,
      env: process.env,
      builtWithUpdater: __BB_UPDATER__,
    });
    if (block) {
      this.log.info(`Auto-update off (${block})`);
      return;
    }
    this.enabled = true;
    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (m: unknown) => this.log.info(`updater: ${String(m)}`),
      warn: (m: unknown) => this.log.warn(`updater: ${String(m)}`),
      error: (m: unknown) => this.log.error(`updater: ${describeError(m)}`),
      debug: () => undefined,
    };
    autoUpdater.on('update-downloaded', (info) => {
      this.ready = info.version;
      this.log.info(`Update ${info.version} downloaded`);
      for (const win of BrowserWindow.getAllWindows()) this.tell(win);
    });
    const check = (): void => {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        this.log.warn(`Update check failed: ${describeError(err)}`);
      });
    };
    check();
    setInterval(check, UPDATE_CHECK_EVERY_MS).unref();
  }

  /** Tell a window an update is waiting (again after a reload). */
  tell(win: BrowserWindow): void {
    if (this.ready && !win.webContents.isDestroyed()) win.webContents.send(IPC.updateReady, this.ready);
  }

  /** The toast's restart button. Ignored when no update is waiting. */
  restart(): void {
    if (!this.enabled || !this.ready) {
      this.log.info('Restart for update asked, but no update is waiting');
      return;
    }
    this.log.info(`Restarting to install ${this.ready}`);
    // Closing the window runs the usual save-before-close handshake first.
    electronUpdater.autoUpdater.quitAndInstall(true, true);
  }
}
