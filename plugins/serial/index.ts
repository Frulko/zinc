// zinc:serial — serial ports, for an Arduino, an ESP32, a micro:bit or any device on a USB serial adapter (docs/plugins/serial.md).
// The native side (native/serial.spec.ts) never waits; this file polls the open ports every few milliseconds and calls the handlers.
import { utf8Encode, utf8Decode } from 'zinc:sys';
import S from './native/serial.spec';

/** How often the open ports are read. A board that sends 100 lines a second is read as it sends; lower costs more wake-ups. */
const POLL_MS = 5;

/** A line longer than this is given in pieces: a device that never sends a line end must not fill the memory. */
const MAX_LINE = 65536;

/** The serial ports present now, as the paths open() takes. macOS: '/dev/cu.usbmodem14101'; Linux: '/dev/ttyACM0', '/dev/ttyUSB0'. */
export function list(): string[] { return S.list().split('\n').filter((p: string) => p !== ''); }

export class SerialPort {
  path: string; baud: i32;
  private handle: i32;
  private open_: boolean = true;
  private dataCbs: ((bytes: u8[]) => void)[] = [];
  private lineCbs: ((line: string) => void)[] = [];
  private closeCbs: ((unplugged: boolean) => void)[] = [];
  private partial: u8[] = [];   // the line being received
  constructor(path: string, baud: i32, handle: i32) { this.path = path; this.baud = baud; this.handle = handle; }
  /** False after close() and once the device is gone. */
  get isOpen(): boolean { return this.open_; }
  /** The bytes written that the port has not taken yet. */
  get pending(): i32 { return this.open_ ? S.pending(this.handle) : 0; }
  /** Every chunk of bytes as it arrives (a chunk is what was there, not a message). */
  onData(cb: (bytes: u8[]) => void): SerialPort { this.dataCbs.push(cb); return this; }
  /** Every complete line of text, without its end ('\n' or '\r\n', what Serial.println sends). */
  onLine(cb: (line: string) => void): SerialPort { this.lineCbs.push(cb); return this; }
  /** Once, when the port closes: `unplugged` is true when the device went away, false after close(). */
  onClose(cb: (unplugged: boolean) => void): SerialPort { this.closeCbs.push(cb); return this; }
  /** Sends text (UTF-8). It adds no line end: `port.write('on\n')`. False when the port is closed or gone. */
  write(text: string): boolean { return this.writeBytes(utf8Encode(text)); }
  writeBytes(bytes: u8[]): boolean { return this.open_ && S.write(this.handle, bytes); }
  /** The DTR and RTS lines. Most Arduino boards restart when DTR goes from true to false. */
  setSignals(dtr: boolean, rts: boolean): boolean { return this.open_ && S.setSignals(this.handle, dtr, rts); }
  close(): void { this.end(false); }

  private end(unplugged: boolean): void {
    if (!this.open_) return;
    this.open_ = false;
    S.close(this.handle);
    const i = ports.indexOf(this);
    if (i >= 0) ports.splice(i, 1);
    if (ports.length === 0 && timer >= 0) { clearInterval(timer); timer = -1; }
    const cbs = this.closeCbs;
    this.dataCbs = []; this.lineCbs = []; this.closeCbs = [];
    for (const cb of cbs) cb(unplugged);
  }
  /** Reads what arrived and calls the handlers; called by the plugin's timer. */
  poll(): void {
    if (!this.open_) return;
    const bytes = S.read(this.handle);
    if (bytes.length > 0) {
      for (const cb of this.dataCbs) cb(bytes);
      if (this.lineCbs.length > 0) for (const b of bytes) {
        if (b !== 10) { this.partial.push(b); if (this.partial.length < MAX_LINE) continue; }
        else if (this.partial.length > 0 && this.partial[this.partial.length - 1] === 13) this.partial.pop();
        const line = utf8Decode(this.partial);
        this.partial = [];
        for (const cb of this.lineCbs) cb(line);
      }
    }
    if (this.open_ && !S.alive(this.handle)) this.end(true);
  }
}

const ports: SerialPort[] = [];
let timer: i32 = -1;

/** Opens a port. `framing` is data bits, parity (N none, E even, O odd) and stop bits, as on every datasheet: '8N1' (what Arduino's
 *  Serial.begin(baud) uses), '7E1', '8N2'. Throws an Error that names the port and the reason (no such device, busy, permission denied). */
export function open(path: string, baud: i32 = 9600, framing: string = '8N1'): SerialPort {
  const parity = framing.length === 3 ? 'NOE'.indexOf(framing[1].toUpperCase()) : -1;
  if (parity < 0) throw new Error(`serial: ${path}: framing '${framing}' is not of the form '8N1'`);
  const h = S.open(path, baud, parseInt(framing[0]), parity, parseInt(framing[2]));
  if (h < 0) throw new Error('serial: ' + S.error());
  const p = new SerialPort(path, baud, h);
  ports.push(p);
  if (timer < 0) timer = setInterval(() => { for (const q of ports.slice()) q.poll(); }, POLL_MS);
  return p;
}
