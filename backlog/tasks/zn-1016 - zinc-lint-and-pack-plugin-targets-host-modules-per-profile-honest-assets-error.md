---
id: ZN-1016
title: >-
  zinc lint and pack: plugin targets, host modules per profile, honest assets
  error
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-09 00:11'
labels:
  - lint
  - targets
  - size-S
milestone: m-10
dependencies: []
ordinal: 7900
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
- [x] #1 `zinc lint --target n3ds` on the console demos shows no false warning
- [x] #2 capabilities.json lists host modules per profile and lint uses it
- [x] #3 examples/music lint has no "not made for this target" for the four plugins
- [x] #4 pack reads the module list from the console core; a clear assets error
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-11-09).

Web search (sonnet): Flutter/pub.dev score plugins per platform and say what an empty platform list means; npm silently ignores files outside the package and electron-builder's 'path outside the project' confuses users: silence is the failure to avoid, print the resolved path; resolve aliases and core-provided modules apart from plugin targets (two messages). Links: https://www.electron.build/docs/contents, https://github.com/onestudio-co/flutter-package-platform-detector, https://flutter.googlesource.com/mirrors/flutter/+/HEAD/packages/flutter_tools/templates/plugin/README.md.tmpl

Decision (to record): what a console's core carries lives in targets/capabilities.json, per profile: "plugins" (plugins whose native part the core links: psp, vita, n3ds audio, lan, 3d, physics2d; ps2 audio, lan) and "modules" (host modules of the engine: zinc:gfx everywhere, zinc:gl everywhere but esp32, ps1, ps2, psp, vita, n3ds). Not n3ds/psp/vita entries in each plugin.json "targets": those keys are build entries of a plugin, and the list belongs to the core, which pack, lint and deploy all need. Lint skips plugin-targets for a profile's "plugins" and has a new rule host-module (a module listed for some profile but not this one, imported by a loaded file). zinc pack --profile <console> builds nothing for the profile's "plugins" (was: Render3D and Physics2D hardcoded). Arrays read as space-joined words in Caps (capsList), and are not zinc:platform constants. Pure-Zinc sprite and tilemap list psp, vita, n3ds.

Criteria: #1 lint --target n3ds of hardware-n3ds, n3ds-pinball, n3ds-platformer, n3ds-starfall, tokyo, n3ds-kit, breakout: 0 warnings (were 1-3 each); psp/vita hardware demos 0. gl-cube: host-module warning on n3ds, none on macos. #3 examples/music already had no warning (android was added to the four plugin.json in 563128cee). #4 pack: list from capabilities.json; assets: pack copied only <project>/assets whatever zinc.json said (n3ds-platformer's ../platformer/assets: 0 asset files in its .zapp, now 21, run 5 frames OK); an outside folder is packed as assets/ and the packed zinc.json repointed; a named folder that is missing warns in zinc check, run and pack; an array is refused with the form to write. Tests: tests/t0/lint.sh (rule fixture imports zinc:gl, counts 13 warnings/17 rules/20 diagnostics, console demos and gl-cube), new tests/t0/pack_assets.sh; both pass, plus qjs_platform and handheld_profiles.

Later: the core's plugin list is in three places (capabilities.json, targets/console/stubs.cpp, player_console.cpp): build-console-core could read capabilities.json. A ps2 core built with graphics may link 3d and physics2d too (unverified, ps2 lists audio and lan). zinc pack of a JavaScript-engine project still ignores an assets folder outside the project.

Proposed tests: zinc device deploy of examples/gl-cube to a console player (ZINC_PLAYER_PROFILE=n3ds host build) shows the zinc:gl warning; tools/console-demos examples/n3ds-pinball pinball n3ds (cross build, minutes) still links and runs.
<!-- SECTION:NOTES:END -->
