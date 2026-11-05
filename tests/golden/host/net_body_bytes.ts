import { fetch, serve, Request, Reply, Headers } from 'zinc:net';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
// zinc:net fetch with RequestInit.bodyBytes: the bytes go out as they are (bytes 0x80 and above were UTF-8 decoded into U+FFFD).
// bodyFile: a file read by the engine, framed by bodyPrefix and bodySuffix, its upload reported to onProgress.
// NET_BYTES_SERVE=1: the server, which writes each body it gets to NET_BYTES_DIR/body.bin; else the client, which posts eight bytes.
const dir = env('NET_BYTES_DIR');
if (env('NET_BYTES_SERVE') === '1') {
  serve(18844, (req: Request): Reply => {
    if (req.path === '/down') return { status: 200, body: '', contentType: 'application/octet-stream', file: dir + '/big.bin' };
    fs.writeText(dir + '/body.bin', req.rawBody as string);
    return { status: 200, body: 'ok', contentType: 'text/plain' };
  });
} else {
  post();
}
async function post(): Promise<void> {
  const bytes: u8[] = [82, 0, 0, 255, 128, 7, 0, 200];
  const r = await fetch('http://127.0.0.1:18844/up', { method: 'POST', bodyBytes: bytes, contentType: 'application/octet-stream' });
  const first = `${r.status} ${fs.readBytes(dir + '/body.bin').join(',')}`;
  // RequestInit.bodyFile: the engine reads the file and sends it between bodyPrefix and bodySuffix, reporting the upload (onProgress)
  const big: u8[] = [];
  for (let i = 0; i < 300000; i++) big.push((i % 251) as u8);
  fs.writeBytes(dir + '/big.bin', big);
  let steps = 0, last = 0, all = 0;
  const f = await fetch('http://127.0.0.1:18844/file', { method: 'POST', bodyFile: dir + '/big.bin', bodyPrefix: 'A[', bodySuffix: ']Z', contentType: 'application/octet-stream',
    onProgress: (sent: number, total: number): void => { steps++; last = sent; all = total; } });
  const got = fs.readBytes(dir + '/body.bin');
  const same = got.length === 300004 && got[0] === 65 && got[2] === 0 && got[2 + 251] === 0 && got[300003] === 90;
  // RequestInit.saveTo: a Range adds to the file, past maxBytes; a whole answer replaces it; a wrong status keeps its body and leaves the file
  const saved = dir + '/saved.bin', range = new Headers();
  if (fs.exists(saved)) fs.remove(saved);
  range.set('range', 'bytes=0-99');
  const a = await fetch('http://127.0.0.1:18844/down', { headers: range, saveTo: saved });
  const after = new Headers();
  after.set('range', 'bytes=100-299999');
  const b = await fetch('http://127.0.0.1:18844/down', { headers: after, saveTo: saved, maxBytes: 10 });
  const inMemory = (await b.bytes()).length;
  const parts = fs.readBytes(saved);
  let whole = a.status === 206 && b.status === 206 && inMemory === 0 && parts.length === 300000;
  for (let i = 0; i < parts.length && whole; i++) whole = parts[i] === i % 251;
  const c = await fetch('http://127.0.0.1:18844/down', { saveTo: saved });
  whole = whole && c.status === 200 && fs.stat(saved).size === 300000;
  const wrong = new Headers();
  wrong.set('range', 'bytes=900000-');
  const d = await fetch('http://127.0.0.1:18844/down', { headers: wrong, saveTo: dir + '/no.bin' });
  whole = whole && d.status === 416 && !fs.exists(dir + '/no.bin');
  console.log(first, f.status, same, steps > 1 && last === all, whole);
}
