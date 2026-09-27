// zinc:assets for sim: reads the project's assets directory (set by the generated run.mjs)
import * as fs from 'node:fs';
import * as path from 'node:path';
const dir = () => process.env.ZINC_ASSETS ?? globalThis.$zAssetsDir ?? 'assets';
const file = n => path.join(dir(), n);
const load = n => { try { return fs.readFileSync(file(n)); } catch { throw new Error('asset not found: ' + n); } };
export const readText = n => load(n).toString('utf8');
export const readBytes = n => [...load(n)];
export const exists = n => fs.existsSync(file(n));
export function list() {
  const out = [];
  const walk = (d, pre) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d).sort()) { if (f.startsWith('.')) continue; const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, pre + f + '/'); else out.push(pre + f); } };
  walk(dir(), '');
  return out.sort();
}
