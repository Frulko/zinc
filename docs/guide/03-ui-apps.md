# 3. UI apps

Zinc's UI is declarative JSX (`.tsx`) over a flexbox layout engine and a GPU renderer with a software fallback: no
HTML/CSS engine, no browser. The UI runtime is written in Zinc ([`lib/std/ui.ts`](../../lib/std/ui.ts), `solid.ts`,
`react.ts`) and compiled into your program. Two reactive models ship: **Solid** (fine-grained signals) and **React**
(hooks, reconciled re-renders); both draw the same host tree.

The complete counter app (build it with `zinc run docs/guide/samples/hello-ui`):

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const [count, setCount] = createSignal<i32>(0);

function App(): i32 {
  return <View className="flex-col items-center justify-center h-full gap-3 bg-slate-900">
    <Text className="text-2xl text-amber-400">count: {count()}</Text>
    <Button className="px-4 py-2 rounded bg-slate-700 focus:bg-slate-600" onClick={() => setCount(count() + 1)}>
      <Text className="text-slate-100">increment</Text>
    </Button>
  </View>;
}

render(App, 0x0f172a, null);   // component, background color, optional per-frame callback
```

## Host tags

`View` (flex container), `Text`, `Button`, `Image`, `ScrollView`, `Canvas`, `Input` and `TextArea`, always capitalised
as in React Native: a lowercase tag (`<view>`) is refused with error Z0007 that names the capitalised component. Text
lives only inside `Text`. A `Canvas` gives you an immediate-mode `zinc:gfx` draw area:

```tsx
<Canvas className="grow" onDraw={(x, y, w, h) => { rect(x, y, w, h, 0x0b1220); /* zinc:gfx calls */ }} />
```

Attributes: `className` (Tailwind-like tokens; `class` is refused, Z0006), `style={{ opacity, translateX, translateY, scale, rotate }}` for
per-node transforms, `bg={0xRRGGBB}` for a dynamic background color, `onClick`, `onDraw`, `ref`.

## Solid vs React

**Solid** — signals update only the exact text/attribute that depends on them; the component function runs once:

```tsx
import { createSignal, createMemo, Show, For } from 'zinc:ui/solid';
const [items, setItems] = createSignal<string[]>(['a', 'b']);
<For each={items()}>{(it) => <Text>{it}</Text>}</For>;   // keyed
```

A component's props may read signals too: `<DashboardNavbar title={page()} />` follows `page()`. Solid passes such props as
getters; Zinc's props are typed values, so the props are read in an effect and the component is mounted again when one
changes (its body still runs untracked). Pass an accessor (`modelValue={tab}`) when the component should update in place
and keep its own state.

**React** — hooks and reconciled re-renders:

```tsx
import { useState, useEffect, render } from 'zinc:ui/react';
function App(): i32 {
  const [n, setN] = useState<i32>(0);
  useEffect(() => { console.log('n is', n); }, [n]);
  return <Button onClick={() => setN(n + 1)}><Text>{n}</Text></Button>;
}
render(App, 0x101010, null);
```

Compatible import specifiers work unchanged: `solid-js`, `react`, `inferno`, `@pocketjs/framework/*` — existing
PocketJS apps compile as-is (`examples/pocket-hero`).

## Classes, CSS and breakpoints

Tailwind-like utility tokens are compiled at build time: flexbox (`flex-row`/`flex-col`, `items-*`, `justify-*`,
`gap-*`, `grow`, `wrap`), spacing (`p-*`, `px-*`, `m-*`), sizing (`w-*`, `h-*`, `w-full`, `h-full`, `w-[120px]`),
colors (`bg-slate-900`, `text-amber-400`, gradients), `rounded*`, shadows, borders (all sides, or `border-t` / `border-x-2` / `border-b-[3px]` per side), typography
(`text-2xl`, `font-bold`, `text-center`), and `focus:` / `active:` variants. A text color set on any element
(`<View className="text-zinc-500">`) is inherited by the text inside it, like CSS `color`. Import a CSS file to define named classes compiled to
the same tokens:

```tsx
import './app.css';    // .card { padding: 12px; background: #1e293b; border-radius: 8px }
<View className="card">…</View>
```

**Responsive**: `sm:` `md:` `lg:` `xl:` `2xl:` prefixes (640/768/1024/1280/1536 px) are re-evaluated when the window
resizes. Use them for layouts that follow the window.

## Scrolling and virtual lists

```tsx
<ScrollView className="h-full">…</ScrollView>                          <!-- or className="overflow-y-auto" -->
```

Scroll containers behave like iOS / macOS: fingers (trackpad, touch screen, mouse drag) move the content 1:1,
releasing starts an inertia with the release velocity (iOS deceleration), past an edge the content stretches (the
UIScrollView rubber band) and springs back with the velocity it had, and mouse-wheel notches ease to their target.
Trackpad deltas are resampled at frame time by the HAL, so uneven event timing never judders (details: docs/ui.md). Scrollbars fade in while scrolling; the keyboard focus is revealed. `overflow-hidden` and
scroll views clip their children inside the border and its rounded corners (anti-aliased), so borders stay visible
while the content moves. For long lists, build only the
visible rows:

```tsx
import { VirtualList } from 'zinc:ui/solid';
<VirtualList count={10000} itemHeight={28}>{(i) => <Text>row {i}</Text>}</VirtualList>
```

## Animations

Engine-driven, off the reactive path. Solid: `animate(ref, prop, to, { dur, easing, delay })` returns a promise;
`after(ms)` resolves after a delay. Or set `style={{...}}` from a signal for reactive transforms. See `examples/hero`.

## Fonts, assets and images

TTF glyphs are baked at build time for the sizes your program uses (Inter and JetBrains Mono ship in `lib/fonts`).

A font chosen while the program runs (a theme read from a project file, a size computed from the screen) comes from `loadFont`:

```ts
import { loadFont, drawText } from 'zinc:gfx';

const title = loadFont(theme.font, 18 * zoom);   // "fonts/Lora-Regular.ttf" from the assets, or a family: "sans", "sans-bold", "mono"
drawText(title, 20, 20, card.title, 0x111827, 255, 0);
```

- **Same pixels.** The glyphs are rasterized on first use with the baker's algorithm, so text at a size chosen at run time looks
  exactly like text at a size written in the program. A file of the assets that the program names only at run time is read from
  the assets then. A name that is an absolute path (a font of a folder the user opened) is read as `zinc:fs` reads it: it needs
  the `fs:read` permission for that path. `loadFont` returns -1 when there is no such file or the read is refused. On small targets that embed no font files, it returns the
  nearest baked size.
- **Characters.** A character that the sources and the text assets never contain (typed by the user, read from the network) is
  drawn from the font's TrueType file at the same size. A program with a text field (`<Input>`, `<TextArea>`, `TextInput`) keeps
  every character of its fonts for that. This costs about 370 KB more in the build (examples/ui/forms: 256 to 643 KB of
  resources): the files are no longer reduced to the characters the program shows.
- **Cost.** The first draw of a new size rasterizes its glyphs: about 0.6 ms for 37 glyphs at 24 px and 3 ms at 96 px on the
  development Mac; later draws take a few microseconds. A program that never calls `loadFont` and has no text field bakes exactly
  what it baked before, and its frames take the same time.

**Text that zooms.** A text drawn under `setTransform` keeps the layout of its font and takes its glyphs at the size it has on
screen. Wrap a block once at its designed size, then turn it and zoom it with one matrix: no word changes line, a line is exactly
`textWidth` times the scale wide, and the letters stay sharp.

```ts
import { font, drawText, setTransform, resetTransform } from 'zinc:gfx';

const body = font('sans', 16);
const lines = wrap(body, card.text, card.width);        // once, at the designed size
setTransform(cos * zoom, sin * zoom, -sin * zoom, cos * zoom, card.x, card.y);
for (let i = 0; i < lines.length; i++) drawText(body, 0, i * 22, lines[i], 0x111827, 255, 0);
resetTransform();
```

Do not pick a font per zoom (`font('sans', 16 * zoom)`) and wrap again: fonts come in whole pixels, so the widths do not follow
the zoom and the breaks move. The glyphs come from the font's TrueType file in sizes a quarter of an octave apart (8, 10, 11, 13,
16, 19, 23, 27, 32... up to 128 pixels), the first that is not below the size on screen, and are drawn at 84 to 103 % of their
size: a zoom through hundreds of scales makes at most 17 fonts of a family, each with the glyphs that were drawn. A scale within
84 to 103 % (a matrix that only turns or mirrors, a small zoom) keeps the font's own glyphs. On a target that embeds no font
file the nearest baked size serves, so bake the sizes a zoom reaches there.

Images: `<Image src="logo.png" />` draws an image of the `assets/` directory, baked into the executable at build time; `zinc:assets`
reads the directory's files at run time (where a built program finds it: [distribution](07-distribution.md#assets-of-a-built-program)); `zinc:gfx` can build runtime images (video frames, generated textures) and render-to-image. HiDPI is
automatic — resources are baked at the display scale (Retina ×2 on macOS, ×window `zoom`).

Sprites: `drawImage(image, x, y, w, h, alpha, radius)` draws a whole image, `drawImageRect` a rectangle of it (a frame of a
sprite sheet, a tile), mirrored or not, with the nearest texel for pixel art or the linear blend. `imageFromBytes` decodes a PNG or
a JPEG file at run time (a download, a file the user picked) into an image that keeps its transparency:

```ts
import { image, drawImageRect, imageFromBytes, destroyImage, ImageFlag } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';

const sheet = image('hero.png');                          // baked from assets/: 16x16 frames in a row
const skin = imageFromBytes(readBytes('skins/red.png'));  // decoded now; -1 when the bytes are not an image; destroyImage(skin) frees it
// frame 3 at four times its size, looking left: source x, y, w, h, then destination x, y, w, h, alpha 0..255, flags
drawImageRect(sheet, 3 * 16, 0, 16, 16, x, y, 64, 64, 255, ImageFlag.Nearest | ImageFlag.FlipX);
drawImageRect(skin, 0, 0, 16, 16, x, y, 16, 16);          // alpha 255 and the linear blend when left out
```

A sprite can also turn, take a colour and blend: after the flags come the rotation in radians (clockwise on the screen, around the
centre of the destination rectangle, on top of `setTransform`), a tint that multiplies its colour (`0xFFFFFF`: none) and a `Blend`
mode (`Normal`, `Add` for glows and sparks, `Multiply` for shadows, `Screen` for light). The GL renderer (the default window) draws
sprites as textured quads, one draw call for every run of sprites of the same image and blend mode; the software renderer draws the
same pixels and stays the reference. A turned sprite takes 15 floats of the frame's point pool (262,144 on desktops: about 17,000 per
frame).

```ts
import { drawImageRect, Blend, ImageFlag } from 'zinc:gfx';
drawImageRect(sheet, 0, 16, 16, 16, x, y, 32, 32, 255, ImageFlag.Nearest, angle, 0xff8040, Blend.Add);   // a spark, turning, orange
```

Runtime images (`createImage`, `imageFromBytes`, video frames, a camera's live view) are limited per profile. Past the limit they
return -1, with one warning, until an image is destroyed. The table of images grows by blocks of 64 entries, allocated when first
needed, so a program without runtime images allocates none of it. Each image's pixels (w x h x 4 bytes) come on top.

| profile | runtime images at once | table memory |
| --- | --- | --- |
| desktop (macOS, Linux), web | 4,096 | 2.5 KB per 64 images in use |
| devices (ESP32, PS2) | 64 | 1.8 KB once the first image exists |
| PS1 | 4 | 112 bytes |

A target sets another limit with `ZRT_DYN_IMAGES` (`targets/ps1/ps1.cmake`).

The source rectangle is in the pixels `imageWidth` and `imageHeight` report; what of it lies outside the image is not drawn. The
linear blend reads the texels just outside the rectangle, as a GPU does: keep a transparent pixel between the frames of a sheet
drawn at another size, or use `ImageFlag.Nearest`. The GPU renderer of a window draws the sprites the software renderer draws.
A sprite follows `setTransform` like the other boxes: turn it, stretch it or mirror it with the matrix, around its own origin.

## WebGL from Zinc code (`zinc:gl`)

`zinc:gl` gives compiled Zinc code WebGL without a JS engine. Its calls go straight to the engine's WebGL implementation, the same
one, with the same validation, that QuickJS programs use, and they run in the interpreter and in a program built with `zinc build`.

A context draws offscreen. `present(image)` copies its drawing buffer into a `zinc:gfx` image, which the program draws like any other:

```ts
import { createContext, Float32Array } from 'zinc:gl';
import { createImage, drawImage, onFrame } from 'zinc:gfx';

const gl = createContext(480, 360);            // null: no WebGL on this machine
const image = createImage(480, 360);
// ... shaders, buffers, textures as in WebGL: gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
onFrame(() => { if (gl === null) return; gl.clear(gl.COLOR_BUFFER_BIT); /* draw */ gl.present(image); drawImage(image, 0, 0, 480, 360, 255, 0); });
```

- **Coverage.** Every method of WebGL 1 and 2, and of the extensions the engine offers, keeps its WebGL name and argument order
  (`createContext(w, h, 2)` gives WebGL 2).
- **Types.** WebGL objects are typed handles (`WebGLBuffer`, `WebGLProgram`...). `Float32Array`, `Uint8Array`, `Uint16Array`,
  `Uint32Array` and the other typed arrays wrap a Zinc array; `readPixels` and `getBufferSubData` fill the one they are given.
- **Typed results.** What WebGL returns as `any` is a `GLParam`:
  `gl.getParameter(gl.VIEWPORT).numbers`, `gl.getShaderParameter(s, gl.COMPILE_STATUS).bool`, `.object` for a bound object's id.
- **Extensions.** `getExtension(name)` returns whether it is on, and its methods are the context's (`createVertexArrayOES`...).
- **Differences from WebGL.** A buffer allocated by size is `bufferDataSize`. A lost context has no DOM events, and `restoreContext`
  gives a new context. The decisions are D57.
- **Loading.** `zinc` loads WebGL (`libzn_webgl`, beside it) at the first `zinc:gl` call. A built program links it in. A program that
  does not import `zinc:gl` carries none of it.

## Windows

UI apps follow the window by default (responsive, live resize redraw); games keep a fixed surface and scale it. A program
that draws with `zinc:gfx` asks to follow the window with `onResize((w, h) => ...)`, called before the next frame with each
new size (zinc:ui does it for every app). `resize` in `zinc.json` wins over that request, in `zinc run` and in the programs
`zinc build` writes: `letterbox` keeps a UI app at its fixed size. Set per target in `zinc.json` `targets.<id>`, or with
`ZINC_*` env vars:

| option | env | meaning |
| --- | --- | --- |
| `zoom` | `ZINC_ZOOM` | window points = logical size × zoom (auto ×2 below 400 px) |
| `resize` | `ZINC_RESIZE` | `fill` (surface follows the window: the default of zinc:ui apps and of `onResize`) or `letterbox` (fixed surface, scaled: the default otherwise) |
| `pixelScale` | `ZINC_PIXEL_SCALE` | `density` (the default: frames are drawn at the zoom times the screen density, so text stays sharp) or `logical` (drawn at 1x and magnified with square pixels: pixel art, and 4 to 16 times fewer pixels to draw) |
| `fullscreen` | `ZINC_FULLSCREEN` | start fullscreen; F11 / Ctrl+Cmd+F toggles, Esc leaves |
| `kiosk` | `ZINC_KIOSK` | fullscreen, no cursor, always on top, quit shortcuts ignored |

```json
{ "targets": { "macos": { "width": 1024, "height": 600, "resize": "fill", "kiosk": true } } }
```

**Live resize.** While you drag the window's edge, the app re-lays out and redraws at each new size, as a native app or a browser
does: the frame is never an old one stretched, and animations, timers, video and camera pictures keep going during the drag. On
macOS the system holds the app's loop while the edge is held (and while the green button zooms or a window is tiled); Zinc runs
the program's frames from inside that loop, one per size change and at the display's rate while the mouse holds still. The
window's own colour follows the app's background, so a growing edge shows that colour, not white or black, until the next frame.

Size limits and the proportions of the window go in `zinc.json` `app.window`: the edge stops at them, in `zinc run` and in the
programs `zinc build` writes.

| `app.window` key | meaning |
| --- | --- |
| `minWidth`, `minHeight` | the smallest size, in points |
| `maxWidth`, `maxHeight` | the largest size, in points |
| `aspectRatio` | width / height the window keeps while resized (`1.7778` for 16:9) |

```json
{ "app": { "window": { "width": 900, "height": 600, "minWidth": 480, "minHeight": 320, "maxWidth": 1600 } } }
```

On Android (`zinc export --target android`) the window always fills the screen; `targets.android` is baked into the app for
every build. `fullscreen` hides the status bar and the navigation buttons (immersive mode: a swipe from the edge shows them for
a moment, and the program then gets the whole screen). `kiosk` does that, keeps the screen on while the app is in front, and
keeps the back button from closing the app (Home still leaves it). Without `kiosk` the screen sleeps after the system's delay,
as with any phone app; a program that must stay visible asks for it with `navigator.wakeLock.request('screen')`.

```json
{ "targets": { "android": { "kiosk": true } } }
```

On macOS, `zinc` loads the window (`libzn_window`, beside it: SDL3 and the system's GUI frameworks) when a program first
opens one, so `zinc check`, `zinc build` and console programs start without it (`ZINC_WINDOW_LIB` names another copy).
Without the module a program that draws runs headless and says why. A built program links the window in; `zinc fuse`
puts the module inside the fused executable.

### More than one window

An app can open windows beside the main one: an editor next to the played level, a storyboard next to its preview. Each
window has its own surface, input and frame callback; they all share the program's state.

```ts
import { onFrame, openWindow, closeWindow, windowOpen, clear, rect, width } from 'zinc:gfx';

