// The server of tools/bench-http on Bun: the routes of zinc.ts. Arguments: port, file, [tls port, cert, key].
const [port, file, tport, cert, key] = process.argv.slice(2);
const fetch = (req: Request): Response => {
  const path = new URL(req.url).pathname;
  if (path === '/json') return Response.json({ message: 'Hello, World!' });
  if (path === '/file') return new Response(Bun.file(file), { headers: { 'Content-Type': 'application/octet-stream' } });
  return new Response('Hello, World!', { headers: { 'Content-Type': 'text/plain' } });
};
Bun.serve({ port: +port, fetch });
if (tport) Bun.serve({ port: +tport, fetch, tls: { cert: Bun.file(cert), key: Bun.file(key) } });
console.log('ready');
