// JSON.parse, JSON.stringify and fs.writeText of a 3 MB document shaped like the iPod demo's similar-artists cache:
// 960 objects {artist, at, similar: [{artist, match} x 100]}. `zinc run bench/json_large.ts` (add --interp or --engine quickjs).
import * as fs from 'zinc:fs';

function make(): string {
  const out: unknown[] = [];
  let seed = 7;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 960; i++) {
    const sim: unknown[] = [];
    for (let j = 0; j < 100; j++) sim.push({ artist: 'Artist name ' + Math.floor(rnd() * 5000), match: Math.floor(rnd() * 1e6) / 1e6 });
    out.push({ artist: 'Band é ' + i, at: 1700000000000 + i * 1000, similar: sim });
  }
  return JSON.stringify(out);
}

const text = make();
const path = fs.tmpdir() + '/zinc-json-large.json';
console.log('bytes', text.length);
for (let r = 0; r < 5; r++) {
  const t0 = performance.now();
  const v: any = JSON.parse(text);
  const t1 = performance.now();
  const s = JSON.stringify(v);
  const t2 = performance.now();
  fs.writeText(path, s);
  const t3 = performance.now();
  console.log('ms: parse', (t1 - t0).toFixed(1), 'stringify', (t2 - t1).toFixed(1), 'writeText', (t3 - t2).toFixed(1), s === text);
}
fs.remove(path);
