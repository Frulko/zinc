# js-p5

A wave of boxes, a [p5.js](https://p5js.org) sketch (1.11.13, unmodified) in WEBGL mode, written in global mode as the p5 editor writes it: `setup`, `draw`, lights, and the pointer that turns and tilts the wave.

![the wave](screenshot.png)

```sh
cd next
tools/test-lib p5-1.11.13          # once: downloads p5.js
build/zinc run ../examples/js-p5 --engine quickjs
```

Move the pointer left and right to turn the wave, up and down to tilt it. The sketch fills the window (`ZINC_SIZE=800x500` before the command opens a larger one).

p5.js is under the LGPL, so this repository does not carry it. `tools/test-lib p5-1.11.13` takes `p5.min.js` from p5's own npm release, checks it against a pinned sha256 and keeps it in Zinc's cache (`~/.zinc/cache/test-libs/`), where `main.js` looks for it.

How it fits together:

- `zinc.json` has `"web": true`: the program gets a `window`, a `document` and WebGL, as a page in a browser does.
- `main.js` is the page: it loads p5.js, then `sketch.js`, as two `<script>` tags would.
- `sketch.js` is the sketch, thirty lines. It runs as it is in the p5 editor; nothing in it is special to Zinc.

Not there yet: only WEBGL mode. A sketch with a plain `createCanvas(w, h)`, and `text()` in both modes, draw with Canvas 2D, which draws nothing yet (ZN-570; p5's start-up checks print one line about it).

Test: `next/tests/run --only example_js_p5` (a scripted pointer, then frame 30 against `screenshot.png`).
