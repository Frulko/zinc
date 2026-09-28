// zinc:net for sim: Node fetch and http, in the shapes of runtime/mod/net.{h,cpp}
import * as http from 'node:http';
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export class Headers {
  constructor() { this.names = []; this.vals = []; }
  append(name, value) { this.names.push(name.toLowerCase()); this.vals.push(String(value).trim()); }
  set(name, value) { this.delete(name); this.append(name, value); }
  delete(name) { const n = name.toLowerCase(); for (let i = this.names.length - 1; i >= 0; i--) if (this.names[i] === n) { this.names.splice(i, 1); this.vals.splice(i, 1); } }
  has(name) { return this.names.includes(name.toLowerCase()); }
  get(name) { const n = name.toLowerCase(); return this.vals.filter((_, i) => this.names[i] === n).join(', '); }
  keys() { return [...new Set(this.names)].sort(byName); }
  forEach(f) { for (const k of this.keys()) f(this.get(k), k); }
}
export async function fetch(url, init) {
  let r;
  try {
    const opts = { headers: { 'user-agent': 'zinc/0.1' } };
    if (init?.method) opts.method = init.method;
    if (init?.body) opts.body = init.body;
    if (init?.contentType) opts.headers['content-type'] = init.contentType;
    if (init?.headers) init.headers.names.forEach((n, i) => { opts.headers[n] = opts.headers[n] && n !== 'user-agent' ? opts.headers[n] + ', ' + init.headers.vals[i] : init.headers.vals[i]; });
    if (init?.timeoutMs > 0) opts.signal = AbortSignal.timeout(init.timeoutMs);
    r = await globalThis.fetch(url, opts);
  } catch (e) { throw new TypeError('fetch failed: ' + (e.name === 'TimeoutError' ? 'timeout' : e.cause?.code ?? e.message)); }
  const buf = Buffer.from(await r.arrayBuffer());
  const body = buf.toString('utf8');
  const headers = new Headers();
  for (const [k, v] of r.headers) if (k !== 'set-cookie') headers.append(k, v);
  for (const c of r.headers.getSetCookie()) headers.append('set-cookie', c);
  return {
    status: r.status, ok: r.ok, statusText: r.statusText, url: r.url, headers,
    text: async () => body,
    bytes: async () => Array.from(buf),
    json: async () => $z.jsonParse(body),
  };
}
let server = null;
export function serve(port, handler) {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
      let r;
      try { r = handler({ method: req.method, path: req.url, body, headers }); } catch { r = { status: 500, body: 'internal error', contentType: '' }; }
      const out = { 'Content-Type': r.contentType || 'text/plain; charset=utf-8', Connection: 'close' };
      const extra = [];
      if (r.headers) r.headers.names.forEach((n, i) => extra.push(n, r.headers.vals[i]));
      res.writeHead(r.status, [...Object.entries(out).flat(), ...extra]);
      res.end(r.body);
    });
  });
  server.listen(port);
}
export const stop = () => { server?.close(); server = null; };
