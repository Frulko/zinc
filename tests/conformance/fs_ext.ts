// zinc-test: requires fs process
// zinc:fs beyond text files: bytes, stat / readDir with types, mkdir -p, rm -r, rename, copyFile, links, temp dirs, and
// watch (polling, the same events on sim and native).
import * as fs from 'zinc:fs';

const tmp = fs.mkdtemp(fs.tmpdir() + '/zinc-fs-');
console.log(tmp.startsWith(fs.tmpdir() + '/zinc-fs-'), tmp.length === (fs.tmpdir() + '/zinc-fs-').length + 6, fs.stat(tmp).isDirectory);
const d = fs.realpath(tmp);
console.log(fs.mkdir(`${d}/a/b/c`), fs.mkdir(`${d}/a/b/c`, true), fs.mkdir(`${d}/a/b/c`, true), fs.stat(`${d}/a/b`).isDirectory);
fs.writeBytes(`${d}/a/bin.dat`, [0, 1, 2, 250, 255]);
console.log(fs.readBytes(`${d}/a/bin.dat`), fs.stat(`${d}/a/bin.dat`).size, fs.stat(`${d}/a/bin.dat`).isFile);
fs.writeText(`${d}/a/t.txt`, 'text');
fs.copyFile(`${d}/a/t.txt`, `${d}/a/copy.txt`);
fs.rename(`${d}/a/copy.txt`, `${d}/a/moved.txt`);
fs.symlink(`${d}/a/t.txt`, `${d}/a/link`);
fs.chmod(`${d}/a/t.txt`, 0o600);
console.log(fs.readText(`${d}/a/moved.txt`), fs.readlink(`${d}/a/link`) === `${d}/a/t.txt`, fs.lstat(`${d}/a/link`).isSymlink, fs.stat(`${d}/a/link`).isSymlink, fs.stat(`${d}/a/t.txt`).mode === 0o600);
for (const e of fs.readDir(`${d}/a`)) console.log(' ', e.name, e.isFile, e.isDirectory, e.isSymlink);
for (const f of [() => { fs.stat(`${d}/nope`); }, () => { fs.rename(`${d}/nope`, `${d}/x`); }, () => { fs.readDir(`${d}/a/t.txt`); }, () => { fs.copyFile(`${d}/nope`, `${d}/x`); }, () => { fs.readBytes(`${d}/nope`); }]) {
  try { f(); } catch (e) { console.log(e.message.replace(d, '<tmp>')); }
}
console.log(fs.remove(`${d}/a`), fs.remove(`${d}/a`, true), fs.exists(`${d}/a`), fs.remove(`${d}/a`, true));

// watch: each step waits for the events of the previous one
let step = 0, events = 0;
const next = (): void => {
  step++;
  if (step === 1) fs.writeText(`${d}/w.txt`, 'one');
  else if (step === 2) fs.appendText(`${d}/w.txt`, ' two');
  else if (step === 3) fs.rename(`${d}/w.txt`, `${d}/v.txt`);  // two events: 'rename v.txt', 'rename w.txt'
  else if (step === 4) fs.remove(`${d}/v.txt`);
};
const id = fs.watch(d, (event: string, name: string) => {
  events++;
  console.log('watch', event, name);
  if (events === 1 || events === 2 || events === 4) next();
  if (events === 5) {
    fs.unwatch(id);
    console.log('unwatched', fs.remove(d, true), fs.exists(d));
  }
});
next();
