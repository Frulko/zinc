// zinc:socket native side: non-blocking BSD sockets polled by a zrt::Poller on the event loop (no thread). Every
// socket, server and UDP endpoint is a handle; what happens to it arrives through onEvent (kinds below).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** TCP connection (host name or IP, resolved with getaddrinfo); OPEN or ERROR follows. -1: see error(). */
  connect(host: string, port: i32): i32;
  /** Unix domain stream socket. */
  connectUnix(path: string): i32;
  /** TCP server on host ('' = all interfaces) and port (0 = any free port): OPEN once listening (or ERROR), then
   *  ACCEPT events. -1: see error(). */
  listen(host: string, port: i32): i32;
  listenUnix(path: string): i32;
  /** UDP endpoint bound to host / port (0 = any free port): OPEN once bound (or ERROR), then DGRAM events. */
  udp(host: string, port: i32): i32;
  /** Queues data (sent as soon as the socket takes it); false when the handle is closed. */
  write(h: i32, data: u8[]): boolean;
  writeText(h: i32, data: string): boolean;
  sendTo(h: i32, host: string, port: i32, data: u8[]): boolean;
  /** Half-close (FIN) once the queued data is sent. */
  end(h: i32): void;
  /** Closes now; no CLOSE event for a handle closed this way. */
  close(h: i32): void;
  localPort(h: i32): i32;
  remoteAddress(h: i32): string;
  remotePort(h: i32): i32;
  /** Resolves a host name (getaddrinfo, all addresses); LOOKUP or LOOKUP_ERROR with this request id. */
  lookup(host: string): i32;
  error(): string;
  /** kind 0 DATA (bytes), 1 OPEN (connected / listening / bound), 2 ACCEPT (a = new handle), 3 CLOSE (peer closed
   *  or reset), 4 ERROR (text; after a failed connect, listen or bind the handle is gone), 5 DGRAM (bytes, text =
   *  sender address, a = sender port), 6 LOOKUP (text = addresses joined with ','), 7 LOOKUP_ERROR (text). */
  onEvent(cb: (h: i32, kind: i32, a: i32, text: string, bytes: u8[]) => void): void;
}
export default requireNative<Spec>('Socket');
