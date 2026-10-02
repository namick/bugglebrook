import { BrowserWindow, Menu, app, dialog, ipcMain, screen, shell } from 'electron';
import { join } from 'node:path';
import { IPC } from '../shared/ipc';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { RotatingLog, describeError } from './log';
import { PhotoStore } from './photoStore';
import { ReloadBudget, rendererErrorText } from './policy';
import { SaveStore } from './saveStore';
import { SettingsStore } from './settingsStore';
import { Updates } from './updater';
import { MIN_WINDOW_SIZE, WindowStateStore, placeWindow } from './windowState';
import type { DisplayArea } from './windowState';

const testMode = process.env.BUGGLEBROOK_TEST === '1';

// Tests point userData at a temp dir so they never touch real saves.
if (process.env.BUGGLEBROOK_USER_DATA) app.setPath('userData', process.env.BUGGLEBROOK_USER_DATA);

// One copy at a time: a second launch focuses the first and exits.
if (!testMode && !app.requestSingleInstanceLock()) app.exit(0);

// Let WebGL fall back to the software renderer on machines without a usable
// GPU (VMs, CI under xvfb). We only ever load our own bundled content.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

const userData = app.getPath('userData');
// A local log file only. Nothing is ever sent anywhere.
const log = new RotatingLog(join(userData, 'logs', 'main.log'));
log.info(
  `Bugglebrook ${app.getVersion()} on ${process.platform} ${process.arch}, Electron ${process.versions.electron}`,
);
process.on('uncaughtException', (err) => log.error(`Main process: ${describeError(err)}`));
process.on('unhandledRejection', (err) => log.error(`Main process (promise): ${describeError(err)}`));

const saves = new SaveStore(join(userData, 'saves'));
// Fullscreen by default for players; windowed under test so E2E runs stay predictable.
const settings = new SettingsStore(join(userData, 'settings.json'), {
  ...DEFAULT_SETTINGS,
  fullscreen: !testMode,
});
// Photos go to <Pictures>/Bugglebrook/. Tests point them at a temp dir instead.
const photos = new PhotoStore(
  testMode && process.env.BUGGLEBROOK_PICTURES
    ? process.env.BUGGLEBROOK_PICTURES
    : join(app.getPath('pictures'), 'Bugglebrook'),
);
// Where the window was. Tests always open at the same size, so they skip it.
const windowState = testMode ? null : new WindowStateStore(join(userData, 'window-state.json'));
const updates = new Updates(log);
let mainWindow: BrowserWindow | null = null;

function registerIpc(): void {
  ipcMain.handle(IPC.savesList, () => saves.list());
  ipcMain.handle(IPC.savesRead, (_e, slot: unknown) => saves.read(SaveStore.assertSlot(slot)));
  ipcMain.handle(IPC.savesWrite, (_e, slot: unknown, data: unknown) =>
    saves.write(SaveStore.assertSlot(slot), data),
  );
  ipcMain.handle(IPC.savesRemove, (_e, slot: unknown) => saves.remove(SaveStore.assertSlot(slot)));
  ipcMain.handle(IPC.savesReadBackup, (_e, slot: unknown) => saves.readBackup(SaveStore.assertSlot(slot)));
  ipcMain.handle(IPC.savesRecover, (_e, slot: unknown) => saves.recover(SaveStore.assertSlot(slot)));
  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsSet, async (e, raw: unknown) => {
    const next = await settings.set(raw);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && win.isFullScreen() !== next.fullscreen) win.setFullScreen(next.fullscreen);
    return next;
  });
  ipcMain.handle(IPC.photosSave, (_e, png: unknown) => photos.save(png));
  ipcMain.on(IPC.quit, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.on(IPC.logError, (_e, raw: unknown) => {
    const text = rendererErrorText(raw);
    if (text) log.error(`Renderer: ${text}`);
  });
  ipcMain.on(IPC.updateRestart, () => updates.restart());
}

