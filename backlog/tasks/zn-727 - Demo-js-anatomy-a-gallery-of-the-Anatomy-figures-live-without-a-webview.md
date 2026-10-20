---
id: ZN-727
title: 'Demo js-anatomy: a gallery of the Anatomy figures, live, without a webview'
status: Backlog
assignee: []
created_date: '2026-10-12 12:57'
updated_date: '2026-10-12 13:18'
labels:
  - js
  - demo
  - size-L
milestone: m-8
dependencies: []
ordinal: 489410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): a demo gallery of the figures of https://skills.wheresryan.sh/anatomy (watch, turbofan, seasons) played in Zinc, live, without a webview. The figures come from the npm package anatomy-figures 0.1.0 (MIT): each has a framework-free entry `element/<name>` whose `render(host, { theme })` builds a large SVG, a stylesheet and a small script that rewrites `d`, `transform` and attributes each frame; turbofan adds a WebGL canvas, seasons a 2D canvas and WebGL. The web environment (`lib/std/webenv.js`) has no SVG tree and no CSS: the example brings an SVG scene (markup of innerHTML, the figure's stylesheet, a painter on Canvas 2D, hit test) and runs the figures' own code unchanged. Measured before the task (backlog/later.md, ZN-712 line of 2026-10-12): Canvas 2D paints the paths; a full repaint is 48 ms (watch) and 73 ms (turbofan) under load, bound by the painted area.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run examples/js-anatomy opens a gallery where watch, turbofan and seasons play from their own unchanged render(host), vendored with licence and pinned version, and a key or a click goes from one figure to the next
- [ ] #2 Pointer and keys reach the figure: the watch's crown winds and S and E answer, the turbofan's lever moves the spools and its WebGL layer shows, seasons turns under a drag
- [ ] #3 A T1 test runs the gallery headless: each figure reaches its frames with nothing on stderr and its frame matches a golden
- [ ] #4 Frame work of each figure measured alone on the development Mac and logged in docs/reports/zinc-next-perf.md, with what keeps it from 60 fps if it does not reach it
- [ ] #5 The example's README says what the SVG scene draws and what it leaves out, and the lines for later.md are written
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12: the owner cut the scope to a proof of the principle. Done: examples/js-anatomy downloads a figure's module from unpkg (anatomy-figures 0.1.0) and draws its paths and circles still with Canvas 2D, five rules standing for the stylesheet; a click or a key shows the next one (watch, turbofan). Watch: 859 shapes, download about 300 ms, draw about 190 ms at 800x720 under load. Left out, criteria 1 to 5 stay open: the figure's own render(host) (it needs an SVG tree with CSS: an unfinished, uncommitted scene.js of 553 lines is in the worktree .claude/worktrees/agent-aed53744c488c2df3), movement, input to the figure, use, gradients, clips, the WebGL layer, seasons, the test. The click to the turbofan was not run in the window; the same rules drew it in the measure before the task.
<!-- SECTION:NOTES:END -->
