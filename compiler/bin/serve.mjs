#!/usr/bin/env node
// Static server for the wasm target: `zinc run --target wasm` serves app.html on http://localhost:8080
// Under `zinc dev` (ZINC_DEV=1) the page listens on /__reload (server-sent events) and reloads when the build changes.
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
const dir = process.argv[2] ?? '.';
const port = Number(process.env.PORT ?? 8080);
// this machine only (HOST=0.0.0.0 to try the page from a phone on the LAN): the build directory is not a website
const host = process.env.HOST ?? '127.0.0.1';
const root = path.resolve(dir) + path.sep;
const live = process.env.ZINC_DEV === '1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const clients = new Set();
const RELOAD = '<script>new EventSource("/__reload").onmessage = () => location.reload();</script>';
if (live) {  // zinc dev touches .zinc-reload after each successful build
  fs.watch(dir, (_e, f) => {
    if (f !== '.zinc-reload') return;
    for (const c of clients) c.write('data: reload\n\n');
    console.log(`zinc: reload pushed to ${clients.size} page(s)`);
  });
}
http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }  // "%E0" threw
  if (live && u === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const f = path.resolve(dir, '.' + (u === '/' ? '/app.html' : u));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (live && f.endsWith('.html')) res.end(fs.readFileSync(f, 'utf8').replace('</body>', RELOAD + '</body>'));
  else fs.createReadStream(f).pipe(res);
}).listen(port, host, () => console.log(`zinc: serving ${dir} on http://${host === '127.0.0.1' ? 'localhost' : host}:${port}${live ? ' (live reload)' : ''}`));
