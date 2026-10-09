# Paper Pro: direct ink while keeping xochitl alive

Status: researched design, not a deployed coexistence driver. The separate Quill
takeover test is user-confirmed responsive. This follow-up used read-only device
queries and local analysis of the copied vendor binary; no extension was installed
and no service was stopped.

## Finding: the vendor already provides a render blocker

The exact device library SHA-256 is
`3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08`.
`nm -D -C` and AArch64 `objdump -d -C` on that copy show:

| Export / address in this ELF | Observed implementation |
|---|---|
| `EPRenderBlocker::start()` — `0x31710` | Starts a QTimer; obtains and casts `QSGRenderLoop::instance()`; calls `EPRenderLoop::blockRendering(reason)` at `0x317ac`. Starting an already-active blocker restarts its timer. |
| `EPRenderBlocker::stopInternal()` — `0x313d0` | Clears its active flag, stops its timer, calls `unblockRendering(reason)`. |
| Timer callback — `0x315d0` | Calls `stopInternal()`; diagnostic string says the timer expired and is unblocking. |
| `EPRenderBlocker` destructor | Calls `unblockRendering` when still active (`0x3205c`). |
| `EPRenderLoop::handleUpdateRequest()` — `0x28f90` | Checks blockers at `0x29190`, before `polishItems`, `syncSceneGraph` and rendering. Blocked requests take a path ending in `renderingBlockedDueToBlocker()` at `0x29464`. |
| Rectangular `EPFramebuffer::swapBuffers()` — `0x33340` | Builds content/mode maps and calls the region overload at `0x33450`. |
| Region `swapBuffers()` — `0x32f60` | Calls the backend and updates stored content/mode maps; no EPRenderLoop blocker call appears in the inspected function. |

These addresses are evidence locations, **not patch offsets to deploy**. Bind through
validated symbols/Qt metadata, not private-object layouts or guessed storage sizes.
QML registration/creation of EPRenderBlocker has not been demonstrated on the device.
The Qt timer is not an independent watchdog if xochitl's event loop itself hangs.

Inference: pause scene-graph painting with the existing blocker, while a small
in-process bridge submits direct ink through the already-running framebuffer engine.
This targets the conflict *before* Qt overwrites the shared pixels. Dropping only
`swapBuffers` calls is too late: the renderer may already have overwritten memory.
It also changes call/completion semantics, so returning invented update tokens is
not an acceptable arbitration mechanism.

## Proposed ownership protocol

The client remains a separate Notes process launched by AppLoad. The bridge is a
small XOVI extension inside xochitl. Only xochitl owns/initializes the vendor engine;
the external client must not call Quill's `quill_init()` or open a second engine.
Reuse Quill's validated pixel/mode path, adapting its transport, not loading the
unchanged takeover adapter twice.

1. **Acquire:** only grant a session while our fullscreen AppLoad view is foreground.
   Install an input barrier, finish/cancel existing gestures, then activate a blocker
   with a unique reason on its owning Qt thread. Confirm no render is in flight;
   preserve the original pixels and determine how content/mode state will be restored.
   Do not grant the client access before that boundary.
2. **Draw:** the client writes a separate bounded staging buffer, never a raw pointer
   into xochitl. The bridge validates geometry, stride, sequence and active ownership,
   copies the completed dirty rectangle, then issues the native partial swap. Buffer
   publication needs explicit synchronization so copying cannot race client writes.
   Copy and swap run in one serialized execution context, outside a QPainter frame.
   Queued Qt dispatch need not wait for a scene-graph frame; its actual latency still
   needs measurement on this firmware.
3. **Release:** reject further updates from this session first; finish outstanding
   bridge work; restore pixels and the normal rendering policy; stop only our blocker;
   request a real complete scene reconstruction and release the input barrier after
   draining contact transitions. A mere `window.update()` cannot be assumed to repaint
   every pixel because the renderer caches damage.
