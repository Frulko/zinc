import { serve, stop, Reply, Request, ServerWebSocket } from 'zinc:net';
import * as sys from 'zinc:sys';
// The WebSocket server of zinc:net (ZN-893), driven by tests/t0/net_ws.py: echo, binary, limits, the close handshake, an idle ping and
// back-pressure. It prints what its handlers see (compared with tests/golden/host/net_ws.server.out); GET /quit stops it.
const port = parseInt(sys.args()[0]) as i32;
let flooding: ServerWebSocket | null = null;
let piece = '';
let sent = 0;
let drains = 0;
function flood(ws: ServerWebSocket): void {
  while (sent < 4 << 20) {
    const q = ws.send(piece);
    if (q < 0) return;
    sent += piece.length;
    if (q >= 65536) return;   // wait for drain
  }
  ws.send('flood done ' + sent + ' bytes, drained ' + (drains > 0 ? 'yes' : 'no'));
  flooding = null;
}
serve(port, (req: Request): Reply => {
  if (req.path === '/quit') { stop(); return { status: 200, body: 'bye', contentType: 'text/plain' }; }
  return { status: 200, body: 'plain http ' + req.path, contentType: 'text/plain' };
}, {
  maxPayloadBytes: 1024,
  idleTimeoutMs: 400,
  webSocket: {
    upgrade: (req: Request): boolean => req.path !== '/refused',
    open: (ws: ServerWebSocket) => { console.log('open', ws.path, ws.headers.get('x-client')); },
    message: (ws: ServerWebSocket, data: string, bytes: u8[] | null) => {
      if (bytes !== null) { ws.sendBytes(bytes as u8[]); return; }
      if (data === 'bye') { ws.close(4000, 'asked'); return; }
      if (data === 'flood') { flooding = ws; piece = 'f'.repeat(60000); flood(ws); return; }
      ws.send('echo:' + data);
    },
    drain: (ws: ServerWebSocket) => { drains++; if (flooding !== null) flood(ws); },
    close: (ws: ServerWebSocket, code: i32, reason: string) => { console.log('close', ws.path, code, JSON.stringify(reason), ws.readyState); },
  },
});
console.log('ready');
