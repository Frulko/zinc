# Host modules of the engine and the example apps (ZN-049, ZN-057)

The `zinc:*` modules that the engine provides are Zinc source over `__host_*` calls (rows `host.*` of `include/zn/runtime.h`); the host library (`src/host`) implements the calls. A module is real where
the host library is linked: the interpreter, the AOT programs that use it, and `--engine quickjs`. The ESP32 core firmware has no host module yet.

| Module | Real | Notes |
|---|---|---|
| `zinc:gfx` | desktop (window or headless), AOT, QuickJS | frame loop, shapes, text, images, render-to-image (`createImage`, `beginImage`, `endImage`), input; `ZINC_*` variables for headless runs |
| `zinc:sys` | desktop | args, env, cwd, pid, clock, stdout; `onSignal`, `onStdin`, `kill` are stubs |
| `zinc:fs` | desktop | text and bytes, stat, readdir, mkdir, rename, copy, tmp; `watch`, `symlink`, `chmod` throw ENOSYS |
| `zinc:storage` | desktop | one key-value file (`ZINC_STORAGE`) |
| `zinc:assets` | desktop | the `assets` directory beside the program (`ZINC_ASSETS`) |
| `zinc:os` | desktop | hostname, home, arch, memory, cpus; no network interfaces |
| `zinc:process` | desktop | `spawn` a shell command line, non-blocking `read`, `status`, `kill` |
| `zinc:net` | desktop, needs `curl` | `fetch(url, init?)` with method, body, headers; resolves with the status (0 when the transfer fails); `Headers`, `Response.text()` only |
| `zinc:native` | none | `requireNative` throws: the native C++ part of a plugin is not linked; plugins with a `x.next.ts` or `x.sim.ts` next to the `x.spec` run that instead |
| plugins (`plugins/*`) | those with Zinc sources | `lottie` and `video` have `*.next.ts` sims written for this engine (the `*.sim.ts` uses TypeScript beyond the Zinc subset) |

Not available: `zinc:osc`, `zinc:mqtt`, `zinc:gpio`, `zinc:platform`, `zinc:telemetry`, `zinc:pixelfont`, `zinc:gestures` natives, the map and svg engines (`maps/explorer`, `maps/svg-gallery`), the 3d plugin (an `enum` form the parser does
not read), the script plugin (non-null assertions `x!`), `await` inside call arguments, package imports (`inferno`).

## Example apps

Run headless for three frames by `tests/t1/examples.sh` (exit 0): `hero`, `remarkable/dashboard`, `remarkable/notes`, `maps/navigation`, `bouncing-ball`, `breakout`, `flipctl`, `hello`, `lang`, `ui/kit-gallery`, `ui/keyboard`, `ui/lottie-gallery`,
`led/falling-cubes`, `led/oled-clock`, `robot-eyes`, `robot-eyes-oled`, `zed-editor/sample`. The examples had no pixel goldens from the old toolchain; the engine's own frames of `hero`, `dashboard` and `notes` are
`tests/golden/examples/` (regression only). Two examples need native code that this engine does not link (`maps/explorer`: MapEngine, `maps/svg-gallery`: SvgEngine) and are listed as such, not as done.

## What the work changed in the language and the runtime

Class setters, `async` class methods, `arr.length = n`, `a ?? null`, `s.at(i)`, a UTC `Date` with the getters, callbacks returning a value where `() => void` is expected, optional callbacks (`(() => void) | null`), generic inference from the annotated
parameters of a lambda (`each(() => [0, 1], (i: i32) => ...)`), `undefined` meaning null in the files that do not use Dyn (a program with a Dyn plugin can still use `lib/std`), `console.error|warn|info|debug` as `console.log`, the number sort without
callbacks, and a fix: `padStart` on a string that needs no padding returned the receiver without a new reference (a use-after-release found by the dashboard).

## zinc:events, zinc:platform, zinc:telemetry (ZN-080)

All three are written in Zinc (`next/src/frontend/modules.cpp`, built-in module sources), so they exist on every target the engine runs on.

| module | what it is | per target |
|---|---|---|
| `zinc:events` | `Emitter<T>` with `on`, `once`, `off`, `listenerCount`, `emit` (listeners added during an emit wait for the next one) | everywhere |
| `zinc:platform` | constants of the run profile: `TARGET`, `PROFILE`, `HEAP_BYTES`, `NUMBERS`, `SCREEN_W/H` (`ZINC_SIZE`, else 320x240), `FPU`, and one boolean per capability of `targets/capabilities.json` (`TOUCH`, `POINTER`, `KEYBOARD`, `NET`, ...) | the profile is `macos` on macOS, `linux` elsewhere; the other targets read their own row when they build |
| `zinc:telemetry` | JSON lines of `runtime/mod/telemetry.cpp` (`hello`, `metric`, `event`, `state_snapshot`) to `stdout` or `file:<path>`; `ZINC_TELEMETRY` selects the sink at start | `udp://` and the per-frame `perf_frame` and `log` messages need the host's own hooks (they come with the event loop task); snapshots are taken on telemetry calls at most every 100 ms |

## Plugin defaults: native code or stand-in (ZN-112)

Rule (D21): with `ZINC_NATIVE=auto` a `.next.ts` stand-in beside the spec wins, except in deterministic runs (`ZINC_DETERMINISTIC`, tests, `examples-status`), where native code is used only when the manifest says `"deterministic": true`. `.sim.ts` files yield to native code. `real` forces native, `sim` forces the stand-in.

