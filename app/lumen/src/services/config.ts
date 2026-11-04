// What Lumen must put back at each launch: virtual displays and software changes die with the process that made them.
import * as fs from 'zinc:fs';
import * as win from 'zinc:system/window';

export interface VirtualSpec { name: string; width: number; height: number; refresh: number; hidpi: boolean }
export interface DisplayTune { name: string; dim: number; warmth: number; boost: number }
export interface Config { virtuals: VirtualSpec[]; tunes: DisplayTune[] }

function configPath(): string { return win.dataDir() + '/lumen.json'; }

export function loadConfig(): Config {
  const path = configPath();
  if (!fs.exists(path)) return { virtuals: [], tunes: [] };
  try {
    return JSON.parse(fs.readText(path)) as Config;
  } catch (e) {
    return { virtuals: [], tunes: [] };   // a damaged file must not stop the app that restores the screens
  }
}
export function saveConfig(config: Config): void {
  fs.mkdir(win.dataDir(), true);
  fs.writeText(configPath(), JSON.stringify(config));
}
