import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';
import { showDashboard, showHistory } from './windows';

let tray: Tray | null = null;

export const createTray = (): Tray => {
  const iconPath = join(process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'resources', 'tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png'));
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('ContextChat');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => showDashboard() },
    { label: 'Open History', click: () => showHistory() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showDashboard());
  return tray;
};
