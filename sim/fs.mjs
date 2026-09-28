// zinc:fs for sim (same error messages and watch events as runtime/mod/fs.cpp)
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const wrap = (what, p, f) => { try { return f(); } catch { throw new Error(what + p); } };
const coded = (op, p, f) => { try { return f(); } catch (e) { throw new Error(`${e.code ?? 'EIO'}: ${op} ${p}`); } };
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);  // bytes of UTF-8 = code points, like str_cmp
export const readText = p => wrap('ENOENT: cannot open ', p, () => fs.readFileSync(p, 'utf8'));
export const writeText = (p, d) => wrap('EACCES: cannot write ', p, () => fs.writeFileSync(p, d));
export const appendText = (p, d) => wrap('EACCES: cannot write ', p, () => fs.appendFileSync(p, d));
export const readBytes = p => wrap('ENOENT: cannot open ', p, () => Array.from(fs.readFileSync(p)));
export const writeBytes = (p, d) => wrap('EACCES: cannot write ', p, () => fs.writeFileSync(p, Uint8Array.from(d)));
export const exists = p => fs.existsSync(p);
export const list = d => wrap('ENOENT: cannot list ', d, () => fs.readdirSync(d).sort(byName));
export const remove = (p, recursive) => {
  try { if (recursive) { if (!fs.existsSync(p) && !isLink(p)) return false; fs.rmSync(p, { recursive: true, force: true }); } else if (fs.lstatSync(p).isDirectory()) fs.rmdirSync(p); else fs.unlinkSync(p); return true; } catch { return false; }
};
const isLink = p => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
export const mkdir = (p, recursive) => {
  try { if (recursive) { fs.mkdirSync(p, { recursive: true }); return fs.statSync(p).isDirectory(); } fs.mkdirSync(p); return true; } catch { return false; }
};
const toStat = s => ({ size: s.size, mtimeMs: s.mtimeMs, atimeMs: s.atimeMs, ctimeMs: s.ctimeMs, mode: s.mode & 0o7777, isFile: s.isFile(), isDirectory: s.isDirectory(), isSymlink: s.isSymbolicLink() });
export const stat = p => coded('stat', p, () => toStat(fs.statSync(p)));
export const lstat = p => coded('lstat', p, () => toStat(fs.lstatSync(p)));
export const readDir = d => coded('scandir', d, () => fs.readdirSync(d, { withFileTypes: true })
  .map(e => ({ name: e.name, isFile: e.isFile(), isDirectory: e.isDirectory(), isSymlink: e.isSymbolicLink() }))
  .sort((a, b) => byName(a.name, b.name)));
export const rename = (a, b) => coded('rename', a, () => fs.renameSync(a, b));
export const copyFile = (a, b) => {
  if (!fs.existsSync(a)) throw new Error(`ENOENT: copyfile ${a}`);
  coded('copyfile', b, () => fs.copyFileSync(a, b));
};
export const realpath = p => coded('realpath', p, () => fs.realpathSync(p));
export const mkdtemp = prefix => coded('mkdtemp', prefix, () => fs.mkdtempSync(prefix));
export const tmpdir = () => os.tmpdir();
export const symlink = (t, p) => coded('symlink', p, () => fs.symlinkSync(t, p));
export const readlink = p => coded('readlink', p, () => fs.readlinkSync(p));
export const chmod = (p, mode) => coded('chmod', p, () => fs.chmodSync(p, mode));

// watch: stat polling every 100 ms, the same algorithm as fs.cpp
function snapshot(p) {
  let st;
  try { st = fs.statSync(p); } catch { return []; }
  if (!st.isDirectory()) return [[path.basename(p), st.size, st.mtimeMs]];
  const out = [];
  for (const n of fs.readdirSync(p).sort(byName)) { try { const s = fs.statSync(p + '/' + n); out.push([n, s.size, s.mtimeMs]); } catch { /* gone */ } }
  return out;
}
const watches = new Map();
let nextWatch = 1;
export function watch(p, cb) {
  if (!fs.existsSync(p)) throw new Error(`ENOENT: watch ${p}`);
  const id = nextWatch++;
  let old = snapshot(p);
  const timer = setInterval(() => {
    const now = snapshot(p);
    const events = [];
    let i = 0, j = 0;
    while (i < old.length || j < now.length) {
      const c = i >= old.length ? 1 : j >= now.length ? -1 : byName(old[i][0], now[j][0]);
      if (c < 0) events.push(['rename', old[i++][0]]);
      else if (c > 0) events.push(['rename', now[j++][0]]);
      else { if (old[i][1] !== now[j][1] || old[i][2] !== now[j][2]) events.push(['change', now[j][0]]); i++; j++; }
    }
    old = now;
    for (const [e, n] of events) { if (!watches.has(id)) break; cb(e, n); }
  }, 100);
  watches.set(id, timer);
  return id;
}
export function unwatch(id) { const t = watches.get(id); if (t) { clearInterval(t); watches.delete(id); } }
