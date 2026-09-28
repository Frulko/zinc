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
// untrusted datagrams, decoded like runtime/mod/osc.cpp: no NUL ends the message (address, tags) or the arguments
function readStr(b, off) { const e = off < b.length ? b.indexOf(0, off) : -1; return e < 0 ? [null, -1] : [b.toString('utf8', off, e), (e + 4) & ~3]; }
export function listen(port, cb) {
  rx = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  rx.on('message', b => {
    let [address, off] = readStr(b, 0);
    if (address === null) return;
    let tags; [tags, off] = readStr(b, off);
    if (tags === null) return;
    const m = { address, numbers: [], strings: [] };
    for (const c of tags.slice(1)) {
      if (off > b.length) break;
      if (c === 'i' && off + 4 <= b.length) { m.numbers.push(b.readInt32BE(off)); off += 4; }
      else if (c === 'f' && off + 4 <= b.length) { m.numbers.push(b.readFloatBE(off)); off += 4; }
      else if (c === 'd' && off + 8 <= b.length) { m.numbers.push(b.readDoubleBE(off)); off += 8; }
      else if (c === 'T' || c === 'F') m.numbers.push(c === 'T' ? 1 : 0);
      else if (c === 'r' && off + 4 <= b.length) { for (let k = 0; k < 4; k++) m.numbers.push(b[off + k]); off += 4; }   // RGBA colour: 4 numbers 0..255
      else if (c === 's') { let s; [s, off] = readStr(b, off); if (s === null) break; m.strings.push(s); }
      else break;
    }
    cb(m);
  });
  rx.bind(port);
}
export const close = () => { rx?.close(); tx?.close(); rx = tx = null; };
