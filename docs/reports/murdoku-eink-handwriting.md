# Murdoku e-ink mode and local handwriting recognition

Date 2026-11-01. Research and decisions only: nothing built, run or changed outside this file. Paths are those of `develop`.

## 1. What exists

**Murdoku** (`examples/murdoku`, `zinc.json`: `orientation: landscape`, macOS target only, `scheme: light`). Cells take a letter A-E or V, a pencil
note, or a manual X; `src/state.ts` holds placements, notes and crosses, `src/deduction.ts` the blocked cells. Input today is click/tap on a portrait
card then on cells (README "Play"). Art is sprites and floor textures (`assets/`), rooms are colours: all of it needs an e-ink variant.

**Ink** (`plugins/ink/index.ts`, `zinc:ink`, targets incl. `rmpp`). `Ink.feed(x, y, pressure, flags)` turns the gfx pen queue (`penCount/penX/penY/penPressure/penFlags`)
into `Stroke{pts: x,y,p triples, bbox}`; tools, erasers, undo, JSON/SVG export, `<InkCanvas>`. Each pen sample is one 2-point stroke command appended after
the canvas image (tiny damage rect); finished strokes are baked into a runtime image (`bakeTail`, `rebake`, `drawOver`). It has **no recognition** of any kind
(grep for handwriting: only the surface). `examples/remarkable/notes` and `dashboard` use it.

