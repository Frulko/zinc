// zinc:hash — SHA-256 of bytes and of a file, on mbedTLS through the host (src/host/crypto.cpp): native speed on every engine, and a file of any size
// read in 64 KiB blocks, never loaded whole. The web target's version is hash.browser.ts.
import { op } from 'zinc:__crypto';

const NONE: u8[] = [];
/** The SHA-256 digest (32 bytes) of `data`. */
export function sha256(data: u8[]): u8[] { return op('digest:sha-256', data, NONE, NONE, NONE, 0, 0); }
/** The SHA-256 digest (32 bytes) of the file at `path`, read in blocks (a file of any size). @throws when the file cannot be read */
export function sha256File(path: string): u8[] {
  const d = __host_hashFile('sha-256', path);
  if (__host_fsFailed()) throw new Error(__host_fsError());
  return d;
}
/** Lowercase hex of bytes: toHex(sha256(data)) is the digest as `sha256sum` prints it. */
export function toHex(bytes: u8[]): string {
  const hex = '0123456789abcdef';
  const out: string[] = [];
  for (const x of bytes) { const v: i32 = x; out.push(hex.at(v >> 4)); out.push(hex.at(v & 15)); }
  return out.join('');
}
