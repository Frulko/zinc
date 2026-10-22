// The kit's pieces on LVGL objects: a card, a caption, a row of a label and a value, a badge. Each returns the handle of the object it made.
import * as lv from 'zinc:lvgl';
import { COLOR_BORDER, COLOR_CARD, COLOR_MUTED_TEXT, COLOR_TEXT } from '../constants';

/** A column with the card's look; children go in it. */
export function card(parent: i32): i32 {
  const c = lv.obj(parent);
  lv.size(c, lv.pct(100), lv.SIZE_CONTENT);
  lv.bg(c, COLOR_CARD, 0);
  lv.border(c, 1, COLOR_BORDER, 0);
  lv.radius(c, 8, 0);
  lv.pad(c, 10);
  lv.gap(c, 8, 8);
  lv.flex(c, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_START);
  lv.flag(c, lv.FLAG_SCROLLABLE, false);
  return c;
}

/** A transparent row of children, spread out. */
export function row(parent: i32): i32 {
  const r = lv.obj(parent);
  lv.size(r, lv.pct(100), lv.SIZE_CONTENT);
  lv.style(r, lv.BG_OPA, 0, 0);
  lv.style(r, lv.BORDER_WIDTH, 0, 0);
  lv.pad(r, 0);
  lv.gap(r, 6, 6);
  lv.flex(r, lv.FLEX_ROW, lv.FLEX_SPACE_BETWEEN, lv.FLEX_CENTER);
  lv.flag(r, lv.FLAG_SCROLLABLE, false);
  return r;
}

/** The small grey title of a card. */
export function caption(parent: i32, text: string): i32 {
  const t = lv.label(parent, text);
  lv.font(t, 12);
  lv.textColor(t, COLOR_MUTED_TEXT, 0);
  return t;
}

export function text(parent: i32, s: string, px: i32, rgb: i32): i32 {
  const t = lv.label(parent, s);
  lv.font(t, px);
  lv.textColor(t, rgb, 0);
  return t;
}

/** A label on the left and a value on the right: the value's handle, to update it. */
export function infoRow(parent: i32, name: string, value: string): i32 {
  const r = row(parent);
  text(r, name, 12, COLOR_MUTED_TEXT);
  return text(r, value, 12, COLOR_TEXT);
}

/** A small coloured pill with a text: the label's handle. */
export function badge(parent: i32, s: string, bg: i32, fg: i32): i32 {
  const b = lv.obj(parent);
  lv.size(b, lv.SIZE_CONTENT, lv.SIZE_CONTENT);
  lv.bg(b, bg, 0);
  lv.style(b, lv.BORDER_WIDTH, 0, 0);
  lv.radius(b, 6, 0);
  lv.style(b, lv.PAD_LEFT, 6, 0);
  lv.style(b, lv.PAD_RIGHT, 6, 0);
  lv.style(b, lv.PAD_TOP, 2, 0);
  lv.style(b, lv.PAD_BOTTOM, 2, 0);
  lv.flag(b, lv.FLAG_SCROLLABLE, false);
  return text(b, s, 12, fg);
}

/** A button filled with `rgb`, or an outline one. */
export function kitButton(parent: i32, label: string, rgb: i32, outline: boolean): i32 {
  const b = lv.button(parent, label);
  lv.size(b, lv.SIZE_CONTENT, 32);
  lv.radius(b, 6, 0);
  lv.style(b, lv.SHADOW_WIDTH, 0, 0);
  lv.style(b, lv.PAD_LEFT, 12, 0);
  lv.style(b, lv.PAD_RIGHT, 12, 0);
  if (outline) {
    lv.style(b, lv.BG_OPA, 0, 0);
    lv.border(b, 1, COLOR_BORDER, 0);
  } else {
    lv.bg(b, rgb, 0);
  }
  return b;
}
