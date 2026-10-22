# zinc:gfx reference

`zinc:gfx` draws in the window and reads the input, frame by frame: you register a function with `onFrame`, and it draws
the whole picture on every frame. It is the module of games, sketches, animations and the `<Canvas>` of `zinc:ui`.
New to it? Start with the lessons: [Learn Zinc](../learn/README.md).

```ts
import { onFrame, clear, rrect, pointerX, pointerY } from 'zinc:gfx';

onFrame((dt: number) => {
  clear(0x1c1b20);
  rrect(pointerX() - 20, pointerY() - 20, 40, 40, 20, 0xf27aa6, 255);   // a disc that follows the pointer
});
```

Conventions used by every function below:

- **Coordinates** are in pixels from the top left corner of the window: x to the right, y down. They are logical pixels:
  on a screen with twice the density (a Retina screen) one of them is 2 by 2 dots of the screen.
- **Colours** are numbers `0xRRGGBB` of type `u32`: `0xff0000` is red. **Opacity** (`alpha`) is a separate number from
  0 (invisible) to 255 (solid).
- **Fonts, images, shader programs and windows** are numbers (`i32`) that a function gives you once (`font()`,
  `image()`...) and that you pass to the drawing calls. `-1` means "not found".
- **Drawing order**: what is drawn later covers what was drawn before.

The declarations are in [`lib/gfx.d.ts`](../../lib/gfx.d.ts); an editor shows them as you type.

## The frame

| Function | What it does |
|---|---|
| `onFrame(cb: (dt: number) => void)` | Calls `cb` on every frame, after the top-level code has run. `dt` is the time since the previous frame, in seconds: multiply speeds by it. |
| `frame(): i32` | The number of frames since the start. |
| `width(): i32`, `height(): i32` | The size of the window, in pixels. |
| `onResize(cb: (w, h) => void)` | Calls `cb` with the new size before the next frame each time the window changes size. Asking for it makes the drawing follow the window's size (unless `zinc.json` sets `resize` to `"letterbox"`). |
| `pixelScale(): i32` | Dots of the screen per pixel: 2 on a Retina screen. Size off-screen images with it to keep them sharp. |
| `keep()` | Nothing changed this frame: shows the previous picture again, which saves power. |
| `quit()` | Ends the program after this frame. |
| `capture(path: string): boolean` | Saves the picture on screen as a PNG (or BMP when the path ends in `.bmp`). `false` when it cannot be written. `ZINC_SHOT=file.png` does the same with no code. |
| `overlay(draw: (dt: number) => boolean)` | Draws `draw` over every frame of the main window until it returns `false` (a fade-in of the loading screen). |
| `overlaid(): boolean` | Whether an overlay is drawing. |

## Windows

| Function | What it does |
|---|---|
| `openWindow(title: string, w: i32, h: i32, cb: (dt: number) => void): i32` | Opens a second window of `w` by `h` and draws it with `cb` on every frame. While `cb` runs, drawing, `width()`, `height()` and the input are this window's. Gives its id (more than 0), `-1` when it cannot open. |
| `closeWindow(id: i32)` | Closes a window (0: the main one, hidden while others are open). Closing the last window ends the program. |
| `windowOpen(id: i32): boolean` | Whether a window is open (0: the main one). |

## Drawing

