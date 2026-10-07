---
id: ZN-312
title: Conformance parity gaps found by zinc test
status: Backlog
assignee: []
created_date: '2026-10-07 13:41'
labels:
  - conformance
  - parity
dependencies:
  - ZN-122
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc test --profile X (ZN-122) lists what still differs from the prototype's goldens. macos: fs_ext and limits (fs.symlink returns ENOSYS: symlink support and a symlinked module), inferno (the 'inferno' package is not mapped: tsconfig paths / a package import), os_info (user / home facts), pocket_hero (a counter click does not register: 'Count: 5' expected, 0 got), kit_keyboard (accent popup picks 'è' where the golden has the profile's accent: 'ë' on rpi1, 'ē' on rmpp), string_number_edges.fx12 (the Z4001 diagnostic format of the old runner: 'file:line:col - error Zxxxx'). esp32: kit_react, kit_solid, kit_overlays_* run out of the 160 KiB heap budget of the profile (the engine's objects are fatter than the target's: measure per-object bytes and align or raise the headroom), three (plugin out-arrays under f32, ZN-229). Each fix keeps the goldens: run tools: build/zinc test --profile <p>.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc test --profile macos prints no FAIL
- [ ] #2 zinc test --profile esp32 and ps1 print no FAIL except the documented ones
<!-- AC:END -->