| Plugin | Default | Why |
|---|---|---|
| sqlite, wasm, ffi, script, canvas2d, svg, lottie, 3d, three, map, gphoto2 | native (deterministic) | no stand-in; output is a pure function of the input, so goldens are stable (gphoto2 uses its fake camera) |
| process, socket | `.next.ts` stand-in interactively, native in deterministic runs | the stand-in has no libuv dependency and runs on profiles without it (ESP32); native is verified by `tests/t1/native_plugins.sh` |
| devtools | `cdp.next.ts` stand-in | CDP server on the engine's own sockets; the C++ host (`cdp.host.cpp`) is the Linux/rpi1 path |
| video | `video.next.ts` stand-in | decoding is not deterministic across machines; native is opt-in with `ZINC_NATIVE=real` |
| webview | `webview.sim.ts` headless fallback; WKWebView on macOS only | CI has no window system |
| display-* , remote-view | native driver, selected by `ZINC_DISPLAY` / board | hardware drivers run against their emulators |
| device, gestures, imu-qmi8658, ink, mapping, pixelfont, remarkable | Zinc sources only | no native code |

## Trust in native plugin code (ZN-112)

The build writes `plugin.sha256` (digests of the shared library and the archive) beside them in the cache. Every later `plugin-build`, run or build re-hashes both; a mismatch is refused with a message naming the directory and nothing is `dlopen`ed (`tests/t0/plugin_trust.sh`). An entry without a digest is rebuilt. The cache directory name already covers sources, headers, flags and compiler. Not done: a program-level manifest of library hashes and `--allow-native` (the cache is the only source of native code today; a program cannot name a library path).

## Image codecs (ZN-115)

Decoding: stb_image on PNG, JPEG, BMP and GIF (first frame), for baked assets and `decodeRgba` (`src/res/codec.h`). Encoding: `src/res/codec.cpp` on stb_image_write (PNG with deflate level 9, JPEG, BMP). `ZINC_SHOT`, `zinc capture` and `gfx.capture` write the compressed PNG through the hook `zrt::gfx::png_encoder` (the runtime keeps its dependency-free stored-block encoder as the fallback for targets without the codec). A 1100x700 frame of `hero` is 82 KB instead of 2.3 MB with identical pixels (`tools/pngdiff`). Fixtures and the generator: `tests/data/images/`, test `tests/native/codec_test.cpp`. WebP and libjpeg-turbo are not done (ZN-226).

## zinc:mapping and the mapper example (ZN-117)

- `zinc:mapping` is native code (`plugins/mapping`, 669 lines) on the `display-gl` driver. Two changes made it run here: module plugins get `-I plugins/display-gl` (for `zgl.h`), and display drivers are `dlopen`ed `RTLD_GLOBAL` so the module binds to the driver's `zgl_program` / `zgl_layers`. The module needs the driver, so it is used with `ZINC_DISPLAY=gl` (the example's `zinc.json` display) and `ZINC_NATIVE=real` in deterministic runs; interactively the native code wins over `mapping.sim.ts` by itself. Without the driver (headless, `examples-status`) the stand-in runs and only the status card is drawn.
- Frame: `examples/video/mapper` after 30 frames through the GL driver equals the prototype's output (0 differing pixels on this machine, same GPU path); `tests/t1/mapper.sh` allows 1 % of pixels more than 24 off against `tests/golden/examples/proto/video-mapper-gl-30.png`, since GPUs differ. Mesa llvmpipe is not available here (Linux only): the Mac's GPU stands in.
- Companion: `examples/video/mapper/companion/server.ts` is the web companion as a Zinc program (zinc:net `serveAsync`, new in this task: the handler returns a promise and the reply goes out when it resolves; zinc:osc for the relay). It serves `index.html`, answers `/state` through the app's `/sync` reply and relays `POST /osc`, with the same token rule as `server.mjs`. The Node script `demo.mjs` passes against it. Note: `zinc run` runs a program in its project folder, so files are found relative to `examples/video/mapper`.

## SDL3 linked statically (ZN-118)

`third_party/SDL3` (3.4.16, zlib licence, pruned of the console, Windows, Android and web backends) is built by our CMake as a static library (video, events, clipboard, touch, pen and GL only; audio, camera, GPU, haptic, HIDAPI, joystick, sensor, power, dialog, tray and Vulkan are off) and linked into `zinc` with `-force_load` / `--whole-archive`, so the display drivers loaded with `dlopen` find every SDL function in the binary. `zinc build` links the same archive and the macOS frameworks (`ZN_HOST_LIBS`) into programs that open a window. `-DZN_SDL_VENDORED=OFF` uses an installed SDL3 as before.

Result (macOS arm64): `otool -L` of the packaged `zinc` lists system libraries only (libSystem, libc++, libobjc and Apple frameworks); the app bundle has no `Frameworks/*.dylib`. `zinc` grows from 5.9 MB to 7.8 MB while the Homebrew `libSDL3.dylib` (2.5 MB) is no longer shipped: the package is 5.6 MB zipped, 15 MB unpacked. On Linux SDL opens X11, Wayland, KMS and ALSA with `dlopen` at run time; building it needs their development headers (X11, Wayland, xkbcommon, libdrm, gbm, udev) and was not run here (no Docker by decision).

The window zoom: `display-gl` honours `ZINC_ZOOM` now (window size in points, as `hal_sdl` does). DPI: the logical surface is the `zinc.json` width and height; a surface 400 px wide or less opens at 2x (SDL window) or 3x (display-gl) in points, and the drawable is rendered at the screen density on top (Retina: 2 pixels per point), so a 320x240 program shows as 640x480 points / 1280x960 pixels. `ZINC_ZOOM=1` or `zoom` in `zinc.json` turns the enlargement off.
