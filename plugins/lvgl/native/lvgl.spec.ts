// Native side of zinc:lvgl: LVGL 9 (vendor/lvgl) behind handles. lvgl.abi.c implements it on the native ABI (include/zn/native.h): the same
// C file is the plugin's library on the computer and goes into the ESP32's mquickjs firmware, where LVGL draws straight to the panel.
// An object is an i32 handle (0: none); the names of LVGL's constants (style properties, flags, states, parts, events, alignments, flex
// values) are looked up once with constant(), so the TypeScript side never copies LVGL's numbers.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Starts LVGL on a width x height display with its default theme (dark or light, `primary` 0xRRGGBB). False when it is started already. */
  start(width: i32, height: i32, dark: boolean, primary: i32): boolean;
  /** One turn: LVGL's clock moved `ms` on (the frame's), the pointer (x, y, down), then its timers, animations and redraw. The milliseconds until
   *  LVGL needs the next turn. */
  step(ms: i32, x: i32, y: i32, down: boolean): i32;
  /** The display as RGBA bytes when it changed since the last call, else empty: the computer shows it as an image. Empty on the ESP32,
   *  where LVGL sends its pixels to the panel itself. */
  frame(): u8[];
  /** What the turns cost since the last call: [turns, microseconds in LVGL, microseconds of the slowest turn, areas sent, pixels sent],
   *  then the ESP32's free heap and its lowest since the start in bytes (-1 on the computer), then LVGL's pool: bytes in use, its size, the
   *  most ever in use. */
  stats(): i32[];
  /** The value of an LVGL constant by its name (`bg_color`, `hidden`, `checked`, `indicator`, `clicked`, `center`, `column`...); -1 if unknown. */
  constant(name: string): i32;
  /** LVGL's percentage of the parent, as a size or position (LV_PCT). */
  pct(v: i32): i32;

  /** The active screen. */
  screen(): i32;
  /** A new object of `kind` (obj, label, button, slider, switch, checkbox, arc, bar, chart, spinner, buttonmatrix, led, roller, line) in `parent`. */
  create(kind: string, parent: i32): i32;
  /** The object's child at `index` (0 the first, -1 the last), 0 when there is none. */
  child(obj: i32, index: i32): i32;
  /** Deletes the object and its children. */
  /** Whether the handle names a live object (a deleted object's handle is free until a new object takes it). */
  exists(obj: i32): boolean;
  remove(obj: i32): void;
  /** Deletes the object's children. */
  clean(obj: i32): void;

  setSize(obj: i32, w: i32, h: i32): void;
  setPos(obj: i32, x: i32, y: i32): void;
  align(obj: i32, align: i32, x: i32, y: i32): void;
  /** Flex layout of the children: flow, then the alignment on the main axis, across, and of the tracks. */
  flex(obj: i32, flow: i32, main: i32, cross: i32, track: i32): void;
  flexGrow(obj: i32, grow: i32): void;
  /** A style property with a number (sizes, paddings, opacity, alignment...) on a part and state (`selector`: part | state). */
  style(obj: i32, prop: i32, value: i32, selector: i32): void;
  /** A style property with a colour 0xRRGGBB. */
  styleColor(obj: i32, prop: i32, rgb: i32, selector: i32): void;
  /** The text font: Montserrat 12, 14, 20 or 28 px. */
  font(obj: i32, px: i32, selector: i32): void;
  flag(obj: i32, flag: i32, on: boolean): void;
  state(obj: i32, state: i32, on: boolean): void;
  hasState(obj: i32, state: i32): boolean;

  /** The text of a label or a check box. */
  setText(obj: i32, text: string): void;
  /** The value of a slider, bar, arc or roller (its selected row), animated or not. */
  setValue(obj: i32, value: i32, animated: boolean): void;
  value(obj: i32): i32;
  setRange(obj: i32, min: i32, max: i32): void;
  /** A roller's rows ("a\nb\nc") or a button matrix's keys ("1|2|3\n4|5|6": rows by "\n", keys by "|"). */
  setOptions(obj: i32, options: string): void;
  /** The button of a button matrix that was last pressed, -1 when none. */
  selected(obj: i32): i32;
  /** The text of a button matrix's button. */
  buttonText(obj: i32, index: i32): string;
  scrollTo(obj: i32, x: i32, y: i32, animated: boolean): void;
  scrollY(obj: i32): i32;

  /** A chart's type (line, bar), its number of points and the range of the values. */
  chartSetup(obj: i32, type: i32, points: i32, min: i32, max: i32): void;
  /** A new series in the colour 0xRRGGBB: its index in the chart. */
  chartSeries(obj: i32, rgb: i32): i32;
  /** Shifts the series by one value. */
  chartPush(obj: i32, series: i32, value: i32): void;
  /** Sets the series' point `index` (0 the first shown) in place: a bar of a spectrum. */
  chartSet(obj: i32, series: i32, index: i32, value: i32): void;

  /** Turns the display a quarter (0 as started, 1 to 3 clockwise). */
  rotate(quarter: i32): void;
  /** The display's size, turned. */
  displayWidth(): i32;
  displayHeight(): i32;

  /** A Lottie animation (LottieFiles' JSON) of w x h pixels, playing in a loop: ThorVG draws it into a buffer of 4 bytes a pixel. */
  lottie(parent: i32, json: string, w: i32, h: i32): i32;
  /** Plays or pauses the animation where it is. */
  lottiePlay(obj: i32, on: boolean): void;
  /** Goes back to the animation's first frame. */
  lottieRestart(obj: i32): void;

  /** Queues the object's events of `code` for nextEvent(). */
  listen(obj: i32, code: i32): void;
  /** The next queued event as obj * 256 + code, -1 when there is none. */
  nextEvent(): i32;
}
export default requireNative<Spec>('Lvgl');
