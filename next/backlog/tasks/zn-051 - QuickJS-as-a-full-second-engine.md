---
id: ZN-051
title: QuickJS as a full second engine
status: Done
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 18:19'
labels:
  - size-L
dependencies: []
ordinal: 32400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor QuickJS (QuickJS-ng or the original, pinned) and run plain JavaScript and stripped TypeScript with --engine quickjs behind the same host ABI as the typed engines (zinc:gfx, zinc:ui host calls generated from the runtime table). For npm code, eval and dynamic plugins. Decision of ZN-031: full engine, the typed engine stays the default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run --engine quickjs runs the conformance programs that need no typed features and a zinc:gfx program
- [x] #2 host bindings are generated from one table, not written twice
- [x] #3 the engine choice and its limits are documented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. QuickJS-ng 0.17.0 vendored; src/qjs (strip, host calls from the runtime table, loader, prelude with Node-style inspect, frame loop); zinc run --engine quickjs. T0 qjs, T1 quickjs (all golden/run programs but inspect_cycles, 13 conformance programs, shapes pixels identical). Limits in docs/reports/zinc-next-quickjs.md: no JSX, no i32 wrap, no <ref> markers.
<!-- SECTION:NOTES:END -->
