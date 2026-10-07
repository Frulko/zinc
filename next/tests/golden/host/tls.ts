import { fetch, serve, stop, Request, Reply } from 'zinc:net';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
// https on loopback against a test CA (tests/t0/tls.sh makes the certificates and sets ZINC_CA_FILE): a good certificate, a name that does not match, an expired
// one, and a CA the client does not trust. The client verifies by default; there is no way to switch it off.
const dir = sys.args()[0];
const echo = (req: Request): Reply => ({ status: 200, body: 'secure ' + req.path, contentType: 'text/plain' });
function up(name: string): void { serve(18851, echo, { cert: fs.readText(dir + '/' + name + '.pem'), key: fs.readText(dir + '/' + name + '.key') }); }
async function get(url: string): Promise<string> {
  try { const r = await fetch(url); return r.status + ' ' + await r.text(); } catch (e) { return (e as Error).message; }
}
async function main(): Promise<void> {
  up(sys.args()[1]);
  console.log(await get('https://127.0.0.1:18851/a'));
  console.log(await get('https://localhost:18851/b'));
  stop();
}
main();
