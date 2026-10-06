---
id: ZN-134
title: reMarkable Paper Pro target under simulation
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
labels:
  - targets
  - size-M
milestone: m-11
dependencies:
  - ZN-130
  - ZN-132
  - ZN-111
ordinal: 40760
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Static aarch64 build with display-rmpp, sqlite, socket, wasm, script, lottie, canvas2d, ink and the remarkable status module; capabilities pen and touch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/remarkable/{notes,dashboard} run under qemu-user with the fake qtfb and match goldens
<!-- AC:END -->
