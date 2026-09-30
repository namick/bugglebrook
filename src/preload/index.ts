import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { BugglebrookApi } from '../shared/ipc';

let flushHandler: (() => Promise<void>) | null = null;

ipcRenderer.on(IPC.flushRequest, () => {
  const done = (): void => ipcRenderer.send(IPC.flushDone);
  if (!flushHandler) return done();
  flushHandler().then(done, done);
});

const api: BugglebrookApi = {
  testMode: process.argv.includes('--bb-test'),
  platform: process.platform,
  saves: {
    list: () => ipcRenderer.invoke(IPC.savesList),
    read: (slot) => ipcRenderer.invoke(IPC.savesRead, slot),
    write: (slot, data) => ipcRenderer.invoke(IPC.savesWrite, slot, data),
    remove: (slot) => ipcRenderer.invoke(IPC.savesRemove, slot),
  },
  onFlushRequest(handler) {
    flushHandler = handler;
  },
};

contextBridge.exposeInMainWorld('bugglebrook', api);
