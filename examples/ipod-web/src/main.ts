// ipod-web: the iPod daemon (docs/reports/ipod-daemon.md). A page of the iPods plugged into this machine, the open iPod's library
// as a JSON API (/api) and as a Subsonic server (/rest).
//   zinc run examples/ipod-web              then open http://localhost:8686
//   zinc run examples/ipod-web -- --port 9000 --token T --user U --password P --api-key K --allow-changes --mount /Volumes/IPOD
import { scan } from './state';
import { start } from './services/web';
import { options } from './services/options';
import { access } from './services/subsonic';
import { scrobbleFromSubsonic } from './services/plays';
import { SCAN_EVERY_MS } from './constants';
import { announce } from './services/satellite';

access.user = options.user;
access.password = options.password;
access.apiKey = options.apiKey;
access.allowChanges = options.allowChanges;
access.scrobble = scrobbleFromSubsonic;

start(options.port);
console.log(`ipod-web: http://localhost:${options.port} (Ctrl+C to stop)`);
if (!options.tokenGiven) console.log(`ipod-web: /api token ${options.token} (none needed from this machine)`);
if (options.jukebox !== '') console.log(`ipod-web: the iPod is reported to jukebox ${options.jukebox}`);
if (options.user === '' && options.apiKey === '') console.log('ipod-web: /rest is off: give --user and --password (or --api-key) for Subsonic clients');
console.log(options.allowChanges ? 'ipod-web: changes allowed (add, remove, eject, playlists)' : 'ipod-web: read only (--allow-changes to add, remove, eject, change playlists)');
async function tick(): Promise<void> { await scan(); await announce(); }
tick();
setInterval(() => { tick(); }, SCAN_EVERY_MS);
