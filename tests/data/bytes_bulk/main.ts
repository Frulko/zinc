import * as fs from 'zinc:fs';
import { utf8Encode, randomBytes } from 'zinc:sys';
// The bulk byte rows (ZN-1019): utf8Encode, randomBytes and readBytes in one host call; writeBytesAt in place, past the end and on a new file.
const dir = fs.mkdtemp(fs.tmpdir() + '/zn-bytes-');
const p = dir + '/a.bin';
console.log(utf8Encode('aé€😀').join(','), utf8Encode('').length);
console.log(randomBytes(16).length, randomBytes(0).length);
const big: u8[] = [];
for (let i = 0; i < 70000; i++) big.push(((i * 7) & 255) as u8);
fs.writeBytes(p, big);
const back = fs.readBytes(p);
let same = back.length === big.length;
for (let i = 0; i < back.length && same; i++) same = back[i] === big[i];
console.log('read', back.length, same);
fs.writeBytesAt(p, [1, 2, 3], 2);
fs.writeBytesAt(p, [9], 70002);
const c = fs.readBytes(p);
console.log('at', c.slice(0, 6).join(','), c.length, c[69999], c[70000], c[70001], c[70002]);
fs.writeBytesAt(dir + '/new.bin', [5], 3);
fs.appendBytes(dir + '/new.bin', [6, 7]);
console.log('new', fs.readBytes(dir + '/new.bin').join(','));
try { fs.readBytes(dir + '/missing'); } catch (e) { console.log('missing', e.message.slice(0, 6)); }
try { fs.writeBytesAt(dir + '/neg.bin', [1], -1); } catch (e) { console.log('negative', e.message.slice(0, 6)); }
fs.remove(dir, true);
