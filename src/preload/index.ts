import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { BugglebrookApi } from '../shared/ipc';

let flushHandler: (() => Promise<void>) | null = null;
let updateHandler: ((version: string) => void) | null = null;
let updateWaiting: string | null = null;

ipcRenderer.on(IPC.flushRequest, () => {
  const done = (): void => ipcRenderer.send(IPC.flushDone);
  if (!flushHandler) return done();
  flushHandler().then(done, done);
});

// An update can finish downloading before the game has asked to hear about it.
ipcRenderer.on(IPC.updateReady, (_e, version: unknown) => {
  if (typeof version !== 'string') return;
  updateWaiting = version;
  updateHandler?.(version);
});

const api: BugglebrookApi = {
  testMode: process.argv.includes('--bb-test'),
  platform: process.platform,
  saves: {
    list: () => ipcRenderer.invoke(IPC.savesList),
    read: (slot) => ipcRenderer.invoke(IPC.savesRead, slot),
    write: (slot, data) => ipcRenderer.invoke(IPC.savesWrite, slot, data),
    remove: (slot) => ipcRenderer.invoke(IPC.savesRemove, slot),
    readBackup: (slot) => ipcRenderer.invoke(IPC.savesReadBackup, slot),
    recover: (slot) => ipcRenderer.invoke(IPC.savesRecover, slot),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (settings) => ipcRenderer.invoke(IPC.settingsSet, settings),
  },
  photos: {
    save: (png) => ipcRenderer.invoke(IPC.photosSave, png),
  },
  quit: () => ipcRenderer.send(IPC.quit),
  onFlushRequest(handler) {
    flushHandler = handler;
  },
  logError: (text) => ipcRenderer.send(IPC.logError, String(text)),
  updates: {
    onReady(handler) {
      updateHandler = handler;
      if (updateWaiting) handler(updateWaiting);
    },
    restart: () => ipcRenderer.send(IPC.updateRestart),
  },
};

contextBridge.exposeInMainWorld('bugglebrook', api);
