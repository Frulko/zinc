# Threads: a UI thread, compute workers and an animation thread

Date: 2026-10-30. Asked by the owner: "un fil UI, un fil de calcul et même un fil d'animation". Heavy work in an app must
never freeze the interface, and animations must stay smooth while the app's script is busy.
Scope: research and design only. No code was changed. The decision numbers are proposals (`Dxxx`); the coordinator allocates them.

## 0. Summary

- **Today one thread does everything.** The program's script polls events, runs the frame callback, lays out, paints
  (`lib/std/ui.ts` `frame()`, `paint()`), and then `end_frame` diffs and presents on that same thread
  (`src/frontend/modules.cpp` `__gfxStep`, `runtime/gfx.cpp` `end_frame`, `targets/macos/hal_sdl.cpp` `gl_present`).
  Every tween, transition, spinner and scroll curve is stepped by script on every frame. When the script is busy, nothing moves.
- **The render thread of phase 3 (`gpu-renderer-design.md` §6) was never built.** ZN-185 was closed as "moot" and merged
  into ZN-416, which is in Backlog and covers only the software raster in the cross-platform pass. The only threads in
  the frame path are fork/join helpers: the raster bands (`runtime/include/render_bands.h`, `src/host/backend_sw.cpp`) and
  the 4-thread `cull_pack` of the GL replay (`runtime/gl_replay.cpp:2080`). The overlap the render thread was meant to
  bring partly came from frame pacing instead (Phase 1b: wait for the previous flip at the next swap).
- **Recommended order:**
  1. Compute workers first (`zinc:worker`). They solve the actual complaint (Genius, For you, big JSON) in the most
     cases for the least risk, and their message format already exists (the D173 record wire).
  2. Then the render thread with a 3-slot handoff.
  3. Then a compositor on that thread, which ticks declared transform and opacity animations and scroll physics from the
     last committed frame.
  4. Moving script off the OS main thread, so input reaches the compositor while script is busy, is a last option. Do it
     only if the measures ask for it.

## 1. What exists today (with paths)

### 1.1 The frame loop

- `src/frontend/modules.cpp` (`kGfxModule`): one frame is the prelude's `__gfxStep()`. It runs `__host_gfxPoll()`
  (events), the timers, `__host_gfxBegin()`, the program's `onFrame` callback, the other windows, the overlay, then
  `__drainJobs()` and `__host_gfxEnd()`. `__gfxLoop` runs it on a desktop, and an app shell runs one step per tick
  (`__gfxAppStep`, `src/app/shell_sdl.cpp`).
- `runtime/gfx.cpp`: an immediate-mode command list (`raster::Cmd`, 48 bytes) in **two buffers** (`static Buf bufs[2]`,
  `cur`). `end_frame()` (line 1420) does several things in turn:
  - scales the list to physical pixels and places the hardware layers (D114);
  - diffs the list against the previous one (`diff_rects`), or detects a pure scroll move (`diff_move`, D126);
  - builds a `HalFrame` and calls `present()` **synchronously**, then flips `cur ^= 1`.

  `keep()` is a retained frame: no raster and no swap.
- `targets/macos/hal_sdl.cpp` `gl_present` (line 1673): the GL replay (`glr::frame`) and `SDL_GL_SwapWindow` run on the
  same thread as the script. SDL requires the main thread on macOS for the event pump and window calls.
- macOS live resize: AppKit holds the loop inside `SDL_PollEvent`, and frames are drawn from inside the poll through
  `__gfxRedraw` (`src/rt/rtcalls.cpp:771`, `gRedraw`).
- Web (wasm): the interpreter and the program already run inside a Web Worker on an OffscreenCanvas. The page sends ticks
  and input through a SharedArrayBuffer (`targets/wasm/glue/worker.mjs`, ZN-135). The DOM target patches elements
  (`domCommit`).

### 1.2 Animations and scroll: all stepped by script, every frame

- `lib/std/ui.ts`:
  - `stepAnims()` (around line 3890) steps every tween: `animate()`, Tailwind `transition-*` (ZN-274), `LayoutAnimation`.
  - `steppers` (around line 3880) carry `zinc:ui/animated` (ZN-364).
  - A frame is kept (`keep()`) only when nothing animates (around line 6097). So one running tween makes script lay out
    and **paint the whole tree on every frame**.
- The kit's `Spinner` (`lib/std/kit/spinner.tsx`) loops `await animate(ref, 'rotate', 360, { dur: 900 })` from script.
  Its comment says "the engine drives rotation", but the engine is the script's own `stepAnims`.
- Scroll physics: `ScrollAxis` (`lib/std/ui.ts:4994`) with the modes DIRECT, INERTIA, BOUNCE, WHEEL (the spring of
  wheel and `scrollTo({animated})`), FLING, STRETCH (Android, `lib/std/overscroller.ts`) and MOMENTUM.
  `stepAxis()` runs from the script frame.
- Optional scroll tiles (`ZINC_UI_TILES=1`, `paintTiles`, line 4177) keep the content of a scroll container as
  256 px pictures and redraw only the tiles that changed. This is the closest thing to a retained layer today.