onFrame((dt) => { clear(0x203040); /* the main window */ });
const preview = openWindow('Preview', 640, 360, (dt) => {
  clear(0x000000);                 // drawn after the main window, every frame
  rect(10, 10, width() - 20, 40, 0xffcc00);
});
```

- **Drawing.** While a window's callback runs, every `zinc:gfx` call, `width()`, `height()` and the input (`pointerX()`, the
  button and key events, the wheel) are that window's. `openWindow(title, w, h, cb)` takes the size in logical pixels and returns
  the window's id, or -1 when no window can open. The surface follows the window when the user resizes it.
- **Closing.** The user's close button, or `closeWindow(id)`, closes one window; the others go on. Closing the main window
  (id 0) hides it while other windows are open, and its `onFrame` stops. Closing the last window ends the program.
  `windowOpen(id)` tells whether a window is still open.
- **zinc:ui.** `mountWindow(title, w, h, root, background)` (or `renderWindow(title, w, h, App, background)` from
  `zinc:ui/solid`) shows a tree in a window of its own. Each window has its own layout, focus, hover, overlays and gestures,
  over the same nodes, signals and styles. A change one window makes to the other's tree redraws the other one.
- **Limits.** Up to 8 windows besides the main one. They are drawn on the CPU at the main window's pixel density and shown with
  their own renderer. The arrow-key pad and smooth trackpad scrolling stay the main window's (other windows scroll by wheel
  steps). `zinc:gl` draws in the main window only. The QuickJS engine (`--engine quickjs`) opens windows like the others.
- **Tests.** In headless runs the windows draw too. `ZINC_SHOT=frame.png` also writes `frame-w1.png` for window 1, and so on.
  A `ZINC_INPUT` script (one `<frame> <event>` per line: `move X Y`, `down`, `up`, `key NAME`, `text STRING`...; `down meta`, `key a meta` or `shift+meta` add the modifiers held) sends the
  events after `window N` in a frame to window N, and `close` closes that window, as the user would.

### Windows as objects, and messages between them

`zinc:system/window` wraps these windows the way Electron's `BrowserWindow` does, and `zinc:worker` carries messages between
them as Electron's `ipcRenderer.invoke` / `ipcMain.handle` or the web's `MessageChannel` do:

```ts
import * as win from 'zinc:system/window';
import { MessageChannel } from 'zinc:worker';

