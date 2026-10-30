// zinc:devtools transport for the Zinc Next engine: the Spec of cdp.spec.ts over zinc:socket (TCP and the WebSocket class of the socket plugin) instead of a
// poller of BSD sockets. HTTP discovery (/json/list, /json/version), the same Host and Origin checks as cdp.host.cpp, then a WebSocket upgrade; messages are
// text. The screenshot is the frame saved by zinc:gfx capture, whole (ZN-369); the console (ZN-373.01) and the frame spans of Tracing (ZN-373.05) come from the host.
import { listen as listenTcp, Server, Socket, WebSocket, MessageEvent } from 'zinc:socket';
import { sha1, base64Encode } from 'zinc:web';
import { utf8Encode, utf8Decode, env, pid, writeErr } from 'zinc:sys';
import { capture } from 'zinc:gfx';
import { readBytes, remove, tmpdir, mkdir, writeText } from 'zinc:fs';
import { call as netLog } from 'zinc:__netlog';
import { resourceStats } from 'zinc:__diagnostics';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients: (WebSocket | null)[] = [];
const clientWin: i32[] = [];   // the window each client attached to (ws://.../zinc/w<id>; 0: the main one), -1 once it left
let onMessage: ((client: i32, msg: string) => void) | null = null;
let described = '"title":"Zinc app (next)","description":"Zinc UI","url":"zinc://app"';   // net(15): the program's name, engine... (index.ts)

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
    const ws = new WebSocket(path, null, s);
    const id: i32 = clients.length;
    clients.push(ws);
    const win: i32 = path.startsWith('/zinc/w') ? parseInt(path.slice(7)) : 0;
    clientWin.push(win);
    ws.onmessage = (e: MessageEvent) => { const f = onMessage; if (f !== null && !e.binary) f(id, e.data); };
    ws.onclose = (e) => { clients[id] = null; clientWin[id] = -1; };
    if (rest.length > 0) ws.receive(rest);
    return;
  }
  if (path.startsWith('/json/version')) reply(s, '200 OK', '{"Browser":"Zinc/0.1","Protocol-Version":"1.3"}');
  else if (path.startsWith('/json')) reply(s, '200 OK', targets(host)); else reply(s, '200 OK', 'Zinc DevTools endpoint: open chrome://inspect');
}
/** /json/list: one target per window, the main one first (ZN-864, as Electron lists each window in chrome://inspect). A window beside it is
 *  named by the program and its title, and says which it is in `window`. */
function targets(host: string): string {
  const one = (path: string, id: string, fields: string): string =>
    `{"devtoolsFrontendUrl":"devtools://devtools/bundled/inspector.html?ws=${host}${path}","id":"${id}","type":"page","webSocketDebuggerUrl":"ws://${host}${path}",${fields}}`;
  const out: string[] = [one('/zinc', 'zinc', described + ',"window":{"id":0,"title":""}')];
  const cut = described.indexOf(',"description":');
  const ws = netLog(16, '');
  if (cut > 0 && described.startsWith('"title":') && ws.length > 2) {
    const name: string = JSON.parse(described.slice(8, cut));
    const list = JSON.parse(ws);
    for (const w of list) {
      const id: i32 = w.id, title: string = w.title;
      out.push(one(`/zinc/w${id}`, `zinc-w${id}`, `"title":${JSON.stringify(name + ' · ' + title)}${described.slice(cut)},"window":{"id":${id},"title":${JSON.stringify(title)}}`));
    }
  }
  return '[' + out.join(',') + ']';
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

// Discovery of any port: <zinc home>/run/devtools/<pid>.json names the port of each program listening (cdp.host.cpp writes the same); the Zinc
// Inspector reads the folder, and removes the file of a program that no longer answers.
function announce(): void {
  try {
    const home = env('ZINC_HOME').length > 0 ? env('ZINC_HOME') : env('HOME') + '/.zinc', dir = home + '/run/devtools';
    mkdir(dir, true);
    writeText(`${dir}/${pid()}.json`, `{"port":${port},"pid":${pid()}}`);
  } catch (e) { /* a read-only home: found on the scanned ports only */ }
}
let port: i32 = 0;      // where the inspector listens
let logging = false;    // the network log was started: it leaves out the program's own connections to that port
let any = false;        // zinc dev: the port is the previous version's, any free one when it is taken
async function start(): Promise<void> {
  const report = port === 0 || any;   // zinc dev learns the port bound (host.netLog 20: its dev socket)
  try {
    let srv: Server | null = null;
    try { srv = await listenTcp(port, accept, '127.0.0.1'); } catch (e) {
      if (!any || port === 0) throw e;
      port = 0;
      srv = await listenTcp(0, accept, '127.0.0.1');
    }
    if ((srv as Server).port !== port) { port = (srv as Server).port; if (logging) netLog(0, `${port}`); }   // asked for port 0: the system chose one
    if (report) netLog(20, `${port}`);
    announce();
    // on stderr, not through console.error: the inspector's console would show it as an error
    writeErr(`zinc devtools: chrome://inspect (Discover network targets: localhost:${port}) or ws://127.0.0.1:${port}/zinc\n`);
  } catch (e) { writeErr(`zinc devtools: port ${port} unavailable\n`); }
}

export default {
  listen(asked: i32, cb: (client: i32, msg: string) => void): boolean {
    onMessage = cb;
    // ZINC_DEVTOOLS_PORT wins over the port the plugin asks for (two programs at once; `zinc run` sets it from zinc.json plugins.devtools.port); 0 takes any free port
    const e = env('ZINC_DEVTOOLS_PORT');
    port = e.length > 0 ? parseInt(e) : asked;
    any = env('ZINC_DEVTOOLS_ANY').length > 0;
    start();
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
  resourceStats(): string { return resourceStats(); },
  screenshot(maxW: i32, maxH: i32): string {   // ponytail: through a file and not shrunk to maxW x maxH (the screencast gets the frame whole)
    const f = `${tmpdir()}/zinc-devtools-${port}.png`;
    if (!capture(f)) return '';
    const png = readBytes(f);
    remove(f);
    return base64Encode(png);
  },
  screencast(maxW: i32, maxH: i32, quality: i32): string {   // the host keeps the frame from its damage (src/host/screencast.cpp)
    if (maxW >= 0) return netLog(13, `${maxW} ${maxH} ${quality}`);
    netLog(14, '');
    return '';
  },
  trace(on: boolean): string { return netLog(on ? 7 : 8, ''); },   // the runtime's frame phases (ZN-373.05)
  net(op: i32, arg: string): string {
    if (op === 15) { described = arg; return ''; }
    if (op === 25) { const o: string[] = []; for (const w of clientWin) o.push(`${w}`); return o.join(' '); }   // the window of each client (index.ts)
    if (op !== 0) return netLog(op, arg);
    logging = true;
    return netLog(0, `${port}`);
  },
};
