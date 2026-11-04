# Fast pinch-zoom and pan on the reMarkable Paper Pro (qtfb): research

Date 2026-10-27. Web and source research only; nothing was run on the tablet.
Confidence is marked per item: **[src]** read in source, **[doc]** vendor or press text, **[inf]** inference to test.
Not found anywhere public: how xochitl itself draws its zoom ghost, and measured Paper Pro waveform latencies. Those are open questions (last section).

## 1. What the Paper Pro path really is

### 1.1 qtfb protocol (AppLoad, `asivery/rm-appload`, `src/qtfb/common.h`, `fbmanagement.cpp`)
- Source: https://github.com/asivery/rm-appload (qtfb was merged into it; the old repo https://github.com/asivery/qtfb is archived).
- Client messages: `UPDATE` (type ALL or PARTIAL with x,y,w,h), `SET_REFRESH_MODE`, `REQUEST_FULL_REFRESH`. **[src]**
- Modes: `UFAST 0, FAST 1, ANIMATE 2, CONTENT 3, UI 4` (5 = SLEEP, rejected by the server: it accepts only 0..4). **[src]**
- The mode is a property of the whole framebuffer item (`FBController::refreshMode`), not of an update. A QML array maps it to one of xochitl's native EPaper modes, and an update becomes a Qt `update(rect)` of the item, so xochitl's scene-graph e-paper node paints it with the current mode. **[src]**
- The rm1/rm2 shim maps mxcfb waveforms to these modes: GC16 -> CONTENT, GL16 -> UI, DU -> FAST, A2 -> ANIMATE; it never uses UFAST. **[src]** `shim/src/fb-shim.cpp`, `translateWaveformMode`. The names suggest the order UFAST < FAST < ANIMATE < CONTENT < UI by quality; which real waveform each one is (DU, A2, GL16, GC16, Gallery 3 colour or mono) is not documented. **[inf]**
- **Blocking sleeps (important).** In `managementClientThread`, `SET_REFRESH_MODE` and `REQUEST_FULL_REFRESH` both end with `safetyWaitForEventLoopToCatchUp()`, which is `sleep_for(1s)`, on the same thread that reads that client's socket. Every message queued behind them (including the next UPDATE) waits at least 1 s. **[src]** Check that the installed AppLoad build has the same code.
- `UPDATE` is fire-and-forget: it posts `markedUpdate(rect)` to the GUI thread (`Qt::QueuedConnection`). There is no completion callback, so "waiting for the panel" has to be a timer on our side. Qt coalesces overlapping `update()` calls before the next paint, so over-sending is cheap on the CPU but not free on the panel. **[src/inf]**
- 5-finger tap = full refresh (`requestFullRefresh`, "5-finger gesture"). **[src]**
- Pixel formats: RGB888, RGBA8888, RGB565 for the Pro (1620x2160). RGB565 halves memory traffic for the ghost copy. **[src]**

