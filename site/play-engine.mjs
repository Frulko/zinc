// The engine of the playground (/play/, ZN-774.30), copied into public/wasm/ before the site builds: the compiler and the interpreter
// built to wasm (tools/build-wasm compiler, tools/build-wasm: ../build-wasm/), their glue (../targets/wasm/glue/) and std.json, the standard
// library and targets/capabilities.json as one JSON object (path -> text) that the compiler reads as its file system.
// Without ../build-wasm the page still builds and says the engine is missing; the Pages workflow builds it first.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('..'), OUT = path.resolve('public/wasm');
fs.mkdirSync(OUT, { recursive: true });
for (const f of ['compiler.mjs', 'compile-worker.mjs', 'worker.mjs', 'wasi.mjs']) fs.copyFileSync(path.join(ROOT, 'targets/wasm/glue', f), path.join(OUT, f));
for (const f of ['zinc-compile.wasm', 'vm-web.wasm']) {
  const src = path.join(ROOT, 'build-wasm', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
  else console.warn(`play-engine: no ${path.relative(ROOT, src)} (tools/build-wasm${f.startsWith('zinc') ? ' compiler' : ''}): /play/ will say the engine is missing`);
}
const std = {};
const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walk(p); else std[path.relative(ROOT, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8'); } };
walk(path.join(ROOT, 'lib/std'));
std['targets/capabilities.json'] = fs.readFileSync(path.join(ROOT, 'targets/capabilities.json'), 'utf8');
fs.writeFileSync(path.join(OUT, 'std.json'), JSON.stringify(std));
