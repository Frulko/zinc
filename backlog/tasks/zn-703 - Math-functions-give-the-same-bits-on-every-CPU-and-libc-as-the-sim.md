---
id: ZN-703
title: 'Math functions give the same bits on every CPU and libc, as the sim'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 22:04'
labels:
  - runtime
  - determinism
  - size-M
milestone: m-8
dependencies: []
ordinal: 14600
updated_date: '2026-11-09 10:40'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Vendor fdlibm/msun pinned, route Math.sin/cos/tan/exp/log/pow/atan2 through it on all engines; AC: a committed golden table of 17-digit results, 3 engines; cost on Math kernels logged.

Found by ZN-612: Math.sin, cos, tan, exp, log, pow, atan2... call the platform libm (include/zn/ops.h std::sin, runtime/zrt.h __builtin_pow), whose last bits differ between Apple's arm64 and x86_64 libm, glibc, newlib (ESP32) and musl (wasm). The 3D goldens recorded on Apple Silicon differ on the Intel Mac by an edge pixel or a rounding (three_3d now compares within 1 per channel and 8 pixels). The sim (Node) uses V8's port of fdlibm (src/base/ieee754.cc), which gives the same bits everywhere. Vendor fdlibm (FreeBSD msun or V8's ieee754, pinned, licence in third_party/README.md) and route the Math rows of the interpreter, the AOT runtime and the QuickJS engine through it; measure the cost (bench kernels that call Math) and keep the libm path only where the profile asks for speed over identity, if any. Then three_3d can compare exactly again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Math.sin/cos/tan/exp/log/pow/atan2 print the same 17 digits as Node on a table of 10000 arguments, interpreted, AOT and QuickJS
- [x] #2 the cost on the Math bench kernels is measured and logged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Bit-exact libm across CPUs is real value, but the Node sim is gone: compare against a frozen table of 10000 values made with the vendored fdlibm, not against Node.
Done 2026-11-09 (worktree agent). Math.sin/cos/tan/exp/log/atan2 go through V8 13.6.233's fdlibm port (third_party/ieee754: Node 24.14.0's V8, unmodified, plus 3 stand-in headers); Math.pow and ** through V8's pow rules (NaN exponent, ±1 ** ±Infinity, y == 2 -> x*x, y == 0.5 -> sqrt(x + 0)), then CORE-MATH's correctly rounded pow (third_party/core-math, commit 48b66d27, MIT). One C entry point per function (include/zn/jsmath.h, src/rt/jsmath.cpp), compiled into zn_regexp, which every engine's link already has; zn_zbc links it LINK_ONLY. The interpreter and AOT reach it through include/zn/ops.h, QuickJS through patch 0005-deterministic-math.

Research (sonnet sub-agent, then checked here):
- V8 13.6: sin/cos/tan/exp/log/atan2 are src/base/ieee754.cc (fdlibm). V8_USE_LIBM_TRIG_FUNCTIONS (the glibc s_sin.c port, LGPL) is a GN default for Chrome; Node's gyp build does not set it: `nm node` shows v8::base::ieee754::sin/cos and no glibc_sin/libm_sin.
- Math.pow in V8 13.6 is v8::internal::math::pow (src/numbers/ieee754.cc); the flag use_std_math_pow defaults to true, so Node calls the platform pow (Apple libm here, glibc on Linux). Node's own pow differs between its builds: Node arm64 vs Node x86_64 on this Mac, 10 of 10000.
- Node for arm64 macOS is built with clang's default -ffp-contract=on: its fdlibm fuses multiply-adds and differs from Node x86_64 on 144 of the 60000 fdlibm lines (sin 39, cos 35, tan 65, exp 3, atan2 2). Proved: the vendored ieee754.cc built with -ffp-contract=on matches Node arm64 on 2000/2000 sin arguments; with off it differs on 8. Zinc builds everything with -ffp-contract=off, the only choice that is the same on CPUs without FMA, and that is what Node x86_64 gives.
- CORE-MATH (https://core-math.gitlabpages.inria.fr/, https://gitlab.inria.fr/core-math/core-math) pow is correctly rounded; it uses fma (hardware on arm64, libm fma() elsewhere) and _BitInt(128) on clang >= 14, so 32-bit targets build too.
- Pitfalls kept: -ffp-contract=off everywhere (CMakeLists add_compile_options), bit_cast word access (no aliasing), no -ffast-math.

Golden: tests/golden/math/ieee754.ts (10000 arguments per function from an exact LCG, plus 25 edge cases) and ieee754.out.gz. The golden is Node 24.14.0 x86_64 (`arch -x86_64 node ieee754.ts`; official darwin-x64 build, sha256 c17b234c..., run under Rosetta), except 13 pow lines where Apple's libm misrounds. Each of the 13 was checked with 100-digit Decimal (Python), and CORE-MATH was right every time:
  x, y, Node, correctly rounded
  0.2801879672333598 12 2.3409587718926198e-07 2.34095877189262e-07
  2535.5055928230286 -0.0003284186078235507 0.9974291166295515 0.9974291166295516
  0.8310282626189291 -4.178583458997309 2.1671656745581696 2.16716567455817
  200.98942425101995 -72.2912812139839 3.1670729826678243e-167 3.167072982667824e-167
  36.05074277147651 0.07750496626831592 1.3202877198616796 1.3202877198616794
  -0.47996733989566565 -35 -143744416592.15045 -143744416592.15042
  0.006280120816081762 -0.06670708092860878 1.4024620779195436 1.4024620779195438
  819.4691329263151 0.08270841757766903 1.7417012794497384 1.7417012794497386
  0.004164863750338555 25.948744313791394 1.7046285336605784e-62 1.7046285336605786e-62
  0.000467882520519197 -0.6443805187009275 139.86175148717223 139.86175148717226
  7.244883426465094 0.0370676503982395 1.0761661891965484 1.0761661891965486
  5.636386582627893e-05 0.009169751056469977 0.9141926701076586 0.9141926701076585
  8.039824082516134 -0.04780889381654561 0.9051512676973279 0.905151267697328
fdlibm's own pow (V8's legacy::pow) differs from Node on 795 of 10000, so it was rejected. Zinc prints numbers in the shortest round-trip form (Zinc has no toPrecision yet). That form is one string per double, so equal lines mean equal bits and the same 17 digits.

