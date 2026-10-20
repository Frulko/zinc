# The first interaction: the desktop side

2026-10-16. The owner's report: on the Nexus 7 2012 (examples/rn-showcase, AOT, software raster), the first touch after launch is slow and
then everything is fluid. This is the desktop half. The device half is in `zinc-next-android.md`, "The first interaction". Binary:
`build/zinc` of main 23b98385. No code was changed.

## Verdict

**Not reproduced on the desktop.** Inside the engine's frames, the first interaction costs the same as a repeat of it, within a fraction of a
millisecond. The tablet measurements agree: inside the engine, tap 1 equals tap 2, and dropping the page cache changes nothing. Measuring
turned up one cost that hits **every** tap in a scroll view, the first one included: the scroll indicator makes the frame diff damage the
whole screen twice per tap. That is the cheapest thing to fix on the software raster, and it may be what the owner feels.

## How it was measured

- Real time throughout (`ZINC_TRACE` per-frame spans, `ZINC_DETERMINISTIC` unset), except for the structural scene dumps.
- **Headless** (`ZINC_HEADLESS=1`, `ZINC_INPUT`): the app, input, layout and paint phases. No raster, because the null HAL presents nothing.
- **Software raster with input**: `ZINC_INPUT` only works headless (`src/host/hal_dispatch.cpp:247`), and `ZINC_RECORD`/`ZINC_REPLAY`
  force headless (`hal_dispatch.cpp:34`). Two workarounds were used:
  - display-remote (`ZINC_DISPLAY=remote`, which rasterizes the damage) driven by a Python client over its TCP protocol;
  - a scratch copy of rn-showcase whose frame callback calls `ui.pointerAt` (env `TAPS` / `DRAGS`), run in a window with
    `ZINC_BACKGROUND=1 ZINC_RENDERER=cpu ZINC_RENDER_THREADS=1`.
- The machine was loaded the whole time (load average 18 to 35 on 6 cores, other worktrees building). Windowed wall times were therefore
  noisy: the same frame rasterized in 0.6 to 21 ms across runs. Only patterns that repeat across runs are reported.

## Numbers (first vs repeat)

| Run | Interaction frames (ms) |
|---|---|
| Headless AOT, tabs Stats / Discover / Stats / Discover, mouse | 0.69 / 0.71 / 0.58 / 0.60 (input 0.36 / 0.34 / 0.29 / 0.27, layout 0.28 / 0.34 / 0.27 / 0.30) |
| Same, touch events, 3 runs | 0.67-0.88 / 0.73-0.81 / 0.54-0.64 / 0.61-0.97 |
| Headless interpreter, same tabs | 1.59 / 1.92 / 1.52 / 1.68 |
| Headless interpreter, chip presses | 0.94 / 1.04 / 0.94 / 1.06 |
| display-remote AOT (software raster), tabs, 3 clean runs | 1.9 / 2.1 / 1.4 / 2.2; 4.2 / 2.1 / 1.5 / 2.2; 2.0 / 2.5 / 1.6 / 2.2 |
| hero AOT headless, shortcuts dialog open (30 frames), 3 runs | first open 3.5-3.8, second open 2.8-4.0; app phase 0.8-0.9 vs 0.2-0.6 |
| Page faults per interaction (`top -stats faults`) | AOT 2 / 3 / 4; interpreter 4 / 3 / 25 |

The first visit to a screen costs about +0.1 ms of input and layout (AOT) and up to +0.5 to 2.7 ms of raster. That is the shaped-text cache
(`src/text/shaped_gfx.cpp:81`) and the glyphs rasterized on first use (`runtime/ttf.cpp:250`): it is the first visit of a screen, not
the first touch. Scaled to the Tegra 3 (a tab switch takes 0.6 ms here against about 21 ms of input and layout there), it is a few
milliseconds. Cold code pages are ruled out on both sides: a handful of faults here, and no change on the device after dropping the page cache.

## The cost every tap in a scroll view pays

