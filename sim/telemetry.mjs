// zinc:telemetry for sim: same JSON lines as runtime/mod/telemetry.cpp
import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
let mode = -1, sock = null, host = '', port = 0, file = null, seq = 0;
const exposed = [];
function line(o) {
  const s = JSON.stringify(o);
  if (mode === 1) sock.send(s, port, host);
  else if (mode === 2) process.stdout.write(s + '\n');
  else if (mode === 3) fs.appendFileSync(file, s + '\n');
}
const msg = (type, payload) => line({ type, ts: performance.now(), seq: seq++, payload });
function open(t) {
  mode = 0;
  if (!t) return;
  if (t.startsWith('udp://')) { const [h, p] = t.slice(6).split(':'); host = h; port = Number(p ?? 9999); sock = dgram.createSocket('udp4'); sock.unref(); mode = 1; }
  else if (t === 'stdout') mode = 2;
  else if (t.startsWith('file:')) { file = t.slice(5); mode = 3; }
  if (!mode) return;
  msg('hello', { version: '0.1', platform: 'sim', features: ['perf', 'logs', 'state', 'metrics'] });
  setInterval(() => exposed.length && msg('state_snapshot', { vars: Object.fromEntries(exposed.map(([n, g]) => [n, g()])) }), 100).unref();
}
const ensure = () => { if (mode < 0) open(process.env.ZINC_TELEMETRY); return mode > 0; };
export const connect = t => { if (mode <= 0) open(t); };
export const enabled = () => ensure();
export const counter = (name, value) => ensure() && msg('metric', { kind: 'counter', name, value });
export const gauge = (name, value) => ensure() && msg('metric', { kind: 'gauge', name, value });
export const event = (name, data) => ensure() && msg('event', { name, data });
export const expose = (name, get) => { ensure(); exposed.push([name, get]); };