### 1.2 Panel numbers (E Ink Gallery 3 press release, April 2022)
- Source: https://www.eink.com/news/detail/E%20Ink_Launches_E%20Ink_Gallery_3_Color_ePaper_for_Sustainable_Digital_Reading
- Black and white 350 ms, fast colour 500 ms, standard colour 750 to 1000 ms, best colour 1500 ms, pen (B/W) 30 ms. **[doc]** E Ink admits real use is slower (https://www.mobiflip.de/?p=424698).
- Gen 1 was 2 s mono / 10 s colour; "fast mode may be slightly more muted" (https://goodereader.com/blog/?p=255323).
- Consequence: a 160 ms cadence is already faster than the panel's best published full-area B/W update (350 ms). Real throughput is about 3 updates/s, and fewer for colour. More updates in flight do not make it faster; they only queue or collide. **[inf]**
- reMarkable claims 12 ms pen latency (https://www.tomsguide.com/tablets/remarkable-paper-pro): that is a small-rect, mono pen path, not a model for a full-page ghost.

## 2. Techniques

Each entry: what, who, source, expected gain, application to our driver.

### T1. Never switch mode or request a full refresh in the interaction loop
- What: mode and full-refresh calls are expensive in qtfb (1 s of stalled socket thread each, see 1.1).
- Who: our driver is the only one hit; KOReader on rM avoids the cost by choosing the waveform per update (see T9).
- Gain: removes up to 2 to 3 s of dead time per pinch (mode->0 at start, mode->4 at end, full refresh at release). Likely the largest single win. **[src]**
- Apply: set the mode once per gesture at most; ideally keep one mode for the whole gesture, send the sharp page at the end with no mode message and no `REQUEST_FULL_REFRESH`. If a mode switch is unavoidable, issue it before the first ghost frame, not between ghost and sharp page, and measure with timestamps on the socket.

### T2. Sharp page on release: clean partial, not full refresh
- What: after zoom, redraw only the page rect with a content/UI waveform. A full-screen flash is not needed to erase a fast-mode ghost if the following waveform is a non-fast grey one.
- Who: KOReader maps `ui` to GL16/AUTO and `partial` to GL16/REAGL, and only promotes to a flashing refresh every N partials: `FULL_REFRESH_COUNT` default 6, with promotion when the counter reaches N-1; `fast` is DU. A scroll in progress forces `fast`; on stop the page is repainted `partial`. Sources: https://github.com/koreader/koreader/blob/master/frontend/ui/uimanager.lua and https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer_mxcfb.lua. Plato has the same split (`Fast`, `FastMono`, `Gui`, `Partial`, `Full`): https://github.com/baskerville/plato.
- Gain: avoids a visible black/white flash and the 1 s stall (T1); costs one 350 to 1500 ms settle. **[doc/inf]**
- Apply: on release send `UPDATE_PARTIAL` of the page rect with mode CONTENT(3) or UI(4); keep a counter of zooms and request a full refresh only every ~6 to 10 zooms, or when the user asks (or when ghost residue is measured, see T10).

### T3. Draw the ghost in black and white, ordered-dithered
- What: A2/DU-class fast waveforms drive only black or white; feeding them grey or colour causes thresholding artefacts and ghost. Pre-dither the ghost to 1 bit (Bayer ordered, not error diffusion, so a pan or a step does not shimmer).
- Who: KOReader sets `EPDC_FLAG_FORCE_MONOCHROME` for DU/A2 and uses `EPDC_FLAG_USE_DITHERING_ORDERED` with 1 quant bit for A2/DU on Zelda/Rex/MK7 (source above, section "Monochrome and dithering"). Kobo MTK uses `HWTCON_FLAG_USE_DITHERING` Y8_Y1_S for DU. KOReader skips hardware dithering on colour panels where the CFA pipeline already dithers. Boox "Fast/Ultrafast" modes trade ghosting for speed: https://techpowerup.com/forums/posts/5107903, https://goodereader.com/blog/?p=369432. mxcfb exposes `EPDC_FLAG_FORCE_MONOCHROME` and an ordered-dither enum: https://coral.googlesource.com/linux-imx/+/refs/tags/9-3/include/uapi/linux/mxcfb.h.
- Gain: less ghost left to clear, and (on Gallery 3) colour pigment is not moved, which is the slow part (mono 350 ms vs 500+ ms colour). **[doc/inf]**
- Apply: in the C scaler, convert luma and write a Bayer 4x4 or 8x8 threshold to the shared buffer as 0/255 RGB. Do the dither at the destination resolution (after scaling), with the pattern anchored to screen coordinates so it is stable between frames. We do not know whether xochitl's UFAST/FAST do their own dither on RGB888; test UFAST with a pre-dithered buffer against a grey one and compare ghost.

### T4. Ghost at low resolution and in discrete steps
- What: scale from a small source (render the page once at ~1/4 area), and change the ghost only when zoom changes by a visible step (for example 10%) instead of every touch sample.
- Who: general practice; the old e-ink "pixelised preview first, full render after" behaviour is described at https://www.mobileread.com/forums/showthread.php?p=58471 (thread about a Sony/iRex viewer). Desktop analogue: KDE shows a nearest filter during pinch until re-render (https://bugs.kde.org/show_bug.cgi?id=390706).
- Gain: the panel does not care about source resolution, but CPU does: nearest-neighbour 1620x2160x3 per frame is ~10 MB written; at 1/2 res source and RGB565 or 1-bit-packed output, far less. Stepping zoom reduces update count by 2 to 5x. **[inf]**
- Apply: precompute the page at one reduced size; scale from it; skip a frame when the dithered result differs from the last sent one in fewer than ~2% of pixels (cheap XOR count).

### T5. Update only what changed
- What: send the bounding box of changed pixels, not the page. Gallery 3 update time scales with the waveform, not strictly with area, but power, collision and Qt repaint cost scale with area, and smaller rects can be merged less.
- Who: KOReader merges colliding refreshes into the union rect and takes the higher-precedence mode ("a2 < fast < ui < partial < flashui < flashpartial < full"), so one update, not two; the EPDC merges edge-adjacent rects (comment in `uimanager.lua`). mxcfb `UPDATE_SCHEME_QUEUE_AND_MERGE` does the same in the kernel: https://coral.googlesource.com/linux-imx/+/refs/tags/9-3/include/uapi/linux/mxcfb.h.
- Gain: pinch ghost where the zoomed page does not cover the screen: less area. Panning: only the newly exposed strips plus the moved region, if dither is stable (T3). **[inf]**
- Apply: diff the new dithered ghost against the previous one (memcmp per row band) and send the changed bbox. If the diff is >60% of the screen, send ALL-type update (fewer messages) rather than many rects.

### T6. Pipelining: one update in flight, timed from measurement, not 160 ms constant
- What: an e-paper controller runs update processing and waveform driving as separate async stages (NXP: https://community.nxp.com/t5/i-MX-Processors/what-s-the-EPDC-STANDARD-MODE/m-p/659623). Sending a second update on an overlapping area before the first has finished either collides (mxcfb) or is queued/merged. KOReader never sets `EPDC_FLAG_TEST_COLLISION` and waits on the marker only for flashing/GC16/REAGL updates, not for `fast` (source above, section "Marker and collision handling"): fast updates are fire-and-forget.
- Gain: with 350 ms as the published floor, the useful ceiling is ~3 fps. Waiting every 160 ms does not exceed that. The gain is from not sending frames that cannot be shown. **[inf]**
- Apply: keep one in flight; always send the latest ghost (drop stale frames, never queue them); derive the interval from observed panel time (qtfb gives no completion event, so calibrate once per mode with the camera or by checking when a following update stops smearing). Disjoint rects may overlap in flight (pan strips), overlapping rects should not.

### T7. Colour off during interaction
- What: Gallery 3 is a 4-particle ink; colour needs longer waveforms (500 ms fast colour vs 350 ms B/W, up to 1500 ms best). A B/W ghost lets the controller use its fast mono waveform.
- Who: E Ink spec above; KOReader keeps separate colour waveforms (GCC16, GLRC16) for dithered REAGL/FULL on Kaleido and uses plain DU/A2 for fast.
- Apply: part of T3; the sharp page after release can be colour using UI/CONTENT.

### T8. Use FAST (1) as the main ghost mode, UFAST (0) only for tiny moving regions
- What: the shim maps DU to FAST and never uses UFAST; DU is the mode KOReader uses for fast on nearly every device (and A2 only where it looks good; Kindle Touch/PW and Bookeen use DU because A2 looks poor or the driver auto-promotes A2 to a full GC16 flash). Source: `framebuffer_mxcfb.lua` above.
- Gain: A2 is ~120 ms vs DU ~260 ms on monochrome IT8951 panels (https://unpkg.com/it8951@0.1.1/docs/enums/_it8951_.waveform.md), so UFAST (if it is A2-like) is quicker but ghosts more and may be what makes the later "full" necessary. **[doc/inf]**
- Apply: A/B test UFAST vs FAST for the ghost with T3 on; if UFAST ghost is gone after one CONTENT partial (T2), keep UFAST.

### T9. Mode per update, not per framebuffer (what we cannot do)
- KOReader chooses the waveform per refresh. qtfb has one mode per framebuffer and it takes up to 1 s to change. Workaround: run two qtfb framebuffers (two AppLoad windows or two keys) stacked, one in FAST for the ghost, one in CONTENT/UI for the page. **[inf]** Needs AppLoad support for two surfaces and is not tested; a lower-effort route is to ask upstream (or patch the local AppLoad) to carry the mode in `UpdateRegionMessageContents` and drop the 1 s sleeps. The sleeps' stated intent is only to let the event loop catch up.

### T10. Ghost control: count, do not guess
- KOReader's counter model (6 partials then a flash, `FULL_REFRESH_COUNT`) works because the user sees accumulated ghost only slowly. For us: count fast ghost updates per area; clean with one CONTENT partial on the dirty bbox when the count is high; a full refresh only on a larger threshold or an explicit user action. The "cheap clean" is GL16/REAGL-class in KOReader ("partial"); there is no public proof that the Paper Pro CONTENT mode is ghost-free, so measure. **[inf]**

## 3. Other platforms, for reference
- mxcfb: markers + `MXCFB_WAIT_FOR_UPDATE_COMPLETE`, schemes snapshot / queue / queue-and-merge, `WAVEFORM_MODE_AUTO`, `EPDC_FLAG_FORCE_MONOCHROME`, `EPDC_FLAG_USE_REGAL` (header above). Not visible to us on the Pro: qtfb hides all of it.
- Boox: modes HD / Balanced / Fast / Ultrafast (and A2 for web/scroll) trade ghost for speed; no public API (https://techpowerup.com/forums/posts/5107903). Nothing citable on "X mode".
- PocketBook: KOReader uses level-based fast/partial pairs (DU/GL16 at level 3) and DU at temp 24 for speed (source above).
- Hackers' rm1/rm2 stacks (rm2fb, rmkit) go through mxcfb or direct drive; the Pro has no mxcfb equivalent, so qtfb's 5 modes are all we get. (libqsgepaper-snoop https://github.com/pl-semiotics/libqsgepaper-snoop covers rM1/2 only.) The remagic "Quill" host claims to drive the panel "directly through the vendor waveform engine for instant-ink latency" (https://github.com/maximerivest/remagic): worth reading if we ever leave qtfb; no numbers published.

## 4. Open questions to settle with one measurement run (not done here)
1. Which physical waveform is each qtfb mode, and per-mode latency for a full-page rect and a 400x400 rect (filming at 240 fps, or a photodiode).
2. Does the installed AppLoad still sleep 1 s in `SET_REFRESH_MODE` and `REQUEST_FULL_REFRESH`.
3. Does UFAST accept RGB888 grey or does it need a 0/255 buffer.
4. How xochitl draws its own zoom ghost (not public; only reverse engineering of `libqsgepaper` would tell).

## 5. Ranked: five changes most likely to make the pinch faster and cut full refreshes

1. **Remove mode switches and `REQUEST_FULL_REFRESH` from the gesture path** (T1). Each costs a 1 s stall of the whole update queue in AppLoad. Pick one mode for the ghost before the gesture, send the final page with no further control message.
2. **Replace the full refresh on release by one CONTENT/UI partial of the page rect** (T2), with a counter that triggers a real full refresh only every ~6 to 10 zooms or on user request (T10).
3. **Pre-dither the ghost to 1-bit, ordered, anchored to screen coordinates, mono only** (T3, T7), and test UFAST vs FAST for it (T8). Less ghost to clear, fastest mono waveform.
4. **Send fewer, smaller updates**: ghost from a reduced-resolution source, zoom in discrete steps, skip frames whose dithered diff is tiny, send only the changed bbox, one in flight with the latest frame only (T4, T5, T6). The panel cannot beat ~350 ms mono, so cadence below that is wasted.
5. **Per-update mode**: patch AppLoad (carry the mode in the update message, drop the sleeps) or use two framebuffers (T9). This is the structural fix that makes 1 to 4 unnecessary to work around, but it needs a change outside our repo.
