# Zinc apps on reMarkable tablets: research and design

Date: 2026-10-25. Research and design only: no build, no device access, no other file changed.

The goal (owner): real Zinc apps on the reMarkable 2, the Paper Pro (colour), the Paper Pro Move and the newer models.
Wanted: pen drawing that feels good (low latency, pressure, tilt, eraser), fast refresh, colour where the panel has it,
responsiveness, a launch that returns cleanly to the reMarkable software (xochitl), and a small store to install apps.

This report starts from what the repository already has (a lot: a Paper Pro target, a display plugin, an ink module, two
apps, a failed coexistence bridge and a successful takeover test), adds what the outside world does on each model, and
proposes one design and its phases.

## 1. What the repository already has

| Piece | Where | State |
|---|---|---|
| Target `rmpp` (Paper Pro) | `src/cli_core.cpp` (export, deploy), `src/tc/tc.cpp` (`aarch64-linux`, glibc 2.28, `-mcpu=cortex_a53`), `targets/capabilities.json` (`"eink": true`, `"pen": true`) | builds and exports; `zinc deploy --target rmpp` copies to AppLoad |
| Display driver | `plugins/display-rmpp/` (`rmpp.cpp` qtfb client, `eink.h` refresh policy, `input.h` evdev pen, `direct.h` bridge client, `emulator.cpp` desktop look) | qtfb path works but pen lag is "unacceptable" (user); emulator on macOS works |
| E-ink policy | `plugins/display-rmpp/eink.h`: FAST (mono, ordered dither), QUALITY (colour, greys), FULL (flash, every `full_every` partials) | used by the emulator only; on the device xochitl owns the waveform |
| Ink | `plugins/ink/index.ts` (`zinc:ink`, `<InkCanvas>`): one 2-point segment per pen sample, strokes baked into an image with the same commands, eraser, undo, JSON/SVG | works; segment geometry is shared by live and baked strokes |
| Pen in the HAL | `runtime/include/hal.h` `HalPen {x, y, pressure, tilt_x, tilt_y, flags}`, `hal_pen_push`; `runtime/gfx.cpp` queues every sample per frame (`pen_q`, `penCount`, `penX`...) | works; **no timestamp per sample** (needed for prediction) |
| Damage | `HalFrame` (`x0..y1`, `render`, `render_damage`, `render_box`, `move`) | one box plus a renderer; no per-region "kind of change" |
| Shell module | `plugins/remarkable/` (`zinc:remarkable`, `RemarkableBar`: clock, battery, Quit) | works |
| Apps | `examples/remarkable/notes`, `dashboard`, `quill-test` | Notes on qtfb; `quill-test` is a 3-minute takeover test |
| Coexistence bridge | `integrations/remarkable-ink/` (XOVI extension, `EPRenderBlocker` lease) | **disabled**: did not load; repeated xochitl restarts hit `StartLimitBurst=4` and `rm-emergency.sh` rebooted the tablet (2026-09-29) |
| Reports | `docs/targets/remarkable-paper-pro.md`, `docs/reports/rmpp-latency-2026-09-29.md`, `docs/reports/rmpp-coexistence-2026-09-29.md` | the facts below on the Paper Pro come from them, checked against upstream |
| Store pieces | `.zapp` (`docs/zapp.md`, signature slot empty), `zinc agent`/`zinc device` (`src/agent/`, install/run/stop/uninstall of `.zapp` or an export dir), `tools/index-repo` (TUF index, Ed25519) | all exist, none wired to a tablet |
| Simulation | `zinc run --simulate <device>` with `devices/*.json` (screen, battery, sensors...) | no reMarkable device file yet; the e-ink look comes from `display-rmpp`'s emulator instead |
| Tasks | ZN-130 (fake qtfb + policy, Done), ZN-134 (rmpp under simulation, parked: needs qemu-user on Linux), ZN-317.07 (eink template, Done) | the backlog is frozen: new work goes in `backlog/later.md` or an owner-asked task |

Nothing exists for the reMarkable 2, the Paper Pro Move or the Paper Pure.

The two key findings already in the repository:

1. **qtfb is too slow for ink.** Notes submitted ~100 small rectangles per second; xochitl painted ~8 times per second
   (median 125 ms between paints). The bottleneck is after the app: AppLoad's `FBController::paint()` is a QPainter
   repaint scheduled by Qt's scene graph, then the vendor engine. Mode changes also sleep one second in AppLoad.