- RN Animated accepts `useNativeDriver` and ignores it (`lib/std/animated.ts:5`). Task **ZN-364.01** (Backlog) asks for
  exactly the compositor half of this report: transform and opacity run without the program's code per frame, keep
  moving while the program's thread is blocked, and use property slots (ZN-191 merged into it).

### 1.3 Threads and asynchronous work

- `runtime/zrt_jobs.h`: `zrt::Jobs` runs blocking native work on a worker and settles it as a promise on the loop. In
  deterministic runs it waits for the jobs in flight at each poll.
- `src/host/sys_host.cpp:723-747`: `fs.readTextAsync` and `fs.writeTextAsync` run on libuv's thread pool
  (`uv_queue_work`). The loop is libuv (`src/host/loop.cpp`, a single static `uv_loop_t`).
- Native ABI (`include/zn/native.h`): `cb_post`, `promise_resolve` and `promise_reject` can be called from any thread
  ("A"). Everything else is engine-thread only ("E"). The `ZN_THREADS` flag marks modules that post from other threads.
- Native records (D173, `include/zn/rec.h`, `src/rt/rtcalls.cpp:1146+`): a typed binary wire that all three engines
  encode and decode, with append-only evolution. The iPod's `Track` is already such a record (`plugins/ipod/native/ipod.spec`).
- `targets/capabilities.json` already has `"threads"`: true on macOS, Linux, Windows, Pi, rmpp and Vita; false on ESP32,
  PS1, PS2 and PSP.
- ZN-587 (Backlog, m-22): "Worker on a second QuickJS runtime" for the JS game libraries (PixiJS, Tone.js).

### 1.4 Can two VMs run in one process?

| State | Where | Per thread already? |
|---|---|---|
| Heap objects, globals, stack, string constants (immortal) | `zn::rt::Machine` (`src/rt/rt.h:201`) | Yes, per Machine. Several Machines already run one after another (the device core) |
| Reference counts | `Machine::retain/release`, plain `++o->rc` | Not atomic: **no object may ever be reachable from two threads** |
| Allocator | mimalloc (`src/rt/alloc.cpp`) | Thread-safe, with a heap per thread and frees from other threads allowed |
| Heap budget (`gHeapUsed`) | `src/rt/alloc.cpp:19-21` | No: one plain global, which must become atomic |
| Callbacks, promises, current machine (`gCbs`, `gPromises`, `gMachine`, `gScratch`, `gCbError`) | `src/rt/rtcalls.cpp:870-876` | No |
| Redraw hook, stop, exit flags | `src/rt/rtcalls.cpp:777-799` | Main thread only (stays so) |
| Record schema cache | `recSchema`, `static unordered_map` (`rtcalls.cpp:1147`) | No |
| Native registry: modules, resources, callback references, post queue, last call context (`gLast`) | `src/rt/native.cpp:44-61` | Modules are read-only after registration. The rest is not per thread |
| Event loop | `src/host/loop.cpp:23` (`static uv_loop_t*`), `gEvents` | No |
| Graphics host | `runtime/gfx.cpp` statics | Main thread only (stays so) |
| Bytecode | `const zbc::Module&` passed to `Machine::load` | Read-only, can be shared |
| Superinstruction copies (`fusedCode`) | per Machine | A copy per Machine: shareable later |
| AOT | `Machine::exec` is generic (`f->native(*this, base)`, `src/aot/aot.cpp:485`); `cLimit` per thread | Two compiled programs can live in one binary when their symbols are prefixed |
| QuickJS | `JS_NewRuntime` per engine (`src/qjs/qjs.cpp:622-674`) | A runtime per thread is the standard model |

**Conclusion.** Two Machines can run on two threads once:

- about a dozen globals become `thread_local`, or move into a per-thread context;
- the loop becomes per thread;
- the heap counter becomes atomic.

No object is ever shared. The design rests on that rule.

## 2. How the reference platforms do it (what we take)

| Platform | Compute | Animation off the main script | What Zinc takes |
|---|---|---|---|
| Web (Workers) | `new Worker(url)`, `postMessage` with structured clone, transferable `ArrayBuffer`, separate heaps; SharedArrayBuffer only when cross-origin isolated | Compositor thread: `transform`, `opacity` (and `filter`) animations and threaded scrolling, unless a non-passive wheel or touch listener forces the main thread; layout properties never | The API shape; transfer for byte buffers only; the property allowlist; the reasons that force scrolling back to the main thread |
| Bun / Deno | Web Worker API on a separate isolate per worker | n/a | Same API on a desktop runtime |
| Flutter | Isolates (own heap, `SendPort`); `Isolate.run(fn)` | UI thread builds a layer tree, raster thread draws it; no animation on the raster thread | A layer tree committed per frame; message passing only |
| React Native | JS thread; native modules on background threads | Native driver: declared timing/spring/decay on transform/opacity run on the UI thread; Reanimated worklets run JS on the UI thread | Declared animations (the native driver), not worklets |
| iOS Core Animation | GCD | Declared `CAAnimation`s run in the render server, outside the app | Declarative, tied to layers, the app learns the end through an event |
| Qt Quick | WorkerScript | Render thread with a blocking sync; `Animator` types run on the render thread | Animators = declared transform/opacity on the render thread |

