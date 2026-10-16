// zinc:gfx — immediate-mode 2D API for games (UI-12). Colors are 0xRRGGBB.
declare module 'zinc:gfx' {
  export const enum Btn { Up = 0, Down = 1, Left = 2, Right = 3, A = 4, B = 5, X = 6, Y = 7, L = 8, R = 9, Start = 10, Select = 11 }
  /** Register the frame callback; dt in seconds. Runs after top-level code finishes. */
  export function onFrame(cb: (dt: number) => void): void;
  /** Calls `cb(width, height)` before the next frame each time the surface changes size; asking for it makes the surface follow the window,
   *  unless zinc.json's `resize` is "letterbox". */
  export function onResize(cb: (w: number, h: number) => void): void;
  /** Opens a window beside the main one and draws it with `cb` every frame: while it runs, the drawing calls, width(), height() and the input are
   *  the window's. Returns its id (> 0), -1 when it cannot open (the prototype opens none). Closing the last window ends the program. */
  export function openWindow(title: string, w: i32, h: i32, cb: (dt: number) => void): i32;
  /** Closes window `id` (0: the main one, hidden while others are open). */
  export function closeWindow(id: i32): void;
  /** Whether window `id` is open (0: the main one). */
  export function windowOpen(id: i32): boolean;
  /** Draws over every frame of the main window, after the program, until `draw` returns false (the loader's fade, zinc.json loading.fadeMs). */
  export function overlay(draw: (dt: number) => boolean): void;
  /** Whether an overlay draws (zinc:ui paints its frame again instead of keeping it). */
  export function overlaid(): boolean;
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
  /** Rounded box filled with a gradient paint record, in the coordinates of the box: [kind, x0, y0, r0, x1, y1, r1, n, (offset, 0xRRGGBB,
   *  alpha 0..255) * n] with n stops sorted by offset. kind 1: linear from (x0, y0) to (x1, y1); 2: radial between the circles (x0, y0, r0) and
   *  (x1, y1, r1) (canvas); 3: ellipse centred on (x0, y0) with radii x1, y1 (CSS radial-gradient); 4: conic around (x0, y0) from r0 radians,
   *  clockwise from the top (CSS conic-gradient); add 8 to repeat the stops from the first offset to the last (CSS repeating-*). Colours
   *  are interpolated in sRGB. */
  export function gradientPaint(x: number, y: number, w: number, h: number, r: number, paint: number[], alpha: i32): void;
  export function border(x: number, y: number, w: number, h: number, r: number, width: number, color: u32, alpha: i32): void;
  /** Soft drop shadow of a rounded box. */
  export function shadow(x: number, y: number, w: number, h: number, r: number, blur: number, color: u32, alpha: i32): void;
  /** Filled polygon from flat [x0, y0, x1, y1, ...] points (anti-aliased). */
  export function polygon(points: number[], color: u32, alpha: i32): void;
  /** Several contours [count, x0, y0, ..., count, ...], nonzero winding (holes, vector art, Lottie). */
  export function path(contours: number[], color: u32, alpha: i32): void;
  /** Baked font: family "sans" | "sans-bold" | "mono" | "grid" at the nearest baked pixel size. */
  export function font(family: string, px: i32): i32;
  /** A font at exactly `px` pixels from a TrueType file chosen at run time: a baked family ("sans", "sans-bold", "mono", the stem of a .ttf of
   *  the assets), the path of a .ttf in the assets, or an absolute path, read as zinc:fs reads it (the fs:read permission). Its text has the pixels of baked text of that size; characters are rasterized on first
   *  use. -1 when there is no such file or the read is refused (the prototype: the nearest baked size of the family). */
  export function loadFont(file: string, px: number): i32;
  export function fontAscent(font: i32): i32;
  export function lineHeight(font: i32): i32;
  export function textWidth(font: i32, s: string, tracking: number): number;
  export function drawText(font: i32, x: number, y: number, s: string, color: u32, alpha: i32, tracking: number): void;
  /** Image baked from the assets directory (PNG or SVG), by file name. -1 when missing. */
  export function image(name: string): i32;
  export function imageWidth(image: i32): i32;
  export function imageHeight(image: i32): i32;
  export function drawImage(image: i32, x: number, y: number, w: number, h: number, alpha: i32, radius: number): void;
  /** Smooth: a cubic B-spline instead of the linear blend, for a small picture stretched far (a field computed at low resolution): no grid. */
  export const enum ImageFlag { FlipX = 1, FlipY = 2, Nearest = 4, Smooth = 8 }
  /** How a sprite's colour meets what is under it: Normal paints over it, Add adds (glows, sparks), Multiply darkens (shadows, stains), Screen
   *  lightens (light, fog). */
  export const enum Blend { Normal = 0, Add = 1, Multiply = 2, Screen = 3 }
  /** Draws the source rectangle (sx, sy, sw, sh) of an image, in the pixels of imageWidth / imageHeight, on (dx, dy, dw, dh): a frame of a
   *  sprite sheet, a tile. alpha 0..255; flags: ImageFlag bits (mirrored, nearest texel instead of the linear blend). The part of the source
   *  rectangle outside the image is not drawn. Linear sampling blends with the texels around the rectangle, as a GPU does: leave a
   *  transparent pixel between the frames of a sheet, or draw pixel art with ImageFlag.Nearest. A sprite: `rotation` turns it by that many
   *  radians (clockwise on the screen) around the centre of the destination rectangle, after the matrix of setTransform; `tint` (0xRRGGBB)
   *  multiplies its colour (0xFFFFFF: none); `blend` is a Blend mode. The GL renderer draws sprites as textured quads, batched while the
   *  image and the blend mode stay the same. */
  export function drawImageRect(image: i32, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, alpha?: i32, flags?: i32, rotation?: number, tint?: u32, blend?: i32): void;
  /** Runtime image decoded from the bytes of a PNG or JPEG file (zinc:assets readBytes, a download), with its transparency. -1 when the
   *  bytes are not such an image. Free it with destroyImage. */
  export function imageFromBytes(bytes: u8[]): i32;
  /** Runtime image of w x h pixels from RGBA bytes (four a pixel, rows top first), with its transparency: no file format between a picture a
   *  program computes and the screen. -1 when the bytes are too few. Free it with destroyImage. */
  export function imageFromPixels(rgba: u8[], w: i32, h: i32): i32;
  /** New RGBA pixels for a runtime image of imageFromPixels (as many bytes as it has pixels times four; fewer: nothing changes). The frames
   *  drawn after it show them; a GPU display uploads only this image again. */
  export function updateImage(image: i32, rgba: u8[]): void;
  /** A fragment program for drawShader, in GLSL ES 1.00 (WebGL 1's language): its main() sets gl_FragColor from `varying vec2 v_uv` (0..1
   *  across the box, top left first), `uniform vec2 u_size` (the box in pixels) and `uniform vec4 u_p[8]` (drawShader's uniforms, four a
   *  vector); mediump floats are enough on every GPU (the shader runs where fragment highp is missing). Create it before the first frame:
   *  on Android the window then puts a GPU layer under the frame. Compiled by the display at its first use; a program that does not
   *  compile draws nothing (the error on stderr). `scale` (1 to 8): the program may be shaded at 1 / scale of the screen's resolution and
   *  stretched, for a picture without sharp edges (a smooth field: 2 to 4), on a GPU that cannot shade the whole screen each frame (an
   *  Android window's GPU layer takes it; a desktop GPU shades every pixel). */
  export function shaderProgram(fragment: string, scale?: i32): i32;
  /** Fills the box with the program (at most 32 uniforms, u_p[0].x first), on the GPU; under it what was drawn before, over it what follows.
   *  Only where shaderAvailable(): the software raster draws nothing for it, so a program keeps its own CPU path (an imageFromPixels picture
   *  computed at a lower resolution and drawn with ImageFlag.Smooth) for the displays without one. */
  export function drawShader(program: i32, x: number, y: number, w: number, h: number, uniforms: number[]): void;
  /** Whether this display draws drawShader on the GPU (the GL window of a desktop, an Android window whose program made a shader before its
   *  first frame); false on the software raster and headless. */
  export function shaderAvailable(): boolean;
  /** Clips the following draws to the box until unclip(); radius > 0 also clips to its rounded corners (anti-aliased). */
  export function clip(x: number, y: number, w: number, h: number, radius?: number): void;
  export function unclip(): void;
  /** Offset added to the coordinates of the following commands (reset every frame). */
  export function translate(x: number, y: number): void;
  /** A 2D matrix for the commands that follow, after translate, in logical pixels: x' = a x + c y + e, y' = b x + d y + f (the canvas
   *  setTransform order). Boxes, text and images are drawn through it; polygons, paths and strokes are transformed point by point; a clip
   *  under a matrix is the bounding box of the transformed rectangle. Reset at each frame.
   *  A matrix that only scales and moves (b and c 0, a and d positive) costs nothing: a box or an image is drawn as if it had been
   *  given at its place and size on the screen (a radius, a border's width and a shadow's blur need a equal to d for that).
   *  A text keeps the layout of its font: a line is as wide as textWidth says, times the scale, whatever the scale, so a block wrapped
   *  once can be zoomed without a word changing line. Its glyphs are made for the size it has on screen (from the font's TrueType file,
   *  in steps a quarter of an octave apart), so an enlarged text is sharp: draw it in the font of its designed size, not in a larger one. */
  export function setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  export function resetTransform(): void;
  /** Stroked polyline [x0, y0, x1, y1, ...] with round joins and caps. */
  export function stroke(points: number[], width: number, color: u32, alpha: i32, closed: boolean): void;
  /** Runtime image (black) usable with drawImage, and as a render target. Video/camera plugins create their own. */
  export function createImage(w: i32, h: i32): i32;
  export function destroyImage(image: i32): void;
  /** Draw commands recorded so far in this frame, and how many more the frame still takes. */
  export function commandCount(): i32;
  export function commandsFree(): i32;
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
  /** Gamepads (Zinc Next): slots 0 to gamepadCount() - 1; buttons and axes in the W3C "standard" order. A gamepad also holds the Btn buttons of isDown. */
  export const enum GamepadButton { South = 0, East = 1, West = 2, North = 3, LeftShoulder = 4, RightShoulder = 5, LeftTrigger = 6, RightTrigger = 7,
    Back = 8, Start = 9, LeftStick = 10, RightStick = 11, Up = 12, Down = 13, Left = 14, Right = 15, Guide = 16 }
  export const enum GamepadAxis { LeftX = 0, LeftY = 1, RightX = 2, RightY = 3 }
  export function gamepadCount(): i32;
  export function gamepadConnected(pad: i32): boolean;
  export function gamepadName(pad: i32): string;
  export function gamepadButtons(pad: i32): i32;
  export function gamepadButton(pad: i32, b: GamepadButton): boolean;
  export function gamepadButtonValue(pad: i32, b: GamepadButton): number;
  export function gamepadAxis(pad: i32, axis: GamepadAxis): number;
  export function gamepadRumble(pad: i32, low: number, high: number, ms: i32): boolean;
  export function isDown(b: Btn): boolean;
  export function wasPressed(b: Btn): boolean;
  export function pointerX(): number;
  export function pointerY(): number;
  export function pointerDown(): boolean;
  /** Frame counter since start. */
  export function frame(): i32;
  /** Physical pixels per logical pixel of the frame (2 on Retina): size render-to-image layers with it to keep them
   *  sharp (an image drawn at its own physical size is a row copy). */
  export function pixelScale(): i32;
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
