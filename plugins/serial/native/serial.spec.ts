// Native side of zinc:serial: ports are handles, nothing blocks. plugins/serial/index.ts wraps them in the SerialPort class and polls read().
// One implementation per platform behind this interface: serial.host.cpp is POSIX termios (macOS, Linux); serial.sim.ts needs no hardware.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The device paths of the serial ports present now, one per line (macOS: /dev/cu.*, Linux: /dev/ttyUSB*, /dev/ttyACM* and the like). */
  list(): string;
  /** Opens a port: `dataBits` 5 to 8, `parity` 0 none, 1 odd, 2 even, `stopBits` 1 or 2. A handle, or -1 (see error()). */
  open(path: string, baud: i32, dataBits: i32, parity: i32, stopBits: i32): i32;
  /** Why the last open() returned -1. */
  error(): string;
  /** The bytes received since the last call ([] when none); also sends what write() could not send at once. */
  read(h: i32): u8[];
  /** False once the port is gone (unplugged, the other end of a pseudo-terminal closed) or for an unknown handle. */
  alive(h: i32): boolean;
  /** Queues the bytes and sends what the port takes now; the rest goes out on the next read(). False when the port is gone. */
  write(h: i32, data: u8[]): boolean;
  /** The bytes written that the port has not taken yet. */
  pending(h: i32): i32;
  /** Sets the DTR and RTS lines (an Arduino resets when DTR falls). False when the port has no such lines. */
  setSignals(h: i32, dtr: boolean, rts: boolean): boolean;
  close(h: i32): void;
}
export default requireNative<Spec>('Serial');
