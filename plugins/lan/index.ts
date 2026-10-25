// zinc:lan — the local network for games and devices, the same on a desktop and on the consoles (docs/plugins/lan.md): UDP datagrams with
// broadcast (finding each other without typing an address) and TCP streams, polled once a frame. Nothing blocks and nothing calls back, so it
// runs in a console core (PSP, PS Vita, 3DS) as on the computer; zinc:socket stays the event-driven API of the desktop.
import N from './native/lan.spec';

/** Brings the network up; call it each frame until it answers 1 (up). 0: still joining (a PSP joins its first Wi-Fi setting in a few
 *  seconds), -1: no network (error() says why). A desktop is always up. */
export function up(): i32 { return N.up(); }
/** This machine's IPv4 address on the LAN ('' until up() answers 1). */
export function address(): string { return N.address(); }
/** The broadcast address of a home LAN (/24) around address(): a.b.c.255; '255.255.255.255' when the address is unknown. */
export function broadcastAddress(): string {
  const a = N.address();
  const cut = a.lastIndexOf('.');
  return cut > 0 && a !== '127.0.0.1' ? a.slice(0, cut) + '.255' : '255.255.255.255';
}
/** The last failure, e.g. 'bind: Address already in use'. */
export function error(): string { return N.error(); }

export class Datagram {
  text: string; address: string; port: i32;
  constructor(text: string, address: string, port: i32) { this.text = text; this.address = address; this.port = port; }
}

/** A UDP endpoint: send() to an address (or a broadcast address), receive() what arrived, one datagram per call. */
export class UdpSocket {
  handle: i32;
  constructor(handle: i32) { this.handle = handle; }
  get port(): i32 { return N.port(this.handle); }
  send(host: string, port: i32, text: string): boolean { return N.send(this.handle, host, port, text); }
  /** The next datagram, null when none is waiting. */
  receive(): Datagram | null {
    const t = N.recv(this.handle);
    return t.length === 0 ? null : new Datagram(t, N.from(), N.fromPort());
  }
  close(): void { N.close(this.handle); this.handle = -1; }
}
/** A UDP endpoint on `port` (0: any free port), broadcasts allowed. Throws when the port cannot be bound. */
export function udp(port: i32 = 0): UdpSocket {
  const h = N.udp(port);
  if (h < 0) throw new Error('zinc:lan: ' + N.error());
  return new UdpSocket(h);
}

export const CONNECTING: i32 = 0, OPEN: i32 = 1, CLOSED: i32 = -1;
/** A TCP connection: state() is CONNECTING, OPEN or CLOSED; write() queues text, read() takes what arrived ('' when nothing). */
export class TcpSocket {
  handle: i32;
  constructor(handle: i32) { this.handle = handle; }
  state(): i32 { return N.state(this.handle); }
  /** How many bytes went out (0 while connecting or when the buffer is full, -1 closed). */
  write(text: string): i32 { return N.write(this.handle, text); }
  read(): string { return N.read(this.handle); }
  close(): void { N.close(this.handle); this.handle = -1; }
}
/** Starts a TCP connection without waiting (state() says when it is open). Throws on an address it cannot use. */
export function connect(host: string, port: i32): TcpSocket {
  const h = N.connect(host, port);
  if (h < 0) throw new Error('zinc:lan: ' + N.error());
  return new TcpSocket(h);
}
export class TcpServer {
  handle: i32;
  constructor(handle: i32) { this.handle = handle; }
  get port(): i32 { return N.port(this.handle); }
  /** A connection that arrived, null when none. */
  accept(): TcpSocket | null { const h = N.accept(this.handle); return h < 0 ? null : new TcpSocket(h); }
  close(): void { N.close(this.handle); this.handle = -1; }
}
/** A TCP server on every interface (port 0: any free port). Throws when the port cannot be bound. */
export function listen(port: i32): TcpServer {
  const h = N.listen(port);
  if (h < 0) throw new Error('zinc:lan: ' + N.error());
  return new TcpServer(h);
}
