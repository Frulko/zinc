# wasm: the interpreter on WebAssembly (ZN-135)

> To put a Zinc app in a browser as a normal web page (the app's JavaScript on the browser's own engine, canvas or DOM, hot reload, the plugins that have a web version), use
> `zinc export --target web` ([web.md](web.md)). This page is the other way: the bytecode interpreter of the engine in WebAssembly, for small console-style programs.

`tools/build-wasm` builds the ZBC interpreter with the pinned zig (`zig c++ -target wasm32-wasi`, no emscripten) into `build-wasm/`:

| file | what |
|---|---|
| `vm.wasm` | a WASI program: `vm.wasm program.zbc` decodes, verifies and runs a module (Node's WASI with `tests/wasm/run.mjs`, or wasmtime) |
| `ktx2-web.wasm` | optional Basis Universal 2.50 texture decoder: a separate reactor downloaded only on the first KTX2 image lookup |
| `vm-web.wasm` | the same runtime as a reactor for the browser: `zn_run(zbc, len)` with `zn.gfx(id, args, result)` for zinc:gfx and `zn.native_call` for browser plugin backends |

The pure runtime (strings, arrays, Maps, classes, exceptions, closures, async with a virtual clock) is in; WASI native modules, files, sockets and processes are not (the host rows answer "not available"). A program is compiled to `.zbc` with `zinc --emit=zbc-bin file.ts out.zbc` and loaded by the page.

## In a browser

`targets/wasm/glue/index.html?zbc=<file>&wasm=<vm-web.wasm>[&frames=N]` runs the program in a worker: zinc:gfx draws on an OffscreenCanvas (`worker.mjs`: rectangles, rounded rectangles, lines, text, clear, the baked images with `drawImage` and `drawImageRect`, the input rows), and the runtime's frame loop waits for the next animation frame through WebAssembly JSPI when available, with `Atomics.wait` as the SharedArrayBuffer fallback. Keys, pointer and ticks reach the worker through a SharedArrayBuffer, which needs cross-origin isolation: serve the page with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Rows the glue does not draw yet (gradients, shadows, polygons) warn once in the console.

Images: `&res=<file>` (default `app.res` beside the page) is the blob of `zinc bake`; the worker puts each baked image on a canvas of its own and `image(name)` finds it. `drawImageRect` mirrors with the canvas transform and samples nearest with `imageSmoothingEnabled = false`; nearest sprites are the engine's pixels (translucent texels within 2 a channel: the canvas keeps premultiplied pixels). A linear sample stays inside the source rectangle on a 2D canvas, where the engine and a GPU read the texels around it. Text uses the browser's own fonts. `imageFromBytes` uses JSPI to wait for the browser decoder.

## Exported asset groups

`zinc export . --target wasm` writes an inline loading screen, `app.wasm`, `app.zbc`, and `boot.json`. The page uses `WebAssembly.compileStreaming` while downloading `app.wasm`, then sends the compiled module to its worker. Serve `.wasm` as `application/wasm`; the generated `serve.py` already does.

The manifest carries the target's configured RAM budget. Resident bytes and their peak include entries retained by handles after unloading; loads and decoded textures refuse to cross that budget. A single pack decode is limited to 256 MB and an image to 4096×4096 texels.

The manifest lists one content-hashed `.zpk` per cooked asset group, its byte size and entry names. Only `boot` and `default` load before the program starts. `assets.loadGroup()` / `prefetch()` and the first `readText()`, `readBytes()` or `image()` lookup fetch other groups when needed. Progress uses decoded HTTP body bytes against the manifest size, so HTTP compression does not change its denominator. Each Cache Storage hit is checked by SHA-256 and the shared ZPK reader before use; corruption is discarded and fetched again. Cache access or quota failure falls back to downloading. Cache names include the app's absolute directory URL, keeping apps on the same origin separate.

`imageFromBytes()` and asynchronous asset imports need WebAssembly JSPI (Chrome/Edge 137 or newer), including with COOP/COEP. A missing JSPI implementation reports the requirement in the page log for asset packs. Asset-free SharedArrayBuffer programs keep their fallback without JSPI; `imageFromBytes()` then returns `-1`. KTX2 ETC1S and UASTC textures are transcoded to RGBA32 in the worker for the existing Canvas2D renderer; this path does not upload GPU block textures. `ktx2.wasm` is exported only when a cooked image is KTX2 and downloaded only when `image()` first asks for it. A failed decoder download keeps its error and retries on the next image lookup. Raw ZIM images and programs without KTX2 do not download that module. Font rendering keeps the browser fonts used by the existing host.

Runtime images support creation, RGBA-byte and packed-pixel updates, destruction, and one active `beginImage()` / `endImage()` render target. Encoded PNG, JPEG, BMP, WebP and GIF (first frame) use the browser decoder after the vendored image readers validate dimensions (16 million pixels, 16384 per side at most). Invalid input returns `-1`; destroyed image ids are never reused. `readBytes()` keeps the original files of imported images in their existing asset groups; these bytes count against the same RAM budget and content hash as the cooked images. Generated atlas pages have no original file.

The wasm math build uses the same V8/CORE-MATH implementations as the other engines. WebAssembly has fixed round-to-nearest and no observable floating-point exception flags; its build shim represents those constraints.

## Under zinc dev

`zinc dev . --target web --engine wasm` builds the program as `zinc export --target wasm` does into `build/.zinc-web-dev/wasm`, serves it on
`http://127.0.0.1:8000/` with the COOP/COEP headers, and builds it again and reloads the page at each save; [web.md](web.md) ("Two engines") says when to pick it.

## Tests

`tests/t2/wasm.sh`: the 18 programs of `corpus/M3-set.txt` print on WASI what `zinc run` prints in a deterministic run, with the same exit code. `tests/t2/wasm_browser.sh`: headless Chrome (driven over the DevTools pipe by `tools/wasm-browser-test`) runs breakout on `vm-web.wasm` and the last frame is checked (skipped without Chrome). `tests/t1/image_rect_wasm.sh`: the sprites of a sheet are the same frame in Chrome as in the interpreter, and the exported game-2d template shows its player and coins.

The focused loader unit check is `tests/run --only wasm_loading` after building wasm. The manual three-criterion browser proof is `ZINC=build/zinc timeout 60 tests/wasm/loading_export.sh`; it holds the wasm response, checks both KTX2 alpha modes, reloads with HTTP cache disabled, and checks that an asset-free export drops stale packs.

Browser native plugins
----------------------

Wasm exports include the `web.native` / `web.impl` backends of the plugins the program calls. `natives.js` carries signatures from the compiled native specs; only implemented browser functions with supported signatures enter the runtime registry. The existing `zinc:audio` Web Audio backend handles decoded sounds, voices and PCM streams on the page. Decoding is asynchronous: duration/channels/rate are zero until ready, and an early play waits for decoding. Audio resumes after user input, following the browser's autoplay policy.

The native bridge carries scalars, UTF-8 strings and packed byte, i32, u32, f64 and string-array arguments; callback, resource and promise signatures remain unsupported, as do unimplemented exports such as streamed music. Changed numeric array arguments are copied back, including growth, shrinkage and empty arrays; unchanged arguments keep their original views. All outputs and the result are validated together before publication. Return arrays remain byte, i32 or f64 arrays: `u32[]` results are outside the current native signature contract. Signed zero survives the JSON response transport. Void results discard incidental JavaScript return values. Calls and replies are bounded to 4 MiB and replies time out after 15 seconds. JSPI suspends the interpreter while the page responds; asset-free programs without JSPI use a shared reply buffer while the worker blocks. Raw `?zbc=...&wasm=...` source-glue runs have no exported plugin descriptors. Use `zinc export --target wasm` for browser native plugins.
