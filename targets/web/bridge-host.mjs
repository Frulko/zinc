// The dev bridge (docs/targets/web.md "The dev bridge"): `zinc dev --target web` runs this program on QuickJS with the plugins' real native
// sides, and the page calls those it has no browser backend for. The dev server writes the lines above (`mods`, PORT, TOKEN) and starts it.
// POST /call {m, k, a} answers {v} (a value), {p} (a promise, settled later as an event) or {e} (an error), with `ev`: the events (callbacks,
// settled promises) that came before it, which the page runs before the call returns, so they keep this side's order (a handle freed by an
// exit event and given again by the next call). GET /wait answers once there are events, GET /drain takes them. A function argument travels as
// {$cb: id}, a typed array as {$ta: type, d: [...]}.
// Loopback only, every request carries the token the page got from the dev server; zinc dev only, never an export.
import { serveAsync, Headers } from 'zinc:net';

// the engine's host rows (__host_fsReadText...) for the page's zinc:fs and the rows it lacks; `__fs.load` reads a whole file at once (the rows read it byte by byte)
mods.__rows = new Proxy({}, { get: (t, k) => globalThis['__host_' + String(k)] });
mods.__fs = { load(p) { const n = __host_fsLoad(p), b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = __host_fsByte(i); return b; } };
const TA = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };
const enc = (v) => (ArrayBuffer.isView(v) ? { $ta: v.constructor.name, d: Array.from(v) } : v);
let queue = [], waiter = null, promises = 0;
const push = (e) => { queue.push(e); if (waiter) { const w = waiter; waiter = null; w(); } };
const dec = (v) => (v && typeof v === 'object' ? (typeof v.$cb === 'number' ? (...a) => push({ cb: v.$cb, a: a.map(enc) }) : v.$ta ? new TA[v.$ta](v.d) : v) : v);
const loopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
function reply(req, status, body) {
  const h = new Headers();
  const origin = req.headers.get('origin') || '';
  if (loopback.test(origin)) h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Headers', 'x-zinc-token, content-type');
  h.set('Access-Control-Allow-Methods', 'GET, POST');
  h.set('Cache-Control', 'no-store');
  return { status, body: JSON.stringify(body), contentType: 'application/json', headers: h };
}
async function handle(req) {
  if (req.method === 'OPTIONS') return reply(req, 204, '');
  if (req.headers.get('x-zinc-token') !== TOKEN) return reply(req, 403, { e: 'bad token' });
  if (req.path === '/wait') {
    if (!queue.length) await new Promise((res) => { if (waiter) waiter(); waiter = res; setTimeout(res, 8000); });   // a newer page takes the place of the older one; under the 10 s after which zinc:net answers 408 by itself
    return reply(req, 200, {});
  }
  if (req.path === '/drain') return reply(req, 200, { ev: queue.splice(0) });
  if (req.path !== '/call') return reply(req, 404, { e: 'no such path' });
  try {
    const { m, k, a } = JSON.parse(req.body), mod = mods[m];
    if (!mod) return reply(req, 200, { e: 'the dev bridge has no native side ' + m, ev: queue.splice(0) });
    if (typeof mod[k] !== 'function') return reply(req, 200, { e: m + ' has no function ' + k, ev: queue.splice(0) });
    const r = mod[k](...a.map(dec));
    if (!(r instanceof Promise)) return reply(req, 200, { v: enc(r), ev: queue.splice(0) });
    const p = ++promises;
    r.then((v) => push({ p, v: enc(v) }), (e) => push({ p, e: String((e && e.message) || e) }));
    return reply(req, 200, { p, ev: queue.splice(0) });
  } catch (e) {
    return reply(req, 200, { e: String((e && e.message) || e), ev: queue.splice(0) });
  }
}
serveAsync(PORT, async (req) => {
  try { return await handle(req); } catch (e) { console.error('zinc dev bridge:', (e && e.stack) || e); return reply(req, 500, { e: String(e) }); }
});
