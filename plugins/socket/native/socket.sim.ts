// zinc:socket on the sim target: Node's net, dgram and dns with the same events as socket.host.cpp.
import * as net from 'node:net';
import * as dgram from 'node:dgram';
import * as dns from 'node:dns';

type Cb = (h: number, kind: number, a: number, text: string, bytes: number[]) => void;
const DATA = 0, OPEN = 1, ACCEPT = 2, CLOSE = 3, ERROR = 4, DGRAM = 5, LOOKUP = 6, LOOKUP_ERROR = 7;
const hs: (net.Socket | net.Server | dgram.Socket | null)[] = [];
let cb: Cb | null = null;
let err = '';
let nextLookup = 1;
const emit = (h: number, kind: number, a = 0, text = '', bytes: number[] = []): void => { cb?.(h, kind, a, text, bytes); };
const alloc = (x: net.Socket | net.Server | dgram.Socket): number => {
  let h = hs.indexOf(null);
  if (h < 0) { h = hs.length; hs.push(null); }
  hs[h] = x;
  return h;
};
const v4 = (a: string | undefined): string => (a ?? '').replace(/^::ffff:/, '');

function wire(h: number, s: net.Socket, target: string, connecting: boolean): void {
  s.setNoDelay(true);
  if (connecting) s.on('connect', () => { if (hs[h] === s) emit(h, OPEN); });
  s.on('data', (b: Buffer) => { if (hs[h] === s) emit(h, DATA, 0, '', Array.from(b)); });
  s.on('error', (e: NodeJS.ErrnoException) => {
    if (hs[h] !== s) return;
    if (s.connecting || connecting && !s.remoteAddress) { hs[h] = null; emit(h, ERROR, 0, `connect ${e.code ?? 'EIO'} ${target}`); return; }
    emit(h, ERROR, 0, `read ${e.code ?? 'EIO'}`);
  });
  s.on('close', () => { if (hs[h] === s) { hs[h] = null; emit(h, CLOSE); } });
}
function connectWith(opts: net.NetConnectOpts, target: string): number {
  const s = net.createConnection(opts);
  const h = alloc(s);
  wire(h, s, target, true);
  return h;
}
function listenOn(srv: net.Server, what: string, go: () => void): number {
  const h = alloc(srv);
  srv.on('connection', (c: net.Socket) => {
    if (hs[h] !== srv) { c.destroy(); return; }
    const nh = alloc(c);
    wire(nh, c, '', false);
    emit(h, ACCEPT, nh);
  });
  srv.on('listening', () => { if (hs[h] === srv) emit(h, OPEN); });
  srv.on('error', (e: NodeJS.ErrnoException) => { if (hs[h] === srv) { hs[h] = null; emit(h, ERROR, 0, `listen ${e.code} ${what}`); } });
  go();
  return h;
}

export default {
  connect(host: string, port: number): number {
    const ip = net.isIP(host) ? host : host === 'localhost' ? '127.0.0.1' : host;
    return connectWith({ host: ip, port, family: net.isIP(ip) === 6 ? 6 : 4 }, `${ip}:${port}`);
  },
  connectUnix(path: string): number { return connectWith({ path }, path); },
  listen(host: string, port: number): number {
    const srv = net.createServer();
    return listenOn(srv, `${host || '0.0.0.0'}:${port}`, () => srv.listen(port, host || '0.0.0.0'));
  },
  listenUnix(path: string): number {
    const srv = net.createServer();
    return listenOn(srv, path, () => srv.listen(path));
  },
  udp(host: string, port: number): number {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const h = alloc(s);
    s.on('message', (b: Buffer, r: dgram.RemoteInfo) => { if (hs[h] === s) emit(h, DGRAM, r.port, v4(r.address), Array.from(b)); });
    s.on('listening', () => { if (hs[h] === s) emit(h, OPEN); });
    s.on('error', (e: NodeJS.ErrnoException) => { if (hs[h] === s) { hs[h] = null; emit(h, ERROR, 0, `bind ${e.code} ${host || '0.0.0.0'}:${port}`); } });
    s.bind(port, host || '0.0.0.0');
    return h;
  },
  write(h: number, data: number[]): boolean { const s = hs[h]; if (!(s instanceof net.Socket) || s.writableEnded) return false; s.write(Uint8Array.from(data)); return true; },
  writeText(h: number, data: string): boolean { const s = hs[h]; if (!(s instanceof net.Socket) || s.writableEnded) return false; s.write(data); return true; },
  sendTo(h: number, host: string, port: number, data: number[]): boolean {
    const s = hs[h];
    if (!(s instanceof dgram.Socket)) return false;
    s.send(Uint8Array.from(data), port, host === 'localhost' ? '127.0.0.1' : host);
    return true;
  },
  end(h: number): void { const s = hs[h]; if (s instanceof net.Socket) s.end(); },
  close(h: number): void {
    const s = hs[h];
    hs[h] = null;
    if (s instanceof net.Socket) s.destroy();
    else if (s instanceof net.Server) s.close();
    else if (s instanceof dgram.Socket) s.close();
  },
  localPort(h: number): number {
    const s = hs[h];
    if (s instanceof net.Server) { const a = s.address(); return a && typeof a === 'object' ? a.port : 0; }
    if (s instanceof net.Socket) return s.localPort ?? 0;
    if (s instanceof dgram.Socket) { try { return s.address().port; } catch { return 0; } }
    return 0;
  },
  remoteAddress(h: number): string { const s = hs[h]; return s instanceof net.Socket ? v4(s.remoteAddress) : ''; },
  remotePort(h: number): number { const s = hs[h]; return s instanceof net.Socket ? s.remotePort ?? 0 : 0; },
  lookup(host: string): number {
    const id = nextLookup++;
    dns.lookup(host, { all: true }, (e, addrs) => {
      if (e) emit(id, LOOKUP_ERROR, 0, `getaddrinfo ENOTFOUND ${host}`);
      else emit(id, LOOKUP, 0, [...new Set(addrs.map(a => a.address))].join(','));
    });
    return id;
  },
  error(): string { return err; },
  onEvent(f: Cb): void { cb = f; },
};
