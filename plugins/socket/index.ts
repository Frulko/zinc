// zinc:socket — TCP, Unix domain and UDP sockets, DNS lookup, and WebSocket client / server (docs/plugins/socket.md).
// Everything runs on the event loop: the native side (native/socket.spec.ts) polls non-blocking sockets and reports
// events by handle; this file turns them into objects. WebSocket framing (RFC 6455) is written here in Zinc.
import S from './native/socket.spec';
import { utf8Encode, utf8Decode, randomBytes } from 'zinc:sys';
import { URL, sha1, base64Encode, EventTarget, Event } from 'zinc:web';

const DATA = 0, OPEN = 1, ACCEPT = 2, CLOSE = 3, ERROR = 4, DGRAM = 5, LOOKUP = 6, LOOKUP_ERROR = 7;

/** Length of the prefix of `b` that ends on a complete UTF-8 sequence. */
function utf8Cut(b: u8[]): i32 {
  const n = b.length;
  for (let k = 1; k <= 3 && k <= n; k++) {
    const c: i32 = b[n - k];
    if ((c & 0xC0) !== 0x80) {
      const len = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
      return len > k ? n - k : n;
    }
  }
  return n;
}

/** A TCP or Unix domain stream connection. */
export class Socket {
  handle: i32;
  /** Peer address and port (TCP; '' / 0 for Unix sockets). */
  remoteAddress: string = '';
  remotePort: i32 = 0;
  open: boolean = false;
  closed: boolean = false;
  dataCbs: ((chunk: string) => void)[] = [];
  bytesCbs: ((chunk: u8[]) => void)[] = [];
  closeCbs: (() => void)[] = [];
  errorCbs: ((message: string) => void)[] = [];
  tail: u8[] = [];
  ready: ((s: Socket) => void) | null = null;
  failed: ((e: Error) => void) | null = null;
  constructor(handle: i32) { this.handle = handle; }
  get localPort(): i32 { return this.closed ? 0 : S.localPort(this.handle); }
  /** Text as it arrives (UTF-8 sequences are never split between chunks). */
  onData(cb: (chunk: string) => void): Socket { this.dataCbs.push(cb); return this; }
  /** Raw bytes as they arrive. */
  onBytes(cb: (chunk: u8[]) => void): Socket { this.bytesCbs.push(cb); return this; }
  /** The peer closed the connection (or it was reset); not called after close(). */
  onClose(cb: () => void): Socket { this.closeCbs.push(cb); return this; }
  onError(cb: (message: string) => void): Socket { this.errorCbs.push(cb); return this; }
  /** Queues text; false once the socket is closed or ended. */
  write(s: string): boolean { return !this.closed && S.writeText(this.handle, s); }
  writeBytes(b: u8[]): boolean { return !this.closed && S.write(this.handle, b); }
  /** Sends FIN once the queued data is out; the peer's close then arrives through onClose. */
  end(): void { if (!this.closed) S.end(this.handle); }
  close(): void { if (this.closed) return; this.closed = true; sockets.delete(this.handle); S.close(this.handle); }

  data(b: u8[]): void {
    for (const cb of this.bytesCbs) cb(b);
    if (this.dataCbs.length === 0) return;
    const all = this.tail.length > 0 ? this.tail.concat(b) : b;
    const cut = utf8Cut(all);
    this.tail = cut < all.length ? all.slice(cut) : [];
    if (cut === 0) return;
    const s = utf8Decode(cut === all.length ? all : all.slice(0, cut));
    for (const cb of this.dataCbs) cb(s);
  }
  peerClosed(): void {
    this.closed = true;
    if (this.tail.length > 0) { const s = utf8Decode(this.tail); this.tail = []; for (const cb of this.dataCbs) cb(s); }
    for (const cb of this.closeCbs) cb();
  }
}

/** A listening TCP or Unix domain server. */
export class Server {
  handle: i32;
  onConnection: (s: Socket) => void;
  closed: boolean = false;
  ready: ((s: Server) => void) | null = null;
  failed: ((e: Error) => void) | null = null;
  constructor(handle: i32, onConnection: (s: Socket) => void) { this.handle = handle; this.onConnection = onConnection; }
  /** The bound port (useful after listen(0)). */
  get port(): i32 { return this.closed ? 0 : S.localPort(this.handle); }
  /** Stops accepting; open connections stay open. */
  close(): void { if (this.closed) return; this.closed = true; servers.delete(this.handle); S.close(this.handle); }
}

