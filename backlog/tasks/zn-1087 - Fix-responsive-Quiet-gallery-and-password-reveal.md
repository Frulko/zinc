---
id: ZN-1087
title: Fix responsive Quiet gallery and password reveal
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:28'
updated_date: '2026-11-09 14:42'
labels:
  - ui
  - demo
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1008
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request2026-11-09 with screenshots: the design-pictures gallery clips its right column when the window is narrower, and the password eye is misaligned and does nothing. Exact source is docs/img/design/src, PICTURE=gallery, NOT examples/ui/kit-gallery. gallery/gallery.tsx imposes405+506+405px columns plus gaps/padding, without scrolling; gallery/left.tsx overlays a decorative RoleIcon eye on Input with no button/action. Use the existing responsive/layout primitives and newly integrated kit PasswordField; preserve the Quiet composition, light/dark and all existing picture modes. Make the actual reveal control aligned, focusable, accessible and work on pointer/keyboard; reuse the kit provider rather than another app-local implementation. If an icon reveal refinement belongs in PasswordField, only that shared provider hunk is now free (Inputs worker finished).

Owner screenshots: /Users/mowmow/Desktop/Screenshot 2026-11-09 at15.25.07.png and15.25.09.png (actual filenames have space after at). Inspect originals via view_image. Source is a documentation app, but apply zinc-app and relevant zinc-demo proof principles. No new demo suite/golden by default: owner explicitly requests this interaction, so use bounded real pointer/key/resize proof and actual captures. Any actual engine gap gets minimized, not worked around.

Primary research supplied before task: WAI button pattern https://www.w3.org/WAI/ARIA/apg/patterns/button/ for keyboard/pressed semantics; Flutter adaptive constraints https://docs.flutter.dev/ui/adaptive-responsive/general for using available space rather than physical device names. Zinc docs/design.md and existing UI responsive classes/providers are binding; no new web dependency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PICTURE=gallery fits narrow tablet/desktop widths without horizontal clipping, scrolls to every card and responds correctly to resize; other illustration modes remain unchanged
- [x] #2 Password reveal uses the shared kit control with centred visible affordance, real pointer and keyboard toggling, accessible name/state, preserved text/edit focus and no duplicate decorative eye
- [x] #3 Actual bounded gallery proof and light/dark captures at representative narrow/mid/wide sizes are inspected; notes describe commands and limitations, no unnecessary new demo test suite
<!-- AC:END -->

## Implementation Notes

- Scope: `docs/img/design/src/gallery/{gallery,left,middle,right}.tsx`, shared `lib/std/kit/input.tsx`, existing `tests/t0/kit_inputs.sh`, changelog. Other picture modes and the gallery's app entry/config remain unchanged. No new demo test or golden.
- Need → provider → gap: responsive columns → existing flex wrapping/bases and responsive padding in `zinc:ui`; reachability → existing `ScrollView`; reveal → existing `PasswordField` and kit icon-sized `Button`. No layout framework, local reveal widget, polling or engine-specific app workaround.
- Research supplied before claim: WAI APG button pattern https://www.w3.org/WAI/ARIA/apg/patterns/button/ (Enter/Space, focus, stable toggle name and pressed state); Flutter adaptive constraints https://docs.flutter.dev/ui/adaptive-responsive/general and https://docs.flutter.dev/ui/layout/constraints (available constraints rather than device names). No dependency added.
- Inspected both owner screenshots. Fixed405/506/405px columns became wrapping300/380/300px flex bases with growth, responsive16/24/41px margins and vertical scrolling. Stats, calendar/date slots and chart bars adapt inside their available card width. Reviewer/release/coverage content can shrink.
- RunnerCard reuses PasswordField. The shared field overlays a centred kit eye button inside its editing region, reserves text padding, reports `aria-pressed`, keeps a stable accessible name, and restores editing focus without replacing the value. The optional Clear action remains outside that region. A small field uses a30px reveal button, so its hit box stays within its30px editor. Plain Input remains stateless and still supports legacy password masking.
- Proof: all heavy commands used `/Users/mowmow/Lab/zinc/tools/work-run`, clean read-only engine `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, `ZINC_ROOT=$PWD`, bounded headless or `ZINC_BACKGROUND=1`; no engine build, suite, T1/T2/demo/pixel comparison, benchmark, cross run or process left running. `zinc check docs/img/design/src` passed. Exact `tests/run --only kit_inputs` passed, including new default/small-size pointer containment/centering/pressed state and Enter/Space tests plus existing Solid editing and React interpreter/QuickJS state checks.
- Actual Gallery imported into temporary `/tmp/1087-proof/main.tsx`: bounded background interpreter run resized the real native window through `gfx.windowCtl` to360/768/1024/1440 logical pixels, asserted horizontal bounds, scrolled to Build matrix and exercised pointer reveal, edit, Enter hide, Space reveal, retained text and focus. With explicit `ZINC_RESIZE=fill ZINC_ZOOM=1`, the run passed. Inspected `/tmp/1087-live-{3,15,20,24,28,42,46,50,64,68,72,86}.png` (light/dark and top/bottom at all sizes), plus narrow calendar and QuickJS chart captures `/tmp/1087-calendar-360.png` and `/tmp/1087-chart-360-dark.png`. Final input-region refinement was rechecked with kit_inputs and those narrow component captures.

### Handover: criterion1 remains open for two engine gaps

1. Default native resize retains the startup aspect lock. Minimal `/tmp/1087-proof/resize.tsx` renders one View and calls `windowCtl(0,1,'',360,800)`; without explicit fill it reports `surface360x245 window360x245`. `targets/macos/hal_sdl.cpp` sets SDL's aspect ratio while startup `!fill`; later `hal_set_resize` changes fill without clearing that ratio. No config workaround was added. Coordinator notified with repro.
2. Nested flex wrapping does not propagate height to an outer wrapped row. `/tmp/1087-proof/wrap.tsx` has only ordinary Views: at768px its middle parent reports `353,24,390,221`, nested wrapped children use221px, then its100px sibling starts at266; the next outer column also starts at266 instead of387. In the actual768 capture the chart therefore overlaps the next column. Coordinator notified; no forced tablet single-column workaround.

Next commands after the coordinator's shared fixes: rerun both minimal repros against the rebuilt clean engine, then the background Gallery probe without `ZINC_RESIZE`, inspect tablet overlap and tick criterion1 only when both pass. The app portion of criterion1 is implemented; task stays Backlog until engine behavior is correct. No new task/decision was created. Existing kit-size metadata blocker is unrelated; no budgets or functionality were changed, and that gate was not rerun.

**Proposed tests**
- Replay `/tmp/1087-proof/main.tsx` without the fill override after the engine fixes: real360/768/1024/1440 resize, bounds, scroll and input, about3s plus compilation; memory not measured.
- At the owner's milestone: physical Tab/Shift-Tab, Enter/Space and pointer against `PICTURE=gallery zinc run docs/img/design/src`, light/dark at all four widths; about2min, memory not measured.
- At the owner's milestone: AOT smoke of the unchanged-source gallery and existing kit_inputs regression; duration/memory not measured. No AOT app run performed here.

Usage: n/a (`tools/usage`).
