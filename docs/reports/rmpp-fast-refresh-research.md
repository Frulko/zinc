# reMarkable Paper Pro: how to refresh faster for a live second-screen stream

Date 2026-10-28. Research only: web, a few local files, the public kernel tarball. Nothing was built or run, nothing was sent to a device.
Tags: **[S]** sourced fact (URL given), **[L]** measured by us earlier (repo file given), **[I]** my inference, **[?]** unknown / unverified.

## 0. Short answer

1. **No public dump of the Paper Pro's waveforms exists.** The panel's lookup tables are userspace files read by `libqsgepaper` (`/usr/share/remarkable/ct33_{std,fast,pen,best}.bin`, [L] `docs/targets/remarkable-paper-pro.md`). I found no decoder, no mode list, no durations. The file name `GAL3_..._TC.eink` from the brief appears in no source I could reach **[?]**.
2. **The only mode indices anyone has published are Quill's**: `EPContentType::Mono` mode 0 is the fastest ink; `Color` modes 3, 4, 5 are colour; mode 1 collapses to grey ([S] [Quill README](https://github.com/maximerivest/quill/blob/main/README.md), `src/quill.h`). We already use 0 (pen) and 4 (colour). Indices 2, 6, 7 and Mono 1/2/4/5 are unexplored on the Paper Pro.
3. **The panel is driven for ~1.4 s (about 120 frames at 85 Hz) after every update in every mode we can reach** ([L] `rmpp-eink-cursor-latency.md`). The visible change is much earlier. So "faster" means: more updates per second and less ghosting, not a shorter drive.
4. **The 85 Hz is confirmed from the kernel**: LCDIF 54 MHz over 555 x 1145 total pixels gives 84.97 Hz ([S] ferrari.dtsi, section 2).
5. **The vendor engine already lets updates overlap** (second update 100 ms later does not queue, [L]). The rM2 version of the same engine is reversed in detail and shows the queue-to-first-frame delay is only 0 to 2 frames (about 0 to 24 ms) plus CPU render time, so "pixels written to panel moving" is probably already near its floor on L2 **[I]**.
6. **Writing our own waveform engine (the waved / timower route) is not available for the Paper Pro** and would be high risk (section 6, option F). Do not.

## 1. Waveform modes on the Paper Pro (question 1)

