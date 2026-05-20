import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export function checkForUpdates(win: BrowserWindow): void {
  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err);
  });

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-ready');
  });

  autoUpdater.checkForUpdatesAndNotify();
}