| Function | What it does |
|---|---|
| `clear(color)` | Paints the whole window with one colour. Usually the first call of a frame. |
| `rect(x, y, w, h, color)` | A filled rectangle, solid. |
| `rrect(x, y, w, h, r, color, alpha)` | A filled rectangle with rounded corners of radius `r`. A square with `r` half its size is a circle: `rrect(cx - 10, cy - 10, 20, 20, 10, 0xffffff, 255)`. |
| `line(x1, y1, x2, y2, color)` | A thin line, one pixel wide. |
| `stroke(points: number[], width, color, alpha, closed: boolean)` | A thick line through the points `[x0, y0, x1, y1, ...]`, with round joins and ends. `closed`: joins the last point to the first. |
| `polygon(points: number[], color, alpha)` | A filled shape through the points `[x0, y0, x1, y1, ...]`, with smooth edges. A triangle: `polygon([50, 10, 90, 80, 10, 80], 0xe8b06a, 255)`. |
| `path(contours: number[], color, alpha)` | Several outlines filled together, with holes: `[count, x0, y0, ..., count, x0, y0, ...]`, `count` points each. For letters, icons, vector art. |
| `border(x, y, w, h, r, width, color, alpha)` | Only the outline of a rounded rectangle, `width` pixels thick. |
| `shadow(x, y, w, h, r, blur, color, alpha)` | A soft shadow of a rounded rectangle, blurred by `blur` pixels. Draw it before the box. |
| `translate(x, y)` | Moves everything drawn after it by `x`, `y`. Reset at each frame. |
| `setTransform(a, b, c, d, e, f)` | A matrix for what is drawn after it: x' = a·x + c·y + e, y' = b·x + d·y + f (the order of the web canvas). Turns, scales and moves boxes, text and images. Reset at each frame. |
| `resetTransform()` | Removes the matrix. |
| `clip(x, y, w, h, radius?)` | What is drawn after it shows only inside this box (with rounded corners when `radius` > 0), until `unclip()`. |
| `unclip()` | Ends the clip. |
| `commandCount(): i32`, `commandsFree(): i32` | How many drawing calls this frame has recorded, and how many more it can take. |

A turned square, 45 degrees around its centre (cx, cy):

```ts
const k = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
setTransform(k, s, -s, k, cx, cy);
rect(-20, -20, 40, 40, 0x5746e0);
resetTransform();
```

## Colours and paint

There is no colour function: a colour is a number. `0x5746e0` is red `57`, green `46`, blue `e0` (hexadecimal, `00` to
`ff`, as `#5746e0` on the web). From three numbers 0 to 255: `r * 65536 + g * 256 + b`.

| Function | What it does |
|---|---|
| `gradient(x, y, w, h, r, c1, c2, vertical: boolean, alpha)` | A rounded box filled from colour `c1` to `c2`, top to bottom when `vertical`, else left to right. |
| `gradientPaint(x, y, w, h, r, paint: number[], alpha)` | A rounded box filled with any gradient: `[kind, x0, y0, r0, x1, y1, r1, n, (offset, colour, alpha) × n]`, in the box's coordinates. `kind` 1 linear from (x0, y0) to (x1, y1), 2 radial between two circles, 3 an ellipse centred on (x0, y0) with radii x1, y1, 4 conic around (x0, y0) from angle r0; add 8 to repeat the stops. |
| `Blend` | How a sprite's colour meets what is under it (`drawImageRect`): `Blend.Normal` paints over, `Add` adds (glows, sparks), `Multiply` darkens (shadows), `Screen` lightens (light, fog). |
| `shaderProgram(fragment: string, scale?: i32): i32` | A GPU program in GLSL ES 1.00 for `drawShader`: its `main()` sets `gl_FragColor` from `v_uv` (0 to 1 across the box), `u_size` (the box in pixels) and `u_p[8]` (the uniforms). `scale` 1 to 8 shades at a lower resolution. |
| `drawShader(program, x, y, w, h, uniforms: number[])` | Fills the box with the program, on the GPU (at most 32 uniforms). Draws nothing where `shaderAvailable()` is false: keep a drawing of your own for those screens. |
| `shaderAvailable(): boolean` | Whether this screen draws shaders: the GPU window of a desktop, yes; the software drawing and headless runs, no. |

A sunset sky: `gradient(0, 0, width(), height(), 0, 0x2b1055, 0xf27a54, true, 255)`.

## Text