interface Note { text: string; n: i32 }
const tools = win.open({ title: 'Tools', width: 260, height: 400 }, (dt) => { /* draws the window */ });
const preview = win.get(ui.mountWindow('Preview', 320, 240, previewRoot, 0xffffff));   // a zinc:ui tree
tools.setPosition(40, 60); tools.setSize(300, 420); tools.focus();
for (const w of win.list()) console.log(w.id, w.bounds().w);   // the open windows, the main one (id 0) first

const ch = new MessageChannel<Note, Note>();                   // port1 posts the first type, port2 the second
ch.port2.onmessage = (e) => console.log(e.data.text);
ch.port2.handle((m) => ({ text: `${m.n} items`, n: m.n }));   // answers requests
ch.port1.postMessage({ text: 'hello', n: 1 });
const reply = await ch.port1.request({ text: 'count', n: 3 });
```

- **Windows.** `open(options, draw?)` returns an `AppWindow` (`id`, `close()`, `isOpen()`, `focus()`, `setTitle()`,
  `setPosition()`, `setSize()`, `setBounds()`, `bounds()`); `get(id)` wraps a window opened another way (0 is the main
  window); `list()` gives the open ones and `current()` the one being drawn. In headless runs the bounds are what was asked.
  `focus()` does nothing in a program started in the background (`ZINC_BACKGROUND=1`).
- **Messages.** A port posts one type and receives the other; messages are delivered as microtasks, never inside `postMessage`.
  `request(m)` resolves with what the other side's `handle` returns, so a reply has the type the other side posts.
- **A window run by a worker.** A worker cannot draw, but it can compute a window's scene: a `Scene` (a background and a list
  of `Shape`s: `rect`, `rrect`, `text`, `line`) is plain data. Open the window without a draw callback and give it each
  scene that arrives; a busy worker then leaves the other windows drawing at full rate, and its window keeps its last scene.

```ts
import { Worker, Envelope, workerPort } from 'zinc:worker';        // the program
const port = workerPort<Cmd, Reply>(new Worker<Envelope<Cmd>, Envelope<Reply>>(new URL('./scene.worker.ts', import.meta.url)));
const side = win.open({ title: 'Simulation', width: 400, height: 300 });
port.onmessage = (e) => side.setScene(e.data.scene);

