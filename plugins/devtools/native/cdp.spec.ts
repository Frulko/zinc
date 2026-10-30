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
  /** Read-only live resource counters (Zinc Next); {} on hosts without instrumentation. */
  resourceStats(): string;
  /** The frame on screen as a base64 PNG, shrunk to fit maxW x maxH (0: full size); '' when there is none. */
  screenshot(maxW: i32, maxH: i32): string;
  /** Profiler spans (runtime/gfx.cpp): true starts collecting (returns ''), false returns them as a JSON array of
   *  Chrome trace events. */
  trace(on: boolean): string;
  /** The host's network log (Zinc Next, src/host/netlog.h): op 0 starts recording (the program's own connections to the inspector's port are left out), 1 returns the queued Network events (one JSON
   *  object per line), 2 the result of Network.getResponseBody and 3 of Network.getRequestPostData (arg: the request id), 9 the log as HAR, 10 the events of
   *  every request so far (a client that enables Network late). '' where there is no log. */
  net(op: i32, arg: string): string;
}
export default requireNative<Spec>('Cdp');