export class Datagram {
  bytes: u8[]; address: string; port: i32;
  constructor(bytes: u8[], address: string, port: i32) { this.bytes = bytes; this.address = address; this.port = port; }
  /** The payload as UTF-8 text. */
  get text(): string { return utf8Decode(this.bytes); }
}
/** A UDP endpoint. */
export class UdpSocket {
  handle: i32;
  msgCbs: ((m: Datagram) => void)[] = [];
  closed: boolean = false;
  ready: ((s: UdpSocket) => void) | null = null;
  failed: ((e: Error) => void) | null = null;
  constructor(handle: i32) { this.handle = handle; }
  get port(): i32 { return this.closed ? 0 : S.localPort(this.handle); }
  onMessage(cb: (m: Datagram) => void): UdpSocket { this.msgCbs.push(cb); return this; }
  send(host: string, port: i32, text: string): boolean { return !this.closed && S.sendTo(this.handle, host, port, utf8Encode(text)); }
  sendBytes(host: string, port: i32, b: u8[]): boolean { return !this.closed && S.sendTo(this.handle, host, port, b); }
  close(): void { if (this.closed) return; this.closed = true; udps.delete(this.handle); S.close(this.handle); }
}

const sockets = new Map<i32, Socket>();
const servers = new Map<i32, Server>();
const udps = new Map<i32, UdpSocket>();
const lookups = new Map<i32, (addrs: string[], err: string) => void>();
let listening = false;
function listen0(): void {
  if (listening) return;
  listening = true;
  S.onEvent((h: i32, kind: i32, a: i32, text: string, bytes: u8[]) => {
    if (kind === LOOKUP || kind === LOOKUP_ERROR) {
      const f = lookups.get(h);
      if (f === undefined) return;
      lookups.delete(h);
      if (kind === LOOKUP) f(text.split(','), ''); else f([], text);
      return;
    }
    if (kind === ACCEPT) {
      const srv = servers.get(h);
      if (srv === undefined) { S.close(a); return; }
      const s = new Socket(a);
      s.open = true;
      s.remoteAddress = S.remoteAddress(a);
      s.remotePort = S.remotePort(a);
      sockets.set(a, s);
      srv.onConnection(s);
      return;
    }
    if (kind === DGRAM) {
      const u = udps.get(h);
      if (u === undefined) return;
      const m = new Datagram(bytes, text, a);
      for (const cb of u.msgCbs) cb(m);
      return;
    }
    const srv = servers.get(h);
    if (srv !== undefined && (kind === OPEN || kind === ERROR)) {
      const r = srv.ready, f = srv.failed;
      srv.ready = null; srv.failed = null;
      if (kind === ERROR) { servers.delete(h); srv.closed = true; if (f !== null) f(new Error(text)); }
      else if (r !== null) r(srv);
      return;
    }
    const u = udps.get(h);
    if (u !== undefined && (kind === OPEN || kind === ERROR)) {
      const r = u.ready, f = u.failed;
      u.ready = null; u.failed = null;
      if (kind === ERROR) { udps.delete(h); u.closed = true; if (f !== null) f(new Error(text)); }
      else if (r !== null) r(u);
      return;
    }
    const s = sockets.get(h);
    if (s === undefined) return;
    if (kind === DATA) s.data(bytes);
    else if (kind === OPEN) {
      s.open = true;
      s.remoteAddress = S.remoteAddress(h);
      s.remotePort = S.remotePort(h);
      const r = s.ready;
      s.ready = null; s.failed = null;
      if (r !== null) r(s);
    } else if (kind === CLOSE) {
      sockets.delete(h);
      s.peerClosed();
    } else if (kind === ERROR) {
      if (!s.open) {  // failed connect: the handle is gone
        sockets.delete(h);
        s.closed = true;
        const f = s.failed;
        s.ready = null; s.failed = null;
        if (f !== null) f(new Error(text));
        return;
      }
      for (const cb of s.errorCbs) cb(text);
    }
  });
}
function pending(h: i32): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    if (h < 0) { reject(new Error(S.error())); return; }
    const s = new Socket(h);
    s.ready = resolve;
    s.failed = reject;
    sockets.set(h, s);
  });
}
/** Opens a TCP connection; rejects with e.g. 'connect ECONNREFUSED 127.0.0.1:9' or 'getaddrinfo ENOTFOUND host'. */
export function connect(host: string, port: i32): Promise<Socket> { listen0(); return pending(S.connect(host, port)); }
/** Opens a Unix domain stream connection. */
export function connectUnix(path: string): Promise<Socket> { listen0(); return pending(S.connectUnix(path)); }
/** TCP server; port 0 picks a free port (see Server.port); host '' = all interfaces. Resolves once listening;
 *  rejects when the address cannot be bound (e.g. 'listen EADDRINUSE 0.0.0.0:80'). */