| Function | What it does |
|---|---|
| `font(family: string, px: i32): i32` | A font of the families that come with Zinc, `'sans'` (Inter), `'sans-bold'`, `'mono'` (JetBrains Mono) or `'grid'` (pixel letters), at the nearest prepared size. Ask once, at the start. |
| `loadFont(file: string, px: number): i32` | A font at exactly `px` pixels from a TrueType file: a `.ttf` of the `assets` folder (`'MyFont.ttf'`), a family name, or a full path. `-1` when there is no such file. |
| `drawText(font, x, y, s: string, color, alpha, tracking)` | Writes `s` with its top left corner at (x, y). `tracking` adds space between the letters (0: none). |
| `textWidth(font, s: string, tracking): number` | How wide `s` will be: centre with `(width() - textWidth(f, s, 0)) / 2`. |
| `lineHeight(font): i32` | The height of one line, space between lines included: the step from one line to the next. |
| `fontAscent(font): i32` | From the top of the line to the baseline (the line the letters sit on). |
| `text(x, y, s: string, color, scale: i32)` | Old-style blocky text on an 8-pixel grid, `scale` times bigger. For quick debug lines. |

```ts
const big = font('sans-bold', 48);
drawText(big, (width() - textWidth(big, 'Score', 0)) / 2, 20, 'Score', 0xffffff, 255, 0);
```

## Images

| Function | What it does |
|---|---|
| `image(name: string): i32` | A PNG or SVG picture of the `assets` folder, by file name: `image('ship.png')`. `-1` when it is missing. |
| `imageWidth(image): i32`, `imageHeight(image): i32` | Its size in pixels. |
| `drawImage(image, x, y, w, h, alpha, radius)` | Draws the whole picture into the box (x, y, w, h), stretched to fit, with rounded corners when `radius` > 0. |
| `drawImageRect(image, sx, sy, sw, sh, dx, dy, dw, dh, alpha?, flags?, rotation?, tint?, blend?)` | Draws a part of a picture (sx, sy, sw, sh) into the box (dx, dy, dw, dh): one frame of a sprite sheet, one tile. `flags`: `ImageFlag` bits; `rotation`: radians, clockwise, around the box's centre; `tint`: a colour that multiplies the picture's (`0xffffff`: none); `blend`: a `Blend` mode. |
| `ImageFlag` | Bits for `drawImageRect`, added together: `FlipX`, `FlipY` (mirrored), `Nearest` (sharp pixels, for pixel art), `Smooth` (a softer stretch of a small picture). |
| `imageFromBytes(bytes: u8[]): i32` | A picture from the bytes of a PNG or JPEG file (downloaded, read from a file). `-1` when the bytes are not one. Free it with `destroyImage`. |
| `imageFromPixels(rgba: u8[], w, h): i32` | A picture from your own pixels: four bytes each (red, green, blue, opacity), row by row from the top. |
| `updateImage(image, rgba: u8[])` | New pixels for a picture made by `imageFromPixels`, shown from the next drawing on. |
| `createImage(w, h): i32` | A blank (black) picture to draw into with `beginImage`. |
| `beginImage(image)`, `endImage()` | What is drawn between the two goes into the picture instead of the screen: draw a complex background once, then show it each frame with `drawImage`. |
| `destroyImage(image)` | Frees a picture you made. |

The third frame of a sprite sheet with 32-pixel frames, mirrored, twice as big:

```ts
drawImageRect(sheet, 64, 0, 32, 32, x, y, 64, 64, 255, ImageFlag.FlipX | ImageFlag.Nearest);
```

## Input

Each function tells the state of the input **in this frame**: call them inside `onFrame`.

### Game buttons

| Function | What it does |
|---|---|
| `Btn` | The buttons of a game controller: `Up`, `Down`, `Left`, `Right`, `A`, `B`, `X`, `Y`, `L`, `R`, `Start`, `Select`. On a keyboard: the arrows or W A S D, Space or Z (A), X (B), C (X), V (Y), Q (L), E (R), Enter (Start), Tab (Select). A gamepad's pad, stick and buttons count too. |
| `isDown(b: Btn): boolean` | `true` while the button is held: for moving. |
| `wasPressed(b: Btn): boolean` | `true` only on the frame the button went down: for jumping, shooting, choosing. |

