import { fetch, serve, stop, Reply, Request } from 'zinc:net';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
// zinc:net bodies that do not fit in memory (ZN-1028): a 6 MiB RequestInit.bodyFile read from disk as the socket takes it, between its prefix
// and suffix; the same upload to a server whose maxBodyBytes it passes (413, with the limit named in the body); an 8 MiB Reply.file sent
// by sendfile(2) on macOS and Linux, the socket full many times on the way. Loopback, one process, on free ports.
const dir = env('NET_STREAM_DIR');
const path = dir + '/up.bin';
let block = '';
for (let i: i32 = 0; i < 4096; i++) block += String.fromCharCode(33 + (i * 7 + (i >> 5)) % 94) + 'abcdefghijklmno';   // 64 KiB, no period of 16
let text = '';
for (let i: i32 = 0; i < 128; i++) text += String.fromCharCode(65 + i % 26) + block.substring(1);   // 8 MiB, each block marked
fs.writeText(path, text.substring(0, 6 << 20));
fs.writeText(dir + '/down.bin', text);
const big = serve(0, (req: Request): Reply => {
  if (req.path === '/file') return { status: 200, body: '', contentType: 'application/octet-stream', file: dir + '/down.bin' };
  const same = req.body === '[' + text.substring(0, 6 << 20) + ']';
  return { status: 200, body: req.body.length + ' ' + (same ? 'same' : 'different'), contentType: 'text/plain' };
});
const small = serve(0, (req: Request): Reply => ({ status: 200, body: 'taken', contentType: 'text/plain' }), { maxBodyBytes: 1000 });
async function main(): Promise<void> {
  let steps = 0, last = 0, all = 0;
  const up = await fetch(`http://127.0.0.1:${big}/up`, { method: 'POST', bodyFile: path, bodyPrefix: '[', bodySuffix: ']', contentType: 'application/octet-stream',
    onProgress: (sent: number, total: number): void => { steps++; last = sent; all = total; } });
  console.log('upload', up.status, await up.text(), steps > 2, last === all);
  const refused = await fetch(`http://127.0.0.1:${small}/up`, { method: 'POST', bodyFile: path, contentType: 'application/octet-stream' });
  console.log('over the limit', refused.status, (await refused.text()).trim());
  const down = await fetch(`http://127.0.0.1:${big}/file`, { maxBytes: 16 << 20 });
  const got = await down.text();
  console.log('file', down.status, got.length, got === text, down.headers.get('content-length'));
  stop();
  fs.remove(path);
  fs.remove(dir + '/down.bin');
}
main();
