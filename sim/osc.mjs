// zinc:osc for sim: same encoding as runtime/mod/osc.cpp
import * as dgram from 'node:dgram';
let tx = null, rx = null;
const pad = b => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const str = s => pad(Buffer.from(s + '', 'utf8'));
export function send(host, port, address, numbers, strings = []) {
  tx ??= dgram.createSocket('udp4');
  const tags = ',' + numbers.map(v => (Number.isInteger(v) && v === (v | 0) ? 'i' : 'f')).join('') + strings.map(() => 's').join('');
  const parts = [str(address), str(tags)];
  for (const v of numbers) {
    const b = Buffer.alloc(4);
    if (Number.isInteger(v) && v === (v | 0)) b.writeInt32BE(v); else b.writeFloatBE(v);
    parts.push(b);
  }
  for (const s of strings) parts.push(str(s));
  tx.send(Buffer.concat(parts), port, host);
}
function readStr(b, off) { const e = b.indexOf(0, off); return [b.toString('utf8', off, e), (e + 4) & ~3]; }
export function listen(port, cb) {
  rx = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  rx.on('message', b => {
    let [address, off] = readStr(b, 0);
    let tags; [tags, off] = readStr(b, off);
    const m = { address, numbers: [], strings: [] };
    for (const c of tags.slice(1)) {
      if (c === 'i') { m.numbers.push(b.readInt32BE(off)); off += 4; }
      else if (c === 'f') { m.numbers.push(b.readFloatBE(off)); off += 4; }
      else if (c === 'd') { m.numbers.push(b.readDoubleBE(off)); off += 8; }
      else if (c === 'T' || c === 'F') m.numbers.push(c === 'T' ? 1 : 0);
      else if (c === 's') { let s; [s, off] = readStr(b, off); m.strings.push(s); }
      else break;
    }
    cb(m);
  });
  rx.bind(port);
}
export const close = () => { rx?.close(); tx?.close(); rx = tx = null; };
