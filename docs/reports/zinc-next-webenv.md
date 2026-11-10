# The web environment of the QuickJS engine (ZN-568)

JavaScript game libraries are written for a browser: they expect a `window`, a `document`, events, `requestAnimationFrame`, `fetch` around
the WebGL they draw with. The web environment gives a QuickJS program that browser, as far as PixiJS, Phaser, p5.js and three.js ask for it
(the traces of `docs/reports/games/js-game-libraries.md`, section 3.1) and no further. It is not a DOM implementation: the decision and its
scores (a thin environment of our own, 67, against a DOM library in JavaScript inside QuickJS, 43) are in the notes of ZN-568.

## Turning it on

Off by default: a program that does not ask gets none of it and pays nothing (zinc carries no byte of the environment's JavaScript).

- `"web": true` in `zinc.json` (an object is accepted too, its keys kept for later: `webgl`, `canvas2d`, `audio`, `gamepad`);
- or `ZINC_WEB=1 zinc run main.js --engine quickjs` for a single file; `ZINC_WEB=0` turns a project's environment off;
- `ZINC_WEB=trace` also prints, once each on stderr, the members a library reads on `window`, `document` or `navigator` and does not find
  (`web: unknown window.AudioContext`): the way to see what a new library misses.

The page's address is `file://<project directory>/index.html` (the directory of `zinc.json`, else the entry's): relative URLs resolve there.

## How it works

| Piece | File | What it does |
|---|---|---|
| The environment | `lib/std/webenv.js` | one JavaScript file, read from `lib/std` when asked and evaluated before the program's module |
| Its start and natives | `src/qjs/webenv.cpp` | decides (ZINC_WEB, `zinc.json`), and gives JavaScript what it cannot do alone, over host rows that exist: a file's or a response's bytes as an `ArrayBuffer`, UTF-8 decoding, `structuredClone` (QuickJS's serializer), a script run as global code, a module's namespace at once |
| Frames | `src/qjs/qjs.cpp` | the engine enters its frame loop when `globalThis.__zincFrameCb` is a function (ZN-566): the first `requestAnimationFrame`, or the first canvas put in the document, sets it |
| WebGL | `src/gl` (libzn_webgl), untouched | `document.createElement('canvas')` is the module's canvas object given an element's class and fields; `__srcPixels` hands it the pixels of a DOM texture source |

What a program finds:

- **Window**: the global object itself (`window`, `self`, a bare `addEventListener`), `navigator` (a desktop Chrome by name, the host's platform, locale
  and cores), `location`, `screen`, `innerWidth`, `innerHeight`, `devicePixelRatio` (the host's at each read), `matchMedia` (nothing matches),
  `getComputedStyle`, `postMessage`, `MessageChannel`, `ResizeObserver`, `MutationObserver` (inert), `structuredClone`, `reportError`.
- **Document**: `html`, `head`, `body`; elements with attributes, `classList`, a `style` object, `dataset`; text nodes and fragments; the simple
  selectors (tag, `#id`, `.class`, `[attr]`, `[attr=v]`, descendant and child, comma lists; anything else is a `SyntaxError` naming it);
  `DOMContentLoaded` and `load` after the program's module. A `<script>` put in the document runs (a classic script as global code, so a UMD
  library or a p5 sketch works as in a page; `type="module"` through `import()`).
- **Events**: capture, target and bubble phases along the parents, then the document, then the window; `once`, `passive`, `signal`, listener
  objects, `on<type>` handlers. Each frame the host's input (the window's, or a `ZINC_INPUT` script's) becomes pointer, mouse, wheel, keyboard
  and touch events, dispatched once at their target (the canvas under the pointer, the capturing element, the focused element) and left to
  bubble: PixiJS's listeners on the document and the window and Phaser's on the window are reached without a table per library.
  A finger is a pointer of its own (`pointerType` `touch`, its own `pointerId`, the first finger `isPrimary`) and also a `TouchEvent`.
  Shift, Control, Alt and Meta pressed or released alone are `keydown` / `keyup` events of their own (`ShiftLeft`, keyCode 16...), from
  the change of the held modifiers the host reports (ZN-705); every key and pointer event carries the held ones.
- **Focus and visibility** (ZN-705): the system's signals (zinc:gfx `signalCount` / `signalNext`, as zinc:ui reads them: the window HAL's
  `focus 1|0`, `background` / `foreground` for a window minimised or hidden and shown again, or a `ZINC_INPUT` script's lines) are the
  window's `focus` and `blur` and the document's `visibilitychange`, with `document.hidden`, `visibilityState` and `hasFocus()`. A hidden
  page runs no animation frame, as a browser's background tab; its callbacks run when it shows again.
- **Frames and time**: `requestAnimationFrame` on the engine's frame loop with `performance.now()` timestamps. A deterministic run
  (`ZINC_DETERMINISTIC`) reads the virtual clock through `performance.now` too (steps of 16.67 ms), a real run the real one. Timers are the
  engine's (virtual clock, advanced by the frame time).
- **Network and storage**: `fetch`, `Request`, `Response`, `Headers`, `XMLHttpRequest` over project files (through the host's file row, so
  permissions hold; a missing file is a 404), `data:` and `blob:` URLs, and http(s) through `zinc:net`'s rows with the body as its bytes; `URL` and
  `URLSearchParams` (the typed engine's WHATWG parser, `lib/std/web.ts`, loaded at the first URL made), `Blob`, `File`, `FormData` (sent as
  `multipart/form-data` with its boundary; a `URLSearchParams` or string body brings its Content-Type too, ZN-705); `localStorage` over
  `zinc:storage`, `sessionStorage` in memory, both by their methods and as properties (`localStorage.best = 3`, `delete`, `Object.keys`).
- **XML** (ZN-706): `DOMParser` and `XMLSerializer` are `@xmldom/xmldom` 0.9.12 (`third_party/xmldom`, MIT, unmodified), its CommonJS files
  read by the engine (`native.xmldom`, from `lib/std/../../third_party`, in the repository and in share/zinc) at the first parse: a program
  that parses nothing reads none of it (`ZINC_WEB=trace` prints `web: loaded @xmldom/xmldom (N ms)`). A bitmap font and an SVG give the
  nodes headless Chrome gives (`tests/t0/webenv_domparser.sh`); the document has no node for the XML declaration or the blanks around the
  root, the element traversal getters (`firstElementChild`, `nextElementSibling`...) and the simple selectors (`querySelector`, `matches`,
  `closest`) are added to xmldom's prototypes, and a document that is not well formed is a `<parsererror>` document (Firefox's shape), not
  an exception. An XML document's nodes are xmldom's: no events, and they cannot go into the page's document. `XMLSerializer` writes a
  namespace declaration it adds after the attributes, where Chrome writes it first.
