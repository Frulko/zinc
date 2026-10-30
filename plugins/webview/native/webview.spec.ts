// Native side of zinc:webview. Views are handles; plugins/webview/index.ts wraps them in a class.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** New view at x, y, w, h (logical pixels of the program's surface); -1 when there is no window. */
  create(x: f64, y: f64, w: f64, h: f64): i32;
  setBounds(v: i32, x: f64, y: f64, w: f64, h: f64): void;
  /** The box (x, y, w, h) and the clip (cx, cy, cw, ch) of a zinc:ui NativeView, both in logical pixels of the surface: the view shows only
   *  inside the clip. */
  place(v: i32, x: f64, y: f64, w: f64, h: f64, cx: f64, cy: f64, cw: f64, ch: f64): void;
  setVisible(v: i32, on: boolean): void;
  navigate(v: i32, url: string): void;
  loadHtml(v: i32, html: string, baseUrl: string): void;
  eval(v: i32, js: string): void;
  /** The page's zoom, as Cmd + and Cmd - do in a browser (the layout reflows): 1 is 100 %. */
  setZoom(v: i32, factor: f64): void;
  /** A key of the keyboard for the page, as if typed in it: its KeyboardEvent.code ("KeyA", "Enter", "ArrowLeft"...), the text it types
   *  ("" for none), the modifiers (1 shift, 2 control, 4 option, 8 command). macOS; elsewhere nothing yet. */
  key(v: i32, down: boolean, code: string, text: string, mods: i32): void;
  /** Delivers `data` (a string, parsed when it is JSON) to the page: zinc.onmessage and a 'zinc' window event. */
  post(v: i32, data: string): void;
  /** Settles the page's zinc.invoke call `id` (result parsed when it is JSON). */
  reply(v: i32, id: i32, ok: boolean, result: string): void;
  close(v: i32): void;
  /** kind 0: page message (a = data); 1: invoke (id, a = command, b = args); 2: page loaded (a = url). */
  onEvent(cb: (v: i32, kind: i32, id: i32, a: string, b: string) => void): void;
}
export default requireNative<Spec>('Webview');
