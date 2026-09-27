// zinc:storage for sim: same file format as runtime/mod/storage.cpp
import * as fs from 'node:fs';
const file = () => process.env.ZINC_STORAGE ?? 'zinc.storage';
let db = null;
const esc = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
const unesc = s => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
function load() {
  if (db) return;
  db = new Map();
  if (!fs.existsSync(file())) return;
  for (const line of fs.readFileSync(file(), 'utf8').split('\n')) {
    const i = line.indexOf('\t');
    if (i >= 0) db.set(unesc(line.slice(0, i)), unesc(line.slice(i + 1)));
  }
}
const save = () => fs.writeFileSync(file(), [...db].map(([k, v]) => `${esc(k)}\t${esc(v)}\n`).join(''));
export const get = k => { load(); return db.get(k) ?? ''; };
export const set = (k, v) => { load(); db.set(k, v); save(); };
export const remove = k => { load(); db.delete(k); save(); };
export const keys = () => { load(); return [...db.keys()]; };
