# {{name}}

## Next steps

- `zinc dev`: runs it; every save shows at once.
- Change `src/main.ts` and save.
- Learn the Canvas style, a lesson at a time: https://frulko.github.io/zinc/docs/learn/17-paths-and-fills/
- The four ways to write a program: https://frulko.github.io/zinc/docs/start/styles/
- `zinc tour`: a guided first walk.

A sketch made from the `canvas` template: it draws with the web's Canvas API (`zinc:canvas`), so canvas code from a web page or a
tutorial ports with few changes. There is no page and no `<canvas>` element: `zinc:gfx`'s `onFrame` calls your function about 60 times a
second, and `ctx.begin(0, 0, width(), height())` ... `ctx.end()` makes the whole window the canvas.

```sh
zinc run     # a turning star on a gradient sky; click to blow bubbles
zinc test    # the tests of tests/
zinc build   # a native executable in build/
```

| File | What it does |
|---|---|
| `src/main.ts` | the frame loop: a gradient sky, a star turned with `translate` and `rotate`, bubbles that rise and fade, text |

Two spellings differ from the web: a gradient is set with `ctx.fillGradient = g` (not `ctx.fillStyle = g`), and the pointer is read
from `zinc:gfx` (`pointerX()`, `pointerY()`, `pointerDown()`) instead of `addEventListener`. Every function and the other differences:
https://frulko.github.io/zinc/docs/plugins/canvas2d/
