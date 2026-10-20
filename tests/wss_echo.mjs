// A tiny WebSocket echo server over TLS for tests/t0/tls.sh (wss): the RFC 6455 handshake answered at once with a greeting frame behind it (as a server that
// speaks first does), text and binary frames echoed back unmasked, a close answered with its code. TLS 1.3 sends its session tickets right after the
// handshake, close to the first reply (the case of ZN-762). Usage: node wss_echo.mjs PORT CERT KEY TLSv1.2|TLSv1.3 [first]; prints "ready"; the test kills it.
// `first`: no WebSocket, the server writes one line 50 ms after the handshake, behind its tickets, and waits.
import { createServer } from 'node:tls';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [port, cert, key, version, mode] = process.argv.slice(2);
const frame = (op, p) => Buffer.concat([Buffer.from(p.length < 126 ? [0x80 | op, p.length] : [0x80 | op, 126, p.length >> 8, p.length & 255]), p]);
createServer({ cert: readFileSync(cert), key: readFileSync(key), minVersion: version, maxVersion: version }, (s) => {
  let buf = Buffer.alloc(0), open = false;
  s.on('error', () => {});
  if (mode === 'first') { setTimeout(() => s.write('server first over ' + s.getProtocol() + '\n'), 50); return; }   // after the tickets, which go out at once
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!open) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      const k = /sec-websocket-key:\s*(\S+)/i.exec(buf.subarray(0, end).toString())[1];
      const accept = createHash('sha1').update(k + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      s.write(frame(1, Buffer.from('hello from ' + s.getProtocol())));
      buf = buf.subarray(end + 4);
      open = true;
    }
    while (buf.length >= 6) {
      const op = buf[0] & 15, n = buf[1] & 127, at = n === 126 ? 4 : 2;   // client frames here are short
      if (n === 126 && buf.length < 4) return;
      const len = n === 126 ? buf.readUInt16BE(2) : n;
      if (buf.length < at + 4 + len) return;
      const m = buf.subarray(at, at + 4), p = Buffer.from(buf.subarray(at + 4, at + 4 + len).map((x, i) => x ^ m[i & 3]));
      buf = buf.subarray(at + 4 + len);
      if (op === 8) { s.end(frame(8, p.subarray(0, 2))); return; }
      if (op === 9) s.write(frame(10, p));
      else if (op === 1 || op === 2) s.write(frame(op, p));
    }
  });
}).listen(Number(port), '127.0.0.1', () => console.log('ready'));
