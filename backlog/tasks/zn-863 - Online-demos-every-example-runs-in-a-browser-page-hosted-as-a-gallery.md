---
id: ZN-863
title: 'Online demos: every example runs in a browser page, hosted as a gallery'
status: Backlog
assignee: []
created_date: '2026-10-30 00:12'
updated_date: '2026-10-30 02:05'
labels:
  - web
  - size-L
milestone: m-14
dependencies: []
ordinal: 91
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-30): `zinc dev --target web` and the web export should run as many examples as possible, so they can be hosted online as browser demos. The page gets what a browser lacks from a small companion server (assets, a bridge to the plugins' native sides), a persistent fs in the browser, the wasm engine as an alternative, and device frames (a phone shell around rn-showcase). Research: docs/reports/web-bridge-research.md, docs/reports/web-export-bridge-audit.md; state of each demo: docs/targets/web-demos.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done
- [ ] #2 docs/targets/web-demos.md lists every example with its canvas and dom result and why the failing ones fail
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30, zinc dev sweep of the 129 examples (docs/targets/web-demos.md, 'zinc dev, every example'). The bridge now carries zinc:net servers, host loop events, zinc:socket (web.dev native) and cross-origin fetch. What remains for dev mode, in order of reach: (1) a WebGL 2 browser backend of zinc:3d (Render3D + Three.parse): 13 demos; (2) zinc:script in the page (webgl-cube, webgl-studio, scripting/bench): GL and per-call cost rule out the bridge; (3) the esbuild pre-bundle of zinc dev ignores package exports and plugin module names the native resolver handles (carnet-nbe: @nbe/dom/src/*, loro-crdt); (4) tools/web-real-test sometimes prints nothing on a demo's first run (dev server still compiling), passes on the second.
<!-- SECTION:NOTES:END -->
