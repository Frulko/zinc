---
id: ZN-1031
title: 'Inspector polish: six small fixes and a stale test'
status: Backlog
assignee: []
created_date: '2026-11-07 16:37'
labels:
  - inspector
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 1023000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small inspector defects: `tests/t1/agent_inspect.sh` expects the lowercase `<view`; discovery files of the interpreter transport are left behind at exit; Changes lists the four padding sides instead of `p-[12px]`; the "+ add a declaration" line shows with no node selected; Screen view should name the hovered node in a tooltip; blurring an edited field into the palette hex field leaves the edit open; badges sit at the row edge; ArrowUp/Down to the parent in a stage scene.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- `tests/t1/agent_inspect.sh` still expects the lowercase `"<view "` in the inspector dump.
- Inspector Elements: badges sit at the row's right edge rather than right after the tag (needs inline boxes in wrapping text); arrow keys on keyword values could cycle through their keywords as Chrome's Styles pane does.
- Inspector discovery: the interpreter/AOT transport (`cdp.next.ts`) leaves its `<zinc home>/run/devtools/<pid>.json` behind at exit (no exit hook in zinc:sys) and no transport removes it on SIGTERM; the Inspector prunes them. An exit hook in zinc:sys would remove it.
- Inspector pick: ArrowUp/ArrowDown to the parent is not routed in a zinc:stage scene drawn alone (stage.ts pickInput reads no keys).
- Inspector Changes patch: `padding: 12px` lists the four sides; fold them into `p-[12px]` / `px` / `py`.
- Inspector Styles: the "+ add a declaration" line shows with no node selected; hide it.
- Inspector Screen view: name the hovered node in a tooltip on the canvas, as Chrome's device view, not on a line under the picture.
- Inspector Styles: blurring an edited field into the palette's hex field leaves the edit open instead of applying it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 agent_inspect.sh passes with `<View`
- [ ] #2 `<zinc home>/run/devtools/<pid>.json` is removed at exit (or ignored when the pid is dead)
- [ ] #3 the five UI items behave as described, checked in an inspector screenshot
<!-- AC:END -->
