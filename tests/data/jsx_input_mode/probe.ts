import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';

export const modes = ['numeric', 'decimal', 'tel', 'email', 'url', 'search', 'text', 'unknown', 'NuMeRiC', ''];
const expected: i32[] = [1, 2, 3, 4, 5, 6, 0, 0, 1, 0];
let reads: i32 = 0;
export function read(mode: string): string { reads++; return mode; }
export function verify(h: i32, step: i32): void {
  equal(ui.fieldMode(h), expected[step], 'inputMode ' + modes[step]);
  equal(reads, step + 1, 'one expression evaluation per apply');
  equal(ui.getValue(h), 'abc123', 'inputMode is a keyboard hint, not validation');
  if (step === modes.length - 1) console.log('jsx-input-mode: pass');
}
