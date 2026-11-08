---
id: ZN-1031
title: 'Inspector polish: six small fixes and a stale test'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-08 21:33'
labels:
  - inspector
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 4000
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
- [x] #1 agent_inspect.sh passes with `<View`
- [x] #2 `<zinc home>/run/devtools/<pid>.json` is removed at exit (or ignored when the pid is dead)
- [x] #3 the five UI items behave as described, checked in an inspector screenshot
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08.
- #1 agent_inspect.sh already expected `<View ` (b4aea5683); it passes (tests/run --only agent_inspect).
- #2 the Inspector skips and removes <zinc home>/run/devtools/<pid>.json when the pid is dead: sys.kill(pid, '0') now says whether a process exists (Node's process.kill semantics, EPERM counts as alive); sys.kill returns false when not delivered. Found on the way: the HostSigSend case had no break once rewritten; QuickJS hung (fixed before commit). Windows shim: kill(pid, 0) only opens the process (it used to TerminateProcess for any signal). No exit hook in zinc:sys added: the dead-pid prune covers SIGTERM too, which an exit hook would not.
- #3 Changes patch folds pt/pr/pb/pl (and margins) into p-[v] / px / py and writes className= (the JSX rule; it wrote class=). '+ add a declaration' only with a node selected in a dev run. A blur from an inline edit into another field (the palette's hex) applies the edit (it checked 'no field focused'). Screen view: name and size drawn as a tooltip under (or above) the node on the canvas, the line under the picture only says how to pick. Elements badges right after the row's text (Text shrink instead of flex-1). zinc:stage scene drawn alone: its pick mode reads keys (Escape ends it, ArrowUp/Down the parent), as zinc:ui's.
- Screenshots looked at (headless capture during the inspector_screen dump): tooltip on the canvas, badge after the tag, no add-declaration line with no selection.
- Tests run: qjs (T0, new kill '0' case), inspector, inspector_screen, inspector_discovery, inspector_layout, inspector_stage, agent_inspect: all pass.
- Research: Chrome Elements badges sit after the tag (developer.chrome.com/docs/devtools/elements/badges); Overlay.setInspectMode highlightConfig.showInfo draws the tooltip in the page (chromedevtools.github.io/devtools-protocol/tot/Overlay); Chrome's DevToolsActivePort can go stale after a crash, clients probe it (chromedriver chrome_launcher.cc).
Proposed tests: a scripted pick in a stage-only scene with ArrowUp (needs a CDP client sending Overlay.setInspectMode then ZINC_INPUT keys); a dump step blurring a value edit into the hex field.
Later: Cross-platform pass: sys.kill(pid, '0') on Windows (OpenProcess query) - check an exited process with live handles.
<!-- SECTION:NOTES:END -->