**Display driver** (`plugins/display-rmpp`). `eink.h` is the refresh policy shared by the device and the desktop emulator: the runtime gives a damage rect,
the driver shrinks it to changed pixels, quantizes (Bayer 4x4) and picks FAST (mono, small area <= 1/8 of the panel), QUALITY (greys and colour, no flash,
also the idle upgrade of queued fast areas after `upgrade_ms` 350), FULL (page-sized change >= 60 %, or after `full_every` partials, or ghost accounting
`full_after_pct/updates/idle_ms`). `rmpp.cpp` picks the layer: L1 ink canvas/lane (xochitl's Pen waveform on the stroke rectangles, `integrations/remarkable-ink`),
L2 ink session (`native.h`, lease), L0 qtfb (AppLoad). `plugin.json` options: `ink`, `refresh_mode` (`ui`|`fast`), `fast_hz`, `color_hz`, `header`, `keyboard`.
`zinc:gfx refreshIntent('interactive'|'settle'|'normal')` exists and `lib/std/ui.ts:16` uses it for pinch (design `docs/reports/engine-gestures-zoom-refresh.md` s3.3). So an
**e-ink refresh API exists**, but only as intent per frame; no per-rect "refresh this region with waveform X now".
`input.h`: Marker on evdev (pressure, tilt, eraser end, 480 Hz) on a reader thread, touch via AppLoad or evdev MT, edge-swipe recognition, `pen_rotate` per model
(`models.h`). `tests/rmpp/qtfb.cpp` covers palm rejection, quick taps, multitouch (README "What is verified").

**Models** (`models.h`, `docs/targets/remarkable-paper-pro.md`): Paper Pro 1620x2160 colour (Ferrari, verified OS 3.27/3.29), Move 954x1696 colour, Paper Pure and
rM2 1404x1872 mono (rM2 via rm2fb). The profile `rmpp` in `targets/capabilities.json`: touch, pen true, `eink: true`, `gpu: none`, T0, `ui.layout classic`, ram 256 MB, `rn: true`.

**reMarkable plugin** (`plugins/remarkable`): `RemarkableBar`, `RemarkableApp` (widget, Accueil/Quitter system panel from the top-edge swipe, docked header).
**Engine on tablet and shell**: `integrations/remarkable-engine` (`zinc-app`, `zinc-tile`, `qtfb-hold`, AppLoad patches), `app/hub` + `app/hub-server` (the reMarkable store:
signed catalog, `installs.ts` makes one `.zapp` + one AppLoad tile per app), `docs/reports/zinc-shell/03-design.md` s6 reuses that hub for the Pi. So distribution
channel = `zinc publish` of a `.zapp` to hub-server, install through the hub on the tablet. Nothing Murdoku-specific needed except a manifest and an icon.

**Layers and dirty rects.** The runtime already diffs frames into damage rects and the driver diffs again (`eink.h changed()`), so static content costs nothing
when it does not change. Runtime images (`createImage/beginImage/endImage/drawImage`) are the layer primitive: `ui.ts` uses them for tile caches (~4350) and
`ui.openLayer` is a z-order/modal layer, not a cache. `zinc:ink` already uses the "baked image + live tail" pattern. Missing: a reusable `Layer` component
that says "this subtree is cached as an image, repaint only when I say", and a way for the app to name the waveform for a rect.

**Gaps found** (to be fixed in the engine, not worked around):
1. **No landscape on the panel.** Nothing in `rmpp.cpp`/`input.h` rotates frame, pen or touch; `app.orientation` is honoured only on mobile hosts (`src/host/hal_dispatch.cpp:217`). Murdoku landscape needs a driver rotation (frame blit rotate 90/270 inside `present`, `pen_rot`/touch rotated to match, `zinc:sys` orientation signal), preferably following the tablet's physical orientation.
2. **No e-ink style mode.** `grep eink lib/std` finds only `refreshIntent`; capabilities has `eink: true` but `zinc:ui` does not read it. No palette snapping (Gallery 3 primaries), no "no gradients/shadows/opacity" mode, no pattern fills.
3. **No recognition** in `zinc:ink`.
4. **Palm rejection is tested at the socket level only**; no pen-near-glass rule in `input.h` (touches are not dropped while the Marker hovers or touches).
5. **Fast-waveform lag unresolved**: `docs/reports/rmpp-latency-2026-09-29.md`; the canvas/lane layer (ZN-839) is untested on a tablet. Murdoku must work on L0/qtfb latency, with L1 as a bonus.

## 2. Decisions for the Murdoku e-ink mode

**D-a Style.** A `zinc:ui` "ink" scheme chosen from `capabilities.eink`: tokens only (the app already has `scheme`). Rules: black on white; room identity by pattern
(hatch, dots, cross-hatch, stripes: drawn from one tiny pattern image per room, no tint); colour used only as one flat accent on Paper Pro (red for the crossed/accuse state),
snapped to Gallery 3 primaries so the driver does not dither; borders 2 px, text >= 28 px at 229 ppi; sprites replaced by 1-bit line art or a plain glyph per decor type.
No transitions, no veils: disabled states use hatching. Reuse the existing reduced-motion path (`reducemotion` signal) and force it on e-ink.

**D-b Layers.** Three runtime images, composited by the normal frame:
- **Board layer** (grid, rooms, decor, clues): rebuilt only on puzzle change, orientation change or theme change. Full QUALITY + one FULL refresh when it changes.
- **Ink layer** (`zinc:ink` baked strokes, plus recognised letters re-typeset): changes per stroke; the live tail uses FAST on the stroke rect; at pen-up (debounce below) the cell rect is repainted QUALITY once.
- **UI layer** (toolbar, undo, hint, status): tiny rects, FAST on tap feedback (invert), QUALITY after.
Generic result: a `Layer` helper in `zinc:ui` (cached subtree image + `invalidate()`), not Murdoku code. Refresh decisions stay in the driver (`eink.h`); we add one API: `refreshRect(x,y,w,h,'fast'|'quality'|'full')` in `zinc:gfx` (additive HAL field next to `intent`), used for (a) a recognised letter replacing ink: QUALITY on the cell, (b) a solved puzzle or board change: FULL once. Never refresh the whole board for a single cell; do a FULL only on new puzzle, rotation, or the driver's own ghost counter (`full_after_*`).

**D-c Gestures** (all in `zinc:ui`'s recogniser, per `engine-gestures-zoom-refresh.md`, apps do not read raw touches): finger tap = select cell / button; two-finger tap = undo (new `onTwoFingerTap`); horizontal swipe with 1 finger outside the board = previous/next hint page; top-edge swipe stays xochitl/AppLoad's. Palm rejection (new, in `input.h`): ignore touches while the pen is in range (hover or down) and for 300 ms after pen-up; ignore touch blobs whose contact is large when the model reports it; a touch that starts while the pen is down is dropped. Finger never draws.

**D-d Pen semantics** (App-level, over the recogniser of s3):
- A stroke group (strokes close in time and space, below) is classified into: `X`, `circle`, `letter(c)`, `circle+letter(c)`, `tick`, `scribble` (-> erase intent, optional), `unknown`.
- `circle+letter(c)` = firm placement of c in that cell; `letter(c)` bare = pencil note of c (toggle); `X` over an empty cell = manual cross; unknown = ink stays as free annotation, fades nowhere (e-ink), cell gets a thin "?" mark only on long press. The recognised glyph replaces the handwriting by a typeset letter (circled or small): the screen then shows state, and the ink is kept in the ink layer only if the user turns "keep handwriting" on.
- Undo (two-finger tap or button) removes the last recognised action as well as its ink.
- The same `deduction.ts` functions are the single source of truth: recognition only produces the existing actions (`place`, `toggleNote`, `toggleCross`).

## 3. Stroke segmentation and attribution

- **Cell attribution**: a group is attributed to the cell containing the centroid of the group's bounding box if >= 60 % of the box area lies inside one cell; otherwise to the cell of the first stroke's start. Boxes spanning several cells are `unknown`. Cells have >= 190 px at 229 ppi on a 6x6 board portrait, so the letter must fit inside; the board layout guarantees min cell 160 px on Move, else board scrolls/zooms.
- **Grouping**: a stroke joins the open group if its bbox (inflated 20 % of the cell) overlaps the group's bbox and the gap since pen-up < the debounce.
- **Debounce**: finish a group after 450 ms of pen-up (tunable per user, 300-900 ms; a long press on a button forces "now"). A circle drawn after the letter or before, either order: both strokes are in the group. Circle detection: closed (end within 25 % of path length from the start), aspect 0.6-1.6, one stroke whose bbox encloses the other strokes' bbox. If circle + inner strokes: recognise the inner strokes only, as a letter.
- **X**: two strokes crossing (each nearly straight), or one stroke with a sharp turn; covers >= 50 % of the cell. Recognised by the shape class, not the letter classifier.
- **Latency**: recognition runs after the debounce, on a worker thread (the engine has `threads: true` on rmpp), result delivered by a message; budget 20 ms total on Cortex-A55, 40 ms on A53. The e-ink panel's own 100-500 ms refresh dominates.
- **Letters**: classify the normalized group (aspect-preserving scale into a 1x1 box, resample at 32 points per stroke, <= 3 strokes for B). Rejection: if the best score < threshold or the margin to the second < 0.15, the result is `unknown` and the cell shows nothing (never guess).
- **Ambiguity** to handle by constraint: only letters A-E and V are legal; V and a cross-stroke "X-like" check and "D vs circle" are the confusable pairs. The board knows which letters are still free (row/column/people), so priors reweight candidates (a letter already placed is penalised).

## 4. Recogniser research

Closed set: A B C D E V, circle, X, tick (+ reject). Needs: tens of ms on Cortex-A53/A55, < 1 MB model, no cloud, offline trainable from a small dataset, usable from any app, portable to AOT/QuickJS and ESP32.

Findings:
- Searches found no open local handwriting recogniser for reMarkable: community tools (reMarkable Remember, reScript, RMirror, ghostwriter) call MyScript or cloud LLMs. Local recognition is a gap we fill, not a library we can take.
- The $-family (University of Washington, `depts.washington.edu/acelab/proj/dollar`): $1 (single stroke, rotation invariant: wrong for letters, we need orientation), $N (multi-stroke), **$P / $P+ / $Q** (point-cloud, stroke-order and number invariant; $Q is the fast low-power one, ~142x faster than $P). Reference code is JS and C#, BSD-style licence, ~150 lines; no vendor-worthy C++ library exists, but the algorithm is simple enough to write once (a recogniser is not one of the things AGENTS.md forbids writing: regex, TLS, rasterizer, SQL, codec, JSON). Templates: a few per class; accuracy for letters with 10+ templates/class is 95-98 % on clean single-writer data, worse across writers.
- Rubine: features + linear classifier, tiny, single-stroke bias, weak for multi-stroke A/B/E.
- Learned online-stroke models (QuickDraw-style GRU or 1-D CNN on resampled (x, y, pen-up) sequences, or a CNN on a 28x28 raster plus direction channels): 30-150 KB int8, 0.1-2 ms on A53 for 8-10 classes; generalise across writers when trained with augmentation. Datasets exist for letters (EMNIST is offline rasters; UNIPEN and IAM-OnDB for online characters; QuickDraw has shape classes circle/X/check). EMNIST letters are raster images: usable only via synthetic strokes, so we collect our own.
- Runtimes: TFLite Micro (Apache-2.0, needs flatbuffers, kernels, build weight), ncnn (BSD-3, NEON, CMake, ~1-2 MB lib, fine on ARM64), ONNX Runtime (MIT, >10 MB, wrong scale), microsoft/ELL (archived, 2020; reject). For a 3-conv + dense net a hand-written int8 inference is ~250 lines and runs identically in the interpreter, AOT, QuickJS and ESP32.

Scores (RULES.md s4; fit x3, perf x3, size x2, maint x2, licence x2, portability x1, effort x1; max 70):

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **Staged: own $Q (shapes + letters baseline) then tiny CNN with our own int8 kernels, weights as a file** | 5 | 5 | 5 | 4 | 5 | 5 | 3 | **66** |
| $Q only | 3 | 5 | 5 | 5 | 5 | 5 | 5 | 64 |
| ncnn + tiny CNN | 4 | 5 | 3 | 4 | 5 | 4 | 3 | 58 |
| TFLite Micro + tiny CNN | 4 | 4 | 4 | 3 | 5 | 5 | 2 | 55 |
| ONNX Runtime | 3 | 4 | 1 | 4 | 5 | 3 | 4 | 48 |
| Rubine | 2 | 5 | 5 | 5 | 5 | 5 | 4 | 54 |

**Choice: staged, own code, no vendored runtime.**
1. Stage A: $Q-style matcher (C++ in `plugins/ink/native`, 2 native files, plus a JS/TS reference port used by the interpreter/web). Ships first because it needs no training pipeline, only templates; it classifies circle, X, tick and (with 8-12 recorded templates per letter) the letters. Gate: >= 95 % on the held-out set; enough to unlock the whole Murdoku flow.
2. Stage B: a tiny CNN (input 32x32 raster of the grouped strokes + 2 direction channels, 3 conv 3x3 int8, ~40-80 KB, 10 classes incl. reject), kernels written once in C (portable, NEON-optional via `__ARM_NEON`), weights in a versioned `.znm` file loaded with `zinc:fs`. Replaces A for letters when it beats it by >= 2 points on the held-out set; A stays as the fallback and the shape detector.
Revisit: if the model grows beyond 2 MB or needs more than 3 layer types, vendor ncnn at that point (BSD-3, ARM64, already runs with no GPU); the plugin API below does not change.

**Training data plan.** (a) Synthetic: render letters from 40+ handwriting-style fonts, convert glyph outlines to pen strokes with jitter, rotation +-12 degrees, slant +-15, scale, stroke-order variants, drawing speed (resample), pressure noise; circles (closed, open gap <= 25 %, ellipse), crosses (2 strokes, 1 stroke, crossing angle 40-110), ticks. (b) Self-collected: a recording mode in the notes app (`examples/remarkable/notes`) writing JSON stroke files (existing `toJSON`), 30 samples per class from the owner, 3 other people if available, on the real Marker; the 10 % held out per writer. (c) Negatives: random scribbles, partial letters, two letters, digits, long lines. (d) Training in Python (PyTorch or numpy) under `tools/ink-train/`, int8 post-training quantization, golden test: the C inference reproduces the Python logits within 1 LSB on 50 fixed inputs. The dataset (JSON) is committed small (< 2 MB) with its licence; pretrained models are generated, not hand-edited.

## 5. Plugin API (`zinc:ink`, usable by any app)

```ts
export interface Candidate { label: string; score: number }        // score 0..1, higher is better
export interface Recognition { kind: 'letter'|'shape'|'unknown'; candidates: Candidate[]; box: {x:number,y:number,w:number,h:number}; circled: boolean; ms: number }
export function recognise(strokes: Stroke[], opts?: { classes?: string[]; priors?: {[label:string]:number}; model?: string }): Recognition;
export function recogniseAsync(strokes: Stroke[], opts?): Promise<Recognition>;   // worker thread, delivers on the UI thread
export class StrokeGrouper { constructor(opts: { debounceMs?: number; gapPx?: number }); add(s: Stroke, now: number): void; poll(now: number): Stroke[][] | null }
export function loadModel(path: string): boolean;                  // optional Stage B model; the built-in templates answer without it
```
Classes: `A`-`Z`, `0`-`9` as the model allows, shapes `circle`, `x`, `tick`, `line`, `scribble`. `opts.classes` restricts the closed set (Murdoku: A-E, V, circle, x), `priors` reweights. The native side takes the plain stroke arrays, so tests run headless with no panel (`ZINC_HEADLESS=1`). Murdoku code is only the glue in `examples/murdoku/src/` (group -> cell -> action).

## 6. Engine improvements this brings (item 6)

Landscape on the panel (driver rotation + input rotation), `eink` in zinc:ui style tokens (e-ink scheme, patterns), `Layer` cache component, `refreshRect` API, pen-aware palm rejection, `onTwoFingerTap` gesture, a recorder in the notes app, a recognition worker thread. All reusable by every reMarkable app, and the recogniser is the premise of local handwriting recognition for Zinc (plugin API above, models as files, trainable by anyone).

## 7. Proposed tasks (ids not allocated; order is the dependency order)

1. **Pen-aware palm rejection and tilt in the input path** (display-rmpp, S). Drop touches while the pen is in range and 300 ms after, drop touches that start with the pen down. Done when `tests/rmpp/qtfb.cpp` has hover, down and late-touch cases; no regression of the existing palm test; env override `ZINC_RMPP_PALM_MS`. Depends: none.
2. **Landscape rotation for rmpp** (display-rmpp + src/host, M). The driver rotates the frame blit by 90/270 and maps pen and touch coordinates; `app.orientation` honoured; the emulator shows both. Done when the notes app runs landscape in the emulator (headless frame golden, both orientations) and the pen and touch land on the same cell in a scripted test. Depends: none.
3. **`eink` style mode in zinc:ui** (lib/std/ui.ts, M). With `capabilities.eink` (or `ZINC_EINK=1` on the Mac), tokens snap to black/white + Gallery 3 primaries, gradients/shadows/opacity are disabled, a `Pattern` fill (hatch, dots, stripes) replaces tints. Done when a style test shows no gradient/alpha commands in the frame dump, and a golden of a card with patterns on the emulator. Depends: none.
4. **Layer cache and `refreshRect`** (lib/std/ui.ts, runtime gfx, display-rmpp, M). `Layer` component caches a subtree as an image with `invalidate()`; `refreshRect(rect, 'fast'|'quality'|'full')` becomes an additive HAL field the rmpp driver maps to its waveform choice (`eink.h`). Done when a test shows an unchanged layer issues no commands and the rmpp harness records the requested mode per rect. Depends: 3 (for the pattern fills, not for the code).
5. **Stroke grouping and shape classes ($Q core)** (plugins/ink, M). `StrokeGrouper`, resample/normalise, $Q matcher in C++ with a TS reference, built-in templates for circle, x, tick, A-E, V. Done when a T0 test on the committed dataset reaches >= 95 % (letters) and >= 98 % (shapes), runs < 5 ms per group in the interpreter and AOT, and the TS and C++ results agree. Depends: 6 (data).
6. **Ink dataset recorder and synthetic generator** (tools/ink-train, examples/remarkable/notes, M). Record mode writes per-writer stroke JSON; the generator renders stroke variants from fonts; held-out split by writer. Done when `tools/ink-train/make-dataset` produces a deterministic JSON set < 2 MB and the recorder works in the emulator. Depends: none (do it first with 5 in parallel).
7. **`zinc:ink` recognise API and plugin docs** (plugins/ink, S). `recognise`, `recogniseAsync`, `classes`, `priors`, `loadModel`; a worker thread; the docs page `docs/plugins/ink.md` section. Done when a test calls it headless on all engines (interpreter, AOT, QuickJS) with equal results. Depends: 5.
8. **Murdoku e-ink skin and landscape/portrait layouts** (examples/murdoku, M). E-ink theme (patterns per room, line-art decor), board layer + UI layer, portrait and landscape layout from the size signal, zinc.json target `rmpp`. Done when the emulator frames at 1620x2160 and 2160x1620 (and 1404x1872 mono) show no gradient or tint, one golden each, and the Mac macOS app is unchanged. Depends: 2, 3, 4.
9. **Murdoku pen input: groups to actions** (examples/murdoku, M). Strokes grouped, attributed to cells, circled letter = place, bare letter = note, X = cross, unknown stays; typeset glyph replaces ink, two-finger tap undo, hint swipe. Done when a scripted pen session (stroke JSON replay) leads to the expected state on the Mac, and `deduction.ts` is the only rule source. Depends: 1, 7, 8.
10. **Tiny CNN letter model and int8 kernels** (plugins/ink native, tools/ink-train, L). Python training with augmentation, int8 quantization, `.znm` loader, C kernels. Done when the C logits match Python within 1 LSB on 50 inputs, the held-out letter accuracy beats Stage A by >= 2 points, the model is <= 150 KB and one group infers in <= 5 ms natively on the Mac (extrapolate for the tablet, measure there later). Depends: 5, 6.
11. **Publish Murdoku to the reMarkable hub** (app/hub-server, examples/murdoku, S). `zinc pack` + `zinc publish` of a `.zapp` with the manifest and icon, the hub's installs tile (`zinc-tile`) works for it. Done when the hub test of `app/hub` installs the package in the dry-run (no tablet) and the manifest is signed. Depends: 8.
12. **Tablet pass** (needs the tablet, M). Latency, ghosting, recognition on the real Marker, recorder dataset, landscape input mapping, L1 lane if installed. Done when the numbers are logged in `docs/reports/zinc-next-perf.md` and the tuned debounce/thresholds are committed. Depends: 9, 10, 11.

## 8. What cannot be proven on the Mac

- Pen latency and waveform choice (FAST vs QUALITY), ghosting, the colour settle on Gallery 3, the real Marker hover/pressure/tilt ranges, and how a real palm lands on the digitizer.
- Real handwriting from several writers (the Mac has only the mouse/trackpad; the recorder must be used on the tablet; synthetic data is only a start).
- Recognition time on Cortex-A53/A55 (measure with the cross-built engine on the tablet; Mac numbers are only a ceiling check).
- Landscape rotation of the real digitizer (`pen_rotate` per model; rM2 and Move are separate rows in `models.h`).
- AppLoad/hub install path and the lane/canvas layers (`zinc-canvas` is untested on a tablet); the emulator (`plugins/display-rmpp/emulator.cpp`) stands for them in tests.
- All tablet work follows the memory notes: never raw qtfb probes on the rMPP (a probe froze xochitl on 2026-10-28); run as Zinc apps through `zinc-tile`, close apps before any `xochitl` stop, never loop restarts (start-limit reboot of 2026-09-29).
