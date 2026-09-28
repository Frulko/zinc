# Dev mode: hot reload, red box, inspector

`zinc dev [entry] [--target <id>] [--device user@host] [--no-devtools]` rebuilds on every save and puts the new
version on screen, shows crashes in the app instead of killing it, and exposes the UI tree to Chrome DevTools.
What is possible depends on the target:

| | macos (on macOS), linux (on Linux) | wasm | sim | rpi1 / linux `--device user@host` | linux, rpi1 without a device (docker/QEMU) | esp32, ps1, ps2 |
|---|---|---|---|---|---|---|
| **reload on save** | hot: new library in the same window | page reload (server-sent event) | process restart | copy + restart over ssh | process restart | not available (`zinc build` + flash) |
| **red box** (dev) | yes, window stays up | yes, in the canvas | no (Node prints the error) | yes (on the device's screen when it has one) | yes (headless: printed) | release policy only |
| **fatal signals caught** | yes (SIGSEGV/BUS/FPE/ILL/ABRT, stack overflow) | no (a wasm trap is a JS exception) | — | yes | yes | no |
| **Zinc stack in the report** | yes | yes | Node stack | yes | yes | release: message only |
| **inspector** (Chrome DevTools) | yes, stays connected across reloads | no | no | yes, port forwarded by ssh | no (port not published from the container) | no (esp32 possible later) |
| **console streaming** | terminal + DevTools console | page console panel | terminal | ssh terminal + DevTools | terminal | serial monitor |
| **console.warn/error banner** | yes | yes | no | yes | yes | no |

Release builds choose a crash policy in `zinc.json`: `"crash": "exit" | "redbox" | "restart"` (default `exit`, the
previous behaviour). `redbox` and `restart` work on every target, the overlay is drawn by the runtime with the
software rasterizer, so it also shows on esp32/ps2 screens.

## Hot reload (macos, linux)

The program is split in two:

- **host** (`runtime/dev_host.cpp`, `build/<target>-dev/cmake/zinc_host`): the HAL (SDL window, input, the TLSF heap
  region). It never restarts while you edit.
- **program library** (`app.so`): generated code, runtime (`zrt`), modules, plugins, baked fonts. Only
  `zinc_main.cpp` (and changed plugin sources) recompile on a save, at `-O0 -g`.

On a save, `zinc dev` compiles in process (the compiler stays warm), copies the library to
`build/<target>-dev/cmake/hot/app-<n>.so` (a new file per version, so the loader never hands back the old image), and
writes `reload <path>` on the host's fd 3. The running version returns from its event loop, runs its module deinit
(`__dispose`), shuts down pollers (sockets, threads), clears timers, microtasks and the `at_finish` hooks, and is
unloaded with `dlclose`. The new one is loaded and starts **from its entry**: module state is not preserved (like a
React Native full reload, not Fast Refresh). What is kept: the window, its size and position, the heap region (the
new runtime re-initializes it, so everything the old version allocated is discarded at once; the count of objects
still alive at teardown is printed), assets (read from disk through `ZINC_ASSETS`), and the DevTools connection.
If the host itself changes (a program starts or stops using `zinc:gfx`), `zinc dev` restarts it.

Measured on an M-series Mac (macOS 15, make generator, no ninja):

| program | save → first new frame | zinc compile | C++ (`-O0`) + link | load + first frame |
|---|---|---|---|---|
| gfx program (`zinc:gfx`, 15 lines) | 505–540 ms | 70–90 ms | 250–275 ms | ~150 ms |
| Solid UI program (`zinc:ui/solid` + inspector) | ~1.2 s | ~400 ms | 470–550 ms | ~250 ms |

`load + first frame` is dominated by macOS validating a newly written library on first `dlopen` (~120 ms, measured
by loading a fresh copy that fails symbol binding); a second load of the same file takes under 1 ms. The UI program
pays for `lib/std/ui.ts` + `solid.ts` being compiled into `zinc_main.cpp` every time, and for re-baking fonts
(~60 ms) whenever the source text changes. The first build of a session is slower (cold compiler, full C++ build).

## Red box

A panic (bounds, null, out of memory…), an uncaught error or rejected promise, and on POSIX a fatal signal of the main
thread, jump back to the event loop (`setjmp`/`longjmp` in `runtime/zrt.cpp`; signals via
`hal_trap_faults` in `targets/common/hal_posix.cpp`, on an alternate stack so stack overflows are caught). The
runtime then draws a full-screen report over the last frame and keeps the window alive:

- the message, then the Zinc stack: dev builds keep one `LocFrame` per function call whose `loc` is set before
  each statement (`__lf.loc = N`, `compiler/src/emit-cpp.ts`); the table `zinc_locs[]` maps `N` to
  `function (file.ts:line)`. For an uncaught `throw`, the stack of the `throw` statement is shown. Release builds
  have no table (message only);
- a hint: save a file (dev) or press Enter/Space/click to restart the program in place (deinit, teardown, init).

Restarting in place abandons the frames that were running: objects they held leak (bounded by the stack). Policy
`restart` restarts at once; three crashes within five seconds give up (exit 101). A program without a screen treats
`redbox` as `restart` (release) or stops and waits for the next save (dev). Fatal signals are only caught on POSIX
hosts; after a signal in native code the heap may be damaged, which is why dev relies on the next reload.

`console.warn` / `console.error` show a yellow banner at the bottom of the screen in dev builds (count + last
message, hidden after 8 s), like React Native's LogBox.

## Frame capture, record and replay

- **F12** in the program window (dev builds, any `zinc:gfx` program) saves the frame on screen, overlay included, at
  its physical size to `<project>/build/shots/frame-<n>.png` (`ZINC_SHOT_DIR` overrides the directory); the terminal
  prints the path.
- The inspector answers `Page.captureScreenshot` with the same native frame (below).
- `ZINC_RECORD=session.tape zinc dev` records the input of the version on screen (each reload starts a new tape) in
  deterministic mode; `ZINC_REPLAY=session.tape` or `zinc capture --replay` plays it back frame for frame. See
  [Testing: determinism, captures, record and replay](guide/06-testing.md#determinism).

## Inspector (plugins/devtools)

`zinc dev` adds `plugins/devtools` to programs that use `zinc:ui` (on macos, linux, rpi1); elsewhere
`import 'zinc:devtools'` or `zinc build --devtools` opts in, `--no-devtools` opts out. The program listens on
`127.0.0.1:9229` (`zinc.json` `plugins.devtools.port`, or `ZINC_DEVTOOLS_PORT` to run two programs at once) and speaks a subset of the Chrome DevTools protocol:

- discovery: `/json/list`, `/json/version`; in Chrome open `chrome://inspect`, *Configure…* → `localhost:9229`,
  (localhost:9229 is in the default list) then *inspect* under Remote Target (or open
  `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:9229/zinc`);
- **Elements**: `DOM.getDocument`, `requestChildNodes` — the component tree: each component shows as its own element
  (`<Shell>`, `<Card>`, `<Button>`; dev builds record the names), host nodes as `view`, `text`, `button`…; plain
  fragments (grouped children, dynamic slots) are not shown, their children are. Text as text nodes, attributes `class` and `layout` (`x,y wxh`); editing `class` (`DOM.setAttributeValue`,
  `setAttributesAsText`) restyles the node live; `DOM.getBoxModel`;
- **Computed styles**: `CSS.getComputedStyleForNode` with the layout values (position, size, padding, margin, gap,
  flex, colors, font size, radius, opacity);
- **Overlay.highlightNode** draws a blue box over the node in the app (through scroll offsets and transforms);
- **inspect mode** (the arrow at the top left, `Overlay.setInspectMode`): hovering the app highlights the node under
  the pointer, in the app and in Elements (`Overlay.nodeHighlightRequested`); a click selects it in Elements
  (`Overlay.inspectNodeRequested`) and ends the mode. Meanwhile the app gets no pointer or key input;
- **screencast** (the page view next to the panels, `Page.startScreencast`): the frame on screen, shrunk by a whole
  factor to the size DevTools asks for, as PNG, sent when it changed and the previous frame was acknowledged
  (at most 10 per second);
- **Page.captureScreenshot** returns the frame on screen as a base64 PNG, rasterized by the runtime at the window's
  physical size (`format`, `clip` and `quality` are ignored);
- **Console**: `Runtime.consoleAPICalled` for every `console.*` (the last 32 are replayed when DevTools connects);
  `Runtime.evaluate` answers that there is no JavaScript engine;
- tree changes: `DOM.documentUpdated` for structure/class changes, `DOM.characterDataModified` for text;
- **Performance** (`Tracing.start` / `Tracing.end` → `Tracing.dataCollected`, `tracingComplete`): the frames recorded
  in between, as Chrome trace events (see [Profiling](#profiling));
- every other method gets an empty result so the frontend never waits.

Across a hot reload the sockets are handed to the new version (`ZINC_DEVTOOLS_FDS`), which sends
`executionContextsCleared`/`Created` and `documentUpdated`: DevTools stays connected.
`node scripts/cdp-check.mjs [port]` is a scripted client that checks all of the above against a running program.

On a remote device, `zinc dev --device` runs ssh with `-L 9229:127.0.0.1:9229`, so Chrome on the dev machine uses
`localhost:9229` as well.

## Profiling

Every frame is split into phases, timed on the logic thread (`runtime/gfx.cpp`, marks in `lib/std/ui.ts` `frame()`):

| phase | |
| --- | --- |
| `app` | the program's frame callback before the UI frame (`render(App, bg, tick)`: `tick`), timers |
| `input`, `anim`, `layout`, `paint` | zinc:ui: input and scrolling, `animate()`, layout, emitting the draw commands |
| `effects` | microtasks drained after the frame callback |
| `diff` | logical → physical pixels, the frame diff into damage rectangles |
| `raster` | rasterizing the damaged rows: the span of the bands (SDL HAL; other HALs count it in `present`) |
| `present` | the rest of the HAL present (texture upload, vsync) |

- `ZINC_PROFILE=1`: at exit, p50 / p99 / max per phase on stderr, plus `work` (every phase but `present`):
  `zinc profile: frames=600 work p50=1.44 p99=7.92 max=10.80 ms`, then one line per phase (the last 4096 frames).
- `ZINC_TRACE=t.json`: the frames as Chrome trace events (logic thread, one track per raster band); load the file
  in Chrome's Performance panel or `chrome://tracing`. The inspector's `Tracing` domain gives the same events live.
- `zinc bench` (or `zinc test --bench`): see [testing](guide/06-testing.md#benchmarks).
- Off (the default), a mark costs one test; buffers (~700 KiB) are allocated only when profiling.

`ZINC_VISUALIZE=damage` flashes the damaged rectangles of each frame (magenta, fading over 30 frames);
`ZINC_VISUALIZE=cmds` draws a translucent red box per draw command, so areas drawn by many commands glow. Both are
an overlay of the runtime: without the variable, frames and goldens are unchanged.

When a frame emits more than `ZRT_MAX_DRAW_CMDS` commands (8192), `ZRT_TEXT_POOL` text bytes or `ZRT_POINT_POOL`
floats, the extra is dropped and the runtime warns once per pool on stderr.

## Remote devices (`--device user@host`)

For `--target rpi1` (or `linux`): the docker cross build, then `rsync` of the binary and the assets directory to
`~/zinc-dev/<name>/` on the device, then `ssh -tt` runs it (with `ZINC_ASSETS`); each save kills the ssh session
(the program gets SIGHUP) and starts again. Requires ssh keys (or a password prompt per save) and rsync on the device.
Not hot reload: the dev library is not used on devices yet.

## Not available

- esp32 / ps1 / ps2: no process to replace. `zinc build` + flash; a flash-and-monitor loop for esp32 is a possible
  follow-up. The crash policy (`zinc.json` `crash`) does apply to their release builds.
- sim: the Node process restarts; use `node --inspect` for a debugger.
