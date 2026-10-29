import { Headers, Reply, Request, fetch, serve, serveAsync, stop } from 'zinc:net';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
// zinc:net Reply.file: a 3 MiB file sent in blocks, one byte range (206), a suffix range, a range past the end (416), a missing file
// (404), then the same file from an async handler, and on port 0 (the port the system picked, returned). Loopback, one process.
const dir = env('NET_FILE_DIR');
const path = dir + '/song.bin';
let text = '';
for (let i: i32 = 0; i < 300000; i++) text += String.fromCharCode(97 + i % 26) + '012345678';   // 3,000,000 bytes, 'a012345678b012...'
fs.writeText(path, text);
const handler = (req: Request): Reply => {
  if (req.path === '/song') return { status: 200, body: '', contentType: 'audio/mpeg', file: path };
  return { status: 200, body: '', contentType: 'audio/mpeg', file: dir + '/missing.bin' };
};
serve(18843, handler);
async function main(): Promise<void> {
  const base = 'http://127.0.0.1:18843';
  const all = await fetch(base + '/song');
  const body = await all.text();
  console.log('whole', all.status, body.length, body === text, all.headers.get('accept-ranges'), all.headers.get('content-length'), all.headers.get('content-type'));
  const part = await fetch(base + '/song', { headers: rangeOf('bytes=10-19') });
  console.log('range', part.status, JSON.stringify(await part.text()), part.headers.get('content-range'));
  const tail = await fetch(base + '/song', { headers: rangeOf('bytes=-4') });
  console.log('suffix', tail.status, JSON.stringify(await tail.text()), tail.headers.get('content-range'));
  const open = await fetch(base + '/song', { headers: rangeOf('bytes=2999998-') });
  console.log('open', open.status, JSON.stringify(await open.text()), open.headers.get('content-range'));
  const past = await fetch(base + '/song', { headers: rangeOf('bytes=3000000-') });
  console.log('past', past.status, past.headers.get('content-range'));
  const none = await fetch(base + '/nothing');
  console.log('missing', none.status);
  serveAsync(18843, async (req: Request): Promise<Reply> => ({ status: 200, body: '', contentType: 'audio/mpeg', file: path }));
  const later = await fetch(base + '/song', { headers: rangeOf('bytes=0-3') });
  console.log('async', later.status, JSON.stringify(await later.text()));
  const free = serveAsync(0, async (req: Request): Promise<Reply> => ({ status: 200, body: '', contentType: 'audio/mpeg', file: path }));
  const picked = await fetch(`http://127.0.0.1:${free}/song`, { headers: rangeOf('bytes=1-2') });
  console.log('port 0', free > 0 && free !== 18843, picked.status, JSON.stringify(await picked.text()));
  stop();
  fs.remove(path);
}
function rangeOf(r: string): Headers { const h = new Headers(); h.set('Range', r); return h; }
main();