- **Canvas**: `getContext('webgl' | 'webgl2')` is the existing binding with the element as `gl.canvas`; each frame the window shows the canvases
  of the document that have a context, over black, at the box their style gives them (through `gl.zincPresent`, a read).
- **Images** (ZN-569): `Image` / `HTMLImageElement` loads its `src` as `fetch` does (files, `data:` and `blob:` URLs, the network) and the
  engine's codec decodes it (PNG, JPEG, BMP, a GIF's first frame, WebP: `src/res/codec.h`). The events come in a browser's order:
  `complete` false at once, then in a task of its own the natural size with `load`, or `error`; `decode()`; a `src` set again abandons the
  load before it. An image is a WebGL texture source and obeys `UNPACK_FLIP_Y_WEBGL` and `UNPACK_PREMULTIPLY_ALPHA_WEBGL`. A picture
  of more than 2^26 pixels (8192 x 8192) is refused from its header, by name. Decoding is on the main thread: 34 ms for a 1024 x 1024 PNG,
  415 ms for a 4096 x 4096 one on the development Mac (the numbers and the follow-up are in the notes of ZN-569).

## What is not there, and says so

- **Layout**: none. A box is what the style says (px, %, vw, vh), else the window for `html` and `body`, the bitmap for a canvas, the parent's
  width and no height for the rest, all at the origin.
