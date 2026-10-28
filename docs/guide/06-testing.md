# 6. Testing

## One program, several engines

A Zinc program runs the same on every engine: the interpreter (the reference), the AOT build (C++, native) and the QuickJS
engine, and on the other JavaScript engines for plain JavaScript. Floating-point, fixed-point and `f32` results are
meant to be identical across them, so "does it behave the same on my Mac and on a Pi?" is a byte comparison, not a guess.
`zinc test` makes that comparison for you.

## `zinc test`

```sh
zinc test [--runner interp|aot|quickjs|jsc|v8|hermes|esp32-qemu|devicesim] [--profile P] [dir]
```

`zinc test` runs the tests of `dir`, else of the project in the current directory (when it has a `zinc.json`), else the
engine's own `tests/conformance`. `--runner` says how each program runs: `interp` (the default), `aot` (compiled to native
code), `quickjs`, `jsc`, `v8` or `hermes` (the JavaScript engines; `v8` and `hermes` are downloaded on first use), `esp32-qemu`
(the ESP32 emulator) or `devicesim` (a simulated device). A runner that cannot run on this machine is listed as skipped, with
the reason. `--profile P` runs under a target profile (number kind, screen, heap).

A project's tests are the files `test-*.ts(x)` and `*.test.ts(x)` below the directory (`build/` and `node_modules/` are
skipped):

- **How each file runs.** It is run as its own program, in deterministic mode.
- **Pass or fail.** A file passes when it exits with 0. `zinc:assert` throws `AssertionError` on a failed check, and an
  uncaught error exits with 1.
- **Timeout.** `ZINC_TEST_TIMEOUT` bounds each program, in milliseconds (default 60000).

```ts
// tests/cart.test.ts
import * as assert from 'zinc:assert';
import { total } from '../src/cart';

assert.equal(total([2, 3]), 5);
assert.deepEqual([1, 2].map((x: number) => x * 2), [2, 4]);
assert.throws(() => { total([-1]); }, 'negative');
```

```sh
zinc test                          # the project's tests, interpreted
zinc test --runner aot             # the same tests compiled to native code
zinc test --runner quickjs tests   # on the QuickJS engine
```

`zinc:assert` provides `ok`, `equal` / `notEqual` (`===`), `deepEqual` (compares the JSON), `throws(fn, substring?)`,
`rejects(asyncFn, substring?)` and `fail`. A worked example is in
[`examples/testing/tests`](../../examples/testing/tests) (`zinc test examples/testing/tests`).

