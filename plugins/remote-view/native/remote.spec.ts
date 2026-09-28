// zinc:remote native side: sessions are handles, polled by the event loop (no threads). Protocol:
// plugins/display-remote/remote_proto.h.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Opens a session; resolves with its handle (decimal string) on the server's HELLO, rejects when the first attempt fails. */
  connect(host: string, port: i32, token: string): Promise<string>;
  /** Reconnect every second after the connection drops (default on). */
  setReconnect(s: i32, on: boolean): void;
  close(s: i32): void;
  connected(s: i32): boolean;
  /** Runtime image holding the remote screen (-1 before the first HELLO). */
  image(s: i32): i32;
  width(s: i32): i32;
  height(s: i32): i32;
  /** Remote app title (from HELLO). */
  name(s: i32): string;
  /** Frames received per second, ping round trip in ms (through the frame stream), received KiB per second. */
  fps(s: i32): f64;
  rtt(s: i32): f64;
  kbps(s: i32): f64;
  frames(s: i32): i32;
  pointer(s: i32, x: f64, y: f64, down: boolean, button: i32): void;
  wheel(s: i32, dy: f64): void;
  /** HalButton bits held (zinc:gfx Btn order). */
  buttons(s: i32, mask: i32): void;
  /** kind: 'open' (HELLO received, also after a reconnect) | 'close' (connection lost). */
  onEvent(cb: (s: i32, kind: string) => void): void;
  /** Starts (or stops) listening for beacons: fields tab-separated (ZINC1, name, target, port, pid, w, h) and the sender. */
  discover(on: boolean, cb: (beacon: string, host: string) => void): void;
}
export default requireNative<Spec>('Remote');
