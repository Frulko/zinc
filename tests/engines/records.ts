import * as fs from 'zinc:fs';
const dir = fs.mkdtemp(fs.tmpdir() + '/zinc-records-');
try {
  const file = dir + '/file';
  fs.writeText(file, 'hello');
  const info = fs.stat(file);
  console.log('file', info.size, info.isFile, info.isDirectory, info.isSymlink, info.mtimeMs > 0, info.mode > 0);
  const directory = fs.stat(dir);
  console.log('dir', directory.isFile, directory.isDirectory, directory.isSymlink);
  fs.symlink(file, dir + '/link');
  console.log('link', fs.lstat(dir + '/link').isSymlink, fs.stat(dir + '/link').isFile);
  info.size = 99;
  console.log('snapshot', info.size, fs.stat(file).size);
  try { fs.stat(dir + '/missing'); }
  catch (e) { console.log('caught', e.name, e.message !== ''); }
} finally { console.log('cleanup', fs.remove(dir, true)); }
import Samples from './records/sample.spec';
const first = Samples.sample(7);
first.label = 'changed';
const second = Samples.sample(-2);
console.log('sample', first.value, first.label, first.ready, second.value, second.label, second.ready, first === second);
let sum: i32 = 0;
for (let i: i32 = 0; i < 2000; i++) { const item = Samples.sample(i); sum += item.value; }
console.log('retained', first.label, second.label, sum);
