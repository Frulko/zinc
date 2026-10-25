// zinc:lan on loopback (tests/t0/lan.sh): UDP to an address and to the broadcast addresses, TCP connect / accept / write / read / close.
import * as lan from 'zinc:lan';
import { clock } from 'zinc:sys';

function sleep(ms: number): void { const t = clock(); while (clock() - t < ms) {} }

console.log(`up ${lan.up()} address ${lan.address().length > 0}`);
const a = lan.udp(0), b = lan.udp(0);
console.log(`bound ${a.port > 0 && b.port > 0 && a.port !== b.port}`);
console.log(`nothing yet ${a.receive() === null}`);
b.send('127.0.0.1', a.port, 'hello');
b.send('255.255.255.255', a.port, 'everyone');
const seen: string[] = [];
for (let i = 0; i < 200 && seen.length < 2; i++) {
  const d = a.receive();
  if (d === null) { sleep(5); continue; }
  seen.push(d.text);
  if (d.text === 'hello') console.log(`from b ${d.port === b.port}`);
}
seen.sort((x: string, y: string) => x < y ? -1 : x > y ? 1 : 0);
console.log(`udp ${seen.join(' ')}`);
let thrown = '';
try { lan.connect('not an address', 1); } catch (e) { thrown = (e as Error).message; }
console.log(`bad address ${thrown.indexOf('zinc:lan') === 0}`);
const srv = lan.listen(0);
const c = lan.connect('127.0.0.1', srv.port);
let s: lan.TcpSocket | null = null;
for (let i = 0; i < 200 && s === null; i++) { s = srv.accept(); if (s === null) sleep(5); }
for (let i = 0; i < 200 && c.state() === lan.CONNECTING; i++) sleep(5);
console.log(`tcp open ${c.state() === lan.OPEN} ${s !== null}`);
console.log(`wrote ${c.write('ping')}`);
let got = '';
for (let i = 0; i < 200 && got.length < 4 && s !== null; i++) { got += s.read(); if (got.length < 4) sleep(5); }
console.log(`read ${got}`);
if (s !== null) { s.write('pong'); s.close(); }
let back = '';
for (let i = 0; i < 200 && c.state() === lan.OPEN; i++) { back += c.read(); sleep(5); }
console.log(`answer ${back} then closed ${c.state() === lan.CLOSED}`);
c.close(); srv.close(); a.close(); b.close();
