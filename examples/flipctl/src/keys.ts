// Layout-independent keyboard: zinc:gfx names keys by what they type ('z' on AZERTY is where 'w' is on QWERTY), so both
// ZQSD and WASD are bound, next to the arrows, F1-F5 for the five soft keys under the panel, and the paging keys.
import { keyCount, keyKind, keyName, KeyKind, modifiers } from 'zinc:gfx';

export const NONE: i32 = 0;
export const UP: i32 = 1;
export const DOWN: i32 = 2;
export const LEFT: i32 = 3;
export const RIGHT: i32 = 4;
export const OK: i32 = 5;
export const BACK: i32 = 6;
export const PAGE_UP: i32 = 7;
export const PAGE_DOWN: i32 = 8;
export const HOME: i32 = 9;
export const END: i32 = 10;
export const SOFT0: i32 = 11;   // F1..F5: SOFT0 + slot
export const HOME_SCREEN: i32 = 16;

export function actionOf(k: string, shift: boolean): i32 {
  if (k === 'ArrowUp' || k === 'z' || k === 'w' || k === 'k') return UP;
  if (k === 'ArrowDown' || k === 's' || k === 'j') return DOWN;
  if (k === 'ArrowLeft' || k === 'q' || k === 'a' || k === 'h') return LEFT;
  if (k === 'ArrowRight' || k === 'd' || k === 'l') return RIGHT;
  if (k === 'Tab') return shift ? UP : DOWN;
  if (k === 'Enter' || k === ' ') return OK;
  if (k === 'Escape' || k === 'Backspace') return BACK;
  if (k === 'PageUp') return PAGE_UP;
  if (k === 'PageDown') return PAGE_DOWN;
  if (k === 'Home') return HOME;
  if (k === 'End') return END;
  if (k === 'F1') return SOFT0;
  if (k === 'F2') return SOFT0 + 1;
  if (k === 'F3') return SOFT0 + 2;
  if (k === 'F4') return SOFT0 + 3;
  if (k === 'F5') return SOFT0 + 4;
  if (k === 'm' || k === 'F10') return HOME_SCREEN;   // straight back to the idle screen from anywhere
  return NONE;
}

/** The actions of this frame, in order (key downs and repeats: holding an arrow scrolls). */
export function readActions(): i32[] {
  const out: i32[] = [];
  const shift = (modifiers() & 1) !== 0;
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Up || keyKind(i) === KeyKind.Text) continue;
    const a = actionOf(keyName(i), shift);
    if (a !== NONE) out.push(a);
  }
  return out;
}
