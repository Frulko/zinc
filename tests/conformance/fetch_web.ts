// zinc-test: requires net
// The Fetch Standard globals (lib/std/fetch.ts): Headers, Request, Response, and fetch() against a local zinc:net
// server (loopback only), data: URLs, and aborting. No import: they are Web globals.
import { serve, stop, Request as NetRequest, Reply } from 'zinc:net';

// ---- Headers
const h = new Headers([['Content-Type', 'text/plain'], ['X-B', ' 1 '], ['x-b', '2'], ['Set-Cookie', 'a=1'], ['set-cookie', 'b=2']]);
console.log(h.get('content-type'), h.get('X-B'), h.get('missing') === null, h.has('X-b'), h.getSetCookie());
console.log(h.entries());
h.set('x-b', '3');
h.delete('Content-Type');
h.append('Accept', 'a');
h.forEach((v: string, k: string) => { console.log(' ', k, v); });
for (const bad of ['bad name', 'é', '']) { try { h.append(bad, 'v'); } catch (e) { console.log('name', JSON.stringify(bad), e.name); } }
try { h.set('ok', 'a\nb'); } catch (e) { console.log('value', e.name); }
console.log(new Headers(h).keys());

// ---- Request / Response
const r = new Request('https://example.com/a?b#c', { method: 'post', body: 'hi', headers: [['X-T', '1']] });
console.log(r.method, r.url, r.headers.get('content-type'), r.headers.get('x-t'), r.bodyUsed, r.redirect, r.signal.aborted);
const r2 = new Request(r, { method: 'Patch' });
console.log(r2.method, r2.url);
for (const f of [
  (): Request => new Request('nope'),
  (): Request => new Request('https://u:p@h/'),
  (): Request => new Request('https://h/', { method: 'GET', body: 'x' }),
  (): Request => new Request('https://h/', { method: 'TRACE' }),
  (): Request => new Request('https://h/', { method: 'bad method' }),
]) { try { f(); console.log('built'); } catch (e) { console.log('Request', e.name); } }
async function bodies(): Promise<void> {
  console.log(r.bodyUsed, r2.bodyUsed);
  const t1 = await r2.clone().text();
  const t2 = await r2.text();
  console.log(t1, t2, r2.bodyUsed);
  try { await r2.text(); } catch (e) { console.log('twice', e.name); }
  const res = new Response('{"a":[1,2]}', { status: 201, statusText: 'Made', headers: [['X-R', 'y']] });
  console.log(res.status, res.ok, res.statusText, res.headers.get('content-type'), res.type, res.url === '', res.redirected);
  const c = res.clone();
  const j = await res.json();
  console.log(JSON.stringify(j), await c.text());
  const u = new Response(new URLSearchParams([['a', 'b c']]));
  console.log(u.headers.get('content-type'), await u.text());
  const bl = await new Response(new Blob(['xyz'], { type: 'text/x' })).blob();
  console.log(bl.size, bl.type);
  const fd = await new Response('a=1&b=%20', { headers: [['content-type', 'application/x-www-form-urlencoded']] }).formData();
  console.log(fd.keys());
  const js = Response.json({ ok: true });
  console.log(js.headers.get('content-type'), await js.text());
  const e = Response.error();
  console.log(e.status, e.type, e.ok);
  const rd = Response.redirect('https://example.com/x', 301);
  console.log(rd.status, rd.headers.get('location'));
  for (const f of [(): Response => new Response('', { status: 99 }), (): Response => new Response('x', { status: 204 }), (): Response => Response.redirect('https://h/', 200)]) {
    try { f(); console.log('built'); } catch (err) { console.log('Response', err.name); }
  }
  const empty = new Response();
  console.log(empty.status, JSON.stringify(await empty.text()));
  try { await new Response('{bad').json(); } catch (err) { console.log('json', err.name); }
}

// ---- fetch against a local server
const PORT = 9751;
serve(PORT, (req: NetRequest): Reply => {
  if (req.path === '/echo') return { status: 200, contentType: 'application/json', body: JSON.stringify({ method: req.method, ct: req.headers.get('content-type'), token: req.headers.get('x-token'), body: req.body }) };
  if (req.path === '/slow') return { status: 200, contentType: 'text/plain', body: 'slow' };
  return { status: 404, contentType: 'text/plain', body: 'nope' };
});
async function net(): Promise<void> {
  const base = `http://127.0.0.1:${PORT}`;
  const form = new URLSearchParams([['q', 'z']]);
  const res = await fetch(base + '/echo', { method: 'POST', headers: [['X-Token', 't1']], body: form });
  console.log(res.status, res.ok, res.statusText, res.type, res.url === base + '/echo', res.redirected, res.headers.get('content-type'));
  const j = await res.json();
  console.log(JSON.stringify(j));
  const fd = new FormData();
  fd.append('f', 'v');
  const mp = await fetch(new Request(base + '/echo', { method: 'PUT', body: fd }));
  const mj = await mp.text();
  console.log(mj.includes('multipart/form-data; boundary=----formdata-zinc-'), mj.includes('name=\\"f\\"'));
  const nf = await fetch(new URL('/missing', base));
  console.log(nf.status, nf.ok, await nf.text());
  const d = await fetch('data:text/plain;charset=utf-8,h%C3%A9llo%20world');
  console.log(d.status, d.headers.get('content-type'), await d.text());
  const d64 = await fetch('data:;base64,aGk=');
  console.log(d64.headers.get('content-type'), await d64.text());
  const ac = new AbortController();
  ac.abort();
  try { await fetch(base + '/slow', { signal: ac.signal }); } catch (err) { console.log('aborted', err.name); }
  try { await fetch('ftp://h/x'); } catch (err) { console.log('scheme', err.name); }
  try { await fetch('not a url'); } catch (err) { console.log('url', err.name); }
  stop();
  try { await fetch(base + '/echo'); } catch (err) { console.log('down', err.name, err.message); }
}
async function main(): Promise<void> {
  await bodies();
  await net();
}
main();
