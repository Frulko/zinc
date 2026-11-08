import { serve, stop } from 'zinc:net';
import * as sys from 'zinc:sys';
// A plain JavaScript program on QuickJS has the globals URL and WebSocket (ZN-1008): URL resolves a relative path against a base, the
// browser's WebSocket (zinc:web/websocket) talks to a zinc:net server of the same program: a text echo, then a binary one as an ArrayBuffer.
// tests/t0/qjs_bytes.sh runs it with the port as its argument.
const port = parseInt(sys.args()[0]);
console.log(new URL('./w.js', 'file:///app/src/main.js').href, new URL('../x?q=1#h', 'https://e.com/a/b/c').href);
serve(port, () => ({ status: 200, body: 'http', contentType: 'text/plain' }), {
  webSocket: {
    open: () => {},
    message: (ws, data, bytes) => { if (bytes !== null) ws.sendBytes(bytes); else ws.send('echo ' + data); },
    close: () => {},
  },
});
const ws = new WebSocket('ws://127.0.0.1:' + port + '/');
ws.binaryType = 'arraybuffer';
const guard = setTimeout(() => { console.log('timeout'); sys.exit(1); }, 20000);
ws.addEventListener('open', () => { console.log('open', ws.readyState === WebSocket.OPEN); ws.send('hi'); });
let n = 0;
ws.onmessage = (e) => {
  if (typeof e.data === 'string') { console.log(e.data); ws.send(new Uint8Array([0, 128, 255]).buffer); return; }
  console.log('binary', e.data instanceof ArrayBuffer, Array.from(new Uint8Array(e.data)).join(','));
  if (++n === 1) { clearTimeout(guard); ws.close(); stop(); }
};
ws.onclose = (e) => console.log('close', e.code);