1. A finger down in a scroll container calls `directScroll` with dy = 0, which sets `n.scrolledAt = clock` (`lib/std/ui.ts:4386`; on
   Android a press is a finger, `dragScrolls` at `ui.ts:4268`). `paintScrollbars` (`ui.ts:3762-3775`) then draws the indicator for 1.2 s.
   It also sets `animating = true` for that time, so the whole tree is painted again every frame.
2. The frame diff compares the commands by index (`runtime/raster.cpp:1445`, `diff_rects`). The indicator is inserted before the
   container's UNCLIP, which shifts every command after it. The UNCLIP is then compared with a RECT, and `cmd_bounds` gives
   CLIP/UNCLIP/CLEAR the whole screen (`raster.cpp:1115`).
3. Scene dumps around a press on rn-showcase confirm it (deterministic, frames 100 to 174):
   - 100→101: 88→89 commands; index 71 goes from UNCLIP to RECT 415,2 3×600, so the whole screen is damaged.
   - 149→173: only the alpha of that RECT changes (110→0), so the damage is small.
   - 173→174: 89→88 commands, the UNCLIP is shifted again, and the whole screen is damaged a second time. The last indicator frame also
     draws a RECT at alpha 0.
4. In the window, single raster thread at 2×, a press on the empty gap of the tab bar, three times: the press frame rasterizes 3.7, 7.8,
   18.5 ms (and 10.4, 4.5, 11.5 ms in a second run), then 0.0 for the next five frames. The pixels did not change.
5. On the Nexus 7, a full-screen raster of 1280 × 800 takes about 23 ms (`zinc-next-android.md`, scrolling). So every tap in the feed gets
   two frames over budget for nothing visible, plus 1.2 s of full-tree paints.

## The smallest fix

- **Where all callers benefit: `diff_rects`** (and `diff_rects_sig`, `runtime/zrt_raster.h:191`, which must stay equal to it,
  `tests/t1/damage_sig.sh`).
  - Skip the common prefix, as today.
  - Also skip the common suffix: compare from the end while `same(a[na-1-k], b[nb-1-k])`.
  - Only the middle range of each frame is damaged.
  - With this, any command that appears or disappears damages only its own bounds. That covers the indicator, press highlights, focus
    rings, toasts and banners, on every HAL and every engine.
- **In `lib/std/ui.ts:4386`**: set `scrolledAt` only when the content moves (`dx !== 0 || dy !== 0`), as iOS and Android show their
  indicators. A tap then no longer starts 1.2 s of `animating`.
- **Optional**: skip the RECT when `al === 0` (`ui.ts:3768`).

**How to prove it:** a T0 case beside `damage_sig.sh`.
- Two scene dumps of rn-showcase, before and after a press: deterministic, `ZINC_INPUT` `90 move 145 815` / `100 down` / `103 up`,
  `ZINC_SHOT_FRAMES=100,101`, `ZINC_SCENE_DUMP`.
- Give `zinc capture --scene A --damage B` (`src/main.cpp:2074`) the union box of the damage, and assert it is the indicator's box
  (about 414,1 → 419,603).
- Today it prints the whole 420×860 screen. Pair it with a window run of `ZINC_RENDERER=cpu ZINC_PROFILE=1` where the press frame's
  raster drops to about 0.

## What is left for the device (not measurable here)

A first-touch-only cost, if there is one, lies outside the engine's frames. Two candidates:
- SDL's Java touch path running the first time in ART (`SDLSurface.onTouch` → `onNativeTouch`; a debuggable APK starts interpreted);
- Android's input dispatch.

Measure it on the tablet by logging, for tap 1 and tap 2, the time from `e.tfinger.timestamp` (SDL ticks, ns) to the end of the first
frame that shows the answer. A larger gap at tap 1 confirms it. If the gaps are equal, what the owner feels is the per-tap cost above,
plus the 42 to 55 ms of a screen switch on Tegra 3.
