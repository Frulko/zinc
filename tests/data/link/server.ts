// tests/t1/link.sh: the advertiser (the tablet's side). `server.ts pair` opens a pairing and prints its code; `server.ts` alone only
// accepts the peers it already knows. Echoes what a peer sends: {t: 'echo', n} for a message, the bytes reversed with kind + 1.
import * as link from 'zinc:link';
import { args, env } from 'zinc:sys';

link.init({ name: 'Tablet', store: env('LINK_STORE') });
const port = link.advertise({ service: env('LINK_SERVICE'), name: 'Tablet', port: 0 });
link.onPairing((s: string) => console.log('pairing ' + s));
link.onPaired((p: link.Peer) => console.log('paired ' + p.name));
link.onConnection((ch: link.Channel) => {
  console.log('accept ' + ch.peer.name);
  ch.onMessage((m: any) => { console.log('got ' + m.t + ' ' + m.n); ch.send({ t: 'echo', n: (m.n as number) + 1 }); });
  ch.onBytes((kind: i32, b: u8[]) => {
    const r: u8[] = [];
    for (let i = b.length - 1; i >= 0; i--) r.push(b[i]);
    ch.sendBytes(kind + 1, r);
  });
  ch.onClose((why: string) => console.log('closed ' + ch.peer.name));
});
const a = args();
const code = a.length > 0 && a[a.length - 1] === 'pair' ? link.openPairing() : '';
console.log('ready port ' + port + ' code ' + code + ' id ' + link.id());
