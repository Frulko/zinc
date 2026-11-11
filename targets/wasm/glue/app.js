import { nativeServices } from './native-services.mjs';
import { nativeDeclarations, serveNative } from './native.mjs';
// The page of the browser build (ZN-135, zinc export --target wasm: ZN-326.01): ?zbc=<file.zbc>&wasm=<vm-web.wasm>&frames=<n> (frames: stop after n ticks and publish the last frame as a PNG in #png; default: run forever).
// Needs cross-origin isolation: serve with Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.
const q = new URL(location.href).searchParams;
const customProgram = q.has('zbc') || q.has('wasm');
const zbcUrl = q.get('zbc') || 'app.zbc', wasmUrl = q.get('wasm') || 'app.wasm', maxFrames = Number(q.get('frames') || 0);
const log = document.getElementById('log');
const canvas = document.getElementById('c');
window.addEventListener("error", (e) => { document.getElementById('splash')?.remove(); log.textContent += "error: " + e.message + "\n"; });
window.addEventListener('unhandledrejection', (e) => { log.textContent += 'error: ' + String(e.reason) + '\n'; document.getElementById('splash')?.remove(); });
const Z = nativeServices();
const { declarations } = customProgram ? { declarations: [] } : await import('./natives.js');
const natives = nativeDeclarations(Z, declarations);
if (!crossOriginIsolated) { log.textContent = 'This page needs cross-origin isolation (COOP/COEP headers) for SharedArrayBuffer.'; throw new Error('not isolated'); }
// A compiled Module is cloneable: compilation overlaps the download on the page, before it reaches the worker.
const [wasm, zbc, manifest, res] = await Promise.all([
  WebAssembly.compileStreaming(fetch(wasmUrl)),
  fetch(zbcUrl).then((r) => { if (!r.ok) throw new Error('cannot download program'); return r.arrayBuffer(); }),
  q.has('zbc') || q.has('wasm') ? null : fetch('boot.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
  fetch(q.get('res') || 'app.res').then(r => { if (r.ok) return r.arrayBuffer(); if (q.has('zbc') || q.has('wasm')) return null; throw new Error('cannot download baked fonts'); }),
]);
const sab = new SharedArrayBuffer(64), shared = new Int32Array(sab);
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
const off = canvas.transferControlToOffscreen();
// the buttons of zinc:gfx (Btn): Up Down Left Right A B X Y L R Start Select
const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, z: 4, Z: 4, ' ': 4, x: 5, X: 5, a: 6, A: 6, s: 7, S: 7, q: 8, w: 9, Enter: 10, Escape: 11 };
function bits(down, e) { const b = KEYS[e.key]; if (b === undefined) return; e.preventDefault(); Atomics.store(shared, 4, down ? (Atomics.load(shared, 4) | (1 << b)) : (Atomics.load(shared, 4) & ~(1 << b))); }
addEventListener('keydown', (e) => bits(true, e));
addEventListener('keyup', (e) => bits(false, e));
function pointer(e, down) { const r = canvas.getBoundingClientRect(); Atomics.store(shared, 1, Math.round((e.clientX - r.left) * canvas.width / r.width * 16)); Atomics.store(shared, 2, Math.round((e.clientY - r.top) * canvas.height / r.height * 16)); if (down !== undefined) Atomics.store(shared, 3, down ? 1 : 0); }
canvas.addEventListener('pointermove', (e) => pointer(e));
canvas.addEventListener('pointerdown', (e) => pointer(e, true));
addEventListener('pointerup', (e) => pointer(e, false));
let ticks = 0, done = false;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.nativeCall) { void serveNative(Z,natives,m.nativeCall,reply=>worker.postMessage(reply)); return; }
  if (m.error) { document.getElementById('splash')?.remove(); log.textContent += 'worker error: ' + m.error + '\n'; console.error('worker error: ' + m.error); }
  if (m.out) log.textContent += m.out;   // the program's stdout and stderr
  if (m.progress) window.__znAssetProgress = m.progress;
  if (m.frames) window.__znFrames = m.frames;
  if (m.started) { document.getElementById('splash')?.remove(); document.title = 'running'; requestAnimationFrame(tick); }   // ticks only count once the program runs
  if (m.png) { document.title = 'done'; const b64 = btoa(String.fromCharCode(...new Uint8Array(m.png))); const pre = document.createElement('pre'); pre.id = 'png'; pre.textContent = b64; document.body.appendChild(pre); }
  if (m.done) { done = true; log.textContent += 'exit ' + m.rc + ', ' + m.frames + ' frames'; }
};
worker.postMessage({ wasm, zbc, res, manifest, natives, base: new URL('.', location.href).href, canvas: off, sab }, [off]);
function tick() {
  if (done) return;
  ticks++; Atomics.add(shared, 0, 1); Atomics.notify(shared, 0);
  if (maxFrames && ticks >= maxFrames) { Atomics.store(shared, 5, 1); Atomics.add(shared, 0, 1); Atomics.notify(shared, 0); return; }
  requestAnimationFrame(tick);
}
