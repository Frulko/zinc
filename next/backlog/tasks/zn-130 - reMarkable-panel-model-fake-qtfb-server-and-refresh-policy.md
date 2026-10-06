---
id: ZN-130
title: 'reMarkable panel model: fake qtfb server and refresh policy'
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-104
ordinal: 40720
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Promote tests/rmpp/qtfb.cpp to a harness with a model of the e-ink refresh policy and mode switches; run the real rmpp.cpp driver under Linux (qemu-user or container); AppLoad one-second sleep modelled.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 refresh-mode trace and PNG sequence golden for examples/remarkable/notes
- [ ] #2 dashboard's small-rectangle refreshes appear in the trace
<!-- AC:END -->
