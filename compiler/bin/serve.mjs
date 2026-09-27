#!/usr/bin/env node
// Static server for the wasm target: `zinc run --target wasm` serves app.html on http://localhost:8080
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
const dir = process.argv[2] ?? '.';
const port = Number(process.env.PORT ?? 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.resolve(dir, '.' + (u === '/' ? '/app.html' : u));
  if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`zinc: serving ${dir} on http://localhost:${port}`));
