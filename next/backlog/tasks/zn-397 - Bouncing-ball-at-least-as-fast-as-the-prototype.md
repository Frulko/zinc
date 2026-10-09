---
id: ZN-397
title: Bouncing-ball at least as fast as the prototype
status: Done
assignee: []
created_date: '2026-10-09 06:38'
updated_date: '2026-10-09 07:23'
labels:
  - perf
dependencies: []
priority: high
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner report 2026-10-09: bouncing-ball runs slower in Next than in the prototype. Measured at 200k balls (AOT, macOS window): Next ~24 fps median, prototype native ~31. Both share runtime/raster.cpp; the gap is the script side: every host call (rect, width, height: 600k a frame) goes through hostRt, which zero-fills 13 HostArg values, runs strchr twice on the signature and switches in the gfx host. Prototype: 6% of the main thread in script code, Next: ~35%.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hot scalar zinc:gfx rows (rect, width, height, line, clear...) skip the letter decoding in the interpreter and the AOT build
- [x] #2 At 200k balls the AOT build of bouncing-ball reaches at least the prototype native fps on the same machine (same window, measured)
- [x] #3 The interpreter gains too (measured)
- [x] #4 A test covers the direct rows (same pixels as the decoded path)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on macOS arm64, bouncing-ball with 200k balls (copy that spawns them at start), window, 10 s per run, alternated:
- Before: Next AOT ~24 fps median vs prototype native ~31 (main thread: 35% script vs 6%).
- Cause 1: every host call (rect, width, height: 600k a frame) went through hostRt: 13 HostArg zero-filled, strchr twice on the signature, the HostCall switch. Fix: zn::host::hostFast direct entries for the hot scalar gfx rows, taken first in rtCall (interpreter and AOT) and called inline by the AOT.
- Cause 2: Apple clang outlines repeated code into calls at -O2 (312 OUTLINED_FUNCTION in the program, 0 in the prototype's): -mno-outline on macOS arm64 AOT builds. Update loop 2.67 -> 1.54 ms, draw 1.91 -> 1.48 ms.
- AOT registers are C++ locals in functions that call too (window copies around calls) and the field/array ops no longer take the register array's address.
- After: Next AOT 32.2 fps vs prototype native 31.9 (3 alternated runs under load); Next zinc run (interpreter) 20.9 -> 24 fps; headless 60 frames 1.48 -> 1.12 s; prototype zinc-vm 10.5 fps.
- Prototype zinc run compiled natively: zinc run in Next must reach AOT speed -> ZN-398. Update loop still 2x the prototype's -> ZN-399.
- Tests: host_direct (new, golden from the decoded path, interpreter and AOT), aot, canvas, layout_bridge, profile, script, text_shaped, svg_lottie, ui, macos_bundle, tests/run --changed 66/66; interpreter = AOT frame hashes on bouncing-ball, nuxt-ui, rn-showcase, navigation (navigation needs ZINC_ASSETS: ZN-314).
usage: n/a
<!-- SECTION:NOTES:END -->