The rule they share: **the script declares and the compositor plays**, for properties that do not change layout. Nobody
runs the app's language on the compositor except Reanimated, and Reanimated pays for it with a second JS runtime and a
compiler plugin.

## 3. Design 1: compute workers (`zinc:worker`)

### 3.1 API (Web Workers, typed)

```ts
// main side
import { Worker } from 'zinc:worker';
import type { GeniusIn, GeniusOut } from './genius.worker';
const w = new Worker<GeniusIn, GeniusOut>(new URL('./genius.worker.ts', import.meta.url));   // also: new Worker<...>('./genius.worker.ts')
w.onmessage = (e) => show(e.data);           // e.data: GeniusOut
w.onerror = (e) => log(e.message);           // an uncaught exception in the worker; the worker ends
w.postMessage({ kind: 'build', tracks, history }, [history.bytes.buffer]);   // second argument: transferred byte buffers
w.terminate();

// genius.worker.ts
import { self } from 'zinc:worker';
export interface GeniusIn { kind: string; tracks: Track[]; history: HistoryBytes; seed: string }
export interface GeniusOut { ids: string[]; ms: number }
self.onmessage = (e: MessageEvent<GeniusIn>) => { /* ... */ self.postMessage({ ids, ms }); };
```

The rules, enforced by the frontend with diagnostics:

- **The entry is static.** The argument is a string literal or `new URL('<literal>', import.meta.url)` (the Vite form,
  so the same code builds for the web). The compiler finds the worker file at build time and compiles it as a **second
  program** (its own `zbc::Module`, its own `functions[0]`) from the same sources, then bundles it. A dynamic argument is
  an error that names the fix.
