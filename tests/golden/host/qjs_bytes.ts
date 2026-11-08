import { serve, stop, Reply, Request, ServerWebSocket } from 'zinc:net';
import { WebSocket } from 'zinc:socket';
import { rtpHeader, seal } from 'zinc:discord-voice';
import * as sys from 'zinc:sys';
// A module's u8[] is the program's array on every engine (ZN-1008): an RTP header from zinc:discord-voice maps to hex strings, concatenates,
// pushes and prints as JSON; a big one (over 64 Ki elements, a typed array on QuickJS) still maps and concatenates. Then a WebSocket client of
// zinc:socket receives a 60 KB and a 6 MB message from a zinc:net server in the same program (its chunks are module results it pushes onto).
// tests/t0/qjs_bytes.sh runs it on the interpreter, QuickJS and AOT with the port as its argument.
const port = parseInt(sys.args()[0]) as i32;
const h = rtpHeader(0x1234, 0x01020304, 0xdeadbeef);
console.log(h.map((x: u8) => (x < 16 ? '0' : '') + x.toString(16)).join(''));
const more = h.concat([1, 2]);
more.push(3);
console.log(more.length, JSON.stringify(h.slice(0, 4)));
const key: u8[] = [];
for (let i = 0; i < 32; i++) key.push(i);
const payload: u8[] = [];
for (let i = 0; i < 70000; i++) payload.push(i & 255);
const big = seal('aead_aes256_gcm_rtpsize', key, h, 7, payload);
console.log(big.length, big.map((x: u8) => x > 127).length, big.concat([9]).length);
const sizes: i32[] = [60000, 6 << 20];
serve(port, (req: Request): Reply => ({ status: 200, body: 'http', contentType: 'text/plain' }), {
  maxPayloadBytes: 8 << 20,
  webSocket: {
    open: (ws: ServerWebSocket) => { for (const n of sizes) ws.send('x'.repeat(n)); },
    message: (ws: ServerWebSocket, data: string, bytes: u8[] | null) => {},
    close: (ws: ServerWebSocket, code: i32, reason: string) => {},
  },
});
const ws = new WebSocket('ws://127.0.0.1:' + port + '/');
let got = 0;
const guard = setTimeout(() => { console.log('timeout, got', got); sys.exit(1); }, 20000);
ws.onmessage = (e) => {
  console.log('message', e.data.length);
  if (++got === sizes.length) { clearTimeout(guard); ws.close(); stop(); }
};
ws.onerror = (e) => { console.log('error', e.message); clearTimeout(guard); stop(); };
