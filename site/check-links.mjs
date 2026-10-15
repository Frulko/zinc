// Every href/src starting with /zinc/ in dist must exist. Run after `pnpm build`.
import fs from 'node:fs';
import path from 'node:path';
const dist = 'dist';
let bad = 0, n = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(dist).filter((f) => f.endsWith('.html'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:href|src)="(\/zinc\/[^"#?]*)/g)) {
    n++;
    const p = path.join(dist, m[1].slice('/zinc/'.length));
    if (!(fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html'))))) { bad++; console.log('BROKEN', f, m[1]); }
  }
}
console.log(`${n} links checked, ${bad} broken`);
process.exit(bad ? 1 : 0);
