---
id: ZN-817
title: >-
  Release hygiene for the engine packs (Hermes licences, pinned V8, .qbc version
  stamp, source-map paths)
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-S
milestone: m-14
dependencies: []
ordinal: 7500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-773.07: Hermes pack: add the licences of libhermesvm's vendored parts (llvh, dtoa, zip...) to the pack before publishing one.
- ZN-773.04: tools/v8-pack takes Homebrew's newest V8 at each release: pin the version (and bump it on purpose) so a new V8 major cannot break the Node-API patch during a release.
- ZN-773.09: stamp zinc's version into the .qbc: a zinc update that changes QuickJS without bumping BC_VERSION would still load an old .qbc.
- ZN-773.09: source maps of a build hold relative paths: a moved build or app resolves ../main.js against its new place; embed the sources or absolute paths at export.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hermes pack carries the licences of libhermesvm vendored parts
- [ ] #2 tools/v8-pack pins the V8 version
- [ ] #3 .qbc is stamped with the zinc version and a mismatch recompiles
- [ ] #4 Source maps of a moved build resolve (sources embedded or absolute)
<!-- AC:END -->
