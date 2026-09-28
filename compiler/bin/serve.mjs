#!/usr/bin/env node
// Static server for the wasm target: `zinc run --target wasm` serves app.html on http://localhost:8080
// Under `zinc dev` (ZINC_DEV=1) the page listens on /__reload (server-sent events) and reloads when the build changes.
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
const dir = process.argv[2] ?? '.';
const port = Number(process.env.PORT ?? 8080);
const live = process.env.ZINC_DEV === '1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const clients = new Set();
const RELOAD = '<script>new EventSource("/__reload").onmessage = () => location.reload();</script>';
if (live) {
  let t;
  fs.watch(dir, (_e, f) => {
    if (!/^app\.(wasm|js)$/.test(f ?? '')) return;
    clearTimeout(t);
    t = setTimeout(() => { for (const c of clients) c.write('data: reload\n\n'); console.log(`zinc: reload pushed to ${clients.size} page(s)`); }, 100);
  });
}
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (live && u === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const f = path.resolve(dir, '.' + (u === '/' ? '/app.html' : u));
  if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (live && f.endsWith('.html')) res.end(fs.readFileSync(f, 'utf8').replace('</body>', RELOAD + '</body>'));
  else fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`zinc: serving ${dir} on http://localhost:${port}${live ? ' (live reload)' : ''}`));
