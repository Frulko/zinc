import { serve, setCertificate, Reply, Request } from 'zinc:net';
import { certificate } from 'zinc:net/acme';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
// zinc:net/acme against a local Pebble (tests/t1/net_acme.sh): a certificate by http-01, kept while it is valid, renewed on demand and
// swapped into a running https server. Arguments: directory URL, challenge port, https port, state directory.
const a = sys.args();
const o = { domains: ['localhost'], directory: a[0], challengePort: parseInt(a[1]) as i32, dir: a[3], email: 'test@example.org' };
async function main(): Promise<void> {
  const first = await certificate(o);
  console.log('issued', first.cert.startsWith('-----BEGIN CERTIFICATE-----'), first.key.indexOf('PRIVATE KEY') > 0, first.notAfter > Date.now() + 30 * 86400000);
  const port = serve(parseInt(a[2]) as i32, (req: Request): Reply => ({ status: 200, body: 'tls ok', contentType: 'text/plain' }), { cert: first.cert, key: first.key });
  const kept = await certificate(o);
  console.log('kept', kept.cert === first.cert);
  const renewed = await certificate(o, true);
  console.log('renewed', renewed.cert !== first.cert, fs.readText(a[3] + '/cert.pem') === renewed.cert);
  setCertificate(port, renewed.cert, renewed.key);
  console.log('ready');
}
main().catch((e: Error) => { console.log('failed', e.message); sys.exit(1); });
