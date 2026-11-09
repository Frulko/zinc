import { sha256, sha256File, toHex } from 'zinc:hash';
import * as fs from 'zinc:fs';
import { utf8Encode } from 'zinc:sys';
// zinc:hash (ZN-698): the FIPS 180-4 test vectors of SHA-256 for bytes, and for files read in 64 KiB blocks (one million 'a': sixteen blocks).
console.log(toHex(sha256([])));
console.log(toHex(sha256(utf8Encode('abc'))));
console.log(toHex(sha256(utf8Encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))));
const dir = fs.mkdtemp(fs.tmpdir() + '/zn-hash-');
fs.writeText(dir + '/a.txt', 'a'.repeat(1000000));
fs.writeText(dir + '/empty.txt', '');
console.log(toHex(sha256File(dir + '/a.txt')));
console.log(toHex(sha256File(dir + '/empty.txt')), sha256File(dir + '/a.txt').length);
try { sha256File(dir + '/missing'); } catch (e) { console.log('missing', e.message.slice(0, 6)); }
fs.remove(dir, true);