### Keyboard

| Function | What it does |
|---|---|
| `keyCount(): i32` | How many key events came since the last frame. Read them from 0 to `keyCount() - 1`. |
| `keyKind(i): KeyKind` | `KeyKind.Down` (pressed), `Up` (released), `Repeat` (held, repeating) or `Text` (typed text, when text input is on). |
| `keyName(i): string` | The key, as the web names it, without Shift: `'a'`, `'1'`, `' '`, `'Enter'`, `'Escape'`, `'Backspace'`, `'Tab'`, `'ArrowLeft'`, `'F5'`... For `KeyKind.Text`, the typed text. |
| `keyMods(i): i32` | The modifier keys held during that event, as `Mod` bits. |
| `modifiers(): i32` | The modifier keys held now: `(modifiers() & Mod.Shift) !== 0` is "Shift is held". |
| `Mod` | `Shift`, `Ctrl`, `Alt`, `Meta` (Cmd on a Mac). |
| `startTextInput(x, y, w, h)` | Starts text typing for a field at that box: typed text, accents and other languages (and the on-screen keyboard of a phone) arrive as `KeyKind.Text`. |
| `stopTextInput()` | Stops it. |
| `escapeByApp(on: boolean)` | `true`: Escape is a key like the others for your program. By default Escape leaves full screen, or closes the program. |
| `escapeDefault()` | Does what Escape does by default (leave full screen, else quit). |

```ts
for (let i = 0; i < keyCount(); i++) {
  if (keyKind(i) === KeyKind.Down && keyName(i) === 'r') restart();
}
```

### Pointer: mouse, trackpad, first finger

| Function | What it does |
|---|---|
| `pointerX(): number`, `pointerY(): number` | Where the pointer is. On a touch screen, the first finger. |
| `pointerDown(): boolean` | `true` while the main button (or the first finger) is down. |
| `pointerButtons(): i32` | The buttons held: 1 left, 2 right, 4 middle, added together. `(pointerButtons() & 2) !== 0`: the right button is down. |
| `buttonEventCount(): i32` | How many button presses and releases came since the last frame, in order: two quick clicks between two frames are both here. |
| `buttonEventX(i)`, `buttonEventY(i)` | Where that press or release happened. |
| `buttonEventButton(i): i32` | Which button: 0 left, 1 middle, 2 right. |
| `buttonEventDown(i): boolean` | `true` for a press, `false` for a release. |
| `wheel(): number` | Steps of the mouse wheel this frame: more than 0 up, less than 0 down. |
| `wheelX(): number` | Sideways steps: more than 0 to the right. |
| `scrollDX(): number`, `scrollDY(): number` | Precise scrolling of a trackpad since the last frame, in pixels (more than 0: up, left). |
| `scrollPhase(): i32` | Where the trackpad gesture is: 0 none, 1 fingers moving, 2 lifted (start your own inertia), 3 fingers landed, 4 lifted and the system sends its own inertia, 5 a step of that inertia. |
| `pinch(): number` | The trackpad's pinch this frame as a factor: 1 none, more than 1 apart, less than 1 together. |
| `setCursor(c: Cursor)` | The mouse cursor's shape: `Cursor.Default`, `Text`, `Pointer`, `Move`, `EwResize`, `NsResize`, `Crosshair`, `Grab`, `Grabbing`, `NotAllowed`. |

A click, found by remembering the frame before:

```ts
let was = false;
onFrame((dt: number) => {
  if (pointerDown() && !was) console.log(`click at ${pointerX()}, ${pointerY()}`);
  was = pointerDown();
});
```

### Touch

