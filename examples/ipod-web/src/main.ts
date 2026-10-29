// ipod-web: the iPod daemon (docs/reports/ipod-daemon.md). A page of the iPods plugged into this machine, the open iPod's library
// as a JSON API (/api) and as a Subsonic server (/rest).
//   zinc run examples/ipod-web              then open http://localhost:8686
//   zinc run examples/ipod-web -- --port 9000 --token T --user U --password P --allow-changes --mount /Volumes/IPOD
import { scan } from './state';
import { start } from './services/web';
import { options } from './services/options';
import { SCAN_EVERY_MS } from './constants';

start(options.port);
console.log(`ipod-web: http://localhost:${options.port} (Ctrl+C to stop)`);
if (!options.tokenGiven) console.log(`ipod-web: /api token ${options.token} (none needed from this machine)`);
if (options.user === '') console.log('ipod-web: /rest is off: give --user and --password for Subsonic clients');
console.log(options.allowChanges ? 'ipod-web: changes allowed (add, remove, eject)' : 'ipod-web: read only (--allow-changes to add, remove, eject)');
scan();
setInterval(() => { scan(); }, SCAN_EVERY_MS);
