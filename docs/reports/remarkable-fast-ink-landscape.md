# Fast pen ink for third-party apps on the reMarkable Paper Pro line: the landscape

Date: 2026-10-25. Web and source research only. No device access, no build, and no other file changed.
This report follows `docs/reports/remarkable-bridge-design.md`, especially §11. On 2026-10-25 the Paper Pro ran OS
3.27.3.0. Lease + Quill gave "super fluide" ink, at the cost of one xochitl restart. AppLoad's qtfb (an August build,
before 0.6.0) repainted every 89 ms. The in-xochitl lane failed because the engine is statically linked into the
stripped `/usr/bin/xochitl`.

Method: I read the code and history of every relevant GitHub project through `gh` (clones in the session
scratchpad), plus the reMarkable developer site, the Vellum package index, awesome-reMarkable, rm-hacks-qmd and the
community QMD repos. Web search found nothing useful on Reddit or Hacker News for these terms. Discord is not
reachable from here. Dates are the last push or commit seen today unless noted.

## 0. Short answer

- **Nobody publishes a direct engine hook inside xochitl on the Paper Pro except Oxide.** Oxide's `libblight_client`
  (MIT, Eeems-Org, active 2026-10-12) finds xochitl's statically linked `EPFramebuffer` at run time with no per-OS
  address table. It catches Qt's exported `QImage()` default constructor and subtracts known member offsets to get a
  candidate object. It then reads that object's vtable, checks the `swapBuffers(QRegion, …)` entry (vtable slot 23)
  against an aarch64 prologue pattern, and patches it. It works on rMPP, rMPPM and rMPPure under OS 3.2x. **This is
  the technique our failed lane was missing** (§2.3).
- **There is a fully supported in-xochitl fast path that needs no addresses at all:** a `QQuickPaintedItem`
  inside xochitl, under xochitl's own QML `ScreenModeItem` set to *Pen* mode (`import xofm.libs.epaper`), with small
  `update(rect)` calls. The scene graph then swaps only that small rectangle with the handwriting waveform. This is
  how AppLoad PR #61 ("InkCanvas", closed 2026-07) worked. qtfb's `UFAST` refresh mode drives the same machinery
  through AppLoad's QMD binding.
