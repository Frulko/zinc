# 6. Testing

## The sim oracle

Zinc's testing story rests on one property: the `sim` target runs your program on Node.js and is the **oracle** —
every native target must print exactly the same bytes. Fixed-point, f32 and f64 results are bit-identical across
targets by design (ADR 0005). So "does my program behave the same on the PS1 as on my Mac?" is a byte comparison, not
a guess.

```sh
zinc run app --target sim              # the reference behaviour
zinc run app --target macos            # must match sim, byte for byte
zinc run app --profile ps1 --target sim   # oracle under a different number/size profile
```

## `zinc test`

`zinc test` runs the conformance suite in [`tests/conformance/`](../../tests/conformance): each program is run on sim
and on the target, and both must equal the recorded `.out` file. It also checks golden `--emit=hir`/`--emit=mir` dumps
in `tests/golden`. Every run is [deterministic](#determinism): the programs see a virtual clock, not the machine's.

```sh
zinc test                              # sim + host native
zinc test --target rpi1                # sim vs ARMv6 under QEMU
zinc test --profile ps1                # fixed-point profile (gradual-only programs are skipped)
zinc test --debug                      # under ASan/UBSan
zinc test --update                     # re-record .out files (after an intended change)
zinc test --update-golden              # re-record HIR/MIR golden dumps
zinc test --pixels                     # visual regression (below)
```

Expected-output filenames encode the profile: `foo.out`, `foo.f32.out`, `foo.640x448.out`, so one program can have a
per-representation golden. A program can require the gradual profile with a `// zinc-test: gradual` first line (it is
skipped in strict profiles); `// zinc-test: deterministic` marks a program that needs deterministic mode (skipped on
esp32, ps1, ps2 and wasm, which have no environment to turn it on).

## Your project's tests: `zinc test <dir>`

`zinc test <dir>` works like `tjs test` or `elsa test`. It finds every `test-*.ts(x)` and `*.test.ts(x)` under the
directory, skipping `build/` and `node_modules/`.

- **How each file runs.** It is built and run as its own program on the target, in deterministic mode.
- **Pass or fail.** A file passes when it exits with 0. `zinc:assert` throws `AssertionError` on a failed check, and an
  uncaught error exits with 1.
- **Timeout.** `ZINC_TEST_TIMEOUT` bounds each program, in milliseconds (default 60000).

```ts
// tests/test-cart.ts
import * as assert from 'zinc:assert';
import { total } from '../src/cart';

assert.equal(total([2, 3]), 5);
assert.deepEqual([1, 2].map((x: number) => x * 2), [2, 4]);
assert.throws(() => { total([-1]); }, 'negative');
```

```sh
zinc test tests                    # on the host (native build)
zinc test tests --target sim       # on Node, fast
zinc test tests --target rpi1      # ARMv6 under QEMU
```

`zinc:assert` provides `ok`, `equal` / `notEqual` (`===`), `deepEqual` (compares the JSON), `throws(fn, substring?)`,
`rejects(asyncFn, substring?)` and `fail`. A worked example is in
[`examples/testing/tests`](../../examples/testing/tests).

## `zinc compat`: standards conformance

`zinc compat` measures how much of the standards Zinc covers, against reference engines. It runs pinned external suites
through Zinc (sim and native, gradual and strict profiles) and through Node, Deno, Bun and QuickJS: the WPT files of
the [WinterTC Minimum Common Web API](https://min-common-api.proposal.wintertc.org/), a test262 sample, curated Node
API tests and quickjs-ng's own tests. The suites are fetched at the commits pinned in `tests/compat/manifest.json` into
the git-ignored `tests/compat/cache/` (offline afterwards); results go to `tests/compat/results/<date>.json` and the
table [reports/compat.md](../reports/compat.md).

```sh
zinc compat                                # everything, 4 jobs (~20 min)
zinc compat --suite test262 --filter String/prototype/at   # a slice, not recorded
zinc compat --engines zinc-sim,node        # fewer engines
zinc compat --check                        # exit 1 when a Zinc pass of tests/compat/baseline.json regressed
zinc compat --update-baseline              # record this run's Zinc passes as the baseline
```

## Conformance-style tests for your own app

To compare targets rather than check values, reuse the oracle. Split the core of your app into functions that print, run
both sides in deterministic mode, and compare sim against your target:

```sh
ZINC_DETERMINISTIC=1 zinc run myapp --target sim  > expected.out
ZINC_DETERMINISTIC=1 zinc run myapp --target rpi1 > got.out
diff -u expected.out got.out            # empty diff = behaviour matches
```

For a UI app, bound the run with `ZINC_FRAMES`, drive it with the `ui` test hooks or a [recorded tape](#record-and-replay),
then compare frames ([`zinc capture`](#captures), `zinc test --pixels`) or the inspector `dump()`. To fold your
programs into `zinc test`, drop them in `tests/conformance/` with a recorded `.out` (generated by `zinc test --update`).

## Determinism

A Zinc run is a function of the program, its input and the frame count: run it twice, get the same bytes and the same
pixels. Deterministic mode makes that true for everything the runtime owns. It is on with `ZINC_DETERMINISTIC=1`, and
implied by `ZINC_RECORD` / `ZINC_REPLAY`, `zinc test` (both sides) and `zinc capture`. It guarantees:

- **Virtual clock.** `Date.now()`, `performance.now()`, `sys.clock()`, `console.time` and timers read a clock that
  starts at 0 and only moves when the program does: by `dt` at the start of each frame, or, for a program without a
  frame loop, straight to the next timer (no waiting). While sockets or other pollers have work in flight, it moves
  1 ms per real millisecond, like the real loop.
- **Fixed frame time.** `dt` is `ZINC_FIXED_DT`, else 1/60 s, on every HAL (display drivers included); frames are not
  paced by the wall clock, and the window system cannot run extra frames (live resize redraws are skipped).
- **Strict timer order.** Timers fire in (due time, creation) order, each one followed by all its microtasks, then the
  frame callback runs. The sim applies the same rules to the program's timers (`sim/zinc.mjs`), so its output is the
  oracle for native runs.
- **Seeded randomness.** `Math.random` is a xorshift32 with a fixed default seed on every target (`Math.seed(n)` sets
  it), in or out of deterministic mode.
- **No live input.** The mouse, keyboard, touch and pen of the machine are ignored; the program sees only a replayed
  tape or the `ui` test hooks (`ui.pointerAt`, `keyDown`, `typeText`...).
- **Fixed surface.** The SDL window keeps its logical size (`fill` resize is off) and the clipboard is process-local.
- **Same float results.** Every native build uses `-ffp-contract=off`: no fused multiply-add, so arithmetic rounds
  like the sim (IEEE, one operation at a time) on arm64, x86-64, ARMv6 and Xtensa alike.

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

## Captures

The runtime rasterizes frames itself (`runtime/raster.cpp`), so it can save the one on screen on any HAL with a file
system (SDL window, headless null HAL, docker/QEMU targets), at its physical size, as PNG (uncompressed stored blocks,
no dependency) or, for a path ending in `.bmp`, BMP:

```sh
ZINC_FRAMES=120 ZINC_SHOT=last.png zinc run myapp                  # the last frame when the program ends
ZINC_SHOT=out.png ZINC_SHOT_FRAMES=1,30,60 zinc run myapp          # out-1.png, out-30.png, out-60.png
ZINC_SHOT=out.png ZINC_SHOT_EVERY=10 ZINC_FRAMES=100 zinc run myapp  # every 10th frame
```

Frames are numbered from 1, like `ZINC_FRAMES` counts them. From code, `gfx.capture('frame.png')` saves the frame on
screen (false when it cannot be written; always false on the sim, which draws nothing). Display-driver emulators keep
their own `ZINC_SHOT` picture of the emulated device (BMP); on ps1 the emulator saves it (`targets/ps1/shot.lua`).

`zinc capture` does it for any program, headless and deterministic (SDL's dummy video driver, `ZINC_SCALE=1`),
and writes compressed PNGs:

```sh
zinc capture examples/breakout --frames 1,60 --out shots/     # shots/breakout-1.png, shots/breakout-60.png
zinc capture myapp --every 30                                 # up to ZINC_FRAMES (60), into build/shots/
zinc capture myapp --target rpi1 --frames 120                  # docker/QEMU: --out must be inside the project
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

## Visual regression: `zinc test --pixels`

Programs in [`tests/visual/`](../../tests/visual) render headless in deterministic mode; the frames named by a
`// zinc-test: frames 1,30` line (default 60) must equal their golden PNGs `tests/visual/<name>-<n>.png`
(`<name>-<n>.fx12.png`, `<name>-<n>.1280x720.png`... for other profiles) pixel for pixel. A failure keeps the frame
and a diff (differences in red over the faded expected image) under `build/visual/<target>-<profile>/`:

```sh
zinc test --pixels                      # macos
zinc test --pixels --profile ps1        # fixed-point profile, its own goldens
zinc test --pixels --target rpi1        # the same goldens, rasterized on ARMv6 under QEMU
zinc test --pixels --update             # re-record the goldens after an intended change
```

`tests/visual/clock.ts` draws from an interval, `Date.now` and `Math.random`: with `ZINC_DETERMINISTIC=0` its frames
no longer match, which is the point.

## `--debug`: ASan and leak reports

`--debug` builds with AddressSanitizer + UndefinedBehaviorSanitizer and prints a leak report at exit; the target for a
clean run is **0 live objects**. Use it to catch use-after-free, bad casts and reference-cycle leaks (which RC does not
collect — see [the language](02-language.md)).

```sh
zinc run myapp --debug                 # ASan/UBSan; watch for the live-object count at exit
zinc test --debug                      # the whole suite under sanitizers
```

`sys.liveObjects()` / `sys.allocations()` report runtime counts from inside the program.

>>>>

## Dev mode: red box and inspector

`zinc dev` (chapter 1, [dev mode](../dev-mode.md)) is the interactive testing loop: hot reload on save, a full-screen
**red box** on any panic/uncaught error (with the Zinc call stack in dev builds), a LogBox-style banner for
`console.warn`/`error`, and a **UI inspector** for `zinc:ui` apps over the Chrome DevTools protocol on `:9229`
(Elements, computed styles, live class editing, console, native screenshots). `scripts/cdp-check.mjs` is a scripted
client that exercises the inspector. **F12** in the program window saves the frame on screen to
`<project>/build/shots/frame-<n>.png`.

## Benchmarks

Performance numbers vs QuickJS and Node are in [reports/PERF.md](../reports/PERF.md) (~27× QuickJS, ~70 KiB binaries,
~2 ms startup), with the benchmark programs in `tests/`.

**Frame budgets.** `zinc bench [example dirs] [--target macos]` (alias `zinc test --bench`; default: hero,
zed-editor, maps/navigation) builds each example whose `zinc.json` has a `bench` entry, runs its scripted scene
headless in deterministic mode with the profiler ([dev mode, profiling](../dev-mode.md#profiling)), prints p50 / p99
per phase, and fails when the p99 of the frame work exceeds the budget:

```json
"bench": { "demo": "bench", "frames": 600, "p99Ms": 25 }
```

`demo` is the `ZINC_DEMO` value that scripts the scene (it quits by itself or after `frames`). Timings are wall
clock: budgets keep headroom for a loaded machine.

For code, run a benchmark program directly and time it, or use `console.time` / `performance.now()` inside the
program:

```ts
console.time('parse'); doWork(); console.timeEnd('parse');   // "parse: 3.2ms"
```

Next: [distribution](07-distribution.md).