| Function | What it does |
|---|---|
| `touchCount(): i32` | How many fingers are on a touch screen now. |
| `touchX(i): number`, `touchY(i): number` | Where finger `i` is (0 to `touchCount() - 1`, in the order they landed). |
| `touchId(i): i32` | A number that stays the same for one finger from the moment it lands until it lifts: follow a finger with it. |

### Pen

A stylus sends many points between two frames; these give all of them, oldest first, so a fast stroke is not lost. On a
desktop the mouse stands in for a pen (the right button is the eraser).

| Function | What it does |
|---|---|
| `penCount(): i32` | How many pen samples came since the last frame. |
| `penX(i): number`, `penY(i): number` | Where. |
| `penPressure(i): number` | How hard, from 0 to 1. |
| `penTiltX(i): number`, `penTiltY(i): number` | The pen's tilt, in degrees from -90 to 90. |
| `penFlags(i): i32` | `PenFlag` bits: `Down` (touching), `Eraser` (the eraser end), `Hover` (near the screen, not touching). |

### Gamepads

Up to four gamepads, in slots 0 to `gamepadCount() - 1`; a pad keeps its slot while it is plugged in. A gamepad's pad,
left stick and main buttons are also the `Btn` buttons of `isDown`.

| Function | What it does |
|---|---|
| `gamepadCount(): i32` | How many slots there are. |
| `gamepadConnected(pad): boolean` | Whether a gamepad is plugged in that slot. |
| `gamepadName(pad): string` | Its name. |
| `gamepadButton(pad, b: GamepadButton): boolean` | Whether a button is held. `GamepadButton`: `South` (A on Xbox, cross on PlayStation), `East`, `West`, `North`, `LeftShoulder`, `RightShoulder`, `LeftTrigger`, `RightTrigger`, `Back`, `Start`, `LeftStick`, `RightStick`, `Up`, `Down`, `Left`, `Right`, `Guide`. |
| `gamepadButtons(pad): i32` | Every button held, one bit per `GamepadButton`. |
| `gamepadButtonValue(pad, b): number` | How far a trigger (or a pressure-sensitive button) is pressed, 0 to 1. |
| `gamepadAxis(pad, axis: GamepadAxis): number` | A stick, from -1 to 1: `GamepadAxis.LeftX`, `LeftY`, `RightX`, `RightY` (y: more than 0 is down). |
| `gamepadRumble(pad, low, high, ms): boolean` | Shakes the pad for `ms` milliseconds: `low` and `high` are the strengths (0 to 1) of the slow and the fast motor. |

### Clipboard

| Function | What it does |
|---|---|
| `clipboardText(): string` | The text the user copied. |
| `setClipboardText(s: string)` | Puts text in the clipboard. |

## System and tools

| Function | What it does |
|---|---|
| `signalCount(): i32`, `signalNext(): string` | The system's messages waiting for this frame, one at a time, as `kind args`: `'theme dark'`, `'safearea 47 0 34 0'`, `'back'`. `zinc:ui` reads them for you ([zinc:ui in depth](../ui.md#platform-and-system-signals)). |
| `profiling(): boolean` | Whether the profiler is on (`ZINC_PROFILE=1`, a trace, DevTools). |
| `profMark(phase: i32)` | Counts the time since the last mark in a phase: 0 app, 1 input, 2 animation, 3 layout, 4 paint. |
| `profSection(label: string): string` | Ends the current profile section (prints its numbers) and starts one named `label`. For benchmarks. |

## Without a window

`ZINC_HEADLESS=1` runs a program with no window: drawing works, the input is empty, `ZINC_FRAMES=n` stops after `n`
frames and `ZINC_SHOT=file.png` saves the last picture. `ZINC_INPUT=file` plays a script of input events (one per line,
`<frame> <event>`: `move 120 80`, `down`, `up`, `key a`, `text hello`, `wheel 0 3`, `pad Left`, `padup Left`,
`touch 1 200 150`, `touchup 1`): it is how the lessons are tested (`tests/t1/learn_samples.sh`).
