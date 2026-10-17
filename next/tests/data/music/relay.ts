// A stand-in for Zinc Relay (ZN-757) to prove examples/music's side on a real tablet (ZN-758): the Mac's end of zinc:link and of the relay's
// protocol (docs/reports/notification-relay-design.md), with made-up notifications only.
//   zinc run tests/data/music/relay.ts -- pair <code>   finds "Musique" (service notify) with its pairing open and pairs with the code
//   zinc run tests/data/music/relay.ts -- send          connects with the stored key
// Then it sends RELAY_FEED (feed.py's lines "<seconds> <message JSON>", the seconds counted from the channel's opening) but its icons,
// sends an icon when the tablet asks for it (need-icon), and exits RELAY_HOLD seconds after the last line (default 3). LINK_ADDR=host:port pairs or connects at an
// address typed by hand (no discovery); LINK_STORE names the key file.
import * as link from 'zinc:link';
import { args, env, exit } from 'zinc:sys';
import { readText } from 'zinc:fs';

link.init({ name: 'MacBook de test', store: env('LINK_STORE') });
const a = args();
const mode = a.length >= 2 && a[a.length - 2] === 'pair' ? 'pair' : 'send';
const code = mode === 'pair' ? a[a.length - 1] : '';
const lines: string[] = [];
for (const l of readText(env('RELAY_FEED')).split('\n')) if (l.trim() !== '') lines.push(l);
const hold = env('RELAY_HOLD') !== '' ? parseFloat(env('RELAY_HOLD')) : 3;
let busy = false;

function talk(p: link.Peer): void {
  const ch = link.connect(p);
  let started = false;
  ch.onOpen(() => {
    console.log('open ' + ch.peer.name);
    if (started) return;
    started = true;
    let last = 0;
    for (const l of lines) {
      const sp = l.indexOf(' '), at = parseFloat(l.slice(0, sp)), m = JSON.parse(l.slice(sp + 1));
      last = Math.max(last, at);
      if (m.t === 'icon') continue;   // sent when the tablet asks for it (need-icon)
      setTimeout(() => { console.log('send ' + m.t + (m.t === 'notif' ? ' ' + m.id : '') + ' ' + ch.send(m)); }, at * 1000);
    }
    setTimeout(() => { ch.close(); exit(0); }, (last + hold) * 1000);
  });
  ch.onMessage((m: any) => {
    console.log('got ' + m.t + ' ' + (m.hash !== undefined ? m.hash : ''));
    if (m.t !== 'need-icon') return;
    for (const l of lines) if (l.indexOf('"t": "icon"') >= 0 && l.indexOf('"' + m.hash + '"') >= 0) ch.send(JSON.parse(l.slice(l.indexOf(' ') + 1)));
  });
  ch.onClose((why: string) => console.log('drop ' + (why === '' ? 'by the peer' : why)));
}
function pairWith(to: link.Address): void {
  link.pair(to, code).then((q: link.Peer) => { console.log('paired ' + q.name); talk(q); }).catch((e: Error) => { console.log('refused ' + e.message); exit(3); });
}

const typed = env('LINK_ADDR');
const at: link.Address | null = typed !== '' ? { host: typed.slice(0, typed.lastIndexOf(':')), port: parseInt(typed.slice(typed.lastIndexOf(':') + 1)) } : null;
if (mode === 'pair' && at !== null) pairWith(at as link.Address);
else if (mode === 'send' && at !== null && link.peers().length > 0) { const k = link.peers()[0]; k.host = (at as link.Address).host; k.port = (at as link.Address).port; talk(k); }
else link.browse('notify', (p: link.Peer, present: boolean) => {
  if (!present || busy) return;
  console.log('found ' + p.name + (p.pairing ? ' pairing' : '') + ' at ' + p.host + ':' + p.port);
  if (mode === 'pair') { if (p.pairing) { busy = true; pairWith(p); } return; }
  for (const k of link.peers()) if (k.id === p.id) { busy = true; talk(k); }
});
setTimeout(() => { console.log('timeout'); exit(2); }, 120000);
