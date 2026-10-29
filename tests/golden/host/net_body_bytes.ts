import { fetch, serve, Request, Reply } from 'zinc:net';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
// zinc:net fetch with RequestInit.bodyBytes: the bytes go out as they are (bytes 0x80 and above were UTF-8 decoded into U+FFFD).
// NET_BYTES_SERVE=1: the server, which writes each body it gets to NET_BYTES_DIR/body.bin; else the client, which posts eight bytes.
const dir = env('NET_BYTES_DIR');
if (env('NET_BYTES_SERVE') === '1') {
  serve(18844, (req: Request): Reply => {
    fs.writeText(dir + '/body.bin', req.rawBody as string);
    return { status: 200, body: 'ok', contentType: 'text/plain' };
  });
} else {
  post();
}
async function post(): Promise<void> {
  const bytes: u8[] = [82, 0, 0, 255, 128, 7, 0, 200];
  const r = await fetch('http://127.0.0.1:18844/up', { method: 'POST', bodyBytes: bytes, contentType: 'application/octet-stream' });
  console.log(r.status, fs.readBytes(dir + '/body.bin').join(','));
}
