// The command line: zinc run examples/ipod-web -- [--port N] [--token T] [--user U --password P] [--api-key K] [--allow-changes]
//   [--mount PATH] [--log-requests] [--jukebox URL --jukebox-token T] [--url URL]   (jukebox: the iPod reported to it as a satellite)
//   [--lastfm-key K --lastfm-secret S --lastfm-session SK] [--listenbrainz-token T]   (the Subsonic clients' plays scrobbled)
import { args, randomBytes } from 'zinc:sys';
import { toHex } from 'zinc:web';
import { DEFAULT_PORT } from '../constants';

export class Options {
  port: i32 = DEFAULT_PORT;
  /** The /api bearer token; generated when not given (then 127.0.0.1 needs none). */
  token: string = '';
  tokenGiven: boolean = false;
  user: string = '';
  password: string = '';
  /** The Subsonic API key (OpenSubsonic apiKey, what AudioMuse-AI can send instead of a password); '' = none. */
  apiKey: string = '';
  /** One line per request on the console, the secrets masked. */
  logRequests: boolean = false;
  allowChanges: boolean = false;
  /** '' = the first mounted iPod with a database. */
  mount: string = '';
  /** Last.fm: the API account's key and secret and a session key (the iPod app's settings show it once signed in). */
  lastfmKey: string = '';
  lastfmSecret: string = '';
  lastfmSession: string = '';
  /** ListenBrainz: the user token. */
  listenbrainzToken: string = '';
  /** jukebox (music-lib-manager) to report the iPod to, its address and a token of it; '' = none. */
  jukebox: string = '';
  jukeboxToken: string = '';
  /** The address others reach this daemon at (the songs' sourceUrl given to jukebox); '' = the request's Host. */
  url: string = '';
}

export function parseOptions(): Options {
  const o = new Options();
  const argv = args();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = i + 1 < argv.length ? argv[i + 1] : '';
    if (a === '--allow-changes') { o.allowChanges = true; continue; }
    if (a === '--log-requests') { o.logRequests = true; continue; }
    if (a === '--port') { const p = parseInt(next); if (p > 0 && p < 65536) o.port = p; }
    else if (a === '--token') { o.token = next; o.tokenGiven = next !== ''; }
    else if (a === '--user') o.user = next;
    else if (a === '--password') o.password = next;
    else if (a === '--api-key') o.apiKey = next;
    else if (a === '--lastfm-key') o.lastfmKey = next;
    else if (a === '--lastfm-secret') o.lastfmSecret = next;
    else if (a === '--lastfm-session') o.lastfmSession = next;
    else if (a === '--listenbrainz-token') o.listenbrainzToken = next;
    else if (a === '--jukebox') o.jukebox = next.replace(/\/+$/, '');
    else if (a === '--jukebox-token') o.jukeboxToken = next;
    else if (a === '--url') o.url = next.replace(/\/+$/, '');
    else if (a === '--mount') o.mount = next.endsWith('/') && next.length > 1 ? next.slice(0, next.length - 1) : next;
    else continue;
    i++;
  }
  if (o.token === '') o.token = toHex(randomBytes(16));
  return o;
}

export const options = parseOptions();
