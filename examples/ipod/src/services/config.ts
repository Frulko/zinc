// The app's settings, in <backups>/config.json (beside the logs: ~/.zinc/ipod/config.json by default): the remote iPod, an iPod
// daemon (examples/ipod-web) the app connects to. Saving keeps the keys this version does not know.
import * as fs from 'zinc:fs';
import { backupPlace } from './log';

export class AppConfig {
  /** The daemon's address ('http://pi.local:8686'), '' when no remote iPod is set. */
  remoteAddress: string = '';
  /** Its /api token ('' for a daemon on this machine started without --token). */
  remoteToken: string = '';
}

function configFile(): string { return `${backupPlace()}/config.json`; }

export function loadConfig(): AppConfig {
  const config = new AppConfig();
  try {
    if (!fs.exists(configFile())) return config;
    const stored = JSON.parse(fs.readText(configFile()));
    if (stored.remoteAddress !== undefined) config.remoteAddress = '' + stored.remoteAddress;
    if (stored.remoteToken !== undefined) config.remoteToken = '' + stored.remoteToken;
  } catch (e) { /* unreadable: the defaults */ }
  return config;
}

export function saveConfig(config: AppConfig): void {
  try {
    let stored = JSON.parse('{}');
    try { if (fs.exists(configFile())) stored = JSON.parse(fs.readText(configFile())); } catch (e) { /* written again from memory */ }
    stored.remoteAddress = config.remoteAddress;
    stored.remoteToken = config.remoteToken;
    fs.mkdir(backupPlace(), true);
    fs.writeText(configFile(), JSON.stringify(stored) + '\n');
  } catch (e) { console.error(`ipod: ${configFile()}: ${(e as Error).message}`); }
}
