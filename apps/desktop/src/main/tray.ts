import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getMainWindow } from './window';

let tray: Tray | null = null;

function getIconPath(): string {
  // 尝试多个路径：打包后 / 开发模式
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),       // 打包后
    path.join(__dirname, '../../../resources/icon.png'),      // 开发模式
    path.join(__dirname, '../../resources/icon.png'),         // 备用
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function setupTray(): void {
  const iconPath = getIconPath();
  let icon = nativeImage.createEmpty();
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 16, height: 16 });
      icon.setTemplateImage(true);
    }
  }

  tray = new Tray(icon);
  tray.setToolTip('Nomi');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 Nomi',
      click: () => {
        const w = getMainWindow();
        if (w && !w.isDestroyed()) { w.show(); w.focus(); }
      },
    },
    { type: 'separator' },
    {
      label: `版本 ${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { app.exit(0); },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    const w = getMainWindow();
    if (!w || w.isDestroyed()) return;
    if (w.isVisible()) { w.focus(); } else { w.show(); }
  });

  tray.on('double-click', () => {
    const w = getMainWindow();
    if (!w || w.isDestroyed()) return;
    w.show();
    w.focus();
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