- **Canvas 2D** (ZN-570, the text-first tier): `getContext('2d')` draws on a bitmap of its own. `src/qjs/canvas2d.cpp` binds canvas_ity
  (`third_party/canvas_ity`: paths, strokes, dashes, clip, linear and radial gradients, shadows, eleven compositing operations, `drawImage`,
  `getImageData`, `putImageData`) and the engine's text tier (`src/text`: HarfBuzz shaping and the font's metrics; the glyph outlines go to
  canvas_ity as a path, so text is kerned, stroked, shadowed, filled with a gradient and transformed like a shape). `lib/std/webenv.js`
  keeps the state a program reads back and parses CSS colours and the `font` shorthand. Families: a `FontFace` of the program's own files
  (`document.fonts`; never from the network), else the bundled Inter (regular, bold) and JetBrains Mono. A 2D canvas of the document is shown
  in the window; any canvas is a texture source (`texImage2D`) and a `drawImage` source. Against headless Chrome with the same font:
  `measureText` widths equal, TextMetrics, baselines and glyph boxes within a pixel, a scene of game text at SSIM 0.99
  (`tests/t1/webenv_canvas2d.sh`; `tools/canvas2d-ref` makes the references). The full tier (ZN-572) stays on
  canvas_ity, patched (decision of ZN-571: with a context that does nothing, p5 and QuickJS alone already take 30 ms for 1,000 ellipses,
  so a faster rasteriser is not what is missing). There so far (`tests/t1/webenv_canvas2d_full.sh`): `Path2D` (its calls, SVG path data,
  `addPath` with a matrix) filled, stroked, clipped and hit-tested; the even-odd rule; `imageSmoothingEnabled` (false: the nearest pixel;
  true: bilinear, and a filter over more pixels when the picture is made smaller); `toDataURL` and `toBlob` (PNG, JPEG);
  `OffscreenCanvas` (a canvas element outside the document); a canvas is read back only when something was painted on it; a picture
  that is not turned or made smaller is blended by a loop of its own, which makes each row of the picture colours once; the 26 values of `globalCompositeOperation` (the 15 blend modes
  within 1 of Chrome's numbers, `modes.js` against `modes-chrome.out`) and patterns as `fillStyle` and `strokeStyle` (the four
  repetitions, `CanvasPattern.setTransform`, the nearest pixel or four at any scale as Chrome's default quality takes, ZN-1042); conic gradients;
  `isPointInStroke`, and `isPointInPath` by the even-odd rule. A script element waits for the data:, blob: and file: pictures being
  loaded before it runs, as a browser has them by then (Phaser's blend-mode probe, ZN-1042). Not there yet, counted and never thrown (`__canvas2dUnsupported()`,
  named by `ZINC_WEB=trace`): `filter`; italic is drawn upright.
- **Images**: no `createImageBitmap` and no `ImageBitmap`, on purpose, as long as there is no `Worker`: PixiJS 7 and 8, finding
  `createImageBitmap`, load every picture through a Worker they make without looking for one, and `Assets.load` fails; without it they,
  three.js and Phaser load pictures through image elements, unmodified (measured: the notes of ZN-569). Nothing is decoded off the main
  thread; SVG and animated pictures are not images here. **Audio** (ZN-573): media elements play nothing; no `AudioContext`.
  **Gamepads** (ZN-574): `navigator.getGamepads()` is empty.
- `innerHTML` with markup (kept as text), a `FormData` of a form element (there are no form controls), a binary body over http (sent
  as UTF-8 text), streams, cookies, `Worker`, `toDataURL` of a WebGL canvas, the web environment in a `zinc:script` sandbox.

## Libraries (updated 2026-11-10, unmodified builds, no shim in the test)

| Library | State | Test |
|---|---|---|
| p5.js 1.11.13 | boots and draws in WEBGL mode, and in its default 2D mode (shapes, rounded rectangles, text: SSIM 0.99 against Chrome, ZN-570) | `tests/t1/webenv_p5.sh`, `tests/t1/webenv_canvas2d_libs.sh` |
| p5.js 2.3.4 | boots in global mode, runs setup and draws a WEBGL box on frames 1 and 5; native Promise retained, flat-colour pixels and GL error match 1.11.13 (ZN-707) | `tests/t1/webenv_p5.sh`, separate `page-v2.out` golden |
| three.js r186 | boots, animates, OrbitControls turns the camera by a scripted drag; `TextureLoader` shows a picture from a file | `tests/t1/webenv_three.sh` |
| PixiJS 7.4.3 | boots, animates, its sprites hear the pointer; `Assets.load` shows a picture from a file; a Graphics fill and a Text draw since ZN-570 (seen in a frame, not in a test) | `tests/t1/webenv_pixi.sh` |
| PixiJS 8.22.0 | boots, animates, a Graphics square hears the pointer (since ZN-565: a WebGL 2 context is no longer `instanceof WebGLRenderingContext`, and `#define in attribute` compiles); `Assets.load` shows a picture from a file; Text (fill, stroke, drop shadow, alignment, word wrap) at SSIM 0.98 against Chrome (ZN-570) | `tests/t1/webenv_pixi.sh`, `tests/t1/webenv_canvas2d_libs.sh` |
| Phaser 3.90.0 | boots and animates on WebGL 1: its shaders compile (ZN-565), its default textures and a picture from a file load (ZN-569), its keyboard and pointer hear scripted input; its Text objects (fill, stroke, shadow, background, alignment) at SSIM 0.98 against Chrome (ZN-570) | `tests/t1/webenv_phaser.sh`, `tests/t1/webenv_canvas2d_libs.sh` |

## Tests

`tests/t0/webenv.sh` (globals, tree, events, frames and input, files, `data:` and `blob:` URLs, http against a local server, storage, scripts,
the trace, image elements), `tests/t0/webenv_domparser.sh` (XML against Chrome's DOMParser, loaded at the first use), `tests/t0/webenv_page.sh` (focus and visibility, modifier keys, FormData, storage
properties, each on a page of `tests/golden/webenv/page`), `tests/t0/webenv_touch.sh` (fingers as pointers), `tests/t1/webenv_canvas.sh` (the canvas on WebGL and in the window), `tests/t1/webenv_image.sh`
(images as textures, read back against a picture of known colours), `tests/t1/webgl_libs.sh` (the binding defects libraries
found, ZN-565) and one T1 test per library above. Their programs and goldens are in `tests/golden/webenv/`. PixiJS, three.js and Phaser (MIT)
are test data in `third_party/pixi`, `third_party/three` and `third_party/phaser`. p5.js is LGPL-2.1, which
`RULES.md` §3 keeps out of the tree: `tools/test-lib p5-1.11.13` and `tools/test-lib p5-2.3.4` take `lib/p5.min.js` of each pinned npm release once into
`${ZINC_HOME:-~/.zinc}/cache/test-libs/`, checks it against the sha256 pinned in the tool and prints its path; `webenv_p5` hands that path to
its page, and is skipped (exit 77, the reason in its first line) when the file is neither cached nor downloadable.


### ZN-707 direct boot proof (2026-11-10)

The existing PixiJS 8.22.0 page (10 deterministic frames with `pointer.input`) and image page (4 frames)
match their log goldens, including ticker frames, pointer events, decoded ImageBitmap colours and GL error 0.
The existing p5 WEBGL page matches the retained 1.11.13 golden and the new 2.3.4 golden (8 frames each).
No library source or sketch changed. The existing p5 harness runs both pinned versions sequentially.
The p5 2.3.4 npm metadata identifies LGPL-2.1; its archive SHA256 is
`af29afdfa8c5d1096fb1335d6160f7b17be12d1eb21e69782f47c57c05893a48`, and its 990,638-byte
`package/lib/p5.min.js` SHA256 is `bb8b82b97fcbcd5bb2d5475d1b6a3904f3ab4ed01b821134fd8f1e7710fce559`.
Both were independently checked against the official archive before adding the external-cache pin.

Phaser 3.90.0 boots, loads the picture, renders the exact expected pixels at scene frames 2 and 8 and
receives both scripted inputs, with GL error 0 and no uncaught exception. Its existing complete golden
currently differs: pointerdown logs frame 4 instead of 5, keydown logs frame 5 instead of 6, and the
frame-5 cursor state is already true. A second identical direct run reproduces the same difference.
The input script schedules those inputs at host frames 4 and 5; how those map to scene updates needs
review before changing the existing golden. The fixture and its expectations are preserved; ZN-707 AC1
stays open for this discrepancy. AC2 (the PixiJS 8 half) passes.

These are short direct fixture runs on the development Mac, using the common QuickJS compiler built
from `3e0925d48` (SHA256 `e5206875f798939a9c36115ef6d8df44be782b8e1e32aaef2dafe5439eae3461`)
and this tree's `ZINC_ROOT`. The T1 harnesses, other platforms, broader p5 2D/input/assets compatibility,
and long-run behaviour were not run. Babylon, LittleJS and Kaplay remain covered by the existing
`backlog/later.md` deferral, with no additional harness here.

References: [p5 2.3.4 npm metadata](https://registry.npmjs.org/p5/2.3.4),
[p5 v2 transition guide](https://p5js.org/tutorials/v2_transition/) (input and asset APIs changed; retain the
v1 pin), [PixiJS Application](https://pixijs.com/8.x/guides/components/application) (async `app.init()`),
[Phaser Game](https://docs.phaser.io/phaser/concepts/game) (normal game/scene boot).
