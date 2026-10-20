import { serveWebSocket, connect, Socket, WebSocket } from 'zinc:socket';
// RFC 6455 on the wire (ZN-088): a raw client does the handshake by hand, pings the server (the pong echoes the payload), sends a fragmented text
// message (an unmasked or oversized frame is a protocol error elsewhere) and a close with code 1001 (the server answers with the same code).
async function main(): Promise<void> {
  const got: string[] = [];
  const wss = await serveWebSocket(0, (ws: WebSocket) => {
    ws.onmessage = (e) => { got.push('server got ' + e.data); };
    ws.onclose = (e) => { got.push('server closed ' + e.code + ' ' + e.wasClean); };
  }, '127.0.0.1');
  const s = await connect('127.0.0.1', wss.port);
  let buf: u8[] = [];
  let waiting: (() => void) | null = null;
  s.onBytes((b: u8[]) => { buf = buf.concat(b); const w = waiting; if (w !== null) { waiting = null; w(); } });
  const take = async (n: i32): Promise<u8[]> => {
    while (buf.length < n) await new Promise<void>((resolve) => { waiting = resolve; });
    const r = buf.slice(0, n);
    buf = buf.slice(n);
    return r;
  };
  s.write('GET /raw HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  let head = '';
  while (head.indexOf('\r\n\r\n') < 0) {
    const c = await take(1);
    head += String.fromCharCode(c[0]);
  }
  console.log(head.split('\r\n')[0], head.indexOf('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=') > 0);   // the accept key of RFC 6455 section 1.3
  const masked = (op: i32, fin: boolean, payload: u8[]): u8[] => {
    const m: u8[] = [1, 2, 3, 4];
    const f: u8[] = [(fin ? 0x80 : 0) | op, 0x80 | payload.length, 1, 2, 3, 4];
    for (let i = 0; i < payload.length; i++) f.push(payload[i] ^ m[i & 3]);
    return f;
  };
  s.writeBytes(masked(9, true, [7, 8]));
  console.log('pong', await take(4));
  s.writeBytes(masked(1, false, [104, 101]));   // "he" ...
  s.writeBytes(masked(9, true, [9]));            // a ping between the fragments is answered at once
  console.log('pong', await take(3));
  s.writeBytes(masked(0, true, [108, 108, 111])); // ... "llo"
  s.writeBytes(masked(8, true, [1001 >> 8, 1001 & 255, 98, 121, 101]));
  console.log('close', await take(4));
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 50); });
  console.log(got);
  s.close();
  wss.close();
}
main();
