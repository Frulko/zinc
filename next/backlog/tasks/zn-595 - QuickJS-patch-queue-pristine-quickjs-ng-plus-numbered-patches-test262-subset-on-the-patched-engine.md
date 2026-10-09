---
id: ZN-595
title: >-
  QuickJS patch queue: pristine quickjs-ng plus numbered patches, test262 subset
  on the patched engine
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
labels:
  - perf
  - quickjs
  - size-S
milestone: m-21
dependencies:
  - ZN-139
priority: high
ordinal: 5610
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before any engine change: keep third_party/quickjs-ng as the pristine 0.17.0 release and apply numbered patches from third_party/quickjs-ng/patches/ at configure time (or keep them applied with a check that the tree equals release + patches). Each patch has a header: purpose, measured gain, upstream PR link or 'not upstreamable' with the reason. The T1 QuickJS tests and the ZN-139 test262 subset run on the patched engine. Rebasing to a new quickjs-ng release is one documented command. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 third_party/quickjs-ng/patches/ exists with a README; tools/ or CMake check that the vendored tree equals release + patches
- [ ] #2 third_party/README.md and components.json name the patch queue
- [ ] #3 the QuickJS T1 tests and the test262 subset pass on the patched engine; a dry rebase onto a newer quickjs-ng tag is documented
<!-- AC:END -->
