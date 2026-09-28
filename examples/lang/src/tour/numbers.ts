// Numbers: machine integer types (i32, u8, u32) wrap like C, while `number` keeps JavaScript's semantics
// and formatting.
import { section } from '../report';

/** FNV-1a hash of a string, on 32-bit unsigned arithmetic. */
function fnv1a(text: string): u32 {
  let hash: u32 = 2166136261;
  for (const ch of text) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

export function machineIntegers(): void {
  section('Machine integers');
  let big: i32 = 2147483647;
  big = big + 1;                // i32 overflow wraps to the minimum
  console.log('i32 wrap', big);

  const bytes: u8[] = [250, 3];
  const wrapped: u8 = bytes[0] + 10;   // 260 does not fit in a byte: 4
  console.log('u8 wrap', wrapped, 7 / 2, 7 % 3, -7 % 3, 1 << 31, -1 >>> 28);
  console.log('fnv', fnv1a('zinc'));
}

export function numberFormatting(): void {
  section('Number formatting');
  console.log({ x: 1.5, y: -2 }, [[1, 2], [3]], 1 / 3 * 3, 100 / 3, 1e-7, 123e20, 2 ** 10);
  console.log(Math.max(3, 7), Math.round(2.5), Math.round(-2.5));
}
