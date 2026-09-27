// zinc:mqtt for sim: MQTT 3.1.1 QoS 0 client over node:net (no dependencies)
import * as net from 'node:net';
const str16 = s => { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
function packet(type, body) {
  const len = []; let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; len.push(d); } while (n);
  return Buffer.concat([Buffer.from([type, ...len]), body]);
}
const match = (f, t) => { const a = f.split('/'), b = t.split('/'); for (let i = 0; i < a.length; i++) { if (a[i] === '#') return true; if (a[i] !== '+' && a[i] !== b[i]) return false; } return a.length === b.length; };
export class MqttClient {
  constructor(host, port, clientId) { this.host = host; this.port = port; this.clientId = clientId; this.subs = []; this.id = 1; this.buf = Buffer.alloc(0); }
  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.connect(this.port, this.host);
      this.sock.on('error', () => reject(new Error('mqtt: cannot connect')));
      this.sock.on('connect', () => this.sock.write(packet(0x10, Buffer.concat([str16('MQTT'), Buffer.from([4, 2, 0, 60]), str16(this.clientId)]))));
      this.sock.on('data', d => {
        this.buf = Buffer.concat([this.buf, d]);
        for (;;) {
          let len = 0, mul = 1, i = 1;
          for (; i < this.buf.length; i++) { const x = this.buf[i]; len += (x & 127) * mul; mul *= 128; if (!(x & 128)) break; }
          if (i >= this.buf.length || this.buf.length < i + 1 + len) break;
          const type = this.buf[0], p = this.buf.subarray(i + 1, i + 1 + len);
          if ((type & 0xf0) === 0x20) { if (p[1] === 0) { resolve(); this.ping = setInterval(() => this.sock.write(Buffer.from([0xc0, 0])), 30000); } else reject(new Error('mqtt: connection refused')); }
          if ((type & 0xf0) === 0x30) {
            const tl = p.readUInt16BE(0), topic = p.toString('utf8', 2, 2 + tl), off = 2 + tl + ((type >> 1) & 3 ? 2 : 0);
            const payload = p.toString('utf8', off);
            for (const s of this.subs) if (match(s.filter, topic)) s.cb(topic, payload);
          }
          this.buf = this.buf.subarray(i + 1 + len);
        }
      });
    });
  }
  publish(topic, payload) { this.sock?.write(packet(0x30, Buffer.concat([str16(topic), Buffer.from(payload, 'utf8')]))); }
  subscribe(topic, cb) {
    this.subs.push({ filter: topic, cb });
    const id = Buffer.alloc(2); id.writeUInt16BE(this.id++);
    this.sock?.write(packet(0x82, Buffer.concat([id, str16(topic), Buffer.from([0])])));
  }
  close() { clearInterval(this.ping); this.sock?.end(Buffer.from([0xe0, 0])); this.sock = null; }
}
