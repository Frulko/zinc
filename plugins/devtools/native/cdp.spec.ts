// Transport of the DevTools protocol: HTTP discovery (/json/list, /json/version) and WebSocket framing on a port,
// console mirroring (Runtime.consoleAPICalled). Messages are handed to Zinc as text; replies go back through send.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Listens on 127.0.0.1:port; onMessage(client, json) for every WebSocket text message. */
  listen(port: i32, onMessage: (client: i32, msg: string) => void): boolean;
  /** Sends a text message to a client (-1: every client). */
  send(client: i32, msg: string): void;
  /** Number value of the first `"key":` in a JSON message (0 when absent). */
  num(msg: string, key: string): f64;
  /** String value of the first `"key":` in a JSON message ('' when absent). */
  str(msg: string, key: string): string;
  /** Connected WebSocket clients. */
  clients(): i32;
  /** The frame on screen as a base64 PNG, shrunk to fit maxW x maxH (0: full size); '' when there is none. */
  screenshot(maxW: i32, maxH: i32): string;
  /** Profiler spans (runtime/gfx.cpp): true starts collecting (returns ''), false returns them as a JSON array of
   *  Chrome trace events. */
  trace(on: boolean): string;
}
export default requireNative<Spec>('Cdp');
