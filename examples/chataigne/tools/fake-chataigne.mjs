#!/usr/bin/env node
// A stand-in for Chataigne on the network, to test the OSC round trip without it (Node, no dependencies).
// It listens where Chataigne's OSC module listens (12000), answers to the app's port (9000) and prints both ways:
//   - meters follow the faders it hears, 20 times a second;
//   - GO answers with a cue name and a cue colour, sent as an OSC 'r' argument (Chataigne's default colour mode);
//   - chat is answered, toggles are echoed back, a heartbeat goes out every second.
//
//   node examples/chataigne/tools/fake-chataigne.mjs [seconds]      # exits after `seconds` (default: never)
//   ZINC_CHATAIGNE_DEMO=1 zinc run examples/chataigne                # in another terminal: scripted gestures
import * as dgram from 'node:dgram';

const LISTEN = 12000, APP_HOST = '127.0.0.1', APP_PORT = 9000;
const sock = dgram.createSocket('udp4');

// ---- OSC 1.0 encoding: i / f / s / r arguments; strings padded to 4 bytes
const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const str = (s) => pad(Buffer.from(s, 'utf8'));
function encode(address, args) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    const b = Buffer.alloc(4);
    if (typeof a === 'string') { tags += 's'; parts.push(str(a)); continue; }
    if (a.rgba) { tags += 'r'; a.rgba.forEach((v, k) => b.writeUInt8(v, k)); }
    else if (Number.isInteger(a)) { tags += 'i'; b.writeInt32BE(a); }
    else { tags += 'f'; b.writeFloatBE(a); }
    parts.push(b);
  }
  return Buffer.concat([str(address), str(tags), ...parts]);
}
function decode(b) {
  const read = (off) => { const e = b.indexOf(0, off); return [b.toString('utf8', off, e), (e + 4) & ~3]; };
  let [address, off] = read(0), tags;
  [tags, off] = read(off);
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(b.readInt32BE(off)); off += 4; }
    else if (t === 'f') { args.push(+b.readFloatBE(off).toFixed(3)); off += 4; }
    else if (t === 's') { let s; [s, off] = read(off); args.push(s); }
  }
  return { address, args };
}
const send = (address, ...args) => {
  sock.send(encode(address, args), APP_PORT, APP_HOST);
  if (!address.startsWith('/zinc/meter/')) console.log(`-> ${address} ${args.map((a) => JSON.stringify(a.rgba ?? a)).join(' ')}`);
};

// ---- a tiny show: what the Zinc module plus a few Chataigne mappings would do
const faders = [0.8, 0.55, 0.3, 0.65];
const cues = ['Preset', 'Doors open', 'Walk-in', 'Sunrise'];
let cue = 0;
sock.on('message', (b) => {
  const { address, args } = decode(b);
  console.log(`<- ${address} ${args.map((a) => JSON.stringify(a)).join(' ')}`);
  const n = Number(address.split('/').pop());
  if (address.startsWith('/zinc/fader/')) faders[n - 1] = args[0];
  else if (address.startsWith('/zinc/toggle/')) send(address, args[0]);
  else if (address === '/zinc/cue/go') {
    cue = (cue + 1) % cues.length;
    send('/zinc/cue/name', `Cue ${cue + 1} · ${cues[cue]}`);
    send('/zinc/cue/running', 1);
    send('/zinc/color', { rgba: [255, 64 * cue, 128, 255] });
  }
  else if (address === '/zinc/cue/stop') send('/zinc/cue/running', 0);
  else if (address === '/zinc/chat') send('/zinc/chat', `fake Chataigne heard "${args[0]}"`);
});
sock.bind(LISTEN, () => {
  console.log(`fake Chataigne: listening on ${LISTEN}, sending to ${APP_HOST}:${APP_PORT}`);
  send('/zinc/cue/name', `Cue 1 · ${cues[0]}`);
});
setInterval(() => faders.forEach((v, i) => send(`/zinc/meter/${i + 1}`, v * (0.8 + 0.2 * Math.random()))), 50);
setInterval(() => send('/zinc/ping'), 1000);
const seconds = Number(process.argv[2] ?? 0);
if (seconds > 0) setTimeout(() => process.exit(0), seconds * 1000);
