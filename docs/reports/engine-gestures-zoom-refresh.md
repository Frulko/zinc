# Gestures, zoom and refresh: one engine model instead of one per app

2026-10-26. Owner: "il faut complètement revoir le principe de gesture, de zoom et de refresh du moteur pour gérer ça de manière fast et
uniforme dans n'importe quelle app qui en a besoin". Research and design only; nothing measured on the tablet. Figures marked *(estimate)* are
not measured; the only measured Paper Pro numbers are in `rmpp-latency-2026-09-29.md`.

## Short answer

Today every reMarkable app recognizes its own pinch on raw touches, re-renders its whole content every gesture frame, and the driver guesses
from "two fingers for 150 ms" when to switch the whole qtfb connection to the fast waveform, a switch AppLoad answers with a hard 1 s sleep,
twice per pinch, plus a 1.5 s timer for the clean-up refresh. That is the stutter the owner sees.

Recommended model, in four layers that each exist once:

1. **Gestures** are recognized once, by `zinc:ui` (it already has `onPinch`/`onDrag`/wheel-pinch); apps stop reading `touchCount()`.
2. **`<ZoomView>`**, a new `zinc:ui` primitive: at gesture start it keeps the content's last painted picture; during the gesture it only
   draws that picture scaled/translated (one blit, no relayout, no ink rebake); on release it applies the final zoom (re-layout for a node
   subtree, or calls the app's `render(scale, rect)` for a bitmap source such as a PDF page or a web shot) and declares "settle".
3. **Refresh intent** instead of display modes: a frame carries `interactive`, `normal` or `settle`; `zinc:ui` sets it itself (live grab
   → interactive, gesture end once the sharp frame is drawn → settle). Apps never toggle `display.mode` again.
4. **The driver maps the intent to a waveform per update**: the panel's fast mono waveform for interactive frames and pen strokes, the UI
   waveform otherwise, one full refresh after `settle`. On qtfb this needs a fourth AppLoad patch (a refresh mode carried by each
   update, without AppLoad's 1 s sleep); without it the driver falls back to today's global switch. Every other target ignores the intent.

## 1. What exists today

### Apps

| App | Gesture code | During the gesture | On release | Refresh |
|---|---|---|---|---|
| Web (`app/web`) | Own pinch/pan/swipe on raw `touchCount()/touchX()` in the Canvas `onDraw` (`app/web/src/pageview.ts:46-75`) | Every frame: `ink.drawOver` with a new `(ox, oy, z)` (`pageview.ts:21-27`), which marks the ink image stale and **rebakes it**: clear, the relay picture scaled, every visible stroke (`plugins/ink/index.ts:215-218, 248-262`). Full 1620×2160 damage per frame | `zoomTo` / `pan` fetch a sharp shot from the relay (`app/web/src/state.ts:209-226`) | Driver's 2-finger gesture mode |
| Web page size | A−/A+ steps through device-pixel ratios `[1.1 … 3]` (`state.ts:27-28`) | n/a | relay re-renders the page at that dpr | normal |
| PDF (`app/pdf`) | Same code as Web, copied (`app/pdf/src/pageview.ts:13-83`; the two files differ by ~45 lines) | Same rebake of PDFium's page image + ink every frame | `zoomTo` re-renders the page with PDFium (`app/pdf/src/state.ts:175`); +/− buttons (`main.tsx:50-51`) | same |
| Markdown (`app/markdown`) | No pinch; `ScrollView` for lists; A−/A+ font steps relayout the paginated document (`state.ts:133-138`) | n/a | relayout at the next font size | normal |
| Notes, dashboard (`examples/remarkable`) | No zoom | | | |
| Ink tools | `InkPalette` calls `setPenMode(open)` (`plugins/remarkable/index.tsx:125, 141-142`): `device('display.mode','fast'|'ui')`, a global qtfb mode switch | | | |

### Engine (`lib/std/ui.ts`)

- Pointer events already carry gesture phases and pinch data: `phase`, `dx/dy`, `scale`, `rotation`, centroid (`ui.ts:40-43`); handler
  kinds `PDRAG`, `PPINCH` (`ui.ts:753-761`).
- Multitouch: the first finger is the pointer; a second finger over an `onPinch` node takes the grab and pinches
  (`secondFinger`/`pinchUpdate`/`pinchEnd`, `ui.ts:6358-6393`); over a node without `onPinch` but with a wheel handler, the spread is sent as
  a trackpad pinch (`spread`, `ui.ts:6370-6379`). HAL touches feed it (`halTouches`, `ui.ts:6407`). Deterministic test hook `touchAt`
  (`ui.ts:6430`).
- A style scale `k` zooms a node and its subtree (`ui.ts:379, 1161`); text at a scale uses the nearest baked font (`fontAtScale`, `ui.ts:4011`).
- Scroll tiles: `ZINC_UI_TILES=1` keeps a scroll container's content as 256 px runtime images (`ui.ts:4019-4030`) — the same
  "draw a cached picture, re-record only when content changes" idea a zoom snapshot needs, but off by default and refused under a scale.
- No zoom container exists (`grep` for Zoom/maximumZoomScale finds none). ScrollView has iOS/Android inertia (`ui.ts:4855`), which on
  e-paper turns into many partial refreshes.

### Driver (`plugins/display-rmpp`)

| Layer | How a waveform is chosen | Cost of a change |
|---|---|---|
| L0 qtfb (AppLoad) | **One mode for the connection**: `set_mode` sends `MESSAGE_SET_REFRESH_MODE` (`rmpp.cpp:71-83`). AppLoad applies it, then `safetyWaitForEventLoopToCatchUp()` = `sleep_for(1s)` on that connection (AppLoad `src/qtfb/fbmanagement.cpp`); the same sleep follows `MESSAGE_REQUEST_FULL_REFRESH`. The driver blocks sends for 1.1 s (`mode_ready_us`, `rmpp.cpp:80-82, 314`) and repaints the whole panel after | ≥1.1 s frozen per switch |
| L1 ink lane | qtfb stays in UI; pen-down rectangles go to the lane in Pen mode (`lane.h:1-6`, `rmpp.cpp:280-287`) | none for ink |
| L2 lease (Quill) | **Per swap**: `api.swap(x,y,w,h, mode, full, content)` with Pen or colour mode per rectangle (`native.h:47-61`) | none |
| Desktop emulator | `eink.h` policy per update: FAST small / QUALITY large / FULL (`eink.h:1-16, 27`) | none |

- Gesture mode: 2+ fingers for 150 ms → `gesture = true` → FAST; last finger up → app's mode, and `full_due = now + 1.5 s` → one full
  refresh (`rmpp.cpp:117-131, 309-316`). So a pinch pays: 150 ms detection + 1.1 s sleep entering FAST + 1.1 s sleep leaving it + a
  1.5 s timer + 1.1 s after the full refresh.
- Update rate caps: 60 Hz in FAST, **8 Hz in UI** (`plugin.json` `fast_hz`/`color_hz`, `rmpp.cpp:85-92`); measured compositor paints in UI
  mode ≈ every 125 ms (`rmpp-latency-2026-09-29.md`).
- Ghost clean-up: a full refresh once partial area ≥ 100 % of the panel or 300 updates and 1.5 s idle with the pen up (`eink.h:46-58`).
- HAL: `HalFrame` has damage, `render_damage`, moves (`HalMove`, scroll), command lists (`runtime/include/hal.h:117-140`); **no field says
  what kind of frame it is**. The only hints are `device()` strings: `display.mode`, `display.refresh` (`zinc:gfx refreshDisplay`,
  `src/frontend/modules.cpp:116`).

### Why it stutters (root causes, in order of cost)

1. AppLoad's 1 s sleep on every mode switch and full refresh, paid 3 times per pinch (L0).
2. Each app re-renders its whole content every gesture frame (ink rebake + scaled background over 3.5 Mpx in software) *(estimate:
   tens of ms per frame on the A53)*.
3. The gesture is detected twice (app on raw touches, driver on finger count) with different rules; the 1.5 s settle timer is a guess,
   not "the sharp picture is drawn".
4. Two copies of the same gesture code (Web, PDF); Markdown and Notes have none.

## 2. Reference stacks

| Stack | During the gesture | At the end |
|---|---|---|
| iOS `UIScrollView` zoom | the zoomed view's existing layer is transformed (scale), not redrawn | `scrollViewDidEndZooming`: the app redraws at the final scale (`CATiledLayer` tiles fill in) |
| Android `ScaleGestureDetector` | the detector reports a scale factor; the app usually applies a matrix to a cached bitmap | app re-renders at the final scale |
| Flutter `InteractiveViewer` | a `Transform` over the child (GPU, the child is not rebuilt) | `onInteractionEnd`; the child re-renders only if it chooses |
| PDF.js | CSS transform of the current canvas while zooming | re-render at the new scale; large pages progressively by tiles |
| KOReader (e-ink) | nothing redrawn while fingers move *(unverified)* | one render at the final zoom, one refresh |
| xochitl (e-ink) | live preview in a fast monochrome waveform *(observed behaviour, not documented)* | redraw in the UI waveform, clean refresh |
| rmweb (WebKit on the Paper Pro) | page turns 120-250 ms (author, `remarkable-embedded-browser.md`); zoom not documented | |

All of them do the same thing: **transform the last picture while the gesture lasts, render once at the end**. On e-paper the extra rule
is: fast waveform while it moves, one clean refresh when the final picture is on the panel.

## 3. The design

### 3.1 Gestures: one recognizer

`zinc:ui` keeps the only recognizer (it exists). Additions: `onPinch` also reports the translation of the centroid (pan during a pinch,
needed for "the point under the fingers stays under the fingers"); a pinch may start on a node whose ancestor is a `ZoomView`. Apps delete
their `fingersInput` code.

### 3.2 `<ZoomView>` (zinc:ui)

```tsx
// a node subtree (Markdown, a list, a Notes canvas): re-laid out at the final scale
<ZoomView minZoom={1} maxZoom={4} onZoomEnd={(z, ox, oy) => …}>{children}</ZoomView>
// a bitmap source (PDF page, web shot): the app renders the visible rect at a scale, possibly async
<ZoomView minZoom={1} maxZoom={4} width={pageW} height={pageH} render={(scale, x, y, w, h) => imageOrPromise} />
```

- **Start** (pinch phase 0, or a drag when zoomed): record the view's current content into one runtime image (`beginImage/endImage`,
  as the scroll tiles do). Ink drawn by `zinc:ink` is part of that picture.
- **Move**: draw the image with the live transform (`drawImageRect`, one scaled blit); children are not painted, nothing re-laid out.
  Frame intent `interactive`.
- **End**: commit `zoom`/`offset`. Node mode: set the content's scale `k` and lay out again; bitmap mode: call `render` for the visible
  rect at the final scale, keep showing the transformed snapshot until it resolves. When the sharp frame is painted: intent `settle`.
- **Double tap** toggles fit / 2×; the wheel with Ctrl and trackpad pinch use the same path (desktop).
- E-paper: no inertia, no animated snap-back (clamp at once); tablet hosts with a GPU may animate.
- Later, for very large zoom: the bitmap source asks for 256 px tiles of the visible rect (PDF.js style, reusing the scroll-tile cache).

### 3.3 Refresh intent

- `HalFrame` gains `int32_t intent`: `0` normal, `1` interactive, `2` settle. Additive; a HAL that ignores it is unchanged.
- `zinc:ui` sets it: `interactive` while a grab is live (drag, pinch, scroll by finger) and for the frames of a ZoomView gesture;
  `settle` on the first frame after a gesture whose content is final (ZoomView after `render` resolved; a scroll when the finger lifts);
  `normal` otherwise.
- `zinc:gfx refreshIntent('interactive' | 'settle' | 'normal')` for code that is not a `zinc:ui` gesture (video, a game, the relay's
  page load). `setPenMode`/`display.mode` become a no-op alias kept one release, then removed (ink strokes are recognized by the driver
  from the pen, see below).

### 3.4 Driver: a waveform per update

| Frame / damage | Waveform |
|---|---|
| pen down, its rectangles | fast mono (Pen) — L1 lane or per-update fast |
| `interactive` | fast mono (UFAST), up to `fast_hz` |
| `normal` | UI (colour), up to `color_hz` |
| `settle` | the frame in UI, then one full refresh as soon as it is sent (no timer) |
| ghost budget reached, idle | full refresh (as today) |

- **L2, emulator**: already per-update; map the intent onto `eink::Mode`/`native::swap` modes.
- **L0 qtfb**: AppLoad patch `0004-update-mode.patch` (beside 0001-0003, `integrations/remarkable-engine/appload/`): a new capability
  bit (`CAPABILITY_UPDATE_MODE`, 4) and `MESSAGE_UPDATE` carrying the refresh mode in `update.type` (`UPDATE_PARTIAL | mode << 8`) applied
  to that update only, and `MESSAGE_REQUEST_FULL_REFRESH` without the 1 s sleep when that bit is negotiated. The driver uses it when the
  bit is present; otherwise it keeps today's global switch (enter FAST on `interactive`, leave on `settle`), which still drops the 150 ms
  finger heuristic and the 1.5 s timer. Installing the patch reloads AppLoad inside xochitl: an owner-run step (one xochitl restart).
- **Other targets**: desktop/GPU, web, phones ignore the intent (or use it to prefer latency over quality: no vsync wait on
  `interactive`); other e-paper HALs (a future Kobo/Kindle EPDC through `display-fbdev`) map it the same way as L2.

### 3.5 Budgets (Paper Pro, 4× A53, 1620×2160)

| Step | Target | Basis |
|---|---|---|
| Gesture frame (scaled blit of a 3.5 Mpx snapshot) | ≤ 40 ms *(estimate; measure with zbench)* | one `drawImageRect`, no layout, no ink |
| Fast waveform update rate | `fast_hz` 60 cap; visible rate set by the panel *(unverified)* | `plugin.json` |
| Mode change on L0 with 0004 | 0 ms (per update) | patch |
| Mode change on L0 without 0004 | 1.1 s, twice per gesture → once with intent (enter only) | `fbmanagement.cpp` sleep |
| Final render | PDF page: PDFium time; web: relay round trip; Markdown: relayout | app-specific |
| Clean refresh | starts when the final frame is sent (not 1.5 s later) | |

## 4. Alternatives (RULES.md §4: fit ×3, performance ×3, size ×2, maintainability ×2, licence ×2, portability ×1, effort ×1; max 70)

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Score |
|---|---|---|---|---|---|---|---|---|
| A. Keep per-app gestures, tune the driver (shorter timers) | 2 | 2 | 5 | 1 | 5 | 2 | 5 | 42 |
| B. Driver-only: per-update waveform (0004) + intent, apps unchanged | 3 | 3 | 5 | 3 | 5 | 3 | 4 | 50 |
| **C. B + `ZoomView` snapshot-transform + one recognizer (recommended)** | 5 | 5 | 4 | 5 | 5 | 5 | 2 | **63** |
| D. C with progressive tiles from day one | 5 | 5 | 3 | 3 | 5 | 5 | 1 | 56 |

C keeps tiles as a later step for 4× zoom of large pages (D).

## 5. Implementation steps, in order

1. **Intent in the HAL and `zinc:ui`**: `HalFrame.intent`, `zinc:gfx refreshIntent()`, `ui.ts` sets interactive/settle around grabs.
   Driver: map intent on L2 and the emulator; on L0 replace the finger heuristic and `full_due` timer with the intent (global switch).
   Test: `rmpp_sim` trace `interactive → mode FAST … settle → mode UI full refresh` with no 150 ms/1.5 s constants; T0 unit on `ui.ts`
   intent for a scripted drag.
2. **AppLoad 0004** (per-update mode, no sleep, capability bit) + driver use of it; `tests/native/rmpp/sim.cpp` gains the bit. Test: trace
   shows `update FAST`/`update UI` per message and no `mode` messages; fallback trace with the bit absent. Owner step: install AppLoad.
3. **`<ZoomView>`** in `zinc:ui` (node and bitmap modes, double tap, Ctrl+wheel). Tests: `touchAt` pinch → `onZoomEnd` values; pixel
   goldens of a mid-gesture frame (scaled snapshot) and the final frame; a counter proving children/ink are not repainted during the gesture.
4. **Migrate PDF and Web** to the bitmap mode; delete both `fingersInput` copies and the per-frame ink rebake path; keep `zoomTo`/`pan`
   as the `render` side. Existing `pdf_reader`, `web_relay` tests updated.
5. **Notes**: canvas zoom in node mode (ink keeps page coordinates, `zinc:ink` already takes `ox/oy/z`). **Markdown**: pinch in node
   mode mapped to the nearest font step on release (reflow zoom, Kindle-style), the A−/A+ buttons kept.
6. **Remove `setPenMode`/`display.mode`** from `InkPalette` and the apps once 1-2 ship (pen rectangles are fast per update).
7. Later (one line in `backlog/later.md`): progressive tiles for bitmap sources at high zoom; measure the gesture frame time on the
   tablet with zbench (`ZINC_RMPP_*` traces) and log it in `zinc-next-perf.md`.
