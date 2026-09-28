// zinc:gfx — immediate-mode 2D API for games (UI-12). Colors are 0xRRGGBB.
declare module 'zinc:gfx' {
  export const enum Btn { Up = 0, Down = 1, Left = 2, Right = 3, A = 4, B = 5, X = 6, Y = 7, L = 8, R = 9, Start = 10, Select = 11 }
  /** Register the frame callback; dt in seconds. Runs after top-level code finishes. */
  export function onFrame(cb: (dt: number) => void): void;
  export function width(): i32;
  export function height(): i32;
  export function clear(color: u32): void;
  export function rect(x: number, y: number, w: number, h: number, color: u32): void;
  export function line(x1: number, y1: number, x2: number, y2: number, color: u32): void;
  /** Crisp 8px monospace grid, scaled by `scale` (legacy HUD text). */
  export function text(x: number, y: number, s: string, color: u32, scale: i32): void;
  /** Rounded rectangle; alpha 0..255. */
  export function rrect(x: number, y: number, w: number, h: number, r: number, color: u32, alpha: i32): void;
  /** Linear gradient from c1 to c2 (top to bottom when vertical, else left to right). */
  export function gradient(x: number, y: number, w: number, h: number, r: number, c1: u32, c2: u32, vertical: boolean, alpha: i32): void;
  export function border(x: number, y: number, w: number, h: number, r: number, width: number, color: u32, alpha: i32): void;
  /** Soft drop shadow of a rounded box. */
  export function shadow(x: number, y: number, w: number, h: number, r: number, blur: number, color: u32, alpha: i32): void;
  /** Filled polygon from flat [x0, y0, x1, y1, ...] points (anti-aliased). */
  export function polygon(points: number[], color: u32, alpha: i32): void;
  /** Several contours [count, x0, y0, ..., count, ...], nonzero winding (holes, vector art, Lottie). */
  export function path(contours: number[], color: u32, alpha: i32): void;
  /** Baked font: family "sans" | "sans-bold" | "mono" | "grid" at the nearest baked pixel size. */
  export function font(family: string, px: i32): i32;
  export function fontAscent(font: i32): i32;
  export function lineHeight(font: i32): i32;
  export function textWidth(font: i32, s: string, tracking: number): number;
  export function drawText(font: i32, x: number, y: number, s: string, color: u32, alpha: i32, tracking: number): void;
  /** Image baked from the assets directory (PNG or SVG), by file name. -1 when missing. */
  export function image(name: string): i32;
  export function imageWidth(image: i32): i32;
  export function imageHeight(image: i32): i32;
  export function drawImage(image: i32, x: number, y: number, w: number, h: number, alpha: i32, radius: number): void;
  /** Clips the following draws to the box until unclip(); radius > 0 also clips to its rounded corners (anti-aliased). */
  export function clip(x: number, y: number, w: number, h: number, radius?: number): void;
  export function unclip(): void;
  /** Offset added to the coordinates of the following commands (reset every frame). */
  export function translate(x: number, y: number): void;
  /** Stroked polyline [x0, y0, x1, y1, ...] with round joins and caps. */
  export function stroke(points: number[], width: number, color: u32, alpha: i32, closed: boolean): void;
  /** Runtime image (black) usable with drawImage, and as a render target. Video/camera plugins create their own. */
  export function createImage(w: i32, h: i32): i32;
  export function destroyImage(image: i32): void;
  /** Draw commands until endImage() are rasterized into `image` instead of the screen (tile caches, static layers). */
  export function beginImage(image: i32): void;
  export function endImage(): void;
  /** Mouse wheel / scroll steps this frame (+ = up). */
  export function wheel(): number;
  /** Trackpad pinch scale this frame (1 = none). */
  export function pinch(): number;
  /** Multitouch: active touch points this frame. */
  export function touchCount(): i32;
  export function touchX(i: i32): number;
  export function touchY(i: i32): number;
  export function touchId(i: i32): i32;
  export const enum PenFlag { Down = 1, Eraser = 2, Hover = 4 }
  /** Pen (stylus) samples received since the previous frame, oldest first: fast strokes are not lost between frames.
   *  The mouse stands in for a pen on desktop (right button = eraser). */
  export function penCount(): i32;
  export function penX(i: i32): number;
  export function penY(i: i32): number;
  /** 0..1 */
  export function penPressure(i: i32): number;
  /** Tilt in degrees (-90..90). */
  export function penTiltX(i: i32): number;
  export function penTiltY(i: i32): number;
  /** PenFlag bits: Down (touching), Eraser (eraser end), Hover (in range, not touching). */
  export function penFlags(i: i32): i32;
  /** Nothing changed this frame: present the previous one again (retained UIs call this when idle). */
  export function keep(): void;
  export function isDown(b: Btn): boolean;
  export function wasPressed(b: Btn): boolean;
  export function pointerX(): number;
  export function pointerY(): number;
  export function pointerDown(): boolean;
  /** Frame counter since start. */
  export function frame(): i32;
  export function quit(): void;
  /** Saves the frame on screen (the last one presented, at physical size) as PNG, or BMP when the path ends in .bmp.
   *  False when it cannot be written (no file system, sim target). See ZINC_SHOT for captures without code. */
  export function capture(path: string): boolean;

