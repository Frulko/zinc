import { Reply, Request, fetch as netFetch, serve, stop } from 'zinc:net';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
// Response.bytes() (zinc:net) and arrayBuffer() (the global fetch) give the body byte for byte: a string joins two UTF-8 encoded surrogate
// halves and repairs invalid UTF-8, so a gzip, a .zapp or any binary file served by Reply.file lost bytes. The files come from the test
// (NET_FETCH_DIR): a surrogate pair, invalid UTF-8 with a NUL, a lone ED A0 80, and 2 MB of random bytes with a pair planted inside.
const dir = env('NET_FETCH_DIR');
serve(18853, (req: Request): Reply => ({ status: 200, body: '', contentType: 'application/octet-stream', file: dir + req.path }));
async function main(): Promise<void> {
  for (const name of ['pair', 'invalid', 'lone', 'big']) {
    const want = fs.readBytes(dir + '/' + name);
    const got = await (await netFetch('http://127.0.0.1:18853/' + name)).bytes();
    let same = got.length === want.length;
    for (let i: i32 = 0; same && i < want.length; i++) if (got[i] !== want[i]) same = false;
    const again = (await (await fetch('http://127.0.0.1:18853/' + name)).arrayBuffer()).length;
    console.log(name, want.length, got.length, again, same);
  }
  stop();
}
main();
