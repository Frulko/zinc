// zinc:link native side (link.host.cpp): discovery (DNS-SD _zinclink._tcp), pairing by a short code (TLS 1.2 EC J-PAKE) and sessions by the
// key a pairing gave (TLS 1.3 PSK with ECDHE), on the protocol of `zinc agent` (docs/plugins/link.md). Everything runs on the program's
// thread: non-blocking sockets read when index.ts asks for the next event on a timer (no thread, so mbedTLS is never entered twice at
// once, and no native callback, which the QuickJS engine lacks). index.ts holds the policy (reconnecting, the list of instances seen).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** This program's identity and paired peers, kept in `store` (a file, mode 0600; '' for $ZINC_HOME/link/<app name>.keys), presented
   *  as `name`. Its id (16 hex digits). Again: a new store or name. */
  init(store: string, name: string): string;
  /** A TCP server for pairings and sessions on `port` (0: any free one); the port, or -1 (error()). Again: the same port. */
  listen(port: i32): i32;
  /** Announces the server as `name` for `service` ("notify": the instance answers _zinclink._tcp with TXT svc=notify), '' stops.
   *  False when the machine has no multicast. */
  advertise(service: string, name: string): boolean;
  /** One question for the instances of `service` ('' stops browsing); FOUND events follow, one per answer. */
  browse(service: string): boolean;
  /** A new 6-digit code for one peer, five minutes, three tries; it replaces an open one. '' when the server is not listening. */
  openPairing(): string;
  closePairing(): void;
  /** Pairs with the server at host:port with its code: a handle that ends with PAIRED or CLOSE. -1: see error(). */
  pair(host: string, port: i32, code: string): i32;
  /** A session with the paired `peer` (its id) at host:port: OPEN, then MESSAGE and BYTES, then CLOSE. -1: not paired (error()). */
  connect(host: string, port: i32, peer: string): i32;
  /** A JSON text; false when the session is not open. */
  send(h: i32, text: string): boolean;
  /** Bytes with a kind of 0 to 255, at most 1 MiB; false when the session is not open or the bytes are too many. */
  sendBytes(h: i32, kind: i32, data: u8[]): boolean;
  /** Ends a session or a pairing; no CLOSE event for it. */
  close(h: i32): void;
  /** The paired peers: a JSON array of {id, name, host, port, service}; host is '' for a peer that connects to this program. */
  peers(): string;
  /** Forgets a peer: its key is gone, its open sessions closed. */
  forget(peer: string): boolean;
  /** This machine's IPv4 addresses on its networks, comma-separated: what a user types on the other side when discovery is blocked. */
  addresses(): string;
  error(): string;
  /** The next event, '' when there is none (it first does what the sockets ask for): kind \u001f handle \u001f text. */
  next(): string;
  /** The bytes of the last BYTES event next() returned. */
  bytes(): u8[];
  /* Events: kind 0 FOUND (text: JSON {name, host, port, id, service, pairing}), 1 PAIRED (h: the pairing's handle, -1 on the server; text: the
   *  peer's JSON), 2 OPEN (a session this program started; text: the peer), 3 ACCEPT (a session a peer started, h new; text: the peer),
   *  4 MESSAGE (text), 5 BYTES (text: the kind, bytes), 6 CLOSE (text: the reason, '' when the peer ended it), 7 PAIRING (h -1, the server's
   *  pairing: text "try 1", "try 2", "closed" after three wrong codes or five minutes). */
}
export default requireNative<Spec>('Link');