function displayAreas(): DisplayArea[] {
  return screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea }));
}

/** Remember the windowed size and spot (not fullscreen's) for next time. */
function trackWindowState(win: BrowserWindow, store: WindowStateStore): void {
  win.on('close', () => {
    if (win.isDestroyed()) return;
    const bounds = win.isFullScreen() || win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    store.write({
      bounds,
      maximized: win.isMaximized(),
      displayId: screen.getDisplayMatching(bounds).id,
    });
  });
}

/** A crashed renderer reloads to the menu (the autosave has the world). A hung one asks first. */
function guardRenderer(win: BrowserWindow): void {
  const budget = new ReloadBudget();
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error(`Renderer gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    if (budget.take(Date.now())) {
      log.info('Reloading the renderer');
      win.webContents.reload();
    } else {
      log.error('Renderer crashed too often; not reloading again');
    }
  });
  win.on('unresponsive', () => {
    log.warn('Renderer unresponsive');
    // Tests run on slow software rendering; never pop a dialog over them.
    if (testMode) return;
    // Wordless: the arrow reloads, the hourglass keeps waiting.
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        message: '🐛 💤 ?',
        buttons: ['🔄', '⏳'],
        defaultId: 1,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0 && !win.isDestroyed()) {
          // The crash handler above reloads it.
          log.info('Restarting the unresponsive renderer');
          win.webContents.forcefullyCrashRenderer();
        }
      });
  });
  win.on('responsive', () => log.info('Renderer responsive again'));
  win.webContents.on('preload-error', (_e, path, err) => log.error(`Preload ${path}: ${describeError(err)}`));
}

function createWindow(fullscreen: boolean): BrowserWindow {
  const placed = windowState
    ? placeWindow(windowState.read(), displayAreas(), {
        id: screen.getPrimaryDisplay().id,
        workArea: screen.getPrimaryDisplay().workArea,
      })
    : null;
  const win = new BrowserWindow({
    fullscreen,
    ...(placed ? placed.bounds : { width: 1280, height: 720 }),
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: '#7ec8ff',
    title: 'Bugglebrook',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: testMode ? ['--bb-test'] : [],
    },
  });
  if (placed?.maximized && !fullscreen) win.maximize();
  if (windowState) trackWindowState(win, windowState);
  guardRenderer(win);

  win.once('ready-to-show', () => win.show());
  // An update that finished before this page loaded (or before a reload) still gets its toast.
  win.webContents.on('did-finish-load', () => updates.tell(win));

  // No popups, no navigation away from the game. External links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Reloading the game's own page is allowed (the oops screen's button); going anywhere else is not.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  // Ask the renderer to save before closing. Give up after a short wait.
  let flushed = false;
  win.on('close', (event) => {
    if (flushed || win.webContents.isDestroyed()) return;
    event.preventDefault();
    const finish = (): void => {
      if (flushed) return;
      flushed = true;
      ipcMain.removeListener(IPC.flushDone, onDone);
      win.close();
    };
    const onDone = (e: Electron.IpcMainEvent): void => {
      if (e.sender === win.webContents) finish();
    };
    ipcMain.on(IPC.flushDone, onDone);
    win.webContents.send(IPC.flushRequest);
    setTimeout(finish, 2000);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  return win;
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('child-process-gone', (_e, details) => {
  if (details.reason !== 'clean-exit') log.error(`${details.type} process gone: ${details.reason}`);
});

app.whenReady().then(async () => {
  // No menu bar. macOS keeps its app menu so Cmd+Q and Cmd+H still work.
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'windowMenu' }])
      : null,
  );
  await saves.sweep();
  registerIpc();
  const { fullscreen } = await settings.get();
  mainWindow = createWindow(fullscreen);
  mainWindow.on('closed', () => (mainWindow = null));
  updates.start(testMode);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      void settings.get().then((s) => (mainWindow = createWindow(s.fullscreen)));
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || testMode) app.quit();
});

app.on('quit', () => log.info('Quit'));