export function listen(port: i32, onConnection: (s: Socket) => void, host: string = ''): Promise<Server> {
  listen0();
  return serverOf(S.listen(host, port), onConnection);
}
/** Unix domain server at `path` (the file must not exist). */
export function listenUnix(path: string, onConnection: (s: Socket) => void): Promise<Server> {
  listen0();
  return serverOf(S.listenUnix(path), onConnection);
}
function serverOf(h: i32, onConnection: (s: Socket) => void): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    if (h < 0) { reject(new Error(S.error())); return; }
    const srv = new Server(h, onConnection);
    srv.ready = resolve;
    srv.failed = reject;
    servers.set(h, srv);
  });
}
/** UDP endpoint bound to `port` (0: any free port) on host ('' = all interfaces); resolves once bound. */
export function udp(port: i32, host: string = ''): Promise<UdpSocket> {
  listen0();
  const h = S.udp(host, port);
  return new Promise<UdpSocket>((resolve, reject) => {
    if (h < 0) { reject(new Error(S.error())); return; }
    const u = new UdpSocket(h);
    u.ready = resolve;
    u.failed = reject;
    udps.set(h, u);
  });
}
/** Every address of a host name (getaddrinfo order, duplicates removed). Rejects with 'getaddrinfo ENOTFOUND host'. */
export function lookup(host: string): Promise<string[]> {
  listen0();
  return new Promise<string[]>((resolve, reject) => {
    const id = S.lookup(host);
    if (id < 0) { reject(new Error(S.error())); return; }
    lookups.set(id, (addrs: string[], err: string) => { if (err.length > 0) reject(new Error(err)); else resolve(addrs); });
  });
}

// ------------------------------------------------------------------------------------------------ WebSocket
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const CONNECTING: i32 = 0, OPEN_STATE: i32 = 1, CLOSING: i32 = 2, CLOSED: i32 = 3;

export class MessageEvent extends Event {
  /** Text of a text message ('' for binary). */
  readonly data: string;
  /** Payload of a binary message (empty for text). */
  readonly bytes: u8[];
  readonly binary: boolean;
  constructor(data: string, bytes: u8[], binary: boolean) { super('message'); this.data = data; this.bytes = bytes; this.binary = binary; }
}
export class CloseEvent extends Event {
  readonly code: i32; readonly reason: string; readonly wasClean: boolean;
  constructor(code: i32, reason: string, wasClean: boolean) { super('close'); this.code = code; this.reason = reason; this.wasClean = wasClean; }
}
export class ErrorEvent extends Event {
  readonly message: string;
  constructor(message: string) { super('error'); this.message = message; }
}

function concat(a: u8[], b: u8[]): u8[] { return a.length === 0 ? b : a.concat(b); }
function headerValue(head: string, name: string): string {
  for (const line of head.split('\r\n')) {
    const c = line.indexOf(':');
    if (c > 0 && line.slice(0, c).trim().toLowerCase() === name) return line.slice(c + 1).trim();
  }
  return '';
}
function acceptKey(key: string): string { return base64Encode(sha1(utf8Encode(key + GUID))); }

/** RFC 6455 WebSocket over zinc:socket (ws:// only; no TLS). Browser-style: set onopen / onmessage / onclose /
 *  onerror, or addEventListener('open' | 'message' | 'close' | 'error'). */
export class WebSocket extends EventTarget {
  readonly url: string;
  readyState: i32 = CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sock: Socket | null = null;
  client: boolean;
  key: string = '';
  buf: u8[] = [];
  handshaking: boolean;
  frag: u8[] = [];
  fragOp: i32 = 0;
  closeSent: boolean = false;
  closeFired: boolean = false;

