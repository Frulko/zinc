---
id: ZN-130
title: 'reMarkable panel model: fake qtfb server and refresh policy'
status: Done
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-07 14:49'
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
- [x] #1 refresh-mode trace and PNG sequence golden for examples/remarkable/notes
- [x] #2 dashboard's small-rectangle refreshes appear in the trace
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tests/native/rmpp/sim.cpp: fake AppLoad qtfb server and compositor model around the REAL plugins/display-rmpp/rmpp.cpp (unmodified, another developer has uncommitted edits there), built by tests/t1/rmpp_sim.sh as a project display plugin; socketpair DGRAM stands in for SOCK_SEQPACKET (not on macOS), shm_open/mmap are the real ones, the clock is the presented frame count (60 Hz) so traces are deterministic; the glass only takes the announced update rectangle, an update inside the 1 s mode-change sleep is an error. Goldens tests/golden/sim/rmpp-{notes,dashboard}.trace (messages with the hash of the glass after each update) and .ppm (final glass, 1/8). notes (NOTES_DEMO=1, fast): full repaint after the sleep then 85 pen-sized rectangles; dashboard (scripted taps on Start and a task): button 105x28, timer 310x362 each second, task row 385x48. Not run under Linux qemu-user/container (no runner yet, ZN-133).
<!-- SECTION:NOTES:END -->
