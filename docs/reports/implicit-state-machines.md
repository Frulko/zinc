# Implicit state machines in Zinc (2026-11-06)

Read-only audit of the system: engine (`src/`, `runtime/`, `targets/`), `lib/std`, `plugins/` (own code, vendored code skipped). `app/` and `examples/` are user code and out of scope.

An implicit state machine is a lifecycle or mode encoded without one state enum and one transition function: several flags that together mean a phase, nullable handles or sentinels (-1, 0, "") that mean a state, mode fields written from many places, hand-restored context flags. "Half-explicit" = an enum exists but its writes are scattered and unguarded.

Every finding comes from reading the code; none was reproduced. Line numbers are those of develop at c2a4c1d7d (with the working tree's uncommitted changes). Risk: H/M/L.

## Highest-risk machines

All rated H; `#` is an id the sections below refer to, not a strict order. The worst for a user: #16 (one throw freezes every reactive app), #1 and #2 (a crash-restart leaves the runtime half dead), #18 and #19 (a stale handle drives someone else's view or VM).

| # | Machine | Where | Why it ranks |
|---|---|---|---|
| 1 | `PollerJobs` worker | `runtime/zrt_jobs.h:93-122` | `quit_` never reset: after the first crash-restart every job-backed API never settles; deterministic `poll()` blocks forever |
| 2 | Frame state vs crash longjmp | `runtime/zrt.cpp:929-1131`, `hal_sdl.cpp:412`, `zrt_dyn.h:609` | `in_frame`, `in_watch`, `GenFrame::running` not unwound by `crash()`; `zrt_redraw` dead after restart |
| 3 | `zinc:script` Vm | `src/qjs/script_native.cpp:44-62, 296, 360-370, 553, 780` | `qShutdown` frees a Vm under live `Entry` frames (use after free); 5 flags encode the lifecycle |
| 4 | rt Worker `W` | `src/rt/worker.cpp:34-55, 468-684` | 6 bools + 2 atomics; `stop` stored after `terminated` unlock; `closedSelf`, `joined` unlocked; keepalive balanced by convention |
| 5 | App update trial | `src/main.cpp:1581-1640, 2872, 2904` | three unlocked promotion paths (5 s thread, `update.healthy`, `atexit`); a non-zero normal exit promotes; a second launch rolls back a healthy update |
| 6 | OTA trial files | `src/agent/ota.cpp:56-67, 216-243` | `trial` removed before the restoring rename; judged only on the agent `run` path |
| 7 | Player mode matrix + run slot | `src/app/player.cpp:98-129, 323-419`, `src/agent/player.cpp:214-225, 436-471` | `gRemote`/`gAgentRunning` exclusive by convention; single-slot `gAgentNext` loses a run and hangs its follower |
| 8 | WebGL context loss | `src/gl/webgl_js.cpp:32, 1335-1396` | 8 flags + epoch; failed `restoreNow` leaves a destroyed context referenced and permanently lost |
| 9 | HTTP `Fetch` | `src/host/http.cpp:63-98, 125-430` | ~20 flags + manual refcount; `restart` consumed only by a close callback that may never fire |
| 10 | CDP sessions | `src/dbg/cdp.cpp:30-283`, `dbg/ws.cpp:107, 127` | a reconnect keeps `started`/`enabled`/auto-attach; a worker end erases a session a paused thread waits on |
| 11 | discord-voice | `plugins/discord-voice/index.ts:120-596`, `native/voice.host.cpp:265-1050` | `ready()` unguarded (second Ready leaks a socket + 2 threads); reconnect timers survive `end()`; devices opened before the `started` check |
| 12 | Display lease | `src/agent/screen.cpp:60-105` | `kill(-pid, SIGKILL)` on pids from stale files; process-local mutex; ready = pid string compare |
| 13 | wasm Instance | `src/wasm/wasm_js.cpp:44-68, 204, 238, 402-452` | global `gInstantiating`; module-wide link state shared across instances; finalizer order decides lifetime |
| 14 | macOS window/present flags | `targets/macos/hal_sdl.cpp:74-83, 186-187, 344, 857-875, 1473-1960` | ~20 flags across `window_kind`/`alloc_surface`/render thread; `main_hidden` never cleared (hidden main window can never come back) |
| 15 | Toolchain cache | `src/tc/tc.cpp:380-425, ~636-690` | no lock: concurrent first runs share `.part`/extract paths; `remove_all(dir)` under another process |
| 16 | Reactivity runtime | `lib/std/solid.ts:99-163`, `lib/std/react.ts:57` | `batch`/`run`/`untrack` restore `batchDepth`/`current`/`owner` without `finally`: one throw leaves every later signal write queued forever |
| 17 | UI pointer and gesture engine | `lib/std/ui.ts:588, 722-728, 5681-6141, 7005-7149` | `release(h)` keeps `dragScroller`/`tapEdit`/`grabber`... pointing at recycled handles; `releaseAt` early returns skip cleanup; `grabKind===3 && !pinching` freezes pan; releases while backgrounded never seen |
| 18 | webview slots | `plugins/webview/src/webview.mm:49-53, 139-170, 434-451`, `native/webview.linux.cpp:99-104, 328-336`, `index.ts:30-34` | `close()` keeps queued events; the next view in the slot gets the old one's messages and `invoke` replies; a stale `WebView` drives the new page |
| 19 | script VM handles | `plugins/script/native/quickjs.host.cpp:58, 288-327, 436-466`, `index.ts:93-176` | handle reused after `dispose()`: a stale `Script` evaluates in another VM; a late `Q.settle` settles the wrong promise |
| 20 | webrtc peer connections | `plugins/webrtc/index.ts:368-411, 793-827`, `native/webrtc.host.cpp:68, 225-266, 980-1003, 1124-1233` | the pump stops before `next()` reaps `dying`: closed PCs (ICE, threads, sockets) leak; `Tx.stopped`/`active`/`send` raced unlocked |
| 21 | socket handles | `plugins/socket/native/socket.host.cpp:26-69, 116-120, 273-290` | a deferred `ERROR` for a recycled handle `free_handle`s an unrelated new socket |

Cheap, confirmed-by-reading bugs worth fixing first (one condition each): `shot_watch` stuck true (`runtime/gfx.cpp:1400-1408`), `main_hidden` never reset (`hal_sdl.cpp:866`), `zinc doc --serve` stamps `seen` after the rebuild and loses edits (`src/doc/doc.cpp:1007`), gphoto2 `want_live` never cleared (`plugins/gphoto2/native/gphoto2.host.cpp:669`), carplay old socket handlers not detached (`plugins/carplay/index.ts:191-196`), `location` `Watch.stop()` inside its callback is undone (`plugins/location/index.ts:170`), lexer template frame does not restore JSX `depth`/`mode` (`src/frontend/lexer.cpp:124`), LSP `didChange` never updates `Doc::version` (`src/lsp/lsp.cpp`).

## Recurring patterns

- **Sticky stop/fail flags never reset**: `PollerJobs::quit_`, `rt::gStop`, `sdpack` `quit`, LSP `dtsRead_`, native-module `failed` map, PS2/Vita audio `state=-1`, `glr_state`. A restart or a long-lived process (LSP, `zinc dev`) inherits them.
- **Hand save/restore without RAII, broken by longjmp or early return**: `in_frame`, `in_watch`, `paint_busy`/`stencil_ok`, `GenFrame::running`, checker `padCallbacks`/`newExpected`, IR `handlers`/`cleanups`, web `imageDepth`.
- **Plain bools shared across threads**: Worker `closedSelf`/`joined`, fbdev `suspended`/`blanked`/`dark`, sidecar `gone`, gphoto2 `w_open`, `ns_*` scroll flags, cli_web `lastError`, debugger `fn_`/`pc_` in `onThrow`.
- **Slot tables without generation**: native voice `Conn`, lan handles, sim scheduler ids, devtools clients, camera slots, webview, script, socket, screen-capture, video players, ui.ts node handles. A stale handle or a queued event addresses a new object. The fix is the same everywhere: a generation in the handle (Box2D ids already do this) or monotonic ids (Android webview does).
- **State in files without a lock**: pairing, display lease, live-viewer request, OTA and app trials, toolchain cache, engine swap, `learn.json`.
- **"Failed" indistinguishable from "never tried"**: native module registry, assets `groupState`, 3d missing chunks, ipod `photosRead_`.

## Engine core (src/frontend, ir, zbc, vm, aot, rt, qjs, engine, wasm, dbg, prof, lint, lsp, i18n)

Trivial once-guards skipped: `fusedReady` (vm.cpp:36), `tablesOk` (aot.cpp:62), the prelude hook flags of frontend/modules.cpp, RAII parser flags.

- **rt Worker `W`** (H) `rt/worker.cpp:34-55`. Starting/Running/Idle/SelfClosing/Ended-untaken/Ended-taken/Terminated/Joined from `ended`, `endTaken`, `terminated`, `closedSelf`, `notifiedMain/Worker`, `joined`, atomics `stop`/`idle`. `snapshot()` :753 is lossy. `terminated` set under lock, `stop` after unlock (:551-556): the worker runs host calls in between and `body()` skips its error (:470). `closedSelf` (:620) and `joined` (:539) unlocked. Deterministic `deliver` spins until the worker calls `idleWait`.
- **Native module registry** (M) `rt/native.cpp:20-30, 185, 229-249, 298-307`. Deferred/Loading/Loaded/Failed/Shut-down from `deferred` + nullable `load`. Failed = never-loaded; re-entrant load unguarded; `gPending` can go negative and end the loop early; calls after shutdown report "no export".
- **Host mode globals** (M) `rt/rt.h:70-71`, `rtcalls.cpp:798-834`. `gStop` never cleared in scope: a host that forgets ends the next program at its first host call.
- **Redraw-in-poll** (M) `rtcalls.cpp:777-794, 849-860` (same pattern `qjs/qjs.cpp:564-570`, `engine/driver.cpp:264`). `zn::host::redraw` never nulled; a second error while `gRedrawError` is set is dropped.
- **Heap budget** (L) `rt/alloc.cpp:20-36`. `setHeapBudget` resets `gHeapUsed` with blocks outstanding; plain bool read from workers.
- **Machine run state** (L) `rt/rt.h:223-291`, `program.cpp:14-42`. `failed` cleared by callers only; a debug hook installed mid-run misses running frames.
- **CDP sessions** (H) see ranking #10. `cdpReady` waits forever without `runIfWaitingForDebugger`; breakpoints before `dbg` is bound get id 0.
- **DAP** (M) `dbg/dap.cpp:29-262`. `gConfigured`, `gDbg` never reset; `setBreakpoints` uses `gDbg` after unlocking; `gBps` unlocked; `disconnect` `_Exit`s past `finish()`.
- **Debugger stepping** (M, half-explicit) `dbg/dbg.h:93-99`, `dbg.cpp:59-149`. `reason_` is a raw `const char*`; `onThrow` reads `fn_`/`pc_` without `mu_`; a `pauseReq_` set while paused stops the next statement after resume.
- **V8 inspector** (M) `engine/v8.cpp:51-189`. Nested pauses clear `gPaused` for the outer loop; `--inspect-brk` after the client leaves skips the break.
- **Hermes inspector** (L) `engine/hermes.cpp:80-206`. After a disconnect the brk loop still calls `zn_hermes_cdp_pause()`.
- **`zinc:script` Vm** (H) see ranking #3. Also: `qInterrupt` from a nested callback leaks into the outer entry; `cut` from a nested entry reported by the outer; two bools encode a 3-way stop reason.
- **QuickJS event-loop phase** (M) `qjs/qjs.cpp:546-680`. Timer vs frame loop decided by whether `__zincFrameCb` is a function; clearing it mid-run never returns to the timer loop.
- **QuickJS profiler** (L) `qjs/qjs_prof.cpp:41-181`. Slots Free/Claimed/Named/Freed; silent drops past limits.
- **Sampler tracks** (L) `prof/prof.cpp:33-120`. Slots never reused: workers after the 32nd start of the run are not sampled.
- **Lexer JSX/template modes** (M, half-explicit) `frontend/lexer.cpp:31-235`. `depth` goes negative on unmatched `</x>`; `tagClosing` not cleared by `/>`; template frame 't' (:124) does not save `depth`/`mode`.
- **Checker ambient context** (M) `frontend/check.cpp` (74, 104-160, 1100-1121, 1444-1581, 2951/1713, 3001-3004, 4195-4239, 4609, 5286-5317). Hand save/restore; `newExpected` mailbox leaks to the next `new`; `padCallbacks` toggled without RAII; context snapshot copies a subset.
- **Process-wide frontend config** (M for LSP/dev) `check.cpp:38`, `profile.cpp:44-50`, `resolve.cpp:45-85`, `project.cpp:47, 318-320`, `modules.cpp:1549`. Order-dependent globals; the native-build `failed` map is never retried by a long-lived LSP.
- **FnLower SSA builder** (M) `ir/lower.cpp:1115-1560`. Many `seal` sites; `handlers`/`cleanups`/`loopTargets`/`loopCleanups` push/pop without RAII.
- **LSP lifecycle** (M) `lsp/lsp.cpp:216-743`. Only `shutdown_`: requests before `initialize`/after `shutdown` served; `didChange` never updates `Doc::version` and creates docs for unopened URIs; a failed `.d.ts` read sets `dtsRead_`.
- **wasm Instance/Module** (H) see ranking #13; also `pending` overwritten when two imports throw.
- **i18n** (L) `i18n/i18n.cpp:28-189`. Empty `lang` = unresolved; a missing catalog is cached empty; not thread-safe.

## Host, graphics, runtime, targets

Clean: src/text, res, platform, net, targets/null, targets/common. targets/windows, macos-legacy, android-legacy, wasm only keyword-scanned.

- **Crash/restart guard** (H) `runtime/zrt.cpp:929-1131`. A crash inside `cb(dt)` skips `in_frame=false` and `gfx::end_frame()`; `zrt_redraw` (:1002) returns forever after restart.
- **`PollerJobs`** (H) ranking #1.
- **Render thread** (M) `runtime/gfx.cpp:80-182, 1954`. `mode`/`started`/`busy`/`failed`/`hold`/`ticked`; `wanted()` can flip per frame between sync and thread; thread detached; `zrt_render_idle()` off the script thread does nothing.
- **Screenshot request** (M) `gfx.cpp:33, 1400-1408`. `shot_watch` stuck true if the request file empties early; hardware layers off for good.
- **Dev HUD / lazy tri-states** (L-M) `gfx.cpp:292-304, 423-433, 841-930, 1578`. Spin-waits on state 2 with no timeout if the painter dies.
- **GL replay** (L) `runtime/gl_replay.cpp:60, 104, 2271-2335`. `paint_busy`/`stencil_ok` hand-restored; an early return makes `paint` return 0 forever.
- **Generator frames** (M, half-explicit) `runtime/zrt_dyn.h:608-635`. `running` stuck after a longjmp out of `step()`; `close`/`raise` before start leave `injected`/`closing`.
- **HTTP `Fetch`** (H) ranking #9. Also `finish()` with `held` returns silently.
- **HTTP server `SConn`** (M, half-explicit) `host/http.cpp:456-1209`. `enum St` written at 8 sites, not checked against `answered`/`closed`.
- **Assets requests/groups** (M, half-explicit) `host/assets_host.cpp:135, 299-480`. No failed `groupState`; reloading a Loading group overwrites it; `Job` freed by an `afterRan`/`committed` handshake.
- **Mirror viewer** (M) `host/mirror.cpp:43-102`. `drop()` keeps `full`, `seq/acked`, `localSeen`, `wroteX/Y`.
- **Frame loop dev pause** (M) `host/gfx_host.cpp:51-556`. Pause branch clears `pauseFlag` and breaks even when quit was asked; `resetLoop()` keeps `devOn`/step flags.
- **Child processes** (M) `host/loop.cpp:184-300`. Spawn while `gProcPaused` starts reading then double-starts; `Proc` never erased.
- **OSC sockets** (M) `host/loop.cpp:351-406`. Global handles, thread-local open flags: a worker re-inits `gOscTx` on its own loop.
- **Small host cases** (L): window module loader `state` 0/-1/1 (window_module.cpp:29-73), image decode pool (image_decode.cpp:26-122), MQTT `connected`/`dead`, `sys_host` thread-local last-error sentinel (:146-148) and wakelock never released (:584), netlog entries.
- **WebGL context loss** (H) ranking #8; `loseContext` leaves `compositeScheduled`/`boundaryScheduled`; two copies of `lost` (`webgl_host.cpp:34`).
- **WebGL object lifecycle** (L-M) `gl/webgl1.h:291-350`, `webgl2_tex.cpp:273-386`. `bound` means "exists"; restore bypasses it with `~WebGL1()`.
- **macOS window/present** (H) ranking #14. `surface_ok` set before the GL branch fails (:344); `glr_stale` stays on rows-only frames; window never shown if frames keep mismatching.
- **Event-filter re-entrancy** (M) `hal_sdl.cpp:399-420, 1080`. `in_watch` plain bool, stuck by a crash longjmp: every later poll skips the pump.
- **Hidden/secondary windows** (M) `hal_sdl.cpp:857-875, 2033-2046, 2226`. `main_hidden` never reset.
- **Precise scroll gesture** (M) `hal_sdl.cpp:771-851, 1076-1140`. `ns_*` written on the AppKit callback, read on poll with no lock; `ns_fingers && ns_momentum` both true.
- **Metal/IOSurface adaptive present** (M) `targets/macos/hal_metal.mm:30-262`. `layer` nil after a failed switch back; counters desync.
- **Web pointer gesture** (M) `targets/web/dom.js:922-1010`. `suppressClick` swallows the next click after a drag ending outside; multitouch overwrites `press`; `st.composing` stuck on blur.
- **Web render mode** (M) `dom.js:675-864`, `runtime.js:176, 497-512`. `imageDepth` not in `finally`; `rawOn` cannot come back after the first commit.
- **Web route/history** (M) `runtime.js:840-868`. Leftover `routeIgnore` eats the next real Back; `routePopping` turns the next push into a replace.
- **Web others** (L): hmr apply chain, devBridge polling, `frame()` without `B.end()` on throw.
- **3DS display** (H) `targets/n3ds/hal_n3ds.cpp:36-57, 259-444, 508`. Stereo toggle at `frame_end` desyncs `eye`/`back`/`stale`; two `leaving` variables; dangling buffers after shutdown.
- **Console network bring-up** (M) `n3ds/net_n3ds.cpp:13`, `psp/net_psp.cpp:15`, `vita/net_vita.cpp:14`, `vita/hal_vita.cpp:164`. Platforms disagree on timeout (permanent vs retryable); no loss detection.
- **Console player** (M) `targets/console/player_console.cpp:50-172`. A stop between `Take` and `Started` is erased.
- **SD pack reader** (M) `targets/console/sdpack.cpp:150-384`. Per-name state across three containers and a string; `quit` never cleared; possible lost wake-up.
- **Other console cores** (L): audio `started`, PSP `quitting`, PS2 audio `state=-1` sticky, iOS-legacy remote gesture injector.

## CLI, toolchain, dev, agent, sim

- **Player pairing** (M) `src/agent/player.h:41-48`, `player.cpp:177-205, 322-335`. Any peer burns the 3 tries for everyone; a query renews the code.
- **Agent pairing** (M) `src/agent/server.cpp:64-150`. File + memory + clock; restart resets tries while the code file survives; `openPairing` unlocked. Divergent second copy of the player machine.
- **Display lease** (H) ranking #12.
- **App process by pid file** (M) `server.cpp:207-215, 337-415, 866-877`. Recycled pid taken for the app; detached waiter threads hold `&s` at shutdown.
- **Device dev session `opDev`** (M) `src/agent/dev.cpp:42-290`. Failed relaunch leaves `ownerPid` stale; a restart whose launch fails is lost.
- **Workstation dev `Session`** (M) `dev.cpp:293-480`. `there` merged vs replaced; failing viewer retried forever.
- **Live viewer arbitration** (M) `src/agent/live.cpp:50-135`. TOCTOU on `live.request`; `end()` can wipe a newer viewer.
- **OTA trial** (H) ranking #6.
- **Player run slot / mode matrix** (H) ranking #7; install of the running app removes its tree while it only was asked to stop.
- **Chan relay half-close** (L) `src/agent/chan.cpp:239-263`; **reversed-port parking** (L) `server.cpp:771-815`.
- **`zinc dev` local loop** (H) `src/cli_core.cpp:3600-3815`. Red box = `devFd<0 && hotFd<0 && child>0` (asset reload silently off); fds kept after the child is reaped.
- **`zinc dev --lan`** (M) `cli_core.cpp:3355-3590`. Unbounded pre-hello buffer, no timeout; `units[profile]` created empty on compile failure.
- **Web dev server** (H) `src/cli_web.cpp:997-1520`. `lastError` written unlocked; `renewBridge` holds `bm` up to 15 s; a second tab kills the first tab's bridge.
- **Device core upload** (L-M, half-explicit) `src/dev/core.h:49-55`, `core.cpp:22-100`. No timeout/abort in `Body`: an aborted upload swallows the next commands.
- **Hot channel in the program** (L-M) `src/dev/hot.cpp:88-130`. A second reload during a pending swap is dropped.
- **Serial link** (L) `src/dev/client.cpp:117-140`. fds leak when `fork` fails.
- **SD card model** (M) `src/sim/chips/sdcard.h:15-70`. CS high keeps a queued response; CMD0 leaves `receiving`/`app`/`out`.
- **ST7789, SSD1306, other chips** (L) `sim/chips/*.h`.
- **Sim scheduler** (M) `src/sim/sim.cpp:15-60`. Ids carry no generation: `cancel(oldId)` cancels a reused slot.
- **ProgramDut** (L) `src/sim/program_dut.cpp:63-89`. `addInput` resets the run but not `delivered_`.
- **Toolchain cache** (H) ranking #15.
- **Plugin build cache / cross mode** (M) `src/tc/plugin_build.cpp:115, 290, 746, 905-950`. `BuildLock` proceeds unlocked if open fails; `gCross` cleared by hand on every error exit.
- **`zinc update` engine swap** (M) `src/tc/selfupdate.cpp:150-258`. A crash between :174 and :176 leaves no `engine`; no lock.
- **TUF client, job pool, policy** (L) `tc/tuf.cpp`, `tc/progress.cpp`, `tc/policy.cpp`.
- **CLI mode globals** (M) `src/main.cpp:142-158` and ~20 write sites. `gBundleOut="?"` sentinel; `gBuildTarget` without `gDeviceCore` at :3144.
- **App update trial** (H) ranking #5.
- **mqjs emulator run** (M) `src/cli_mqjs.cpp:470-880`. `rc` never consumed; final `waitpid` can block.
- **learn/tour progress** (L) `cli_learn.cpp:96-270`, `cli_tour.cpp:44-70`. `learn.json` read-modify-write, no lock.
- **`zinc test` runner** (L) `src/test_cmd.cpp:98-120`. Windows variant skips TERM.
- **.zapp unpack cache** (L-M) `src/zapp.cpp:155-262`. `.part<pid>` never swept; damaged unpacked files never repaired.
- **`zinc doc --serve`** (M) `src/doc/doc.cpp:938-1010`. `seen` taken after the rebuild: edits during a rebuild are lost.
- **zpk reader** (L) `src/zpk/zpk.cpp:60-130`. Half-initialised after a failed `open`.
- **App core lifecycle** (M) `src/app/app.cpp:17-134`, `embed.cpp:11-70`, `shell_sdl.cpp:238-325`. `appFinish` derefs `gApp` unchecked; background flush skipped during `in_iterate`.

## Plugins A–L

Only grepped, nothing found: canvas2d, command-palette, animation, imu-qmi8658, display-webos, imageio, lastfm, loro, fleet, gestures, async-storage, ffi, loader, device, editor.

- **discord-voice** (H) ranking #11. `VoiceConnection` (`index.ts:120-596`): reconnect fork at :560-581 can queue two `open()`; `fresh` stale after an early close. Native `Conn` (`voice.host.cpp:265-1050`): `start()` opens devices (:955) before the `started` check (:957); slot reuse without generation.
- **display-rmpp** (H) `rmpp.cpp:60-87, 115-144, 354-363, 524-577, 664-698`. `as_widget` and `docked` both true after dock then show-widget; optimistic `hidden`; `set_mode` drops switches before `mode_ready_us`. Sidecar stream (`stream.h:88-107, 407-409, 601-606`): `ended` single slot lost if a new client connects before the next present; detached threads keyed by `session`.
- **display-fbdev** (H) `fbdev.cpp:45-75, 372-403, 900-1293`. `suspended`/`blanked`/`dark`/`resumed` plain bools read from the stream thread; `fb_suspend` closes the DRM file while the video thread commits; `resumed` set on the simulated path without re-opening inputs.
- **display-gl** (M) `display_gl.cpp:66-349`, `kms.cpp:33-290`, `webos.cpp:55-362`. A late flip after the 100 ms give-up corrupts `pending_bo`; shutdown does not wait for a flip.
- **camera** (M-H) `native/camera.macos.mm:47-277`: three-atomic retake check; sink reformatted while the control queue reconfigures; take after close silently false. Host/JS (`host.cpp:63-370`, `index.ts:62-141`) M; Linux V4L (`camera.linux.cpp:28-194`) `volatile` flags, open succeeds with no thread.
- **devtools** (M) `index.ts:154-934`, `native/cdp.next.ts:14-129`, `cdp.host.cpp:113-318`. `netOn`, `picked`/`pickWin`, pause state process-global across clients; client arrays never shrink; hot-reload adopts sockets losing partial frames.
- **ipod** (L-M) `ipod_core.h:106-110`, `ipod_core.cpp:942-1520`, `host.cpp:43-174`. `open` closes before validating; `photosRead_` set before parse; `backedUp_` survives a device swap.
- **audio** (M-L) `audio.host.cpp:20-668`. Failed `musicOpen` leaks; `wantPlay` survives the end; `atexit` shutdown does not join decode threads.
- **link** (M-L, half-explicit) `link.host.cpp:107-560`. `ready`/`pairing` change what `Phase` means; events for a closed handle stay queued.
- **display-sidecar** (L-M) `sidecar.cpp:45-389`. `gone` unlocked while `broken` is locked; detached sender never stopped.
- **3d** (L-M) `render3d.host.cpp:318, 902-1365`. `need==-1` "named to free" never cleared if the program does not free; missing chunks not remembered.
- **ink** (L) `index.ts:112-196`; detached workers `ink.abi.cpp:331, 399`.
- **lottie** (L) `index.ts:36-67`, `lottie.host.cpp:1101`.
- **ble** (L-M) `index.ts:41-89`, `ble.macos.mm:40-107`.
- **gphoto2** (M) `gphoto2.host.cpp:58, 240-669`. `w_open` written outside `mu`; `want_live` never cleared (poller never idles); `liveView(true)` before open applies later.
- **carplay** (M-H) `index.ts:27-196`. Old socket's `onmessage`/`onerror` stay after `close()`; `status` string written from ~8 places.
- **leapmotion** (M) `index.ts:31-62`. One tracker's `close()` tears down the shared native connection.
- **location** (M-L) `index.ts:144-251`. `Watch.stop()` inside its callback is undone; `retune()` only on add.
- **editor LSP** (L) `lsp.ts:57-88`. `restarted` never reset; `waiting` counter drift.
- **gsap** (L-M) `index.ts:71-451`. Replay after completion does not re-attach to `root`; `killed` permanent.
- **display-remote, display-shell, lan** (L) `remote.cpp:51-164`, `shell.cpp:33-251`, `lan.abi.cpp:35-252` (slot reuse without generation; `-1` for closed and unknown).

## Plugins M–Z

Nothing found: osc, network, qrcode, pixelfont, sf-symbols, remarkable, markdown, tilemap, sprite, webos, secure-store. Only skimmed: pdf, svg, wasm. three: Zinc glue only.

- **webrtc** (H) ranking #20. Also: four state strings (`index.ts:510-513`) with `signalingState==='closed'` as the closed flag; `close()` writes them without events; `checkNegotiation` timer fires after close; `chainPt` (-2/-1/pt) never reinstalls a chain after a removed section; no rollback, so glare sticks in `have-local-offer`.
- **system single instance** (M) `system/native/system.host.cpp:128, 323-405, 649-670`. A second `instance.lock` in the same process reports `first:false` to itself; a failed bind still answers `first:true` with nobody listening; the second instance blocks the loop up to 1 s and loses the launch if the holder never answers.
- **system close veto** (M) `system/index.ts:33-62`. A throwing close-requested handler skips `confirmClose`: the window never closes; `preventClose()` outside a handler is reset by the next request.
- **system macOS menu/tray/media** (L) `system.macos.mm:108-109, 250, 326-328, 475-505, 702, 778-781`. `gInPopup`/`gPicked` not re-entrant; `watchWindow` keeps one static window; `gMediaState` extrapolates forever; sleep assertions not released at exit.
- **notifications, dialogs** (L) `system/notification.ts:39-53` (`live` never shrinks), `dialog.ts:46-48` (unanswered token pending forever).
- **video native player** (M) `video/native/player.h:59-82, 274-488`. No stored ended/stopped state; `seek()` on a stopped player starts playback; `pause()` before play dropped; `seeking`/`running` read unlocked; slots reused, JS `Player` has no closed flag.
- **video web player** (L-M) `video/web/index.ts:54-175`. A failed entry stalls the playlist forever; `ended` listener survives `close()`.
- **webview** (H) ranking #18. No load state: a failed load looks pending (M). Android (`WebviewModule.java:42-177`): `create` returns -1 without an activity, `ui()` drops work during recreation.
- **script** (H) ranking #19. Same Vm flag set as `zinc:script` in the engine (#3): interrupt before the outermost entry lost, nested `cut` leaves promises pending.
- **socket** (H) ranking #21. JS `Socket` (`socket/index.ts:31-190`): `close()` while connecting never settles the `connect()` promise; half-closed has no state. WebSocket (`index.ts:286-486`): no timeout in CONNECTING or CLOSING; constructor errors fire before handlers attach.
- **screen-capture** (M) `screen-capture/native/screen.macos.mm:26-66, 172-345`, `index.ts:69-111`. `ZnScOut` holds raw `state*`/`why*` into a slot: a late `didStopWithError` kills the next capture in that slot; `take`/`state` race `release` on `out`; `open()` polls every 10 ms with no timeout.
- **mapping** (L-M) `mapping/native/mapping.host.cpp:28-70, 629-760`, `android/ZincMappingMedia.java:36-135`. A failed media open is never retried and leaves no error; Android error listener only logs; `release()` vs queued `onPrepared`.
- **sonos subscriptions** (M) `sonos/index.ts:843-1020`. A failed renew then a failed resubscribe ends events silently; `close()` racing `subscribe` leaks; inactive `unsubscribe` leaves the SID alive at the speaker; coordinator change not followed.
- **map tiles** (M, half-explicit) `map/native/map.host.cpp:398-500`, `index.ts:64, 172-210`. No fetch timeout: two hung tiles stop the map for good; MISSING is permanent after a transient failure.
- **shell compositor** (M) `shell/native/shell.host.cpp:66-560`. One resume per screen child while another still runs; a `screen` child that connects keeps the display suspended; `start()` of a running name overwrites its files.
- **process** (L-M) `process/index.ts:20-100`. A throwing `onExit` never resolves `exited`.
- **remote-view** (M, half-explicit) `remote-view/native/remote.host.cpp:17-232`. `OPEN` before HELLO: `close` without `open`, stale `w` after reconnect; `close()` during the first connect never settles it.
- **spotify auth** (M-L) `spotify/index.ts:113-190`. Sticky `problem='login expired'` when another process rotated the token; `reload()` during a refresh restores the old account.
- **trieur deck** (L-M) `trieur/deck.ts:110-470`. `flight` cleared only by the view; `hold`/`dragEnd` ignore `busy`; `shiftUsed` wrong after a missed keydown.
- **three glue** (L-M) `three/index.ts:887-967, 1396-1491`, `addons/GLTFLoader.ts:46-55`. Summed `gpuVersion` can collide; `dispose()` does not stop the loop; a throwing GLTF build leaks one of 16 doc slots.
- **Low**: microphone (no end event on device loss), serial, photos, physics2d/3d (`World.destroy()` keeps its handle), sqlite, midi (global `failed` flag), monitors.

## Standard library (lib/std)

Stubs, thin bindings or pure functions with nothing to list: system/*, gl.ts, subtle, xml, markdown, i18n, path, device-info, hardware, hot.ts, image-cache.ts.

- **Reactivity runtime** (H) ranking #16. `run` has no re-entrancy guard (an effect writing what it reads recurses); `History.show` runs user `apply` in `batch`. react.ts: a throwing render leaves `cur` and `childUpdateDepth` wrong.
- **ui.ts pointer/press/capture** (H) ranking #17. A destroyed focused field loses its `onChange` (725); pick mode swallows a release mid-press (6398, 6670-6692).
- **ui.ts gesture arbitration** (H) `ui.ts:7005-7149`. `dragging` duplicates `grabKind===1`; stale `fIds` after the primary finger lifts first blocks the next `secondFinger`.
- **ui.ts trackpad/momentum** (M) `ui.ts:6190-6266`. A lost lift leaves `swiping` true and eats all pad input; phase 3 keeps `swiping`/`padScroller`.
- **ui.ts `ScrollAxis.mode`** (M, half-explicit) `ui.ts:5322-5543`. 25 write sites; wheel/`scrollTo` overwrite DIRECT under a finger and lose its velocity; `catchScroll` ignores BOUNCE/STRETCH; IDLE out of bounds patched in three places.
- **ui.ts layer motion and overlays** (M) `ui.ts:7185-7490`. `paintLayers` flips `hidden`/`bgAlpha` without `finally`; `o.shown` stale outside `flushOverlays`; `restoreTo` single slot.
- **ui.ts edit composition** (H) `ui.ts:170, 1073, 1094, 5008, 6305-6326, 7719`. `setValue`, `undoEdit`, `select()` keep `compA`/`compB`: controlled inputs with an IME get an out-of-range composition.
- **ui.ts LayoutAnimation** (M) `ui.ts:4044-4149, 3942`. `configureNext` while running loses the old `onEnd`; `laStart` mid-run strands partial `fade`/boxes.
- **ui.ts tweens/transitions** (M) `ui.ts:1604-1654, 3975-4184`. A replaced `animate()` drops its anim without `done`: its Promise never resolves (`kit/keyboard.tsx:152,157` waits on it); `inTween`/`inStyle` without `finally`.
- **ui.ts Surface swap** (M) `ui.ts:6711-6810`. `swapSurface` omits ~15 gesture fields: touch selection, momentum, dim leak between windows.
- **ui.ts re-entrancy guards** (L-M) `inVirt`, `inFields`, `inSettle`, `childUpdateDepth` (569, 874, 2215, 3955-3961): a throw stops those passes for good.
- **ui.ts small** (L): press dim chain (6437-6460), shared `PanHandlers` state (1003-1034), single `heldPath` (5745-5767), back handlers with no phase (2288-2317).
- **animated.ts** (L-M) `animated.ts:21-373`. `Parallel.start()` while running aborts the new run; composites have no running flag.
- **navigation.tsx** (M-H) `navigation.tsx:24-227`. `kind` 0..5 overwritten by `push`/`swipe`/`backstart` from any state; `predictive` survives an interrupted back; swipe during a pop keeps the route; `Presented.close` twice pops a real screen; `rerender` captures a stale `version`.
- **react-native.tsx** (M) `Press` (51-61): stale-closure `pressed` stuck on a same-frame tap, no `onPressOut`. `Alert.alert` (626-660): `close()` twice runs `onPress` twice and removes a recycled node. `Modal` (602-620), pull-to-refresh `pulled` (475-492), keyboard events (407-420) low.
- **kit/imageviewer.ts** (H) `imageviewer.ts:37-253`. `mode` 0..3 + `closing`: drag, pinch, wheel, toggle still act during the close animation and the 165 ms paging window; pinch and drag share `startPan*`; `opened` never read.
- **kit/zoomview.tsx** (M) `zoomview.tsx:57-122`. Pinch over a drag calls `begin` twice and `finish` twice; `zoomBy` mid-gesture finishes it; `onView` promises not serialised.
- **kit/keyboard.tsx** (M) `keyboard.tsx:70-253`. No pointer cancel/leave: backspace repeats forever; stale accent popup types on the next up; `place()` has no generation token.
- **kit/overlays.tsx, kit/tooltip.ts** (M) `overlays.tsx:58-206`, `tooltip.ts:16-22`. Long-press timer overwrites the enter timer; open state only in the engine `hidden` flag; toast removal timer never cancelled.
- **kit/menubar.tsx** (L-M) several submenus open at once; `bindAll` adds global actions every render.
- **kit/slider, tabs, spinner** (L).
- **nuxt/** (L-M) same overlay patterns; `Select` (controls.tsx:117-145) opens only with both `open` and `onOpen`; Tooltip hover-only.
- **dnd.ts** (M) `dnd.ts:57-168`. Phase 0 overwrites `active`; a source unregistered mid-drag leaves `active` set and `scrollStep` scrolling forever.
- **stage.ts** (M) `stage.ts:48, 139-149, 296-366, 702-820`. Drag cancel (phase 3) never emitted; `heldScrollBox` never cleared; nested `layoutAndRender` clears `isFramePassRunning`; global clip flags clobber an outer clip.
- **worker.ts** (L-M) `worker.ts:37-138`. `terminate()` does not mark the instance dead; `request` has no timeout; a throwing `onmessage` skips mark 2; unanswered `deliver` kills the pump.
- **history.ts, fetch.ts, acme.ts** (L): no re-entrancy guard on `apply`; abort does not cancel `net.fetch`; `keepRenewed` overlaps.
- **web.ts** (L) `WakeLock` count leaks without `release()`; `Sensor.stop()` keeps `hasReading`; watcher intervals never cleared; orientation 'turn' ignores `locked`; `VirtualKeyboard.visible` stale.