| Item | What is known | Source |
|---|---|---|
| LUT files | `ct33_std.bin`, `ct33_fast.bin`, `ct33_pen.bin`, `ct33_best.bin` in `/usr/share/remarkable/`; classes `EPFramebufferSwtcon` and `EPFramebufferAcep2` in `libqsgepaper` | [L] strings of the SDK's `libqsgepaper.so`, `docs/targets/remarkable-paper-pro.md` line 28 |
| Format of those files | Not documented anywhere I found | [?] |
| Names suggest 4 speed classes | std / fast / best matches E Ink's published Gallery 3 tiers: B/W 350 ms, fast colour 500 ms, standard colour 750-1000 ms, best colour 1500 ms; "pen" is separate (30 ms update for pen input in B/W and a few colours) | [S] [E Ink release](https://www.eink.com/news/detail/E%20Ink_Launches_E%20Ink_Gallery_3_Color_ePaper_for_Sustainable_Digital_Reading); mapping of file name to tier is **[I]** |
| `swapBuffers` signature | 3.27: `(QRect, EPContentType, EPScreenMode, flags)`; 3.28/3.29: `(QRect, EPScreenMode, flags)` | [L] `plugins/display-rmpp/models.h` |
| Usable (content, mode) pairs | Mono 0 fast ink; Mono 3 "quality"; Color 3, 4, 5; Color 1 = grey; "Color" in modes 1, 3, 4, 5 returns update tokens | [S] Quill README, `docs/device-test-2026-07-12.md` ([raw](https://raw.githubusercontent.com/maximerivest/quill/main/docs/device-test-2026-07-12.md)) |
| qtfb names | UFAST 0, FAST 1 (DU), ANIMATE 2 (A2), CONTENT 3 (GC16), UI 4 (GL16): these are qtfb's labels for xochitl's `EPScreenMode`; which real waveform each is is not documented | [L] `rmpp-eink-zoom-research.md` |
| What the qtfb modes cost | One 256x256 update keeps the LCDIF busy 1.46 / 1.46 / 1.31 / 1.37 / 1.36 s for UFAST / FAST / ANIMATE / CONTENT / UI. **The "fast" modes are not shorter in drive time.** | [L] `rmpp-eink-cursor-latency.md` |

What this means **[I]**: on a Gallery 3 (4-particle) panel the fast tier still plays a long sequence to leave the particles in a stable, DC-balanced state. A 1.4 s drive with a visible change in the first ~100-350 ms fits E Ink's 350 ms figure. We have not measured when the pixel becomes visible; the old note that pen pixels "settle" 1.4 s later fits this.

Reference formats for other panels (not the Paper Pro, for orientation only): the PineNote's file holds RESET, DU, GC16, GL16, GLR16, GLD16, A2 ([S] [Pine64 EBC page](https://wiki.pine64.org/wiki/RK3566_EBC_Reverse-Engineering)); Modos documents WBF and its own IWF text format, and says Gallery 3 stores drive values differently (WBF value 14 means 2 on the bus) ([S] [Glider README](https://github.com/Modos-Labs/Glider), "Waveform Formats"). rM2's `.wbf` loader is open in [timower/rM2-stuff `libs/swtcon/wbf.cpp`](https://github.com/timower/rM2-stuff/tree/master/libs/swtcon); rM2 has 8 waveform modes (1 DU, 2 GC16, 3 GL16, 6/7 A2/DU4-class, per [timower RENDERING_PIPELINE.md](https://github.com/timower/rM2-stuff/blob/master/doc/RENDERING_PIPELINE.md)). The Paper Pro file is a different generation and a colour panel; nothing says it uses WBF **[?]**.

**Cheapest way to settle this: a mode sweep** (section 6, option A). It needs no new tool, only our L2 shim.

## 2. How the software TCON schedules updates (question 2)

### 2.1 The Paper Pro hardware path (facts from Remarkable's own kernel)

Source: the public tarball `linux-imx-rel-5.8-xenu-3.28.0.172` in [reMarkable/linux-imx-rm](https://github.com/reMarkable/linux-imx-rm) (branch `rmpp_6.12.49_v3.28.x`; files `ferrari.dtsi`, `drivers/gpu/drm/bridge/rm-cumulus-bridge.c`, `drivers/gpu/drm/panel/panel-rm-cumulus.c`).

- `cumulus-panel` timing: 54 MHz pixel clock, 405 x 1084 active, porches 88 / 52 / 10 horizontal and 59 / 1 / 1 vertical **[S]**. Total 555 x 1145 gives **84.97 Hz** per LCDIF frame **[S, computed]**. This matches the 85 Hz we counted on `imx-lcdif-crtc.0` ([L]).
- The path is LCDIF, then MIPI-DSI (4 lanes, `remarkable,dsi-num-lanes = 4`), then a Lattice CrossLink-NX FPGA ("cumulus bridge", firmware loaded by the kernel through the FPGA manager over SPI at 34 MHz), then the panel (`display-info`: 2160 x 1620, 228 dpi, 24 bpp) **[S]**. The kernel driver only brings the bridge up (regulators for the panel rails, VCOM 500000 uV, FPGA firmware). It contains no waveform, no temperature logic, no update queue **[S, by reading the bridge and panel drivers]**.
- So each 85 Hz DSI frame is one panel drive phase, generated in userspace; 405 x 1084 x 24 bit is about 1.3 MB per phase, which is not a normal RGB picture. How drive codes are packed into it ("FPGA transport frame format") is unpublished; Quill's README calls reverse engineering it the step beyond what it does **[S]**.
- The rM2 uses an almost identical design with 85 Hz and no FPGA (11.76 ms frame, section 2.2), so the same pacing is expected on the Paper Pro **[I]**.

### 2.2 What the rM2 engine does (the nearest reversed relative, 3.23.0.54)

Source: [timower/rM2-stuff `doc/swtcon_architecture.md`](https://github.com/timower/rM2-stuff/blob/master/doc/swtcon_architecture.md) and [`doc/RENDERING_PIPELINE.md`](https://github.com/timower/rM2-stuff/blob/master/doc/RENDERING_PIPELINE.md). Everything here is for the **rM2**; the Paper Pro engine is a newer build with a colour pipeline **[?]** whether it behaves the same.

| Topic | Finding |
|---|---|
| Frame period | Pacing code uses 11762 us per frame (0x2df2), i.e. 85 Hz **[S]** |
| Frame ring | 16 frame slots; each update's waveform is rendered ahead into the ring by a worker thread, a display thread pans the slots out **[S]** |
| Per-pixel state | A 16-bit per-pixel state buffer (`g_pStateBuffer`) is read and written by the playback kernels; each queued item also carries its own per-pixel state buffer **[S]** |
| Concurrent regions | No fixed slot count. Updates are items on lists; an item has a rect, mode, LUT, temperature, frame cursor and phase **[S]** |
| New update over a still-unposted older one | `subtract_update_region` clips the new rect out of every pending (not yet posted) item, leaving up to 4 strips of the old one **[S]** |
| New update over an update already playing | An overlap list is built against processed items (`build_overlap_dependency_list`); the older item must outlive the new one's start. Not a restart, not a wait for the old one to end; the exact blending in the playback kernel is not fully reversed **[S/?]** |
| Latency from queue to first frame | Commit target is `baseFrame`, `+1` or `+2` frames (0 to ~24 ms) depending on a CPU "workload" estimate of `area x 8 / 1000 + 100` us, otherwise it snaps to the target frame **[S]** (formula in section 6.2 of that doc). Large rects cost render time on the A53 cores: about 155 ms single-thread vs 65 ms two-thread for a 1035-column rect under their emulator **[S]** |
| Rect rounding | Y rounded to 8-row blocks; a rect narrower than 99 columns is rendered in one thread, wider ones in two column halves **[S]** |
| Pixel modes | Mode 7 = pen/marker (reads a separate 8-bit pen buffer, gated by it); 6 = rough pass for panning / progress; 9 = settle pass for UI; synchronous full refresh queues 6 then 9 on the same rects and only 9 survives **[S]** |
| Temperature | LUT is chosen by temperature bucket: the highest LUT whose threshold the panel temperature meets **[S]**. Warmer is faster or different; panel temperature is polled in the background |
| xochitl layer | `updateInBlocks` merges rects; if the region covers over 24% of its bounding box or has over 64 rects it sends one bounding-box update **[S]** |

Our own measurements are consistent: the second update 100 ms later on the same pixels does not queue behind the first (both drive 1.4 s from start), disjoint rects overlap freely, and a waveform switch repaints the whole window ([L] `rmpp-eink-cursor-latency.md`).

**Open waveform engines**: [matteodelabre/waved](https://github.com/matteodelabre/waved) is an experimental rM2-only userspace driver (GPL-3, "proceed at your own risk", `waved-dump` prints WBF info); the SWTCON in timower's repo is rM2-only and reverse engineered from a 3.23 `libqsgepaper`, used by rm2fb's "swtcon" mode, tested to 3.28 beta ([rM2-stuff README](https://github.com/timower/rM2-stuff)). **Neither has been ported to the Paper Pro** as far as I could find; neither mentions it. The Paper Pro has no framebuffer device and the FPGA stage is undocumented **[S/?]**.

## 3. Community work on the Paper Pro and rM2 (question 3)

| Project | Relevance | Source |
|---|---|---|
| rm-appload / qtfb (Asivery) | The xochitl-side shared framebuffer we use for L0. Repo README documents only the manifest `qtfb` flag; the protocol and the 1 s mode-switch sleep come from our own reading of its source ([L] `rmpp-eink-zoom-research.md`) | [asivery/rm-appload](https://github.com/asivery/rm-appload) |
| Quill / remagic / riddle (Maxime Rivest) | Takeover host: stops xochitl, drives the vendor engine through `EPFramebuffer`; ABI `quill_swap_*`. Tested on Paper Pro OS 3.26-3.27. States stacked small colour dirty rects work. Warns the vendor backend may promote a small rect to a whole-panel update unless `full=0`. No latency numbers published | [Quill](https://github.com/maximerivest/quill), [remagic](https://github.com/maximerivest/remagic) |
| libqsgepaper-snoop (pl-semiotics) | rM1/rM2 only: injects into xochitl to read damage; not the Paper Pro | [repo](https://github.com/pl-semiotics/libqsgepaper-snoop) |
| rm2fb (ddvk, timower) | rM2 only | [ddvk](https://github.com/ddvk/remarkable2-framebuffer), [timower](https://github.com/timower/rM2-stuff) |
| goMarkableStream, reStream, rmview, vnsee | All stream tablet to PC (wrong direction); vnsee writes the rM1/rM2 framebuffer with no waveform control, up to ~1 s extra latency | [L] `rmpp-sidecar-research.md` |
| inkbridge (ClinShaiju) | Paper Pro as a pen tablet for Windows, ~480 Hz digitizer; no display findings | [repo](https://github.com/ClinShaiju/inkbridge) |
| Mac second-screen apps for the Paper Pro | **None found.** A search for second-monitor / mirroring on the Paper Pro found only reviews. Our sidecar is the only one I know of **[?]** | web search 2026-10-28 |
| Mainline Linux for the Paper Pro display | **None found.** Remarkable publishes its vendor kernel (above); no upstream effort surfaced | web search 2026-10-28 |

## 4. How other devices get "ultra fast" (question 4)

| Device / project | Technique | Applies to us? |
|---|---|---|
| Modos Caster / Glider (60-75 Hz monitor) | Every pixel is its own update region; if a pixel changes before it is fully driven it is driven toward the new value and its frame counter recomputed ("early cancellation"); fast binary / 4-level mode on change, 16-grey re-render of resting pixels automatically; per-pixel mode from the host over USB HID; Bayer / blue-noise / error-diffusion dithering in hardware. Costs ~540 MB/s of state traffic at 1080p, which is why e-readers do not do it ([S] [Glider README, "Low Latency Drive"](https://github.com/Modos-Labs/Glider)). Glider's LVDS note names the 11.8" Gallery 3 as an LVDS panel, but the Caster targets other panels; Gallery 3 colour support there is **[?]** | Technique yes (we do the "settle later" part in software); the hardware part no |
| PineNote Rockchip EBC (Samuel Holland) | "Direct mode": the CPU looks up each pixel's drive code from old level, new level and phase, packs a phase buffer; frame rate then falls below the panel's 85 Hz because the CPU is the bottleneck; "diff mode" masks unchanged pixels ([S] [RFC patch 12/16](https://lkml.iu.edu/hypermail/linux/kernel/2204.1/07946.html)). This is the same architecture as the rMPP | Confirms that on a software TCON the CPU render of the rect bounds the update rate; keep rects small and dithered-to-1-bit |
| Boox | HD / Balanced / Fast / Ultrafast presets trade ghosting for speed; A2 and "X mode" exist but no document says what they do ([S] [Good e-Reader](https://goodereader.com/blog/?p=369432), [L] `rmpp-eink-zoom-research.md`) | Nothing citable to copy |
| Kindle / Kobo / KOReader (mxcfb) | Per-update mode: A2 or DU for fast, GL16 / REAGL for "partial", flashing GC16 every N updates; DU preferred over A2 on many devices because A2 looks poor or is promoted to a flash; colliding updates merged to the union rect with the higher-quality mode ([S] [KOReader uimanager.lua](https://github.com/koreader/koreader/blob/master/frontend/ui/uimanager.lua), [framebuffer_mxcfb.lua](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_mxcfb.lua)) | Mode per update: only on L2 |
| rabbitink (IT8951 monitor) | A2 plus Bayer ordered dither; big changes go to DU; idle goes to a GC16 clear; total typing latency ~140 ms, of which the A2 panel update ~137-170 ms ([L] `rmpp-sidecar-research.md`) | Same recipe as our sidecar |
| Dasung | No documentation found **[?]** | |
| E Ink itself | Gallery 3 targets 350 ms B/W, 500 ms fast colour; pen input 30 ms ([S] [E Ink release](https://www.eink.com/news/detail/E%20Ink_Launches_E%20Ink_Gallery_3_Color_ePaper_for_Sustainable_Digital_Reading)). That is the panel's physical floor for a mono update; Gallery 3 is the slow end of e-ink | The floor for any option below |

## 5. What the evidence says about our bottlenecks

- **Update start latency** (send to first driven frame) was not measured ([L] clock offset only known to 0.2 s). The rM2 engine suggests 0 to 2 frames + render time **[I]**. Worth measuring before anything else (section 6, step 0).
- **Update rate**: small rects up to ~120/s, 1620x800 ~20/s, whole panel ~8/s ([L]). That scaling with area is what the A53 render cost predicts (rM2 doc: render is a per-pixel CPU kernel, two threads for wide rects). It points to **tile size and area per second**, not to the LCDIF.
- **Settle time**: ~1.4 s of drive per update regardless of mode ([L]); touching the same pixels again earlier ghosts ([L]). The engine accepts it (overlap), the panel physics does not like it **[I]**.
- **Mode switch cost** on L0 is a whole-window repaint (~1.3 s, [L]); qtfb's own per-switch 1 s sleep is a software pause ([L] zoom research).

## 6. Ranked options

Gain/risk are relative to today's sidecar. "Panel risk" is stated explicitly for each.

| Rank | Option | Expected gain | Panel / device risk | Effort |
|---|---|---|---|---|
| 0 | **Measure first**: send-to-first-frame and send-to-visible with a photodiode or 240 fps camera on one small rect, in Pen mode, qtfb UFAST, and L2 | Tells whether anything below is worth doing; no gain by itself | none | 0.5 day |
| A | **L2 mode sweep**: call `swap` with Mono modes 0 to 7 and Color modes 0 to 7 on a 256x256 rect, with `full=0`; record LCDIF-busy time (the `/proc/interrupts` method, [L]) and visible time; then try the best candidate for 1-bit dithered content | Unknown, possibly large: a mode whose LUT is shorter or lower-ghost than Pen; or none (all 4 LUT sets seem to be ~1.4 s) | Low. All modes are vendor LUTs, in spec. An out-of-range index may crash the engine or select an empty LUT (rM2 code falls back to an empty LUT **[S]**; Paper Pro behaviour **[?]**). Run from a restorable session (`takeover.sh` style: Quill restores xochitl), not on a tablet with unsaved work. A crash must not leave xochitl stopped | 1 day |
| B | **Keep content strictly 1-bit and screen-anchored (Bayer / blue noise), update only changed tiles, newest-wins, never re-touch a tile within the settle time unless it really changed**; coalesce per 85 Hz frame tick | Fewer collisions and ghosts; less CPU render per second. Already partly done (ordered dither, tile diff, clean pass). Gain is incremental | None | Small, mostly tuning (tile size, hold-off per tile) |
| C | **Tile size / rect shape tuning for the render kernel**: rects 8-row aligned in Y, below 99 columns stay one thread, bigger split in two (rM2 numbers) | Fewer wasted pixels; maybe 1.2-2x more tiles/s **[I]**; needs confirmation on the Paper Pro build | None | Small, one sweep on L2 |
| D | **Per-update mode on L0**: patch AppLoad (mode in the update message, drop the 1 s sleeps; our patch 0004 / capability bit exists, [L] `rmpp.cpp`) | Removes the whole-window repaint when switching between stream mode and clean mode; lets the clean pass use a quality mode without a stall | None | Already coded; deploy/verify |
| E | **Temperature**: the engine selects the LUT by panel temperature; nothing to do from our side beyond not running the tablet cold | Maybe faster waveform when warm **[I]**; cannot be set | none | none; note it in the docs |
| F | **Own waveform / TCON on the Paper Pro** (port of waved or timower's SWTCON, or a replacement LUT for the pen mode) | Would allow early cancellation and a hand-tuned shortest binary drive (the Caster ideas) | **High.** It would mean driving the panel with voltage sequences the vendor did not qualify. A wrong sequence can leave permanent image retention, damage the particles' reversibility, or overstress the panel supply and FPGA; E Ink waveforms must stay DC-balanced and temperature-compensated. The FPGA frame format is unpublished, the vendor LUT format is unknown, and we cannot test without risking the only tablet. | Months; blocked by missing formats |
| G | **Edit the vendor `ct33_*.bin`** (e.g. shorten the pen LUT) | Maybe a shorter drive | **High, same reasons as F.** The files are on a read-only root and signed OS images; also changes xochitl's pen behaviour. Not recommended | n/a |
| H | **Binary mode via colour mode swap only when static** (our current policy) | none new | none | done |

Recommended order: 0, A, C, B, D. Do not do F or G.

Things not worth trying **[I]**: asking xochitl for GC16 / GL16 at high rate (1.3-1.4 s drive, flashes at times); a `full=1` swap for anything but cleaning (the vendor backend may promote small rects to whole-panel, Quill warns); more than one waveform switch per session (whole-window repaint).

## 7. Unknowns and weak spots in this report

- The brief's waveform file name and the claim that modes have "names, indices, durations if dumped": **no dump found**; the table in section 1 is all there is.
- The Paper Pro SWTCON may differ from the rM2 one in scheduling; every rM2 statement is for 3.23.0.54 and a monochrome panel.
- Why all qtfb modes drive 1.3-1.5 s, and whether xochitl's qtfb path maps UFAST to the same LUT as the pen: **[?]**, a mode sweep on L2 (option A) answers part of it.
- No measurement exists of send-to-first-frame, nor of visible-change time per mode.
- Search results from the engine were thin; I did not find forum threads (reMarkable community, Discord) which may hold dumps or timings. If the owner knows of any, they should be checked first.
- The number of independent update regions is not bounded by anything I found in the rM2 code; the practical limit is CPU render and the 16-slot ring, not a "slot count" **[I]**.

## 8. Sources

- Quill: https://github.com/maximerivest/quill (README, `src/quill.h`, `docs/device-test-2026-07-12.md`); remagic https://github.com/maximerivest/remagic
- timower/rM2-stuff: https://github.com/timower/rM2-stuff (`doc/swtcon_architecture.md`, `doc/RENDERING_PIPELINE.md`)
- waved: https://github.com/matteodelabre/waved ; rm2fb https://github.com/ddvk/remarkable2-framebuffer
- reMarkable kernel: https://github.com/reMarkable/linux-imx-rm (branch `rmpp_6.12.49_v3.28.x`, tarball `linux-imx-rel-5.8-xenu-3.28.0.172-2418a6dae57b.tar.gz`; files `arch/arm64/boot/dts/freescale/ferrari.dtsi`, `drivers/gpu/drm/bridge/rm-cumulus-bridge.c`, `drivers/gpu/drm/panel/panel-rm-cumulus.c`)
- Modos Glider / Caster: https://github.com/Modos-Labs/Glider ; Caster https://github.com/Modos-Labs/Caster
- PineNote EBC: https://wiki.pine64.org/wiki/RK3566_EBC_Reverse-Engineering ; https://lkml.iu.edu/hypermail/linux/kernel/2204.1/07946.html
- E Ink Gallery 3: https://www.eink.com/news/detail/E%20Ink_Launches_E%20Ink_Gallery_3_Color_ePaper_for_Sustainable_Digital_Reading
- KOReader: https://github.com/koreader/koreader/blob/master/frontend/ui/uimanager.lua ; https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_mxcfb.lua
- inkbridge: https://github.com/ClinShaiju/inkbridge ; libqsgepaper-snoop https://github.com/pl-semiotics/libqsgepaper-snoop ; rm-appload https://github.com/asivery/rm-appload
- Local: `plugins/display-rmpp/{rmpp.cpp,models.h}`, `docs/targets/remarkable-paper-pro.md`, `docs/reports/rmpp-eink-cursor-latency.md`, `rmpp-eink-zoom-research.md`, `rmpp-sidecar-research.md`, `rmpp-sidecar-features-research.md`

## Other ways to drive the panel

Added 2026-10-28. Web and source research only: GitHub repos cloned and read, no device access. Tags: **[S]** a source says it, **[I]** my inference, **[?]** unknown. `remarkable-fast-ink-landscape.md` already covers Oxide, AppLoad PRs, framebuffer-spy and the official routes; this section adds only what it lacks.

### 9.1 Short answer

- **Nobody drives the Paper Pro without `libqsgepaper`.** Every path found ends in the vendor engine: xochitl, AppLoad/qtfb, Quill, Oxide/blight, Maxime Rivest's Android port, chiappa for the Move **[S]** (table 9.2).
- **The engine is not behind a sealed ASIC.** `libqsgepaper` is a userspace software TCON that flips dumb buffers on `/dev/dri/card0` through atomic KMS, `EPFramebufferAcep2` on top of `EPFramebufferSwtcon` **[S]** [rmpp-display-notes](https://github.com/MaximeRivest/rmpp-display-notes/blob/main/DISPLAY-STACK.md). This corrects the "no framebuffer device, FPGA stage undocumented" reading of section 2.3: DRM is the interface; what stays unpublished is how the FPGA bridge packs a drive phase.
- **The `.eink` waveform container is decoded** (XOR, 16-byte header, LZ; 8 modes x 9 temperatures) **[S]** (9.5). Nobody has published a driver that uses it.
- **Completion API exists:** `EPFramebufferSwtcon::sync()`, a global wait (9.4). `swapBuffers` returns no usable per-update handle.
- **Verdict: option 2 now, option 3 only as a staged research project.** See 9.6.

### 9.2 Every path to the panel, and where it ends

| Path | Reaches the panel through | Source |
|---|---|---|
| xochitl | its linked `libqsgepaper` | [S] [DISPLAY-STACK.md](https://github.com/MaximeRivest/rmpp-display-notes/blob/main/DISPLAY-STACK.md) |
| AppLoad / qtfb (shm + `FBController.update(rect)`) | xochitl's QML items, so the engine inside xochitl | [S] [rm-appload `src/qtfb/common.h`](https://github.com/asivery/rm-appload/blob/main/src/qtfb/common.h) |
| KOReader on rMPP | qtfb client (`framebuffer_qtfb.lua`) | [S] [koreader-base](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_qtfb.lua) |
| Quill (`dlopen`, xochitl stopped) | `EPFramebuffer::swapBuffers` | [S] [quill `src/vendor_probe.cpp`](https://github.com/maximerivest/quill/blob/main/src/vendor_probe.cpp) |
| Android 13 port (einkbridge) | links `libquill.so`, so the same engine | [S] [android-on-remarkable-paper-pro](https://github.com/MaximeRivest/android-on-remarkable-paper-pro); press: [Notebookcheck](https://www.notebookcheck.com/Grosses-12-Zoll-E-Ink-Tablet-mit-Android-YouTuber-moddet-das-reMarkable-Paper-Pro.1372163.0.html) (a different YouTuber's Android port, no driver detail published) |
| Oxide blight (display server) | `EPFramebuffer::swapBuffers(QRect, type, mode, flags)` plus `sync()` | [S] [oxide `applications/display-server/guithread.cpp`](https://github.com/Eeems-Org/oxide/blob/master/applications/display-server/guithread.cpp) |
| epfb-re (asivery) | `createControlledInstance()` + `swapBuffers`, in a separate process | [S] [epfb-re](https://github.com/asivery/epfb-re) |
| chiappa (Paper Pro **Move**, i.MX93, mainline kernel + patch series) | its own kernel, but `libqsgepaper` via a Qt Quick `epaper` QPA app ("all userspace display access must go through the vendor engine") | [S] [chiappa `docs/eink.md`](https://github.com/gitman-101111/chiappa/blob/main/docs/eink.md) |
| xugro/rmpp-framebuffer | one commit, "poc attempt half working", Dec 2024, no README | [S] [repo](https://github.com/xugro/rmpp-framebuffer) |
| xovi-message-broker, framebuffer-spy, qt-resource-rebuilder | not display paths: IPC to QML, buffer capture, QML patching | [S] [rm-xovi-extensions](https://github.com/asivery/rm-xovi-extensions) |
| rm2fb (ddvk, timower), waved, libqsgepaper-snoop | rM1/rM2 only | see sections 2.2 and 3 |
| Toltec / Vellum for rMPP | Vellum packages AppLoad/Oxide; Toltec has no 3.x port | [S] landscape doc, [mobileread thread](https://www.mobileread.com/forums/showthread.php?p=4578364) |
| Mainline Linux / postmarketOS for the Paper Pro (ferrari) | none found. Only the Move has a mainline series (cumulus panel, GMT G2194 PMIC, i.MX93 bridges), and it still needs the vendor engine | [S] [chiappa `kernel/`](https://github.com/gitman-101111/chiappa/tree/main/kernel), [linux-imx-rm](https://github.com/reMarkable/linux-imx-rm) |
| Official | SDK = cross toolchain, libs, some headers; developer mode; no display API, no `libqsgepaper` mention | [S] [developer.remarkable.com/documentation/sdk](https://developer.remarkable.com/documentation/sdk) |

Forums: a search of Reddit, Discord and remarkable.guide surfaced nothing beyond the repos above and one MobileRead report of XOVI not injecting on 3.27.0.87 (Move, overlay `/etc`) **[S]** [thread](https://www.mobileread.com/forums/showthread.php?p=4578364). Discord is not reachable from here.

### 9.3 What the engine exposes (beyond Quill's `swap`)

All from reverse engineering of `libqsgepaper.so` on OS 3.27.3.0, ferrari **[S]** unless marked.

| Entry point | What it gives | Source |
|---|---|---|
| `swapBuffers(QRegion, EPContentMap, EPScreenModeMap, flags)` | Several rects with **different modes in one call**; probed working (mono checkerboard at Pen plus colour bars at Content in one swap). Not in Quill's C ABI | [DISPLAY-STACK.md section 2](https://github.com/MaximeRivest/rmpp-display-notes/blob/main/DISPLAY-STACK.md), [oxide `epframebuffer.h`](https://github.com/Eeems-Org/oxide/blob/master/shared/epaper/epframebuffer.h) |
| `EPFramebufferSwtcon::update(QRect, int waveform, PixelMode, int flags)` | Lower queue call that `swapBuffers` uses; Oxide hooks it. aarch64 pixel modes: Pen 13, FastPen 14, Mono 15, Default 7, Init 17 | oxide `epframebuffer.h` |
| `EPScreenMode` enum | Pen 0, Mono 1, Animation 2, UI 3, Content 4, Sleep 5 (differs from qtfb's `REFRESH_MODE_*` numbers, so do not reuse them) | epfb-re, oxide, rmpp-display-notes; qtfb `common.h` |
| `ghostControl(mode)` | BlinkNow 0, BlinkLater 1, **BleachNow 2** (bleach/animation pass, Acep2 only), FactoryReset 3 | oxide `epframebuffer.h` |
| `UpdateFlag` | bit `0x01` = CompleteRefresh (whole-panel flash); bit `0x04` changes the drive (373 to 634 ms) | rmpp-display-notes `content_flags_probe` |
| `EPContentType` | 0 mono, 1 grayscale, 2 colour. Quill's "COLOR = 1" is really the grayscale hint | rmpp-display-notes section 2 (Oxide's header lists only 0/1: the sources disagree **[?]**) |
| Mode used on the glass | `swapBuffers_impl` hardcodes the waveform-file mode (2, 5, 6, 7 seen) per content branch; the `EPScreenMode` is not the file's mode index | rmpp-display-notes section 5 |

### 9.4 Completion and collisions (the question that matters)

| Question | Finding | Source |
|---|---|---|
| Token returned by `swapBuffers` | `unsigned long`; observed constant `2` for fast and quality swaps. **Not a completion handle**; no per-swap query exists on this overload | [S] [quill device test](https://github.com/maximerivest/quill/blob/main/docs/device-test-2026-07-12.md), DISPLAY-STACK section 2 |
| Wait call | `EPFramebufferSwtcon::sync()` (`_ZN19EPFramebufferSwtcon4syncEv`, the only sync on aarch64): a `usleep` spin on a queue-drain field. Global, no arguments | [S] oxide `epframebuffer.h`, DISPLAY-STACK |
| `sync()` times (300x300 rect) | Pen 372 ms, Mono 634, Animation 304, UI 630, Content 1086, Sleep 627; full-panel Content about 1.10 s | [S] DISPLAY-STACK |
| Does `sync()` mean the glass has settled? | **Probably not.** Its time did not change when the waveform was cut to 35%; the authors conclude it waits for queue drain per swap config, not for physical phases. Our own LCDIF-busy figure is about 1.4 s in every mode ([L] section 0), more than any `sync()` time above | [S] + [L]; reading is **[I]** |
| Signals | `framebufferUpdated(QRect)` is documented in Oxide's recreated header as "update submitted", not complete **[?]** (recreation, unverified). `syncAfterUpdate` (vtable slot 24, 0xc0) is hooked by Oxide to call `sync()` | [S] oxide `epframebuffer.h`, `libblight_client/qt.cpp` |
| Oxide's own wait | `Wait` message and D-Bus `waitForNoRepaints` call `EPFramebuffer::instance()->sync()`. The per-update `marker` is ignored on aarch64; only the rM1 uses `MXCFB_WAIT_FOR_UPDATE_COMPLETE` | [S] [oxide `connection.cpp`](https://github.com/Eeems-Org/oxide/blob/master/applications/display-server/connection.cpp) |
| qtfb | Messages are initialize, update, terminate, input, set-refresh-mode, request-full-refresh, device-state. **No ack or completion message** | [S] qtfb `common.h` |
| Overlapping updates, rMPP | Disjoint rects drive concurrently (16 rects take as long as 1). 120 rapid swaps of one rect drain in 358 ms, not 120 x 350: in-flight updates are **coalesced / re-targeted**, not queued. No pixel diff: a no-change swap still drives about 375 ms | [S] DISPLAY-STACK section 2 (`region_sync_probe`) |
| Overlapping updates, rM2 (nearest reversed relative) | New rect is clipped out of pending items; against items already playing, an overlap-dependency list is built and the older item's lifetime gates the batch (skipped when neither item has `Sync` and both have `FastDraw`; why is still open). A per-pixel 16-bit state is kept | [S] [swtcon_architecture.md](https://github.com/timower/rM2-stuff/blob/master/doc/swtcon_architecture.md) |

What follows for us **[I]**:
- Without a per-update handle, the only supported fence is `sync()` (use it from the same process that owns the engine; in Quill takeover that is our process). Use it as a lower bound and add a margin or the LCDIF-busy signal for "pixels are quiet".
- The engine reuses per-pixel state, so a re-touched pixel is re-targeted from where it is rather than corrupted **[I from rM2 code]**. Ghost and coloured residue then come from driving a pixel again before the previous drive settles, which no collision rule in the engine prevents. A hold-off per tile is still the right defence (already option B).
- Nobody has reversed the Acep2 (colour) collision path. Treat every statement about blending on the rMPP as **[?]**.

### 9.5 What an open engine would need

| Piece | Known | Unknown |
|---|---|---|
| Output path | `/dev/dri/card0`, dumb buffers, atomic `FB_ID` flips at 85 Hz, device `cumulus-panel`; LCDIF to MIPI-DSI to FPGA (ferrari) [S] kernel + DISPLAY-STACK | **How a drive phase is packed in the 405x1084x24 DSI frame for the Lattice bridge [?]** |
| Move, for comparison | 365x1700 RGB565 transport at 85 Hz with a fixed control structure (header row, sync stripe, active region); "the frame sequence is the waveform"; no FPGA [S] [chiappa eink.md](https://github.com/gitman-101111/chiappa/blob/main/docs/eink.md) | Whether ferrari's DSI payload resembles it [?] |
| Waveform files | `/usr/share/remarkable/GAL3_<lot>_*.eink`, 314 files, one chosen at boot from the EPD serial. De-XOR `0x08`, 16-byte BE header, custom LZ; 553,207 bytes decoded; 8 modes x 9 temperatures (0,7,13,18,22,28,33,38,43,50 C); RLE bands of 32x32 gray-to-gray phases. Byte-exact codec exists (`eink_codec.py`) [S] DISPLAY-STACK sections 3 and 4 | Meaning of each mode index, how colour particles map onto phases [?] |
| Colour tables | `ct33_{std,fast,pen,best}.bin` and `colortable_*.bin` (65536 x 8 LUT indexed by the 16-bit transport value, Move) [S] chiappa eink.md | Format of `ct33_*.bin`; their role next to `.eink` [?]. (Section 1 names only `ct33`; the `.eink` files are the per-lot waveforms.) |
| Phase counts at about 26 C (T4) | mode 1: 168, mode 2: 297, mode 3: 119, mode 4: 114, mode 6: 638, mode 7: 19 [S] DISPLAY-STACK | Frame time per phase beyond the 85 Hz clock [?] |
| Temperature | `/sys/class/hwmon/hwmon8/temp1_input` (`rm_hwmon_temp`) [S] DISPLAY-STACK | Poll rate, hysteresis [?] |
| Voltages | PMIC rails +-6/+-12/+-24 V; VCOM 500000 uV in the ferrari DT; Move panel lot VCOM -0.58 V, set by the engine ("sets the EPD bias voltage") [S] kernel, chiappa | Who sets what on ferrari, safe limits [?] |
| Engine internals | `swapBuffers_impl` calls `update` 14 times; phase generator and vsync threads on a fixed clock; two parse paths, `load_wf_data`/`getFrame` is the live one [S] DISPLAY-STACK | Scheduler, per-pixel state layout, Acep2 colour layer [?] |
| Capture method for validation | `LD_PRELOAD` into xochitl to trace `MODE_ATOMIC` commits (done on the Move) [S] chiappa eink.md | Not done on ferrari [?] |

Waveform editing was tried: bind-mounting a truncated `.eink` over the vendor file (reversible, `/usr` is read-only) showed **no measurable software speedup** in six runs; only a camera or photodiode can measure the glass **[S]** DISPLAY-STACK section 6. Physics analysis found no free settle tail: every phase cut trades about 1:1 against contrast.

Precedent for effort **[S]** [waved git log](https://github.com/matteodelabre/waved): first commit 2021-08-17, last 2022-06-16, 58 commits, still labelled "prototype, use at your own risk", rM2 only, with a public WBF format and fbdev. The rMPP has the codec already solved but the transport, the colour pipeline and the scheduler open.

### 9.6 Verdict

| Option | What | Effort **[I]** | Risk |
|---|---|---|---|
| 1. Reuse an existing path | qtfb (xochitl alive) or Quill takeover as in sections 6 and 7 | none | none new |
| 2. Extend Quill / `libqsgepaper` usage | (a) call overload B (region + per-region mode map) through `dlsym`, add `quill_swap_region`; (b) call `sync()` as the fence and pace per-tile updates on it plus a margin; (c) `ghostControl(BleachNow)` for clean-up instead of a full flash; (d) mode sweep of section 6 option A including Animation (2), the fastest `sync()` at 304 ms | days | Low: documented vendor calls, restorable session. Unknown enum values may crash the engine; run under takeover only |
| 3. Own TCON (userspace DRM driver) | Needs the FPGA phase packing, colour pipeline, scheduler, temperature, voltages | **months**, mono-only DU first; waved took about 10 months for a prototype with an easier base **[I]** | **High.** A wrong frame stream is a wrong drive: chiappa notes a single held frame drives the panel for about 6 s, and long unbalanced drive can degrade or stain an electrophoretic panel **[I]**; no source documents damage on this panel **[?]**. Wrong rail or VCOM settings could stress the panel or PMIC. Developer mode wipes user data **[S]** chiappa README |

Recommendation: do option 2 now (it answers the collision question with a supported call). Treat option 3 as unjustified until option 2 is measured with a camera. If it is ever started, use a staged plan that never leaves the vendor engine in control of voltages: (1) `LD_PRELOAD` capture of xochitl's `drmModeAtomicCommit` frames on ferrari and diff them against the Move format; (2) replay a captured vendor sequence on an idle panel; (3) only then generate a mono DU sequence from the `.eink` bands; never edit PMIC or VCOM settings.

### 9.7 Open questions

- The `ct33_*.bin` role (section 1 treats them as the LUTs; the newer notes say `.eink` holds the waveforms) **[?]**.
- Whether `sync()` can return before the glass settles on ferrari (the 1.4 s LCDIF figure suggests so); one run of `sync()` against the `/proc/interrupts` method answers it.
- Whether `framebufferUpdated` fires at submit or at drain **[?]**.
- Whether the Move and ferrari share the engine's colour layer; the Move DT and kernel are public, ferrari's FPGA firmware is loaded from the vendor image **[S]** kernel.
- 2025-2026 firmware: no announcement of a display API found; OS 3.28/3.29 changed the `swapBuffers` signature **[L]** (section 1), not the openness.
- Local research clones are in the session scratchpad only; nothing was committed.
