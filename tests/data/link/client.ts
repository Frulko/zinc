// tests/t1/link.sh: the side that browses (the Mac's). `client.ts pair <code>` finds the advertiser, pairs with the code (a wrong one is
// refused; LINK_ADDR=host:port pairs with an address typed by hand) and exchanges once; `client.ts again` connects with the stored key, exchanges, and once the advertiser restarted exchanges again
// on the same channel, which reconnected by itself.
import * as link from 'zinc:link';
import { args, env, exit } from 'zinc:sys';

link.init({ name: 'Client', store: env('LINK_STORE') });
const a = args();
const mode = a.length >= 2 && a[a.length - 2] === 'pair' ? 'pair' : 'again';
const code = mode === 'pair' ? a[a.length - 1] : '';
let rounds = 0;

function talk(p: link.Peer): void {
  const ch = link.connect(p);
  ch.onOpen(() => {
    console.log('open ' + ch.peer.name);
    ch.send({ t: 'hi', n: rounds * 10 + 1 });
    ch.sendBytes(7, [1, 2, 3, 250]);
  });
  let got = 0;
  ch.onMessage((m: any) => { console.log('message ' + m.t + ' ' + (m.t === 'hello' ? m.from : m.n)); if (m.t === 'hello') return; got++; done(ch, got); });   // hello: the device's greeting
  ch.onBytes((kind: i32, b: u8[]) => { console.log('bytes ' + kind + ' ' + b.join(',')); got++; done(ch, got); });
  ch.onClose((why: string) => console.log('drop ' + (why === '' ? 'by the peer' : why)));
}
function done(ch: link.Channel, got: i32): void {
  if (got % 2 !== 0) return;
  rounds++;
  console.log('round ' + rounds);
  if (mode === 'pair' || rounds === 2) { ch.close(); exit(0); }
}

function pairWith(to: link.Address): void {
  link.pair(to, code).then((q: link.Peer) => { console.log('paired ' + q.name); talk(q); }).catch((e: Error) => { console.log('refused ' + e.message); exit(3); });
}

let busy = false;
const typed = env('LINK_ADDR');   // host:port typed by hand: no discovery
if (mode === 'pair' && typed !== '') pairWith({ host: typed.slice(0, typed.lastIndexOf(':')), port: parseInt(typed.slice(typed.lastIndexOf(':') + 1)) });
else link.browse(env('LINK_SERVICE'), (p: link.Peer, present: boolean) => {
  if (!present || busy) return;
  if (mode === 'pair') {
    if (!p.pairing) return;
    busy = true;
    console.log('found ' + p.name + ' pairing');
    pairWith(p);
  } else {
    for (const k of link.peers()) if (k.id === p.id) { busy = true; console.log('found ' + p.name + ' paired'); talk(k); }
  }
});
setTimeout(() => { console.log('timeout'); exit(2); }, 40000);
