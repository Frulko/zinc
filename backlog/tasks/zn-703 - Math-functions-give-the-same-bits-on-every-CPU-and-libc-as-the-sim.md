---
id: ZN-703
title: 'Math functions give the same bits on every CPU and libc, as the sim'
status: Backlog
assignee: []
created_date: '2026-10-10 22:04'
labels:
  - runtime
  - determinism
  - size-M
milestone: m-8
dependencies: []
ordinal: 16700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Vendor fdlibm/msun pinned, route Math.sin/cos/tan/exp/log/pow/atan2 through it on all engines; AC: a committed golden table of 17-digit results, 3 engines; cost on Math kernels logged.

Found by ZN-612: Math.sin, cos, tan, exp, log, pow, atan2... call the platform libm (include/zn/ops.h std::sin, runtime/zrt.h __builtin_pow), whose last bits differ between Apple's arm64 and x86_64 libm, glibc, newlib (ESP32) and musl (wasm). The 3D goldens recorded on Apple Silicon differ on the Intel Mac by an edge pixel or a rounding (three_3d now compares within 1 per channel and 8 pixels). The sim (Node) uses V8's port of fdlibm (src/base/ieee754.cc), which gives the same bits everywhere. Vendor fdlibm (FreeBSD msun or V8's ieee754, pinned, licence in third_party/README.md) and route the Math rows of the interpreter, the AOT runtime and the QuickJS engine through it; measure the cost (bench kernels that call Math) and keep the libm path only where the profile asks for speed over identity, if any. Then three_3d can compare exactly again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Math.sin/cos/tan/exp/log/pow/atan2 print the same 17 digits as Node on a table of 10000 arguments, interpreted, AOT and QuickJS
- [ ] #2 the cost on the Math bench kernels is measured and logged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Bit-exact libm across CPUs is real value, but the Node sim is gone: compare against a frozen table of 10000 values made with the vendored fdlibm, not against Node.
<!-- SECTION:NOTES:END -->