- **Messages are data.** `In` and `Out` are "sendable": `number`, `i32`, `boolean`, `string`, arrays of sendable values,
  interfaces and type literals made of them, optional fields, `Uint8Array` and `ArrayBuffer`. Classes with methods,
  functions, closures, `Map`, native resources and promises are refused, with the fix in the diagnostic ("declare an
  interface; send ids, not the objects"). The reasons:
  - the three engines then behave the same way (QuickJS loses prototypes in any clone);
  - the existing record wire covers exactly these types.

  `Map` can come later as a list of pairs.
- **The wire is D173's record wire** (`include/zn/rec.h`). The frontend writes the schema text of `In` and `Out` as it
  already does for spec interfaces. The sender encodes with the engine's existing encoder (`rtcalls.cpp` `encode`) and
  the receiver decodes with the existing decoder. It has no keys, is append-only, and is one buffer per message. The
  same bytes cross a thread, a Web Worker boundary (wasm) or nothing at all (inline mode, §3.5). Spec records such as
  `ipod.Track` already have their schema.
- **Transfer.** A `Uint8Array` or `ArrayBuffer` named in the transfer list is not copied. Its storage (mimalloc memory,
  which can be freed from another thread) moves to a new array object in the receiver's heap, and the sender's array
  becomes length 0 (detached, as on the web). Nothing else is transferred.
- **No shared memory in v1**: no SharedArrayBuffer and no Atomics. It is easy to add later for byte buffers alone, and
  it is never needed for the first users.
- `terminate()` is cooperative in v1. The worker stops at the next turn of its loop and its pending messages are
  dropped. A worker inside a long synchronous loop runs until that loop ends, and its result is discarded.
  - QuickJS has `JS_SetInterruptHandler` and can stop at once.
  - For the interpreter, a back-edge check of an atomic flag costs about one load per loop iteration. Add it only if a
    measure shows it is free (later line).

### 3.2 Runtime: one Machine (or QuickJS runtime) per worker

- **Thread.** One OS thread per `Worker`, created with `pthread_create` and an explicit stack (8 MB on the desktop and
  1 MB on the Pi; the AOT `cLimit` is taken from that thread). Each thread has its own `Machine`, its own register
  stack, a smaller default in `stackSlots`/`maxDepth` than the main program's 20 MB (lazily touched anyway), and its
  own libuv loop (`zn::loop` per thread).
- **Shared, read-only.**
  - The worker program's `zbc::Module`, loaded once per worker file. N instances share it.
  - The AOT machine code.
  - The registered native modules table.
- **Not shared.** Everything else: heap, globals, string constants, `fusedCode` (shareable later), callback and promise
  tables, resource handles.
- **Delivery to the main side.**
  - The worker thread pushes the bytes into the main side's queue, the existing any-thread path
    (`native.cpp` `gQueue`, as `cb_post` does), and wakes the loop. Use `uv_async_send` rather than the 5 ms polling
    noted in `later.md` for webrtc.
  - The main side decodes the bytes at the next loop turn and calls `onmessage`.
  - The other direction works the same way into the worker's loop.
- **Deterministic runs** (`ZINC_DETERMINISTIC`, record/replay): the main loop waits at each poll until every worker is
  idle, as `zrt::Jobs` does. A message posted in one turn is then answered in the next on every machine.
- **Output.** A worker's `console.log` writes through its own `Machine::out`. The flush takes a process-wide mutex, and
  in dev builds the line gets a `[worker genius]` prefix.
- **Errors.** An uncaught exception or a trap ends the worker and becomes `onerror` on the main side (message and
  stack). Running out of heap ends the process, as today (the budget counts every thread). A worker cannot crash the
  main loop except through a native bug in a plugin.
- **Fast Refresh (`zinc dev`).** A change to a worker file terminates its workers and starts them again. The program
  sees an `onerror` with the kind `restart`, or simply new answers. `zinc debug` (DAP) attaches to the main Machine only
  in v1.

### 3.3 What a worker may import

A worker is a program with no window. The frontend checks the worker's import closure:

- **Allowed (engine).** The language and its built-ins (JSON, Math, Map, strings, typed arrays), `zinc:fs` (sync and
  async), `zinc:path`, `zinc:net` fetch, timers, `zinc:sys` clock, env and args, `zinc:crypto`, and `zinc:worker`
  itself (nested workers are refused in v1).
- **Refused with a diagnostic.** `zinc:gfx`, `zinc:ui` and the kits, `zinc:audio`, windows, dialogs, tray, notifications,
  and every plugin that does not opt in. The diagnostic says "do the drawing on the main side; post the result".
- **Plugins** opt in with `"worker": true` in `plugin.json`. This is the author's promise that every export may run on
  several threads at once, each with its own resources. The registry's resource and callback tables become per thread,
  so a handle made in a worker is valid only there and cannot be posted (records only).
  - `zinc:sqlite` can opt in: SQLite is serialized-thread-safe, one connection per thread.
  - `zinc:ipod` (device I/O) stays main-only. The Genius build needs only its `Track` records.

### 3.4 AOT and QuickJS

- **AOT.**
  - Each worker program is emitted as a separate C++ program in its own namespace (`zn_w_<hash>::`, its own `kModule`,
    `kNatives` and symbols with a prefix) and linked into the same binary.
  - It exports `zn_worker_<hash>(module*, size*, natives**, count*)`, the shape of `zn_console_aot`
    (`src/aot/aot.cpp:494`).
  - `Machine::exec` is already generic over `f->native`, so one definition serves every program in the binary.
  - Cache: the units of the worker program cache like the main program's (ZN-604).
- **QuickJS.**
  - One `JSRuntime` and `JSContext` per worker thread, with the worker module stripped and loaded as the main one is
    (`src/qjs/qjs.cpp`).
  - The host calls of the allowed modules must be callable from that thread: the generated host-call table reads the
    per-thread context.
  - Messages use **the same record wire**: QuickJS already decodes records in one call (D173), so the three engines
    produce identical message contents.
  - This also delivers ZN-587. The web environment's untyped `Worker`, for PixiJS, Tone.js and three's DRACO, is a thin
    layer over the same thread and loop with `JS_WriteObject2`/`JS_ReadObject` as its structured clone. That path is
    for untyped JS libraries only.

### 3.5 Profiles without threads

- On `threads: false` profiles (ESP32, PS1, PS2, PSP), and wherever the platform refuses a thread, the worker runs
  **inline**:
  - the worker file is compiled as a module of the main program, so no second Machine and no second stack (which
    matters at 96 KB);
  - `self.postMessage` and `w.postMessage` still encode and decode, so a mutation after sending behaves as on a
    desktop;
  - delivery is a macrotask of the single loop.

  Inline mode allows one instance per worker file, because the module's globals exist once. A second `new Worker` of
  the same file throws an error that says so. The code is unchanged; only the "never blocks the UI" property is lost.
- wasm (browser): a zinc worker is a second Web Worker running a second wasm instance of the interpreter, and the
  record bytes travel by `postMessage`. Transfer is an `ArrayBuffer` transfer. WASI threads are not needed.

### 3.6 The first users (iPod app)

- **Genius** (`examples/ipod/src/services/genius.ts` `buildModel`, called from `examples/ipod/src/drafts.ts:101`
  `currentModel()`, synchronously on the UI thread):
  - The worker owns the `Model`.
  - The main side posts the `Track[]` (already records), the weights and the history once, then asks questions as
    messages (`genius(seed, n)`, `mixes()`, `pathBetween`) and gets ids back. The model, made of Maps of Maps, never
    crosses.
  - `attachDeep` becomes a message.
  - `currentModel()` becomes asynchronous. Its callers already show drafts that arrive later.
- **For you** (`services/forYou.ts` `signals`, `dailyMixes`...) lives in the same worker, because it reads the same model.
- **Big JSON caches** (`audiomuse.ts:175` `JSON.parse(fs.readText(f))`, history): read and parse inside the worker. Post
  only what the screen needs (records), or keep the data in the worker and query it.
  - Re-encoding a whole parsed cache to post it back would move the cost to the main side's decode. It still avoids
    the parse, but measure before relying on it.

## 4. Design 2: the render thread and the compositor ("animation thread")

### 4.1 Threads after this design

| Thread | Runs | Since |
|---|---|---|
| Main (OS) thread = script thread | The event pump (SDL needs it on macOS), the program's frame: input, layout, paint into a command list, **commit** | today |
| Render / compositor thread | Takes the newest committed frame and ticks the declared animations at vsync time. It recomposes, replays (GL) or rasterizes (software bands), presents, and publishes the animated values back | step 5-6 |
| Worker threads | Compute (§3) | step 2 |
| Helpers | Raster bands, libuv pool, plugin jobs | today |

The script stays on the OS main thread (proposal **Dxxx-E**):

- every HAL call that touches a window, a menu, the clipboard or a dialog keeps working as is;
- the live-resize redraw path stays as it is.

The cost: **input is not pumped while script is busy**. A fling or wheel spring already running keeps going, and a
spinner keeps turning, but a new wheel or touch gesture waits for the script. §5 step 8 removes that limit if it matters.

### 4.2 The render thread: the 3-slot handoff (phase 3, ZN-416 and ZN-185)

- `runtime/gfx.cpp`: `bufs[2]` becomes `bufs[3]`. At any moment one slot is being written by script, one is `ready`
  (the newest commit, not yet taken) and one is `shown` (read by the render thread). The slots must keep their own
  `text` and `pts` pools; they already do.
- `end_frame` (script side) does what it does today up to the damage (scale, layers, `diff_rects`/`diff_move` against the
  last committed slot, which is immutable after commit). Then it **commits**:
  - under a short lock, it publishes the slot, its damage and the animation table (§4.3);
  - if the render thread had not taken the previous `ready`, that frame is dropped and its damage is **merged** into
    the new one;
  - it then picks the free slot for the next frame.

  Glyphs and pictures are prepared before the commit, as the rule says: "rasterization on the logic thread, never in
  draw" (`ui-rendering-architecture.md` §5.1.8). Dynamic pictures (video frames) are referenced by each slot until the
  slot is reused.
- The render thread owns the GL context (macOS: `SDL_GL_MakeCurrent` on that thread; Android: EGL; KMS: the page flip),
  the overlays (dev bar, HUD, banner, from snapshots taken at commit) and `present()`. On the software path it runs the
  bands.
- **Synchronous mode** stays the default wherever pixels must be exact:
  - `ZINC_DETERMINISTIC`, `ZINC_SHOT`, `ZINC_FRAMES` captures, record/replay, and the tests (`ZINC_RENDER_THREAD=0`
    forced by the test runner unless a test asks);
  - profiles without threads (ESP32, consoles) and the web, where the wasm worker already sits beside the page;
  - an opt-out in `zinc.json`.

  The same code runs inline at the end of `end_frame` (proposal **Dxxx-I**).
- **Latency.** At most one frame more between input and pixels, as ZN-416 says, and documented. `keep()` costs nothing
  on either side.
- **Measure.** The profiler's frame interval (`ZINC_PROFILE=json`, `prof::begin` in `begin_frame`) measures the script.
  A **present interval** taken on the render thread must be added: that is the number the user sees. `tools/zbench`
  reads both.

### 4.3 The compositor: declared animations on layers

**Layers.**

- New command kinds in `raster::Cmd`: `LAYER` (id, bounds, the base transform and alpha) and `LAYER_END`. They wrap the
  commands of one subtree.
- `zinc:ui` paints a node inside a layer when:
  - it has a compositor animation; or
  - it is a compositor scroller (§4.4); or
  - it asks for one (`will-change-transform`, the Tailwind class, later).
- At replay, the compositor multiplies the layer's commands by the layer's **current** matrix and alpha. This is the
  same arithmetic as today's XFORM and alpha, applied per layer:
  - on GL, by a per-layer uniform or matrix;
  - on the software raster, by re-rasterizing the damaged rectangles.
- A layer's content can be cached as a texture later, if a measure asks for it. The scroll tiles (`paintTiles`) already
  are such a cache for scrollers.

**Animations.** These are the "property slots" of ZN-364.01 and ZN-191. A record, committed with the frame:

`{ layer, prop, curve, from, to, t0, duration, delay, iterations, direction, easing }`

- `prop` is one of: `translateX`, `translateY`, `scale`, `rotate`, `opacity`.
- `curve` is timing (the easings of `ui.ts` `ease()`: linear, in, out, inOut, the CSS cubic-béziers, the spring curve),
  spring (stiffness, damping, mass, initial velocity: RN's spring), or decay (velocity, deceleration).
- `iterations` can be infinite, for the spinner.
- The easing functions move from `ui.ts` into `include/zn/` (`ease.h`), the only place an operation is defined
  (ARCHITECTURE.md). `ui.ts` calls them through the host, so script-driven and compositor-driven values are bit-equal.

**What runs on the compositor (proposal Dxxx-F).**

- Transform (translate, scale, rotate) and opacity of a layer, and a scroller's offset (§4.4).
- **Not**:
  - colours: `transition-colors` stays on script;
  - anything that changes layout (width, height, padding, margin, `top`/`left` in the flow, flex, text): it needs
    `layout()`, which is script. This matches the browsers' rule and RN's native-driver error.
- RN `useNativeDriver: true` on a layout prop throws React Native's own error text (ZN-364.01 #2).
- A shimmer (skeleton) is a gradient child translated inside a clip: a `translateX` animation, so it is supported.
- A spinner is `rotate` with `iterations: Infinity`.
- A progress bar's indeterminate stripe is `translateX`.

**How script hands animations over.** `ui.ts` `animate()`, the transitions of the groups `TR_TRANSFORM`/`TR_OPACITY`,
and Animated with the native driver all do the same thing when the node is compositable:

1. They write the animation into the node's layer record instead of the `anims` list.
2. They mark the frame painted once.
3. They `keep()` afterwards.

So a spinner costs the script **nothing per frame**. This matters also on single-threaded and slow devices: today one
spinner forces the whole tree to be repainted at every frame. The compositor's tick there is the inline one.

**Changes and the end.**

- A new `animate()` on the same layer property replaces the running one. It starts from the value the compositor
  shows now, read from the published values below, as CSS and Core Animation do.
- The compositor posts an end event (layer, prop, finished or replaced). At its next frame, script writes the final
  value into the node (`setNumber`, as `stepAnims` does at `t >= 1`) and runs `done` (the promise of `animate()`, the
  Animated callback).

**Values back to script.**

- After each present, the render thread publishes the current value of every animated layer property into a small
  seqlock table.
- At the start of each script frame, `ui.ts` copies them into the nodes' fields (`tx`, `ty`, the transform, the opacity).
  So **hit testing, `boxOf` and the inspector see what is on screen**, with at most one frame of lag, as Chrome's main
  thread sees compositor scroll offsets.

**Damage.**

- The compositor computes damage as the union of each animated layer's bounds before and after the tick, plus the
  commit's damage.
- An animated layer under a damaged area is replayed with its current values.
- The proof that this is right is the on/off golden: the inline compositor in a deterministic run must give the same
  pixels as script-driven tweens.

**Not done (proposal Dxxx-G).**

- No worklets: no Zinc code and no second VM on the compositor thread.
- What Reanimated worklets are mostly used for (collapsing headers, parallax, the scale of a pull-to-refresh) is covered
  later by **scroll-driven declared animations**: `prop = interpolate(scroller.offset, inputRange, outputRange, clamp)`,
  the CSS `scroll-timeline` model (step 9).

### 4.4 Scrolling on the compositor

- **One definition of the physics (proposal Dxxx-H).**
  - `stepAxis`, `springStep`, rubber band, `releaseVelocity` and the Android OverScroller spline (`lib/std/ui.ts`
    around 5040-5110, `lib/std/overscroller.ts`) move to `include/zn/scroll.h`: pure functions over a POD axis state.
  - `ui.ts` calls them through the host (one call per active axis per frame), and the compositor calls the same code.
  - Today the rule "an operation is defined once in `include/zn`" is broken the other way: the physics exists only in
    script, so the compositor could not run it without a copy.
- **Handoff.**
  - DIRECT (a finger or trackpad moving) stays with script, because the events arrive on the script thread.
  - The time-driven modes are handed to the compositor at commit, with the axis state (`mode`, `pos`, `v`, `target`,
    `t0`, `p0`, the fling parameters): INERTIA, FLING, BOUNCE, WHEEL (including `scrollTo({animated})` and the target
    of a snap, which script computes at release because it knows the snap points), MOMENTUM and STRETCH.
  - The compositor steps the axis at vsync and translates the scroller's content layer by `-pos` inside its clip.
  - The values come back through the published table, so `n.sy`, hit testing, `syncVirtual` and sticky positions read
    them.
- **Content.**
  - The scroller's layer holds its content for the viewport plus an overscan. The start values could be one viewport
    above and below on the desktop and half a viewport on small heaps; pick them by measure.
  - On GL this is the tile set of `paintTiles` (pictures already). On the software path, `diff_move` (D126) already
    moves the pixels and draws only what appears.
  - When the compositor scrolls past the recorded content while script is busy, the uncovered band shows the scroller's
    background (the browsers' checkerboard). When script is free, its next frame records the new rows (virtual lists).
- **What keeps a scroller on script.** These are the main-thread scrolling reasons, as in Chrome. The compositor still
  runs other animations.
  - a sticky child (the tiles already refuse it: `tileOff`);
  - content that is not over one opaque colour (the tiles' precondition), until layers carry their own background;
  - a scale transform on an ancestor;
  - an `onScroll` handler marked synchronous. RN's `onScroll` is asynchronous by nature (`scrollEventThrottle`) and is
    delivered from the published values.
- **Hit testing during a compositor scroll** uses the published offset. A tap that stops a fling is handled by script
  when it runs. It sends "stop" with the new commit, and the compositor applies it at once.

### 4.5 What needs what

| Feature | Needs the render thread? | Gain without it (inline tick) |
|---|---|---|
| Declared animations (spinner, transitions, Animated native driver) | For "keeps moving while script is busy": yes | Script does no per-frame work for them: CPU and energy on the Pi, Nexus 7, TouchPad |
| Compositor scroll | For "keeps moving while script is busy": yes | Scroll physics without a full repaint |
| Workers | No | Everything: they are independent |
| Input while script is busy | Needs script off the main thread (step 8) | n/a |

## 5. Order of work

Each step has its proof (a test and a measure), its size and its risks. The backlog is frozen, so the coordinator turns
these steps into tasks only with the owner's request (`New-task: owner`). Steps 6 and 7 complete the existing ZN-364.01,
and step 5 completes ZN-416 and ZN-185.

| # | Step | Proof (test / measure) | Effort | Risks |
|---|---|---|---|---|
| 0 | **Baseline and harness.** A test program with a kit `Spinner` and a button that busy-waits 2 s. A synthetic 10,000-song library and history for the Genius build. A present-interval phase in the profiler. | `tests/t1/busy_spinner.sh` records today's gap: about 2000 ms with no present. Today's Genius build time and frame p99 during a model rebuild go into `zinc-next-perf.md` | S | none |
| 1 | **Per-thread runtime state.** `thread_local` (or a per-thread context) for the rtcalls and native globals of §1.4, a libuv loop per thread, an atomic heap counter, a locked or per-thread record schema cache, a stdout flush lock | New T0 test: two Machines run the same module on two threads at once, outputs identical to two sequential runs, clean under TSan. The existing tier T0 unchanged | M | A missed global races only under load: the TSan run is the gate. The `thread_local` cost on the hot paths (`gMachine` is read per callback): measure with `tools/bench-gate` |
| 2 | **`zinc:worker` on the interpreter.** Static entry discovery and the second program, the sendable-type check and its diagnostics (with a `zinc explain` entry), messages on the record wire, transfer of byte buffers, `onerror`, `terminate`, the deterministic wait, the inline mode for `threads: false`, the module allowlist and the `"worker"` plugin flag | T0 `worker_basic`: ping-pong, a transferred buffer is detached on the sender, an exception becomes `onerror`, terminate, identical output under `ZINC_DETERMINISTIC`. T0 `worker_inline` on `--profile esp32`. Refusal goldens for a class with methods, `zinc:ui` in a worker, a dynamic entry | M | The frontend's two-program build (cache, `zinc dev`, `zinc pack`). Memory per worker on the Pi (stack, `fusedCode` copy): measure RSS per idle worker, target under 2 MB |
| 3 | **AOT and QuickJS workers.** Worker programs emitted in their own namespace and linked. A QuickJS runtime per thread. The untyped web-environment `Worker` for JS libraries (ZN-587) | The same `worker_basic` on `--engine quickjs` and AOT: one row in `tools/diff-matrix`. ZN-587's criteria (PixiJS `preferWorkers`, Tone.js Ticker, a crash reported) | M | Symbol clashes between the two compiled programs. Host calls of QuickJS that assume the main thread |
| 4 | **First users.** Move the iPod Genius model, For you and the cache parsing into a worker; `currentModel()` becomes asynchronous | Building the 10,000-song Genius model in the worker leaves the main window's frame interval **p99 under 16.7 ms** on the Mac during the build (`ZINC_PROFILE=json`, measured alone after integration). The answers equal the main-thread build's (same ids for 20 seeds) | S-M | App code that read the model synchronously. Check every caller of `currentModel()` |
| 5 | **Render thread, 3-slot handoff** (phase 3; extends ZN-416 to the GL window on macOS and Android) | Goldens and `proto-capture` identical with `ZINC_RENDER_THREAD=0/1`. Deterministic and capture runs synchronous. ZN-416 #1: at bouncing-ball 200k, the frame time is max(script + diff, replay) within 10%. Live resize on macOS draws no stale size. Input latency documented | L | GL on a second thread on macOS (NSOpenGLContext update and resize happen on the main thread: a resize handshake is needed). The VC4 hang hazard (Phase 1b notes: every Pi GPU run under `timeout -s KILL`). Damage merging of dropped frames (stale pixels: the on/off golden catches them) |
| 6 | **Compositor layers and declared animations** (ZN-364.01): `LAYER`/`LAYER_END`, the animation table in the commit, the tick on the render thread (inline otherwise), the easings moved to `include/zn/ease.h`, the values published back, end events, the `ui.ts` handoff for `animate()`, transform/opacity transitions, Animated native driver, Spinner | T1 `busy_spinner`: **present interval p99 ≤ 17.5 ms at 60 Hz while the script busy-waits 2 s** (today: one 2000 ms gap). Goldens identical with the compositor on and off (`tests/t1/animated.sh` with the native driver, ZN-364.01 #3). A spinner alone records zero commands per frame in script (`commandCount` after the first frame). Hit test on a node during a translate animation lands on the shown position | L | A wrong damage area (pixels left behind). Hit-test lag of one frame. The software path's cost of re-rasterizing a big layer on a Pi (measure, then a texture cache) |
| 7 | **Compositor scroll**: the physics in `include/zn/scroll.h` used by `ui.ts` and the compositor; scroller layers with overscan; handoff of the time-driven modes; published offsets; asynchronous `onScroll`; the main-thread reasons | A fling released, then the script busy for 1 s: the content keeps moving with present p99 ≤ 17.5 ms and the fling ends where the script-driven one ends (offsets equal within 0.5 px at each 100 ms). `tests/t0/scroll_move.sh` and the scroll goldens identical on/off. Long-list scrolling records zero primitives per frame (ZN-364.01 #5) | L | Two owners of one axis (script DIRECT versus compositor FLING) at the hand-over: one rule, the latest commit wins and the compositor's value is the start. Virtual lists checkerboarding on slow devices |
| 8 | *(option, decided by the measures of 5-7)* **Script off the OS main thread**: the main thread pumps events and runs the compositor and present; wheel and touch on a compositor scroller without non-passive handlers move it at once; HAL calls that need the main thread go through `SDL_RunOnMainThread(..., wait=true)` (SDL3) | A wheel scroll answers while the script busy-waits 2 s. No beachball on macOS during a 5 s busy script. Every window, menu, dialog, clipboard and tray test passes | L | High: every HAL entry must be classified. Live resize and `__gfxRedraw`. iOS and Android lifecycles in the app shell (`src/app/shell_sdl.cpp`). Only worth it if users meet long synchronous script after steps 2-4 |
| 9 | *(later)* Scroll-driven declared animations (collapsing header, parallax); declared animations on the DOM target mapped to the Web Animations API (`element.animate`, the browser's own compositor) | A collapsing header follows a compositor fling while the script is busy. On the DOM target the same program animates with the main thread blocked | M | API design: mirror CSS `animation-timeline: scroll()` and RN's `Animated.event` with the native driver |

Steps 1-4 and 5-7 are independent chains (runtime and frontend against gfx and `ui.ts`). They can run in parallel
worktrees, except that steps 6 and 7 touch the shared core (`ui.ts`, gfx, raster): they never run beside another
shared-core task. Steps 5, 6 and 7 each change the shared core, so T1 and the demos run in the background at the end of
each.

## 6. Decisions to record (proposals)

- **Dxxx-A Workers are isolated programs.**
  - What: one Machine (or QuickJS runtime) per worker, its own heap and loop. Messages are typed data on the D173 record
    wire. Only byte buffers are transferred. No shared heap and no SharedArrayBuffer in v1.
  - Why: reference counts are not atomic, so sharing an object would be a crash. One wire serves threads, wasm and
    inline mode, and is identical across the three engines.
  - Refused: structured clone of arbitrary objects, because classes would behave differently per engine; shared
    immutable objects, because the counts and lazy fields are written.
- **Dxxx-B The worker entry is static.**
  - What: a string literal or the Vite form `new URL('…', import.meta.url)`. The compiler builds it as a second program.
  - Why: AOT and packing need the worker known at build time, and the web build keeps the same source.
- **Dxxx-C What a worker may import.**
  - What: the engine's allowlist (§3.3). Plugins opt in with `"worker": true` in `plugin.json`. Resources are per
    thread and never posted.
- **Dxxx-D Without threads, workers run inline.**
  - What: on `threads: false` profiles a worker is a module of the main program with the same encode and decode, and
    one instance per worker file.
- **Dxxx-E The script stays on the OS main thread.**
  - What: the render thread owns GL and present.
  - Why: every HAL call stays as it is.
  - Moving the script off the main thread is the measured option of step 8.
- **Dxxx-F Compositor properties.**
  - What: transform (translate, scale, rotate), opacity and the scroll offset. Never layout properties; colours on
    script in v1.
  - RN's native-driver error is used for layout props.
- **Dxxx-G No worklets.**
  - What: declared animations only (timing, spring, decay, iterations), and later scroll-driven interpolations. No
    script runs on the compositor thread.
- **Dxxx-H Scroll physics and easings are defined once.**
  - What: `include/zn/scroll.h` and `include/zn/ease.h`, called by `lib/std/ui.ts` through the host and by the compositor.
- **Dxxx-I Deterministic runs and captures stay synchronous.**
  - What: the render thread and the compositor tick run inline. Goldens must be identical with the threads on and off.

## 7. Risks and open questions

- **macOS.**
  - GL on a non-main thread is supported, but NSOpenGLContext's `update` after a resize must happen on the main
    thread. Plan a resize handshake: script commits a frame at the new size, and the render thread waits for it before
    presenting.
  - A main thread blocked for more than about 2 s shows the beachball even when the render thread presents. Steps 2-4
    (workers) are the answer for long work; step 8 is the answer for the rest.
- **Memory on small devices.**
  - Each worker costs a thread stack, a Machine stack (lazily touched), a copy of the superinstruction code and its
    heap.
  - Measure RSS per worker on the Pi in the cross-platform pass (a line for `backlog/later.md`).
  - `fusedCode` can be shared per Module behind a once-flag if it matters.
- **Plugins.** A plugin that sets `"worker": true` wrongly is a data race that no test of ours sees. Keep the flag off
  by default and review each one.
- **Debugging.** `zinc debug` and `zinc profile` see the main Machine only in v1. DevTools should list the workers
  (a later line).
- **Damage correctness** is the main risk of steps 5-7. The on/off golden rule (Dxxx-I) is the guard. Run it on the
  scroll, animated and kit goldens at each step.
- **Not proven here**: every number above is a target, not a measure.
  - Step 0 records the baselines.
  - Every measure runs after integration, alone on the machine (AGENTS.md "Several tasks at once").

## 8. Lines for `backlog/later.md` (from this report)

- threads: interpreter back-edge interrupt check so `Worker.terminate()` stops a busy worker at once. Measure its cost
  with bench-gate first.
- threads: share `fusedCode` and the string constants of one `zbc::Module` across the Machines of its workers, if the
  RSS per worker on the Pi asks for it.
- threads: RSS per idle worker and the Genius build time in a worker on the Pi 3B+ and the Nexus 7 (cross-platform pass).
- threads: SharedArrayBuffer and Atomics for byte buffers between workers (audio and image pipelines), only when a user
  needs it.
- threads: `Map` as a sendable type (sent as a list of pairs).