2. **Direct calls to the vendor engine are fast.** The Quill takeover (`examples/remarkable/quill-test`: stop xochitl,
   own `libqsgepaper`'s `EPFramebuffer`, partial mono swaps) was "excellent" for the user, and xochitl came back
   cleanly after the 3-minute timeout. That is the path to native-feeling ink.

## 2. The models

reMarkable names the models with codenames, read from `/sys/devices/soc0/machine`: "reMarkable 2.0", "reMarkable
Ferrari" (Paper Pro), "reMarkable Chiappa" (Paper Pro Move), "reMarkable Tatsu" (Paper Pure)
([KOReader device.lua](https://github.com/koreader/koreader/blob/master/frontend/device/remarkable/device.lua)).
The driver detects the model the same way.

### 2.1 reMarkable 2 (discontinued in 2026, still the largest installed base)

- **Hardware**: NXP i.MX 7Dual (2x Cortex-A7, 1 GHz, armv7 hard float), 1 GB, 10.3" E Ink Carta 1200, 1404x1872 at
  226 ppi, monochrome. The panel is wired to the LCDIF and driven by a **software TCON (SWTCON)** that lives inside
  xochitl (statically linked `libqsgepaper`): there is no EPDC driver and no usable `/dev/fb0` waveform ioctl, unlike the
  rM1 ([ddvk/remarkable2-framebuffer](https://github.com/ddvk/remarkable2-framebuffer)).
- **Display paths for third parties**:
  - *rm2fb* (ddvk): a server that hooks xochitl's SWTCON at known addresses and exposes an rM1-style mxcfb interface to
    clients through an `LD_PRELOAD` shim. Addresses change with each xochitl release, so each OS needs a new config.
    Toltec packaged it; Toltec stopped at OS 3.3.2 and the repository is now archived
    ([toltec#820](https://github.com/toltec-dev/toltec/issues/820)).
  - *timower's rm2fb* ([rM2-stuff](https://github.com/timower/rM2-stuff/)): a reimplementation with lower-level hooks
    and a "swtcon" mode built on a bundled SWTCON (from `libqsgepaper` 3.23.0.54) that does not depend on xochitl's
    addresses; badges list 2.15, 3.3, 3.5, 3.8, 3.20, 3.22, 3.23 and 3.28 (beta). Ships the *rocket* launcher.
  - *qtfb through AppLoad*: AppLoad's qtfb defines `FBFMT_RM2FB` for the rM2
    ([common.h](https://github.com/asivery/rm-appload/blob/master/src/qtfb/common.h)); XOVI and AppLoad have arm32
    builds for rM1/rM2 on OS 3.22+ ([rm-xovi-extensions](https://github.com/asivery/rm-xovi-extensions)). The same
    latency ceiling as on the Paper Pro is to be expected (same Qt repaint path), not measured.
  - *Qt `epaper` QPA with xochitl stopped*: the official route
    ([developer.remarkable.com qt_epaper](https://developer.remarkable.com/documentation/qt_epaper)), Qt Quick only,
    "Marker handling is more involved and not shown".
- **OS 3.24 changed the rM2 framebuffer** in xochitl's memory from gray16 to ABGR32, at a new offset
  ([reSnap#27](https://github.com/cloudsftp/reSnap/pull/27)): tools that read or write it by address broke.
- **Refresh modes**: the rM1 mxcfb vocabulary that rm2fb re-exposes: `INIT 0`, `DU 1` (direct update, black/white,
  fastest, no flash), `GC16 2` (16 greys, flashes with FULL), `GC16_FAST 3` (what xochitl uses for UI), `GLR16 4`
  ("basically A2", fast black/white), `GL16_FAST 6`, `DU4 7`, `REAGL 8`, partial vs full update, temperature
  `0x18` for the best draw latency ([libremarkable common.rs](https://github.com/canselcik/libremarkable/blob/master/src/framebuffer/common.rs)).
- **Pen**: Wacom EMR over I2C, `/dev/input/event1` ("Wacom I2C Digitizer"). Axis range about 0..20967 by 0..15725,
  **rotated** against the portrait screen (the long side of the digitizer is X), pressure 0..4095, tilt ±9000
  (0.01 degree), `BTN_TOOL_PEN`, `BTN_TOOL_RUBBER` (eraser end), `BTN_TOUCH`; hover reported in range
  ([libremarkable dimensions.rs](https://github.com/canselcik/libremarkable/blob/master/src/dimensions.rs), KOReader).
  Touch: `event2`, MT type B, 0..1403 by 0..1871 (also mirrored). Buttons: `event0` (power).
- **Launch and return**: either AppLoad inside xochitl (xochitl keeps running), or stop xochitl, run, start xochitl
  (rocket/remux/Oxide style). Both work; the second gives the panel to the app.
- **Breaks on updates**: anything that hooks xochitl by address (rm2fb configs, XOVI hashtab: run `xovi/rebuild_hashtable`
  after an update), the framebuffer format (3.24), glibc (3.6) and Qt (3.9 moved to Qt 6). A static or old-glibc binary
  that reads evdev and talks to a socket survives; the display path is what breaks.

### 2.2 reMarkable Paper Pro ("Ferrari")

Most of this is in `docs/targets/remarkable-paper-pro.md` and verified there; summary:

- **Hardware**: NXP i.MX 8M Mini, 4x Cortex-A53 1.8 GHz, 2 GB; 11.8" Canvas Color (E Ink Gallery 3, ACeP pigments),
  1620x2160, 229 ppi, front light. Pipeline LCDIF → MIPI-DSI → FPGA bridge → panel; **waveforms are computed in
  userspace** by `libqsgepaper` (`EPFramebufferSwtcon`, `EPFramebufferAcep2`, LUTs `ct33_{std,fast,pen,best}.bin`).
  No fbdev, no DRM EPD driver that third parties can use.
- **Display paths**: qtfb via AppLoad (colour RGB888/RGBA/RGB565 shared memory; modes `UFAST 0`, `FAST 1`, `ANIMATE 2`,
  `CONTENT 3`, `UI 4`, `SLEEP 5`; partial or full update; full-refresh request); direct calls to
  `EPFramebuffer::swapBuffers(QRect, EPContentType, EPScreenMode, flags)` with xochitl stopped
  ([Quill](https://github.com/MaximeRivest/quill), [epfb-re](https://github.com/asivery/epfb-re)); Qt `epaper` QPA with
  xochitl stopped.
- **Refresh and latency**: monochrome fast partial (pen) is what Quill uses for ink; colour comes from slower
  content/UI waveforms, and saturated colour needs several frames (Gallery 3 colour updates are hundreds of ms; reMarkable
  shortened "the flash on red ink" in 3.28 ([Notebookcheck](https://www.notebookcheck.net/Latest-reMarkable-update-introduces-new-tools-reading-enhancements-and-more.1389613.0.html)), which shows that colour ink is first drawn fast and then settled). Measured in
  the repository: qtfb ≈ 125 ms between paints; direct mono swaps subjectively equal to xochitl. No camera measurement yet.
- **Pen**: Elan SPI "Elan marker input" (ABS_X 0..11180, ABS_Y 0..15340, pressure 0..4096, tilt ±9000, rubber, ~480 Hz),
  axes already portrait; touch "Elan touch input" MT 0..2064 by 0..2832.
- **Colour for third parties**: through qtfb (RGB in, xochitl quantizes) or through `swapBuffers` with a colour content
  type. Both work today; neither is a documented API.
- **Launch and return**: AppLoad (fullscreen qtfb app; close by a swipe from the top centre or the app's own Quit) or a
  takeover (stop xochitl, run, start it). The takeover must respect the xochitl unit's `StartLimitBurst=4` per 600 s
  and `WatchdogSec=60`, or the tablet reboots into `rm-emergency.sh` (repository incident, 2026-09-29).
- **Breaks on updates**: the vendor library's ABI (the swap signature changed in 3.28), XOVI hashtabs, AppLoad's QML
  hooks. The kernel input devices and `/home/root` survive. Developer mode survives updates but enabling it wipes the
  tablet ([developer mode](https://developer.remarkable.com/documentation/developer-mode)).

### 2.3 reMarkable Paper Pro Move ("Chiappa")

- **Hardware**: 7.3" Canvas Color, 954x1696 at 264 ppi, 2 GB LPDDR4x, a 1.7 GHz dual-core Cortex-A55 per most
  retailers ([Best Buy](https://www.bestbuy.ca/en-ca/product/19472612), [Liliputing](https://liliputing.com/?p=184578)).
  The exact SoC is not published; aarch64 like the Paper Pro (XOVI, Oxide and Vellum ship aarch64 builds for "rmppm").
- **Display paths**: qtfb has Move formats (`FBFMT_RMPPM_RGB888/RGBA8888/RGB565`) and AppLoad an `aspectRatio: "move"`;
  KOReader runs on it through qtfb. The vendor library is the same family as the Paper Pro's; a direct path needs its own
  hash check and probe.
- **Pen**: KOReader scales the pen from 6760x11960 and touch from 1248x2208; input nodes event2 (pen) and event3 (touch),
  event0 buttons, event1 hall sensor (cover). Pressure and tilt are expected to match the Paper Pro (same Marker); to be
  read with `evtest` on the device.
- **Launch, return, updates**: as the Paper Pro.

### 2.4 reMarkable Paper Pure ("Tatsu", May 2026) and later models

- Successor of the rM2: 10.3" monochrome Carta 1300, 1404x1872 at 226 ppi, dual-core Cortex-A55 1.7 GHz, 2 GB, reMarkable
  claims 21 ms ink latency ([announcement](https://news.remarkable.com/introducing-remarkable-paper-pure-the-original-paper-tablet-perfected),
  [Liliputing](https://liliputing.com/remarkables-paper-pure-is-a-399-e-ink-writing-tablet-that-replaces-the-remarkable-2/)).
  Developer mode applies to it like the Paper Pro line.
- It belongs to the Paper Pro software family, not the rM2's: aarch64, qtfb formats `FBFMT_RMPPURE_*`, Vellum and Oxide
  list it, KOReader requires the qtfb shim there. Pen 9620x13000, touch 1776x2400 (KOReader).
- **Design consequence**: a new model is one table row (codename, size, input ranges, qtfb format, vendor-library hash),
  not a new driver. The driver must refuse an unknown vendor hash for the direct path and fall back to qtfb.

### 2.5 The ecosystem, and what is alive in October 2026

| Project | What it is | State |
|---|---|---|
| [XOVI](https://github.com/asivery/xovi) + [rm-xovi-extensions](https://github.com/asivery/rm-xovi-extensions) | `LD_PRELOAD` hook framework for xochitl; arm32 (rM1/2) and aarch64 (rMPP/Move) | alive; **tethered**: started by `xovi/start`, gone after a reboot (on purpose: starting it from systemd risks a boot loop); [xovi-tripletap](https://github.com/asivery/rm-xovi-extensions) starts it from the power button |
| [AppLoad](https://github.com/asivery/rm-appload) | XOVI extension: app launcher inside xochitl, qtfb, `external.manifest.json` | alive; the community standard on the Paper Pro line; arm32 build for rM2 on 3.22+ |
| [Vellum](https://github.com/vellum-dev/vellum) / [vellum.delivery](https://vellum.delivery) | apk-based package manager in `/home/root/.vellum`; rm1, rm2, rmpp, rmppm, rmppure; `postosupgrade` hook, `vellum reenable` after an update | alive; the successor of Toltec; [reManager](https://flathub.org/apps/io.scottlabs.reManager) is a desktop front end; contributions by people only (no LLM-written PRs) |
| [remagic](https://github.com/maximerivest/remagic) | beginner kit that installs XOVI + AppLoad | alive |
| [Toltec](https://github.com/toltec-dev/toltec) | opkg repository, rm1/rm2 | archived; OS ≤ 3.3.2 |
| [Oxide](https://github.com/Eeems-Org/oxide) | launcher and desktop environment, display server *blight*; now lists rM1, rM2, rMPP, Move, Pure | alive, through Vellum |
| [rm2fb (ddvk)](https://github.com/ddvk/remarkable2-framebuffer), [rM2-stuff (timower)](https://github.com/timower/rM2-stuff/) | rM2 display servers | ddvk's per-version configs; timower's swtcon mode up to 3.28 beta |
| [rmkit](https://github.com/rmkit-dev/rmkit) | C++ framework: *harmony* (low-latency drawing), *remux* (app switcher), *SAS*, *genie*, *lamp* | rM1/rM2 through rm2fb; nothing for the Paper Pro |
| [draft](https://github.com/dixonary/draft-reMarkable), remux, rocket | launchers that stop/start xochitl | the "stop xochitl" model |
| [KOReader](https://github.com/koreader/koreader), [Plato](https://github.com/baskerville/plato) | readers | KOReader on every model (qtfb, rm2fb, blight); Plato through Oxide |
| [Quill](https://github.com/MaximeRivest/quill) | C adapter to `libqsgepaper` on the Paper Pro, mono fast and colour partial swaps | the fast-ink reference (MIT); takes over the display |
| [codexctl](https://github.com/Jayy001/codexctl) | firmware download, install, downgrade | the way to pin or restore an OS |
| [awesome-reMarkable](https://github.com/reHackable/awesome-reMarkable) (reHackable) | index of projects | mostly rM1/rM2 era |

Official: developer mode (SSH as root over USB at 10.11.99.1, read-only `/`, writable `/home/root`), a public SDK per OS
version (`aarch64-remarkable-linux`, and the rM2's `arm-remarkable-linux-gnueabi`) and the Qt `epaper` QPA document.
There is **no official app store, no app API and no stability promise**; everything above is community work on top of
developer mode.

## 3. Recommended design

### 3.1 The main decision: two display backends per model, chosen per app

Score of the options (RULES.md §4 style, 0..5):

| Option | Ink latency | Colour | Return to xochitl | Survives updates | Risk to the tablet | Total |
|---|---|---|---|---|---|---|
| A. qtfb (AppLoad), xochitl keeps running | 1 (≈125 ms paints) | 4 | 5 | 4 | 5 | 19 |
| B. Takeover: stop xochitl, drive the vendor engine (Quill-style), restart xochitl | 5 | 4 | 4 (restart ≈ 2 s, rate-limited) | 2 (vendor ABI per OS, hash-gated) | 3 (supervised) | 18 |
| C. In-process bridge inside xochitl (`integrations/remarkable-ink`) | 5 if it worked | 4 | 5 | 1 | 1 (caused a reboot) | 16 |
| D. Qt `epaper` QPA, xochitl stopped | 3 (Qt scene graph) | ? | 4 | 3 | 3 | — (Qt only, not our renderer) |

Choice: **A for every app by default, B for apps that declare they need fast ink** (`"display": {"ink": "native"}`),
with B gated by a pinned vendor-library hash per OS version and falling back to A when the hash is unknown. C stays
disabled (its own README says so); D is not a fit since Zinc draws its own pixels.

Why both: A is safe, works on all four models, keeps notifications, sleep and the native UI, and is enough for a dashboard,
a reader, a game board or a form. Only drawing needs B, and B already proved itself on the Paper Pro. On the rM2 the same
split is A = qtfb (AppLoad arm32) and B = timower's rm2fb swtcon mode or its SWTCON library, behind the same interface.

### 3.2 One driver, a table of models

Rename nothing yet; grow `plugins/display-rmpp` into a reMarkable driver (a later rename to `display-remarkable` is a
`zinc migrate` line):

- `models.h`: one row per codename: panel size and ppi, colour or not, qtfb format, pen and touch device names, axis
  ranges and rotation, vendor-library hash to backend version (for B), xochitl unit name.
- `qtfb.h` (today's `rmpp.cpp` body): backend A, unchanged policy (one connection, coalesced damage, explicit modes).
- `native.h`: backend B. It does **not** stop xochitl itself (see 3.5); it is started by a supervisor once xochitl is
  stopped and the display lock is free, opens the vendor engine through a small C shim (the Quill approach: `dlopen` of
  the device's own `libqsgepaper.so`, nothing vendored, symbols resolved and the hash checked first), and exits on
  SIGTERM, power button, five-finger gesture or a lost heartbeat.
- `input.h`: evdev for pen and touch on every model, with the table's ranges; `EVIOCGRAB` in backend B only.
- `eink.h`: the waveform policy, shared by the device and the emulator (it is today; it becomes the device policy too in B).
- The rM2 gets the same layout with its own row, an `armv7-linux` build (`tc.cpp` already has it; `-mcpu=cortex-a7`
  is a free improvement), and backend B through rm2fb's client protocol or the SWTCON shim.

### 3.3 E-ink-aware damage

Today `HalFrame` gives one box and the driver diffs pixels. An e-ink panel wants to know *what kind* of change each
region is. Proposal, smallest first:

1. **Hints from the program** (no HAL change for the runtime): a `zinc:eink` module with
   `setRefresh(mode)`, `refreshRegion(x, y, w, h, mode)`, `fullRefresh()` and a scoped `withRefresh(mode, fn)`; modes
   `"ink"` (mono fastest: DU/A2, qtfb UFAST/FAST, vendor pen mode), `"animate"` (A2 with periodic clean-up),
   `"ui"` (GL16 / GC16_FAST / qtfb UI, no flash), `"content"` (GC16 / qtfb CONTENT, best greys and colour), `"full"`
   (flash, clears ghosting). The driver reads them as a list of `(rect, mode)` for the next frame.
2. **Classification in the driver** (exists in `eink.h`): pixels that changed only between black and white in a small
   area → ink mode; greys or colour → UI; a large area → content; queued fast areas upgraded after `upgrade_ms` of
   idle; a full refresh after N partials **only when the pen is up and the app is idle**.
3. **HAL addition** (later, if the hints are not enough): `HalFrame.regions` = `{HalRect r; uint8_t kind;}` filled by
   `zinc:ui` (text and layout = ui, images = content, an `<InkCanvas>` = ink, a running animation = animate). The
   runtime knows this when it builds the command list, so it costs nothing per pixel.

Colour on the Paper Pro and Move: ink is drawn first in the fast mono mode (dark colours as black, light ones dithered),
then the stroke's bounding box is upgraded to colour after pen-up plus a short idle (the repository already measured the
need: per-stroke mode switching on qtfb costs 1 s, so in A the upgrade is one deferred `UI` partial; in B it is a colour
partial swap on the stroke's box). The document always keeps the real colour.

### 3.4 Fast ink: draw before the frame, predict a little

The frame loop (program → layout → raster → driver) is too long for ink, whatever the backend. Two changes:

- **An ink layer in the driver.** `zinc:ink` tells the driver the pen's current brush (width, pressure curve, colour,
  clip rectangle of the canvas) with one call when a stroke starts. The driver's input thread then rasterizes each new
  segment straight into the panel buffer with the same segment geometry as `plugins/ink/index.ts` (same stroke call,
  same widths) and submits a tiny ink-mode partial at once (Quill uses an 8 ms minimum flush interval). The program's
  frame still draws the stroke, with identical pixels, so when it arrives the diff is empty (the trick `zinc:ink`
  already uses for baking). Outside the canvas, or when a menu covers it, the layer is off. This is the
  "front buffer" idea of Android's low-latency graphics
  ([Android stylus latency](https://medium.com/androiddevelopers/stylus-low-latency-d4a140a9c982)).
- **Prediction.** Add `uint32_t t_us` (sample time) to `HalPen` (evdev gives it in `input_event.time`); the ink layer
  extrapolates 1 to 2 samples ahead (constant velocity and acceleration over the last 3-4 points, capped at a few
  pixels, dropped on direction changes), draws the predicted tail in the same fast mode and erases it on the next
  real sample. Android's [motion prediction library](https://developer.android.com/develop/ui/views/touch-and-input/stylus)
  does the same with a learned model; a Kalman or polynomial fit is enough at 480 Hz. Prediction is off by default
  in phase 1 and turned on after a camera comparison: a wrong tail on e-ink leaves ghosting.
- **Pressure and tilt**: normalized per model from the table (0..1 and degrees), with a calibration knob for the
  pressure curve in `zinc.json` (`"pen": {"pressureCurve": [..]}`), because the Marker and the Marker Plus differ and
  the user will want to tune it.
- **Palm rejection**: fingers ignored while the pen is in range (exists in `input.h`).

### 3.5 Launch and return

- **Backend A**: AppLoad, as today. `zinc export --target rmpp` writes `external.manifest.json`; Quit calls `quit()`,
  AppLoad shows xochitl again. Nothing else to do.
- **Backend B**: the app is launched by AppLoad (so the user starts it from xochitl's own UI) as a transient systemd unit
  (`systemd-run --unit zinc-app-<name>`), which is what `quill-test` does and the user confirmed:
  1. preflight: model row known, vendor-library hash known, no other display owner, not on battery below a floor,
     and **no more than one restart of xochitl in the last 150 s** (keeps under `StartLimitBurst=4` per 600 s; refuse
     with a message otherwise);
  2. take a wakelock, `systemctl stop xochitl`, start the app;
  3. `ExecStopPost`: start xochitl, release the wakelock; this runs on exit, SIGTERM, crash and timeout;
  4. exits: the app's Quit, the power button (the driver grabs it), a five-finger tap, `systemctl stop` from SSH or
     `zinc device stop`; a watchdog kills the app if its frame heartbeat stops.
  Return takes the time of a xochitl start (seconds), so B suits a session (draw for 20 minutes), not a quick glance.
  Never SIGSTOP xochitl (its watchdog), never delete its display lock, never edit its unit.
- **Sleep**: in A xochitl handles it. In B the driver handles the power button: short press = quit back to xochitl
  (which then sleeps normally); the app saves on SIGTERM.

### 3.6 A zinc:ui theme for e-ink

A theme (`lib/std/kit` style tokens) selected automatically when the target capability says `"eink": true`:

- no transitions or animations (durations 0), no ripples, no blinking caret (a solid one), no spinners (a static
  "working" text), no shadows or translucency (they become dither noise);
- high contrast: black on white, borders 2 px, greys limited to 4 levels that the GL16 waveform shows cleanly
  (0x00, 0x55, 0xAA, 0xFF), colour accents only on colour models and only for meaning (selection, error);
- larger touch targets (the panels are 226-264 ppi, fingers are imprecise on them: 48 px minimum at 226 ppi, scaled),
  focus shown by an inverted block, pressed state shown instantly by inverting the control (an ink-mode partial),
  the result in UI mode after;
- scrolling by pages (a swipe moves one page, no kinetic scroll), lists paged, so each change is one clean refresh;
- text: no sub-pixel AA, grey AA snapped to the 4 levels.

### 3.7 The mini store

Reuse what exists; the store is an index, a signed package and an installer:

- **Package**: the `.zapp` (`docs/zapp.md`), filling its `signature` slot with an Ed25519 signature over the manifest
  (the `--key` signing of `zinc export` and `zinc verify` already exist). A tablet package is the `.zapp` plus the
  prebuilt native plugins for `linux-aarch64` (Paper Pro line) or `linux-armv7` (rM2), which the format already carries
  under `native/<target>-<arch>/`, plus the AppLoad manifest and icon.
- **Index**: a TUF repository built by `tools/index-repo` (same keys, roles and attack tests as the plugin index), with
  per entry: name, version, models (`rm2`, `rmpp`, `rmppm`, `rmppure`), backend (`qtfb` or `native`), the OS versions
  verified for native apps, size, icon, screenshots.
- **Installer on the tablet**: the engine is not needed for an exported app; the installer is a small Zinc app
  (`examples/remarkable/store`, a qtfb app in AppLoad) that fetches the index over Wi-Fi, verifies TUF metadata and the
  package signature, unpacks into `/home/root/xovi/exthome/appload/<name>/` (or a Zinc-owned directory that AppLoad
  points at), and removes. Updates: the same index.
- **Installer from a computer**: `zinc device install app.zapp` through `zinc agent` (the agent already installs and runs
  `.zapp` and export directories). On the tablet the agent runs only while the user wants it (tethered like XOVI, started
  from the store app), listening on the USB network by default.
- **Interoperate rather than compete**: publish the same packages as a Vellum `VELBUILD` too (Vellum handles model and OS
  constraints with `depends=` and has a `postosupgrade` hook). The Zinc store is for people who never open a terminal;
  Vellum is where the community already is. Vellum asks for human-written PRs: that submission is the owner's step.
- **After an OS update**: qtfb apps keep working if AppLoad does (the user re-runs XOVI's hashtab rebuild, which Vellum's
  `reenable` does). Native apps check the vendor hash at launch and fall back to qtfb with a message ("fast ink is not
  verified for OS 3.29 yet"); the store index lists, per native app, the verified hashes, so a new hash is a one-line index
  update after a device test, not a new build.

### 3.8 What Zinc programs get

- `zinc:eink`: `setRefresh`, `refreshRegion`, `fullRefresh`, `withRefresh`, `isEink()`, `isColor()`, `model()`
  (`"rm2" | "rmpp" | "rmppm" | "rmppure" | "emulator"`).
- `zinc:ink`: `<InkCanvas ink={doc} brush={...} native />` where `native` hands live strokes to the driver's ink
  layer; brushes (pen, pencil with tilt, marker, highlighter), stroke and area eraser, colours mapped per panel; pressure
  curve from `zinc.json`.
- `zinc:remarkable`: `RemarkableBar` (exists), `quit()` that returns to xochitl, battery, front light (Paper Pro), cover
  sensor (Move), power-button event.
- `zinc.json`: `"display": {"driver": "remarkable", "ink": "qtfb" | "native", "refresh_mode": ...}`,
  `"pen": {"pressureCurve": [...], "predict": false}`, `"models": [...]`.

## 4. Phases

Each phase ends with something a user can try. "Mac" = provable on the development Mac; "tablet" = needs the device.

### Phase 1: a drawing app that feels native on the Paper Pro and returns to xochitl

- Turn `examples/remarkable/quill-test` into Notes' backend B: `plugins/display-rmpp/native.h` (vendor shim, hash gate),
  launcher unit and preflight (from `examples/remarkable/quill-test/launch.sh`, with the restart-rate check), `zinc
  export --target rmpp` writes the native manifest when `"ink": "native"`.
- Driver ink layer for Notes' brush (`plugins/display-rmpp/native.h`, `plugins/ink/index.ts` brush call).
- Files: `plugins/display-rmpp/{rmpp.cpp,native.h,input.h,plugin.json}`, `plugins/ink/index.ts`,
  `examples/remarkable/notes/{zinc.json,src/}`, `src/cli_core.cpp` (export manifest), `docs/targets/remarkable-paper-pro.md`.
- Mac: the fake qtfb test (`tests/rmpp/qtfb.cpp`) and a mock vendor shim (a C stub with the same symbols that records
  swaps) to test the ink layer's rectangles and modes; lifecycle tests with mocks (`tests/rmpp/quill-launch.py` already
  exists); the emulator for the UI.
- Tablet: camera comparison with xochitl (first mark, moving tip, pen-up tail), colour upgrade after pen-up, 20 launches
  and returns, crash and SIGKILL recovery, no `start-limit-hit` in the journal.

### Phase 2: the same app on the Move, the Paper Pure and the rM2

- `models.h` rows for Chiappa and Tatsu (qtfb formats exist; native needs a hash per device); rM2 row with
  `armv7-linux` export, qtfb (AppLoad arm32, OS 3.22+) and backend B through timower's rm2fb swtcon.
- Files: `plugins/display-rmpp/models.h`, `src/cli_core.cpp` (`--target rm2`), `src/tc/tc.cpp` (`-mcpu=cortex_a7`
  variant or reuse `armv7-linux`), `targets/capabilities.json` (`rm2`, `rmppm`, `rmppure` profiles).
- Mac: the emulator at each panel size (`devices/remarkable-2.json`, `remarkable-paper-pro.json`,
  `remarkable-paper-pro-move.json`, `remarkable-paper-pure.json` for `zinc run --simulate`, each naming `"eink":
  {"color": true|false}` so the emulator's look follows the model); input ranges and rotation tested with recorded
  evdev streams.
- Tablet: one device per model, `evtest` dumps to fill the table, the qtfb run, then native.

### Phase 3: e-ink UI and refresh API

- `zinc:eink` module, the e-ink theme, `zinc:ui` refresh hints (regions), `eink.h` as the device policy in B.
- Files: `plugins/eink/` (new module) or `plugins/remarkable/`, `lib/std/kit` theme tokens, `runtime/include/hal.h`
  (`HalPen.t_us`, later `HalFrame.regions`), `runtime/gfx.cpp`, `plugins/display-rmpp/eink.h`.
- Mac: emulator screenshots per mode (`ZINC_SHOT`), a golden of the region classification (pure function over frames),
  `tools/style-neutrality`/`contrast-check` on the theme.
- Tablet: ghosting after an hour of use, full-refresh frequency, dashboard and reader apps.

### Phase 4: prediction

- `HalPen.t_us`, predictor in the driver's ink layer, `"pen": {"predict": true}`.
- Mac: replay recorded strokes (`NOTES_DEMO=1` exists) and measure predicted-vs-real error offline.
- Tablet: camera comparison with and without prediction; keep it only if it wins.

### Phase 5: the store

- Signed `.zapp` for tablets (signature slot, native plugins per arch), `tools/index-repo` entries with model and backend
  fields, `examples/remarkable/store` (qtfb app), `zinc device install` to a tethered agent, a `VELBUILD` per app.
- Files: `src/` pack/verify code for the signature slot, `tools/index-repo`, `src/agent/` (an rM profile: USB
  network, no shell by default), `examples/remarkable/store/`, `docs/zapp.md`.
- Mac: TUF attack tests (`tests/t1/tuf_index.sh` exists), install/uninstall through a local agent, store UI in the
  emulator.
- Tablet: install over Wi-Fi, update, an OS update followed by the fallback message, uninstall leaves nothing.

Publishing the index, pushing to Vellum and announcing the store are outward steps that wait for the owner.

## 5. Risks and rules

- Never loop on xochitl restarts (the reboot incident). Every launcher counts restarts and refuses.
- Never vendor reMarkable's libraries; `dlopen` the device's own and pin hashes.
- Never install anything that starts at boot or edits xochitl's unit (XOVI's own warning: boot loops).
- Developer mode wipes the tablet when enabled: the first-run guide says so first.
- The vendor ABI will change again: the hash gate and the qtfb fallback are what make an app survive an update.
- Backlog: the backlog is frozen, so these phases become tasks only when the owner asks; until then each item is a line in
  `backlog/later.md` under a reMarkable heading. ZN-134 (qemu-user simulation) stays parked; the Mac proofs above do not
  need it.