import { parentPort } from 'zinc:worker';                           // scene.worker.ts
import type { Scene } from 'zinc:system/window';
const parent = parentPort<Reply, Cmd>();
parent.onmessage = (e) => parent.postMessage({ scene: step(e.data) });
```

  The worker's port works on the interpreter, in compiled builds and on QuickJS. A whole `zinc:ui` tree runs on the main thread only.

## The device

`zinc:device-info` says what the program runs on, as Expo's `expo-device` does: a phone, a tablet, a desktop or a TV, its maker, its model and its
system. A layout that changes for a tablet asks it once:

```ts
import * as Device from 'zinc:device-info';

const wide = Device.deviceType === Device.DeviceType.TABLET || Device.deviceType === Device.DeviceType.DESKTOP;
console.log(`${Device.modelName} (${Device.modelId}), ${Device.osName} ${Device.osVersion}`);   // iPad Pro (12.9-inch) (1st generation) (iPad6,7), iPadOS 16.7
```

| Field | iOS | Android | macOS | Linux |
| --- | --- | --- | --- | --- |
| deviceType | the system's idiom (an iPad is a tablet) | TV in the television mode, tablet from a smallest width of 600 dp, else phone | desktop | desktop on a PC, unknown on a board |
| brand, manufacturer | Apple | Build.BRAND, Build.MANUFACTURER | Apple | the PC's maker (DMI) |
| modelName | the name Apple sells it under | Build.MODEL | the family (MacBook Pro, iMac...) | the board's model (Raspberry Pi 3 Model B Plus Rev 1.3) or the PC's product name |
| modelId | iPad6,7, iPhone18,3 | (empty) | MacBookPro16,1 | the board's compatible string |
| designName | (empty) | Build.DEVICE | (empty) | (empty) |
| osName, osVersion, osBuildId | iOS or iPadOS, 16.7, 20H240 | Android, 14, Build.ID | macOS, 15.6, its build | the distribution's NAME and VERSION_ID, the kernel |
| totalMemory, supportedCpuArchitectures, isDevice | bytes, arm64, false in the simulator | bytes, the ABIs, false in the emulator | bytes, the machine's | bytes, the machine's |

A field the platform cannot know is `''` (0 for `totalMemory`), never a guess: a new iPhone missing from Zinc's table of names has its
`modelId` and an empty `modelName`. `Platform.isPad`, `Platform.isTV` and `Platform.constants` of `zinc:react-native` come from the same
record, and so does `navigator.deviceInfo`. On the desktop, `ZINC_PLATFORM=ios` or `android` answers a simulated phone (`isDevice` false);
`ZINC_DEVICE_MODEL=iPad6,7` makes it that iPad, `ZINC_DEVICE_TYPE=tablet` or `tv` an Android tablet or TV.

## Per-target constraints

| target | constraint |
| --- | --- |
| `esp32` | 160 KiB heap (without PSRAM it spans several internal RAM blocks; a UI node costs ~0.5 KiB, a reactive class or text a few hundred bytes more: mount one page at a time, [ESP32-2432S022 demo](../../examples/boards/esp32-2432s022)), `f32` numbers, strict profile; small screens via display drivers (SSD1306, ST7789 SPI/i80, WS2812) |
| `ps1` | 256 KiB heap, Q20.12 fixed point, **no FPU** (the rasterizer runs in software) |
| e-ink (`rmpp`) | slow refresh; the driver manages refresh policy — avoid per-frame full redraws, prefer damage |
| LED matrices / OLED | tiny surface (e.g. 32×8); use `zinc:pixelfont` for text, expect only a handful of draw commands per frame |
| `wasm` | canvas HAL at 1× density |

**Platform-specific files.** Next to `Keyboard.tsx`, a `Keyboard.android.tsx`, `Keyboard.ios.tsx`, `Keyboard.esp32.tsx` (any platform or profile
name) replaces it when building for that platform, and `Keyboard.native.tsx` for every platform but the web; imports keep writing `./Keyboard`.
The order is React Native's (Metro): `Keyboard.<platform>`, then `Keyboard.native`, then `Keyboard`. The files of the other platforms are not
compiled in. The `moduleSuffixes` that `zinc new` writes in `tsconfig.json` let the editor follow the same rule; the table and an example are in
[React Native on Zinc](../react-native.md#platform-specific-files).

Screens that aren't the default window are **display plugins** — pick one in `zinc.json` (`"display": "ssd1306"`; `"displays": ["sidecar"]`
links one on demand, which a second process of the app takes with `ZINC_DISPLAY`); the
program still draws with `zinc:ui`/`zinc:gfx` and the driver converts the damaged rows. See [plugins](05-plugins.md)
and [docs/plugins/displays.md](../plugins/displays.md). Next: [headless services](04-headless-services.md).
