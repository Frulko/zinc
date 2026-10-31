// The server of tools/bench-http on Node: the routes of zinc.ts, and the WebSocket echo with the `ws` package (WS_MODULE: its path). Arguments: port, file, [tls port, cert, key].
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const [port, file, tport, cert, key] = process.argv.slice(2);
const handler = (req, res) => {
  if (req.url === '/json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Hello, World!' })); return; }
  if (req.url === '/file') { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size }); fs.createReadStream(file).pipe(res); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Hello, World!');
};
const { WebSocketServer } = createRequire(import.meta.url)(process.env.WS_MODULE || 'ws');
const echo = (server) => new WebSocketServer({ server }).on('connection', (ws) => ws.on('message', (m, binary) => ws.send(m, { binary })));
echo(http.createServer(handler).listen(+port));
if (tport) echo(https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler).listen(+tport));
console.log('ready');