  // ---- desktop input (keyboard, text, mouse buttons, clipboard, cursor). Empty/no-op where the HAL has none.
  export const enum Mod { Shift = 1, Ctrl = 2, Alt = 4, Meta = 8 }
  export const enum KeyKind { Down = 0, Up = 1, Repeat = 2, Text = 3 }
  export const enum Cursor { Default = 0, Text = 1, Pointer = 2, Move = 3, EwResize = 4, NsResize = 5, Crosshair = 6, Grab = 7, Grabbing = 8, NotAllowed = 9 }
  /** Horizontal scroll steps this frame (+ = right). */
  export function wheelX(): number;
  /** Pointer buttons held: 1 left, 2 right, 4 middle. */
  export function pointerButtons(): i32;
  /** Mod bits held now. */
  export function modifiers(): i32;
  /** Keyboard events since the previous frame, in order: key downs/ups/repeats and typed text (text input on). */
  export function keyCount(): i32;
  export function keyKind(i: i32): KeyKind;
  /** Mod bits at the time of the event. */
  export function keyMods(i: i32): i32;
  /** Key name like DOM KeyboardEvent.key, unshifted: 'a', '1', ' ', 'Enter', 'ArrowLeft', 'F5'...; the UTF-8 text for KeyKind.Text. */
  export function keyName(i: i32): string;
  /** Mouse button presses/releases since the previous frame, in order (fast clicks are not lost). */
  export function buttonEventCount(): i32;
  export function buttonEventX(i: i32): number;
  export function buttonEventY(i: i32): number;
  /** 0 left, 1 middle, 2 right (DOM numbering). */
  export function buttonEventButton(i: i32): i32;
  export function buttonEventDown(i: i32): boolean;
  /** Text input on (IME, on-screen keyboard) for a field at (x, y, w, h); typed text arrives as KeyKind.Text. */
  export function startTextInput(x: number, y: number, w: number, h: number): void;
  export function stopTextInput(): void;
  export function clipboardText(): string;
  export function setClipboardText(s: string): void;
  export function setCursor(c: Cursor): void;
  /** Precise scrolling (trackpads) since the last frame, in pixels, resampled at frame time (+ = up / left). */
  export function scrollDX(): number;
  export function scrollDY(): number;
  /** 0 none, 1 gesture active (fingers down), 2 ended this frame (fingers lifted: start the inertia), 3 fingers landed. */
  export function scrollPhase(): i32;
  /** true: Escape is an ordinary key for the app (zinc:ui sets it); the HAL no longer quits / leaves fullscreen on it. */
  export function escapeByApp(on: boolean): void;
  /** The HAL's own Escape action: leave fullscreen, else quit (nothing in kiosk mode). */
  export function escapeDefault(): void;
  /** Profiler on (ZINC_PROFILE=1, ZINC_TRACE=file.json, DevTools Tracing): zinc:ui marks its frame phases then. */
  export function profiling(): boolean;
  /** Attributes the time since the previous mark to a phase: 0 app, 1 input, 2 anim, 3 layout, 4 paint. */
  export function profMark(phase: i32): void;
}
