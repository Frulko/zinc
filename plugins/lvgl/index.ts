// zinc:lvgl — LVGL 9 from TypeScript (docs/plugins/lvgl.md): the widgets, flex layout, scrolling, animations and drawing are LVGL's, in C;
// the program holds handles (i32) and reads events. The same program runs on the computer and on the ESP32 under mquickjs, where LVGL
// draws straight to the panel and its objects live outside the JavaScript heap.
//
//   import * as lv from 'zinc:lvgl';
//   lv.start(240, 320, true, 0x3b82f6);
//   const s = lv.slider(lv.screen(), 0, 100, 40);
//   lv.on(s, lv.EVENT_VALUE_CHANGED, () => console.log('value ' + lv.value(s)));
//   lv.run(null);
import { onFrame, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import L from './native/lvgl.spec';
import { originX, originY, present, showDisplay } from './display';

function k(name: string): i32 { return L.constant(name); }

// LVGL's constants, by their LVGL names without LV_
export const PART_MAIN: i32 = k('PART_MAIN');
export const PART_SCROLLBAR: i32 = k('PART_SCROLLBAR');
export const PART_INDICATOR: i32 = k('PART_INDICATOR');
export const PART_KNOB: i32 = k('PART_KNOB');
export const PART_SELECTED: i32 = k('PART_SELECTED');
export const PART_ITEMS: i32 = k('PART_ITEMS');
export const STATE_DEFAULT: i32 = k('STATE_DEFAULT');
export const STATE_CHECKED: i32 = k('STATE_CHECKED');
export const STATE_PRESSED: i32 = k('STATE_PRESSED');
export const STATE_DISABLED: i32 = k('STATE_DISABLED');
export const STATE_FOCUSED: i32 = k('STATE_FOCUSED');
export const EVENT_CLICKED: i32 = k('EVENT_CLICKED');
export const EVENT_SHORT_CLICKED: i32 = k('EVENT_SHORT_CLICKED');
export const EVENT_LONG_PRESSED: i32 = k('EVENT_LONG_PRESSED');
export const EVENT_PRESSED: i32 = k('EVENT_PRESSED');
export const EVENT_RELEASED: i32 = k('EVENT_RELEASED');
export const EVENT_VALUE_CHANGED: i32 = k('EVENT_VALUE_CHANGED');
export const EVENT_SCROLL: i32 = k('EVENT_SCROLL');
export const FLAG_HIDDEN: i32 = k('OBJ_FLAG_HIDDEN');
export const FLAG_CLICKABLE: i32 = k('OBJ_FLAG_CLICKABLE');
export const FLAG_CHECKABLE: i32 = k('OBJ_FLAG_CHECKABLE');
export const FLAG_SCROLLABLE: i32 = k('OBJ_FLAG_SCROLLABLE');
export const FLAG_SCROLL_ELASTIC: i32 = k('OBJ_FLAG_SCROLL_ELASTIC');
export const FLAG_SCROLL_MOMENTUM: i32 = k('OBJ_FLAG_SCROLL_MOMENTUM');
export const FLAG_EVENT_BUBBLE: i32 = k('OBJ_FLAG_EVENT_BUBBLE');
/** Children may draw outside the object: a button that grows when pressed is not cut by its row. */
export const FLAG_OVERFLOW_VISIBLE: i32 = k('OBJ_FLAG_OVERFLOW_VISIBLE');
export const ALIGN_TOP_LEFT: i32 = k('ALIGN_TOP_LEFT');
export const ALIGN_TOP_MID: i32 = k('ALIGN_TOP_MID');
export const ALIGN_TOP_RIGHT: i32 = k('ALIGN_TOP_RIGHT');
export const ALIGN_BOTTOM_LEFT: i32 = k('ALIGN_BOTTOM_LEFT');
export const ALIGN_BOTTOM_MID: i32 = k('ALIGN_BOTTOM_MID');
export const ALIGN_BOTTOM_RIGHT: i32 = k('ALIGN_BOTTOM_RIGHT');
export const ALIGN_LEFT_MID: i32 = k('ALIGN_LEFT_MID');
export const ALIGN_RIGHT_MID: i32 = k('ALIGN_RIGHT_MID');
export const ALIGN_CENTER: i32 = k('ALIGN_CENTER');
export const FLEX_ROW: i32 = k('FLEX_FLOW_ROW');
export const FLEX_COLUMN: i32 = k('FLEX_FLOW_COLUMN');
export const FLEX_ROW_WRAP: i32 = k('FLEX_FLOW_ROW_WRAP');
export const FLEX_START: i32 = k('FLEX_ALIGN_START');
export const FLEX_END: i32 = k('FLEX_ALIGN_END');
export const FLEX_CENTER: i32 = k('FLEX_ALIGN_CENTER');
export const FLEX_SPACE_BETWEEN: i32 = k('FLEX_ALIGN_SPACE_BETWEEN');
export const FLEX_SPACE_EVENLY: i32 = k('FLEX_ALIGN_SPACE_EVENLY');
export const TEXT_LEFT: i32 = k('TEXT_ALIGN_LEFT');
export const TEXT_CENTER: i32 = k('TEXT_ALIGN_CENTER');
export const TEXT_RIGHT: i32 = k('TEXT_ALIGN_RIGHT');
export const CHART_LINE: i32 = k('CHART_TYPE_LINE');
export const CHART_BAR: i32 = k('CHART_TYPE_BAR');
export const SIZE_CONTENT: i32 = k('SIZE_CONTENT');
export const GRAD_VER: i32 = k('GRAD_DIR_VER');
export const BORDER_BOTTOM: i32 = k('BORDER_SIDE_BOTTOM');
export const BORDER_TOP: i32 = k('BORDER_SIDE_TOP');
// style properties
export const X: i32 = k('STYLE_X');
export const Y: i32 = k('STYLE_Y');
export const TRANSLATE_X: i32 = k('STYLE_TRANSLATE_X');
export const TRANSLATE_Y: i32 = k('STYLE_TRANSLATE_Y');
/** In tenths of a degree. */
export const ROTATION: i32 = k('STYLE_TRANSFORM_ROTATION');
/** 256 is the object's own size. */
export const SCALE_X: i32 = k('STYLE_TRANSFORM_SCALE_X');
export const SCALE_Y: i32 = k('STYLE_TRANSFORM_SCALE_Y');
export const WIDTH: i32 = k('STYLE_WIDTH');
export const HEIGHT: i32 = k('STYLE_HEIGHT');
export const RADIUS: i32 = k('STYLE_RADIUS');
export const OPA: i32 = k('STYLE_OPA');
export const PAD_TOP: i32 = k('STYLE_PAD_TOP');
export const PAD_BOTTOM: i32 = k('STYLE_PAD_BOTTOM');
export const PAD_LEFT: i32 = k('STYLE_PAD_LEFT');
export const PAD_RIGHT: i32 = k('STYLE_PAD_RIGHT');
export const PAD_ROW: i32 = k('STYLE_PAD_ROW');
export const PAD_COLUMN: i32 = k('STYLE_PAD_COLUMN');
export const BG_COLOR: i32 = k('STYLE_BG_COLOR');
export const BG_OPA: i32 = k('STYLE_BG_OPA');
export const BG_GRAD_COLOR: i32 = k('STYLE_BG_GRAD_COLOR');
export const BG_GRAD_DIR: i32 = k('STYLE_BG_GRAD_DIR');
export const BORDER_COLOR: i32 = k('STYLE_BORDER_COLOR');
export const BORDER_WIDTH: i32 = k('STYLE_BORDER_WIDTH');
export const BORDER_SIDE: i32 = k('STYLE_BORDER_SIDE');
export const SHADOW_WIDTH: i32 = k('STYLE_SHADOW_WIDTH');
export const TEXT_COLOR: i32 = k('STYLE_TEXT_COLOR');
export const TEXT_ALIGN: i32 = k('STYLE_TEXT_ALIGN');
export const ARC_COLOR: i32 = k('STYLE_ARC_COLOR');
export const ARC_WIDTH: i32 = k('STYLE_ARC_WIDTH');
export const LINE_WIDTH: i32 = k('STYLE_LINE_WIDTH');
export const LINE_COLOR: i32 = k('STYLE_LINE_COLOR');
export const LENGTH: i32 = k('STYLE_LENGTH');
export const ANIM_DURATION: i32 = k('STYLE_ANIM_DURATION');
// the paths of animate()
export const LINEAR: i32 = k('ANIM_PATH_LINEAR');
export const EASE_IN: i32 = k('ANIM_PATH_EASE_IN');
export const EASE_OUT: i32 = k('ANIM_PATH_EASE_OUT');
export const EASE_IN_OUT: i32 = k('ANIM_PATH_EASE_IN_OUT');
export const OVERSHOOT: i32 = k('ANIM_PATH_OVERSHOOT');
export const BOUNCE: i32 = k('ANIM_PATH_BOUNCE');
export const STEP: i32 = k('ANIM_PATH_STEP');
export const FOREVER: i32 = -1;

/** Starts LVGL on a w x h display with its default theme (dark or light) and accent colour. */
export function start(w: i32, h: i32, dark: boolean, primary: i32): void {
  L.start(w, h, dark, primary);
  showDisplay(w, h);
}
export function screen(): i32 { return L.screen(); }
/** Turns the display a quarter (0 as started, 1 to 3 clockwise) and lays the screens out again at the turned size: build what depends on
 *  the size again after it. On the board the panel turns, and the touch with it; on the computer the window shows the picture upright. */
export function rotate(quarter: i32): void {
  L.rotate(quarter);
  showDisplay(L.displayWidth(), L.displayHeight());
}
/** The display's width and height, turned (rotate). */
export function width(): i32 { return L.displayWidth(); }
export function height(): i32 { return L.displayHeight(); }
/** LVGL's percentage of the parent, for sizes and positions. */
export function pct(v: i32): i32 { return L.pct(v); }
/** Since the last call: [turns, µs in LVGL, µs of the slowest turn, areas sent, pixels sent, board's free heap, its lowest (-1 on the
 *  computer), LVGL pool in use, pool size, pool peak] (bytes). */
export function stats(): i32[] { return L.stats(); }

// ---- objects
export function obj(parent: i32): i32 { return L.create('obj', parent); }
export function label(parent: i32, text: string): i32 {
  const o = L.create('label', parent);
  L.setText(o, text);
  return o;
}
/** A button with a centred label; the label is the button's first child (`buttonLabel`). */
export function button(parent: i32, text: string): i32 {
  const b = L.create('button', parent);
  const t = L.create('label', b);
  L.setText(t, text);
  L.align(t, ALIGN_CENTER, 0, 0);
  return b;
}
export function slider(parent: i32, min: i32, max: i32, value: i32): i32 {
  const o = L.create('slider', parent);
  L.setRange(o, min, max);
  L.setValue(o, value, false);
  return o;
}
/** LVGL's switch. */
export function toggle(parent: i32, on: boolean): i32 {
  const o = L.create('switch', parent);
  L.state(o, STATE_CHECKED, on);
  return o;
}
export function checkbox(parent: i32, text: string, checked: boolean): i32 {
  const o = L.create('checkbox', parent);
  L.setText(o, text);
  L.state(o, STATE_CHECKED, checked);
  return o;
}
export function arc(parent: i32, min: i32, max: i32, value: i32): i32 {
  const o = L.create('arc', parent);
  L.setRange(o, min, max);
  L.setValue(o, value, false);
  return o;
}
export function bar(parent: i32, min: i32, max: i32, value: i32): i32 {
  const o = L.create('bar', parent);
  L.setRange(o, min, max);
  L.setValue(o, value, false);
  return o;
}
export function chart(parent: i32, type: i32, points: i32, min: i32, max: i32): i32 {
  const o = L.create('chart', parent);
  L.chartSetup(o, type, points, min, max);
  return o;
}
export function chartSeries(chart: i32, rgb: i32): i32 { return L.chartSeries(chart, rgb); }
export function chartPush(chart: i32, series: i32, value: i32): void { L.chartPush(chart, series, value); }
/** Sets point `index` of a series in place (a chart whose points are not pushed: a spectrum's bars). */
export function chartSet(chart: i32, series: i32, index: i32, value: i32): void { L.chartSet(chart, series, index, value); }
/** A Lottie animation of w x h pixels, playing in a loop (LVGL draws a frame only while it is visible). The JSON is a LottieFiles export,
 *  copied: a string constant of the program. The buffer takes w * h * 4 bytes of LVGL's memory; on a board without PSRAM keep it small. */
export function lottie(parent: i32, json: string, w: i32, h: i32): i32 { return L.lottie(parent, json, w, h); }
export function lottiePlay(anim: i32, on: boolean): void { L.lottiePlay(anim, on); }
export function lottieRestart(anim: i32): void { L.lottieRestart(anim); }
export function spinner(parent: i32): i32 { return L.create('spinner', parent); }
/** A matrix of buttons: rows by "\n", keys by "|" ("1|2|3\n4|5|6"). */
export function buttonMatrix(parent: i32, keys: string): i32 {
  const o = L.create('buttonmatrix', parent);
  L.setOptions(o, keys);
  return o;
}
export function led(parent: i32): i32 { return L.create('led', parent); }
/** A roller of rows ("a\nb\nc"). */
export function roller(parent: i32, rows: string): i32 {
  const o = L.create('roller', parent);
  L.setOptions(o, rows);
  return o;
}
/** The child at `index` (0 the first, -1 the last), 0 when there is none. */
export function child(o: i32, index: i32): i32 { return L.child(o, index); }
/** The label of a button made by button(). */
export function buttonLabel(b: i32): i32 { return L.child(b, 0); }
/** Deletes the object and its children, and their handlers: the page a program left gives its memory back. */
export function remove(o: i32): void { L.remove(o); forget(); }
/** Deletes the object's children and their handlers. */
export function clean(o: i32): void { L.clean(o); forget(); }

// ---- layout and style
export function size(o: i32, w: i32, h: i32): void { L.setSize(o, w, h); }
export function pos(o: i32, x: i32, y: i32): void { L.setPos(o, x, y); }
/** The position in the parent, laid out now (an animated object's, a flex child's). */
export function posX(o: i32): i32 { return L.x(o); }
export function posY(o: i32): i32 { return L.y(o); }
export function align(o: i32, where: i32, x: i32, y: i32): void { L.align(o, where, x, y); }
export function flex(o: i32, flow: i32, main: i32, cross: i32): void { L.flex(o, flow, main, cross, cross); }
export function grow(o: i32, g: i32): void { L.flexGrow(o, g); }
/** A style property with a number, on a part and state (`selector`: PART_x | STATE_x, 0 for the main part). */
export function style(o: i32, prop: i32, value: i32, selector: i32): void { L.style(o, prop, value, selector); }
/** A style property with a colour 0xRRGGBB. */
export function color(o: i32, prop: i32, rgb: i32, selector: i32): void { L.styleColor(o, prop, rgb, selector); }
export function bg(o: i32, rgb: i32, selector: i32): void {
  L.styleColor(o, BG_COLOR, rgb, selector);
  L.style(o, BG_OPA, 255, selector);
}
export function textColor(o: i32, rgb: i32, selector: i32): void { L.styleColor(o, TEXT_COLOR, rgb, selector); }
export function pad(o: i32, all: i32): void {
  L.style(o, PAD_TOP, all, 0); L.style(o, PAD_BOTTOM, all, 0); L.style(o, PAD_LEFT, all, 0); L.style(o, PAD_RIGHT, all, 0);
}
export function gap(o: i32, row: i32, column: i32): void { L.style(o, PAD_ROW, row, 0); L.style(o, PAD_COLUMN, column, 0); }
export function radius(o: i32, r: i32, selector: i32): void { L.style(o, RADIUS, r, selector); }
export function border(o: i32, width: i32, rgb: i32, selector: i32): void {
  L.style(o, BORDER_WIDTH, width, selector);
  L.styleColor(o, BORDER_COLOR, rgb, selector);
}
/** Montserrat 12, 14, 20 or 28 px. */
export function font(o: i32, px: i32): void { L.font(o, px, 0); }
export function flag(o: i32, f: i32, on: boolean): void { L.flag(o, f, on); }
export function hidden(o: i32, on: boolean): void { L.flag(o, FLAG_HIDDEN, on); }
export function state(o: i32, s: i32, on: boolean): void { L.state(o, s, on); }
export function hasState(o: i32, s: i32): boolean { return L.hasState(o, s); }

// ---- animations: LVGL runs them in C at every turn, so the program sets one once instead of moving the object every frame
/** Animates a property of the object (X, Y, WIDTH, HEIGHT, TRANSLATE_X, TRANSLATE_Y, OPA, BG_OPA, RADIUS, ROTATION, SCALE_X, SCALE_Y)
 *  from `from` to `to` in `ms`, on a path (EASE_IN_OUT, LINEAR, EASE_OUT, OVERSHOOT, BOUNCE...), after `delay` ms (negative: begun that
 *  far in, so objects move out of step), played `repeat` more times (FOREVER), each play coming back to `from` in `back` ms when it is
 *  not 0. A new animation of the same property replaces the running one; deleting the object ends its animations. */
export function animate(o: i32, prop: i32, from: i32, to: i32, ms: i32, path: i32 = EASE_IN_OUT, delay: i32 = 0, repeat: i32 = 0,
                        back: i32 = 0): void {
  L.animate(o, prop, from, to, ms, delay, path, repeat, back);
}
/** Stops the animation of a property where it is; without a property, all of the object's. */
export function stopAnimation(o: i32, prop: i32 = -1): void { L.stopAnimation(o, prop); }

// ---- values
export function setText(o: i32, text: string): void { L.setText(o, text); }
export function setValue(o: i32, v: i32, animated: boolean): void { L.setValue(o, v, animated); }
/** A slider's, bar's or arc's value, a roller's row; for switches and check boxes 1 when checked. */
export function value(o: i32): i32 { return L.value(o); }
export function checked(o: i32): boolean { return L.hasState(o, STATE_CHECKED); }
export function selected(matrix: i32): i32 { return L.selected(matrix); }
export function buttonText(matrix: i32, i: i32): string { return L.buttonText(matrix, i); }
export function scrollTo(o: i32, x: i32, y: i32, animated: boolean): void { L.scrollTo(o, x, y, animated); }
export function scrollY(o: i32): i32 { return L.scrollY(o); }

// ---- events: handlers in three parallel arrays (mquickjs has no Map); a few dozen at most, scanned per event
const handlerObj: i32[] = [];
const handlerCode: i32[] = [];
const handlerFn: (() => void)[] = [];

/** Calls `fn` on the object's events of `code` (EVENT_CLICKED, EVENT_VALUE_CHANGED...), from run(), after LVGL's turn. */
export function on(o: i32, code: i32, fn: () => void): void {
  L.listen(o, code);
  handlerObj.push(o);
  handlerCode.push(code);
  handlerFn.push(fn);
}

/** Drops the handlers of deleted objects, before a new object can take one of their handles. */
function forget(): void {
  let k = 0;
  for (let i = 0; i < handlerObj.length; i++) {
    if (!L.exists(handlerObj[i])) continue;
    handlerObj[k] = handlerObj[i]; handlerCode[k] = handlerCode[i]; handlerFn[k] = handlerFn[i]; k++;
  }
  handlerObj.length = k; handlerCode.length = k; handlerFn.length = k;
}

function dispatch(): void {
  for (let e = L.nextEvent(); e >= 0; e = L.nextEvent()) {
    const o = (e / 256) | 0, code = e % 256;
    const fns: (() => void)[] = [];   // taken first: a handler may delete objects and add handlers (a page built in their place)
    for (let i = 0; i < handlerObj.length; i++) if (handlerObj[i] === o && handlerCode[i] === code) fns.push(handlerFn[i]);
    for (let i = 0; i < fns.length; i++) fns[i]();
  }
}

/** The frame loop: `each` (or null) with the seconds since the last frame, then LVGL's turn with the pointer, the events, the display. */
let clockRest: number = 0;   // the part of a millisecond LVGL's clock has not been given yet
export function run(each: ((dt: number) => void) | null): void {
  onFrame((dt: number) => {
    if (each !== null) each(dt);
    clockRest += dt * 1000;
    const ms = Math.floor(clockRest);
    clockRest -= ms;
    L.step(ms, (pointerX() | 0) - originX(), (pointerY() | 0) - originY(), pointerDown());
    dispatch();
    present();
  });
}
