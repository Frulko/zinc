---
id: ZN-454
title: Console system host without libuv
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 10:14'
labels:
  - handheld
  - handhelds
  - host
  - size-M
milestone: m-23
dependencies:
  - ZN-453
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/targets/console/host_console.cpp: the HostSys and HostLoop rows (args, env, platform, real clock, wait, epoch, files through stdio, storage as a JSON file) without libuv, in the style of targets/wasm/host_wasi.cpp but with a real clock and real files; unknown rows reported once. A per-platform hook supplies now_us, sleep_us and the writable app directory. Shared by psp, vita, n3ds and ios-legacy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 builds with clang on macOS with no libuv symbol linked (checked with nm)
- [x] #2 a T0 test runs the library golden and a timers program through this host and matches the interpreter output
- [x] #3 the list of supported rows is documented in the file header
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent, handheld chain). Done.

What was done: next/targets/console/host_console.cpp, the HostSys and HostLoop rows without libuv (rows listed in its header: args, env through hal_env, platform from ZN_CONSOLE_PLATFORM, a real clock from hal_time_us with waits through hal_sleep_us, a virtual one under ZINC_DETERMINISTIC or ZINC_CLOCK=virtual, epoch, stdio files with relative paths under the data directory, storage, UTC); unknown rows are reported once on the HAL error log. The per-platform hook is the HAL itself (hal_time_us, hal_sleep_us, hal_env already exist in runtime/include/hal.h) plus one function, zn_console_data_dir(), that the console's HAL file defines. next/targets/console/CMakeLists.txt builds the core (engine = the WASI build's files with the plain allocator; ZN_NO_MIMALLOC now also keeps mimalloc.h out of src/rt/alloc.cpp) with this machine's compiler or a console SDK's toolchain file; core_main.cpp is the entry (ZN-455 adds the graphics host); stubs.cpp answers "no native modules".
Choice: storage is the desktop's `key TAB value` file (storage.kv in the data directory), not a JSON file as the description said: one format on every host, and no JSON code in the core (yyjson stays out).
Proof: tests/run --only console_host PASS (T0, tests/t0/console_host.sh): the pure core links no uv_ symbol (nm), runs tests/golden/run/library.ts and timers_order.ts from .zbc with output identical to the goldens, framed by zinc:start / zinc:exit 0, and writes files and storage.kv in its data directory. Our files build warning-free with -Wall -Wextra (Apple clang 21); zig c++ and the console GCCs are proven by ZN-456/ZN-457 builds.
Size: the pure core (interpreter + rt + console host, macOS arm64, -O3 Release) has a 400 KiB __TEXT.
<!-- SECTION:NOTES:END -->
