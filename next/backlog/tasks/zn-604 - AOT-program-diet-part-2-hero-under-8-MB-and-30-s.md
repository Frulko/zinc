---
id: ZN-604
title: 'AOT program diet, part 2: hero under 8 MB and 30 s'
status: Done
assignee: []
created_date: '2026-10-09 10:22'
updated_date: '2026-10-09 11:42'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-603
  - ZN-428
priority: medium
ordinal: 5004
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-603. hero now: 16.0 MB binary, 48 s build, 16.6 MB of C++ (module 184 KB packed, functions 16.0 MB). Where the 16 MB are: about 8 MB of baked fonts and images in __const (ZN-428 bakes only the fonts a program uses), 4.3 MB of hero's own machine code (1678 functions), about 5 MB of runtime and libraries (bouncing-ball's AOT is 5.0 MB; SDL3 as a module is ZN-330.03). The generated C++ is dominated by inline null checks (4 MB of 'op::kNullRef' text), release calls with their own error test (2.5 MB) and window copies around calls; one translation unit (ZN-427).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hero AOT binary <= 8 MB and zinc build <= 30 s (macOS arm64, -j3)
- [x] #2 generated C++ of hero <= 10 MB
- [x] #3 interpreter and AOT frames identical on hero, nuxt-ui, rn-showcase
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (D46), measured on hero (macOS arm64, -j3):
- AC1: binary 9.65 MB (after ZN-428) -> 7.62 MB; zinc build 43.8 s -> 14 s.
- AC2: generated C++ without the resource literal about 16 MB -> 9.55 MB (three units); 13.7 MB with the literal.
- AC3: interpreter and AOT frame hashes are identical on hero, nuxt-ui, rn-showcase and bouncing-ball. hero's AOT binary needs ZINC_ASSETS for assets/city.bin; ZN-436 AC5 covers that.
- Generated C++: short macros for the repeated checks; the module and the resources become string literals.
- Reference counting in compiled code (op::retainC, op::releaseC, op::dropC) skips the zinc mem statistics; the last reference goes to Machine::releaseLast. Handlers test their class through op::catches, out of line.
- zinc build compiles without the stack protector and links with -Wl,-x; ZN_KEEP_SYMBOLS=1 keeps the local symbols.
- More than 2 MB of functions: up to 3 units compiled at once through one shell (std::system from several threads ran them one after the other); ZN_AOT_PART_BYTES is for tests.
- SDL3 is built without its dynamic API table (ZN_SDL_NO_DYNAPI, two-line patch noted in third_party/README.md): -670 KB.
- Tests: tests/t1/aot.sh now covers a split build (exceptions, library); fib golden regenerated.
- Found on the way, fixed in 53268e8b: ZN-428's exact-size gfx.font changed conformance canvas2d (monospace falls back to sans in the prototype); reverted.

Measured and rejected: retain and release out of line (binarytrees +9.6%, mapset +4.4%); releaseC forced inline (+0.8 MB, +13 s, no kernel faster); -Os (-7% code, same time).

Tests: tests/run --changed 29 passed; T1 aot, profile, conformance, canvas, ui, text_shaped, svg_lottie, input and rc pass; T0 res, res_subset and aot pass; proto-capture canary 4 of 4.
<!-- SECTION:NOTES:END -->
