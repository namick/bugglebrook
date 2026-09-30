import { BrowserWindow, app, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IPC } from '../shared/ipc';
import { SaveStore } from './saveStore';
import { startAutoUpdates } from './updater';

const testMode = process.env.BUGGLEBROOK_TEST === '1';

// Tests point userData at a temp dir so they never touch real saves.
if (process.env.BUGGLEBROOK_USER_DATA) app.setPath('userData', process.env.BUGGLEBROOK_USER_DATA);

if (!testMode && !app.requestSingleInstanceLock()) app.quit();

// Let WebGL fall back to the software renderer on machines without a usable
// GPU (VMs, CI under xvfb). We only ever load our own bundled content.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

const saves = new SaveStore(join(app.getPath('userData'), 'saves'));
let mainWindow: BrowserWindow | null = null;

function registerIpc(): void {
  ipcMain.handle(IPC.savesList, () => saves.list());
  ipcMain.handle(IPC.savesRead, (_e, slot: unknown) => saves.read(SaveStore.assertSlot(slot)));
  ipcMain.handle(IPC.savesWrite, (_e, slot: unknown, data: unknown) =>
    saves.write(SaveStore.assertSlot(slot), data),
  );
  ipcMain.handle(IPC.savesRemove, (_e, slot: unknown) => saves.remove(SaveStore.assertSlot(slot)));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
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

  win.once('ready-to-show', () => win.show());

  // No popups, no navigation away from the game. External links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

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

app.whenReady().then(async () => {
  await saves.sweep();
  registerIpc();
  mainWindow = createWindow();
  mainWindow.on('closed', () => (mainWindow = null));
  startAutoUpdates(testMode);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || testMode) app.quit();
});
