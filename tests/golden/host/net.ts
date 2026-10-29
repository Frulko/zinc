import { Headers, Reply, Request, fetch, serve, stop } from 'zinc:net';
// zinc:net on loopback in one process (no curl, no python): the server and the client share the event loop
const big = 'x'.repeat(1 << 20);
const handler = (req: Request): Reply => {
  if (req.path === '/a.txt') return { status: 200, body: 'hello net\n', contentType: 'text/plain' };
  if (req.path === '/echo') {
    const h = new Headers();
    h.set('X-Seen', req.headers.get('x-test') + '|' + req.method + '|' + (req.remoteAddress as string));
    return { status: 201, body: req.body, contentType: req.headers.get('content-type'), headers: h };
  }
  if (req.path === '/big') return { status: 200, body: big, contentType: 'application/octet-stream' };
  if (req.path === '/chunked') {
    const h = new Headers();
    h.set('Transfer-Encoding', 'chunked');
    return { status: 200, body: big + 'end', contentType: 'text/plain', headers: h };
  }
  if (req.path === '/old') {
    const h = new Headers();
    h.set('Location', '/a.txt');
    return { status: 302, body: '', contentType: 'text/plain', headers: h };
  }
  if (req.path === '/same' || req.path === '/cross') {
    const h = new Headers();
    h.set('Location', req.path === '/same' ? '/auth' : 'http://localhost:18841/auth');
    return { status: 302, body: '', contentType: 'text/plain', headers: h };
  }
  if (req.path === '/auth') return { status: 200, body: `auth=${req.headers.get('authorization')} cookie=${req.headers.get('cookie')} x=${req.headers.get('x-test')}`, contentType: 'text/plain' };
  if (req.path === '/json') return { status: 200, body: '{"a":[1,2]}', contentType: 'application/json' };
  if (req.path === '/boom') throw new Error('handler failed');
  return { status: 404, body: 'no', contentType: 'text/plain' };
};
serve(18841, handler);
async function main(): Promise<void> {
  const base = 'http://127.0.0.1:18841';
  const r = await fetch(base + '/a.txt');
  console.log(r.ok, r.status, r.statusText, JSON.stringify(await r.text()), r.headers.get('content-type'), r.headers.get('content-length'));
  const missing = await fetch(base + '/nope.txt');
  console.log(missing.ok, missing.status);
  const h = new Headers();
  h.set('X-Test', 'yes');
  const e = await fetch(base + '/echo', { method: 'POST', body: 'ping', contentType: 'text/x-ping', headers: h });
  console.log(e.status, await e.text(), e.headers.get('x-seen'), e.headers.get('content-type'));
  const eb = await fetch(base + '/echo', { method: 'PUT', bodyBytes: [104, 105], contentType: 'text/plain' });
  console.log(JSON.stringify(await eb.bytes()));
  const b = await fetch(base + '/big');
  console.log('big', (await b.text()).length);
  const c = await fetch(base + '/chunked');
  const ct = await c.text();
  console.log('chunked', ct.length, ct.slice(ct.length - 3), c.headers.get('transfer-encoding'));
  const red = await fetch(base + '/old');
  console.log('redirect', red.status, red.url, JSON.stringify(await red.text()));
  // credentials follow a redirect on the same origin only
  const cred = new Headers();
  cred.set('Authorization', 'Bearer t'); cred.set('Cookie', 'c=1'); cred.set('X-Test', 'kept');
  console.log('same', await (await fetch(base + '/same', { headers: cred })).text());
  console.log('cross', await (await fetch(base + '/cross', { headers: cred })).text());
  console.log(JSON.stringify(await (await fetch(base + '/json')).json()));
  const boom = await fetch(base + '/boom');
  console.log(boom.status, await boom.text());
  try { await fetch(base + '/big', { maxBytes: 1000 }); } catch (err) { console.log((err as Error).message); }
  try { await fetch('http://127.0.0.1:1/'); } catch (err) { console.log((err as Error).message); }
  try { await fetch('http://no-such-host.invalid/'); } catch (err) { console.log((err as Error).message); }
  const hh = new Headers();
  hh.append('A', '1'); hh.append('a', '2'); hh.set('b', '3'); hh.delete('B');
  hh.forEach((v, k) => { console.log(k, v); });
  stop();
}
main();
