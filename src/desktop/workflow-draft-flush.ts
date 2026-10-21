import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow } from 'electron';

/** Wait for acknowledged SQLite writes while the renderer and database are still alive. */
export class WorkflowDraftFlush {
  private pending: Promise<void> | undefined;
  constructor(private readonly panel: () => BrowserWindow | null) {}
  async flush(): Promise<void> {
    if (this.pending) return this.pending;
    const window = this.panel(); if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    this.pending = new Promise<void>((resolve, reject) => {
      const id = randomUUID();
      const finish = (error?: string): void => { clearTimeout(timer); ipcMain.removeListener('workflow:draftFlushed', receive); error ? reject(new Error(error)) : resolve(); };
      const receive = (event: Electron.IpcMainEvent, input: { id?: string; error?: string }): void => {
        if (event.sender === window.webContents && input?.id === id) finish(input.error);
      };
      const timer = setTimeout(() => finish('草稿保存尚未完成，请返回工作流重试后再退出。'), 5000);
      ipcMain.on('workflow:draftFlushed', receive); window.webContents.send('workflow:flushDraft', id);
    });
    try { await this.pending; } finally { this.pending = undefined; }
  }
}