Proof: `build/zinc run tests/golden/math/ieee754.ts` with --interp, --native and --engine quickjs. The three outputs are byte-identical and equal the golden. Before the change the interpreter differed from Node on 6246 lines. `tests/run --only math_ieee754` PASS (new T0, three engines); `--only quickjs_patches` PASS; `--only math_consts` PASS.

Cost (#2), INDICATIVE: the machine was busy (other trees building, load average 8 to 15). M1 Pro, bench/math.ts (new: 2,000,000 calls of each function), ns per call, before (main tree build/zinc, platform libm) -> after:
  AOT (--native): sin 10-12 -> 12-14, cos 8-9 -> 12, tan 8 -> 17, exp 4-5 -> 7, log 5 -> 7, pow 13 -> 19, atan2 11 -> 11
  interpreter: sin 43 -> 54, cos 43 -> 54, tan 41 -> 58, exp 32 -> 49, log 27 -> 29, pow 40 -> 46, atan2 37 -> 39
  QuickJS: sin 69 -> 79, cos 68 -> 78, tan 63 -> 77, exp 61 -> 62, log 92 -> 97, pow 106 -> 110, atan2 84 -> 83
Apple's libm is among the fastest; the vendored files are built at -O2 inside zn_regexp. The quiet-machine number is left to the owner, for the perf log: build the commit before and after, then run `ZINC_HEADLESS=1 build/zinc run bench/math.ts --native` (and --interp, --engine quickjs) three times each on a quiet machine.

Proposed decision: Math.sin/cos/tan/exp/log/atan2 run V8 13.6's fdlibm port, compiled without FMA contraction. Math.pow and ** follow V8's pow rules, then CORE-MATH's correctly rounded pow. The result is the same bits on every CPU, libc and engine, equal to Node 24 x86_64. Node arm64 differs (its fdlibm is built with FMA contraction), and Node's pow is the platform libm (Apple's misrounds 13 in 10000). Rejected:
- the platform libm (6246 of 70000 lines differ from Node);
- fdlibm's legacy pow (795 of 10000 differ);
- glibc's trig port (LGPL, and Node does not use it);
- FMA contraction (it cannot give the same bits on CPUs without FMA).

Later lines:
- ZN-703: include/zn/ease.h and runtime/zrt.h math:: (host easing curves, gfx rotation, the prototype Dyn's pow) still call the platform libm. Route them through zn_js_* so host animations are bit-identical across CPUs too.
- ZN-703: the other Math functions (asin, acos, atan, sinh, cosh, tanh, asinh, acosh, atanh, cbrt, log2, log10, log1p, expm1, hypot) still call the platform libm. ieee754.cc already has fdlibm versions of all but hypot.
- ZN-703: three_3d can compare its frames exactly again (D82) once its goldens are re-recorded with the deterministic Math.
- ZN-703: Number.prototype.toPrecision is missing on the Zinc engines (found while writing the golden).

Proposed tests:
- `tests/run --only math_ieee754` on the Intel Mac (Mojave) and the Pi 3B+. Proves the same bits on x86_64 without FMA and on Linux ARM. About 5 s and 100 MB each.
- three_3d with exact comparison (pngdiff without --tol) on both Macs. Proves D82's tolerance can go. About a minute, a few hundred MB.
- bench/math.ts before and after on a quiet machine (command above). 10 s per engine.
<!-- SECTION:NOTES:END -->