  /** Connects to ws://host[:port]/path. Server-side sockets are created by serveWebSocket. */
  constructor(url: string, server: Socket | null = null) {
    super();
    this.url = url;
    this.client = server === null;
    this.handshaking = this.client;
    if (server !== null) { this.attach(server); this.readyState = OPEN_STATE; return; }
    let u: URL;
    try { u = new URL(url); } catch (e) { this.fail('invalid URL ' + url); return; }
    if (u.protocol !== 'ws:') { this.fail(`unsupported scheme ${u.protocol} (only ws:)`); return; }
    const port: i32 = u.port.length > 0 ? parseInt(u.port) : 80;
    const path = (u.pathname.length > 0 ? u.pathname : '/') + u.search;
    this.key = base64Encode(randomBytes(16));
    this.start(u.hostname, port, u.host, path);
  }
  async start(host: string, port: i32, hostHeader: string, path: string): Promise<void> {
    let s: Socket;
    try { s = await connect(host, port); } catch (e) { this.fail(e.message); return; }
    if (this.readyState !== CONNECTING) { s.close(); return; }
    this.attach(s);
    s.write(`GET ${path} HTTP/1.1\r\nHost: ${hostHeader}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${this.key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  }
  attach(s: Socket): void {
    this.sock = s;
    s.onBytes((b: u8[]) => { this.receive(b); });
    s.onClose(() => { this.finish(1006, '', false); });
  }
  fail(message: string): void {
    const e = new ErrorEvent(message);
    const f = this.onerror;
    if (f !== null) f(e);
    this.dispatchEvent(e);
    this.finish(1006, '', false);
  }
  finish(code: i32, reason: string, clean: boolean): void {
    if (this.closeFired) return;
    this.closeFired = true;
    this.readyState = CLOSED;
    const s = this.sock;
    if (s !== null) { s.close(); this.sock = null; }
    const e = new CloseEvent(code, reason, clean);
    const f = this.onclose;
    if (f !== null) f(e);
    this.dispatchEvent(e);
  }
  /** Sends a text message; false unless open. */
  send(text: string): boolean { return this.frame(1, utf8Encode(text)); }
  /** Sends a binary message. */
  sendBytes(b: u8[]): boolean { return this.frame(2, b); }
  /** Starts the closing handshake (code 1000 by default). */
  close(code: i32 = 1000, reason: string = ''): void {
    if (this.readyState === CONNECTING) { this.readyState = CLOSED; this.finish(1006, '', false); return; }
    if (this.readyState !== OPEN_STATE) return;
    this.readyState = CLOSING;
    this.sendClose(code, reason);
  }
  sendClose(code: i32, reason: string): void {
    if (this.closeSent) return;
    this.closeSent = true;
    const p: u8[] = [(code >> 8) & 255, code & 255];
    this.raw(8, p.concat(utf8Encode(reason)));
  }
  frame(op: i32, payload: u8[]): boolean {
    if (this.readyState !== OPEN_STATE) return false;
    this.raw(op, payload);
    return true;
  }
  raw(op: i32, payload: u8[]): void {
    const s = this.sock;
    if (s === null) return;
    const n = payload.length;
    const h: u8[] = [0x80 | op];
    const mask = this.client ? 0x80 : 0;
    if (n < 126) h.push(mask | n);
    else if (n < 65536) { h.push(mask | 126); h.push((n >> 8) & 255); h.push(n & 255); }
    else { h.push(mask | 127); for (let i = 0; i < 4; i++) h.push(0); h.push((n >>> 24) & 255); h.push((n >> 16) & 255); h.push((n >> 8) & 255); h.push(n & 255); }
    if (!this.client) { s.writeBytes(h.concat(payload)); return; }
    const m = randomBytes(4);
    const body: u8[] = [];
    for (let i = 0; i < n; i++) body.push(payload[i] ^ m[i & 3]);
    s.writeBytes(h.concat(m).concat(body));
  }
  receive(b: u8[]): void {
    this.buf = concat(this.buf, b);
    if (this.handshaking) {
      let end = -1;
      for (let i = 0; i + 3 < this.buf.length; i++) if (this.buf[i] === 13 && this.buf[i + 1] === 10 && this.buf[i + 2] === 13 && this.buf[i + 3] === 10) { end = i; break; }
      if (end < 0) return;
      const head = utf8Decode(this.buf.slice(0, end));
      this.buf = this.buf.slice(end + 4);
      this.handshaking = false;
      if (!head.startsWith('HTTP/1.1 101') || headerValue(head, 'sec-websocket-accept') !== acceptKey(this.key)) {
        this.fail('handshake failed: ' + head.split('\r\n')[0]);
        return;
      }
      this.readyState = OPEN_STATE;
      const e = new Event('open');
      const f = this.onopen;
      if (f !== null) f(e);
      this.dispatchEvent(e);
    }
    this.frames();
  }
  frames(): void {
    for (;;) {
      const buf = this.buf;
      if (buf.length < 2 || this.closeFired) return;
      const fin = (buf[0] & 0x80) !== 0, op: i32 = buf[0] & 15;
      const masked = (buf[1] & 0x80) !== 0;
      let n: i32 = buf[1] & 127, at: i32 = 2;
      if (n === 126) { if (buf.length < 4) return; n = (buf[2] << 8) | buf[3]; at = 4; }
      else if (n === 127) {
        if (buf.length < 10) return;
        if (buf[2] !== 0 || buf[3] !== 0 || buf[4] !== 0 || buf[5] !== 0 || buf[6] >= 128) { this.protocolError('frame too large'); return; }
        n = (buf[6] << 24) | (buf[7] << 16) | (buf[8] << 8) | buf[9]; at = 10;
      }
      const mk: u8[] = masked ? buf.slice(at, at + 4) : [];
      if (masked) at += 4;
      if (buf.length < at + n) return;
      let payload = buf.slice(at, at + n);
      if (masked) { const p: u8[] = []; for (let i = 0; i < n; i++) p.push(payload[i] ^ mk[i & 3]); payload = p; }
      this.buf = buf.slice(at + n);
      if (this.client === masked) { this.protocolError(this.client ? 'masked frame from server' : 'unmasked frame from client'); return; }
      if (op === 8) {
        const code: i32 = payload.length >= 2 ? (payload[0] << 8) | payload[1] : 1005;
        const reason = payload.length > 2 ? utf8Decode(payload.slice(2)) : '';
        this.readyState = CLOSING;
        this.sendClose(code === 1005 ? 1000 : code, '');
        const s = this.sock;
        if (s !== null) s.end();
        this.finish(code, reason, true);
        return;
      }
      if (op === 9) { this.raw(10, payload); continue; }
      if (op === 10) continue;
      if (op === 0) { this.frag = concat(this.frag, payload); if (!fin) continue; payload = this.frag; this.frag = []; }
      else if (!fin) { this.fragOp = op; this.frag = payload; continue; }
      const kind = op === 0 ? this.fragOp : op;
      const e = kind === 1 ? new MessageEvent(utf8Decode(payload), [], false) : new MessageEvent('', payload, true);
      const f = this.onmessage;
      if (f !== null) f(e);
      this.dispatchEvent(e);
    }
  }
  protocolError(why: string): void {
    this.sendClose(1002, why);
    this.fail(why);
  }
}

/** The request that opened a server-side WebSocket. */
export class UpgradeRequest {
  path: string; headers: string;
  constructor(path: string, headers: string) { this.path = path; this.headers = headers; }
  /** A request header ('' when absent). */
  header(name: string): string { return headerValue(this.headers, name.toLowerCase()); }
}
export class WebSocketServer {
  server: Server;
  constructor(server: Server) { this.server = server; }
  get port(): i32 { return this.server.port; }
  close(): void { this.server.close(); }
}
/** WebSocket server: answers the HTTP upgrade on `port` (0: any free port) and hands each connection over. Requests
 *  that are not WebSocket upgrades get 426. Rejects when the port cannot be bound. */
export async function serveWebSocket(port: i32, onConnection: (ws: WebSocket, req: UpgradeRequest) => void, host: string = ''): Promise<WebSocketServer> {
  const srv = await listen(port, (s: Socket) => {
    let buf: u8[] = [];
    let done = false;
    s.onBytes((b: u8[]) => {
      if (done) return;
      buf = concat(buf, b);
      let end = -1;
      for (let i = 0; i + 3 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) { end = i; break; }
      if (end < 0) return;
      done = true;
      const head = utf8Decode(buf.slice(0, end));
      const rest = buf.slice(end + 4);
      const first = head.split('\r\n')[0].split(' ');
      const key = headerValue(head, 'sec-websocket-key');
      if (first[0] !== 'GET' || headerValue(head, 'upgrade').toLowerCase() !== 'websocket' || key.length === 0) {
        s.write('HTTP/1.1 426 Upgrade Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        s.end();
        return;
      }
      s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
      s.bytesCbs = [];
      s.closeCbs = [];
      const ws = new WebSocket(first.length > 1 ? first[1] : '/', s);
      onConnection(ws, new UpgradeRequest(first.length > 1 ? first[1] : '/', head));
      if (rest.length > 0) ws.receive(rest);
    });
  }, host);
  return new WebSocketServer(srv);
}
