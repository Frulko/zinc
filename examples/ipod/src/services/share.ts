// Share with AudioMuse: the iPod plugged into this Mac served as a Subsonic server on a port of its own, with the iPod daemon's module
// (examples/ipod-web/src/services/subsonic.ts, the same code, not a copy), so AudioMuse-AI (in Docker it reaches this Mac at
// http://host.docker.internal:<port>, type Navidrome) lists, analyses and streams its songs, and writes its playlists while Allow
// changes is on. Settings turn it on; the port, user, password and API key are kept in config.json, and it starts again with the app.
// A remote iPod is not shared (its daemon serves Subsonic itself): the library is then empty.
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import { toHex } from 'zinc:web';
import { createSignal } from 'zinc:ui/solid';
import { rest, access } from '../../../ipod-web/src/services/subsonic';
import { lib, indexLibrary, guidOf } from '../../../ipod-web/src/services/library';
import { library, allowChanges } from '../state';
import { refresh } from '../actions';
import { PodLibrary } from './ipod';
import { loadConfig, saveConfig } from './config';
import { log } from './log';

/** The port served, 0 while sharing is off. */
export const [sharePort, setSharePort] = createSignal<i32>(0);
let followed: PodLibrary | null = null;

/** `lib` (the module's library) made the app's open iPod again when the app read another one. */
function follow(): void {
  const l = library();
  if (l === followed) return;
  followed = l;
  const local = l !== null && (l as PodLibrary).remote === '';
  const pod = l as PodLibrary;
  lib.mountpoint = local ? pod.device.mountpoint : '';
  lib.name = local ? pod.device.name : '';
  lib.serial = local ? pod.device.serial : '';
  lib.guid = local ? guidOf(pod.device) : '';
  lib.tracks = local ? pod.tracks : [];
  lib.playlists = local ? pod.playlists : [];
  indexLibrary();
}

async function serve(req: net.Request): Promise<net.Reply> {
  if (!req.path.startsWith('/rest/')) return { status: 404, body: 'not found\n', contentType: 'text/plain' };
  follow();
  access.allowChanges = allowChanges();
  return rest(req);
}

/** Starts sharing with the config's port and account (a key is made the first time); '' or why it could not. */
export function startSharing(): string {
  const c = loadConfig();
  if (c.shareApiKey === '') { c.shareApiKey = toHex(sys.randomBytes(16)); saveConfig(c); }
  access.user = c.shareUser;
  access.password = c.sharePassword;
  access.apiKey = c.shareApiKey;
  access.changed = () => { refresh().catch((e: Error) => log('Read the library again', e.message, false)); };
  stopSharing();
  try {
    setSharePort(net.serveAsync(c.sharePort, serve));
  } catch (e) {
    log('Share with AudioMuse', (e as Error).message, false);
    return `Port ${c.sharePort} cannot be used (${(e as Error).message}): pick another.`;
  }
  followed = null;
  log('Share with AudioMuse', `Subsonic on port ${sharePort()}`, true);
  return '';
}

export function stopSharing(): void {
  if (sharePort() === 0) return;
  net.stop(sharePort());
  setSharePort(0);
}

/** At start: shares again when it was on. */
export function resumeSharing(): void { if (loadConfig().shareOn) startSharing(); }
