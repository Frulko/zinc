// The command line: zinc run examples/ipod-web -- [--port N] [--token T] [--user U --password P] [--allow-changes] [--mount PATH]
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
  allowChanges: boolean = false;
  /** '' = the first mounted iPod with a database. */
  mount: string = '';
}

export function parseOptions(): Options {
  const o = new Options();
  const argv = args();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = i + 1 < argv.length ? argv[i + 1] : '';
    if (a === '--allow-changes') { o.allowChanges = true; continue; }
    if (a === '--port') { const p = parseInt(next); if (p > 0 && p < 65536) o.port = p; }
    else if (a === '--token') { o.token = next; o.tokenGiven = next !== ''; }
    else if (a === '--user') o.user = next;
    else if (a === '--password') o.password = next;
    else if (a === '--mount') o.mount = next.endsWith('/') && next.length > 1 ? next.slice(0, next.length - 1) : next;
    else continue;
    i++;
  }
  if (o.token === '') o.token = toHex(randomBytes(16));
  return o;
}

export const options = parseOptions();
