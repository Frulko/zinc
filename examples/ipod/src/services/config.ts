// The app's settings, in <backups>/config.json (beside the logs: ~/.zinc/ipod/config.json by default): the remote iPod, an iPod
// daemon (examples/ipod-web) the app connects to, the Sonos speaker found last, the size of the remote iPod's audio cache, the
// scrobbling accounts (Last.fm, ListenBrainz) and whose listening history is imported. Saving keeps the keys this version does not know.
import * as fs from 'zinc:fs';
import { backupPlace } from './log';

export class AppConfig {
  /** The daemon's address ('http://pi.local:8686'), '' when no remote iPod is set. */
  remoteAddress: string = '';
  /** Its /api token ('' for a daemon on this machine started without --token). */
  remoteToken: string = '';
  /** The address of the Sonos speaker that answered last: the next search asks it first. */
  sonosSeed: string = '';
  /** The most a remote iPod's songs played take on this computer (services/cache.ts), in MB; 0 = no limit. */
  audioCacheMb: number = 2048;
  /** Last.fm: the API account's key and secret (last.fm/api/account/create), and the session the browser's approval gave. */
  lastfmKey: string = '';
  lastfmSecret: string = '';
  lastfmSession: string = '';
  lastfmUser: string = '';
  /** ListenBrainz: the user token (listenbrainz.org/settings). */
  listenbrainzToken: string = '';
  /** Whose listening history is imported (services/historyJobs.ts): the Last.fm user ('' = the one signed in) and the ListenBrainz user. */
  historyLastfmUser: string = '';
  historyListenbrainzUser: string = '';
}

function configFile(): string { return `${backupPlace()}/config.json`; }

export function loadConfig(): AppConfig {
  const config = new AppConfig();
  try {
    if (!fs.exists(configFile())) return config;
    const stored = JSON.parse(fs.readText(configFile()));
    if (stored.remoteAddress !== undefined) config.remoteAddress = '' + stored.remoteAddress;
    if (stored.remoteToken !== undefined) config.remoteToken = '' + stored.remoteToken;
    if (stored.sonosSeed !== undefined) config.sonosSeed = '' + stored.sonosSeed;
    if (stored.audioCacheMb !== undefined) config.audioCacheMb = Number(stored.audioCacheMb);
    if (stored.lastfmKey !== undefined) config.lastfmKey = '' + stored.lastfmKey;
    if (stored.lastfmSecret !== undefined) config.lastfmSecret = '' + stored.lastfmSecret;
    if (stored.lastfmSession !== undefined) config.lastfmSession = '' + stored.lastfmSession;
    if (stored.lastfmUser !== undefined) config.lastfmUser = '' + stored.lastfmUser;
    if (stored.listenbrainzToken !== undefined) config.listenbrainzToken = '' + stored.listenbrainzToken;
    if (stored.historyLastfmUser !== undefined) config.historyLastfmUser = '' + stored.historyLastfmUser;
    if (stored.historyListenbrainzUser !== undefined) config.historyListenbrainzUser = '' + stored.historyListenbrainzUser;
  } catch (e) { /* unreadable: the defaults */ }
  return config;
}

export function saveConfig(config: AppConfig): void {
  try {
    let stored = JSON.parse('{}');
    try { if (fs.exists(configFile())) stored = JSON.parse(fs.readText(configFile())); } catch (e) { /* written again from memory */ }
    stored.remoteAddress = config.remoteAddress;
    stored.remoteToken = config.remoteToken;
    stored.sonosSeed = config.sonosSeed;
    stored.audioCacheMb = config.audioCacheMb;
    stored.lastfmKey = config.lastfmKey;
    stored.lastfmSecret = config.lastfmSecret;
    stored.lastfmSession = config.lastfmSession;
    stored.lastfmUser = config.lastfmUser;
    stored.listenbrainzToken = config.listenbrainzToken;
    stored.historyLastfmUser = config.historyLastfmUser;
    stored.historyListenbrainzUser = config.historyListenbrainzUser;
    fs.mkdir(backupPlace(), true);
    fs.writeText(configFile(), JSON.stringify(stored) + '\n');
  } catch (e) { console.error(`ipod: ${configFile()}: ${(e as Error).message}`); }
}
