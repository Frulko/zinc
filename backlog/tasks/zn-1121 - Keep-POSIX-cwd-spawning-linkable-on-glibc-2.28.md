---
id: ZN-1121
title: Keep POSIX cwd spawning linkable on glibc 2.28
status: Done
assignee: []
created_date: '2026-11-10 20:53'
updated_date: '2026-11-10 21:13'
labels:
  - bug
  - process
  - toolchain
  - size-S
milestone: m-19
dependencies: []
ordinal: 51899
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unchanged display-gl UI export of ZN-334 reaches final AArch64 linking but fails on posix_spawn_file_actions_addchdir_np from include/zn/process_family.h. The target floor is glibc 2.28; this symbol arrived in 2.29. Reuse optional-symbol detection and the existing async-safe prepared fork fallback on desktop POSIX. Preserve cwd, PATH/env, pipes, process-group/error cleanup and the app/iOS no-fork boundary. Do not raise the target floor or rewrite the UI fixture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AArch64 and ARMv7 glibc-2.28 link checks no longer require a strong addchdir_np symbol; ZN-334 can rerun its actual export without a target-floor change.
- [x] #2 The shared desktop fallback and native spawn paths retain cwd, stdio/PATH and failure cleanup in the exact process_family regression; app-library/iOS unsupported spawning never calls a null function pointer.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10, worker branch work/1121:

- Scope: the only production caller is `src/host/loop.cpp`; all engine modes use that host helper. Changed only the shared header, its exact T0/fixtures, the host report and changelog. No app rewrite, target-floor change, TC/HAL/runtime change, dependency or new process framework.
- Research: glibc's [upstream fix record](https://sourceware.org/pipermail/glibc-bugs/2018-December/044012.html) places `_np` cwd actions at 2.29. [libuv's implementation](https://github.com/libuv/libuv/blob/v1.x/src/unix/process.c), also vendored in `third_party/libuv/src/unix/process.c:517`, tries the standard name before `_np` and treats missing support as optional. Reused that lookup order and Zinc's existing prepared fork algorithm.
- Each cwd spawn resolves the optional action without mutable/dynamically initialized static state. Missing support uses the existing fork fallback on desktop macOS/Linux only; iOS, Android and `ZN_APP_LIBRARY` stay on an `ENOSYS` error path. A successful fallback cannot fall through to a second spawn. The glibc >=2.34 close-from guard is unchanged.
- The fallback still prepares PATH candidates, file descriptors and signal configuration before fork; the child performs only async-safe group/cwd/signal/stdio/close/exec/error-write/exit operations. Existing error errno, failure reaping and parent descriptor ownership are preserved. No lifecycle state was added.
- Linux standalone tests now link `-ldl`; worker 334 confirmed the actual graphical export already links `-lpthread -ldl` in its final command, so no TC/main flag change is needed.
- AC1: pinned Zig 0.15.2 links the tiny real-header helper for `aarch64-linux-gnu.2.28 -mcpu=cortex_a53` and `arm-linux-gnueabihf.2.28 -mcpu=cortex_a8+neon`, with warnings as errors and `-fno-threadsafe-statics`. ELF dynamic symbols have no strong/weak cwd-action or close-from dependency; highest GLIBC versions are 2.17 and 2.16 respectively. An AArch64 `ZN_APP_LIBRARY` link also passes and has no fork/vfork dependency. The actual ZN-334 UI export can now be retried after integration/rebuilding its affected host archive; that larger retry belongs to 334.
- AC2: `ZINC=<read-only common>/build/zinc ZINC_ROOT=<this tree> ZINC_HEADLESS=1 tests/run --only process_family` passes, including current-source host lifecycle tests and the widened desktop fallback case. New header-only desktop/app variants force native, standard-only, `_np`-only and absent actions, checking cwd, overridden PATH/env, stdin/stdout/stderr, process groups, exit codes, ENOENT/EACCES, failure reaping and parent FD cleanup; no-cwd spawn avoids symbol lookup. App missing-action cases return ENOSYS without a null call. No actual iOS/Android SDK or device run is claimed.
- Durable proofs: `.logs/process-1121/summary.json` records compiler/source/binary hashes and exact cross-link commands; `t0.log`, `cross-*.log`, `symbols-*.log` and three ELF helpers sit beside it. `provenance.py` asserts the symbol/version/no-fork claims. All heavy commands were bounded through the main absolute `tools/work-run`, sequentially; no owned child, server or compiler remains. No full engine build, suite, benchmark, CI or QEMU run.
- usage: n/a (`tools/usage` has no transcript for this Codex worker).

Proposed tests:

- Run `tests/run --only process_family` on actual Linux/glibc 2.28 and Mojave when reachable; proves each host's real optional-symbol fallback and lifecycle cleanup (seconds, memory unmeasured).
- ZN-334: rebuild the affected cross host archive and retry its unchanged display-gl UI export at the same glibc floor (warm minutes, memory unmeasured; owned by 334/coordinator).

Proposed later line: `- ZN-1121: run the exact process-family helper on actual old-glibc Linux/Pi and Mojave; native Mac and both glibc-2.28 cross-link/symbol proofs pass, but target execution is unproven.` No new decision number or performance claim.
<!-- SECTION:NOTES:END -->
