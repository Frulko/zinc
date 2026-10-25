// Native side of zinc:lan: polled IPv4 sockets (UDP datagrams with broadcast, TCP streams) that never block and need no event loop, so the
// same calls run on a desktop and in a console core (PSP, PS Vita, 3DS), where nothing calls a program back. lan.abi.cpp implements it on the
// native ABI (include/zn/native.h) over BSD sockets: the plugin's library on the computer, linked into the console cores (targets/console).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Brings the network up, a step per call: 1 up, 0 still joining (a console joins its first Wi-Fi setting), -1 no network (see error()). */
  up(): i32;
  /** This machine's IPv4 address on the LAN ('' until up() answers 1). */
  address(): string;
  /** A UDP endpoint on every interface, `port` (0: any free one), broadcasts allowed; -1: see error(). */
  udp(port: i32): i32;
  /** One datagram to an IPv4 address ('255.255.255.255' broadcasts); false when it could not go. */
  send(h: i32, host: string, port: i32, data: string): boolean;
  /** The next datagram waiting on `h`, '' when there is none (never waits); its sender in from() and fromPort(). */
  recv(h: i32): string;
  from(): string;
  fromPort(): i32;
  /** A TCP connection, started without waiting: state() says when it is open; -1: see error(). */
  connect(host: string, port: i32): i32;
  /** A TCP server on every interface; accept() takes its connections. -1: see error(). */
  listen(port: i32): i32;
  /** A waiting connection of a listen() handle (a new handle), -1 when none. */
  accept(h: i32): i32;
  /** 0 connecting, 1 open, -1 closed or failed (error()). */
  state(h: i32): i32;
  /** Queues text on a TCP connection; how many bytes it took (-1: closed). */
  write(h: i32, data: string): i32;
  /** What arrived on a TCP connection since the last read, '' when nothing. */
  read(h: i32): string;
  /** The local port of a handle. */
  port(h: i32): i32;
  close(h: i32): void;
  error(): string;
}
export default requireNative<Spec>('Lan');
