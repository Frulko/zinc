// The server of tools/bench-http on Bun: the routes of zinc.ts, and the WebSocket echo. Arguments: port, file, [tls port, cert, key].
const [port, file, tport, cert, key] = process.argv.slice(2);
const fetch = (req: Request, server: any): Response | undefined => {
  if (req.headers.get('upgrade') === 'websocket' && server.upgrade(req)) return undefined;
  const path = new URL(req.url).pathname;
  if (path === '/json') return Response.json({ message: 'Hello, World!' });
  if (path === '/file') return new Response(Bun.file(file), { headers: { 'Content-Type': 'application/octet-stream' } });
  return new Response('Hello, World!', { headers: { 'Content-Type': 'text/plain' } });
};
const websocket = { message(ws: any, m: string | Buffer) { ws.send(m); } };
Bun.serve({ port: +port, fetch, websocket });
if (tport) Bun.serve({ port: +tport, fetch, websocket, tls: { cert: Bun.file(cert), key: Bun.file(key) } });
console.log('ready');
