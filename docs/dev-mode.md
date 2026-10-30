# Dev mode: Fast Refresh, red box, inspector

`zinc dev [entry] [--target <id>] [--device user@host] [--no-devtools]` rebuilds on every save and puts the new
version on screen, shows crashes in the app instead of killing it, and exposes the UI tree to Chrome DevTools.
What is possible depends on the target:

| | macos (on macOS), linux (on Linux) | wasm | sim | rpi1 / linux `--device user@host` | linux, rpi1 without a device (docker/QEMU) | esp32, ps1, ps2 |
|---|---|---|---|---|---|---|
| **reload on save** | Fast Refresh: the save swapped into the running program, state kept (Zinc Next); the prototype loads a new library in the same window | page reload (server-sent event) | process restart | copy + restart over ssh | process restart | not available (`zinc build` + flash) |
| **red box** (dev) | yes, window stays up | yes, in the canvas | no (Node prints the error) | yes (on the device's screen when it has one) | yes (headless: printed) | release policy only |
| **fatal signals caught** | yes (SIGSEGV/BUS/FPE/ILL/ABRT, stack overflow) | no (a wasm trap is a JS exception) | — | yes | yes | no |
| **Zinc stack in the report** | yes | yes | Node stack | yes | yes | release: message only |
| **inspector** (Chrome DevTools) | yes, stays connected across reloads | no | no | yes, port forwarded by ssh | no (port not published from the container) | no (esp32 possible later) |
| **console streaming** | terminal + DevTools console | page console panel | terminal | ssh terminal + DevTools | terminal | serial monitor |
| **console.warn/error banner** | yes | yes | no | yes | yes | no |

Release builds choose a crash policy in `zinc.json`: `"crash": "exit" | "redbox" | "restart"` (default `exit`, the
previous behaviour). `redbox` and `restart` work on every target, the overlay is drawn by the runtime with the
software rasterizer, so it also shows on esp32/ps2 screens.

## Fast Refresh (Zinc Next: macos, linux)

`zinc dev` runs the program on the interpreter and puts each save into the running program, as React Native's Fast Refresh does: the
process, the window and the state of what you did not touch stay. The terminal says what happened in one line:

```
zinc dev: v1 refreshed src/pages/home.tsx (540 ms after the save)
zinc dev: restart: src/state.ts:13 `setColorMode(...)` runs at the top level, and the module has no import.meta.hot.dispose to undo it
```

- **What runs again.** The modules you saved run again (their top-level code, with their new functions). A module that exports only
  code and types (functions and components, classes, interfaces, type aliases), or calls `import.meta.hot.accept()`, is a boundary: it
  runs again alone, since its importers reach what it exports by name and its live objects take the new code of their class. A module
  that exports values (`let`, `var`, a `const` that is not a function) runs again with the modules that import it, which may have
  computed something from them as they started, up to a boundary or the entry. React Native re-runs the importers of every module that
  exports more than components: in the game-2d template an edit of `src/scenes.ts` (classes) keeps the game where it is. A module that runs again starts its own state over; every other module
  keeps its variables, its signals and its objects, which take the new code of their class.
- **Components** (`zinc:ui/solid`). Each component of the project used in JSX (`<Home />`, declared in a file of the project) renders
  under a proxy. When the file that declares it runs again, the proxy disposes that instance before the new code runs and renders it again
  in the same place afterwards: its own local state starts over, its parents and siblings keep theirs (solid-refresh's rule). The
  components of `zinc:ui/nuxt`, `zinc:ui/kit` and plugins are not proxied: they never change during a session. When the entry runs again,
  `render()` replaces the tree it mounted instead of mounting a second one.
- **`import.meta.hot`** (Vite's spelling, typed): `accept(cb?)`, `dispose(cb)`, `on(event, cb)` and `off(event, cb)` with `'beforeUpdate'`
  or `'afterUpdate'` (`cb` gets the paths of the modules the update runs again). It exists only under `zinc dev`: `zinc run`, `build`,
  `export` and `pack` remove every `if (import.meta.hot) { ... }` from the program, so it costs nothing there.

  ```ts
  const timer = setInterval(tick, 1000);
  if (import.meta.hot) import.meta.hot.dispose(() => clearInterval(timer));   // this module can now run again without a restart
  ```
- **When it restarts** (from the entry, as before, with the reason): a module that runs again has a top-level statement with an effect
  (other than `render`, `renderWindow`, `onFrame` and `import.meta.hot` calls) and no `import.meta.hot.dispose`; `zinc.json`, a file that
  is not a module, a plugin or a module of the engine changed; the fonts or images to bake changed; a callback of the old code is still alive
  after the update (a timer or a listener the program kept: undo it in `dispose`); the program has no frame loop; it runs on QuickJS.
- **The desktop-app template.** Its pages (`src/pages/*.tsx`) refresh in place, with the page you are on and the name you typed kept.
  `src/state.ts`, `src/router.ts` and `src/main.tsx` restart: `state.ts` holds the state a refresh keeps (running it again would reset it
  anyway), and `main.tsx` installs the menus, like the `index.js` of a React Native app, which reloads too.
- **A compile error** shows the red box and stops the program; the next good save starts it again (state lost).
- **AOT and QuickJS.** `zinc dev` always interprets, so there is no compiled program to swap; `zinc build` and `zinc run` of a compiled
  program are not affected. A program on QuickJS (a `.js` entry, `zinc.json` `"engine": "quickjs"`) restarts on every save:
  `zinc dev: restart: the program runs on QuickJS, which has no Fast Refresh`. `zinc dev --device` restarts the program on the device.
- **Starting again.** A program that has not changed since `zinc dev` last started it starts from the bytecode compiled then
  (`~/.zinc/cache/zbc`, as `zinc run` does): a `zinc:ui` app with the inspector starts in 0.02 s instead of 0.6 s. Any change to its
  files, `lib/std`, a plugin, `zinc.json`, a `tsconfig.json` or the engine compiles it again; `ZINC_NO_CACHE=1` always compiles.

Measured on the development Mac (Intel, 6 cores), save to the first frame of the new code: 60-126 ms for a two-file `zinc:gfx`
program, about 100 ms for the game template, 300-400 ms for a small Solid program, 540 ms for a page of the desktop-app template
(42 files, `zinc:ui/nuxt` compiled again at each save), against about 570 ms for a restart that loses the state. How it works:
`docs/reports/zinc-next-fast-refresh.md`.

### The prototype's hot reload (`compiler/`)

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

`zinc dev` adds `plugins/devtools` to programs with a frame loop (`zinc:ui`, `zinc:stage`, `onFrame`; not to scripts) (on macos, linux, rpi1); elsewhere
`import 'zinc:devtools'` or `zinc build --devtools` opts in, `--no-devtools` opts out. The program listens on
`127.0.0.1:9229` (`zinc.json` `plugins.devtools.port`, or `ZINC_DEVTOOLS_PORT` to run two programs at once: the variable wins, and `0` takes any free
port; the line `zinc devtools: ...` on stderr names the port in use; under `zinc dev` the program tells zinc dev the port it bound, zinc dev
says `the inspector listens on port N`, and the next versions ask for the same port, another free one when it is taken) and speaks a subset
of the Chrome DevTools protocol:

- discovery: `/json/list`, `/json/version`; in Chrome open `chrome://inspect`, *Configure…* → `localhost:9229`,
  (localhost:9229 is in the default list) then *inspect* under Remote Target (or open
  `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:9229/zinc`);
- **Elements of a `zinc:stage` scene**: a program with a `Stage` and no `zinc:ui` tree shows its display tree, and a stage drawn in a
  `<Canvas>` (`stage.drawIn`) shows under that Canvas next to the interface. Each node is an element named after its class with its
  properties as attributes; a node added or removed by the program goes out as `DOM.childNodeInserted` / `childNodeRemoved`, a change of
  a node's `name` or `visible` as `DOM.attributeModified` (selected or not; the sent nodes are looked at 500 per tenth of a second, in turn),
  `DOM.getAttributes` reads a node's current values, and the highlight, `DOM.getBoxModel` and the pick mode follow `rotation`, `scaleX`,
  `scaleY`, `pivotX` and `pivotY` of the node and its parents. zinc:stage's own nodes do not turn: `rotation` is a property a layer over
  them declares, in radians (fatty's Starling layer) unless the stage says degrees (`stage.rotationUnit = 'degrees'`, an AS3 or OpenFL
  port). A scene in a Canvas gets its highlight in the interface's overlay pass, over the nodes painted after the Canvas;
- **Elements**: `DOM.getDocument`, `requestChildNodes` — the component tree: in a dev run (`zinc dev`, or `ZINC_DEV=1`) each component of
  the program shows as its own element (`<Shell>`, `<Card>`) with the attributes `source` (`src/main.tsx:30`, where it is used) and `props`
  (the props as written there); the compiler records them only in dev runs, so other runs pay nothing and show the host nodes alone. Host
  nodes show as `view`, `text`, `button`…; plain fragments (grouped children, dynamic slots) are not shown, their children are. Text as text
  nodes, attributes `class` and `layout` (`x,y wxh`); editing `class` (`DOM.setAttributeValue`, `setAttributesAsText`) restyles the node
  live, in a dev run only (elsewhere the edit is refused with an error that says so); `DOM.getBoxModel`;
- **Computed styles**: `CSS.getComputedStyleForNode` with the layout values (position, size, padding, margin, gap,
  flex, colors, font size, radius, opacity; padding, margin and border widths also per side, for the box model);
- **Styles** (ZN-369): `CSS.getMatchedStylesForNode` shows what each source of the node's style declares, as read-only rules: its classes
  (`.p-2.bg-rose-600.rounded`), its style sheets (`style={StyleSheet}`) and its style numbers (`style={numbers}`). `element.style` is the
  inspector's own layer, applied over them: type properties there or edit a value in the box model (`CSS.getInlineStylesForNode`,
  `CSS.setStyleTexts`) and the app changes at once. It knows padding and margin (also the shorthands), gap, row-gap, column-gap, width,
  height, min/max sizes, border-radius, border-width, font-size (lengths in px), background-color, color, border-color (`#rgb`,
  `#rrggbb`, `rgb()`) and opacity; other properties stay in the text, marked as not applied. Every edit sends the session's patch to the
  console, one line per edited node in the form its source uses: a node with style sheets or numbers gets the keys to add to its style
  object (`style, add { paddingLeft: 20, backgroundColor: "#10b981" }`), another node its new class string (`className="p-2 rounded
  pl-[20px] bg-[#000000]"`: a class that sets only edited properties is replaced, one that sets more stays and the new class after it
  wins). The edits last until the node goes away; nothing is written to the source. Like class edits, they work in dev runs only;
- **Overlay.highlightNode** draws a blue box over the node in the app (through scroll offsets and transforms);
- **inspect mode** (the arrow at the top left, `Overlay.setInspectMode`): hovering the app highlights the node under
  the pointer, in the app and in Elements (`Overlay.nodeHighlightRequested`); a click selects it in Elements
  (`Overlay.inspectNodeRequested`) and ends the mode. Over a `zinc:stage` scene, alone or in a Canvas, it is the scene's topmost visible
  node under the pointer, through its turned box. Meanwhile a `zinc:ui` app gets no pointer or key input (a scene that reads the pointer
  itself still does). `DOM.getNodeForLocation` finds the node at a point the same way;
- **screencast** (the page view next to the panels, `Page.startScreencast`): the frame on screen, shrunk by a whole
  factor to the size DevTools asks for, as JPEG of the `quality` asked for (80 by default; PNG for `format: "png"`), sent when the screen
  changed and the previous frame was acknowledged. On Zinc Next the host keeps a copy of the frame from the damaged rows of each present
  and shrinks only what changed (`src/host/screencast.cpp`), so a still screen costs nothing and a moving one runs at the frame rate.
  While a screencast runs the program does not draw the highlight into its frame: the inspector draws it over the picture;
- **Page.captureScreenshot** returns the frame on screen as a base64 PNG, rasterized by the runtime at the window's
  physical size (`format`, `clip` and `quality` are ignored);
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
  (`src/host/netlog.h`). `fetch` and `zinc:net` show as requests (`requestWillBeSent`, `responseReceived` with
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
  Bounds: the last 1000 requests, 4 MiB per body. Each client that sends `Network.enable` gets the whole log replayed, so a
  second inspector, or one that attaches late, sees the same requests;
- **Storage** (`DOMStorage.*`): the key/values of `zinc:storage` and async-storage as Chrome's local storage (`getDOMStorageItems`; set,
  remove and clear in dev runs only); changes made by the program are sent as `domStorageItemAdded` / `Updated` / `Removed` (read twice a
  second);
- **Zinc domains**: `Zinc.getInfo` (`dev`, the screen size), `Zinc.getUnrendered` (the nodes that draw nothing: hidden, zero size, off
  screen or clipped away by a scroll view, such as the rows a virtual list keeps), `Zinc.completeClass` (the known utility classes that
  start with a prefix), `Zinc.getHar` (the network log as HAR), and `ZincSqlite.getDatabases` / `ZincSqlite.query` (`databaseId`, `sql`,
  `limit`, `write`): the SQLite databases the program opened with `plugins/sqlite` in a dev run, queried read-only (`PRAGMA query_only`)
  unless `write` is set, which is refused outside dev runs. The sqlite plugin registers its databases in `zinc:devhooks` in dev runs only,
  so neither plugin imports the other;
- every other method gets an empty result so the frontend never waits.

Across a hot reload the sockets are handed to the new version (`ZINC_DEVTOOLS_FDS`), which sends
`executionContextsCleared`/`Created` and `documentUpdated`: DevTools stays connected.
`node scripts/cdp-check.mjs [port]` is a scripted client that checks all of the above against a running program; with `--styles` it
checks the Styles panel on `tests/data/devtools_styles` (`tests/t1/devtools_styles.sh`).

**Zinc Inspector** (ZN-373.01): `zinc run app/inspector/main.tsx -- [port...]` is the same client written in Zinc (zinc:ui, the WebSocket
of zinc:socket): it finds the programs listening on the ports (9229 and 9222 by default: `zinc:devtools` and `zinc debug --cdp`), attaches
to one and shows its Elements tree (read again when it changes), the computed style and box of the selected node (highlighted in the
program), its matched rules and `element.style` to edit, its console, its screen (the screencast) and its requests with their bodies.
Attached to `zinc debug --cdp` (a target of type node), it opens the Sources view: the program's scripts with line numbers, a click on a line
sets or removes a breakpoint (with the condition typed in the toolbar), Run starts the waiting program, Resume, Over, Into, Out and Pause
drive it; the right column shows the call stack, the scopes (objects and arrays unfold) and the watches, evaluated in the selected frame.
The Performance view records the runtime's frames (Tracing.start / end, the same spans as `ZINC_TRACE`): the time of each phase over the
recording, the frames as bars of their phases to scale, and the phases of the frame picked (the slowest at first). The runtime keeps the
last 32768 spans (about 3600 frames). A program with workers gets a track per thread above the frames: the main thread, then each worker (`zinc worker <file>#<id>`) with its `onmessage` spans and its messages. The Threads view lists the workers (`Zinc.getThreads`, refreshed every second): state, the messages queued each way, the messages posted each way, the worker's live heap blocks, its CPU time and the error that ended it.

Its panels (one file each in `app/inspector/`):

- **Elements**: the tree with the components of a dev run (`<Card> src/main.tsx:30`), each foldable; a click on a component selects its
  first host node and shows its props. A search box finds a component, a tag, a class, a text or an id and opens the tree down to each
  match. Toggles: *Rendered only* (on by default: hides what draws nothing, such as `display: none` nodes and the rows a virtual list keeps
  outside its view), *Components only*, *Hide host wrappers*. The tree is a virtual list, so a tree of thousands of nodes stays fast.
- **Live styling** (dev runs only; elsewhere the panel says why and changes nothing): the node's classes as chips (click to switch one off
  and on, x to remove it), a field to add a class with completion of the known classes, `element.style` properties to add, change, switch
  off and delete. The computed style and the box model follow at once. Nothing is written to the source: the console prints the patch.
- **Network**: the requests with status, method, type, size, time and a waterfall; filters by type (fetch, js, img, media, ws, other),
  text and status; *Preserve log*, *Clear*, *Export HAR* (to `~/Downloads`, or `ZINC_INSPECTOR_HAR`). A request shows its headers,
  query and payload, a preview (JSON as a foldable tree, text, an image), the response, the timing phases, *Copy as cURL*, and for a
  WebSocket its messages (`>>` sent, `<<` received).
- **Storage**: the key/values (view, edit, add, delete, clear all, updated live) and the SQLite databases: tables, schema, rows by pages
  of 50, a read-only query, and *Run as write...* behind a confirmation (dev runs only).
- **Console**, with a filter; **Screen**, with the highlighted node drawn over it; **Sources** (above); **Performance** (above).
- **Pick** (Chrome's inspect arrow): hover the Screen view or the program's own window to highlight the node there, click to select it in
  Elements (the tree opens to it); the click does not reach the app. In a dev run, Cmd/Ctrl+Shift+C in the program starts it too, Escape
  ends it.

`tests/t1/inspector.sh` and `tests/t1/inspector_storage.sh` run it against headless programs and a `zinc debug --cdp` session:
`ZINC_INSPECTOR_DUMP=1` prints every view, `=elements` and `=storage` one; `ZINC_INSPECTOR_VIEW=<panel>` attaches to the first program
and opens that panel (with `ZINC_SHOT`, a picture of it).

On a remote device, `zinc dev --device` runs ssh with `-L 9229:127.0.0.1:9229`, so Chrome on the dev machine uses
`localhost:9229` as well.

A device that runs the agent needs no ssh: `zinc device [<device>] inspect <app>` brings the inspector of an app running there to a port
of this machine and prints the address for Chrome, `zinc dev --device <name>` forwards the inspector of its program to `localhost:9229`
for the session (see "Debug and measure on the device" below), and Zinc Inspector lists the apps of the paired devices with the programs of this
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
- `ZINC_PROFILE=json`: the same numbers as one machine-readable line on stderr (`zinc profile json: {...}`, schema 1): per phase and for `work` and
  `interval` (the time between the starts of two frames) the p50 / p99 / max / mean in microseconds (a line must stay under 1000 characters: iOS cuts a log message there), the count of late frames
  (`work_gt_16_7`, `interval_gt_25`...), the surface size and an `info` object where the display driver publishes what it knows: on the GL renderer
  `gl_vendor`, `gl_renderer`, `gl_version`, draw calls and quads per frame, `gl_cpu_submit_us` and, where the driver has the timer query, `gl_gpu_us`
  (`ZINC_GL_STATS=1` turns the counters on). `ZINC_PROFILE_SKIP=n` leaves the first n frames (shader builds, glyph uploads) out of the numbers.
  `tools/zbench` runs a corpus of scenes with it on every machine.
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

`tools/resource-probe` is the common sampler/driver. Demo-specific routes are JSON files in
`tools/scenarios/`; `museum-probe` is only a convenience entry for `scenarios/museum.json`. The native
resource counters live beside their owners and are available through `Zinc.getResourceStats` on the existing
CDP endpoint. No museum code is needed in the host's collector.

From the repository root, attach to an instrumented app on this Mac:

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

Zinc Next takes a paired device instead (`zinc device pair`, no ssh): `zinc dev --device <name>` packs the project on this
machine at each save, sends the device's agent what changed and restarts the program there; its output comes back to this
terminal, a compile error is the red box on the device's screen, and a saved asset of a project that packs its assets is
swapped into the running program. Details and limits: `docs/reports/zinc-next-agent.md`.

`--perf` shows the performance panel over the program on the device, `--live` opens the device's screen in a window here for the
session (`zinc device <name> screen --live`; closing the window stops watching, the session goes on).

The program of a session wears the dev bar, a strip across the top of the device's screen drawn by the engine (a Pi has no window
manager to give it a title bar): its X ends the program and the player comes back, it shows the time, and its menu restarts the program,
shows or hides the performance panel, or saves a screenshot without the bar to `~/.zinc/agent/shots/` (the path is printed here; `zinc
device <name> pull <path>` brings it back). A press on the bar or on the open menu never reaches the program. A deployed app shows it with
`ZINC_DEV_BAR=1` (its Restart works in `zinc dev` sessions only: the program ends with code 75 and the agent starts it again).

Each start says where its time goes: `packed here in …, sent in …, started on <device> in …`, then the device's own steps (the engine,
each plugin: cached, prebuilt, or `built here` with its time), `first frame on the screen, from the start`, and `on the screen of <device>
… after the save`. A start that takes minutes on a small board is nearly always plugins built there (the first run after an engine update).

