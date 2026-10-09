---
id: ZN-353
title: 'Native plugin ABI v1 frozen: what may change, what a plugin can rely on'
status: Done
assignee: []
created_date: '2026-10-08 14:42'
updated_date: '2026-10-09 06:11'
labels:
  - plugins
  - abi
  - size-M
milestone: m-19
dependencies: []
ordinal: 55410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
D37: official plugins leave the monorepo only once the native ABI is frozen. Review include/zn/native.h and the thunk generator, write the stability rules (additive changes only within a major ABI version, the loader refusing an unknown major), a check that the ABI header did not change incompatibly (tool comparing the declarations against a recorded v1 snapshot), and the list of plugins ready to move out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the ABI rules are in docs/plugins.md and a T0 test fails when native.h changes incompatibly against the v1 snapshot
- [x] #2 the loader refuses a module built for another major ABI with a message naming both versions
- [x] #3 a module built for an older minor ABI still loads
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
native.h: ZN_ABI_MAJOR 1, ZN_ABI_MINOR 1 (1.0 = before ZnHostApi.cb_error, added in fe62e85a), ZN_ABI_VERSION = (major << 16) | minor; the stability rules in the header and docs/plugins.md (additive within a major: appends to the size-prefixed ZnHostApi and ZnModule only, nothing removed, reordered, retyped or revalued). The registry refuses another major or a newer minor, naming both versions, and loads an older minor (native_test: 2.0 refused naming 2.0 and 1.1, 1.2 refused, 1.0 registered). tools/abi-check + tests/data/native-abi-v1.txt (77 declarations); tests/t0/native_abi_freeze.sh: the header matches, and retyped / inserted / fixed-struct-grown / function removed / constant changed / lower minor fail while an appended engine function and a newer minor pass. Ready to leave the monorepo: device, devtools, ffi, process, script, socket, sqlite, wasm, gestures, ink, pixelfont; the 21 others include hal.h, zrt_raster.h, hw.h, zgl.h or SDL3: ZN-396. native_test's ZnSink warning fixed. T0 82/82, tests/run --changed 50 pass; native_plugins_test still does not link (ZN-387). usage: n/a
<!-- SECTION:NOTES:END -->