Programs of the conformance kind (the engine's own `tests/conformance`) are compared with a recorded output instead:
`foo.ts` is run and its output must equal `foo.out` (`foo.f32.out`, `foo.1280x720.out` for another profile). A comment on the
first lines sets how it runs: `// zinc-test: gradual` (skipped in strict profiles), `deterministic`, `skip ps1`,
`requires heap>=4M net`, `max-frames N`. Those goldens are the frozen outputs of the first generation of Zinc and are
compared, not regenerated.

## Compare the engines on your own program

Split the core of your app into functions that print, run it on two engines in deterministic mode, and compare:

```sh
ZINC_DETERMINISTIC=1 zinc run myapp --interp > expected.out
ZINC_DETERMINISTIC=1 zinc run myapp --native > got.out
diff -u expected.out got.out            # empty diff = behaviour matches
```

For a UI app, bound the run with `ZINC_FRAMES`, drive it with the `ui` test hooks or a [recorded tape](#record-and-replay),
then compare frames ([`zinc capture`](#captures)) or the inspector `dump()`. To try a program on a device you do not have,
`zinc run --simulate <device>` runs it with that device's screen, battery, sensors and keys (the devices are in `devices/`).

Standards conformance (`zinc compat`, WPT, test262) is maintainer material: `zinc help compat` describes it; it needs Node.

## Determinism

A Zinc run is a function of the program, its input and the frame count: run it twice, get the same bytes and the same
pixels. Deterministic mode makes that true for everything the runtime owns. It is on with `ZINC_DETERMINISTIC=1`, and
implied by `ZINC_RECORD` / `ZINC_REPLAY`, `zinc test` and `zinc capture`. It guarantees:

- **Virtual clock.** `Date.now()`, `performance.now()`, `sys.clock()`, `console.time` and timers read a clock that
  starts at 0 and only moves when the program does: by `dt` at the start of each frame, or, for a program without a
  frame loop, straight to the next timer (no waiting). While sockets or other pollers have work in flight, it moves
  1 ms per real millisecond, like the real loop.
- **Fixed frame time.** `dt` is `ZINC_FIXED_DT`, else 1/60 s, on every HAL (display drivers included); frames are not
  paced by the wall clock, and the window system cannot run extra frames (live resize redraws are skipped).
- **Strict timer order.** Timers fire in (due time, creation) order, each one followed by all its microtasks, then the
  frame callback runs. Every engine applies the same rules, so the output is the same on all of them.
- **Seeded randomness.** `Math.random` is a xorshift32 with a fixed default seed on every target (`Math.seed(n)` sets
  it), in or out of deterministic mode.
- **No live input.** The mouse, keyboard, touch and pen of the machine are ignored; the program sees only a replayed
  tape or the `ui` test hooks (`ui.pointerAt`, `keyDown`, `typeText`...).
- **Fixed surface.** The SDL window keeps its logical size (`fill` resize is off) and the clipboard is process-local.
- **Plugin jobs in order.** Blocking work a plugin runs on its worker (`runtime/zrt_jobs.h`: zinc:ipod's reads) is waited for at
  the next turn of the loop, so its promise settles in the same frame on every run, however busy the machine is.
- **Same float results.** Every native build uses `-ffp-contract=off`: no fused multiply-add, so arithmetic rounds
  the same way (IEEE, one operation at a time) on every processor.

What is still not deterministic:

- **I/O timing**: network replies (`zinc:net`, MQTT, OSC), files changed by others, the gphoto2 camera, remote-view
  beacons. Their results arrive when the OS delivers them; stub them out for a reproducible run.
- **Threads**: video decoding (`plugins/video`) runs on its own thread and paces playback with the real clock; its
  shuffle seed is taken from the clock too.
- **Plugins that read the OS clock themselves** (`hal_time_us`, not `zrt::now_ms`): the e-ink emulators' refresh
  timing, remote display pacing. The map plugin's per-frame tile budget uses the runtime clock: in deterministic mode
  every visible tile is rendered in the first frame.
- **Performance counters**: `stats.frame_us`, telemetry `frame_ms`, the dev-mode timings.
- **Recording gaps**: tapes carry `HalInput` (keys, text, buttons, pointer, wheel, touch) but not pen samples or window
  resizes, and are raw structs for the host that wrote them (little-endian, same `hal.h`).
- **Console targets**: esp32, ps1, ps2 and wasm have no environment to switch the mode on. Their frame time is fixed
  already (1/60, esp32 1/30), but timers follow the hardware clock.
- **Pixel density**: frames are rasterized at the window's physical size (`ZINC_SCALE`, Retina × zoom); captures pin
  `ZINC_SCALE=1` so goldens do not depend on the screen.
- **Window renderer**: on macOS the window shows the software raster through Metal, the frame in memory the GPU reads (`ZINC_RENDERER=auto`, the
  default: three buffers of the window's size where OpenGL held nine, about 80 MB for a 1180x760 window at density 2 instead of 210;
  `tools/window-memory` measures it; `--simulate` keeps OpenGL, which turns the picture; `ZINC_PRESENT=texture` takes SDL_Renderer). On Linux
  the window draws the frame's commands with OpenGL when the machine has a GPU (`ZINC_RENDERER=auto`,
  the default; `gl` forces it, on macOS too, `cpu` keeps the software raster; Mesa's llvmpipe counts as no GPU) and waits for the display between frames
  (`ZINC_VSYNC=0` to measure without it). `ZINC_GL_STATS=1` names the renderer and prints the replay's counters at exit, with the GPU time per frame on macOS (a timer query). Transparent windows and display plugins use the software raster. Captures, goldens and headless
  runs always use the software raster: it is the reference the GL output is compared with (`tests/t1/gl_renderer.sh`).

## Captures

The runtime rasterizes frames itself (`runtime/raster.cpp`), so it can save the one on screen on any HAL with a file
system (SDL window, headless null HAL, simulated devices), at its physical size, as PNG (uncompressed stored blocks,
no dependency) or, for a path ending in `.bmp`, BMP:

```sh
ZINC_FRAMES=120 ZINC_SHOT=last.png zinc run myapp                  # the last frame when the program ends
ZINC_SHOT=out.png ZINC_SHOT_FRAMES=1,30,60 zinc run myapp          # out-1.png, out-30.png, out-60.png
ZINC_SHOT=out.png ZINC_SHOT_EVERY=10 ZINC_FRAMES=100 zinc run myapp  # every 10th frame
```

Frames are numbered from 1, like `ZINC_FRAMES` counts them. From code, `gfx.capture('frame.png')` saves the frame on
screen (false when it cannot be written). Display-driver emulators keep
their own `ZINC_SHOT` picture of the emulated device (BMP); on ps1 the emulator saves it (`targets/ps1/shot.lua`).

`zinc capture` does it for any program, headless and deterministic (SDL's dummy video driver, `ZINC_SCALE=1`),
and writes compressed PNGs:

```sh
zinc capture examples/breakout --frames 1,60 --out shots/     # shots/breakout-1.png, shots/breakout-60.png
zinc capture myapp --every 30                                 # up to ZINC_FRAMES (60), into build/shots/
zinc capture myapp --replay session.tape --frames 300          # with recorded input
```

## Record and replay

`ZINC_RECORD=session.tape` runs the program deterministically but keeps the live input, and writes every frame whose
input changed to the tape. `ZINC_REPLAY=session.tape` plays it back: same frames, same input at the same frame
numbers, so the same pixels. A bug report becomes *program + tape + frame number*.

```sh
ZINC_RECORD=bug.tape zinc run myapp                        # play until the bug shows, close the window
ZINC_REPLAY=bug.tape ZINC_FRAMES=900 zinc run myapp        # the same session, again
zinc capture myapp --replay bug.tape --frames 850,900      # the frames around it, as PNG
```

Under `zinc dev` (`ZINC_RECORD=... zinc dev`), each reload starts a new tape: it holds the session of the version on
screen.

## Visual regression

Capture the frames you care about with `zinc capture` (headless, deterministic, `ZINC_SCALE=1`), keep the PNGs as goldens in
your repository and compare a new capture with them in your own script or CI (`tools/pngdiff a.png b.png` in the Zinc
sources does it, with a diff image). The engine's own frames are checked the same way by `tests/run`.

## Finding a crash: `zinc build --debug`

`zinc build --debug` makes a debug executable for `lldb`: `-g -O0`, locals under their names, functions named after the
Zinc ones and the `.ts` lines in the stack. `sys.liveObjects()` / `sys.allocations()` report runtime counts from inside
the program, which is how you catch a [reference-cycle leak](02-language.md#memory-model).

## Dev mode: red box and inspector

`zinc dev` (chapter 1, [dev mode](../dev-mode.md)) is the interactive testing loop: hot reload on save, a full-screen
**red box** on any panic/uncaught error (with the Zinc call stack in dev builds), a LogBox-style banner for
`console.warn`/`error`, and a **UI inspector** for `zinc:ui` apps over the Chrome DevTools protocol on `:9229`
(Elements, computed styles, live class editing, console, native screenshots). `scripts/cdp-check.mjs` is a scripted
client that exercises the inspector. **F12** in the program window saves the frame on screen to
`<project>/build/shots/frame-<n>.png`.

## Benchmarks

`zinc bench [entry|dir] [--frames n]` runs a program headless for n frames (default 120) and prints p50 / p99 / max per
phase (app, layout, paint, raster...); [dev mode, profiling](../dev-mode.md#profiling) explains the phases. For code, time it
inside the program:

```ts
console.time('parse'); doWork(); console.timeEnd('parse');   // "parse: 3.2ms"
```

## On a device

A machine paired with `zinc device pair` (it runs `zinc agent`) is debugged and measured from this one
([dev mode, debug and measure on the device](../dev-mode.md#debug-and-measure-on-the-device)):

- `zinc dev --device <name>`: the program runs there, and its inspector is on `localhost:9229` here (`chrome://inspect`).
- `zinc device <name> profile <app> [--frames n]`: the app runs with the frame profiler; its summary and its trace (`<app>-trace.json`, for Perfetto or `chrome://tracing`) come back.
- `zinc device <name> bench [--scene id] [--out file.json]`: the render suite of `tools/zbench` runs there; its JSON is written here.
- `zinc device <name> top`: the machine's load, memory and temperature, and each app's CPU and memory, every second.

Next: [distribution](07-distribution.md).