### Debug and measure on the device

The tools of this machine reach a paired device through its agent, with nothing to install there:

| Tool | Command | What comes back here |
|---|---|---|
| Inspector | `zinc dev --device <name>` (a program with an interface) | Chrome DevTools: the program there gets its inspector (`zinc:devtools` in front, as `zinc dev` does here; `--no-devtools` leaves it out), forwarded to `localhost:9229` of this machine for the session, which `chrome://inspect` lists (another free port when 9229 is taken: the line says which). |
| Inspector of an app | `zinc device <name> inspect <app>` | The same for an app started with `deploy` or `run`. |
| Frame profile | `zinc device <name> profile <app> [--frames 600] [-o trace.json]` | The installed app runs there for that many frames with the frame profiler (`ZINC_PROFILE=1`, `ZINC_TRACE`): its log, the profile's summary (`zinc profile: frames=… work p50=…`, per phase), then its trace, `<app>-trace.json` here; open it in https://ui.perfetto.dev or `chrome://tracing`. `--env K=V` and `-- args` go to the app. |
| Render bench | `zinc device <name> bench [--scene id,id] [--runs 3] [--frames 240] [--out file.json]` | `tools/zbench run agent:<name>`: the render suite (`tests/bench/render_suite`) built for that machine and installed (`deploy --no-run`), launched once per run, its report pulled; the JSON goes to `docs/reports/bench/` or `--out`. Needs a source checkout (the tool is `tools/zbench`). |
| Load | `zinc device <name> top` | The machine's load, memory and temperature, each app's CPU and memory, every second. |
| Telemetry, frame, screen | `zinc device <name> monitor <app>`, `shot <app>`, `screen [--live]` | Its `zinc:telemetry` lines, the frame an app shows, the device's screen. |

