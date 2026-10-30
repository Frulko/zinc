// The server of tools/bench-http on Node: the routes of zinc.ts. Arguments: port, file, [tls port, cert, key].
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
const [port, file, tport, cert, key] = process.argv.slice(2);
const handler = (req, res) => {
  if (req.url === '/json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Hello, World!' })); return; }
  if (req.url === '/file') { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size }); fs.createReadStream(file).pipe(res); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Hello, World!');
};
http.createServer(handler).listen(+port);
if (tport) https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler).listen(+tport);
console.log('ready');
