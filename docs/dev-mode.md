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
`127.0.0.1:9229` (`zinc.json` `plugins.devtools.port`, or `ZINC_DEVTOOLS_PORT` to run two programs at once: the variable wins, and `0` takes any free
port; the line `zinc devtools: ...` on stderr names the port in use) and speaks a subset of the Chrome DevTools protocol:

- discovery: `/json/list`, `/json/version`; in Chrome open `chrome://inspect`, *Configure…* → `localhost:9229`,
  (localhost:9229 is in the default list) then *inspect* under Remote Target (or open
  `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:9229/zinc`);
- **Elements**: `DOM.getDocument`, `requestChildNodes` — the component tree: each component shows as its own element
  (`<Shell>`, `<Card>`, `<Button>`; dev builds record the names), host nodes as `view`, `text`, `button`…; plain
  fragments (grouped children, dynamic slots) are not shown, their children are. Text as text nodes, attributes `class` and `layout` (`x,y wxh`); editing `class` (`DOM.setAttributeValue`,
  `setAttributesAsText`) restyles the node live; `DOM.getBoxModel`;
- **Computed styles**: `CSS.getComputedStyleForNode` with the layout values (position, size, padding, margin, gap,
  flex, colors, font size, radius, opacity; padding, margin and border widths also per side, for the box model);
- **Styles** (ZN-369): `CSS.getMatchedStylesForNode` shows what each source of the node's style declares, as read-only rules: its classes
  (`.p-2.bg-rose-600.rounded`), its style sheets (`style={StyleSheet}`) and its style numbers (`style={numbers}`). `element.style` is the
  inspector's own layer, applied over them: type properties there or edit a value in the box model (`CSS.getInlineStylesForNode`,
  `CSS.setStyleTexts`) and the app changes at once. It knows padding and margin (also the shorthands), gap, row-gap, column-gap, width,
  height, min/max sizes, border-radius, border-width, font-size (lengths in px), background-color, color, border-color (`#rgb`,
  `#rrggbb`, `rgb()`) and opacity; other properties stay in the text, marked as not applied. Every edit sends the session's patch to the
  console, one line per edited node in the form its source uses: a node with style sheets or numbers gets the keys to add to its style
  object (`style, add { paddingLeft: 20, backgroundColor: "#10b981" }`), another node its new class string (`class="p-2 rounded
  pl-[20px] bg-[#000000]"`: a class that sets only edited properties is replaced, one that sets more stays and the new class after it
  wins). The edits last until the node goes away; nothing is written to the source;
- **Overlay.highlightNode** draws a blue box over the node in the app (through scroll offsets and transforms);
- **inspect mode** (the arrow at the top left, `Overlay.setInspectMode`): hovering the app highlights the node under
  the pointer, in the app and in Elements (`Overlay.nodeHighlightRequested`); a click selects it in Elements
  (`Overlay.inspectNodeRequested`) and ends the mode. Meanwhile the app gets no pointer or key input;
- **screencast** (the page view next to the panels, `Page.startScreencast`): the frame on screen, shrunk by a whole
  factor to the size DevTools asks for, as PNG, sent when it changed and the previous frame was acknowledged
  (at most 10 per second);
- **Page.captureScreenshot** returns the frame on screen as a base64 PNG, rasterized by the runtime at the window's
  physical size (`format`, `clip` and `quality` are ignored; on Zinc Next the screencast also gets the frame whole);
