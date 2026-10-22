// The marks the pages draw with: a plain rectangle or dot (an LVGL object with no theme look and no click), a button, a text.
import * as lv from 'zinc:lvgl';
import { BUTTON_H, COLOR_TEXT } from '../constants';

export function mark(parent: i32, w: i32, h: i32, rgb: i32): i32 {
  const o = lv.obj(parent);
  lv.size(o, w, h);
  lv.bg(o, rgb, 0);
  lv.style(o, lv.BORDER_WIDTH, 0, 0);
  lv.radius(o, 0, 0);
  lv.pad(o, 0);
  lv.flag(o, lv.FLAG_CLICKABLE, false);
  lv.flag(o, lv.FLAG_SCROLLABLE, false);
  return o;
}

export function dot(parent: i32, size: i32, rgb: i32): i32 {
  const o = mark(parent, size, size, rgb);
  lv.radius(o, size / 2, 0);
  return o;
}

export function placeDot(o: i32, size: i32, x: number, y: number): void { lv.pos(o, Math.round(x) - size / 2, Math.round(y) - size / 2); }

export function text(parent: i32, s: string, w: i32): i32 {
  const t = lv.label(parent, s);
  lv.size(t, w, lv.SIZE_CONTENT);
  lv.textColor(t, COLOR_TEXT, 0);
  return t;
}

export function button(parent: i32, label: string, w: i32): i32 {
  const b = lv.button(parent, label);
  lv.size(b, w, BUTTON_H);
  lv.style(b, lv.SHADOW_WIDTH, 0, 0);
  lv.font(lv.buttonLabel(b), 12);
  return b;
}

/** A number with `digits` decimals. */
export function fixed(v: number, digits: i32): string { const k = Math.pow(10, digits); return '' + Math.round(v * k) / k; }
/** The same with its sign. */
export function signed(v: number, digits: i32): string { return (v >= 0 ? '+' : '') + fixed(v, digits); }
