// The menu bar icon, which the person can do without: Riffle then opens its settings from the list's bottom bar, or when it is started again.
import * as tray from 'zinc:system/tray';
import * as menu from 'zinc:system/menu';
import { settings } from './settings';

let icon: tray.Tray | null = null;
let creating = false;
let isStartingAtLogin: () => boolean = () => false;

function trayMenu(): menu.Item[] {
  const atLogin = menu.item('login', 'Start at Login');
  atLogin.type = 'checkbox';
  atLogin.checked = isStartingAtLogin();
  return [menu.item('settings', 'Settings…'), atLogin, menu.separator(), menu.item('quit', 'Quit Riffle')];
}

export function setupTrayMenu(startsAtLogin: () => boolean, onSettings: () => void, onToggleLogin: () => void, onQuit: () => void): void {
  isStartingAtLogin = startsAtLogin;
  menu.onClick('settings', (source: string) => onSettings());
  menu.onClick('login', (source: string) => onToggleLogin());
  menu.onClick('quit', (source: string) => onQuit());
}

export function refreshTrayMenu(): void {
  if (icon !== null) icon.setMenu(trayMenu());
}

/** Makes the icon match the setting. */
export async function applyTrayIcon(): Promise<void> {
  if (settings().showTrayIcon) {
    if (icon !== null || creating) return;
    creating = true;
    const options = new tray.Options('riffle');
    options.symbol = 'rectangle.stack';
    options.tooltip = 'Riffle';
    options.menu = trayMenu();
    options.hasMenu = true;
    icon = await tray.create(options);
    creating = false;
  } else if (icon !== null) {
    icon.destroy();
    icon = null;
  }
}
