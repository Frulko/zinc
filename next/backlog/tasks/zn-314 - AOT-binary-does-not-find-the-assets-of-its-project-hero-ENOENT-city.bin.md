---
id: ZN-314
title: 'AOT binary does not find the assets of its project (hero: ENOENT city.bin)'
status: Backlog
assignee: []
created_date: '2026-10-08 13:56'
labels:
  - aot
  - bug
dependencies: []
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-282: `zinc build ../examples/hero/src/main.tsx -o hero` builds, but the binary panics with 'Uncaught Error: ENOENT: open city.bin' when run from examples/hero or examples/hero/assets, while `zinc run` finds assets/city.bin. The AOT output has no asset root (zinc.json "assets"/cwd of ZN-078).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the AOT build of examples/hero runs headless and its frame equals the interpreter's
<!-- AC:END -->
