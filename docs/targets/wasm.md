# wasm: the interpreter on WebAssembly (ZN-135)

`next/tools/build-wasm` builds the ZBC interpreter with the pinned zig (`zig c++ -target wasm32-wasi`, no emscripten) into `build-wasm/`:

| file | what |
|---|---|
| `vm.wasm` | a WASI program: `vm.wasm program.zbc` decodes, verifies and runs a module (Node's WASI with `tests/wasm/run.mjs`, or wasmtime) |
| `vm-web.wasm` | the same runtime as a reactor for the browser: `zn_run(zbc, len)` and one import, `zn.gfx(id, args, result)`, for every zinc:gfx row |

The pure runtime (strings, arrays, Maps, classes, exceptions, closures, async with a virtual clock) is in; native modules, files, sockets and processes are not (the host rows answer "not available"). A program is compiled to `.zbc` with `zinc --emit=zbc-bin file.ts out.zbc` and loaded by the page.

## In a browser

`next/targets/wasm/glue/index.html?zbc=<file>&wasm=<vm-web.wasm>[&frames=N]` runs the program in a worker: zinc:gfx draws on an OffscreenCanvas (`worker.mjs`: rectangles, rounded rectangles, lines, text, clear, the baked images with `drawImage` and `drawImageRect`, the input rows), and the runtime's frame loop blocks on `Atomics.wait` until the page's next `requestAnimationFrame` tick, so no asyncify is needed. Keys, pointer and ticks reach the worker through a SharedArrayBuffer, which needs cross-origin isolation: serve the page with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Rows the glue does not draw yet (gradients, shadows, polygons, clip, runtime images) warn once in the console.

Images: `&res=<file>` (default `app.res` beside the page) is the blob of `zinc bake`; the worker puts each baked image on a canvas of its own and `image(name)` finds it. `drawImageRect` mirrors with the canvas transform and samples nearest with `imageSmoothingEnabled = false`; nearest sprites are the engine's pixels (translucent texels within 2 a channel: the canvas keeps premultiplied pixels). A linear sample stays inside the source rectangle on a 2D canvas, where the engine and a GPU read the texels around it. `imageFromBytes` answers -1 (no decoder in the page yet) and text is the browser's own, not the baked fonts.

## Tests

`tests/t2/wasm.sh`: the 18 programs of `corpus/M3-set.txt` print on WASI what `zinc run` prints in a deterministic run, with the same exit code. `tests/t2/wasm_browser.sh`: headless Chrome (driven over the DevTools pipe by `tools/wasm-browser-test`) runs breakout on `vm-web.wasm` and the last frame is checked (skipped without Chrome). `tests/t1/image_rect_wasm.sh`: the sprites of a sheet are the same frame in Chrome as in the interpreter, and the exported game-2d template shows its player and coins.
