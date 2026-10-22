// zinc:qrcode — QR codes from text (docs/plugins/qrcode.md), on Nayuki's QR Code generator in C (vendor/): one C file on the native ABI
// (native/qrcode.abi.c), the same on the computer and in the ESP32's mquickjs firmware.
import N from './native/qrcode.spec';

/** Error correction: the share of the code that can be lost (about 7%, 15%, 25%, 30%); more of it makes a bigger code. */
export const LOW: i32 = 0;
export const MEDIUM: i32 = 1;
export const QUARTILE: i32 = 2;
export const HIGH: i32 = 3;

export class QrCode {
  /** Modules per side: 21 for version 1, 4 more per version. */
  size: i32;
  bits: u8[];
  row: i32;
  constructor(bits: u8[]) {
    this.bits = bits;
    this.size = bits[0];
    this.row = (this.size + 7) >> 3;
  }
  /** Whether the module at (x, y) is dark; false outside the code. */
  module(x: i32, y: i32): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return ((this.bits[1 + y * this.row + (x >> 3)] >> (7 - (x & 7))) & 1) === 1;
  }
  /** The dark runs of row `y`: start, length, start, length... One rectangle per run draws the code in far fewer calls than one per module. */
  runs(y: i32): i32[] {
    const out: i32[] = [];
    let start: i32 = -1;
    for (let x: i32 = 0; x <= this.size; x++) {
      const dark = x < this.size && this.module(x, y);
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) { out.push(start); out.push(x - start); start = -1; }
    }
    return out;
  }
}

/** The QR code of `text` (UTF-8). Throws a RangeError when the text does not fit in version `maxVersion` (1 to 20; 20 holds about 660 bytes at MEDIUM). */
export function encode(text: string, ecc: i32 = MEDIUM, maxVersion: i32 = 20): QrCode {
  const bits = N.encode(text, ecc, maxVersion);
  if (bits.length === 0) throw new RangeError('zinc:qrcode: ' + text.length + ' characters do not fit in a QR code of version ' + maxVersion);
  return new QrCode(bits);
}

/** The text a phone's camera reads as "join this Wi-Fi network" (no password when `password` is ''). */
export function wifiText(ssid: string, password: string): string {
  const esc = (s: string): string => s.replace(/([\;,:"])/g, '\\$1');
  return 'WIFI:T:' + (password === '' ? 'nopass' : 'WPA') + ';S:' + esc(ssid) + ';' + (password === '' ? '' : 'P:' + esc(password) + ';') + ';';
}
