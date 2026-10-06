import { fetch } from 'zinc:net';
import * as sys from 'zinc:sys';
async function main(): Promise<void> {
  const base = sys.args()[0];
  const r = await fetch(base + '/a.txt');
  const body = await r.text();
  console.log(r.ok, r.status, JSON.stringify(body));
  const missing = await fetch(base + '/nope.txt');
  console.log(missing.ok, missing.status);
  const down = await fetch('http://127.0.0.1:1/');
  console.log(down.ok, down.status);
}
main();