- **Our 89 ms qtfb number is almost certainly the integer-division bug, made worse by the wrong mode.** AppLoad
  0.6.0 (2026-09-19) fixed partial updates. But Vellum packages 0.6.0 only for **OS ≥ 3.28 and < 3.30**, and 0.5.3
  (with the bug) is the last build for 3.26–3.27. Zinc's `display-rmpp` also asks for `MODE_FAST = 1`, never
  `UFAST = 0`. An AppLoad reviewer advises "ufast mode for pens, it's much faster" (PR #78).
- **No project restarts xochitl and brings back the open notebook automatically**, and no official API does it
  either. rm-hacks-qmd shows that xochitl's QML can reopen a document by id and page. A small QMD patch could
  therefore shrink the lease's cost (§3.3).
- **There is no official route.** reMarkable's developer site documents only the SDK, developer mode, and Qt Quick
  apps with xochitl *stopped*. It has no pen API, no app platform and no ABI promise.
- **Recommendation (§6):** (1) fix qtfb (0.6.0, or 0.5.3 plus the one-line fix) and use UFAST, then measure; (2) if
  that is not enough, write our own XOVI extension with an in-xochitl Pen-mode `QQuickPaintedItem` fed from the
  qtfb shared memory; (3) only then, Oxide-style vtable discovery for direct `swapBuffers`. Keep the lease (L2) as the
  proven fallback, and add a "reopen last document" QMD patch.

## 1. Fast ink from another app while xochitl keeps running

| Project | Maintainer, last activity | Models / OS | How it works | Licence | xochitl running? | Latency known |
|---|---|---|---|---|---|---|
| [AppLoad / qtfb](https://github.com/asivery/rm-appload) | asivery; v0.6.0 2026-09-19, last commit 2026-10-06 | rM1, rM2, rMPP, rMPPM, rMPPure; 0.6.0 for 3.28–3.29 ([Vellum VELBUILD](https://github.com/vellum-dev/vellum/blob/main/packages/appload/VELBUILD)), 0.5.3 for 3.26–3.27 | XOVI extension. The client writes to shm. `FBController` (`QQuickPaintedItem`) calls `update(rect)`. A QMD patch binds the item's xochitl screen mode to `refreshMode` (UFAST 0, FAST 1, ANIMATE 2, CONTENT 3, UI 4) | GPL-3.0 | yes | none published; rM2 reports "native-feeling" with the fix ([#64](https://github.com/asivery/rm-appload/pull/64), [#66](https://github.com/asivery/rm-appload/pull/66): "good at a 35 ms update cadence"); ours: 89 ms before the fix |
| [AppLoad PR #61 "fast eink + marker access"](https://github.com/asivery/rm-appload/pull/61) | declan-wtg, closed 2026-07 (maintainer: "should be a separate project") | rMPP (3.2x) | `InkCanvas : QQuickPaintedItem` registered in xochitl's QML, per-segment `update(smallRect)`, paired with `ScreenModeItem` in Pen mode from `xofm.libs.epaper`; `MarkerInput` reads the marker evdev directly | AppLoad's (GPL-3.0) | yes | author: "pretty smooth sailing… I think the lag is still there"; not measured |
| [Oxide libblight_client](https://github.com/Eeems-Org/oxide/blob/master/shared/libblight_client/qt.cpp) | Eeems; 3.1.2 2026-08-13, commits to 2026-10-12 | rMPP, rMPPM, rMPPure (Qt6 port [#418](https://github.com/Eeems-Org/oxide/pull/418)), rM1/rM2 | `LD_PRELOAD` into xochitl. It finds the static `EPFramebuffer` through vtable discovery (§2.3), hooks `swapBuffers(QRegion, modeMap, flags)` and forwards each rectangle and waveform to the blight display server | MIT | yes, but as a *client* of blight, which owns the panel (§3.1) | none published |
| [framebuffer-spy](https://github.com/asivery/rm-xovi-extensions/tree/master/framebuffer-spy) | asivery; repo 2026-09-08 | rM1, rM2, rMPP, rMPPM | Overrides the external-memory `QImage` constructor and records the 1620×2160/6528 (rMPP) or 960×1696/3840 (rMPPM) buffer. Read-only info: no swap | GPL-3.0 | yes | n/a |
| [qt-resource-rebuilder + qmldiff](https://github.com/asivery/rm-xovi-extensions/tree/master/qt-resource-rebuilder) | asivery; qmldiff 2026-09-17 | all, per OS | Rewrites xochitl's QML at load time. The per-OS "hashtab" maps hashed **QML** names, not native addresses (`rebuild_hashtable` after each OS update) | GPL-3.0 | yes | n/a |
| [delayStrokeScreenRefresh.qmd](https://github.com/ingatellent/xovi-qmd-extensions) | ingatellent; files 3.18–3.29 | rMPP | Changes one QML timer in xochitl so the colour settle after a stroke waits 10 s | GPL-2.0 | yes | evidence that xochitl's own ink is "mono fast, colour later", driven from QML |
| [qtfblight](https://github.com/NoaHimesaka1873/qtfblight) | Noa Himesaka; 2026-09-16 | aarch64 + armv7 | qtfb server on Oxide's blight instead of AppLoad | GPL-3.0 | only under Oxide | none |

Notes on qtfb in 0.6.0 (read from source, 2026-10-25):

- The bug fix: `markedUpdate` now scales in floating point (`convertQTFBRectToScreen`, through
  [#55](https://github.com/asivery/rm-appload/pull/55), merged 2026-08-14; the commit "Fix framebuffer update coordinate
  calculation" is from 2026-09-19).
- `FBController::paint()` still calls `drawImage(rect, *image, image->rect())` on the whole image. PR #64 ("repaint
  only the dirty region") was closed unmerged, so the cost per update depends on Qt clipping the painter to the dirty
  rectangle. This is likely fine, but not measured.
- `MESSAGE_SET_REFRESH_MODE` still runs `safetyWaitForEventLoopToCatchUp()` (about 1 s) and accepts only 0–4. The
  3.29 support added a `SLEEP` mode (5), which is not settable through that message. The mapping of indices to
  xochitl's enum was flipped and then reverted ("Unflip refresh mode values", 2026-08-20, reverted 2026-09-02).
  Verify UFAST on the tablet instead of trusting the names.
- Input to a qtfb app goes from xochitl's Qt input through AppLoad's item, over a socket, to the client. PR #61's
  author found these mouse-style events too poor for ink and read the marker evdev directly. Our L0 path has the same
  hop.
- No changelog text, waveform documentation or latency figure is published for 0.6.0. The release body is empty.

Xochitl's own "pen APIs": none are documented. The `xofm.libs.epaper` QML module (`ScreenModeItem`, screen-mode
enum) is the only pen-related surface third parties use. It is internal and unversioned, and it is reached only
through QML injection.

## 2. How rm2fb finds the engine, and ports to the Paper Pro

### 2.1 ddvk/remarkable2-framebuffer (rM2, MIT, last push 2024-10-07)

Per-version **absolute addresses** of six functions in the xochitl binary: `update`, `create`, `wait`, `shutdown`,
`getInstance`, `notify`. These are hardcoded in `src/shared/config.cpp`, can be overridden by `rm2fb.conf` files,
and are found by hand from string anchors (for example `"Unable to complete update: invalid waveform ("`,
`"Unable to start generator thread\n"`) with a [tutorial](https://github.com/ddvk/remarkable2-framebuffer/tree/master/tutorial).
On an unknown version it fails closed with "Missing address for function […]".
([README](https://github.com/ddvk/remarkable2-framebuffer#configuration))

### 2.2 timower/rM2-stuff rm2fb (rM2 only, GPL-3.0, last commit 2026-08-19)

It reads xochitl's GNU build-id at a fixed file offset (`0x10180`) and picks an address table by build-id
(`Versions/Version.cpp`: 2.15.1 to 3.23.0.64). It hooks with frida-gum (`gum_interceptor_replace`, plus an inline
patch for inlined callers) and redirects xochitl's `malloc`/`calloc` of the exact framebuffer sizes into shared
memory. The newer **swtcon mode** avoids address hooking altogether: the server drives the panel with timower's
reverse-engineered SWTCON (based on `libqsgepaper.so` 3.23.0.54), and xochitl keeps its own TCON. It is armv7 only,
"tested up to 3.28 beta". ([rm2fb README](https://github.com/timower/rM2-stuff/tree/master/libs/rm2fb))

### 2.3 The Paper Pro equivalent: Oxide's vtable discovery (MIT)

No "rmppfb"-style port of rm2fb exists. [xugro/rmpp-framebuffer](https://github.com/xugro/rmpp-framebuffer), last
push 2024-12-17, has no README. Oxide's client shim solves the same problem in a way that survives OS updates
([qt.cpp](https://github.com/Eeems-Org/oxide/blob/master/shared/libblight_client/qt.cpp), rMPP fixes in
[#459](https://github.com/Eeems-Org/oxide/pull/459) and [#460](https://github.com/Eeems-Org/oxide/pull/460), 2026-07-01/02):

1. It interposes `QImage::QImage()` (`_ZN6QImageC1Ev`, exported by Qt6Gui). For each default-constructed image, it
   treats `this - 0xa8` (frameBuffer member) and `this - 0x88` (previousBuffer, in xochitl, aarch64) as a candidate
   `EPFramebuffer`. It keeps the candidate if its first word is an aligned pointer that `dladdr` resolves. Outside
   xochitl it also requires that pointer to lie in `libqsgepaper.so`.
2. On each `QObject(QObject*)` constructor it checks the candidates: it reads vtable entry `0xb8` (slot 23,
   `swapBuffers(QRegion, …)`; on aarch64 this is really `backendUpdate`) and validates the prologue (`stp x29,x30`,
   or `paciasp` followed by `stp`/`sub sp`).
3. It inline-patches that function (`LDR X16,#8; BR X16; <addr>`) and patches vtable slots for
   `syncAfterUpdate` (0xc0), `ghostControl` (0xb0) and `qt_metacall` (0x10). `qt_metacall` is used to catch
   `scheduleGhostRemoval()` and `clearGhosting()` by name through `QMetaObject::indexOfMethod`.
4. The hooked `swapBuffers` walks the `QRegion` and a per-waveform region map (`slot_remap` at `regions + 6`), maps
   UltraFast/Fast/UI to mono and Animate/Content/Full to colour, and sends each rectangle to blight.
5. Everything can be overridden for a new OS through `OXIDE_EPFRAMEBUFFER_{SWAPBUFFERS,SYNCAFTERUPDATE,METACALLL,GHOSTCONTROL}_OFFSET`.
   [#462](https://github.com/Eeems-Org/oxide/issues/462) (rMPPure, 2026-07) shows that the method needs only
   occasional fixes.

The member offsets (0xa8/0x88/0xa0) and the vtable slots are the only per-build assumptions. Oxide's own
[`epframebuffer.h`](https://github.com/Eeems-Org/oxide/blob/master/shared/epaper/epframebuffer.h) and asivery's
[epfb-re](https://github.com/asivery/epfb-re) (GPL-3.0, "Finish 3.28 API implementation", 2026-09-01) document the
class layout and the `swapBuffers(QRect, EPContentType, EPScreenMode, flags)` ABI. epfb-re is for a separate
process that owns the engine (`createControlledInstance`), not an in-xochitl hook.

## 3. Switching between xochitl and other apps

### 3.1 Launchers and display servers

| Project | Paper Pro? | How it switches | xochitl state |
|---|---|---|---|
| [Oxide](https://github.com/Eeems-Org/oxide) 3.1.2 (MIT, 2026-08; Vellum `oxide`) | yes: rMPP, rMPPM, rMPPure badges, built per device | `launcherctl switch-launcher oxide` replaces xochitl's unit with tarnish. The blight display server owns `EPFramebuffer`. Every app, xochitl included, is a client through the preload shim. Background apps are paused (`launcherctl pause-app`/`resume-app`) | **kept**: xochitl is paused, not restarted. But [COMPATIBILITY.md](https://github.com/Eeems-Org/oxide/blob/master/COMPATIBILITY.md) still marks xochitl ✗ ("some UI display issues, drawing will not update the display"; possibly stale for the 3.x Qt6 port, whose PR fixed "high CPU when xochitl running on rMPP after drawing in notebook"). xochitl's own ink then pays an extra hop through blight |
| [remux](https://rmkit.dev/apps/remux), [draft](https://github.com/dixonary/draft-reMarkable) | no (rM1/rM2 era) | SIGSTOP/SIGCONT xochitl on top of rm2fb | kept on rM2 |
| rm2fb `rm2fbctl switch <pid>` (timower) | no | one display owner at a time | kept on rM2 |
| [KOReader](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_qtfb.lua) on rMPP | yes, as a **qtfb client inside AppLoad** (`framebuffer_qtfb.lua`, `input_qtfb.lua`) | AppLoad window | kept; a reader, not an ink app |
| [android-on-remarkable-paper-pro](https://github.com/MaximeRivest/android-on-remarkable-paper-pro) (2026-08-20) | rMPP, 3.27.x | QMD sidebar button, then a socket-activated unit stops xochitl; einkbridge draws through Quill; Airplane toggle returns | lost (stop/start) |
| [remagic](https://github.com/maximerivest/remagic) family (Quill, Riddle, Chromium) (MIT, 2026-07) | rMPP "Ferrari / Chiappa / Tatsu" | Quill apps: `scripts/takeover.sh` stops xochitl and always restores it. qtfb apps (Store, PaperTerm) run windowed | lost for takeover apps |

The rM2 trick (pause xochitl and let rm2fb own the panel) needs a separate display owner. On the Paper Pro only Oxide
provides one. This matches §0 of the bridge design: freezing works only under a separate display server.

### 3.2 Can xochitl be told to reopen the last document?

- **Command line, D-Bus, `xochitl.conf`:** reMarkable's [Xochitl page](https://developer.remarkable.com/documentation/xochitl)
  documents none of them. It says only that settings live in `~/.config/remarkable/xochitl.conf` and "change between
  versions", that documents live in `~/.local/share/remarkable/xochitl`, and that the folder "should not be accessed
  while xochitl is running". I found no "open last document on start" key.
- **USB web interface:** it lists, uploads and downloads documents. I found no "open" endpoint (not verified on 3.27).
- **QML:** [rm-hacks-qmd `last_document_gesture_hack.qmd`](https://github.com/asivery/rm-hacks-qmd) (0.0.11-pre4, for
  OS up to 3.24) adds `openLastDocument()`. It keeps the previous main and split document ids, calls
  `setLastOpenedPage(…)`, looks the document up by id and opens it. **So a QMD patch can reopen a given document and
  page.** A version for 3.27–3.29 would need its hashes rebuilt (`rebuild_hashtable`).

### 3.3 Making the lease cheaper

The lease could write `{documentId, page}` before stopping xochitl. A small QMD (ours, per OS) would read it once on
the next start, then delete it, and call the same open path as rm-hacks. The restart still costs about 1–3 s, but
the notebook view comes back. The risk is low: if the QML does not apply, nothing happens. `delayStrokeScreenRefresh`
and the AppLoad sidebar show that such patches survive OS updates when someone redoes the hashes.

## 4. Low-latency drawing apps on the Paper Pro, and numbers

| App | Path | xochitl | Measured latency |
|---|---|---|---|
| [Quill](https://github.com/MaximeRivest/quill) `scribble` (MIT, 2026-07-12) | takeover, `libqsgepaper` `EPFramebuffer`, Mono mode 0 partial swaps, raw evdev | stopped | not published ("lowest-latency third-party path short of reverse-engineering the FPGA transport"); owner: "super fluide" |
| [Riddle](https://github.com/MaximeRivest/riddle) (1.9k stars, 2026-07-12) | Quill takeover | stopped | press coverage gives about 0.9–1.1 s to the first *AI reply* ink, not pen latency ([letsdatascience](https://letsdatascience.com/news/developer-turns-remarkable-paper-pro-into-ai-diary-3f14b337)) |
| [badapple](https://github.com/MaximeRivest/badapple) | Quill, batched per-tile fast path | stopped | "max FPS"; no number found |
| AppLoad PR #61 InkCanvas | in-xochitl `QQuickPaintedItem` + Pen `ScreenModeItem` | running | "smooth" with a "lag still there"; no number |
| [inkwordle](https://github.com/Rkcr7/inkwordle), [inkwell](https://github.com/tduhamel42/inkwell), [sketch](https://github.com/maybejared/sketch) | AppLoad/qtfb apps (2026-07 to 09) | running | none |
| rmkit [harmony](https://rmkit.dev/apps/harmony), sketchy | rM1/rM2 framebuffer | n/a on rMPP | — |
| xochitl itself | in-process | — | reMarkable: 12 ms pen latency on the Paper Pro vs 22 ms on the rM2 (launch press, e.g. [Engadget](https://www.engadget.com/mobile/tablets/the-new-remarkable-paper-pro-adds-a-color-display-120059067.html)) |

I found no "inkbridge" for the reMarkable. [chiappa](https://github.com/gitman-101111/chiappa) (2026-10-19) is an
"e-ink bridge" (einkbridge, VKMS) for running another OS on the Move, with xochitl gone. No public project reports a
pen-to-glass latency in milliseconds for any third-party path on the Paper Pro.

## 5. Official routes

- The [developer site](https://developer.remarkable.com/documentation) has Software Stack, SDKs (one cross toolchain per
  product, x86_64 hosts), Developer Mode (factory reset), Recovery, Xochitl, and Writing Qt Quick Applications.
- The [qt_epaper page](https://developer.remarkable.com/documentation/qt_epaper) has you stop xochitl and run a pure Qt
  Quick app on the `epaper` platform plugin. Marker handling is "more involved and not shown here".
- xochitl is "required on startup when the device is encrypted, e.g. on reMarkable Paper Pro". It is proprietary,
  with "no compatibility guarantees between versions".
- I found no announcement of a pen API, an app store, an extension point or ABI stability (searched 2026-10-25).
  The official route is itself a takeover.

## 6. Ranked recommendation for Zinc

Goal: ink that feels like Quill, with xochitl never restarted, or failing that, the smallest possible cost. Every
step below keeps the safety rules of bridge design §7.1: no restart loop, no freeze, one engine, fail closed, hash-
or probe-gated.

**1. Fix L0 first (cost: days; risk: none to xochitl; no restart).**
- Get the partial-update fix onto the tablet in one of two ways. Either update the OS to 3.28 or 3.29 and install
  AppLoad 0.6.0 through Vellum (an OS update is the owner's step), or stay on 3.27.3 with an AppLoad 0.5.3 build
  carrying the `markedUpdate` float fix. That change is C++ only; the 3.27 QMD stays as it is.
- Switch `plugins/display-rmpp` to `UFAST` (0) for ink, set once at start. The 1 s mode-change sleep must never
  happen during a stroke.
- Send only the stroke's damage, at about 60–100 Hz.
- Optionally read the marker evdev directly in the app, without `EVIOCGRAB`, while its AppLoad window is fullscreen,
  so input skips the Qt, AppLoad and socket hops.
- Then measure. If pen-to-glass comes near the native 12 ms class (say ≤ 30–40 ms with no visible trail), stop here:
  this route is upstream-maintained and costs nothing.

**2. Our own in-xochitl ink item (cost: 1–2 weeks; risk: low to medium; no restart).**
A XOVI extension, separate from AppLoad as its maintainer asked, that registers a `QQuickPaintedItem`. The app's
fullscreen AppLoad window hosts it, inside a `ScreenModeItem { mode: Pen }` (`xofm.libs.epaper`). For each `Ink(rect)`
from the client it copies that rectangle from the qtfb shm into its own image and calls `update(rect)`. On pen-up the
item returns to the UI/colour mode, and that repaint is the colour settle (as xochitl does; see
`delayStrokeScreenRefresh`).
- Why it is safe: it uses only exported Qt symbols and xochitl's own QML types, with no native addresses. The
  per-OS cost is one QMD hash rebuild, the same as AppLoad's.
- What it does better than qtfb: no full-image `drawImage` and no mode-change sleep, and the Pen screen mode applies
  only to the stroke region.
- Gate: if the QML import or the type is missing, the extension does nothing.

**3. Direct engine swap inside xochitl, using Oxide's discovery (cost: 2–4 weeks; risk: medium to high; no restart).**
This is the ink lane v2 of the bridge design §4.3, with symbol lookup replaced by Oxide's method:
- `QImage()` constructor interposition, candidate offsets, and the vtable slot 23 prologue check (MIT, so the code
  can be adapted with attribution).
- Do **not** patch `swapBuffers`. Only *call* it, on the GUI thread, with `EPRenderLoop` rendering blocked.
- The catch is the call itself. The QRegion + mode-map ABI is only half decoded (Oxide reads it but never builds
  it), and the QRect variant's address is not in the vtable. Each OS needs one checked row of offsets (member
  offsets, slot, prologue bytes, mode enum).
- A wrong call crashes xochitl. Keep the crash guard (one crash per boot, then the lane disarms itself), and never
  hook what another extension hooks; framebuffer-spy overrides a different `QImage` constructor.
- Do this only if steps 1 and 2 measurably fall short.

**4. Keep L2 (the lease + Quill) for long ink sessions, and add a "reopen last document" QMD (cost: days).** The
restart stays (about 1 s to `active`, about 3 s to usable), but the user lands back on the same notebook page (§3.3).

**5. Not recommended: Oxide as the system launcher.** It is the only Paper Pro setup that pauses xochitl instead of
restarting it, but it puts xochitl behind blight, and its own compatibility table says xochitl drawing may not
update the display. It replaces the stock launcher unit and changes the whole device, which goes against "never break
xochitl".

**OS-update risks.**
- Steps 1 and 4 depend on AppLoad, qt-resource-rebuilder and QMD hashes, which the community rebuilds within weeks
  (3.28 support took about 2.5 months to land in AppLoad; 3.29 support came the same day as 0.6.0).
- Step 2 depends on `xofm.libs.epaper` keeping `ScreenModeItem` and a Pen mode.
- Step 3 depends on the class layout and vtable. Oxide's environment overrides show this layout moves rarely, but
  it does move.
- Whatever breaks, the probe fails, Zinc falls back to L0 or L2, and xochitl is never touched.

**What to measure on the tablet** (one variable at a time, AppLoad, XOVI and OS versions logged, numbers to
`docs/reports/zinc-next-perf.md`):
1. qtfb repaint interval and pen-to-glass latency (high-speed phone video, 240 fps, pen tip against the line end).
   Four runs: current build FAST; current build UFAST; fixed build FAST; fixed build UFAST. Use the same Notes stroke
   script each time.
2. With the fixed build: CPU time of `FBController::paint` per update (`perf` or `QDEBUG` timestamps), to see
   whether the full `drawImage` matters.
3. The step 2 prototype: the same video measure, plus whether the colour settle reveals colour (Pen to UI on the
   same pixels).
4. L2 for reference: the same video measure under Quill mode 0. That sets the target number.
5. The reopen QMD: time from lease end to the notebook page being visible again.

## 7. What I could not verify

- Any measured millisecond latency for Quill, qtfb 0.6.0 or InkCanvas. None is published; only adjectives.
- Whether qtfb `UFAST` maps to xochitl's *Pen* waveform on 3.27, 3.28 and 3.29. The enum names are hashed in the
  QMD, and the mapping was flipped once.
- Whether AppLoad 0.6.0's QMD applies on 3.27.x. Vellum's constraint suggests not, but I did not diff the QMDs.
- Whether Oxide's xochitl-under-blight works well on rMPP today; `COMPATIBILITY.md` may be stale.
- Whether xochitl's own notebook ink goes through the same `ScreenModeItem` and painted-node path. PR #61's comments
  claim so; I did not disassemble it.
- Discord discussions (not reachable) and Reddit or Hacker News threads (search returned nothing relevant).
- Whether the USB web interface on 3.27 has any document-open endpoint.

## Sources (accessed 2026-10-25)

- AppLoad: [repo](https://github.com/asivery/rm-appload) (v0.6.0 2026-09-19); PRs [#45](https://github.com/asivery/rm-appload/pull/45),
  [#55](https://github.com/asivery/rm-appload/pull/55), [#61](https://github.com/asivery/rm-appload/pull/61),
  [#63](https://github.com/asivery/rm-appload/pull/63), [#64](https://github.com/asivery/rm-appload/pull/64),
  [#66](https://github.com/asivery/rm-appload/pull/66), [#78](https://github.com/asivery/rm-appload/pull/78) (2026-03 to 09).
- Vellum: [appload VELBUILD](https://github.com/vellum-dev/vellum/blob/main/packages/appload/VELBUILD) (0.6.0, OS 3.28–3.29),
  [package list](https://github.com/vellum-dev/vellum/tree/main/packages) (2026-10-24).
- XOVI: [xovi](https://github.com/asivery/xovi) (LGPL-3.0, 2026-06-20), [rm-xovi-extensions](https://github.com/asivery/rm-xovi-extensions) (2026-09-08),
  [qmldiff](https://github.com/asivery/qmldiff) (2026-09-17), [rm-hacks-qmd](https://github.com/asivery/rm-hacks-qmd) (2026-04-08),
  [ingatellent/xovi-qmd-extensions](https://github.com/ingatellent/xovi-qmd-extensions).
- Oxide: [repo](https://github.com/Eeems-Org/oxide) (3.1.2 2026-08-13, last commit 2026-10-12),
  [qt.cpp](https://github.com/Eeems-Org/oxide/blob/master/shared/libblight_client/qt.cpp), [#418](https://github.com/Eeems-Org/oxide/pull/418),
  [#459](https://github.com/Eeems-Org/oxide/pull/459), [#460](https://github.com/Eeems-Org/oxide/pull/460), [#462](https://github.com/Eeems-Org/oxide/issues/462),
  [COMPATIBILITY.md](https://github.com/Eeems-Org/oxide/blob/master/COMPATIBILITY.md), [qtfblight](https://github.com/NoaHimesaka1873/qtfblight) (2026-09-16).
- rm2fb: [ddvk](https://github.com/ddvk/remarkable2-framebuffer) (2024-10-07), [timower rM2-stuff](https://github.com/timower/rM2-stuff) (2026-08-19).
- Engine RE: [epfb-re](https://github.com/asivery/epfb-re) (2026-09-01), [xugro/rmpp-framebuffer](https://github.com/xugro/rmpp-framebuffer) (2024-12-17).
- Paper Pro apps: [Quill](https://github.com/MaximeRivest/quill), [remagic](https://github.com/maximerivest/remagic), [Riddle](https://github.com/MaximeRivest/riddle) (2026-07),
  [android-on-remarkable-paper-pro](https://github.com/MaximeRivest/android-on-remarkable-paper-pro) (2026-08-20), [chiappa](https://github.com/gitman-101111/chiappa) (2026-10-19),
  [KOReader qtfb backend](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_qtfb.lua).
- Lists: [awesome-reMarkable](https://github.com/reHackable/awesome-reMarkable) (2026-10-05), [remarkable.guide Vellum](https://remarkable.guide/guide/software/vellum.html).
- Official: [developer.remarkable.com](https://developer.remarkable.com/documentation), [Xochitl](https://developer.remarkable.com/documentation/xochitl),
  [qt_epaper](https://developer.remarkable.com/documentation/qt_epaper); 12 ms pen latency: [Engadget](https://www.engadget.com/mobile/tablets/the-new-remarkable-paper-pro-adds-a-color-display-120059067.html) (2024-09).
