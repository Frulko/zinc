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
| Its start and natives | `next/src/qjs/webenv.cpp` | decides (ZINC_WEB, `zinc.json`), and gives JavaScript what it cannot do alone, over host rows that exist: a file's or a response's bytes as an `ArrayBuffer`, UTF-8 decoding, `structuredClone` (QuickJS's serializer), a script run as global code, a module's namespace at once |
| Frames | `next/src/qjs/qjs.cpp` | the engine enters its frame loop when `globalThis.__zincFrameCb` is a function (ZN-566): the first `requestAnimationFrame`, or the first canvas put in the document, sets it |
| WebGL | `next/src/gl` (libzn_webgl), untouched | `document.createElement('canvas')` is the module's canvas object given an element's class and fields; `__srcPixels` hands it the pixels of a DOM texture source |

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
- **Frames and time**: `requestAnimationFrame` on the engine's frame loop with `performance.now()` timestamps. A deterministic run
  (`ZINC_DETERMINISTIC`) reads the virtual clock through `performance.now` too (steps of 16.67 ms), a real run the real one. Timers are the
  engine's (virtual clock, advanced by the frame time).
- **Network and storage**: `fetch`, `Request`, `Response`, `Headers`, `XMLHttpRequest` over project files (through the host's file row, so
  permissions hold; a missing file is a 404), `data:` and `blob:` URLs, and http(s) through `zinc:net`'s rows with the body as its bytes; `URL` and
  `URLSearchParams` (the typed engine's WHATWG parser, `lib/std/web.ts`, loaded at the first URL made), `Blob`, `File`; `localStorage` over
  `zinc:storage`, `sessionStorage` in memory.
- **Canvas**: `getContext('webgl' | 'webgl2')` is the existing binding with the element as `gl.canvas`; each frame the window shows the canvases
  of the document that have a context, over black, at the box their style gives them (through `gl.zincPresent`, a read).

## What is not there, and says so

- **Layout**: none. A box is what the style says (px, %, vw, vh), else the window for `html` and `body`, the bitmap for a canvas, the parent's
  width and no height for the rest, all at the origin.
- **Canvas 2D** (ZN-570): `getContext('2d')` gives a context that takes every call and draws nothing; the first one prints a notice.
- **Images** (ZN-569): an `Image` exists; a `src` gets the element's `error` event and one notice. **Audio** (ZN-573): media elements play
  nothing; no `AudioContext`. **Gamepads** (ZN-574): `navigator.getGamepads()` is empty.
- `innerHTML` with markup (kept as text), `DOMParser`, `FormData`, streams, cookies, `Worker`, the window's `focus` / `blur` /
  `visibilitychange`, `canvas.toDataURL`.

## Libraries (2026-10-11, unmodified builds, no shim in the test)

| Library | State | Test |
|---|---|---|
| p5.js 1.11.13 | boots and draws in WEBGL mode; its 2D mode waits for ZN-570 | `tests/t1/webenv_p5.sh` |
| three.js r186 | boots, animates, OrbitControls turns the camera by a scripted drag | `tests/t1/webenv_three.sh` |
| PixiJS 7.4.3 | boots, animates, its sprites hear the pointer; a Graphics fill waits for ZN-570 | `tests/t1/webenv_pixi.sh` |
| PixiJS 8.22.0 | stops in the WebGL binding (ZN-565: a WebGL 2 context is `instanceof WebGLRenderingContext`); its page and golden are ready and the test runs them once that is fixed | `tests/t1/webenv_pixi.sh` |
| Phaser 3.90.0 | stops in its batch shader (ZN-565) and waits for its default textures (ZN-569); the environment asks nothing more | none yet |

## Tests

`tests/t0/webenv.sh` (globals, tree, events, frames and input, files, `data:` and `blob:` URLs, http against a local server, storage, scripts,
the trace), `tests/t1/webenv_canvas.sh` (the canvas on WebGL and in the window), and one T1 test per library above. Their programs and goldens
are in `tests/golden/webenv/`. PixiJS and three.js (MIT) are test data in `third_party/pixi` and `third_party/three`. p5.js is LGPL-2.1, which
`next/RULES.md` §3 keeps out of the tree: `next/tools/test-lib p5-1.11.13` takes `lib/p5.min.js` of p5's npm release once into
`${ZINC_HOME:-~/.zinc}/cache/test-libs/`, checks it against the sha256 pinned in the tool and prints its path; `webenv_p5` hands that path to
its page, and is skipped (exit 77, the reason in its first line) when the file is neither cached nor downloadable.
