---
id: ZN-1022
title: 'Classic layout: CSS conformance of 100% sizes, basis, shrink and flex-1'
status: Review
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-09 02:00'
labels:
  - layout
  - ui
  - size-M
milestone: m-17
dependencies: []
ordinal: 7300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the classic layout `h-full`/`w-full` along the main axis grows past its parent, a row child with `basis-N` is measured for the offered width, a growing column never shrinks below its content, and a plain `flex-1` grows from content width instead of `flex: 1 1 0%`. Fix and re-record the affected goldens in one commit with a list of what moved.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-737: `h-full` / `w-full` along the main axis grows past its parent in the classic layout (CSS: 100%); fixing it in the core moves pixels and needs the prototype goldens. hero's shell was the case seen (fixed there with `absolute inset-0`).
- ZN-737: a row child with `basis-N` is measured for the offered width, not its basis (scroll range 30 for 170 on a probe).
- ZN-737: the classic layout never shrinks a growing column whose content is wider than its siblings leave (310 px in a 220 px slot).
- zinc:ui classic: a plain `flex-1` (without `min-w-0`) still grows from its content width, not Tailwind's `flex: 1 1 0%` (`flex-1 min-w-0` works since f3dc85238); align it and rerun the layout goldens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 four probes lay out as in Chrome (tools/layout-fixtures)
- [ ] #2 layout-fuzz shows no new difference
- [x] #3 changed goldens listed in the commit, hero and nuxt-ui frames reviewed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked 2026-11-09 (parallel worktree agent).

Research (sonnet search): CSS Flexbox 1 §9.7 resolve flexible lengths (freeze loop, shrink weighted by shrink x base, hypothetical = base clamped by min/max) and §4.5 automatic minimum size (min(content, specified size), 0 for scroll containers) https://www.w3.org/TR/css-flexbox-1/#resolve-flexible-lengths ; a percent flex-basis of an indefinite container is `content` (so flex-1 in an auto-height column keeps its content height); Taffy's gentest records Chrome boxes the same way https://medium.com/visly/unit-testing-rust-using-chrome-b8b93572a91d ; WPT css-flexbox and Firefox's flexbox_layout_testcases.js as further fixtures.

Done (lib/std/ui.ts):
- `flex-1` is Tailwind's `flex: 1 1 0%` (new UiNode field `flex1`): grows from 0, shrinks, stops at its automatic minimum (content minimum, at most its specified size; 0 with min-w-0, overflow-hidden, a scroll box or truncate). `grow` keeps classic's meaning.
- `w-full` in a row / `h-full` in a column is 100% of the line (flex-basis), shrinks by default, minimum min(content, 100%): it no longer grows with its content past its parent. In a wrapped line it takes a whole line.
- cssFlex(): CSS's resolve-flexible-lengths loop for a line holding such a child (measure() for rows, place() for both axes), sizes rounded so neighbours touch. Lines without one keep the legacy code path (no pixel moves there). The content minimum of a row child is measured (at width 0) only when its share falls below its measured width, so a flex-1 row with room costs no extra measure.
- A row child with `basis-N` below its content is measured again at its basis (scroll range of the ZN-737 probe).
- Root cause found on nuxt-ui: `w-full w-[280px]` kept both (fullW stayed set). The last width/height class now wins (w-*, h-*, w-full, h-full clear each other), as tailwind-merge does in Nuxt UI.

Proof: tests/golden/layout-css (19 boxes: h-full with tall content and overflow-hidden, w-full beside a bar and two w-full, basis-200 with a wrap, flex-1 wrap beside a bar, flex-1 equal shares, min-content clamp, min-w-0, auto and fixed columns) equals Chrome's boxes from the new `tools/layout-fixtures --chrome tests/golden/layout-css`, on the interpreter, AOT (--native) and QuickJS. New T0 `tests/t0/layout_css.sh` passes.

Frames reviewed (headless shots, before = develop lib, after = this lib): hero home/gallery/detail/playground/tasks/settings/kit/forms/navigation/palette/dialog/dark identical. nuxt-ui Home/Inbox/Settings/Navigation/navigation page identical; Customers: the filter Input is 280 px as its className says (it grew before: w-full w-[280px]); Components and gallery: the 4 input variants row (four w-full in a row) moves 1 px (equal shares rounded). webcam: the format segmented controls (flex-1) now have equal segments. rn-showcase, app/inspector identical. Goldens checked unchanged: classic-shrink, ui-textlayout (after making truncate count as overflow-hidden), 17 ui-style scenes using flex-1/w-full/h-full. No golden re-recorded.

Demos that could move (flex-1 / w-full / h-full along the main axis, or w-full plus a fixed width): nuxt-ui (Customers, Components), webcam, webrtc-call, discord, carnet, carnet-nbe, photo-sorter, hero-novideo, murdoku, app/inspector, app/riffle, app/maison, app/figma-live, lib/std/navigation users (rn-showcase, rn-port), lib/std/kit callstats.

Open: AC #2 (tools/layout-fuzz) is a milestone run for the owner; not run here.

Decision to record (coordinator): classic sizes flex-1 / w-full / h-full by CSS (flex 1 1 0%, 100% basis, automatic minimum) only on lines that hold one; every other line keeps classic's rules (no default shrink, grow from content). Why: Tailwind meaning for the classes people write, Chrome as reference, and no pixel move in lines without them.

Lines for backlog/later.md:
- ZN-1022: flex-1 in a flex-wrap row still breaks lines by content width (CSS breaks by the hypothetical size, the content minimum).
- ZN-1022: `shrink` / `flex-auto` / `flex-initial` children of classic still shrink to 0, not to their automatic minimum (CSS); only flex-1 and w-full/h-full lines have it.
- ZN-1022: the style prop `flex: 1` without the react-native preset still means grow over the content (only the class changed).

Proposed tests (owner picks):
- `tools/layout-fuzz --cases 200`: no new difference against Chrome (AC #2), ~2 min, one headless Chrome, ~400 MB.
- `tests/run --only layout_compat,style_flex,style_size,ui_textlayout,classic_shrink,ui_style,navigation,scroll_platform,text_touch,ui_grow_wrap,classic_rewrap`: classic goldens that use these classes, ~1 min, <300 MB.
- `tests/t1/layout_conformance.sh`: the classic baseline keeps its cases, ~30 s.
- nuxt-ui and webcam T1 sessions / `tools/proto-capture compare` on nuxt-ui and webcam: re-bless the frames that moved (Customers filter width, input row 1 px, webcam segments), a few minutes, ~500 MB.
- `tests/t0/ui_alloc_layout.sh`: a relayout still allocates nothing, 10 s.
<!-- SECTION:NOTES:END -->