4. **Client failure:** socket EOF or an expired heartbeat follows the same release
   path. Every queued request carries a session generation, so an old queued frame
   cannot write after release/reacquisition. Check the deadline on every draw, not
   only when a timer callback eventually runs. Renew while the app is healthy even
   when the user is not drawing. Do not renew from a disconnected client's backlog.

A single fullscreen owner is enough for the first implementation; simultaneous
native windows are not required. The bridge is also the only authority allowed to
resume painting: an external process cannot continue writing into the vendor buffer
after its lease expires.

Input is a separate conflict: blocking painting does **not** block xochitl's actions.
The foreground view/filter must consume pen and touch so writing does not edit an
invisible native notebook. Evdev grabs alone do not drain already-queued Qt events.
Power/suspend, focus loss and rotation should end the first prototype session before
allowing the native operation to proceed, rather than attempting live coexistence
with a sleep screen or a rotated canvas.

## Reusable projects, and their limits

- [framebuffer-spy](https://github.com/asivery/rm-xovi-extensions/blob/6c709dd8416ddf89034831073d76fb4ee3372905/framebuffer-spy/src/main.c)
  captures the QImage external-memory constructor inside XOVI and recognizes the
  Paper Pro geometry (1620×2160, stride 6528, format 4). Its address is local to
  xochitl. `refreshFramebuffer()` is not a Paper Pro display submission: on this
  path `requiresReload` is false and the function does nothing. Reuse discovery,
  not an assumed drawing or locking API.
- [Quill adapter](https://github.com/MaximeRivest/quill/blob/39262ee0bef69915e3ead3ac218d5973916f422a/src/vendor_probe.cpp)
  demonstrates the direct call ABI. It captures buffer construction during singleton
  initialization, so loading it after xochitl initialized is not a ready-made attach
  mode. Capture must happen during startup or use a separately validated accessor.
- [Qt thread affinity](https://doc.qt.io/qt-6/qobject.html#thread-affinity) and
  [scene-graph callbacks](https://doc.qt.io/qt-6/qquickwindow.html#beforeRendering)
  constrain where the bridge can call Qt objects. A socket reader thread must not
  directly mutate the render loop or assume those objects live on that thread.

Do not use SIGSTOP/SIGCONT as display arbitration. It retains xochitl's resources,
halts its software display threads and watchdog notifications, and does not transfer
engine ownership. The installed service has `WatchdogSec=60`. Do not delete its live
display lock, start a second Quill engine, replace firmware or override waveform files.

## Remaining proof before drawing through this bridge

The blocker covers the inspected Qt render path, not necessarily all proprietary
native-ink or background engine paths. First build an observation-only XOVI probe:
record both swap overloads with thread and caller provenance, render-blocked signals,
buffer lifetime and foreground/input state. Calls must forward unchanged. Validate
whether interception covers internal calls too; observing no calls through an
incomplete hook is not evidence of exclusivity.

Then test a short automatic blocker interval with **no buffer writes**, checking
resume, unchanged xochitl PID, input suppression and outstanding native updates.
Only after establishing serialization and restoration should the probe draw a tiny
self-restoring region, then a stroke. Unexpected native writers invalidate the
design until their entry point is understood; suppressing their swaps is not enough.

Acceptance: repeated enter/exit, client crash/disconnect, expired and late requests,
sleep/focus/rotation handoff, and no hidden edits to a native notebook. Compare the
same handwriting with standalone Quill and confirm xochitl PID stays constant across
sessions. Successful bridge coexistence and unchanged drawing latency are separate
claims. A startup extension may require one initial xochitl restart; repeated app
launches should not require it. This remains to be implemented and tested.

## Prototype follow-up

The bridge is implemented but did not load into xochitl. Drawing was never enabled. Repeated diagnostic restarts hit the stock start limit and triggered an emergency reboot; the experimental extensions were removed. See [prototype status and incident](../../integrations/remarkable-ink/README.md). Notes and Dashboard retain qtfb by default. The new touch controls and shared battery/time/exit bar compile and pass local input tests, but native fast drawing is still unresolved.
