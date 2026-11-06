// What the person chose, in one JSON file next to the window order.
import * as fs from 'zinc:fs';
import * as win from 'zinc:system/window';
import { createSignal } from 'zinc:ui/solid';
import { KEY_TAB, MOD_COMMAND } from 'zinc:desktop-windows';
import { SavedRank } from './recency';

export interface Settings {
  keyCode: number;
  modifiers: number;
  theme: string;      // 'system' | 'light' | 'dark'
  accent: string;     // a #rrggbb of ACCENTS
  density: string;    // 'compact' | 'regular' | 'large'
  width: number;
  maxRows: number;
  blur: boolean;
  showAppName: boolean;
  showTrayIcon: boolean;
}
const DEFAULTS: Settings = {
  keyCode: KEY_TAB, modifiers: MOD_COMMAND,
  theme: 'system', accent: '#0a84ff', density: 'regular', width: 520, maxRows: 9, blur: true, showAppName: true, showTrayIcon: true,
};
function settingsPath(): string { return win.dataDir() + '/settings.json'; }
function orderPath(): string { return win.dataDir() + '/window-order.json'; }

function readSettings(): Settings {
  const path = settingsPath();
  if (!fs.exists(path)) return DEFAULTS;
  try {
    const stored = JSON.parse(fs.readText(path)) as Settings;
    return { ...DEFAULTS, ...stored };   // a field added by a later version takes its default
  } catch (e) {
    return DEFAULTS;   // a damaged file must not stop the switcher
  }
}
const [settingsValue, setSettingsValue] = createSignal<Settings>(readSettings());
export const settings = settingsValue;

export function updateSettings(next: Settings): void {
  setSettingsValue(next);
  fs.mkdir(win.dataDir(), true);
  fs.writeText(settingsPath(), JSON.stringify(next));
}

export function loadSavedOrder(): SavedRank[] {
  const path = orderPath();
  if (!fs.exists(path)) return [];
  try {
    return JSON.parse(fs.readText(path)) as SavedRank[];
  } catch (e) {
    return [];
  }
}
export function saveOrder(ranks: SavedRank[]): void {
  fs.mkdir(win.dataDir(), true);
  fs.writeText(orderPath(), JSON.stringify(ranks));
}
