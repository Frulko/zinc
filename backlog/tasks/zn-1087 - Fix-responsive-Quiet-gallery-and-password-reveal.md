---
id: ZN-1087
title: Fix responsive Quiet gallery and password reveal
status: Done
assignee: []
created_date: '2026-11-09 14:28'
updated_date: '2026-11-09 14:58'
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
- [x] #1 PICTURE=gallery fits narrow tablet/desktop widths without horizontal clipping, scrolls to every card and responds correctly to resize; other illustration modes remain unchanged
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

### Final proof under ordinary defaults — 2026-11-09

- The two minimized engine blockers are resolved at their shared sources: ZN-1091 (`b189f5bab`) releases the native startup aspect lock when UI follows the window; ZN-1092 (`414861c46`) measures nested wrapped content against the actual allocated line width. The gallery carries no resize override or layout workaround.
- Fresh proof tree `work/1087-gallery-proof` was rebased on `414861c46`. `zinc check docs/img/design/src` passed against the clean retained binary. No app or shared kit code needed another change; other PICTURE modes, entrypoint and config remain unchanged.
- `/tmp/1087-final-proof/main.tsx` imports the actual Gallery from this tree. It corrects the original probe to select the first outer vertical scroller (`scroller < 0 && (n.scroll & 1) !== 0`), preserving the bottom assertion and additionally checking the final MinGW control fits fully in the viewport.
- Bounded native interpreter proof passed without `ZINC_RESIZE` or `ZINC_SIZE`: native widths360/768/1024/1440 matched exactly, all visible nodes stayed within horizontal bounds, and the final card/control remained reachable. Outer scroll offsets were2342/1423/968/0px respectively. At360 the eye hit-test targeted the actual button; pointer reveal, edited value, Enter hide, Space reveal and editing focus all passed. The final control bounds were211,729,72,30 at360;494,721,72,30 at768/1024;1190,888,72,30 at1440.
- `/tmp/1087-final-proof/details.tsx` passed a second small geometry/capture proof: at768, middle column353,24,390,1319 and next column24,1364,720,835 leave exactly21px between them. `/tmp/1087-details-12.png` visibly confirms the chart-to-reviewers gap. Settled captures avoid the existing button colour transition immediately after theme changes.
- Inspected all17 `/tmp/1087-final-{3,15,20,24,28,42,46,50,51,64,68,72,73,82,86,90,94}.png`, plus all6 `/tmp/1087-details-{12,16,20,32,46,50}.png`: light/dark, top/bottom across all four widths. Useful final images:360 eye/edit `/tmp/1087-final-15.png`;360 final card `/tmp/1087-final-20.png`;768 settled light `/tmp/1087-details-20.png`;768 gap `/tmp/1087-details-12.png`;768 settled dark `/tmp/1087-details-32.png`;1024 settled dark `/tmp/1087-details-50.png`;1440 light `/tmp/1087-final-94.png`.
- Ordinary user path also passed: `PICTURE=gallery zinc run docs/img/design/src --interp`, bounded/background with only `ZINC_ROOT`, `ZINC_FRAMES=3` and `ZINC_SHOT=/tmp/1087-ordinary.png` for the proof. No zoom, size or resize override; default760x300 capture inspected. Every started run exited0; process inspection found no remaining proof process.

Exact final proof commands (from the proof worktree; `zinc` below is `/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`; `work-run` is `/Users/mowmow/Lab/zinc/tools/work-run`):

```sh
work-run 30 env ZINC_ROOT=$PWD zinc check docs/img/design/src
work-run 45 env ZINC_ROOT=$PWD ZINC_BACKGROUND=1 ZINC_ZOOM=1 ZINC_FRAMES=96 ZINC_SHOT=/tmp/1087-final.png ZINC_SHOT_FRAMES=3,15,20,24,28,42,46,50,51,64,68,72,73,82,86,90,94 zinc run /tmp/1087-final-proof --interp
work-run 30 env ZINC_ROOT=$PWD ZINC_BACKGROUND=1 ZINC_ZOOM=1 ZINC_FRAMES=52 ZINC_SHOT=/tmp/1087-details.png ZINC_SHOT_FRAMES=12,16,20,32,46,50 zinc run /tmp/1087-final-proof/details.tsx --interp
work-run 30 env ZINC_ROOT=$PWD PICTURE=gallery ZINC_BACKGROUND=1 ZINC_FRAMES=3 ZINC_SHOT=/tmp/1087-ordinary.png zinc run docs/img/design/src --interp
```

**Proposed tests**
- At the owner's milestone: physical Tab/Shift-Tab, Enter/Space and pointer against `PICTURE=gallery zinc run docs/img/design/src`, light/dark at all four widths; about2min, memory not measured. Current proof uses the actual UI hit-test/key/edit path through scripted calls, not physical input or VoiceOver.
- At the owner's milestone: AOT smoke of the unchanged-source gallery and existing kit_inputs regression; duration/memory not measured. Final gallery run here used the interpreter; no new app suite, golden, T1/T2/demo run, pixel comparison, benchmark, cross run or size gate.

Usage: n/a (`tools/usage`).
