// A tiny MQTT 3.1.1 broker over TLS for tests/t0/tls.sh: CONNACK, SUBSCRIBE, PUBLISH QoS 0 fan-out, PINGREQ, DISCONNECT, at one TLS version
// (TLS 1.3 sends its session tickets right behind the handshake, next to the CONNACK: ZN-610). Usage: node mqtt_tls_broker.mjs PORT CERT KEY TLSv1.2|TLSv1.3 [mute]
// prints "ready"; the test kills it. `mute`: accept the TCP connection and never answer (a handshake that cannot complete).
import { createServer as tcpServer } from 'node:net';
import { createServer } from 'node:tls';
import { readFileSync } from 'node:fs';
const [port, cert, key, version, mode] = process.argv.slice(2);
const listen = (srv) => srv.listen(Number(port), '127.0.0.1', () => console.log('ready'));
if (mode === 'mute') { const held = []; listen(tcpServer((s) => { held.push(s); s.on('error', () => {}); })); }
else {
  const subs = [];   // [filter, socket]
  const match = (f, t) => { f = f.split('/'); t = t.split('/'); for (let i = 0; i < f.length; i++) { if (f[i] === '#') return true; if (i >= t.length || (f[i] !== '+' && f[i] !== t[i])) return false; } return f.length === t.length; };
  const out = (h, body) => { const v = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); v.push(n ? d | 128 : d); } while (n); return Buffer.concat([Buffer.from([h, ...v]), body]); };
  listen(createServer({ cert: readFileSync(cert), key: readFileSync(key), minVersion: version, maxVersion: version }, (s) => {
    let buf = Buffer.alloc(0);
    s.on('error', () => {});
    s.on('close', () => { for (let i = subs.length - 1; i >= 0; i--) if (subs[i][1] === s) subs.splice(i, 1); });
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        let n = 0, m = 1, i = 1;
        for (; i < buf.length; i++) { n += (buf[i] & 127) * m; m *= 128; if (!(buf[i] & 128)) break; }
        if (i >= buf.length || buf.length < i + 1 + n) return;
        const h = buf[0], p = buf.subarray(i + 1, i + 1 + n);
        buf = buf.subarray(i + 1 + n);
        const k = h >> 4;
        if (k === 1) s.write(Buffer.from([0x20, 2, 0, 0]));
        else if (k === 8) { const f = p.subarray(4, 4 + p.readUInt16BE(2)).toString(); subs.push([f, s]); s.write(out(0x90, Buffer.from([p[0], p[1], 0]))); }
        else if (k === 3) { const t = p.subarray(2, 2 + p.readUInt16BE(0)).toString(); for (const [f, c] of subs) if (match(f, t)) c.write(out(0x30, p)); }
        else if (k === 12) s.write(Buffer.from([0xd0, 0]));
        else if (k === 14) { s.end(); return; }
      }
    });
  }));
}