To try a change of the engine itself on a Linux device without a release, `zinc device <name> update --local` builds this source tree for
the device's architecture (`tools/build-linux`, minutes the first time, then only what changed), sends the package, and the device's agent
starts again on it: the apps it starts (`zinc dev --device`, `deploy`, `run`) run on that engine too. `zinc device <name> info` says
`"localEngine": true`. `--local <package.tar.gz>` sends a package built elsewhere; `--local --remove` goes back to the installed engine. An
engine that cannot serve is set aside by the next start of the agent's service (kept in `~/.zinc/agent/engine.failed`), so the device is
never left without its agent. The player of a Zinc Pi image keeps the installed engine; only a release updates it (`zinc device <name> update`).

## Phones and tablets: Zinc Go (`--lan`)

`zinc dev --lan` serves the project to Zinc Go (`examples/zinc-go`, exported with `zinc export --target android|ios`) as `expo start` serves
Expo Go: it prints a QR code and a `zinc://<ip>:<port>/<code>` link, compiles the project for each connected phone's profile and sends it, and
each save is swapped into the program running on the phone (Fast Refresh, state kept) or starts it again with the reason. The program's
console lines come back to this terminal. On the phone: scan the code, type the link or open it as a deep link (`adb shell am start -a
android.intent.action.VIEW -d zinc://10.0.2.2:<port>/<code>` on the emulator, `xcrun simctl launch booted dev.zinc.go zinc://127.0.0.1:...` on
the simulator); a shake, three fingers or the Menu key open the dev menu (reload, go home). Details, numbers and limits:
`docs/reports/zinc-next-zinc-go.md`.

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
program, exit 0). Without a terminal the commands are echoed: `zinc debug app.ts < commands.txt` gives a transcript (`tests/t1/debug_cli.sh`).
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
`node --inspect-brk` does; its output stays on the terminal. `tests/cdp_debug_check.mjs` is a scripted client (`tests/t1/debug_cdp.sh`).

