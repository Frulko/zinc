# A clean fast-ink bridge for reMarkable tablets: research and design

Date: 2026-10-25. Research and design only: no build, no device access, no other file changed.

The owner: "for reMarkable and fast ink we have the choice between the official way, which does not really allow drawing,
and the unofficial one, which conflicts with xochitl: we need a clean bridge."

This report covers only that bridge. The goal: an app started from the reMarkable's own UI (an AppLoad tile in xochitl,
or the official developer-mode way) gets fast pen ink (fast mono partial swaps, and colour after pen-up on the Paper Pro
line), then hands the screen back to xochitl cleanly, instantly if possible. There must be no restart storm and no reboot
risk, and after an OS update it falls back to the slow path on its own.
It builds on `docs/reports/remarkable-apps-design.md` (models, display paths, options A qtfb / B takeover / C in-process),
`docs/reports/rmpp-latency-2026-09-29.md`, `docs/reports/rmpp-coexistence-2026-09-29.md`,
`integrations/remarkable-ink/`, `plugins/display-rmpp/` and `examples/remarkable/quill-test/`.

## 0. Summary

- **Freezing xochitl (SIGSTOP or `systemctl freeze`) is not a bridge on the Paper Pro line.** The frozen process still
  owns the display: its vendor engine holds the DRM device and the `/tmp/epframebuffer.lock` lock. The systemd of the
  current OS (Yocto scarthgap, systemd 255) keeps xochitl's `WatchdogSec=60` running while it is frozen and kills it
  after 60 s. A restart then happens on top of the app, which is the path to the 2026-09-29 reboot. Freezing only works
  where a separate display server owns the panel (rM2 with rm2fb, Oxide's blight), and those already have their own
  switch.
- **The in-process path can be made clean, and it gives an instant return.** An "ink lane" inside xochitl writes the
  app's damaged pixels into the vendor engine's own buffer and calls its partial *Pen/Mono* swap. It runs only while the
  pen is down and Qt rendering is blocked. On pen-up it gives the rectangle back to the normal qtfb repaint, and that
  repaint *is* the colour settle. There is one engine, no restart and no state lost. Our first bridge most probably
  failed to load because it declared conditions and hooks on `libqsgepaper.so` symbols. XOVI resolves those in its
  `LD_PRELOAD` constructor, before Qt has `dlopen`ed that scene-graph plugin. Section 4.2 shows how to fix this, and how
  to make a failure cost at most one xochitl restart per boot.
- **The supervised takeover stays as the fallback that is already proven** (Quill, "excellent"). It is made safe by
  one transient systemd unit per session (the lease), a start budget that can never reach `StartLimitBurst`, a dead-man
  timeout, an app watchdog, a power-button escape owned by the supervisor, and one restore routine for every way out.
  It costs a xochitl restart (about 1 s to `active` in the journal, a few seconds to a usable UI, not yet measured) and
  the open notebook view.
- **First, measure qtfb again.** AppLoad before v0.6.0 (2026-09-19) turned every partial qtfb update into a full-screen
  repaint (an integer-division bug, below). The 125 ms paints of 2026-09-29 may come from that bug. On an rM2, the fix
  is reported to make handwriting "native-feeling" in a qtfb app. The cheapest possible win comes before any bridge.
- **Recommendation (scored in section 6):** a layered driver that tries **L1 the in-process ink lane** (hash- and
  symbol-gated, fails closed), then **L2 the supervised takeover** (when the app asks for a session, or when L1 is
  unavailable but the vendor hash is known), then **L0 qtfb** (always). It never freezes xochitl, and it never restarts
  xochitl more than 2 times in 10 minutes.

## 1. What holds the display, per model

| Model | Who drives the panel | Engine API | Can two openers coexist? |
|---|---|---|---|
| rM2 (i.MX7, mono) | SWTCON statically linked inside xochitl; it writes waveform frames to the LCDIF (`/dev/fb0`) from its own threads ([ddvk rm2fb](https://github.com/ddvk/remarkable2-framebuffer)) | none exported (static); rm2fb hooks it by address (ddvk) or by its own SWTCON copy ("swtcon mode", [timower](https://github.com/timower/rM2-stuff/)) | no: rm2fb exists to make one owner ("Ensures only a single client can control the display", `rm2fbctl switch <pid>`) |
| Paper Pro (i.MX8MM, colour) | `libqsgepaper.so` loaded into xochitl (`/usr/lib/plugins/scenegraph/`): `EPFramebuffer` singleton with update and display threads, KMS on `/dev/dri/card0` (Oxide's client shim intercepts `DRM_IOCTL_MODE_ATOMIC` and `SETCRTC` from xochitl: [libblight_client/drm.cpp](https://github.com/Eeems-Org/oxide/blob/master/shared/libblight_client/drm.cpp)) | exported C++ symbols: `EPFramebuffer::instance()`, `swapBuffers(...)`, `EPRenderLoop::blockRendering/unblockRendering(QString)` (verified on 3.27.3.0, `rmpp-coexistence-2026-09-29.md`) | no: a second engine needs DRM master and the `QLockFile` `/tmp/epframebuffer.lock`; Quill's launcher refuses a live lock owner. Quill's reboot incident was a second engine starting on top of its own ([Quill device test](https://github.com/MaximeRivest/quill/blob/main/docs/device-test-2026-07-12.md)) |
| Paper Pro Move (colour) | same family; buffer 960x1696, stride 3840 ([framebuffer-spy](https://github.com/asivery/rm-xovi-extensions/blob/master/framebuffer-spy/src/main.c)) | same family, hash unknown | as Paper Pro |
| Paper Pure (mono, 2026) | Paper Pro software family (aarch64, qtfb `FBFMT_RMPPURE_*`) | same family expected, hash unknown | as Paper Pro |

The vendor ABI moves. On 3.27 the rectangle swap is `swapBuffers(QRect, EPContentType, EPScreenMode, QFlags<UpdateFlag>)`,
and Quill uses mono mode 0 and colour modes 3/4/5. On 3.28 it is `swapBuffers(QRect, EPScreenMode, QFlags<UpdateFlag>)`
with `Pen=0, Mono=1, Animation=2, UI=3, Content=4, Sleep=5`
([epfb-re 3.28 header](https://github.com/asivery/epfb-re/blob/master/epframebuffer.h), "Finish 3.28 API implementation",
2026-09-01; Oxide's [epframebuffer.h](https://github.com/Eeems-Org/oxide/blob/master/shared/epaper/epframebuffer.h) has
the same enum and the object offsets). A bridge needs one row per vendor hash: the mangled symbol and the argument mapping.

## 2. Option 1: freeze instead of stop

The idea: SIGSTOP xochitl (or `systemctl freeze xochitl`, the cgroup v2 freezer), let the app drive the engine, then
thaw xochitl and force a full repaint.

**What the sources say.**

- `systemctl freeze` "will cause all processes contained within the cgroup ... to be suspended". It needs the unified
  cgroup hierarchy, and the unit "is automatically thawed just before we execute a job against the unit, e.g. before
  the unit is stopped" ([systemctl](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)).
  "Processes in the frozen cgroup can be killed by a fatal signal"
  ([cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)).
- **Watchdog.** systemd only stops a service's watchdog timer on freeze since commit
  [25178aa](https://github.com/systemd/systemd/commit/25178aadb2) (2025-08, systemd v258, "Otherwise the unit will be
  killed by the watchdog given it's frozen but the clock keeps ticking", [#38517](https://github.com/systemd/systemd/issues/38517)).
  The Paper Pro runs Codex Linux 5.7 on scarthgap (Quill's device record), which ships systemd 255. There, a frozen
  xochitl with `WatchdogSec=60` is killed after 60 s and restarted by `Restart=`. SIGSTOP has the same problem: the
  toltec maintainers documented it for launchers that pause xochitl ("WatchdogSec=60, which causes xochitl to restart
  after 60 seconds", [toltec#515](https://github.com/toltec-dev/toltec/issues/515)). They refused to remove the
  watchdog because it is xochitl's deadlock recovery.
- **The display stays held.** A frozen xochitl keeps DRM master and its live-PID lock, so the app's own engine cannot
  modeset (DRM grants one master per device) or take the lock. Quill only starts after `systemctl stop`, and Oxide makes
  xochitl a *client* of its blight server precisely so it can be paused. The only way to "share" while frozen is to
  break the lock (blight runs with `--break-lock`) and take master. On thaw, two engines would fight over the panel,
  which is the documented reboot.
- **Mid-waveform freeze.** The engine's display thread pushes a sequence of drive frames. KMS keeps scanning out the
  last committed frame on its own, so freezing in the middle of an update may hold the panel on one drive frame. This
  is an inference, not measured; it is a panel-health risk that no test should take.
- **The engine's per-pixel state.** A software TCON computes each waveform from the pixel's previous state. If anyone
  else changes the panel, the frozen engine's state is wrong after thaw. A full flashing refresh is then mandatory
  (on xochitl: the sleep/wake cycle, AppLoad's qtfb "force full refresh" call, or a XOVI hook).
- **Hardware watchdog and rm-emergency.** PID 1 keeps feeding the hardware watchdog, so a frozen xochitl does not
  trigger it. The danger is the unit path: watchdog kill → restart → a failed start or `start-limit-hit` → `OnFailure`
  → `rm-emergency.sh` → reboot, as on 2026-09-29.

**Where freezing does work.** On an rM2 under rm2fb, and under Oxide, the panel belongs to a separate server process.
remux runs `systemctl stop xochitl`, then launches xochitl itself as a child, outside systemd and its watchdog, and
switches apps with `SIGSTOP`/`SIGCONT` ([remux launcher.cpy](https://github.com/rmkit-dev/rmkit/blob/master/src/remux/launcher.cpy),
`run()` and `term_apps()`). That is a launcher replacing xochitl's supervision, not a bridge from inside xochitl.

**Verdict.** Rejected on the Paper Pro, the Move and the Pure. On the rM2, use rm2fb's own switch when rm2fb is
installed; never freeze a xochitl that owns its SWTCON.

| | rM2 | Paper Pro / Move / Pure |
|---|---|---|
| Latency | rm2fb fast modes (DU) | n/a: no display without a second engine |
| Return | instant (SIGCONT + full refresh) | n/a |
| State lost | none | none if it worked; everything after a watchdog kill |
| Risk | low with rm2fb; panel risk without it | watchdog kill at 60 s on systemd < 258, two engines, reboot |
| OS update | rm2fb needs support for that OS (timower: up to 3.28 beta) | n/a |

## 3. Option 2: a supervised takeover done right (the display lease)

The proven path: `examples/remarkable/quill-test/launch.sh`. AppLoad starts a transient systemd unit. The unit takes a
wakelock, runs `systemctl stop xochitl`, runs the app, and restores xochitl in `ExecStopPost`. The journal showed a
clean return (timeout 15:54:14, xochitl running 15:54:15). What is missing is what made the 2026-09-29 incident possible:
nothing counts starts, nothing escapes a hung app except the app itself, and the restore can fail without a plan.

### 3.1 Shape: one transient unit per session, no resident daemon

The brief suggests one socket-activated root supervisor. A resident daemon needs a unit file on a read-only root and
would start at boot, which XOVI's own design avoids on purpose (boot loops). One transient unit per session gives
the same guarantees with nothing installed:

- The AppLoad tile runs `lease launch <app>`, a static aarch64/armv7 binary of about 300 lines that grows out of
  `launch.sh`. It runs every preflight check first, then
  `systemd-run --unit=zinc-lease --collect -p RuntimeMaxSec=... -p KillMode=control-group -p ExecStopPost="lease restore" lease session <app>`.
  The fixed unit name makes leases exclusive: a second launch is refused by systemd itself.
- Inside the unit, `lease session` is the main process. It holds the wakelock, owns the power button (`EVIOCGRAB` on
  the key device only), stops xochitl, and starts the app as a child with `NOTIFY_SOCKET` so the app has its own
  watchdog. It waits, then exits; systemd runs `ExecStopPost`.
- `lease restore` is the single restore routine, reached from every exit (section 3.3).
- If several apps ever need to negotiate the panel, the same binary can sit behind a runtime socket unit in
  `/run/systemd/system` (tmpfs: gone at reboot, so still tethered). Not needed for one fullscreen owner.

### 3.2 Stopping and starting xochitl without ever reaching StartLimit

Facts: `StartLimitIntervalSec`/`StartLimitBurst` "apply to all kinds of starts (including manual)". "systemctl
reset-failed will cause the restart rate counter for a service to be flushed". `StartLimitAction` defaults to none, and
`OnFailure=` units run "when this unit enters the failed state"
([systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)). The stock xochitl unit has
`StartLimitBurst=4` per 600 s and `WatchdogSec=60`, and a start-limit hit led to `rm-emergency.sh` and a reboot
(repository incident). Boot counts as one start, so a careless takeover loop has three in ten minutes.

Rules (the lease enforces them; they are also the test oracle in section 8):

1. **Read the unit, never change it.** At the first launch of a boot, record `systemctl show xochitl -p StartLimitBurst
   -p StartLimitIntervalUSec -p WatchdogUSec -p OnFailure -p NRestarts -p Result` in `/run/zinc-lease/state`. Refuse to
   run if the values differ from the table row for this model (an OS update changed the policy: re-verify first). No
   drop-ins, no `mask` (Quill found that the daemon-reload it causes kills dropbear SSH sessions), no `WatchdogSec=0`.
2. **Our budget is stricter than systemd's.** At most 2 xochitl starts by us in any 10 minutes, at most 6 per hour, and
   at least 60 s between the restore of one lease and the stop of the next. The log lives in `/run/zinc-lease/starts`
   (reset at boot, like systemd's counters). A refused launch says why and when the next one is allowed.
3. **Only stop a healthy xochitl.** It must be `ActiveState=active`, `Result=success`, active for at least 30 s, with
   `NRestarts` unchanged since the last lease. A xochitl that restarted on its own is in trouble, and the lease stays out
   of the way.
4. **`systemctl stop`, never a signal of our own.** SIGTERM through systemd gives xochitl its stop timeout to save the
   open document. Never `kill -9`, never SIGSTOP, never `systemctl kill`.
5. **`reset-failed` only for our own clean cycle.** Right before the restore's `systemctl start xochitl`, and only if
   xochitl's last stop was ours and ended with `Result=success`, run `systemctl reset-failed xochitl`. Our cycles then
   never consume the burst, while xochitl's own crashes still count. Never call it after xochitl failed by itself.
6. **Make the start unable to fail because of us.** Before `start`: the app's cgroup is empty (`systemctl show
   zinc-lease -p ControlGroup` and `cgroup.procs`), no live PID owns `/tmp/epframebuffer.lock` (clear it only when its
   owner is dead and named xochitl or the app, as `launch.sh` does), and the DRM device has no other opener
   (`/proc/*/fd`).
7. **One start, no loop.** If `systemctl start xochitl` fails, do not retry, except once after 10 s when the failure was
   "display busy" (rule 6 raced). Keep the wakelock and write the reason to the journal and `/run/zinc-lease/last`. A
   loop cannot do better than the stock `rm-emergency.sh`, and a loop is what reaches it.

### 3.3 Every way out ends in the same restore

| Exit | Who notices | Path |
|---|---|---|
| App quits | `lease session` (child exit) | session exits 0 → `ExecStopPost` |
| App crashes | `lease session` | same |
| App hangs | systemd: the app sends `WATCHDOG=1` every frame through `NOTIFY_SOCKET`, `WatchdogSec=10` set on the transient unit with `NotifyAccess=all` | unit killed → `ExecStopPost` |
| Lease too long (dead-man) | systemd `RuntimeMaxSec` (manifest value, default 30 min, capped at 2 h) | `ExecStopPost` |
| Power button long press (2 s) or five-finger tap | `lease session`; the app never grabs the power key in this mode | SIGTERM to the app, 3 s grace, then the unit's stop |
| Supervisor dies | systemd (main process gone) | `KillMode=control-group` kills the app → `ExecStopPost` |
| SSH, `zinc device stop` | `systemctl stop zinc-lease` | `ExecStopPost` |
| Suspend attempt | prevented: the lease holds `/sys/power/wake_lock` for the whole session (Quill's incident: autosleep, then resume started a second xochitl) | n/a |

`lease restore`: wait for the cgroup to be empty → rule 6 → rule 5 → `systemctl start xochitl` → wait up to 30 s for
`active` → release the wakelock → append the timings (stop, start, active) to `/run/zinc-lease/starts`.

### 3.4 Costs

- **Return time.** One xochitl start. The journal says about 1 s to `active` (quill-test); the time to a usable home
  screen or notebook is not measured (section 9 measures it). The UI must say "returning to the notebook".
- **State.** xochitl saves on SIGTERM, so strokes are kept. The view (open notebook, page, zoom, toolbar) is lost unless
  xochitl reopens the last document after a restart (to check on the tablet). Notifications and sync pause during the
  session.
- **Ink.** The best that exists: Quill's direct mono swaps. Colour settle is a colour partial swap of the stroke's box
  (Quill: `Color` content, mode 4).

| | rM2 | Paper Pro | Move | Pure |
|---|---|---|---|---|
| Engine for the app | rm2fb (timower swtcon mode) if installed; no takeover engine of our own | Quill-style `dlopen` of the device's `libqsgepaper.so` | same, new hash row | same, new hash row, mono only |
| Ink latency | rm2fb DU | Quill mono mode 0 ("excellent", not yet measured with a camera) | expected as Paper Pro | expected close to reMarkable's 21 ms claim |
| Return | xochitl restart, or `rm2fbctl switch` | xochitl restart (~1 s to active, UI time to measure) | same | same |
| Risk | low (rm2fb owns the panel) | supervised; the known failure modes are covered by rules 1-7 and section 3.3 | same | same |
| OS update | rm2fb support per OS | hash gate refuses; the app runs on L0 qtfb with a message | same | same |

## 4. Option 3: in-process done right (the ink lane)

### 4.1 Why qtfb is slow, and what upstream has done since

AppLoad's qtfb draws the client's shared memory in `FBController::paint()`, a `QQuickPaintedItem`. Every client update
goes through `update(rect)`, then the next scene-graph frame, then a QPainter `drawImage`, then xochitl's `EPRenderLoop`,
then `swapBuffers` with the screen mode that AppLoad's QMLDiff patch binds to the item
([appload.qmd](https://github.com/asivery/rm-appload/blob/master/xovi/template/appload.qmd): `[windowCanvas.refreshMode]`,
and `onRequestFullRefresh` calls a hashed xochitl function). A mode change sleeps 1 s in the server thread
(`safetyWaitForEventLoopToCatchUp`, [fbmanagement.cpp](https://github.com/asivery/rm-appload/blob/master/src/qtfb/fbmanagement.cpp)).

Up to v0.5.3, `markedUpdate()` computed `(rect.x() / image->width()) * this->width()` in integer arithmetic, so every
partial rectangle collapsed to a null `QRect`, which means "repaint the whole item"
([v0.5.3 FBController.cpp](https://github.com/asivery/rm-appload/blob/v0.5.3/src/qtfb/FBController.cpp)). PRs
[#63](https://github.com/asivery/rm-appload/pull/63) and [#64](https://github.com/asivery/rm-appload/pull/64) reported
this ("sustained handwriting stops lagging behind the pen", rM2 3.27.3 and 3.28.0.162). The fix shipped through
[#55](https://github.com/asivery/rm-appload/pull/55) (merged 2026-08-14, in v0.6.0 of 2026-09-19); today's
`convertQTFBRectToScreen` multiplies first. Our measurement of 2026-09-29 (7-8 paints/s while the app sent ~100 small
rectangles/s, median 63 px each) matches full-screen repaints of 1620x2160. The AppLoad version on the tablet was not
recorded. **qtfb must be measured again with AppLoad ≥ 0.6.0 before anything else** (section 9, step 1).

There is no upstream fast-swap mode. The closest attempt, [#61](https://github.com/asivery/rm-appload/pull/61)
"fast eink + marker access" (an `InkCanvas` QML item), was closed: the maintainer wants such things in a separate
project. epfb-re is a standalone engine wrapper (`createControlledInstance`, `getAuxFramebuffer`) for a process that
owns the engine, i.e. a takeover; it is not an in-process hook.

### 4.2 Why our bridge most probably did not load

`integrations/remarkable-ink/bridge.xovi` declares `import?` and `override` on four symbols. Three of them live in
`libqsgepaper.so` (`EPRenderLoop::handleUpdateRequest` and both `EPFramebuffer::swapBuffers`). In XOVI,
`import? x` means `condition x` plus `import x` ([README](https://github.com/asivery/xovi/blob/master/README.MD)).
Conditions are checked in pass 2a with `dlsym(RTLD_DEFAULT)`, then `RTLD_NEXT`
([dynamiclinker.c](https://github.com/asivery/xovi/blob/master/src/dynamiclinker.c)), all inside XOVI's
`__attribute__((constructor))`, before xochitl's `main`. `libqsgepaper.so` is a Qt scene-graph plugin under
`/usr/lib/plugins/scenegraph/`, loaded by Qt with `dlopen` when the window is created. Unless xochitl also lists it as
`DT_NEEDED`, the condition fails and XOVI logs "Pass 2a: Condition not met for zinc-ink. Unloading...". The extension
then disappears without an error that anyone looks for. This is the most likely cause; it can be checked off the
device with `readelf -d` on xochitl taken from the firmware image (`codexctl` downloads it).

Two more ways the same file could have hurt, both now known from XOVI's source:

- XOVI calls `exit(1)` when two extensions hook the same function, and when it cannot place a trampoline. The bridge
  overrides the `QImage` external-memory constructor, which `framebuffer-spy` also overrides. With both installed,
  xochitl exits at every start, and every restart burns the start budget: a restart storm by construction.
- `_xovi_shouldLoad()` reads and hashes 1+ MB with `QFile` inside the preload constructor. It works, but it is slow and
  runs before Qt is initialised.

### 4.3 The ink lane: one engine, rendering blocked only while the pen is down

The idea is simple: **write the same pixels the scene graph would write, but sooner, and let the scene graph repaint
them afterwards.** Nothing then needs to be restored, overlays heal themselves, and the colour settle comes for free.

1. **Where it lives.** A XOVI extension, `zinc-ink` v2 in `integrations/remarkable-ink/`, separate from AppLoad as the
   maintainer asked. It overrides no `libqsgepaper` symbol and no `QImage` constructor. It imports
   `framebuffer-spy$getFramebufferConfig` (address, width, height, stride, format of xochitl's buffer; it already knows
   the Paper Pro, Move and rM2 geometries). Vendor symbols are resolved with `dlsym` **at run time**, on the GUI thread,
   after the first frame (from a single-shot `QTimer` armed by a hook on a Qt6Gui/Qt6Quick function that is always
   loaded). An extension that finds nothing does nothing.
2. **Gate (fail closed, silently).** Model codename from `/sys/devices/soc0/machine`. SHA-256 of `libqsgepaper.so` in the
   table (computed once per boot from a file in `/run`, not in the constructor). Every needed symbol present.
   framebuffer-spy present and its geometry equal to the row's. Any miss: the lane stays off for this boot, and apps
   use qtfb.
3. **Grant.** The lane accepts one client (root, `SO_PEERCRED`), and only when the AppLoad window for that app is
   fullscreen, unrotated, unscaled (1:1), with its top bar hidden. The client is the same process that holds the qtfb
   connection, checked by PID through AppLoad's `QTFB_KEY` child. Input already flows through AppLoad's item, so xochitl
   does not draw native ink underneath (the problem `rmpp-coexistence` raised).
4. **Pen down.** The client sends "stroke begin". The lane calls `EPRenderLoop::blockRendering("zinc-ink")` on the GUI
   thread and arms a deadline (500 ms after the last sample, 10 s per stroke at most). For each segment, the client
   writes the pixels into its qtfb shared memory (as today) and sends `Ink(rect)`. The lane copies that rectangle from
   the qtfb buffer into the vendor buffer and calls the Pen/Mono partial swap for the row's ABI, on the GUI thread.
   With rendering blocked the GUI thread is idle, so dispatch costs well under a millisecond (to measure). There is one
   writer and one engine; the vendor threads keep running as usual.
5. **Pen up.** The client sends "stroke end". The lane calls `unblockRendering` and then `update(rect)` on the
   `FBController` for the stroke's box. The scene graph repaints the box with the item's normal mode (UI, colour) and
   with every overlay above it, which is the colour settle. The app keeps qtfb in UI mode the whole time, so the 1 s
   mode-change sleep never happens.
6. **Failure.** Disconnect, a missed deadline, any swap error, the window leaving fullscreen, a rotation, the sleep
   screen or the power key: unblock, `update()` the whole item, request one full refresh, and turn the lane off for
   the rest of the session. The client sees EOF and keeps drawing through plain qtfb. Nothing restarts.
7. **Crash guard.** The extension runs inside xochitl, so a crash in it is a xochitl crash. The constructor writes
   `/run/zinc-ink/armed`; 60 s of healthy running clears it. If the constructor finds a leftover mark (xochitl died
   while the lane was armed), it refuses to load for the rest of the boot and writes why. The worst case is one xochitl
   restart per boot, far under the burst. XOVI itself is tethered (started by `xovi/start`, not at boot), so a reboot
   clears everything.

**Open questions only the tablet can answer.**

- Does the engine refresh a box whose pixels equal what it last swapped, when the mode changes from Pen to UI? If it
  diffs against its previous buffer and skips equal pixels, the settle shows no colour. In that case the settle sends
  the box with the full-update flag on that rectangle, or uses Quill's two-step colour swap. Test T4 in section 9.
- Is `EPRenderLoop::blockRendering` reentrant, and does it also hold back xochitl's own background swaps? The 3.27
  disassembly shows the check before polish, sync and render only. The lane counts foreign swaps in debug builds only,
  through a probe extension that is never installed with the lane.
- Thread safety of `swapBuffers` from the GUI thread while the vendor's update thread runs. Quill calls it from its main
  thread with the same threads alive, so this is likely fine.

| | rM2 | Paper Pro | Move | Pure |
|---|---|---|---|---|
| Available | no: SWTCON is static in xochitl, no exported symbols; rm2fb is the rM2 equivalent | yes, per hash row | yes, after a hash row | yes, after a hash row (Pen/Mono only) |
| Ink latency | n/a | engine Pen swap + one socket hop + GUI-thread dispatch: expected close to takeover (to measure) | same | same |
| Return | n/a | instant (the app was never outside xochitl) | same | same |
| State lost | none | none | none | none |
| Risk | n/a | a bug crashes xochitl at most once per boot (crash guard); no restart storm (no load-time hooks, no double hooks) | same | same |
| OS update | n/a | hash miss or symbol miss → lane off → qtfb, with the message "fast ink not verified for this OS yet" | same | same |

## 5. Option 4: the official route

- Developer mode gives root SSH over USB and the SDK per OS version; enabling it wipes the tablet
  ([developer mode](https://developer.remarkable.com/documentation/developer-mode)).
- The only documented display path for third parties is the Qt `epaper` platform plugin with xochitl stopped: "Stop the
  remarkable main application, launch your application and finally start the main application again"
  (`systemctl stop xochitl`, `QT_QUICK_BACKEND=epaper`, `-platform epaper`). Only pure Qt Quick is supported, and
  "handling the marker is more involved and not shown here"
  ([qt_epaper](https://developer.remarkable.com/documentation/qt_epaper)). Screen modes, partial updates and ink are not
  documented.
- No public page offers a fast-ink API, an app store or ABI stability. The official way is therefore **itself a
  takeover**, without the waveform control that drawing needs. The lease of section 3 is the official lifecycle (stop,
  run, start) made safe; Zinc draws its own pixels, so the Qt plugin brings nothing over the vendor engine.

## 6. Scores (RULES.md §4)

Weights: fit x3, performance x3, size x2, maintainability x2, licence/supply risk x2 (here also risk to the tablet),
portability x1, effort x1. Maximum 70.

| Option | Fit | Perf | Size | Maint | Risk | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| L0 qtfb, AppLoad ≥ 0.6 | 3 | 2 (unmeasured since the fix) | 5 | 5 | 5 | 5 (all four models) | 5 | **55** |
| L2 supervised takeover (lease) | 4 (restart, view lost) | 5 | 4 | 3 (hash row per OS) | 3 | 3 | 4 (quill-test exists) | **54** |
| L1 in-process ink lane | 5 (instant return, nothing lost, settle for free) | 4 (expected) | 5 | 2 (XOVI, vendor symbols, AppLoad window state) | 3 (crash guard) | 3 (Paper Pro family) | 2 | **52** |
| Oxide blight as display server | 3 (replaces the launcher, xochitl behind a shim) | 4 | 2 | 3 | 3 | 5 | 3 | 45 |
| Official Qt epaper QPA | 2 | 3 | 3 | 4 | 4 | 4 | 2 | 43 |
| Freeze xochitl | 1 (no panel on the Paper Pro family) | 5 | 4 | 1 | 1 | 2 | 2 | 34 |

The three top scores are within 3 points and cover different needs, so the choice is a stack, not one option. qtfb is
the base every app has. The lane is the bridge the owner asked for (fast ink, instant clean return), but it is
unproven. The lease is proven and is what a long drawing session or an unverified-but-known OS falls back to. Freezing
and the Qt QPA are rejected; blight is used only if the person already runs Oxide (detected, never installed by us).

## 7. The layered design

```
app start (AppLoad tile, qtfb: true)
  └─ display-rmpp init
       ├─ L1 lane: /run/zinc-ink.sock answers Hello with the row's hash → ink lane on, qtfb in UI mode
       ├─ else, if the manifest says "ink": "session" and the lease preflight passes → re-exec through `lease launch`
       │     (the AppLoad window closes; the app comes back in L2 with xochitl stopped)
       └─ else L0 qtfb (fast mono mode if "ink" was asked, UI otherwise), one line on stderr and in the app's status
```

- The app never chooses between L1 and L2 when both work: L1 is preferred because nothing is lost. An app may declare
  `"display": {"ink": "native" | "session" | "qtfb"}`. `native` means L1, else L0. `session` means L1, else L2, else L0
  (for an app that is used for long periods and accepts the restart cost).
- The same `zinc:ink` live layer (remarkable-apps-design §3.4) feeds all three: in L1 it sends `Ink(rect)` to the lane,
  in L2 it calls the engine shim, in L0 it sends qtfb updates. The program's frame draws identical pixels in every case.
- Downgrade on any error is one way during a session (L1 → L0, never L0 → L2 in the middle of work).

### 7.1 Safety rules, all in one place

1. Never restart xochitl more than 2 times in 10 minutes or 6 times per hour from Zinc code (lease budget, logged in
   `/run/zinc-lease/starts`). The in-process lane never restarts xochitl.
2. Never freeze, SIGSTOP or `kill` xochitl; never mask, edit or override its unit; never set `WatchdogSec=0`.
3. Never run two vendor engines: the lease checks lock, DRM openers and the cgroup before both stop and start.
4. `reset-failed xochitl` only right after our own clean stop, never after its own failure.
5. A dead-man on every lease: `RuntimeMaxSec`, an app watchdog (`WatchdogSec=10`), and the power-key escape owned by
   the supervisor.
6. Every failure leaves xochitl running. The lease refuses to stop xochitl unless every restore precondition can be
   checked first, and restores exactly once. The lane never takes xochitl down: one crash per boot at most, then it
   disarms itself.
7. No load-time XOVI conditions or overrides on `libqsgepaper`, and no override of a symbol another installed
   extension hooks (the installer checks `extensions.d`). Vendor symbols are resolved at run time.
8. Hash-gated everywhere: an unknown `libqsgepaper.so` hash means L0 only, with a message. A new OS is one table row
   after a tablet test, not a new build.
9. Hold a wakelock whenever xochitl is stopped.
10. Diagnosis on the tablet never repeats xochitl restarts: one load test (one `xovi/start`), then read the journal.

## 8. Files to touch, and what the Mac can prove

| File | Change |
|---|---|
| `plugins/display-rmpp/rmpp.cpp` | becomes the backend selector (L1 → L2 → L0) and keeps the qtfb backend body |
| `plugins/display-rmpp/direct.h` | replaced by `lane.h`: client of the lane (Hello with hash, stroke begin/end, `Ink(rect)` read from the qtfb shared memory; no pixel copy over the socket, unlike today's 16-row packets) |
| `plugins/display-rmpp/native.h` (new) | L2: Quill-style engine shim (`dlopen` of the device library, ABI row per hash, mono and colour partial swaps), `WATCHDOG=1` per frame |
| `plugins/display-rmpp/models.h` (new) | rows: codename, geometry, stride, input ranges, vendor hash → swap symbol and mode mapping, xochitl unit limits expected |
| `plugins/display-rmpp/input.h` | do not grab the power key under a lease (the supervisor owns it) |
| `plugins/display-rmpp/plugin.json` | option `ink`: `qtfb` / `native` / `session` (replaces `direct`) |
| `integrations/remarkable-ink/bridge.cpp`, `bridge.xovi`, `protocol.h` | v2 lane: no libqsgepaper overrides, `framebuffer-spy$getFramebufferConfig` import, run-time `dlsym`, block per stroke with deadline, `update(rect)` settle, crash guard, protocol version 2 |
| `integrations/remarkable-ink/lease.c` (new) + `rollback.sh` (removed) | the lease supervisor (launch / session / restore) replacing `examples/remarkable/quill-test/launch.sh`; the old rollback timer restarted xochitl on its own and goes |
| `examples/remarkable/quill-test/launch.sh` | three lines calling `lease` |
| `src/cli_core.cpp` (export `--target rmpp`) | AppLoad manifest: `qtfb: true` for L0/L1; for `session`, `application` points at `lease launch` |
| `docs/targets/remarkable-paper-pro.md` | the three layers, the rules, the recovery commands |
| `tests/native/rmpp/`, `tests/t1/` | the two harnesses below; `tests/affected.json` mappings |

Note: `examples/remarkable/quill-test/README.md` cites `tests/rmpp/quill-launch.py`, which went away with the prototype
(`18501e50`); the lease harness below replaces it.

**Proven on the Mac:**

- **Fake systemd for the lease** (`tests/native/rmpp/lease-sim`, T1): `PATH` shims for `systemctl` and `systemd-run`
  backed by a small model of the unit state machine. The model covers start-rate limiting with the stock 4/600 s
  values, `reset-failed`, `Result`, `NRestarts`, `OnFailure` recorded as "reboot", the watchdog and `RuntimeMaxSec`.
  A scripted sequence of launches, app crashes, hangs, power-key presses, supervisor kills and failed starts must end
  with xochitl active, no "reboot", at most 2 of our starts in any 600 s, and every refusal explained. The same model
  shows why freezing fails (watchdog kill at 60 s with systemd < 258).
- **Fake xochitl for the lane** (Docker `linux/arm64` with the existing `zinc/sdk-rmpp` image): a tiny Qt6 program and a
  stub `libqsgepaper.so` with the same exported names that records `swapBuffers`, `blockRendering` and
  `unblockRendering`, run with `LD_PRELOAD=xovi.so`, framebuffer-spy and the lane in `extensions.d`. It proves that the
  extension loads when the plugin is `dlopen`ed late (the 4.2 failure), block/unblock pairing, deadlines, the settle
  `update()`, the crash guard (kill the fake mid-stroke, restart: refused), refusal on a double hook, and the hash
  gate. By hand when Docker is available, not in a tier.
- **The driver** against the existing fake qtfb (`tests/t1/rmpp_sim.sh`) plus a fake lane socket: the backend choice
  and the downgrade from L1 to L0 on EOF.
- Not provable on the Mac: real latency, the engine's behaviour on equal pixels, xochitl's return time.

## 9. Test plan on the tablet

One device per model when available; Paper Pro first. Before anything: read-only `systemctl cat xochitl rm-emergency`,
`systemctl --version`, `ls /home/root/xovi/extensions.d`, the AppLoad version, and the hash of `libqsgepaper.so`.

**Camera.** A phone at 240 fps, pointed at the pen tip, with the screen and a timestamped reference (xochitl drawing the
same line) in the frame. Report the pen-touch-to-first-pixel delay and the tip-to-tail distance on a fast stroke, as
medians over 20 strokes. Compare: xochitl's own pen, L0, L1, L2.

1. **T1 qtfb again** (no restart at all): AppLoad ≥ 0.6.0, Notes in FAST and in UI. Log the qtfb update rate, the
   `FB Repaint` rate and the median paint interval (the 2026-09-29 counters), plus the camera numbers. If L0 is close
   to xochitl here, L1 shrinks to a refinement.
2. **T2 lane load** (one `xovi/start`, then wait): the journal must show the lane armed or refused for a named reason,
   and `/run/zinc-ink/armed` cleared after 60 s. One attempt per 10 minutes at most.
3. **T3 lane ink**: Notes on L1; camera vs xochitl; xochitl PID unchanged across 20 open/close cycles; no strokes landing
   in the native notebook.
4. **T4 colour settle**: a red stroke on L1, a photo 1 s after pen-up; if no colour, retry with the full-update flag on
   the box (log which one works for that hash).
5. **T5 lease cycles**: 10 launches and returns of L2 spaced by the budget. Log stop→inactive, start→active and
   start→first usable frame of xochitl (camera), and whether the last notebook reopens. `journalctl -u xochitl` must
   show no `start-limit-hit` and `NRestarts` must not move.
6. **T6 failure paths**: app SIGKILL, app hang (watchdog), power long press, `systemctl stop zinc-lease`, and the
   dead-man at a 2-minute `RuntimeMaxSec`. Each must return to xochitl once. Plus a launch refused inside the budget.

What to log for every run: OS version, model, AppLoad and XOVI versions, vendor hash, layer used and why, the lease's
`/run/zinc-lease/starts` and `last`, `systemctl show xochitl -p NRestarts -p Result`, and the camera file names. The
numbers go to `docs/reports/zinc-next-perf.md`.

## 10. For backlog/later.md (the backlog is frozen)

- Re-measure qtfb with AppLoad ≥ 0.6.0 on the Paper Pro (the partial-update bug may explain the 125 ms paints).
- Lease supervisor replacing `quill-test/launch.sh`, with the fake-systemd harness.
- Ink lane v2 (no load-time libqsgepaper hooks, framebuffer-spy import, crash guard) with the Docker fake-xochitl
  harness.
- Hash rows for the Move and the Pure; rM2 through rm2fb (timower) instead of a bridge of our own.

## 11. Tablet results, 2026-10-25 (Paper Pro, OS 3.27.3.0, AppLoad of August, before 0.6.0)

- L0 qtfb, Notes in Fast drawing: the app sends an update every 22.6 ms (median), AppLoad repaints every 89.3 ms (median, 32
  intervals): the owner finds it lagging behind the pen. Its buttons react to neither pen nor finger (bug, being fixed).
- Lease + Quill (`quill-test`, two runs 46 min apart): xochitl stopped through systemd, scribble drew, the 180 s dead-man ended
  it and xochitl came back once each time (`NRestarts=0`, no start-limit hit). The owner: "très bon touché", the feel of the
  native app. scribble opens `/dev/input/event0` itself; Zinc apps leave it to the supervisor.
- Notes on L2 (lease + Quill, `"ink": "session"`): drawn by Quill 3.3 s after launch, "super fluide" (owner). Save & quit ended it
  (status 0) and a 2 s power press ended another session ("power key long press: ending notes"); xochitl came back once each
  time, `NRestarts=0`, the unit deactivated cleanly.
- Ink lane v2 (zinc-ink, protocol 2), one `xovi/start` at 18:53: XOVI loaded it, every gate passed (model row, framebuffer-spy
  geometry, vendor hash), then it stayed off: "libqsgepaper is not loaded". On OS 3.27.3.0 xochitl never maps
  `/usr/lib/plugins/scenegraph/libqsgepaper.so`: its platform plugin is `plugins/platforms/libepaper.so` (no EPFramebuffer symbol)
  and the engine is linked into the stripped `/usr/bin/xochitl` (the EPFramebuffer strings are there, no exported symbols). The
  design's assumption (§4.3: the engine is a dlopen'ed plugin whose symbols dlsym finds) holds for a separate process like Quill's,
  not inside xochitl, which also explains why the first bridge never loaded. xochitl came back once, `NRestarts=0`; the lane was
  removed from extensions.d afterwards (framebuffer-spy stays). An in-xochitl lane needs the engine's addresses in xochitl's own
  binary, per OS hash (the way rm2fb and qt-resource-rebuilder's hashtable work): a research item, not a fix.
