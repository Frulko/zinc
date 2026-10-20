// The phone's side of the zinc:link proof between two machines (docs/plugins/link.md, "Proven"): on the Nexus 7 it advertises
// "zn-device" on the default port, opens a pairing (unless LINK_PAIR=0), says hello to each peer that connects and echoes what it sends.
// Its lines go to the log (adb logcat); tests/data/link/client.ts with LINK_SERVICE=zn-device is the other side, on the Mac.
import * as link from 'zinc:link';
import { env } from 'zinc:sys';

link.init({ name: 'Nexus 7' });
const port = link.advertise({ service: 'zn-device', name: 'Nexus 7' });
link.onPairing((s: string) => console.log('link: pairing ' + s));
link.onPaired((p: link.Peer) => console.log('link: paired ' + p.name));
link.onConnection((ch: link.Channel) => {
  console.log('link: accept ' + ch.peer.name);
  ch.send({ t: 'hello', from: 'Nexus 7' });
  ch.onMessage((m: any) => {
    console.log('link: got ' + m.t);
    if (m.t === 'hi') ch.send({ t: 'echo', n: (m.n as number) + 1 });
  });
  ch.onBytes((kind: i32, b: u8[]) => {
    const r: u8[] = [];
    for (let i = b.length - 1; i >= 0; i--) r.push(b[i]);
    ch.sendBytes(kind + 1, r);
  });
  ch.onClose((why: string) => console.log('link: closed ' + why));
});
const code = env('LINK_PAIR') === '0' ? '' : link.openPairing();
console.log('link: ready port ' + port + ' code ' + code + ' addresses ' + link.addresses().join(','));
