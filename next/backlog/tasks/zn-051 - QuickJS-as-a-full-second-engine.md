---
id: ZN-051
title: QuickJS as a full second engine
status: Backlog
assignee: []
created_date: '2026-10-06 16:42'
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
- [ ] #1 zinc run --engine quickjs runs the conformance programs that need no typed features and a zinc:gfx program
- [ ] #2 host bindings are generated from one table, not written twice
- [ ] #3 the engine choice and its limits are documented
<!-- AC:END -->
