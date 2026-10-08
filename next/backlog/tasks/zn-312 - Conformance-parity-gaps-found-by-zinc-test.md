---
id: ZN-312
title: Conformance parity gaps found by zinc test
status: Review
assignee: []
created_date: '2026-10-07 13:41'
updated_date: '2026-10-08 03:39'
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
- [x] #1 zinc test --profile macos prints no FAIL
- [ ] #2 zinc test --profile esp32 and ps1 print no FAIL except the documented ones
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc test --profile macos: 61 programs, 0 failures; esp32: 44 run, 0 failures (kit_*, three included since ZN-229); ps1: two documented failures left: string_number_edges (the Z4001 diagnostic format of the old runner: 'file:line:col - error' vs ours 'abs:line:col: error') and three.fx12 (fx12 arithmetic prints 1.999 where the old simulator printed 1.998). Fixes: fs.symlink/readlink/chmod, fs stat mode without type bits, fs.watch (directory snapshots every 10 ms: rename/change events), 'cannot open' wording of fs.readBytes, os.userInfo uid/gid/shell, os.cpus model, os.networkInterfaces (getifaddrs); a directory reached by a symlink is one module (symlinked module); bare 'inferno' and the pocketjs packages map to lib/compat without a tsconfig; and the real bug behind pocket_hero: a file reached by two spellings of its path (tsconfig paths 'lib/std/solid.ts' vs the std root 'next/../lib/std/solid.ts') was loaded twice, so signals and effects lived in two solid instances and 'Count' never updated: modules are now unified by canonical path. Flake seen: tests/conformance/sys_process.ts sometimes waits forever in the loop (two SIGTERMs sent from the handler coalesce), a pre-existing race, not fixed. AC2 left in Review for the two documented ps1 cases.
<!-- SECTION:NOTES:END -->
