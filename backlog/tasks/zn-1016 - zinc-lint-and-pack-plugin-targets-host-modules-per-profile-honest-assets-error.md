---
id: ZN-1016
title: >-
  zinc lint and pack: plugin targets, host modules per profile, honest assets
  error
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
labels:
  - lint
  - targets
  - size-S
milestone: m-10
dependencies: []
ordinal: 7900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc lint --target n3ds|psp|vita` warns about plugins the console cores link; zinc:gl and other host modules are not listed per profile in `targets/capabilities.json`; webos, gsap, async-storage and svg run on Android but their plugin.json does not list it; `zinc pack` under a console profile hardcodes Render3D and Physics2D; a zinc.json `assets` that is a string or points outside the project is not explained.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-792: list n3ds/psp/vita in the "targets" of the plugins the console cores link (3d, audio, physics2d), so zinc lint --target n3ds stops warning about them; dev and deploy already filter them out using the player's list.
- ZN-792: list zinc:gl (and other host modules) per profile in targets/capabilities.json, so the lint and the pre-send warning catch gl-cube before it is sent to a console.
- D123: the plugins webos, gsap, async-storage and svg run on Android but their plugin.json targets do not list it, so `zinc lint` warns "not made for this target" (examples/music: 7 warnings).
- ZN-790: `zinc pack`/`zinc check` say so when zinc.json's `assets` is a string or points outside the project: n3ds-pinball's `"assets": "../hardware-n3ds/assets"` was dropped silently and the ball was missing on the 3DS.
- zinc pack: under a console profile it hardcodes the Render3D and Physics2D modules; the list should come from the console core.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc lint --target n3ds` on the console demos shows no false warning
- [ ] #2 capabilities.json lists host modules per profile and lint uses it
- [ ] #3 examples/music lint has no "not made for this target" for the four plugins
- [ ] #4 pack reads the module list from the console core; a clear assets error
<!-- AC:END -->
