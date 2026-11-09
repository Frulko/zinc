// The dev bridge (docs/targets/web.md "The dev bridge"): `zinc dev --target web` runs this program on QuickJS with the plugins' real native
// sides, and the page calls those it has no browser backend for. The dev server writes the lines above (`mods`, PORT, PAGE: its own port) and
// starts it with the token of the page load in ZINC_BRIDGE_TOKEN.
// POST /call {m, k, a} answers {v} (a value), {p} (a promise, settled later as an event) or {e} (an error), with `ev`: the events (callbacks,
// settled promises) that came before it, which the page runs before the call returns, so they keep this side's order (a handle freed by an
// exit event and given again by the next call). GET /wait answers once there are events, GET /drain takes them. A function argument travels as
// {$cb: id}, a typed array as {$ta: type, b: base64} (in a plain object's fields too: a fetch's body).
// It listens on 127.0.0.1, answers the dev page's origin only, and every request carries the token of the page load it was started for; zinc
// dev only, never an export. zinc dev starts a new bridge for each page load, so what a page left (servers, sockets, children, callbacks) goes with it.
import { serveAsync, stop, Headers } from 'zinc:net';
import { env } from 'zinc:sys';
import { fetch } from 'zinc:web/fetch';
import { Blob } from 'zinc:web';

const TOKEN = env('ZINC_BRIDGE_TOKEN');
// the engine's host rows (__host_fsReadText...) for the page's zinc:fs and the rows it lacks (bytes come as a typed array, a row takes a u8[]);
// `__fs.load` reads a whole file at once
const plain = (a) => a.map((x) => (ArrayBuffer.isView(x) ? Array.from(x) : x));
// this side's own fetches (__fetch below, through zinc:net's fetch rows) end with events of its own: they never go to the page, where their
// handle numbers would reach the page's own fetches (rows-net.js) and end one of them with an empty body
const own = new Set(), pageRows = {};
for (const n of ['httpFetch', 'httpFetchBytes', 'httpFetchFile']) {
  const f = globalThis['__host_' + n];
  if (typeof f !== 'function') continue;
  pageRows[n] = f;
  globalThis['__host_' + n] = (...a) => { const h = f(...a); own.add(h); return h; };
}
mods.__rows = new Proxy({}, { get: (t, k) => { const f = pageRows[k] || globalThis['__host_' + String(k)]; return typeof f === 'function' ? (...a) => f(...plain(a)) : f; } });
mods.__fs = { load(p) { __host_fsLoad(p); return Uint8Array.from(__host_fsBytes()); } };
// the page's zinc:net servers: this side listens, each request goes to the page as an event (its id and the fields of zinc:net's request event) and the
// page's reply comes back by reply / replyFile / replyBytes
const pending = new Map();
let requests = 0;
function answer(id, status, lines, more) {
  const res = pending.get(id); if (!res) return;
  pending.delete(id);
  const headers = new Headers(); let contentType = '';
  for (const l of lines.split('\n')) { const c = l.indexOf(':'); if (c < 0) continue; const k = l.slice(0, c).trim(), v = l.slice(c + 1).trim(); if (k.toLowerCase() === 'content-type') contentType = v; else headers.set(k, v); }
  res({ status, contentType, headers, ...more });
}
// this side's event loop serves the page's modules: what they asked for through the rows (a fetch, an OSC listener, a signal) comes back as their event, with its
// payload; a request to a page's server (42) is __net's
__addEvHandler((h, kind, data) => {
  if (kind === 42) return;
  if ((kind === 40 || kind === 41 || kind === 47) && own.has(h)) { if (kind !== 47) own.delete(h); return; }   // a fetch of this side: done, failed, progress
  const pl = __host_evPayload(); push({ ev: [h, kind, data, typeof pl === 'string' ? pl : enc(Uint8Array.from(pl || []))] }); });
