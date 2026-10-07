// zinc:devtools transport for the Zinc Next engine: the Spec of cdp.spec.ts over zinc:socket (TCP and the WebSocket class of the socket plugin) instead of a
// poller of BSD sockets. HTTP discovery (/json/list, /json/version), the same Host and Origin checks as cdp.host.cpp, then a WebSocket upgrade; messages are
// text. Not ported: the screenshot of the frame (none), the profiler spans (none) and the mirroring of console output.
import { listen as listenTcp, Socket, WebSocket, MessageEvent } from 'zinc:socket';
import { sha1, base64Encode } from 'zinc:web';
import { utf8Encode, utf8Decode } from 'zinc:sys';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients: (WebSocket | null)[] = [];
let onMessage: ((client: i32, msg: string) => void) | null = null;

function headerValue(head: string, name: string): string {
  for (const line of head.split('\r\n')) {
    const c = line.indexOf(':');
    if (c > 0 && line.slice(0, c).trim().toLowerCase() === name) return line.slice(c + 1).trim();
  }
  return '';
}
function concat(a: u8[], b: u8[]): u8[] { return a.length === 0 ? b : a.concat(b); }
function localHost(host: string): boolean {
  for (const l of ['127.0.0.1', 'localhost', '[::1]']) if (host === l || host.startsWith(l + ':')) return true;
  return false;
}
function reply(s: Socket, status: string, body: string): void {
  s.write(`HTTP/1.1 ${status}\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: ${utf8Encode(body).length}\r\nConnection: close\r\n\r\n${body}`);
  s.end();
}
function request(s: Socket, head: string, rest: u8[]): void {
  const host = headerValue(head, 'host');
  const origin = headerValue(head, 'origin');
  // loopback only, and only for DevTools itself: a Host that is not local is DNS rebinding, an Origin other than the DevTools frontend is a web page
  if (!localHost(host) || (origin.length > 0 && !origin.startsWith('devtools://') && !origin.startsWith('chrome-devtools://'))) {
    s.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    s.end();
    return;
  }
  const first = head.split('\r\n')[0].split(' ');
  const path = first.length > 1 ? first[1] : '/';
  const key = headerValue(head, 'sec-websocket-key');
  if (key.length > 0) {
    s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${base64Encode(sha1(utf8Encode(key + GUID)))}\r\n\r\n`);
    s.bytesCbs = [];
    s.closeCbs = [];
    const ws = new WebSocket(path, s);
    const id: i32 = clients.length;
    clients.push(ws);
    ws.onmessage = (e: MessageEvent) => { const f = onMessage; if (f !== null && !e.binary) f(id, e.data); };
    ws.onclose = (e) => { clients[id] = null; };
    if (rest.length > 0) ws.receive(rest);
    return;
  }
  if (path.startsWith('/json/version')) reply(s, '200 OK', '{"Browser":"Zinc/0.1","Protocol-Version":"1.3"}');
  else if (path.startsWith('/json')) {
    reply(s, '200 OK', `[{"description":"Zinc UI","devtoolsFrontendUrl":"devtools://devtools/bundled/inspector.html?ws=${host}/zinc","id":"zinc","title":"Zinc app (next)","type":"page","url":"zinc://app","webSocketDebuggerUrl":"ws://${host}/zinc"}]`);
  } else reply(s, '200 OK', 'Zinc DevTools endpoint: open chrome://inspect');
}
function accept(s: Socket): void {
  let buf: u8[] = [];
  let done = false;
  s.onBytes((b: u8[]) => {
    if (done) return;
    buf = concat(buf, b);
    let end = -1;
    for (let i = 0; i + 3 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) { end = i; break; }
    if (end < 0) return;
    done = true;
    request(s, utf8Decode(buf.slice(0, end)), buf.slice(end + 4));
  });
}
function numField(msg: string, key: string): f64 {
  const i = msg.indexOf('"' + key + '":');
  if (i < 0) return 0;
  let j = i + key.length + 3;
  while (j < msg.length && (msg.charAt(j) === ' ' || msg.charAt(j) === '[')) j++;
  let k = j;
  while (k < msg.length && '+-.0123456789eE'.indexOf(msg.charAt(k)) >= 0) k++;
  return k > j ? parseFloat(msg.slice(j, k)) : 0;
}
function strField(msg: string, key: string): string {
  const i = msg.indexOf('"' + key + '":');
  if (i < 0) return '';
  let j = i + key.length + 3;
  while (j < msg.length && (msg.charAt(j) === ' ' || msg.charAt(j) === '[')) j++;
  if (msg.charAt(j) !== '"') return '';
  let out = '';
  for (j++; j < msg.length && msg.charAt(j) !== '"'; j++) {
    if (msg.charAt(j) !== '\\' || j + 1 >= msg.length) { out += msg.charAt(j); continue; }
    j++;
    out += msg.charAt(j) === 'n' ? '\n' : msg.charAt(j) === 't' ? '\t' : msg.charAt(j);
  }
  return out;
}

async function start(port: i32): Promise<void> {
  try {
    const srv = await listenTcp(port, accept, '127.0.0.1');
    console.error(`zinc devtools: chrome://inspect (Discover network targets: localhost:${srv.port}) or ws://127.0.0.1:${srv.port}/zinc`);
  } catch (e) { console.error(`zinc devtools: port ${port} unavailable`); }
}

export default {
  listen(port: i32, cb: (client: i32, msg: string) => void): boolean {
    onMessage = cb;
    start(port);
    return true;
  },
  send(client: i32, msg: string): void {
    for (let i: i32 = 0; i < clients.length; i++) {
      const ws = clients[i];
      if (ws !== null && (client < 0 || client === i)) ws.send(msg);
    }
  },
  num(msg: string, key: string): f64 { return numField(msg, key); },
  str(msg: string, key: string): string { return strField(msg, key); },
  clients(): i32 { let n: i32 = 0; for (const c of clients) if (c !== null) n++; return n; },
  screenshot(maxW: i32, maxH: i32): string { return ''; },
  trace(on: boolean): string { return on ? '' : '[]'; },
};
