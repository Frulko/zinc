// Native side of zinc:ble: links are handles and nothing waits on the radio. plugins/ble/index.ts polls events() and read() while something
// is going on, frames the messages and calls the handlers. Records use \u001e between items and \u001f between fields.
// ble.macos.mm is CoreBluetooth's central; ble.sim.ts is a simulated radio with an echo peripheral (ZINC_NATIVE=sim, deterministic runs).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** '' when Bluetooth can be used, else 'off', 'unauthorized', 'unsupported', 'resetting' (not ready yet). It never makes the system ask
   *  for permission where asking would end the process (ble.macos.mm). */
  state(): string;
  /** Starts scanning for devices that advertise the UART service, until stopScan(): 'device' events. */
  scan(): void;
  stopScan(): void;
  /** Connects to a scanned device: a new handle, then an 'open' event (the UART characteristics are ready) or a 'close' event. */
  connect(id: string): i32;
  /** Advertises `name` with the UART service: an 'open' event per central that connects. False when this target cannot. */
  advertise(name: string): boolean;
  /** The largest chunk write() takes on an open link (20 before the MTU exchange). */
  maxWrite(h: i32): i32;
  /** Queues one chunk of at most maxWrite() bytes; false when the link is not open or 1 MiB already waits. */
  write(h: i32, chunk: u8[]): boolean;
  /** The bytes the link received since the last call. */
  read(h: i32): u8[];
  /** Ends a link (no 'close' event follows for it). */
  close(h: i32): void;
  /** Ends scanning, advertising and every link. */
  stop(): void;
  /** What happened since the last call: device -1 id name rssi, open h id name, close h. */
  events(): string;
}
export default requireNative<Spec>('Ble');
