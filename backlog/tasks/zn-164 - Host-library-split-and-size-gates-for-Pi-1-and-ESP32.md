---
id: ZN-164
title: Host library split and size gates for Pi 1 and ESP32
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-07 05:33'
updated_date: '2026-11-10 13:51'
labels:
  - host-modules
  - size-M
dependencies: []
ordinal: 51200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Split host rows (net/tls, sockets, regexp, crypto...) so a program links only what it uses; size gate measured on the native AOT hello; armv6/ESP32 sizes to later.md.

Since ZN-082..090 the host library (zn_host_gfx) links libuv, llhttp, mbedTLS (+755 KB stripped) and libregexp, and sys_host.cpp references all of them: an AOT program that uses any host module pays for all. Split the host rows into separately linked parts (process/loop, net+tls, sockets, regexp, crypto, osc, mqtt) so a program links only what it uses; build and measure an AOT hello and a UI program for armv6 (Pi 1, zig) and the ESP32 firmware before/after; add a size gate per target to the tests (budget recorded in docs/reports/zinc-next-packaging.md); check that the appended runtime rows do not break firmware/ build. ZN_TLS=OFF exists; add the same switch for libuv-dependent parts where the target has no POSIX sockets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AOT hello for armv6 and the ESP32 firmware build, sizes recorded before/after in docs/reports/zinc-next-packaging.md
- [ ] #2 a program that uses no network links no mbedTLS, libuv sockets or llhttp (size gate in tests)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged ZN-310 here (Sim: Interpreter size diet: libunicode behind a flag, rtcalls `-Os`, size gates per target in CI). Carry over: Interpreter size diet and size gates per target are the same work as ZN-164 (size gates for Pi 1 and ESP32); carry the xtensa 270 KB and 5%-regression script over. ZN-164 is open (Backlog) and holds the per-target size gates; carry over the libunicode build flag, rtcalls -Os, the 270 KB xtensa budget, the 5% regression script and the bench-m4 15% check.
Review 2026-10-25: merged ZN-546 here (armhf and aarch64 graphics hosts cross-built against a Raspberry Pi OS sysroot). Carry over: Graphics hosts cross-built for armhf/aarch64 against a pinned sysroot are done: tools/linux-sysroot (SHA-256 lock, Debian bookworm), `zinc build/export --target`, hero runs on the Pi 3B+ (docs/targets/linux.md table, ZN-132). Only the armhf size budget gate is left, which is ZN-164. A trixie sysroot is optional. tools/linux-sysroot with a SHA-256 lock exists and docs/targets/linux.md:27 shows UI programs cross-built for aarch64 (hero on the Pi 3B+) and armhf (frame identical under QEMU arm1176). Carry to ZN-164 or later.md: the armhf binary run on a Pi with a 32-bit userland (AC2 only proven under QEMU) and the trixie sysroot (lock is bookworm).
Review 2026-11-07: rewrite. Host library split and size gates still to do; the armv6/ESP32 builds are cross, so do the Mac part now.

2026-11-10 — measured partial native Mac host split, work/164, base d35a8eef7. Both AC remain OPEN; status Backlog, no waiver. See docs/reports/zinc-next-packaging.md “Native host split”.

Research reused coordinator's primary-source findings: CMake object/static archive extraction (https://cmake.org/cmake/help/latest/command/target_link_libraries.html#linking-object-libraries), ld64 atom/dead-strip model (https://github.com/apple-oss-distributions/ld64/blob/main/doc/design/linker.html), libuv close semantics (https://docs.libuv.org/en/stable/handle.html). Existing lite/full selection is the smallest useful mechanism: retain archive names and all permission checks; add loop.cpp to the lite archive, omit its OSC/DNS transport and corresponding dispatcher rows, and classify host.osc rows including nested workers as full-host. Full receiver liveness uses existing addActive; repeated ephemeral listen/close remains balanced. No main/tc/runtime layout/UI/HAL change and no new scheduler or dependency.

