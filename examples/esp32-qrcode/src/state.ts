// The text shown and its code, encoded again when the text changes.
import { encode, QrCode } from 'zinc:qrcode';
import { TEXTS } from './constants';

export class State {
  index: i32 = 0;
  code: QrCode = encode(TEXTS[0]);
  encodeMs: number = 0;
  dirty: boolean = true;
}
export const state = new State();

export function show(index: i32): void {
  state.index = index % TEXTS.length;
  const t0 = performance.now();
  state.code = encode(TEXTS[state.index]);
  state.encodeMs = performance.now() - t0;
  console.log('qrcode: "' + TEXTS[state.index] + '" is ' + state.code.size + ' modules a side, encoded in ' + state.encodeMs.toFixed(1) + ' ms');
  state.dirty = true;
}
