// zinc:net for sim: Node fetch and http
import * as http from 'node:http';
export async function fetch(url, init) {
  let r;
  try {
    const opts = {};
    if (init?.method) opts.method = init.method;
    if (init?.body) opts.body = init.body;
    if (init?.contentType) opts.headers = { 'Content-Type': init.contentType };
    r = await globalThis.fetch(url, opts);
  } catch (e) { throw new TypeError('fetch failed: ' + (e.cause?.code ?? e.message)); }
  const body = await r.text();
  return { status: r.status, ok: r.ok, text: async () => body };
}
let server = null;
export function serve(port, handler) {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let r;
      try { r = handler({ method: req.method, path: req.url, body }); } catch { r = { status: 500, body: 'internal error', contentType: '' }; }
      res.writeHead(r.status, { 'Content-Type': r.contentType || 'text/plain; charset=utf-8', Connection: 'close' });
      res.end(r.body);
    });
  });
  server.listen(port);
}
export const stop = () => { server?.close(); server = null; };
