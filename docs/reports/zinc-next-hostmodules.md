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
