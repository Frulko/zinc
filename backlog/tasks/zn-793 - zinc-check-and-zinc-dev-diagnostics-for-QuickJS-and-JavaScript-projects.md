---
id: ZN-793
title: zinc check and zinc dev diagnostics for QuickJS and JavaScript projects
status: Backlog
assignee: []
created_date: '2026-10-24 23:54'
labels:
  - size-M
milestone: m-10
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- zinc check: a project on the QuickJS engine ("engine": "quickjs") is checked by the typed checker, which does not resolve `node_modules` packages (Z0119 on every `@nbe/...` import of examples/carnet-nbe, which runs): check it as the QuickJS loader resolves it (src/qjs/qjs.cpp quickjsLint), or say the check does not apply.
- ZN-772: `zinc check` and `zinc lint` fail on the plain-JavaScript web examples (js-three Z0002, js-gsap Z0106, js-pixi, js-spline): the typed frontend parses `await import(expr)` and the web globals as TypeScript; a `"web": true` JavaScript program should get the QuickJS loader's lint instead.
- zinc dev: the `compile error:` line prints the first stderr line (`plugin svg: cached native library`) instead of the diagnostic; print the diagnostic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc check` of a project with "engine": "quickjs" resolves node_modules like the loader (examples/carnet-nbe has no Z0119) or states that the check does not apply
- [ ] #2 `zinc check` and `zinc lint` on the js-three, js-gsap, js-pixi, js-spline examples use the QuickJS loader's lint
- [ ] #3 `zinc dev` prints the diagnostic, not the first stderr line, after `compile error:`
<!-- AC:END -->
