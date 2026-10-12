---
id: ZN-737
title: 'UI: a scroll area cannot be scrolled to its end (hero''s gallery)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-12 16:35'
updated_date: '2026-10-12 17:02'
labels:
  - ui
  - layout
  - size-M
milestone: m-5
dependencies: []
ordinal: 64300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, with hero on the Pi 3B+ (800x480, touch): in the gallery the scroll does not go to the end, the last items cannot be brought fully into view. He suspects the computation of the viewport and of the scroll range, a defect of the UI core that every Zinc program has, not of hero. Find the cause by reproducing it (the range a scroll area allows against the height of its content and of what covers it), fix it where every scroll area goes through, and prove it on a scroll area that is not hero's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reproduced on the Mac, headless, at 800x480 and at one other size, with a scripted session: the numbers that are wrong are written in the notes (content height, viewport height, the largest scroll allowed, what it should be) and the cause is named in one sentence
- [x] #2 Fixed in the core (lib/std/ui.ts or the layout it calls), not in examples/hero; a regression test on a small scroll area of its own fails before the fix and passes after it, for the wheel, a touch drag and the keyboard when the area takes it
- [x] #3 hero's gallery reaches its end: the last item is whole in the viewport at the largest scroll, shown by a readback of its position or one frame
- [x] #4 The tests that tests/affected.json maps to lib/std/ui.ts pass; a golden that changes is explained in the notes, one line each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked in a worktree (2026-10-12), no engine build: the main tree's binary with this tree's lib/std (ZINC_ROOT).

Cause, in one sentence: an absolute child was measured in measure() for the box its parent was OFFERED, not the one it ends with, so hero's screens (`absolute inset-0` in a stage that grows beside the sidebar) were measured for the whole window width, their flex-wrap of cards got fewer lines there than where it is placed, and the scroll area took that shorter height for its content.

Reproduction (headless, deterministic, `ZINC_DEMO=gallery`, a script of 60 wheel notches down over the page from frame 60, a temporary dump of every scroll node, removed):
- 800x480 (the Pi): viewport 728x416; content measured 866 px (3 cards a line at the 768 px offered: 3 lines), placed 1116 px (2 cards a line in the real 696 px: 4 lines); largest scroll 450, should be 700: the 4th line showed its top 20 px.
- 1100x700 (hero's own window): content measured 648 px (4 a line), placed 898 px (3 a line), viewport 660 px of which 636 in the window; largest scroll 0, should be 262: the page did not scroll at all.
- 1024x600: content measured 898, placed 1148; largest scroll 238 with a viewport of 660 px that ends 124 px under the window (second cause below); should be 612 with 536 px.
- 640x480: 1116 measured and placed, largest scroll 700: no defect (2 cards a line at both widths). The defect needs a line count that differs between the window's width and the stage's.
After (the same session and dump): 800x480 viewport 728x416, content 1116, largest scroll 700, reached by the wheel and by a finger (6 drags, the last past the end, then the spring back); the last line whole (card bottom at y 440 of 480, the gap and the padding under it). 1100x700: viewport 868x636, content 898, largest scroll 262. 1024x600: viewport 792x536, content 1148, largest scroll 612, last line whole (bottom at y 544 of 600).

Since when: always. The line `for (const c of abs) measure(c, inner, innerH)` is from f475e200 (2026-09-28, the flex engine), hero's shell from aade22d6 the same day. Today's 4b9cc042 and 69bfa6ab were read and ruled out: they only choose which node takes a finger's drag (dragScroller), neither touches contentH, the viewport or clampScroll.

What changed:
- lib/std/ui.ts, place(): an absolute child is measured there, for the box its parent ends with (both insets: the parent less the insets; w-full/h-full: the parent; else its inside), and no longer in measure(). Same number of measure calls, no allocation (ui_alloc_layout passes).
- lib/std/ui.ts, measure(): a box with a max-width offers its content at most that width (it offered the width it was offered itself: same short range in a `max-w-*` column, 30 instead of 170 px on a probe).
- examples/hero Shell: `absolute inset-0` instead of `h-full`. Second cause, hero's own: the full sidebar needs 724 px and `h-full` grows with its content in classic, so in a window under 724 px high and 960 px wide or more (hero's is 1100x700) the shell was 724 px high and the bottom of every page lay under the window's edge (24 px at 700, 124 px at 600). Not the Pi's case (compact sidebar, 436 px).

What else it changed in hero (every screen at 800x480 and 1100x700, before against after, pixel diff): the Tasks progress bar was a percent of the offered width (33% drew 253 px, now 230 px of the 696 px track); one 70x10 px detail at the bottom of Kit at 1100x700; at 1100x700 the shell change brings what is anchored to the bottom into the window (the Tasks footer, the Playground canvas, the map). Home, Gallery at rest, Settings, Forms, Detail, the dialog: identical.

Tests: scroll_end (new, tests/golden/scroll-end, 320x240, under a second) fails on the unchanged core (page 26 of 96, nested 25 of 161, by code, wheel, finger and focus) and passes; it fails again on the nested area with the max-width line removed. Mapped to lib/std/ui.ts: 48 pass, no golden moved. ui_style (ring-mouse frame hash) and ui_alloc_text (431 allocations for 425) fail the same way on the main tree without this change: not this task's. proto_devtools skipped (the prototype's node_modules are missing). Pixel canary (tools/proto-capture compare): 4 of 4, hero among them.

Not proven: the Pi and a real finger (the owner); the rn layout engine (it reads the content's extent after Yoga, not looked at); hero on the native engine (the new test ran there once, same output; hero only on the interpreter).

Lines for later.md:
- ZN-737: `h-full` / `w-full` along the main axis grows with its content past its parent in classic (CSS: 100% of the parent): a root layout taller than the window puts the bottom of every scroll area off screen. hero's shell was changed instead; the core change moves pixels and needs the prototype goldens.
- ZN-737: a row's child with `basis-N` is measured for the width offered, not its basis: a scroll area with a flex-wrap in it stops short (probe 320x240, basis 200: range 30, should be 170).
- ZN-737: layoutLayers() measures a layer with left and right insets for the whole window (the defect absolute children had); not reproduced.
- ZN-737: classic never shrinks a growing column whose content is wider than what its siblings leave: a flex-wrap put straight in a page beside a sidebar keeps the line count of the whole row and overflows to the right (310 px in a 220 px slot). `flex-1` as basis 0 with shrink would do it.
- ZN-737: scroll areas take no key (Page Down, End, the arrows): only the focus moving to a child scrolls them.
- ZN-737: ui_style (ring-mouse) and ui_alloc_text fail on main at 3350310a; nobody owns them.
- ZN-737: hero has no test that scrolls each page to its end at 800x480.
- Cross-platform pass: ZN-737: hero's gallery on the Pi 3B+ (800x480, a finger): the last line whole.
<!-- SECTION:NOTES:END -->
