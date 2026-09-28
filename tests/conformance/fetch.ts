// zinc-test: gradual
// zinc-test: requires net process
// zinc:net fetch against a local server: request and response headers, status text, bytes, JSON (Dyn), final URL,
// connection refused and a timeout (a zinc:socket server that never answers).
import { serve, stop, fetch, Headers, Request, Reply } from 'zinc:net';
import { listen, Socket } from 'zinc:socket';

const PORT = 9741;
serve(PORT, (req: Request): Reply => {
  const h = new Headers();
  h.set('X-Custom', 'yes');
  h.append('Set-Cookie', 'a=1');
  h.append('Set-Cookie', 'b=2');
  if (req.path === '/json') return { status: 200, contentType: 'application/json', body: '{"name":"zinc","n":[1,2,3],"ok":true}', headers: h };
  if (req.path === '/echo') return { status: 201, contentType: 'text/plain', body: `${req.method} ${req.headers.get('x-token')} ${req.headers.has('X-TOKEN')} ${req.body}` };
  if (req.path === '/bin') return { status: 200, contentType: 'application/octet-stream', body: 'AB€' };
  return { status: 404, contentType: 'text/plain', body: 'nothing here' };
});

async function main(): Promise<void> {
  const base = `http://127.0.0.1:${PORT}`;
  const r = await fetch(base + '/json');
  console.log(r.status, r.ok, r.statusText, r.url === base + '/json', r.headers.get('content-type'), r.headers.get('x-custom'), r.headers.get('set-cookie'));
  console.log(r.headers.has('X-Custom'), r.headers.keys().includes('x-custom'));
  const j = await r.json();
  console.log(j.name, j.n[1], j.ok);

  const h = new Headers();
  h.set('X-Token', 'secret');
  h.set('x-token', 'replaced');
  h.append('Accept', 'text/plain');
  console.log(h.get('X-TOKEN'), h.keys());
  h.forEach((value: string, name: string) => { console.log('  header', name, value); });
  h.delete('accept');
  console.log(h.has('Accept'));
  const e = await fetch(base + '/echo', { method: 'PUT', body: 'payload', headers: h });
  console.log(e.status, e.statusText, await e.text());

  const b = await fetch(base + '/bin');
  console.log(await b.bytes());
  const nf = await fetch(base + '/missing');
  console.log(nf.status, nf.ok, nf.statusText, await nf.text());
  const bad = await fetch(base + '/bin');
  try { await bad.json(); } catch (err) { console.log('json error', err.name); }
  stop();

  const silent = await listen(0, (s: Socket) => { s.onData((d: string) => {}); }, '127.0.0.1');
  const port = silent.port;
  try { await fetch(`http://127.0.0.1:${port}/`, { timeoutMs: 300 }); } catch (err) { console.log(err.message); }
  silent.close();
  try { await fetch(`http://127.0.0.1:${port}/`); } catch (err) { console.log(err.message); }
}
main();
