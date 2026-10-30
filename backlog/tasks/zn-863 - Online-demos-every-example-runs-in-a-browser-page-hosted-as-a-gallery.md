---
id: ZN-863
title: 'Online demos: every example runs in a browser page, hosted as a gallery'
status: Backlog
assignee: []
created_date: '2026-10-30 00:12'
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