- **Console**: `Runtime.consoleAPICalled` for every line the program prints (`console.log` as log, `console.error` as error; the last 32
  are replayed when DevTools connects). On Zinc Next the runtime passes each line to the host as it writes it (`zn::rt::gConsoleTap`, out of
  the interpreter's loop) and `zinc:devtools` sends them every 100 ms (ZN-373.01);
  `Runtime.evaluate` answers that there is no JavaScript engine;
- **live tree**, like a web page's: 10 times a second the shown tree is compared with what DevTools has, and the
  differences go out as mutations (`DOM.childNodeInserted` / `childNodeRemoved` as screens mount and unmount,
  `attributeModified` / `attributeRemoved`, `characterDataModified` for text), so Elements follows navigation
  without collapsing and flashes what changed. Attributes: `class`, `layout` (read when the node is selected),
  `hidden`, `state` (`hover`, `focus`, `active`, `disabled`, changing as you interact) and `on` (the events the node
  listens to: `click pointerdown drag`…);
- **Performance** (`Tracing.start` / `Tracing.end` → `Tracing.dataCollected`, `tracingComplete`): the frames recorded
  in between, as Chrome trace events (see [Profiling](#profiling));
- **Network** (Zinc Next; `Network.enable`): every request the program starts, from the host's network log
  (`next/src/host/netlog.h`). `fetch` and `zinc:net` show as requests (`requestWillBeSent`, `responseReceived` with
  status, headers and the timing of DNS, connect, TLS and first byte, `loadingFinished` / `loadingFailed`; a redirect is
  an entry per hop; `getResponseBody`, `getRequestPostData`); a WebSocket of `zinc:socket` and a `zinc:mqtt` client show
  as WebSockets with their messages (`webSocketCreated`, `webSocketFrameSent` / `Received`; MQTT packets read
  `PUBLISH topic payload`, `SUBSCRIBE filter`); any other outgoing TCP socket shows as a `tcp://host:port` request with
  the bytes it received. Requests made before DevTools attached are listed too. Headers that carry credentials are
  masked as `***` when they are recorded (`Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, any name
  containing token, secret, password, api-key, session or credential, and the names in `ZINC_NET_SENSITIVE=a,b`), and
  `user:password@` in a URL becomes `***@`. Bodies and query strings are shown as they are unless you name what to
  hide: the names in `ZINC_NET_SENSITIVE` (those only, whatever their case) are also masked as query parameters (in
  URLs and in `Location`), as fields of a urlencoded form and as JSON fields at any depth, in request and response
  bodies and in WebSocket and MQTT text (`"pin":"***"`, the rest of the body is kept byte for byte). Not masked:
  free text, multipart forms, the bytes of a plain TCP socket, names written percent-encoded or with JSON escapes.
  Bounds: the last 1000 requests, 4 MiB per body;
- every other method gets an empty result so the frontend never waits.

Across a hot reload the sockets are handed to the new version (`ZINC_DEVTOOLS_FDS`), which sends
`executionContextsCleared`/`Created` and `documentUpdated`: DevTools stays connected.
`node scripts/cdp-check.mjs [port]` is a scripted client that checks all of the above against a running program; with `--styles` it
checks the Styles panel on `next/tests/data/devtools_styles` (`next/tests/t1/devtools_styles.sh`).

**Zinc Inspector** (ZN-373.01): `zinc run app/inspector/main.tsx -- [port...]` is the same client written in Zinc (zinc:ui, the WebSocket
of zinc:socket): it finds the programs listening on the ports (9229 and 9222 by default: `zinc:devtools` and `zinc debug --cdp`), attaches
to one and shows its Elements tree (read again when it changes), the computed style and box of the selected node (highlighted in the
program), its matched rules and `element.style` to edit, its console, its screen (the screencast) and its requests with their bodies.
Attached to `zinc debug --cdp` (a target of type node), it opens the Sources view: the program's scripts with line numbers, a click on a line
sets or removes a breakpoint (with the condition typed in the toolbar), Run starts the waiting program, Resume, Over, Into, Out and Pause
drive it; the right column shows the call stack, the scopes (objects and arrays unfold) and the watches, evaluated in the selected frame.
The Performance view records the runtime's frames (Tracing.start / end, the same spans as `ZINC_TRACE`): the time of each phase over the
recording, the frames as bars of their phases to scale, and the phases of the frame picked (the slowest at first). The runtime keeps the
last 32768 spans (about 3600 frames). `next/tests/t1/inspector.sh` runs it against a headless program and a `zinc debug --cdp` session
(`ZINC_INSPECTOR_DUMP=1` prints its views).

On a remote device, `zinc dev --device` runs ssh with `-L 9229:127.0.0.1:9229`, so Chrome on the dev machine uses
`localhost:9229` as well.

A device that runs the agent needs no ssh: `zinc device [<device>] inspect <app>` brings the inspector of an app running there to a port
of this machine and prints the address for Chrome, and Zinc Inspector lists the apps of the paired devices with the programs of this
machine (`docs/reports/zinc-next-agent.md`).

### HAR export

`zinc run --har out.har <entry>` (or `ZINC_HAR=out.har`, which compiled and exported programs read too) records the
same log without the inspector and writes it as a HAR 1.2 file: one entry per request with
headers, URLs and bodies (masked as above; `encoding: base64` when a body is not text), `timings` (`dns`, `connect`, `ssl`,
`send`, `wait`, `receive`) and, for WebSockets and MQTT clients, Chrome's `_webSocketMessages`. Open it with *Import HAR
file* in the Network panel of Chrome DevTools. The file is written when the program ends and, while it runs, each time
the log changed: at most once a second (less often when the log is large, so writing stays under 5% of the time), whole
and renamed over the previous one (`out.har.tmp`). A program that is killed (SIGTERM, SIGKILL) or crashes therefore
leaves a valid HAR, at most about a second behind; it has no signal handler for this.

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

### Run and build progress

`zinc run` and `zinc build` report their stages on stderr by default, also when redirected. JavaScript projects
name QuickJS and show preparation, entry loading, execution and exit status. Native builds report how many
C++ units came from the cache, completed jobs and elapsed time; a terminal animates the current stage while
the compiler or linker runs. A stage announces itself before it starts, so a long operation is visible.

`-q` or `ZINC_STEPS=0` hides progress. `-v` adds detailed module timings; `--log-format json -v` keeps stderr
as JSON. Program stdout is separate. Tests set `ZINC_STEPS=0` unless they check these messages.

When an automatic native-plugin build or load fails, Zinc warns with the module, cause and selected
simulation or Next implementation. Cached launches repeat that warning. `ZINC_NATIVE=real` refuses the
fallback instead. Explicit simulation and deterministic runs name the selected simulation without claiming
the real plugin is broken. These diagnostics describe backend selection; they cannot detect arbitrary bugs
inside successfully loaded plugin code.

### Performance panel (`ZINC_PERF_HUD`)

`ZINC_PERF_HUD=1` (or `"dev": {"perfHud": true}` in `zinc.json`, or Cmd/Ctrl+Shift+P while the program runs) shows
a floating panel over any zinc:gfx or zinc:ui program, like React Native's perf monitor. It lists:

- FPS and the time between frames;
- `work` p50 / p99, the numbers `ZINC_PROFILE` prints at exit;
- frames that took more than 25 ms (`dropped`);
- the draw commands of the frame and how much of the screen it damaged;
- the phases of the table above, averaged over 30 frames;
- the engine with the runtime allocator's live blocks and allocations per frame (interpreter and AOT).

A graph of the last 120 frames stacks the phases in the colours of the legend, with a line at 16.7 ms.

- Drag it anywhere; a click on its `-` collapses it to an FPS badge, a click on the badge expands it. The program
  does not see a pointer that went down on the panel.
- It is an overlay of the runtime, like the red box, so the program's tree, layout and goldens never see it. A frame
  with the panel differs from one without only inside its rectangle (`tests/t1/perf_hud.sh`).
- It is rebuilt 10 times a second; a software frame paints it once into its own pixels and copies them where the
  frame is damaged.
- Its own cost is printed with `ZINC_PROFILE=1` (`zinc perf hud: ... own 0.14 ms per frame`): 0.14-0.19 ms on the
  CPU renderer at Retina density with hero repainting each frame, 0.01 ms on the GPU renderer.

`ZINC_VISUALIZE=damage` flashes the damaged rectangles of each frame (magenta, fading over 30 frames);
`ZINC_VISUALIZE=cmds` draws a translucent red box per draw command, so areas drawn by many commands glow. Both are
an overlay of the runtime: without the variable, frames and goldens are unchanged.

When a frame emits more than `ZRT_MAX_DRAW_CMDS` commands (8192), `ZRT_TEXT_POOL` text bytes or `ZRT_POINT_POOL`
floats, the extra is dropped and the runtime warns once per pool on stderr.

## Reusable resource diagnostics

`next/tools/resource-probe` is the common sampler/driver. Demo-specific routes are JSON files in
`next/tools/scenarios/`; `museum-probe` is only a convenience entry for `scenarios/museum.json`. The native
resource counters live beside their owners and are available through `Zinc.getResourceStats` on the existing
CDP endpoint. No museum code is needed in the host's collector.

From `next/`, attach to an instrumented app on this Mac:

```sh
tools/resource-probe --scenario tools/scenarios/museum.json --pid APP_PID --cycles 3 --output .logs/probe
```

For another device, forward its loopback inspector port with the existing SSH/`zinc dev --device` transport,
then select remote sampling explicitly:

```sh
tools/resource-probe --scenario tools/scenarios/museum.json --remote --port 9229 --output .logs/device-probe
```

`--remote` collects the device's resource counters and state but writes `rssBytes: null`: it never mistakes a
remote PID for a local process. To obtain process RSS on a POSIX device, run the sampler there with `--pid`.
Only Mac execution has been verified so far; target checks belong to the cross-platform pass.

A scenario provides `stateMethod`, `navigateMethod`, `stateKey`, `parameter`, `initial` and a `route` array.
The app's state result provides its current state under `stateKey`; optional `transitioning` and `fault`
fields allow the driver to wait or stop. Local RSS sampling requires the endpoint's `pid` to match the app PID.
The navigation method accepts the next state's name under `parameter` and must acknowledge/reject it.
The driver first waits for any active transition, returns to `initial` if needed, then repeats `route`.
For `--launch`, also provide `projectDir` (relative to the scenario file) and an `arguments` string array.
The driver closes an app it launches; an attached app stays open.

Each run writes `samples.jsonl`, with elapsed time, state, app PID, RSS and resource counters. Optional
`--screenshots` uses `Page.captureScreenshot` and saves numbered PNGs. Keep captures off for memory comparison:
encoding and transport add substantial temporary allocations. GPU bytes are allocation estimates, borrowed
bytes must not be added to their owners, and absent providers are not zero-byte backends.
See the [museum measurements](reports/zinc-next-museum-memory-probe.md) for the diagnostic limits and a
reference before/after route. The tool has no Python dependencies and uses the shared `tools/cdp-probe` client.

## Remote devices (`--device user@host`)

For `--target rpi1` (or `linux`): the docker cross build, then `rsync` of the binary and the assets directory to
`~/zinc-dev/<name>/` on the device, then `ssh -tt` runs it (with `ZINC_ASSETS`); each save kills the ssh session
(the program gets SIGHUP) and starts again. Requires ssh keys (or a password prompt per save) and rsync on the device.
Not hot reload: the dev library is not used on devices yet.

## Debugger (`zinc debug`)

`zinc debug app.ts` (or a project directory) compiles a debug build and runs it in the interpreter under the debugger, paused at the first
statement of the program (ZN-371.01, decision D84):

```
paused at main.ts:24 in <top level>
run();
(zdb) b main.ts:19
breakpoint 1 at main.ts:19
(zdb) c
paused at main.ts:19 in run (breakpoint 1)
    total = add(total, v);
(zdb) locals
total: number = 0
p: Point = Point { x: 1, y: 2 }
list: number[] = [1, 2, 3]
```

Commands (the expressions ones are below): `b [file:]line` (a breakpoint on the first line with code at or after it; the file is matched by its trailing path, the current one
when omitted), `d n`, `c`, `n` (next statement, over calls), `s` (into calls), `o` (out of the function), `bt` (the stack with lines), `locals
[frame]` (numbers, booleans, strings, arrays, objects one level deep, `this`; a captured variable shows its value), `p name`, `q` (ends the
program, exit 0). Without a terminal the commands are echoed: `zinc debug app.ts < commands.txt` gives a transcript (`next/tests/t1/debug_cli.sh`).
The end of the input lets the program run to its end. The standard library, `zinc:*` modules and plugins run without stops and are left out of
the stack.

A debug build keeps every call a frame of its own (no inlining), marks each statement with a `Line` instruction and keeps each local in a
register of its own; it runs 1.4 to 2.1 times slower than a normal build (nbody, fib), stopped or not. Normal builds are unchanged byte for
byte, and the interpreter runs them in a copy of its loop that never looks at the debugger. Chrome DevTools' Sources panel, conditional
breakpoints and watches (ZN-371.05, below), and AOT programs in lldb (ZN-371.06).

Expressions (ZN-371.05, D87): `p <expression>`, `watch <expression>` (printed at every stop), `b <line> if <condition>`, `log <line> <message
with {expressions}>` (printed, no stop), `catch uncaught|all|none` (pause on exceptions), `closure [frame]` (an arrow function's captures) and
`globals`. An expression reads the frame's locals, captures and the program's globals, members, indexing, `.length`, operators and `?:`; it
is typed by the declarations, so `name * 2` is `Z0107` and `p.z` `Z0106` as in the checker, and it never runs a call or an assignment. VS Code
(conditions, logpoints, the exception filters, watches, the Closure and Globals scopes) and Chrome DevTools (conditions,
`setPauseOnExceptions`, the console and watches on a paused frame, the closure and global scopes) get the same.

A compiled program debugs in lldb (ZN-371.06): `zinc build --debug app.ts -o app` makes the same debug build, compiled to C++ with `-g -O0`:
each statement's C++ carries a `#line` to its `.ts` line, each local is a typed C++ variable under its source name (`double total`,
`zn::rt::Obj* p`; `this` is `self`), and the functions are named after the Zinc ones (`add__t2`), so `lldb app` then `b main.ts:9`, `run`,
`frame variable total` and `bt` read like the source. lldb needs developer mode to launch a process (`sudo DevToolsSecurity -enable` on
macOS). Normal builds are unchanged byte for byte.

`zinc debug --cdp app.ts` (ZN-371.04) opens the debugger to Chrome DevTools: a target of the engine's own on `127.0.0.1:9222` (`--cdp=port`
for another; 9222 is in `chrome://inspect`'s default list, the inspector of `zinc:devtools` keeps 9229). *inspect* under Remote Target opens
DevTools with the Sources panel: the program's files (`Debugger.scriptParsed`, their text), breakpoints by line, the paused program's call
stack and Scope (locals, objects and arrays unfold through `Runtime.getProperties`), watches and hovers on a local's name, resume, step over,
into, out and pause. The program starts paused at its first statement when DevTools attaches (`Runtime.runIfWaitingForDebugger`), as
`node --inspect-brk` does; its output stays on the terminal. `next/tests/cdp_debug_check.mjs` is a scripted client (`next/tests/t1/debug_cdp.sh`).

In a `.tsx` file the lines are the file's own, inside JSX elements as well (ZN-371.03): the JSX lowering starts each copied expression and
each element's code on its source line and keeps where every piece of the lowered text comes from, which compile errors use for their
line and column too. Arrow functions show as `<anonymous>` in the stack (an element's generated code among them).

`zinc debug --dap` speaks the Debug Adapter Protocol on standard input and output (ZN-371.02): VS Code's Zinc Debug extension
(`lib/editor/vscode-zinc-debug`, set up in [the guide](guide/01-getting-started.md#debugging)) starts it, sends `launch` with the program,
then breakpoints, steps, the stack, scopes, variables (objects and arrays unfold), `evaluate` of a local's name and `pause` of a running
program; the program's standard output and error arrive as `output` events. `next/tests/dap_check.py` is a scripted client
(`next/tests/t1/debug_dap.sh`).

## Not available

- esp32 / ps1 / ps2: no process to replace. `zinc build` + flash; a flash-and-monitor loop for esp32 is a possible
  follow-up. The crash policy (`zinc.json` `crash`) does apply to their release builds.
- sim: the Node process restarts; use `node --inspect` for a debugger.
