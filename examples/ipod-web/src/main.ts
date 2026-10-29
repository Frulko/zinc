// ipod-web: a small web server that shows the iPods plugged into this machine and their specs, read only.
//   zinc run examples/ipod-web              then open http://localhost:8686
//   zinc run examples/ipod-web -- --port 9000
import { args } from 'zinc:sys';
import { scan } from './state';
import { start } from './services/web';
import { DEFAULT_PORT, SCAN_EVERY_MS } from './constants';

function portFrom(argv: string[]): i32 {
  for (let i = 0; i + 1 < argv.length; i++) if (argv[i] === '--port') { const p = parseInt(argv[i + 1]); if (p > 0 && p < 65536) return p; }
  return DEFAULT_PORT;
}

const port = portFrom(args());
start(port);
console.log(`ipod-web: http://localhost:${port} (Ctrl+C to stop)`);
scan();
setInterval(() => { scan(); }, SCAN_EVERY_MS);
