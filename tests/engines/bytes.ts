import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
const bytes = sys.utf8Encode('héllo 🦀');
console.log('utf8', bytes.length, sys.utf8Decode(bytes));
bytes[0] = 72;
console.log('mutation', sys.utf8Decode(bytes));
const empty = sys.utf8Encode('');
console.log('empty', empty.length, sys.utf8Decode(empty) === '');
const binary: u8[] = [0, 128, 255];
const dir = fs.mkdtemp(fs.tmpdir() + '/zinc-bytes-');
try {
  const file = dir + '/bytes';
  fs.writeBytes(file, binary);
  const copy = fs.readBytes(file);
  console.log('binary', copy.length, copy[0], copy[1], copy[2]);
  copy[1] = 7;
  console.log('copy', binary[1], copy[1]);
  fs.writeBytes(file, empty);
  console.log('empty file', fs.readBytes(file).length);
} finally { fs.remove(dir, true); }
console.log('random', sys.randomBytes(32).length);

const wide: i32 = 511;
const narrow: u8 = wide as u8;
console.log('narrow', narrow);
let counter: u8 = 255;
counter++;
console.log('wrap', counter);
let index: i32 = 0;
const wrap: u8[] = [255, 0];
const previous = wrap[index++]++;
const next = --wrap[1];
console.log('updates', previous, wrap[0], next, wrap[1], index);
let total: i32 = 0;
for (let i: i32 = 0; i < 1000; i++) total += sys.utf8Encode('collected bytes').length;
console.log('retained bytes', sys.utf8Decode(bytes), total);