Actual same-source retained-symbol native artifacts, normal O2/dead-strip: hello 285,992 -> 285,992 B; Date.now/timer 4,797,832 -> 4,778,520 B (-19,312); file/process 4,798,736 -> 4,795,936 B (-2,800). Maps/nm remove Zinc OSC symbols, resolveHost, osc.cpp.o and libuv getaddrinfo.c.o/uv_getaddrinfo. TLS and llhttp were already absent in baseline non-network programs; no new saving claimed there. otool dependencies unchanged (hosted programs still carry existing GUI frameworks). Exact provenance, compiler/library hashes, symbols/maps/size/dylibs, sources and bounded logs are in .logs/164/before and after. Baseline common compiler SHA256 3ec59faa23598f799be9caf7f1263cdf7fc52780ced417991d2c50607f50d8d5; source0e8bd9b90 engine-identical to task base. After compiler SHA256 0c6d08e580841e78c47d84dca6c2b47ddfa81b3f1f5432576fc4ff984db61a8a.

Proof, all heavy commands serial through /Users/mowmow/Lab/zinc/tools/work-run, bounded/headless:
- 900 tools/build zinc: PASS. Existing main/CLI nanosvg/vendor warnings remain in .logs/164/build.log; no new diagnostics from changed files. Existing host -w flags unchanged.
- 60 env ZINC=build/zinc tests/run --tier t0 --only aot_embedded_blob: PASS; preserves old verified socket/mixed-worker cases, adds direct/all3 OSC rows and nested-worker selection.
- Baseline/after native hello/timer/files/process outputs and zinc check for all5 fixture sources PASS. OSC repeated listen(0), close twice, DNS send; native/interpreter/QuickJS output and enforced no-net permission refusal PASS. Fetch native still contains TLS/llhttp and reports refused (localhost port1).
- Original examples/hero native build PASS: 7,978,168 B, SHA2565ac1a4a1a76e69eeaa813da50c85ece0723dc082d3df8e47cde03a543d023ad9. All57 C++ units + shared header + PCH driver 9,537,290 B; no limits/features cut. Four headless frames with ZINC_ASSETS=$PWD/examples/hero/assets yield 69f9a01da063a4e4,56190efc4e1cea57,28c500b1de4b8d5f,c30c6b0a0061f776. Initial direct binary run without its asset environment refused city.bin; corrected to the normal assets root, no source change.
- Native nm/otool/map checks and Mac gates (hello<=300,000 B, hosted timer<=5,000,000 B, symbols retained) PASS directly; expanded lite_host script is written/proposed, not run as an additional T0. sh -n and git diff --check PASS. No suite, cross build, timing benchmark or performance claim. No process remains.

AC2 still fails literally: libuv uv_close in unix/core.c directly references uv__tcp_close/uv__udp_close and stream.c references TCP helpers. Those and UDP send internals remain in native hosted binaries; no weak stand-in or symbol hiding. Further per-family row splitting and the no-POSIX-sockets switch remain unfinished. AC1 armv6/ESP32 gates/sizes, firmware row compatibility and historical interpreter/xtensa checks stay open/deferred as review directed.

Decision proposal: reuse the existing lite archive for this measured transport-reference reduction, leave libuv upstream intact, and retain the literal zero-libuv-sockets AC; an alternate scheduler or libuv fork is not justified merely to satisfy nm. Revisit only with a supported socket-free libuv variant or a separately scoped scheduler design. No decision number allocated.
Proposed later line: ZN-164: prove per-family native selection and an actually socket-free libuv/process/timer host, then armv6/ESP32 sizes/firmware row compatibility; this Mac split removes only Zinc OSC/DNS callers.

Proposed tests:
- ZINC=build/zinc tests/run --tier t0 --only lite_host: new Mac native size/transport-symbol gates and fetch retention, roughly5–10s, memory unmeasured (native compiler bounded).
- Existing original Hero/novideo keyboard/upload and OSC worker listen/send/restart at owner milestone, seconds per smoke, memory unmeasured; cross/long/quiet tests remain unproven.
usage: n/a (tools/usage).
<!-- SECTION:NOTES:END -->