// the page's fetch to another origin: made here, as under zinc run (no CORS); the body comes back as bytes
mods.__fetch = {
  async fetch(url, method, headers, body, timeoutMs) {
    const r = await fetch(url, { method, headers, body: body === null ? undefined : Blob.fromBytes(Array.from(body), ''), timeoutMs });
    const h = []; r.headers.forEach((v, k) => { h.push([k, v]); });
    return { status: r.status, statusText: r.statusText, headers: h, body: Uint8Array.from(await r.bytes()) };
  },
};
const served = [];
mods.__net = {
  serve: (port, cb) => { const bound = serveAsync(port, (req) => new Promise((res) => {
    const id = ++requests; pending.set(id, res);
    let lines = ''; req.headers.forEach((v, k) => { lines += k + ': ' + v + '\n'; });
    cb(id, [req.method, req.path, req.remoteAddress, String(bound), lines, req.body].join('\u001e'), Array.from(req.rawBody || []));
  })); served.push(bound); return bound; },
  reply: (id, status, lines, body) => answer(id, status, lines, { body }),
  replyFile: (id, status, lines, file) => answer(id, status, lines, { body: '', file }),
  replyBytes: (id, status, lines, bytes) => answer(id, status, lines, { body: '', bytes: Array.from(bytes) }),
  stop: (port) => { for (const p of port ? [port] : served.splice(0)) stop(p); },   // never 0: that would stop this server too
};
// bytes travel as base64 (a 4 MB file: one request of 5.6 MB, made in milliseconds; as a JSON array of numbers it was 15 MB and 400 ms here alone)
const TA = { Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };
const enc1 = (v) => (ArrayBuffer.isView(v) && TA[v.constructor.name] ? { $ta: v.constructor.name, b: new Uint8Array(v.buffer, v.byteOffset, v.byteLength).toBase64() } : v);
const enc = (v) => (v && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc1(x)])) : enc1(v));
let queue = [], waiter = null, promises = 0;
const push = (e) => { queue.push(e); if (waiter) { const w = waiter; waiter = null; w(); } };
const bytes = (t, b) => { const u = Uint8Array.fromBase64(b); return t === 'Uint8Array' ? u : new TA[t](u.buffer); };
const dec = (v) => (v && typeof v === 'object' ? (typeof v.$cb === 'number' ? (...a) => push({ cb: v.$cb, a: a.map(enc) }) : v.$ta ? bytes(v.$ta, v.b) : v) : v);
// the dev page's origin, as the browser reached it: the only one answered (a page of another site, or another local server, gets 403)
const origins = new Set(['127.0.0.1', 'localhost', '[::1]'].map((h) => 'http://' + h + ':' + PAGE));
function reply(req, status, body) {
  const h = new Headers();
  const origin = req.headers.get('origin') || '';
  if (origins.has(origin)) h.set('Access-Control-Allow-Origin', origin);
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'x-zinc-token, content-type');
  h.set('Access-Control-Allow-Methods', 'GET, POST');
  h.set('Access-Control-Max-Age', '600');   // one preflight per 10 minutes, not one per call (Chrome's default keeps it 5 s)
  h.set('Cache-Control', 'no-store');
  return { status, body: JSON.stringify(body), contentType: 'application/json', headers: h };
}
// it listens on 127.0.0.1 only; a request whose Host is not this loopback port (a DNS rebinding page that names its own domain), or that comes
// from another origin than the dev page, is refused before anything else. A page whose token is not this bridge's is an older load of the page
// (another tab): it is told so, and never reaches what the newer page started here.
const hosts = new Set(['127.0.0.1', 'localhost', '[::1]'].map((h) => h + ':' + PORT));
async function handle(req) {
  if (!String(req.remoteAddress || '').startsWith('127.') || !hosts.has(String(req.headers.get('host') || '').toLowerCase())) return reply(req, 403, { e: 'not this machine' });
  const origin = req.headers.get('origin');
  if (origin && !origins.has(origin)) return reply(req, 403, { e: 'not the dev page' });
  if (req.method === 'OPTIONS') return reply(req, 204, '');
  if (req.headers.get('x-zinc-token') !== TOKEN) return reply(req, 403, { e: 'stale', why: 'a newer load of this page has the dev bridge: reload this page' });
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
}, { hostname: '127.0.0.1', maxBodyBytes: 64 << 20 });   // a page's write of a big file (48 MB, base64)