Workers (`zinc:worker`) are targets of their own, as Chrome attaches a page's workers: after `Target.setAutoAttach` (flatten) each worker
that starts is announced by `Target.attachedToTarget` with a session id, and waits for that session's `Runtime.runIfWaitingForDebugger`
when `waitForDebuggerOnStart` was asked, so its breakpoints are set first. Each has its own debugger on its own thread: breakpoints,
stepping, its locals, `Runtime.evaluate` in its frame, pause on exceptions; the main program runs or stops on its own meanwhile.
`Target.detachedFromTarget` comes when the worker ends (`tests/cdp_worker_check.mjs`, `tests/t1/debug_worker.sh`). A debug build carries
each worker's line table, locals and field names in its ZBC (a trailing section of the encoded worker).

In a `.tsx` file the lines are the file's own, inside JSX elements as well (ZN-371.03): the JSX lowering starts each copied expression and
each element's code on its source line and keeps where every piece of the lowered text comes from, which compile errors use for their
line and column too. Arrow functions show as `<anonymous>` in the stack (an element's generated code among them).

`zinc debug --dap` speaks the Debug Adapter Protocol on standard input and output (ZN-371.02): VS Code's Zinc Debug extension
(`lib/editor/vscode-zinc-debug`, set up in [the guide](guide/01-getting-started.md#debugging)) starts it, sends `launch` with the program,
then breakpoints, steps, the stack, scopes, variables (objects and arrays unfold), `evaluate` of a local's name and `pause` of a running
program; the program's standard output and error arrive as `output` events. `tests/dap_check.py` is a scripted client
(`tests/t1/debug_dap.sh`).

## Not available

- esp32 / ps1 / ps2: no process to replace. `zinc build` + flash; a flash-and-monitor loop for esp32 is a possible
  follow-up. The crash policy (`zinc.json` `crash`) does apply to their release builds.
- sim: the Node process restarts; use `node --inspect` for a debugger.
