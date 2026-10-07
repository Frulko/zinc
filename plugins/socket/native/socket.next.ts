// zinc:socket native side for the Zinc Next engine: the Spec of socket.spec.ts over the sockets of the host's loop (libuv, src/host/sock.cpp) instead of
// a poller of BSD sockets. Events arrive as raw strings (bytes unchanged) and become byte arrays here.
import * as host from 'zinc:__sock';
import { utf8Encode } from 'zinc:sys';

type Cb = (h: i32, kind: i32, a: i32, text: string, bytes: u8[]) => void;
const NONE: u8[] = [];

export default {
  connect(h: string, port: i32): i32 { return host.connect(h, port); },
  connectUnix(path: string): i32 { return host.connectUnix(path); },
  listen(h: string, port: i32): i32 { return host.listen(h, port); },
  listenUnix(path: string): i32 { return host.listenUnix(path); },
  udp(h: string, port: i32): i32 { return host.udp(h, port); },
  write(h: i32, data: u8[]): boolean { return host.write(h, data); },
  writeText(h: i32, data: string): boolean { return host.writeText(h, data); },
  sendTo(h: i32, to: string, port: i32, data: u8[]): boolean { return host.sendTo(h, to, port, data); },
  end(h: i32): void { host.end(h); },
  close(h: i32): void { host.close(h); },
  localPort(h: i32): i32 { return host.localPort(h); },
  remoteAddress(h: i32): string { return host.remoteAddress(h); },
  remotePort(h: i32): i32 { return host.remotePort(h); },
  lookup(name: string): i32 { return host.lookup(name); },
  error(): string { return host.error(); },
  onEvent(cb: Cb): void {
    host.onEvent((h: i32, kind: i32, data: string) => {
      if (kind < 50 || kind > 57) return;
      const k = kind - 50;
      if (k === 0) cb(h, 0, 0, '', utf8Encode(host.payload()));
      else if (k === 2) cb(h, 2, parseInt(data), '', NONE);
      else if (k === 5) {
        const i1 = data.indexOf('\u001e');
        cb(h, 5, parseInt(data.slice(i1 + 1)), data.slice(0, i1), utf8Encode(host.payload()));
      } else cb(h, k, 0, data, NONE);
    });
  },
};
