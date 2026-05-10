import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];
const preload = join(__dirname, '../preload/preload.js');

const rendererUrl = (entry: string): string =>
  isDev
    ? `${process.env['ELECTRON_RENDERER_URL']}/${entry}`
    : `file://${join(__dirname, `../renderer/${entry}`)}`;

let panelWin: BrowserWindow | null = null;
let iconWin: BrowserWindow | null = null;
let toastWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;

export const showIcon = (x: number, y: number): BrowserWindow => {
  if (iconWin && !iconWin.isDestroyed()) {
    iconWin.setPosition(x, y);
    iconWin.showInactive();
    return iconWin;
  }
  iconWin = new BrowserWindow({
    width: 28, height: 28,
    x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, focusable: false,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true }
  });
  iconWin.setContentProtection(true);
  iconWin.setIgnoreMouseEvents(false);
  iconWin.loadURL(rendererUrl('icon.html'));
  return iconWin;
};

export const hideIcon = (): void => {
  if (iconWin && !iconWin.isDestroyed()) iconWin.hide();
};

export const showPanel = (x: number, y: number): BrowserWindow => {
  const display = screen.getPrimaryDisplay().workAreaSize;
  const w = 360, h = 480;
  const px = Math.min(Math.max(x, 0), display.width - w);
  const py = Math.min(Math.max(y, 0), display.height - h);
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.destroy();
    panelWin = null;
  }
  panelWin = new BrowserWindow({
    width: w, height: h,
    x: px, y: py,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: true, skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true }
  });
  panelWin.setContentProtection(true);
  panelWin.loadURL(rendererUrl('index.html'));
  panelWin.on('closed', () => { panelWin = null; });
  return panelWin;
};

export const hidePanel = (): void => {
  if (panelWin && !panelWin.isDestroyed()) panelWin.hide();
};

export const sendToPanel = (channel: string, payload: unknown): void => {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send(channel, payload);
};

export const showToast = (): BrowserWindow => {
  const display = screen.getPrimaryDisplay().workAreaSize;
  const w = 320, h = 96;
  if (toastWin && !toastWin.isDestroyed()) { toastWin.show(); return toastWin; }
  toastWin = new BrowserWindow({
    width: w, height: h,
    x: display.width - w - 20, y: display.height - h - 20,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, focusable: false,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true }
  });
  toastWin.setContentProtection(true);
  toastWin.loadURL(rendererUrl('toast.html'));
  return toastWin;
};

export const hideToast = (): void => {
  if (toastWin && !toastWin.isDestroyed()) toastWin.hide();
};

export const showSettings = (): BrowserWindow => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus(); return settingsWin;
  }
  settingsWin = new BrowserWindow({
    width: 520, height: 480,
    title: 'ContextChat Settings',
    webPreferences: { preload, sandbox: false, contextIsolation: true }
  });
  settingsWin.loadURL(rendererUrl('settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  return settingsWin;
};

export const isPanelOpen = (): boolean => !!panelWin && !panelWin.isDestroyed() && panelWin.isVisible();

let historyWin: BrowserWindow | null = null;

export const showHistory = (): BrowserWindow => {
  if (historyWin && !historyWin.isDestroyed()) {
    historyWin.focus();
    return historyWin;
  }
  historyWin = new BrowserWindow({
    width: 680, height: 520,
    title: 'ContextChat History',
    resizable: true,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  historyWin.loadURL(rendererUrl('history.html'));
  historyWin.on('closed', () => { historyWin = null; });
  return historyWin;
};

let dashboardWin: BrowserWindow | null = null;

export const showDashboard = (): BrowserWindow => {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.focus();
    return dashboardWin;
  }
  dashboardWin = new BrowserWindow({
    width: 720, height: 560,
    title: 'ContextChat',
    resizable: true,
    skipTaskbar: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  dashboardWin.loadURL(rendererUrl('dashboard.html'));
  dashboardWin.on('closed', () => { dashboardWin = null; });
  return dashboardWin;
};

let voiceWin: BrowserWindow | null = null;

export const showVoiceOverlay = (): BrowserWindow => {
  if (voiceWin && !voiceWin.isDestroyed()) {
    voiceWin.focus();
    return voiceWin;
  }
  const display = screen.getPrimaryDisplay().workAreaSize;
  voiceWin = new BrowserWindow({
    width: 300, height: 120,
    x: Math.round(display.width / 2) - 150,
    y: display.height - 160,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  voiceWin.setContentProtection(true);
  voiceWin.loadURL(rendererUrl('voice.html'));
  voiceWin.on('closed', () => { voiceWin = null; });
  return voiceWin;
};

export const hideVoiceOverlay = (): void => {
  if (voiceWin && !voiceWin.isDestroyed()) voiceWin.close();
};

let screenshotBtnWin: BrowserWindow | null = null;

export const showScreenshotBtn = (): BrowserWindow => {
  if (screenshotBtnWin && !screenshotBtnWin.isDestroyed()) return screenshotBtnWin;
  const display = screen.getPrimaryDisplay().workAreaSize;
  screenshotBtnWin = new BrowserWindow({
    width: 44, height: 44,
    x: display.width - 60, y: Math.round(display.height / 2) - 22,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, focusable: true,
    hasShadow: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  screenshotBtnWin.setContentProtection(true);
  screenshotBtnWin.setIgnoreMouseEvents(false);
  screenshotBtnWin.loadURL(rendererUrl('screenshotbtn.html'));
  screenshotBtnWin.on('closed', () => { screenshotBtnWin = null; });
  return screenshotBtnWin;
};

export const moveScreenshotBtn = (x: number, y: number): void => {
  if (screenshotBtnWin && !screenshotBtnWin.isDestroyed()) screenshotBtnWin.setPosition(Math.round(x), Math.round(y));
};
