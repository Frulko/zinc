// The compiler in a worker (ZN-774.30, D242): a UI lesson takes about 300 ms to compile, which the page's thread should not wait for.
// The first message gives { wasm: url of zinc-compile.wasm, std: url of std.json } (lib/std and targets/capabilities.json, path -> text);
// each next one { id, files: { 'src/main.ts': text, ... }, entry } answers { id, code, zbc, stderr, ms }. The project sits at /p.
import { compile } from './compiler.mjs';

let ready;
self.onmessage = async (e) => {
  const m = e.data;
  if (!ready) {
    ready = Promise.all([WebAssembly.compileStreaming(fetch(m.wasm)), fetch(m.std).then((r) => r.json())])
      .then(([module, std]) => ({ module, base: Object.entries(std).map(([k, v]) => ['/zinc/' + k, new TextEncoder().encode(v)]) }));
    ready.then(() => self.postMessage({ ready: true }), (err) => self.postMessage({ error: String(err) }));
    return;
  }
  const { module, base } = await ready;
  const files = new Map(base);
  for (const [k, v] of Object.entries(m.files)) files.set('/p/' + k, new TextEncoder().encode(v));
  try {
    const r = compile(module, files, '/p/' + m.entry);
    self.postMessage({ id: m.id, code: r.code, zbc: r.zbc, stderr: r.stderr, ms: r.ms }, r.zbc ? [r.zbc.buffer] : []);
  } catch (err) {
    self.postMessage({ id: m.id, code: -1, zbc: null, stderr: String(err && err.stack || err), ms: 0 });
  }
};
