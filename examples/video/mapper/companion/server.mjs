#!/usr/bin/env node
// Mapper web companion: serves the editor (index.html) and relays it to the app as OSC over UDP. No dependencies.
//   node server.mjs [--app 127.0.0.1:9000] [--http 8080] [--reply 9001] [--reply-host <this machine's LAN IP>]
// HTTP API: POST /osc  [[address, ...args], ...]  -> one OSC message each (numbers as float32, strings as s)
//           GET /state -> sends /sync <reply-host> <reply> and answers with {layers, selected, aspect, layers: [...]}
import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const [appHost, appPort] = arg('app', '127.0.0.1:9000').split(':');
const HTTP = Number(arg('http', 8080)), REPLY = Number(arg('reply', 9001));
const lan = Object.values(os.networkInterfaces()).flat().find(a => a.family === 'IPv4' && !a.internal)?.address;
const replyHost = arg('reply-host', /^(127\.|localhost$)/.test(appHost) ? '127.0.0.1' : lan ?? '127.0.0.1');
const DIR = path.dirname(new URL(import.meta.url).pathname);

// OSC 1.0: NUL-terminated strings padded to 4 bytes, big-endian float32 numbers.
const pad = b => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
export function encode(address, args) {
  const parts = [pad(Buffer.from(address)), pad(Buffer.from(',' + args.map(a => (typeof a === 'string' ? 's' : 'f')).join('')))];
  for (const a of args) {
    if (typeof a === 'string') parts.push(pad(Buffer.from(a)));
    else { const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b); }
  }
  return Buffer.concat(parts);
}
export function decode(buf) {
  let off = 0;
  const str = () => { const end = buf.indexOf(0, off); const s = buf.toString('utf8', off, end); off = (end + 4) & ~3; return s; };
  const address = str(), tags = str(), args = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
    else if (t === 's') args.push(str());
  }
  return { address, args };
}

const udp = dgram.createSocket('udp4');
const send = (address, args) => udp.send(encode(address, args), Number(appPort), appHost);

// /state: the app answers /sync with /state/info {json} then /state/layer i {json} per layer.
let pending = null;
udp.on('message', buf => {
  if (!pending) return;
  try {
    const m = decode(buf);
    if (m.address === '/state/info') pending.info = JSON.parse(m.args[0]);
    else if (m.address === '/state/layer') pending.layers[m.args[0]] = JSON.parse(m.args[1]);
  } catch { return; }
  if (pending.info && Object.keys(pending.layers).length >= pending.info.layers) pending.done();
});
function state() {
  if (pending) return pending.promise;
  const p = { info: null, layers: {} };
  p.promise = new Promise(resolve => {
    const timer = setTimeout(() => { pending = null; resolve(null); }, 1000);
    p.done = () => {
      clearTimeout(timer);
      pending = null;
      resolve({ ...p.info, layers: Array.from({ length: p.info.layers }, (_, i) => p.layers[i]) });
    };
  });
  pending = p;
  send('/sync', [replyHost, REPLY]);
  return p.promise;
}

const valid = m => Array.isArray(m) && typeof m[0] === 'string' && m[0].startsWith('/') && m.slice(1).every(a => typeof a === 'string' || Number.isFinite(a));

const server = http.createServer(async (req, res) => {
  const reply = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) return reply(200, fs.readFileSync(path.join(DIR, 'index.html')), 'text/html; charset=utf-8');
  if (req.method === 'GET' && req.url === '/state') {
    const s = await state();
    return s ? reply(200, JSON.stringify(s)) : reply(504, JSON.stringify({ error: `no answer from ${appHost}:${appPort}` }));
  }
  if (req.method === 'POST' && req.url === '/osc') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 1 << 20) return reply(413, '{}'); }
    let msgs;
    try { msgs = JSON.parse(body); } catch { return reply(400, JSON.stringify({ error: 'invalid JSON' })); }
    if (!Array.isArray(msgs) || !msgs.every(valid)) return reply(400, JSON.stringify({ error: 'expected [[address, ...args], ...]' }));
    for (const [address, ...args] of msgs) send(address, args);
    return reply(204, '');
  }
  reply(404, '{}');
});

udp.bind(REPLY, () => server.listen(HTTP, () =>
  console.log(`companion: http://localhost:${HTTP}  ->  osc ${appHost}:${appPort}  (state replies to ${replyHost}:${REPLY})`)));
