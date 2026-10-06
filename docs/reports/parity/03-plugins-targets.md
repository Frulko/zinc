# Parity audit 03: plugins, native modules, targets, profiles, hardware simulation

Date 2026-10-07. Scope: the prototype (`plugins/`, `runtime/`, `targets/`, `sim/`, `boards/`, `docs/`) against the new engine (`next/`).
Read-only audit; the only file written is this one. Facts come from the files cited. "(unverified)" marks what I did not run or could not check from the files.

Owner policy applied throughout: hardware is validated by simulators and emulators, not boards; Windows is out of scope; the design must be agnostic, pluggable, readable and fast; prefer proven libraries.

## 0. Findings in ten lines

1. The new engine has **no native-module story**: `requireNative` throws (`next/src/frontend/modules.cpp:338`), plugins with `x.next.ts` or `x.sim.ts` run that instead. Only two plugins have a `.next.ts` (lottie, video, both metadata-only stubs that draw nothing).
2. Every `Rt::Host*` function is a row of the central X-macro `next/include/zn/runtime.h`. That is right for the built-ins (gfx, sys, fs, storage, assets, os, process: stable ids, hot path) and wrong for plugins (a plugin must not edit a core header). Plugins need **name-based late binding**.
3. The prototype already has the right shared C ABI: `runtime/include/zinc_abi.h` v4 (`ZincModule`, `ZincExport`, `ZincValue`, resources, callbacks), tested across the VM and QuickJS. Decision: **evolve it into `next/include/zn/native.h`**, do not invent a new one (section 4).
4. Plugin native C++ does not talk to the engine. It implements `struct NativeX` from a generated `zinc_native_x.h` using the old runtime's `zrt::String / Array / Fn / Promise / Poller`, and `runtime/zrt_raster.h`. The new host library already links the old `zrt`, so a **marshalling adapter** lets all 33 plugins' native sources link unchanged.
5. The header generator is TypeScript (`compiler/src/native.ts`). A product without Node needs a C++ generator in `next/` (backlog ZN-060).
6. The display plugins are already `HalDisplay` drivers, and `runtime/gfx.cpp` already calls `hal_display`. Linking a display plugin into the new host library works with no engine change except the driver selection (ZN-070).
7. Finding about the old emulators: on macOS `display-ssd1306` makes `dev_write` a no-op and paints from its own page buffer, so the **I2C command stream is never checked**; the ESP32 QEMU runs only print frame checksums over UART. Chip-level models (bus shim plus SSD1306, ST7789, WS2812, IS31FL3730, QMI8658 models) would validate the real driver code (section 5).
8. Fixed-point is the biggest hole in the targets: `fx12`/`fx16` exist in the checker enum (`next/src/frontend/check.h:21`) but the IR rejects them (`next/RESUME.md:74`), so **PS1 is blocked** by an IR lowering pass. f32 has opcodes; there is no `--profile` switch. The old tree has 44 `.fx12.out` and 46 `.f32.out` goldens in `tests/conformance` to reuse.
9. The "sim oracle on Node" becomes: **frozen goldens (data) plus the interpreter as the reference engine plus a runner abstraction** (section 6.3). QuickJS is not an oracle for numerics (JS numbers do not wrap i32); it stays a second engine and the `zinc:script` backend.
10. Cross-target execution without Docker is only solved for ESP32 (pinned Espressif QEMU). Pi and reMarkable binaries need a pinned `qemu-user` on Linux and a decision for macOS (section 6.2). PS1 on the new engine needs a freestanding runtime (the engine's `src/rt` uses `std::vector`, `unordered_map`, mimalloc), PS2 needs the ps2dev toolchain and a BIOS the owner must supply.

---

## 1. Plugin inventory (prototype)

33 directories under `plugins/`. Two kinds (`docs/plugins.md`): **module** (imported as `zinc:x`; Zinc code `index.ts` plus optional native part behind `native/x.spec.ts`) and **display** (a `HalDisplay` driver, `kind: "display"`, chosen in `zinc.json`). Native file convention: `native/<x>.spec.ts` (IDL), `native/<x>.<target>.cpp` with `.host.cpp` as the fallback, `native/<x>.sim.ts` (Node implementation), optional `<x>.next.ts` (new engine).

LOC = lines of the native C++ I counted (`wc -l`); "spec fns" = functions in the `.spec.ts`.

### 1.1 Module plugins with a native part (22 specs)

| Plugin (module) | API surface | Native part (LOC, spec fns) | Third-party code | Runs where (plugin.json `targets`) | Simulator / sim | Engine hooks it needs |
|---|---|---|---|---|---|---|
| `3d` (`zinc:3d`) | meshes (primitives, OBJ), materials, textures, lights, camera, scene graph, z-buffered rasterizer; options zbits, scale, dither, subdiv | `render3d.host/.rpi1/.esp32/.wasm.cpp`, 442 LOC host, 10 fns | none (own) | macos linux rpi1 esp32 wasm | `render3d.sim.ts` (35 LOC, Node) | numbers as profile kind (f64/f32/fx12); raster commands |
| `canvas2d` (`zinc:canvas`) | HTML Canvas 2D context: paths, strokes, gradients, text, images, transforms | `canvas2d.host/.rpi1/.rmpp/.esp32/.wasm.cpp`, 65 LOC, 2 fns (`fill`, `image` with `number[]` contours) | none | macos linux rpi1 rmpp wasm esp32 | `canvas2d.sim.ts` (5 LOC) | raster `POLY` commands (`zrt_raster.h`); `ZRT_POINT_POOL` define per target |
| `device` (`zinc:device`) | backlight level, chip and heap figures, frame stats | `device.host/.esp32.cpp`, 25 + 41 LOC, 10 fns | ESP-IDF `esp_hw_support` | esp32 macos linux | `device.sim.ts` (13) | weak link to `zinc_display_backlight` of the st7789 driver |
| `devtools` (`zinc:devtools`) | Chrome DevTools protocol subset on port 9229 (UI inspector); `zinc dev` adds it | `cdp.host/.rpi1.cpp`, 303 LOC, 7 fns | none (own HTTP plus WebSocket framing) | macos linux rpi1 | `cdp.sim.ts` (10, stub) | `listen` with callback, screenshot PNG of the frame, profiler spans of `gfx.cpp` |
| `ffi` (`zinc:ffi`) | `dlopen`/`dlsym`, call C functions with scalar and string signatures, C memory helpers | `ffi.host.cpp`, 93 LOC, 11 fns | libdl; hand-rolled register-class call ("no libffi") | macos linux (capability `dynlib`) | `ffi.sim.ts` (73, emulates a few libc functions) | none |
| `gphoto2` (`zinc:gphoto2`) | camera remote control over USB PTP: config tree, capture, events, JPEG live view into a runtime image | `gphoto2.host/.rpi1.cpp`, 661 LOC, 20 fns (many `Promise<string>`) | **libgphoto2** (LGPL-2.1), **libjpeg-turbo** (BSD) | macos linux rpi1 | `gphoto2.sim.ts` (63) plus option `fake` (fake camera in the native code) | worker thread plus completion queue; runtime images (`dyn_create/update`) |
| `imu-qmi8658` (`zinc:imu`) | accel, gyro, temperature, tilt, shake | `imu.host.cpp` (14, returns false), `imu.esp32.cpp` (77, I2C), 3 fns | IDF `esp_driver_i2c` | esp32 macos linux | `index.ts` emulates the sensor from keys and mouse | I2C bus |
| `lottie` (`zinc:lottie`) | Lottie (Bodymovin) parse and render, `Player`, `<Lottie/>` node | `lottie.host/.rpi1/.rmpp/.esp32/.ps2/.wasm.cpp`, 1108 LOC host, 9 fns | none (own); checked against lottie-web on 12 files | macos linux rpi1 rmpp wasm ps2 esp32 | `lottie.sim.ts` (31); **`lottie.next.ts` (40, metadata only, draws nothing)** | raster commands; `ZRT_POINT_POOL=4096` on esp32 |
| `map` (`zinc:map`) | interactive vector maps: Mapbox Vector Tiles, MapLibre style subset, tile cache, labels | `map.host/.rpi1.cpp`, 728 LOC, 6 fns | none (own MVT and style parsers; tiles must be uncompressed) | macos linux rpi1 | none (`map.spec` only) | raster; per-frame time budget option |
| `mapping` (`zinc:mapping`) | GPU video-mapping compositor driven by OSC: corner pin, mesh warp, masks, edge blend | `mapping.host/.rpi1.cpp`, 669 LOC, 6 fns (commands as JSON and OSC addresses) | OpenGL through display `gl` | macos rpi1 | `mapping.sim.ts` (10) | needs `display-gl`; GL context |
| `process` (`zinc:process`) | spawn with args, cwd, env; streamed stdout/stderr, stdin, kill, exit code | `process.host/.rpi1.cpp`, 203 LOC, 7 fns | posix_spawn | macos linux rpi1 (capability `process`) | `process.sim.ts` (35) | event-loop poller |
| `remarkable` (`zinc:remarkable`) | toolbar: local clock, battery, app-owned exit | `status.host/.rmpp.cpp`, 8 + 33 LOC, 3 fns | none | rmpp macos linux | `status.sim.ts` (5) | reads `/sys` battery on device |
| `remote-view` (`zinc:remote`) | viewer for `display-remote` apps: live screen as a runtime image, input forwarding, LAN discovery | `remote.host/.rpi1.cpp`, 261 LOC, 17 fns | none (own RLE/damage protocol `display-remote/remote_proto.h`) | macos linux rpi1 | `remote.sim.ts` (20) | sockets, runtime image |
| `script` (`zinc:script`) | sandboxed JavaScript contexts with typed host functions, time and memory limits, ES modules, promises, values as `Dyn` | `quickjs.host/.rpi1/.rmpp.cpp`, 667 LOC, 23 fns | **QuickJS-ng** (3 MB vendored amalgamation; `next/third_party/quickjs-ng` already holds 0.17.0) | macos linux rpi1 rmpp; `requires heap>=4M` | `quickjs.sim.ts` (325, node:vm) | `Dyn` values across the boundary, callbacks, promises |
| `socket` (`zinc:socket`) | TCP, Unix, UDP, DNS, WebSocket client and server, non-blocking on the event loop | `socket.host/.rpi1/.rmpp.cpp`, 364 LOC, 16 fns (`onEvent` callback) | BSD sockets, `getaddrinfo`; own WebSocket | macos linux rpi1 rmpp (`net`, `process`) | `socket.sim.ts` (110) | poller, callbacks |
| `sqlite` (`zinc:sqlite`) | `Database`, `Statement.run/get/all/values`, parameters, transactions, BLOB | `sqlite.host/.rpi1/.rmpp.cpp`, 120 LOC, 26 fns (all `i32` handles) | **SQLite amalgamation 3.53.4** (public domain, 10 MB source, compiled as C with 5 `-D` options) | macos linux rpi1 rmpp (`fs`, `heap>=4M`) | `sqlite.sim.ts` (113, node:sqlite) | none (the model plugin) |
| `svg` (`zinc:svg`) | runtime SVG: paths, shapes, transforms, gradients, CSS classes on the vector rasterizer | `svg.host/.rpi1/.wasm.cpp`, 679 LOC, 7 fns | none (own) | macos linux rpi1 wasm | none | raster |
| `three` (`three`, plus addons) | three.js API subset on `zinc:3d`: scene graph, materials, raycasting, `GLTFLoader`, `OrbitControls` | `three.host/.rpi1/.wasm.cpp`, 489 LOC, 34 fns; `index.ts` is 1558 lines of Zinc | **stb_image v2.30** (PNG and JPEG, limits set) | macos linux rpi1 wasm | `three.sim.ts` (193) | the `3d` plugin |
| `video` (`zinc:video`) | playback, gapless playlists, shuffle, loop; frames become runtime images | `video.host/.rpi1.cpp`, 552 LOC, 24 fns | **FFmpeg** (libavformat, libavcodec, libavutil, libswscale; LGPL); VideoToolbox on macOS, V4L2 M2M on Pi | macos linux rpi1 | `video.sim.ts` (55); **`video.next.ts` (76, metadata only)** | decode threads, runtime images |
| `wasm` (`zinc:wasm`) | WebAssembly JS API shape: validate, compile, instantiate with host imports, exports, memory, globals | `wasm.host/.rpi1/.rmpp.cpp`, 193 LOC, 14 fns | **wasm3 0.5.0** (MIT, 388 KB vendored C) | macos linux rpi1 rmpp; `heap>=1M` | `wasm.sim.ts` (63, V8) | callbacks (host imports) |
| `webview` (`zinc:webview`) | WKWebView embedded in the window, `zinc://` assets, `postMessage`, `invoke` RPC | `webview.macos.cpp` plus `src/webview.mm` (227), 10 fns | WebKit, Cocoa, SDL3 window handle | macos only | `webview.sim.ts` (14) | `hal_window_handle()` |

### 1.2 Module plugins that are pure Zinc (no native part)

| Plugin | API surface | Notes |
|---|---|---|
| `gestures` (`zinc:gestures`) | pan, pinch, rotate, tap, double tap, release velocity from pointer, wheel, multitouch | 103 lines of Zinc over `zinc:gfx` input; all targets. Needs only what the host gfx module already exports. |
| `ink` (`zinc:ink`) | handwriting surface: pressure strokes, stroke eraser, undo, JSON and SVG export | 218 lines over gfx pen queue, `createImage/beginImage/endImage` (not done in the new host before ZN-057; check) and `zinc:ui`; targets macos linux rpi1 wasm rmpp. |
| `pixelfont` (`zinc:pixelfont`) | 5x7 and 3x5 bitmap fonts for LED matrices | 89 lines, data plus `gfx.rect`; listed under "not available" in `docs/reports/zinc-next-hostmodules.md`. |

### 1.3 Display plugins (`kind: "display"`, 9 of them)

All implement `HalDisplay {init, present, poll, shutdown, owns_input, host_window}` from `runtime/include/hal.h` and register from a static constructor (`hal_display = &d`). `runtime/gfx.cpp:23,34,568` and `runtime/zrt.cpp:909-1129` already route frames and input through `hal_display`.

| Plugin | What it drives | Source (LOC) | Real device path | Emulator path | Third-party | plugin.json targets |
|---|---|---|---|---|---|---|
| `display-fbdev` | Linux `/dev/fb0` 16/24/32 bpp, evdev keyboard, mouse, multitouch | `fbdev.cpp` 316 | ioctl `FBIOGET_*`, mmap, evdev | none (needs a Linux kernel with a framebuffer) | linux headers | linux rpi1 |
| `display-gl` | GPU screen, UI as overlay; replays command lists (`HalFrame.frames`) | `src/display_gl.cpp` 230, `gl_renderer.cpp` 480, `kms.cpp` 264, `sdl.cpp` 82, `zgl.h` | KMS/DRM plus GBM plus EGL plus GLES2 | macOS: SDL3 plus OpenGL 3.2 (the real thing) | Mesa EGL/GLES2, GBM, libdrm, SDL3 | macos rpi1 linux |
| `display-remote` | headless: streams frames over TCP (damage plus RLE), takes input, LAN beacon | `remote.cpp` 287, `remote_proto.h`, `rle_check.cpp` | TCP | consumed by `remote-view` | none | macos linux rpi1 |
| `display-rmpp` | reMarkable Paper Pro: e-ink refresh policy, Marker pen, touch | `rmpp.cpp` 178, `eink.h`, `direct.h`, `input.h`, `emulator.cpp` 55 | AppLoad **qtfb**: `SOCK_SEQPACKET /tmp/qtfb.sock`, shared memory framebuffer, evdev pen | `emulator.cpp`: same `eink.h` policy drawn in the SDL window with a paper tint (`ZINC_EINK_LOOK=0` off) | none (xovi plus AppLoad on the tablet) | rmpp macos linux |
| `display-scrollphat` | Pimoroni Scroll pHAT 11x5 LEDs, IS31FL3730 over I2C | `scrollphat.cpp` 124, `test_frame.cpp` | `/dev/i2c-1` | macOS SDL emulator window (`emu_sdl.h`) | linux headers | rpi1 linux macos |
| `display-ssd1306` | SSD1306 OLED 128x64/32, 1 bit, threshold, Bayer or Floyd-Steinberg | `ssd1306.cpp` 168 | IDF `i2c_master` (esp32), `/dev/i2c-1` (Linux) | macOS emulator window; **`dev_write` is a no-op there** | IDF `esp_driver_i2c` | esp32 rpi1 linux macos |
| `display-st7789` | ST7789 / ILI9341 over SPI or 8-bit i80, band rendering, PWM backlight, CST820 touch | `st7789.cpp` 275 | IDF `esp_lcd`, `esp_driver_spi/gpio/ledc/i2c` | **none**: on macOS the normal window is used | IDF components | esp32 macos(`{}`) |
| `display-ws2812` | WS2812 matrix: serpentine, origin, rotate, brightness, gamma, colour order | `ws2812.cpp` 147, `emu_sdl.h`, `test_map.cpp` | ESP32 RMT, Pi SPI (`/dev/spidev0.0`) | macOS SDL emulator (round LED dots) | IDF `esp_driver_rmt` | esp32 rpi1 linux macos |

(`display-gl` and `display-remote` own their input: `owns_input = 1`. `display-rmpp` emulator and the SDL HAL share the window: `host_window = 1`.)

### 1.4 Built-in native modules of the prototype runtime (`runtime/mod/`, not plugins)

`assets, events, fs, gpio (linux libgpiod / esp32 driver), mem, mqtt, net (+ esp32), os, osc, storage (+ esp32 NVS), sys, telemetry`, each with a `sim/<name>.mjs` Node twin. In the new engine only gfx, sys, fs, storage, assets, os, process are done (`zinc-next-hostmodules.md`). **Missing in next: `zinc:osc`, `zinc:mqtt`, `zinc:gpio`, `zinc:platform`, `zinc:telemetry`, `zinc:events`.** `osc` is needed by `mapping`; `gpio` by every Pi/ESP32 board demo; `platform` by the capability checks.

---

## 2. Third-party code the plugins pull in

| Library | Licence | Used by | In next today | Proposal |
|---|---|---|---|---|
| SQLite amalgamation 3.53.4 | public domain | sqlite | no | vendor the same file under `next/third_party/sqlite/`; build as C, `SQLITE_THREADSAFE=0`, `SQLITE_OMIT_LOAD_EXTENSION` etc. as in plugin.json |
| wasm3 0.5.0 | MIT | wasm | no | keep for now. wasm3 is in low maintenance (unverified: check the repository state); spike **WAMR** (Bytecode Alliance, interpreter plus AOT) as the replacement behind the same spec |
| QuickJS-ng 0.17.0 | MIT | script | **yes**, `next/third_party/quickjs-ng`, used by `src/qjs` | one copy only: rebase the `script` plugin on `src/qjs` (ZN-066) |
| stb_image v2.30 | MIT / PD | three | **yes** (`third_party/stb`, PNG only) | add JPEG (`STBI_ONLY_PNG,JPEG` as in the prototype) |
| FFmpeg (avformat, avcodec, avutil, swscale) | LGPL | video | no | system library through `pkg-config`, dynamic link (LGPL); never vendored; Mac VideoToolbox, Pi V4L2 M2M as in the plugin |
| libgphoto2, libjpeg-turbo | LGPL, BSD | gphoto2 | no | system libraries, dynamic; fake camera (`fake` option) stays the sim |
| libffi | MIT | (ffi hand-rolls register classes, "no libffi") | no | **replace the hand-rolled call by libffi** (or dyncall): proven library, covers x86-64 and aarch64 and structs, removes the register-class code |
| SDL3 | zlib | window HAL, `display-gl`, `webview` | **yes** (Homebrew copy bundled, not vendored; `packaging.md`) | vendor a pinned SDL3 (already noted as open in `zinc-next-packaging.md`) |
| Mesa EGL/GLES2, GBM, libdrm | MIT | display-gl | no | needs a Debian/Alpine sysroot for cross builds (zig does not ship them): a pinned sysroot download, ZN-076 |
| libgpiod 1.6 | LGPL | `zinc:gpio` | no | optional; sysfs fallback is not planned |
| WebKit | system | webview | no | macOS only; out of the new engine's first parity wave |

Own code that a proven library could replace (decide per item; the old pixel goldens argue for keeping the own rasterizer paths):

| Own code | LOC | Candidate | Verdict |
|---|---|---|---|
| socket plus WebSocket (`socket.host.cpp`, `cdp.host.cpp`, `remote.host.cpp`) | 364 + 303 + 261 | libuv (MIT) for loop, TCP/UDP/pipe/process/fs events; `wslay` (MIT) for frames | worth it: libuv also gives the Windows port later; keep the JS-facing spec |
| svg, lottie | 679 + 1108 | ThorVG (MIT: SVG, Lottie, software raster, tiny footprint) or rlottie | do not swap while the 12 lottie-web goldens and the shared raster must stay pixel-identical; evaluate behind a flag |
| map (MVT decode) | 728 | protozero / vtzero (BSD) | optional |
| 3d glTF | in three | cgltf (MIT) | optional |

---

## 3. plugin.json today and what the new engine reads

Schema (from `docs/plugins.md` and the 33 files): `name`, `kind` (`module`|`display`), `module`, `entry`, `description`, `options` (defaults; C++ sees them as `ZP_<PLUGIN>_<KEY>` plus `ZP_<PLUGIN>=1`), `modules` (extra import specifiers), `requires` (capability expressions), `targets.<id>` with `sources`, `pkg`, `frameworks`, `libs`, `linkFlags`, `defines`, `flags`, `packages` (Alpine/apt packages for the SDK image), `idf`, `idfComponents`, `nodeFlags` (sim). Plugin search: `<zinc>/plugins/*`, `<project>/plugins/*`, `zinc.json` `pluginDirs`. Unlisted target = error Z5003 (sim always allowed); capability mismatch = Z5005.

What the new engine reads: `next/src/frontend/modules.cpp:380-400` finds `module` and `entry` with a `std::string::find` hack (no JSON parser, no targets, no options, no `requires`). Everything else is unread.

Proposed v2 (all new keys optional, so the 33 existing files stay valid):

```jsonc
{
  "name": "sqlite", "kind": "module", "module": "zinc:sqlite", "entry": "index.ts",
  "abi": 1,                                   // zn_native ABI the native part targets (default 1)
  "native": {                                 // default: derived from native/*.spec.ts by convention
    "spec": "native/sqlite.spec.ts", "name": "Sqlite",
    "impl": { "host": "native/sqlite.host.cpp", "rpi1": "native/sqlite.rpi1.cpp" }  // convention: <x>.<target>.cpp else <x>.host.cpp
  },
  "sim": "native/sqlite.next.ts",             // optional Zinc fallback; precedence in 4.9
  "deterministic": true,                      // real native is allowed in golden tests (no clock, no network)
  "threads": false,                           // needs worker threads (video, gphoto2) -> capability `threads`
  "license": "public-domain", "link": "static" // "dynamic" for LGPL system libs (FFmpeg, libgphoto2)
}
```

`nodeFlags` (Node only) is dropped; `packages` (Docker image packages) becomes advisory (`zinc doctor` prints it) since the new toolchain does not build in Docker.

---

## 4. Native-module ABI for the new engine

### 4.1 Requirements

R1 Existing `native/*.cpp` link **unchanged** (they include `zinc_native_<x>.h`, derive `struct NativeX`, return `zrt::String`, take `zrt::Array<T>`, `zrt::Fn`, `zrt::Promise<T>`, register `zrt::Poller`).
R2 `requireNative<Spec>('X')` binds by **name and signature**, checked at compile time and again at load; a mismatch is a diagnostic, never a crash.
R3 No central header edit to add a plugin; ZBC stays stable (ids of `Rt::*` never move).
R4 One mechanism for the interpreter, the AOT output, the QuickJS engine, the ESP32 core, and (later) wasm.
R5 Deterministic ownership with the engine's explicit RC; no C++ exception, no engine object across the boundary.
R6 Async completions and callbacks from other threads are safe and drained on the engine thread.
R7 Fast enough: a call costs one decoded argument array, with a later fast path for pure scalar signatures.
R8 Works where there is no `dlopen` (static rmpp, ESP32, wasm).

### 4.2 Comparison

| Approach | What it is | Take | Reject |
|---|---|---|---|
| QuickJS-ng C API (`JSCFunctionListEntry`, `JS_NewCFunction`, `JSClassDef` with finalizer) | engine-specific values (`JSValue`), tables of `{name, length, fn, magic}` | table-driven exports, class finalizers, `JS_SetContextOpaque` for module state | the value type is the engine's; our typed engine has no `JSValue`; binding the typed engine to it would put a tag check on every call |
| Lua C API (`lua_CFunction`, `luaL_Reg`, userdata with `__gc`) | stack-machine API, dynamic types | `luaL_Reg`-style registration table | stack manipulation per argument, no static signature, GC finalizer timing |
| WAMR / wasm3 native symbols (`NativeSymbol {name, fn, "(i*~)i", attachment}`; `m3_LinkRawFunction(.., "i(ii)", fn)`) | **signature string plus raw argument array plus attachment pointer** | exactly the shape: static signature checked at link time, one flat call convention, attachment = module `self` | pointer-into-guest-memory conventions (`*~`) do not apply |
| Node-API (`napi_value`, scopes, `napi_create_external` + finalizer, `napi_threadsafe_function`, `napi_async_work`) | stable ABI across engine versions, versioned by `NAPI_VERSION` | **versioned header with size field; external handles with finalizer; thread-safe function = post to the loop; async work completes on the loop thread** | per-argument `napi_get_value_*` calls and `napi_value` handle scopes (dynamic, slow, verbose) |
| Wasm component model / WIT | IDL with records, `own<T>`/`borrow<T>` resources, `future<T>`/`stream<T>`, canonical ABI lowering of strings to (ptr,len) | **IDL-first** (our `.spec.ts` is already the IDL), **resource own/borrow rules**, futures for async | needs a component runtime, async ABI (WASI 0.3) still moving (unverified), no C++ host surface to link against |
| libffi (`ffi_cif`, `ffi_call`) | call any C function at run time from a signature | the right tool for `zinc:ffi` only (arbitrary C), also as a universal thunk if generated thunks are not wanted | for plugins, generated typed thunks are faster and need no runtime cif |
| Existing `zinc_abi.h` v4 (prototype) | `ZincModule{abi,size,name,exports,dispose}`, `ZincExport{name,params[],result,invoke,ctx}`, `ZincValue` (16 bytes), resources with generational handles, scalar callbacks, `zinc_module_open(version, host, out, error)` for shared libraries; tested on VM, JIT and QuickJS | **base of the design**: same concepts, already implemented once, borrowed-argument and module-owned-result rules already stated | arrays of `ZincType` instead of a signature string (verbose); no async completion; no thread-safe post; records only as snapshots |

**Decision:** a **WAMR/wasm3-style typed export table with the signature letters of `runtime.h`**, grown out of `zinc_abi.h` v4, with Node-API's rules for versioning, finalizers and thread-safe posting, and WIT's own/borrow vocabulary for resources. Reasons: (a) the signature letters (`s i u b d n B D ...`) already exist in `next/include/zn/runtime.h` and the marshalling code that decodes them already exists twice (`hostRt` in `src/rt/rtcalls.cpp:545`, the `__host_*` binder in `src/qjs/qjs.cpp:73`): one more consumer is cheap; (b) `.spec.ts` is already the IDL, so no new language; (c) a shared C table works the same for static link, `dlopen` and firmware (R8); (d) nothing in it names an engine, so the interpreter, AOT and QuickJS share one marshaller; (e) libffi stays confined to `zinc:ffi`.

### 4.3 Binding: how `requireNative<Spec>('X')` resolves

Compile time (frontend, `next/src/frontend/modules.cpp` plus a new `native.cpp`):
1. `requireNative<T>('Name')` is recognised as an intrinsic (today it is the stub at `modules.cpp:338`). `T` must be an interface extending `NativeModule`.
2. Each member is checked against the allowed signature set and encoded as a signature string. Unknown type = diagnostic `Z5010`.
3. For every member the program actually calls, the module gets an entry in a new ZBC section `natives`: `{ module "Sqlite", export "open", sig "si>i", abi 1 }`.
4. A call lowers to one new opcode `CallNative idx, argbase` (`idx` indexes the `natives` table). One opcode, not one per function, so there is no opcode or `Rt::` id churn.

Load time (interpreter, AOT program start, device core):
1. For each `natives` entry the registry is queried by `(module, export)`; the module's `ZnExport.sig` must equal the compiled sig, otherwise load fails with a message naming both (as `engines.md` does today). The resolved `ZnFn` pointer is stored in a flat array; the hot path is `natives[idx](self, cx, args, ret)`.
2. Registry sources, in order: (a) modules registered at link time by `zn_register_module(&mod)` (explicit call from the generated `main`, **not** static constructors, so firmware and wasm are safe); (b) shared libraries named by `--native-library` or found by plugin discovery, each exporting `zn_module_open` (the `zinc_abi.h` v4 entry); (c) none.
3. If nothing is registered, the loader keeps the **sim fallback chain** that exists today and extends it: native real > `x.next.ts` > `x.sim.ts` (only if it parses in the subset) > error `Z5011` at load ("native module `X` is not linked in this build; plugin `sqlite` has no `.next.ts`"), a diagnostic at load instead of the runtime `throw` of today. A flag `--native=real|sim|auto` (default `auto`) forces one side; golden tests use `sim` or `real` explicitly depending on the plugin's `deterministic` key.

### 4.4 The wire contract (`next/include/zn/native.h`, C only)

Sketch; names final at implementation.

```c
#define ZN_ABI_VERSION 1u
typedef struct ZnStr  { const char* p; uint32_t n; } ZnStr;     /* UTF-8, p[n] == 0 guaranteed on arguments */
typedef struct ZnView { const void* p; uint32_t n; } ZnView;    /* n elements, packed, element type from the signature */
typedef union  ZnVal  { int64_t i; uint64_t u; double d; ZnStr s; ZnView v; uint64_t h; } ZnVal;  /* 16 bytes */
typedef struct ZnCtx ZnCtx;                                      /* per call, engine owned */
typedef int32_t (*ZnFn)(void* self, ZnCtx* cx, const ZnVal* args, ZnVal* ret);  /* 0 ok, ZN_PENDING, else error */

typedef struct { const char* name; const char* sig; ZnFn fn; uint32_t flags; } ZnExport;  /* flags: ZN_PURE_SCALAR (fast path later) */
typedef struct { uint32_t id; const char* name; void (*finalize)(void* ptr); } ZnKind;      /* resource kinds */
typedef struct {
  uint32_t abi, size;                       /* version negotiation like zinc_abi.h and Node-API */
  const char* name;                         /* "Sqlite" */
  const ZnExport* exports; uint32_t nexports;
  const ZnKind* kinds;     uint32_t nkinds;
  uint32_t flags;                           /* ZN_THREADS, ZN_NEEDS_GFX, ZN_DETERMINISTIC */
  int  (*init)(const struct ZnHostApi*, void** self);
  void (*poll)(void* self, uint64_t now_ms);   /* once per loop turn; optional */
  void (*shutdown)(void* self);                /* reverse load order, after guest teardown */
} ZnModule;
```

Engine services (`ZnHostApi`, a size-prefixed vtable passed to `init`; additive growth only): `set_error`, `ret_str`, `ret_buf` (scratch for array and blob results), `res_new/res_get/res_retain/res_release`, `cb_retain/cb_release/cb_call` (engine thread) and `cb_post` (any thread, arguments copied), `promise_take/promise_resolve/promise_reject` (any thread, exactly once), `loop_ref/loop_unref` (keep the process alive while a native operation is pending, libuv-style), `now_ms` (the engine clock: virtual in headless and deterministic runs), `service("gfx")` (a table with raster, image and frame access so a plugin does not link the runtime's globals twice).

Signature letters: the existing set (`s i u b d n`, `B` u8[] view, `D` f64[] view, `S` string[]) plus `f` f32, `I` i32[] view, `h` opaque integer handle (spec `i32`: the plugin owns the table, as all 22 specs do today), `R<k>` engine-managed resource of kind `k`, `c(sig)` callback, `P<t>` promise result, `x` Dyn snapshot (script), `>` separator. Example: sqlite `bindText(st: i32, i: i32, v: string): boolean` = `"iis>b"`; socket `onEvent(cb: (h: i32, kind: i32, a: i32, text: string, bytes: u8[]) => void): void` = `"c(iiisB>n)>n"`; gphoto2 `capture(dir: string): Promise<string>` = `"s>Ps"`.

### 4.5 Ownership across the boundary

| Value | In (engine to native) | Out (native to engine) |
|---|---|---|
| string | borrowed `(p, n)` for the call; NUL-terminated at `p[n]` (the engine's `newStr` must allocate `len + 1`; one-line change to verify in `src/rt/rtcalls.cpp`); native copies to keep it (what `SQLITE_TRANSIENT` and `CStr` do today) | `ret_str` copies into the call arena; or a pointer into module memory valid until the next call of that export (the `zinc_abi.h` rule); the engine copies into a `StrObj` before returning to Zinc |
| u8[] i32[] f64[] | **marshalled copy** into a contiguous typed scratch buffer, borrowed `ZnView`, valid for the call. Note `ArrObj` stores 8-byte `Slot`s (`src/rt/rt.h:91`), so a `u8[]` is not contiguous bytes; a packed array representation (open item "4-byte refs" in `zinc-next-perf.md`) would make this zero-copy without any plugin change | `ret_buf(n)` scratch the native fills; the engine copies into a new `ArrObj`; large blobs may later hand over `(ptr, len, free)` |
| string[] | array of `ZnStr`, borrowed | `ret_buf` of `ZnStr` |
| number | `f64` on the wire for every number kind; the adapter converts to and from the program's `f32` or `fx12` (what the `Nums` typedef trick in `canvas2d.host.cpp` assumes) | same |
| resource `R<k>` | borrowed handle (generational: index plus generation, stale or wrong kind returns null) | `res_new` gives rc 1; the **engine's RC finalizes** exactly when the last Zinc reference dies (deterministic, the same point in the interpreter and AOT, unlike the VM GC of the prototype); remaining resources finalize at shutdown in reverse load order |
| `h` integer handle | plain integer; the plugin owns the table (no engine involvement), as in all 22 specs | same |
| callback `c(sig)` | `cb_retain` to keep it (engine roots the closure), `cb_release` to drop; calling it needs `cb_call` on the engine thread or `cb_post` from another | not supported as a result |
| error | native returns non-zero plus `set_error`; the engine throws a Zinc `Error` at the call site; **no C++ exception crosses the ABI** (host code is built `-fno-exceptions`) | |

### 4.6 Async, events, threads

- **Pollers** (socket, process, devtools, remote-view, display-remote): the module's `poll(self, now_ms)` is called once per loop turn by `__runLoop` and by `__gfxLoop` (the frame loop already runs timers in the old runtime's order). `loop_ref` keeps the loop alive while sockets are open. Under `ZINC_DETERMINISTIC` the clock is virtual and real I/O pollers run only if the plugin is not `deterministic: false` for that test.
- **Callbacks into Zinc** (`onEvent`): stored as retained handles, invoked from `poll` through `cb_call` on the engine thread.
- **Promises** (`gphoto2`: 12 of its 20 functions return `Promise<string>`; the script plugin's async host functions): the export returns `ZN_PENDING` after `promise_take`; the worker thread later calls `promise_resolve` or `promise_reject` (thread-safe, one MPSC queue drained on the engine thread, Node-API threadsafe-function style). The engine owns the Promise object and keeps it reachable.
- **Threads** (video decode, gphoto2 worker): allowed only for modules with `ZN_THREADS` on targets whose capability `threads` is true; the ABI is never entered from two threads at once except `cb_post`, `promise_*`, `loop_ref`.

### 4.7 Compatibility layer so plugin sources do not change

`next/src/native/zrt_compat/` (new). It provides the generated `zinc_native_<x>.h` with the same shape as today:

```cpp
struct NativeSqlite : zrt::Object { virtual int32_t open(zrt::String path, int32_t flags) = 0; ... };
NativeSqlite* zinc_create_Sqlite();   // implemented by the plugin
```

and generated thunks `zn_thunk_Sqlite_open(self, cx, args, ret)` that build `zrt::String::from(args[0].s.p, n)` (or a non-owning view), call the virtual, convert the result and release it. `zrt::Array<T>` is built from the `ZnView`, `zrt::Fn` wraps a retained callback handle, `zrt::Promise<T>` wraps the promise id, `zrt::add_poller` registers into the module's `poll`. The old runtime (`runtime/zrt.cpp`, raster, gfx) is linked in the same host library, so `zrt::raster::dyn_*`, `zrt::gfx::*`, `hal_alloc` keep working and plugin code that draws shares frame state with the new `zinc:gfx` host module (the host library is the single owner of the runtime; the runtime starts lazily on first use, `RESUME.md:270`).

Two tiers result: **Tier A** (compat, links old `zrt`: all 33 existing plugins, desktop, Pi, rmpp, ESP32 core with `zrt` build) and **Tier B** (new code written straight against `zn/native.h`; no `zrt` dependency; the right choice for wasm and the PS1 freestanding runtime). The spec header generator ZN-060 produces both.

### 4.8 Per-target build

| Target | Where the native code lives | How it gets in | Notes |
|---|---|---|---|
| **Desktop interpreter** (`zinc run`, macos, linux) | shared library per plugin and per target: `~/.zinc/cache/<target>/plugins/<name>-<hash>.{dylib,so}`, exports `zn_module_open` | `zinc` compiles the plugin with the pinned `zig c++` the first time (hash of sources, defines, options, zn headers), then `dlopen`s it; `.c` vendored libs (sqlite3.c, wasm3, quickjs) go into a separate static archive compiled as C with warnings off, as `docs/plugins.md` says | keeps the `zinc` binary at 4.4 MB; no plugin enlarges it; `--native-library` stays for hand-built libs |
| **AOT program** (`zinc build`) | static link into the program | the generated `main` calls `zn_register_<x>()`; plugin objects come from the same cache; `pkg-config` system libs linked per `pkg`/`libs` | works for static targets (rmpp) and for `dynlib=false` |
| **Firmware** (ESP32 core) | compiled into a **board image** | `zinc flash --board <preset>` (`boards/*.json`) uses a prebuilt image per board (CI builds `core + display-x + imu + device` through ESP-IDF; `idf`/`idfComponents` of plugin.json become `REQUIRES`); `zinc flash --build` builds locally with the managed IDF (`tools/build-esp32-core` exists). The core's `ready` line lists its modules; `zinc run` checks the program's `natives` against it **before** uploading | the protocol line gains `mods=a,b,c` (`include/zn/devproto.h`) |
| **wasm** | static link at build | same as AOT with `zig c++ -target wasm32-wasi` | modules with `targets.wasm`: 3d, canvas2d, lottie, svg, three, (wasm3 inside wasm: skip) |
| **PS1 / PS2** | static link | only Tier B or freestanding Tier A (3d, canvas2d, lottie on ps2; pixelfont, gestures) | see 6.1 |
| **Host library of the engine** | `libzn_host_gfx.a` stays the home of gfx, sys, fs, storage, assets, os, process | unchanged | later these seven built-ins can be registered as a `ZnModule` too (one mechanism) without touching ZBC: the `Rt::Host*` rows stay as the fast built-in path |

Compile flags for plugin C++: the runtime's own (`-std=c++17 -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -O2`, `next/CMakeLists.txt:85`), plus `-DZP_<PLUGIN>_<KEY>=<value>` for options and `defines`/`flags` of the target entry.

### 4.9 Security note

A native module is trusted code (`engines.md` says the same); the dynamic loader loads only modules the build named, and records the SHA-256 of each library in the program manifest, as `precompiled-core.md` does for cores. `zinc:ffi` and `zinc:process` stay behind capabilities `dynlib` and `process` (so they are unavailable on rmpp, rpi1 armv6, esp32, wasm), as in `targets/capabilities.json`.

### 4.10 File layout

```
next/include/zn/native.h                  C ABI (ZnModule, ZnExport, ZnVal, ZnHostApi)
next/src/rt/native.cpp                    registry, CallNative, handles, promise and post queues
next/src/frontend/native.cpp              requireNative intrinsic, spec validation, sig encoding, natives section
next/src/native/gen/                      spec header and thunk generator (replaces compiler/src/native.ts)
next/src/native/zrt_compat/               zrt::String/Array/Fn/Promise/Poller adapters (Tier A)
next/src/plugins/                         plugin.json v2 reader, discovery, build cache, dlopen loader
next/tests/t0/native_demo/                fixture module in both tiers
```

---

## 5. Display plugins and HAL emulators as simulators of the new engine

### 5.1 What exists, and the gap

The host library already links `runtime/zrt.cpp`, `gfx.cpp`, raster, ttf, `hal_dispatch.cpp` (SDL window or null HAL, scripted input `ZINC_INPUT`, `ZINC_HEADLESS`). `gfx.cpp` already presents through `hal_display` when set. Therefore:

- A display plugin built into (or loaded next to) the host library registers its `HalDisplay` and receives frames with **no engine change**; what is missing is choosing the driver (`zinc.json` `display`, a `--display` flag) and honouring `host_window`/`owns_input` in `hal_dispatch.cpp`.
- `display-gl`, `display-fbdev`, `display-remote`, `display-scrollphat`, `display-ssd1306`, `display-ws2812`, `display-rmpp(emulator.cpp)` have a macOS or Linux branch that works today with a window; `display-st7789` has none.

Per-device finding: the macOS branch of `ssd1306.cpp` replaces the bus (`dev_write` returns true, `dev_show` paints from the driver's own `shown[]` page buffer), so a wrong command byte, wrong column span or wrong page order would not be caught in the simulator. The same holds for the Linux `/dev/i2c` branch under no emulation, and the ESP32 QEMU run only prints FNV-1a frame checksums (`ssd1306.cpp:17`). So the sims validate *framebuffer content*, not *what the chip would receive*.

### 5.2 Plan: two levels

**Level 1 (no source change, first):** link the existing drivers, keep the emulator windows, add a headless capture contract so the sims become testable: `ZINC_SHOT=file.bmp` exists for the SDL emulators (`emu_sdl.h`); add `ZINC_FRAMEHASH=1` (print `frame <n> <fnv32>` per presented frame) to every driver and to the null HAL, and store golden hashes next to the example (`examples/boards/*`). This is the same signal the QEMU runs already print, so the **same golden validates host emulator and ESP32 QEMU**.

**Level 2 (chip models, the real simulator):** a small bus shim and chip models in `next/src/sim/`:

```
next/include/zn/hw.h        zn_i2c_open/write/read, zn_spi_xfer, zn_gpio_*, zn_rmt_write, zn_pwm_*  (C)
  backends: esp32 (IDF drivers), linux (i2c-dev, spidev, gpiod), sim (models)
next/src/sim/chips/         ssd1306.cpp  st7789.cpp (+ ILI9341 flavour)  ws2812.cpp  is31fl3730.cpp  qmi8658.cpp  cst820.cpp  eink_panel.cpp
```

Each driver's `#if ESP_PLATFORM / __APPLE__ / __linux__` branch is replaced by calls into `hw.h` over time (a mechanical refactor per driver, 20 to 80 lines each; the drivers' logic, dithering, damage bands, gamma, serpentine mapping stays). The `sim` backend decodes the byte stream (SSD1306 GDDRAM and page addressing, ST7789 `CASET/RASET/RAMWR` and RGB565, WS2812 bit timing or the SPI-encoded bits, IS31FL3730 matrix registers, QMI8658 register map and who-am-i `0x05`, CST820 touch frames) into a pixel buffer shown in the SDL window or captured to PNG, and takes input from keys, mouse and a script. The QMI8658 model feeds the accelerometer registers from the keyboard or mouse (what `index.ts` does today in Zinc) so the real I2C read path runs. Chip models are also unit-testable alone (feed a captured byte stream, compare the bitmap).

Why this is the right cut: the board presets (`boards/*.json`: pins, orientation `rotate: 180`, colour order `RGB`, axis flips) are exactly what breaks on real boards and what a framebuffer-only emulator cannot check; a bus model checks command sequences, addressing and orientation without a board.

### 5.3 Per display plugin

| Plugin | Level 1 in the new engine | Level 2 model | Headless validation | What stays unvalidated without a board |
|---|---|---|---|---|
| ws2812 | link driver, emulator window | RMT and SPI bit decode to colours, order and gamma | frame hash, PNG | LED current and timing margins |
| ssd1306 | link driver, window | SSD1306 command and GDDRAM model (`0xA1 0xC8` flips, page and column span) | frame hash, PNG | contrast, I2C clock stretching |
| st7789 | **new**: link driver with a host stub of `esp_lcd` (or the `hw.h` backend), window | ST7789/ILI9341 DCS model, RGB565 bands | frame hash, PNG, band counts (damage correctness) | DMA timing, i80 bus waveforms, PWM backlight |
| scrollphat | link driver, window | IS31FL3730 register model | frame hash | I2C on a Pi |
| fbdev | Linux only; add a **file-backed fb backend** (`ZINC_FBDEV_SIM=<file>`, fixed `fb_var_screeninfo` for 16, 24, 32 bpp) so format conversion is tested on the Mac | same, plus scripted `struct input_event` stream | PNG of the file | real `FBIOGET_*` ioctl and KMS ownership (`lightdm` pitfall, `docs/reports/raspberry-pi.md`) |
| gl | macOS: SDL3 plus OpenGL 3.2 works as is. Linux: EGL `surfaceless` plus Mesa llvmpipe in a Linux runner, read back, compare with the software raster | n/a | pixel diff GPU vs software (tolerance) | KMS/DRM page flips, GLES2 driver differences on VideoCore |
| remote (+ `remote-view`) | pair test over loopback | n/a | frame hash both sides, RLE roundtrip (`rle_check.cpp`) | LAN beacon on real network |
| rmpp | `emulator.cpp` as is; **fake qtfb server** (the repo has `tests/rmpp/qtfb.cpp`, a socket-pair test) to run the real `rmpp.cpp` | `eink_panel` model of the policy in `eink.h` (FAST, UI, FULL, upgrade after idle) | PNG sequence, refresh-mode trace | waveforms, ~480 Hz pen, AppLoad sleep after mode change. `SOCK_SEQPACKET` on `AF_UNIX` is unavailable on macOS, so the real driver runs under Linux (container, qemu-user), not natively on the Mac |

### 5.4 Simulation levels (what each can and cannot prove)

| Level | Mechanism | Proves | Does not prove |
|---|---|---|---|
| L0 numeric profile | host interpreter with `--profile esp32|ps1|...`: f32, fixed point, heap and screen limits | arithmetic parity, memory budget, strict typing | speed, real memory map |
| L1 HAL emulation | SDL window or null HAL, display driver registered, scripted input | UI output, driver framebuffer logic | the wire protocol |
| L2 chip and bus models | `hw.h` sim backend plus chip models | command sequences, addressing, orientation, board presets | analog and timing |
| L3 CPU/ISA emulation | Espressif QEMU, qemu-user (arm, aarch64), PCSX-Redux, PCSX2, wasm runtimes | the real binary, ABI, memory limits, endianness, soft-float | peripherals not modelled by the emulator (see 6.2) |
| L4 hardware in the loop | real boards | everything | out of the owner's policy; the table `docs/reports/zinc-next-hardware.md` stays for whoever has boards |

---

## 6. Targets and profiles

### 6.1 Target and profile table

Profile values come from `compiler/src/cli.ts:34-45` (`PROFILES`) and `targets/capabilities.json`. "State in next" is what the files show.

| Target | Arch / ABI | Numbers | Heap | Screen | Typing | Prototype toolchain and runner | State in next | What next needs |
|---|---|---|---|---|---|---|---|---|
| **macos** | aarch64 / x86-64 Mach-O | f64 | 512 MB | 320x240 | gradual | clang, SDL3 window; native, VM, QuickJS engines | **done** (T0, T1, T2; interpreter, AOT, QuickJS; window and headless) | plugin loader (4.8), `zinc:osc/mqtt/gpio/platform/telemetry` |
| **linux** | x86-64 / aarch64 glibc | f64 | 512 MB | 320x240 | gradual | Docker `zinc/sdk-linux` | builds and T0/T1 pass in an ubuntu:24.04 container (`zinc-next-hosts.md`); T2 in container | same as macos; display `fbdev`, `gl` (KMS) |
| **sim** | host | f64 | 512 MB | 320x240 | gradual | Node, `sim/*.mjs` oracle | no equivalent: becomes the **interpreter on the host** (6.3) | `--profile` flag, `zinc test` runner |
| **wasm** | wasm32 | f64 | 64 MB | 320x240 | gradual | emscripten, canvas HAL (`targets/wasm/hal_web.cpp`, `shell.html`), verified by hand in Chrome | **missing** | `zig c++ -target wasm32-wasi` of `src/rt`, `vm`, `zbc`; HAL import glue; headless runner (wasmtime or Node WASI); targets.wasm plugins (3d canvas2d lottie svg three) |
| **rpi1** | ARMv6 hard float, VFP, musl static 32-bit | f64 | 64 MB | 1280x720 | gradual | Docker `zinc/sdk-rpi1` (Alpine), QEMU user `arm1176` | cross build of the **interpreter-less AOT** works for text programs (`zinc build --target armhf-linux`, `-mcpu=arm1176jzf_s`, `tests/t2/cross.sh` for aarch64); **no graphics host in cross builds** (`zinc-next-toolchain.md`) | cross-built host library (zrt, raster, display plugins); pinned `qemu-arm` runner; Debian or Alpine sysroot for libdrm, gbm, EGL, ffmpeg |
| **linux-aarch64 (Pi OS 64-bit)** | aarch64 glibc | f64 | 64 MB | 800x480 etc. | gradual | docker `zinc/sdk-linux`; the recommended target for a 64-bit Pi (`raspberry-pi.md`) | `zinc build --target aarch64-linux` works (text only) | as rpi1; the real Pi flow (`tools/validate-hardware`) is written, never run |
| **rmpp** | aarch64 static, Cortex-A53 | f64 | 256 MB | 1620x2160 portrait | gradual | Docker `zinc/sdk-rmpp` (Debian GCC static, no libcurl); `display-rmpp` over AppLoad qtfb; macOS e-ink emulator | `aarch64-linux` static build is possible with zig; nothing else | display-rmpp as a plugin (5.3), fake qtfb, e-ink panel model, `pen` input in host gfx (done for pen queue, check), cross-built host lib |
| **esp32** (chip esp32, esp32s3) | Xtensa LX6/LX7, ESP-IDF 5.5.5 (new) / 6.0 (old) | f32 | 160 KB (new core: about 280 KB free of 320 KB; S3 with PSRAM 1 MB+) | 320x240 | strict | old: per-program firmware in Espressif QEMU, UART output between `zinc:start` and `zinc:exit`. New: prebuilt **core firmware plus ZBC upload**, `zinc run --target esp32 --qemu` | **done for text programs**: `src/dev/core.cpp`, `firmware/esp32`, QEMU 9.2.2 and esptool pinned, T0 `device.sh`, T2 `esp32_qemu.sh`. Interpreter limits: 3000 register slots, 128 frames, 48 KB module | f32 profile for `number`; host modules in the core (gfx to SPI panels, gpio, net, storage NVS); board images with display and imu plugins (4.8); `ready` line with module list; display and IMU under QEMU or `device-sim` |
| **ps1** | MIPS R3000, no FPU, 2 MB RAM, PSn00bSDK (GCC 12.3 `mipsel-none-elf`) | **fx12 Q20.12** | 256 KB | 320x240 | strict | Docker `zinc/sdk-psx` (x86-64 image, emulated on Apple Silicon); PS-EXE and CD image; run headless in **PCSX-Redux** `-cli -testmode -interpreter` with OpenBIOS, TTY to stdout; 9/9 byte-identical with the fx12 oracle | **missing and blocked**: IR rejects fixed-point kinds | (a) fx12 and fx16 lowering pass and ops in `include/zn/ops.h`; (b) a **freestanding runtime** (the engine's `src/rt` uses `std::vector`, `unordered_map`, `std::string`, mimalloc; the prototype used TLSF and no libstdc++ on PS1 (unverified)); (c) typed AOT (ZN-042) as the only path (an interpreter in 256 KB is not planned); (d) VRAM-band HAL (`targets/ps1/hal_ps1.cpp`, reuse) |
| **ps2** | MIPS R5900 EE, 32 MB | f32 | 16 MB | 640x448 | gradual | Docker `zinc/sdk-ps2` (ps2dev GCC 15, gsKit, libpad); builds, never run (needs PCSX2 and a BIOS) | **missing** | ps2dev toolchain pinned, AOT or interpreter with full libstdc++ (feasible), PCSX2 headless runner needs a BIOS the owner supplies: **owner decision** |
| **null** | host | f64 | | any | | `targets/null/hal_null.cpp`: virtual clock, fixed step | **done**: it is the headless HAL of the host library | none |
| **common** | host | | | | | `targets/common/hal_posix.cpp` | done (linked by the host library) | none |

Numeric profiles (single source to create: `next/include/zn/profile.h` plus a table `targets/profiles.json` merged with `capabilities.json`):

| Profile | `number` is | Used by | In next |
|---|---|---|---|
| f64 | IEEE double | macos, linux, sim, wasm, rpi1, rmpp | default |
| f32 | float | esp32, ps2 | opcodes exist (`AddF32`, `LtF32`, `F32ToF64`...); no `--profile`; `number` always means f64 in the checker (`check.cpp:32`) |
| fx12 (Q20.12) | 32-bit fixed, 12 fraction bits, no FPU | ps1 | in the enum (`Num::fx12`), no lowering, IR refuses it |
| fx16 (Q16.16) | 32-bit fixed, 16 fraction bits | (reserved in the prototype's emitter) | in the enum, no lowering |

Capabilities and requirements (`targets/capabilities.json`, `docs/targets/capabilities.md`): `threads display touch pointer keyboard pen gamepad eink net fs audio gpu gpio process dynlib` plus numbers `heap fpu width height`. The new engine reads none of it. It must, so that `requires` of apps, plugins (`heap>=4M` for sqlite and script, `dynlib` for ffi) and conformance tests keep working and so that a plugin on an unsupported target gives a diagnostic instead of a link error.

### 6.2 Which simulator validates which target

| Target | Simulator | Pin and source | What it covers | Known gap |
|---|---|---|---|---|
| macos, linux | the machine, and an ubuntu:24.04 container (aarch64) for linux | none (CI runners ubuntu-24.04 and arm in `.github/workflows/zinc-next.yml`, not run yet) | everything but the hardware | workflow never ran |
| esp32 core | **Espressif QEMU 9.2.2** (xtensa), pinned and checksummed in `src/tc/tc.cpp`; `zinc run --qemu`; plus `zinc device-sim` (the core on the host, protocol over stdin) | already in `next/` | ISA, memory limits, UART protocol, core boot | peripherals: which of I2C, SPI master, RMT, LEDC, RGB LCD the pinned Espressif build models must be checked before relying on it for display drivers (unverified); the prototype used QEMU only for frame checksums over UART |
| esp32 drivers | `device-sim` with chip models (5.2) | new | bus-level correctness of ws2812, ssd1306, st7789, imu | analog and timing |
| rpi1 (armv6) | **qemu-user `arm` with `-cpu arm1176`** on Linux runners (pinned Debian `qemu-user-static` package, checksummed); on macOS, qemu-user does not exist, so use Docker only as an optional dev backend or `qemu-system-arm -M raspi1ap` with a pinned kernel and initramfs (heavy, unverified) | new pin | instruction set (VFPv2, no NEON), soft ABI, musl static binary | no display, no GPU |
| linux-aarch64 / Pi OS 64 | native on Apple Silicon through Docker `--platform linux/arm64` or a Linux VM (optional), qemu-user `aarch64` on Linux CI | | binary, libc, display file backend | KMS/DRM |
| rmpp | the aarch64 static binary under qemu-user or an arm64 container, with the **fake qtfb server** | new | the real `rmpp.cpp` protocol, refresh policy trace | waveform, pen latency (open hardware issue per `rmpp-latency-2026-09-29.md`) |
| wasm | **wasmtime** (pinned) or Node's WASI for headless conformance; Chrome with the canvas HAL for visuals | new pins | ZBC and AOT semantic parity on wasm32, 32-bit pointers | browser APIs beyond the HAL |
| ps1 | **PCSX-Redux** `-cli -testmode -interpreter`, OpenBIOS, Lua framebuffer readback (`targets/ps1/shot.lua`, `crt_check.cpp`) | the prototype used a docker image; needs a pin and a macOS build or a Linux runner | PS-EXE output, VRAM bands, fixed-point arithmetic | speed, GTE-less 3D |
| ps2 | PCSX2 `-batch -nogui` with the owner's BIOS (no QEMU model of the PS2) | needs the BIOS | build and boot | legally the BIOS cannot be shipped; the prototype never ran it |

### 6.3 What the "sim oracle on Node" becomes, and `zinc test`

The prototype oracle is `sim/*.mjs` plus the emitted JS run by Node, compared byte for byte with each target. In the new engine (design §5.5: the interpreter replaces the Node sim) four roles replace it:

1. **Frozen goldens are the data oracle.** `next/corpus/conformance/*.out` (18 pure-language programs, the M3 set) and `tests/conformance/*.out` (61 programs, with 44 `.fx12.out`, 46 `.f32.out`, `.1280x720.out`, `.1620x2160.out` variants produced by the old toolchain) are checked in; no Node needed. Add a manifest of which golden applies to which profile and size.
2. **The interpreter is the reference engine.** `zinc test` runs a program on the interpreter under the target's **profile** (numeric kind, heap budget, screen size, typing) and compares with the golden. AOT, native hosts, QEMU, PCSX-Redux and wasm runs compare with the **interpreter's output** (the diff matrix already does interpreter vs AOT: `tools/diff-matrix`, `tests/t2/diff.sh`, 67 programs).
3. **QuickJS is not an oracle for typed numerics**: JS numbers do not wrap `i32` and have no f32 or fixed point (`zinc-next-quickjs.md`: `tour` and `features` differ). Its roles: the second engine, the backend of `zinc:script`, a conformance run on the 13 programs without typed features (`tests/t1/quickjs.sh`), and a test262 subset for Dyn (open item 4 of `zinc-next-open-questions.md`).
4. **Node and tsc stay as an optional one-way checker oracle** (`next/tools/oracle`: everything we accept, tsc accepts), never required to run tests (tests exit 77 and print SKIP without it).

`zinc test` architecture (one task, ZN-080): a `Runner` interface with `build(program, target, profile) -> artifact`, `run(artifact, env, frames) -> {stdout, exit, frames}` and `requires`. Implementations: `HostInterp`, `HostAot`, `Quickjs`, `Esp32Qemu` (device protocol over the QEMU serial TCP socket), `DeviceSim`, `QemuUser(arm|aarch64)`, `Wasmtime`, `PcsxRedux`, `Pcsx2`. A program is skipped on a profile by `// zinc-test: requires ...` and `capabilities.json` (printing the reason, as `docs/targets/capabilities.md` describes). Output of the runner stays the `PASS/FAIL/SKIP` one-liner format of `tests/run`.

Plugin parity gates that already exist as programs and become the acceptance tests of the ABI work: `tests/conformance/{sqlite,socket,wasm,ffi,sys_process,script_basic,script_async,lottie,canvas2d,scene3d,three,ink,gestures,os_info}.ts` with their `.out` goldens.

---

## 7. Proposed backlog

Numbering continues from the last task (ZN-057). Sizes: S about 1 session, M 2 to 3, L 4+ (the repo's convention). "Lib" = the proven library the task uses or vendors. Ordering: ABI first, then plugin batches, then display and profiles, then targets.

### 7.1 Native-module ABI (wave 1)

| ID | Title | Description | Acceptance criteria | Size | Depends on | Lib |
|---|---|---|---|---|---|---|
| ZN-058 | Native ABI header and registry | `include/zn/native.h` (4.4), `src/rt/native.cpp`: registry, `zn_register_module`, handles with generations, `CallNative`, promise and post queues drained by the loop, shutdown order | T0 test with a C fixture module: scalar, string, u8[], callback, promise from a thread, resource finalized at the exact release; ASan and UBSan clean; `ZN_ABI_VERSION` mismatch refused | M | ZN-052 (stable ZBC) | none (from `zinc_abi.h`, WAMR table style) |
| ZN-059 | `requireNative<Spec>` intrinsic and ZBC natives section | frontend recognises it, validates member types to signature strings, emits the `natives` section and `CallNative`; verifier checks sig and index; loader resolves and compares; diagnostics Z5010 (bad type) and Z5011 (not linked) replace the runtime throw; sim fallback chain real, `.next.ts`, `.sim.ts` with `--native=real|sim|auto` | the fixture spec of ZN-058 runs in the interpreter and AOT; a wrong signature is refused at load naming both; `tests/t0/modules.sh` still passes; lottie and video still resolve their `.next.ts` | M | ZN-058 | none |
| ZN-060 | Spec header and thunk generator in C++ | `zinc native-gen` produces `zinc_native_<x>.h` (abstract `NativeX` with `zrt` types, `zinc_create_X`) and `zn_thunk_<x>.cpp` + registration from the spec; Tier B C header variant | for all 22 specs the generated header is equivalent to `compiler/src/native.ts` output (golden compare after normalising whitespace); no Node used | M | ZN-059 | none |
| ZN-061 | zrt compat adapters | `src/native/zrt_compat/`: `zrt::String` from `ZnStr`, `Array<T>` from views, `Fn` from retained callbacks, `Promise<T>`, `Poller` mapped to `poll`, `g_err` to error status | `sqlite.host.cpp`, `process.host.cpp`, `socket.host.cpp` build **unmodified** and pass conformance `sqlite.ts`, `sys_process.ts`, `socket.ts` against their goldens | M | ZN-060 | none (old `zrt`) |
| ZN-062 | plugin.json v2 reader and discovery | real JSON parse in C++ (replace the `find` hack in `modules.cpp:380`), `targets.*`, `options` to `ZP_*` defines, `requires`, new keys of section 3; search path as today; `zinc plugins` listing | all 33 existing manifests load; unknown key warns; `zinc plugins` output matches the prototype's; Z5003 for an unlisted target | S | none | a small JSON lib (nlohmann or the one `third_party` already has, see ARCHITECTURE rule) |
| ZN-063 | Plugin build cache and dynamic loader | compile plugin sources with the pinned zig into `~/.zinc/cache/<target>/plugins`, `.c` vendored libs as a separate static archive, `pkg-config` for system libs, `dlopen` of `zn_module_open`, SHA-256 recorded in the manifest; AOT static link path with `zn_register_<x>()` in generated `main` | `zinc run` of the sqlite conformance program compiles the plugin once (cache hit afterwards) and passes; `zinc build` links it statically; cache key changes when an option changes | L | ZN-061, ZN-062, `src/tc` | zig (pinned) |

### 7.2 Plugin ports (wave 2, each depends on ZN-063 unless noted)

| ID | Title | Description | Acceptance | Size | Depends | Lib |
|---|---|---|---|---|---|---|
| ZN-064 | Batch A: sqlite, wasm, process, ffi | vendor sqlite 3.53.4 and wasm3 under `third_party/`; ffi on libffi instead of the hand-rolled register call | conformance `sqlite.ts`, `wasm.ts`, `sys_process.ts`, `ffi.ts` pass on macos and in the linux container; libffi replaces `ffi.host.cpp` call code with the same spec | M | ZN-061, ZN-063 | SQLite, wasm3 (or WAMR spike, ZN-065), libffi |
| ZN-065 | Spike: WAMR versus wasm3 | build both behind the `wasm` spec, compare size, speed, maintenance, host import callbacks | a one-page decision with numbers; same `wasm.ts` golden passes on the winner | S | ZN-064 | WAMR, wasm3 |
| ZN-066 | `zinc:script` on `src/qjs` | rebase the script plugin on the engine's own QuickJS-ng (one vendored copy); `Dyn` crosses as a snapshot letter `x`; limits and interrupt through the QuickJS hooks | `script_basic.ts`, `script_async.ts` pass; `plugins/script/vendor/quickjs` no longer used by next; time and memory limit tests pass | M | ZN-061, ZN-051 (done) | QuickJS-ng |
| ZN-067 | Batch B: raster plugins (canvas2d, svg, lottie, 3d, three, map) | link against the host library's `zrt_raster`; one runtime owner; stb_image gains JPEG; `ZRT_POINT_POOL` defines from plugin.json | `canvas2d.ts`, `lottie.ts`, `scene3d.ts`, `three.ts` goldens (all three profiles where `.f32/.fx12` exist, see ZN-072) pass; pixel diff to the old build equals zero; lottie keeps the 12 lottie-web comparisons | L | ZN-061, ZN-063 | stb_image |
| ZN-068 | Batch C: sockets and loop (socket, devtools, remote-view, display-remote) | keep the specs; decide libuv adoption (see below) | `socket.ts` loopback conformance passes; `devtools` scripted CDP client test passes; remote pair test (display-remote with remote-view) frame hashes equal | M | ZN-061 | libuv, wslay (decision inside the task) |
| ZN-069 | Batch D: media and devices (video, gphoto2) | FFmpeg and libgphoto2 as system libraries (dynamic, LGPL); runtime images; `fake` camera; promise completions from the worker | a decode of a test clip produces the same first frame hash as the old build; fake-camera session completes capture through promises; `ZN_THREADS` capability checked | L | ZN-061, ZN-063 | FFmpeg, libgphoto2, libjpeg-turbo |
| ZN-070 | Display driver selection in the host library | `zinc.json` `display` and `--display`, link or load the driver, honour `host_window` and `owns_input` in `hal_dispatch.cpp`, driver options to `ZP_*` | `display-ws2812`, `display-ssd1306`, `display-scrollphat` windows run `examples/boards/*` on the new engine; `display-rmpp` emulator runs `examples/remarkable/notes`; null HAL still wins for `ZINC_HEADLESS` | M | ZN-063 | SDL3 |
| ZN-071 | Missing core modules | `zinc:osc`, `zinc:mqtt`, `zinc:gpio`, `zinc:events`, `zinc:platform`, `zinc:telemetry` as built-in `ZnModule`s (reuse `runtime/mod/*.cpp`) | `osc`/`mqtt` loopback tests; `platform` exposes capabilities; `mapping` plugin gets its OSC | L | ZN-058 | libgpiod (Pi), none else |

### 7.3 Profiles and conformance

| ID | Title | Description | Acceptance | Size | Depends | Lib |
|---|---|---|---|---|---|---|
| ZN-072 | Profile table and `--profile` | `include/zn/profile.h`, `targets/profiles.json` merged with `capabilities.json`; `zinc run/test --profile`; `number` alias per profile; heap budget enforced by the allocator; screen defaults; strict typing flag | `esp32` profile on the host interpreter makes `number` an f32; heap overflow trap message; `zinc check` rejects what the profile forbids; goldens `*.f32.out` pass for the f32-capable programs | M | none | none |
| ZN-073 | Fixed-point lowering (fx12, fx16) | IR pass lowering `fx12`/`fx16` to integer ops with the exact rounding of `sim/fx_sin.mjs` and `runtime/fx_sin.h`; shared `ops.h` semantics; sin/cos tables | all `tests/conformance/*.fx12.out` programs pass on the host interpreter under `--profile ps1` and in AOT | L | ZN-072 | none (reuse `runtime/gen_tables.mjs` output as data) |
| ZN-074 | Goldens by profile | manifest of golden per (program, profile, size); import the 44 fx12, 46 f32 and size variants; `// zinc-test: requires` support | `zinc test --profile X` picks the right golden; listing shows SKIP reasons | S | ZN-072 | none |
| ZN-075 | Capability checks | read `targets/capabilities.json`; `requires` of `zinc.json`, `plugin.json`, `@requires` comments, `// zinc-test:`; diagnostics Z5003, Z5004, Z5005 | `hero` refused on esp32 with the old message; sqlite refused on `heap<4M`; ffi refused on rmpp | S | ZN-062, ZN-072 | none |
| ZN-080 | `zinc test` and the Runner interface | section 6.3; first runners: HostInterp, HostAot, Quickjs, Esp32Qemu, DeviceSim | `zinc test` over the 18 M3 programs gives PASS on all runners listed; skip lines name the reason | M | ZN-074, ZN-075 | none |

### 7.4 Hardware simulation

| ID | Title | Description | Acceptance | Size | Depends | Lib |
|---|---|---|---|---|---|---|
| ZN-081 | Frame hash and capture contract | `ZINC_FRAMEHASH`, `ZINC_SHOT` for every driver and the null HAL; goldens next to `examples/boards/*` | same hash from the macOS emulator and from `device-sim`; goldens stored | S | ZN-070 | none |
| ZN-082 | `hw.h` bus shim with linux and esp32 backends | C API of 5.2; mechanical port of ssd1306, ws2812, scrollphat, imu to it | drivers build for esp32 (IDF) and Linux and still produce the same frames as before | M | ZN-070 | none |
| ZN-083 | Chip models, wave 1: SSD1306, WS2812, QMI8658 | `src/sim/chips/`; unit tests with captured byte streams | a stream captured from the real driver renders the golden bitmap; a deliberately wrong init byte makes the test fail (which today it would not) | M | ZN-082 | none |
| ZN-084 | Chip models, wave 2: ST7789 + CST820, IS31FL3730 | band renderer correctness (damage), orientation `madctl` | board preset `esp32-2432s022` renders the golden through the model; `display-st7789` runs on the host | M | ZN-083 | none |
| ZN-085 | fbdev file backend and evdev script | `ZINC_FBDEV_SIM`, fixed screeninfo for 16, 24, 32 bpp, scripted `input_event` stream | the three depths give the same PNG as the software raster; multitouch script reaches gfx | S | ZN-070 | none |
| ZN-086 | Fake qtfb server and rmpp panel model | promote `tests/rmpp/qtfb.cpp` to a harness; model of the refresh policy and mode switches; run the real `rmpp.cpp` under Linux (qemu-user or container) | refresh-mode trace and PNG sequence golden for `examples/remarkable/notes`; AppLoad one-second sleep modelled | M | ZN-070, ZN-092 | none |
| ZN-087 | `device-sim` with boards | `zinc device-sim --board <preset>` runs the core with the board's chip models and a window; ESP32 core reports `mods=` and `zinc run` checks imports before upload | s3-matrix demos run in the window with tilt from the mouse; upload of a program needing a missing module fails early | M | ZN-083, ZN-095 | none |
| ZN-088 | EGL surfaceless check for display-gl | Linux runner with Mesa llvmpipe; read back and diff against the software frame | tolerance-based pixel diff passes on the three `tests/visual` programs | S | ZN-092 | Mesa llvmpipe |

### 7.5 Targets

| ID | Title | Description | Acceptance | Size | Depends | Lib |
|---|---|---|---|---|---|---|
| ZN-090 | Cross-built host library | build `libzn_host_gfx.a` (zrt, raster, ttf, null HAL, plugin objects) for aarch64-linux and armhf-linux with the pinned zig; Debian or Alpine sysroot download (checksummed) for libdrm, gbm, EGL, ffmpeg headers | `zinc build --target aarch64-linux examples/hero` links graphics and runs headless in qemu-user, pixel golden equal | L | ZN-063 | zig, Debian sysroot |
| ZN-091 | rpi1 and Pi OS runner | pinned qemu-user static (Linux), optional Docker on macOS (documented), runner `QemuUser`; armv6 flags | conformance subset (the 9 programs of the old rpi1 row) passes under `qemu-arm -cpu arm1176` | M | ZN-080, ZN-090 | qemu-user |
| ZN-092 | Linux CI image without Docker for the sims | a documented ubuntu runner recipe: qemu-user, Mesa llvmpipe, wasmtime, PCSX-Redux where available; `tests/t2` lines for each | the workflow runs T2 green on ubuntu-24.04 and arm | M | ZN-091 | qemu-user, llvmpipe |
| ZN-093 | rmpp target | static aarch64 build with display-rmpp, sqlite, socket, wasm, script, lottie, canvas2d, ink, remarkable status; capability `pen`, `touch` | `examples/remarkable/{notes,dashboard}` run under qemu-user with fake qtfb and match goldens | M | ZN-086, ZN-090 | none |
| ZN-094 | wasm target | `zig c++ -target wasm32-wasi` build of `rt`, `vm`, `zbc` (interpreter in the browser) and of AOT output; canvas and input imports (small JS glue, no emscripten); headless runner on wasmtime | the 18 M3 programs match the interpreter on wasmtime; breakout draws in Chrome through the canvas glue; plugin list for wasm builds links | L | ZN-072, ZN-080 | zig, wasmtime |
| ZN-095 | ESP32 board images and host modules in the core | prebuilt images per board preset (ws2812, ssd1306, st7789 + cst820, imu, device, gpio, net, NVS storage, canvas2d, lottie, 3d, pixelfont); IDF `REQUIRES` from plugin.json; `zinc:gfx` host over the panel HAL | s3-matrix and 2432s022 images boot in QEMU and in `device-sim`; frame hash equals the host emulator's; image size listed | L | ZN-072, ZN-083, ZN-082 | ESP-IDF |
| ZN-096 | Check what the pinned Espressif QEMU models | list modelled peripherals of `esp32` and `esp32s3` machines (I2C, SPI, RMT, LEDC, GPIO, RGB LCD); record in `zinc-next-esp32.md`; decide per driver whether QEMU or `device-sim` is the gate | a table in the doc; at least one display driver exercised under QEMU or a documented "no" | S | none | Espressif QEMU |
| ZN-097 | Spike: freestanding runtime for PS1 | measure what `src/rt` needs from libstdc++; try typed AOT output with a small allocator (TLSF) and no exceptions; clang `mipsel` mips1 soft-float versus PSn00bSDK GCC | a hello and `fib` PS-EXE run in PCSX-Redux; written verdict and the list of rt changes | L | ZN-042 (typed AOT), ZN-073 | PSn00bSDK, TLSF |
| ZN-098 | ps1 target and PCSX-Redux runner | HAL ps1 reuse, VRAM bands, deterministic frame step, runner `PcsxRedux` | the 9 programs of the old ps1 row pass byte-identical; breakout screenshot hash | L | ZN-097, ZN-080 | PCSX-Redux |
| ZN-099 | ps2 build and optional PCSX2 runner | pin ps2dev toolchain; build the engine with libstdc++; runner only when the owner supplies a BIOS path | build gate in CI; runner skipped (not failed) without BIOS; decision recorded | M | ZN-090 | ps2dev, PCSX2 |

### 7.6 Hygiene

| ID | Title | Description | Acceptance | Size | Depends | Lib |
|---|---|---|---|---|---|---|
| ZN-100 | Plugin `.sim.ts` policy | sims stay only where the real native cannot run in a profile (gphoto2 fake, process, socket on esp32); convert the ones used as defaults to the Zinc subset (`.next.ts`); delete `nodeFlags` | list of plugins with the chosen default; lottie and video `.next.ts` either draw or are deleted in favour of the real native | S | ZN-067, ZN-069 | none |
| ZN-101 | Native module trust and manifest | library hashes in the program manifest, refuse unlisted modules, `--allow-native` for ad hoc libs; doc update of `docs/security` | tampered library refused; test in T0 | S | ZN-063 | SHA-256 (already vendored) |
| ZN-102 | Windows guard | nothing is ported; make plugin build and ABI free of POSIX assumptions where cheap (libuv choice helps) and keep the experimental CI job | no new POSIX-only code in `native.h` and `src/native/` | S | ZN-068 | libuv |

Suggested order: 058, 059, 060, 061, 062 then 063; in parallel 072 to 075; then 064, 066, 067, 070 (the largest user-visible gains), 081 to 083, 090 to 092, 095, 094, then the console targets 097 to 099 last because they carry the most risk.

---

## 8. Owner decisions needed

1. **ABI base:** evolve `zinc_abi.h` v4 (recommended) versus a fresh design. Recommended because it exists, is tested on two engines, and its rules (borrowed arguments, module-owned results, no exceptions) are the ones in section 4.5.
2. **Shared libraries versus linking plugins into `zinc`:** recommended shared library per plugin for the desktop interpreter (small `zinc`, cache, hot reload), static for AOT and firmware.
3. **zrt compat as Tier A, with an eventual Tier B only for new code:** recommended; the alternative (rewrite all natives to the C ABI) costs about 12 000 lines of C++ for no user-visible gain.
4. **PS2 BIOS:** no emulator-only validation is possible without it; either the owner provides one for local runs or PS2 stays build-only.
5. **PS1 and the engine's runtime:** PS1 needs a freestanding runtime and fixed-point lowering; it is the largest and most uncertain target. Defer behind a spike (ZN-097).
6. **Rpi1 (armv6) versus Pi OS 64:** `docs/reports/raspberry-pi.md` already recommends `linux` arm64 for a 64-bit Pi. Make `aarch64-linux` the primary Pi target and keep armv6 as secondary, gated by qemu-user.
7. **Own versus proven libraries for sockets, SVG and Lottie:** libuv yes; ThorVG only if pixel goldens are re-frozen (it would end pixel identity with the shared rasterizer).
8. **Display sim depth:** Level 1 only (windows plus frame hashes) is cheap and enough for UI; Level 2 (chip models) is what makes "validated by simulator" true for board presets. Recommended: do both, Level 2 for the five chips of the two shipped boards plus the Scroll pHAT.

## 9. Sources read

`next/ARCHITECTURE.md`, `next/RESUME.md`, `next/include/zn/{runtime,host,hostsys,devproto,value,limits}.h`, `next/src/host/*`, `next/src/rt/rt.h`, `next/src/rt/rtcalls.cpp`, `next/src/frontend/modules.cpp`, `next/src/qjs/qjs.cpp`, `next/CMakeLists.txt`, `next/third_party/README.md`, `docs/reports/zinc-next-{design,hostmodules,esp32,hosts,hardware,decisions,open-questions,quickjs,m3-conformance,toolchain,packaging}.md`, `docs/{plugins,engines,boards,precompiled-core}.md`, `docs/reports/{STATUS,raspberry-pi}.md`, `docs/targets/{capabilities,playstation,remarkable-paper-pro}.md`, `docs/security/third-party.md`, `docs/decisions/0010-native-modules.md`, `runtime/include/{hal,zinc_abi}.h`, `runtime/mod/native.h`, `targets/capabilities.json`, `compiler/src/cli.ts` (PROFILES), all 33 `plugins/*/plugin.json`, the 22 `native/*.spec.ts` (sampled: sqlite, script, video, gphoto2, socket, ffi, mapping, devtools, lottie), and the native sources of ssd1306, st7789, rmpp emulator, ws2812 emulator, canvas2d, device, imu.
