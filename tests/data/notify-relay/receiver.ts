// tests/t1/notify_relay.sh: a tablet for Zinc Relay (examples/notify-relay) on this Mac, the side examples/music plays on the Nexus 7.
// Advertises `notify` (LINK_SERVICE), opens a pairing when run with `pair` and prints its code, then prints what the relay sends: hello,
// notif (one line of fields), icon (checked: the PNG's size and its SHA-256 against the hash). It acks every notif, drops the first icon
// it gets (a tablet that lost its cache: the next notif of that app asks need-icon), asks for any icon or avatar it lacks, answers mute
// to a notif titled "Mute this site" / "Mute this app" and open to one titled "Open me" (as a tap would).
import * as link from 'zinc:link';
import { args, env } from 'zinc:sys';
import { sha256, base64Decode } from 'zinc:web';

function hex(b: u8[]): string {
  const d = '0123456789abcdef';
  let s = '';
  for (const x of b) s += d.charAt(x >> 4) + d.charAt(x & 15);
  return s;
}
function be32(b: u8[], at: i32): number { return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]; }

link.init({ name: 'Tablet', store: env('LINK_STORE') });
const port = link.advertise({ service: env('LINK_SERVICE'), name: 'Tablet', port: 0 });
link.onPaired((p: link.Peer) => console.log('paired ' + p.name));
const icons: string[] = [];
let dropped = false;
function known(hash: string): string { return hash === '' || hash === 'null' ? 'none' : icons.indexOf(hash) >= 0 ? 'known' : 'missing'; }
function ask(ch: link.Channel, h: string): void { if (h !== '' && icons.indexOf(h) < 0) { ch.send({ t: 'need-icon', hash: h }); console.log('need-icon sent'); } }
link.onConnection((ch: link.Channel) => {
  console.log('accept ' + ch.peer.name);
  ch.onMessage((m: any) => {
    const t = '' + m.t;
    if (t === 'hello') { console.log('hello ' + m.app + ' v' + m.v + ' from ' + m.host); return; }
    if (t === 'icon') {
      if (!dropped) { dropped = true; console.log('icon dropped'); return; }
      const png = base64Decode('' + m.png);
      const ok = png.length > 24 && png[1] === 80 && png[2] === 78 && png[3] === 71 && hex(sha256(png)) === '' + m.hash;
      if (ok && icons.indexOf('' + m.hash) < 0) icons.push('' + m.hash);
      console.log('icon ' + (ok ? 'ok ' + be32(png, 16) + 'x' + be32(png, 20) : 'bad'));
      return;
    }
    if (t !== 'notif') { console.log('other ' + t); return; }
    const icon = '' + m.app.icon;
    const avatar = m.avatar === null ? '' : '' + m.avatar;
    console.log('notif ' + m.app.id + ' | ' + m.app.name + ' | ' + m.title + ' | ' + m.subtitle + ' | ' + m.body + ' | ' + (m.domain === null ? '-' : '' + m.domain) +
      ' | icon ' + known(icon) + ' | ' + (typeof m.date === 'number' && (m.date as number) > 1700000000 ? 'dated' : 'undated') + ' | ' + m.kind +
      ' | sender ' + m.sender + ' | avatar ' + known(avatar));
    ch.send({ t: 'ack', id: m.id });
    ask(ch, icon);
    ask(ch, avatar);
    if (m.title === 'Mute this site') { ch.send({ t: 'mute', domain: m.domain }); console.log('mute sent'); }
    if (m.title === 'Mute this app') { ch.send({ t: 'mute', app: m.app.id }); console.log('mute sent'); }
    if (m.title === 'Open me') { ch.send({ t: 'open', id: m.id }); console.log('open sent'); }
  });
  ch.onClose((why: string) => console.log('closed'));
});
const a = args();
const code = a.length > 0 && a[a.length - 1] === 'pair' ? link.openPairing() : '';
console.log('ready port ' + port + ' code ' + code);
