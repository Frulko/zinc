# Hosts: macOS, Linux, Windows (ZN-054)

| Host | Status | How it is checked |
|---|---|---|
| macOS arm64 | built and tested every task (T0, T1, T2) | local, and `.github/workflows/zinc-next.yml` (macos-14) |
| Linux aarch64 and x86_64 | builds warning-free with gcc 13; T0 and T1 pass (the 2 tests that need Node's `tsc` skip themselves); T2 run in an `ubuntu:24.04` container (see below) | Docker here, the workflow (ubuntu-24.04, ubuntu-24.04-arm) |
| Windows x86_64 | **not ported** | the workflow lists it as an experimental job so it starts running once the port exists |

Tests that need a tool the machine lacks exit 77 and the runner prints `SKIP name (reason)` instead of failing (`tests/run`): today the oracle tests (`tools/oracle --available` is
false without Node and the repository's `node_modules`).

`tests/t2/*.sh` read `ZINC_TEST_HOME` for the directory of the downloaded tools (default `build/tc-home`), so a container or a CI runner does not share the cache of another OS.

## What is checked on Linux

A container (`ubuntu:24.04`, aarch64) with `build-essential cmake python3 curl xz-utils git libpixman-1-0 libsdl2-2.0-0 libslirp0` (the last three are what Espressif's QEMU links against; `zinc` now names them when they are missing) builds the engine (the window HAL is left out when SDL3 is not installed: the headless host is what runs) and runs the tiers.
`zinc build --target aarch64-linux` and `zinc run --target esp32 --qemu` run from there with the tools downloaded for Linux (zig and Espressif's QEMU have Linux pins in `src/tc/tc.cpp`).

## Windows: what is missing

The engine uses POSIX in a few places that Windows does not have, so the port is real work and cannot be checked without a Windows machine:

- processes and pipes (`zinc:process`, `src/host/sys_host.cpp`: `fork`, `pipe`, `waitpid`), directory listing (`dirent`), `getpwuid`, `setenv`, `realpath`, `mkdtemp`; `src/tc` shells out to `curl`, `tar`, `sh`;
- the toolchain pins for `x86_64-windows` (zig `.zip`, esptool, QEMU for ESP32) and `.exe` names; serial ports (`COMn`) in `src/dev/client.cpp`;
- the build: MSVC or `clang-cl`/zig for the C and C++ sources (`zig c++` already targets Windows, so the pinned zig can be the compiler), and SDL3 for the window.

Order of work for whoever has the machine: build with `zig c++ -target x86_64-windows-gnu` from macOS (cross, no Windows needed to compile), then run T0 and T1 on a Windows runner, then the pins and serial ports.

## Result (2026-10-06)

T0, T1 and T2 pass on macOS arm64 (41) and in the Linux container (40, 1 skipped: the oracle needs Node). Found by the Linux run and fixed: the QEMU libraries (clear message), a gcc warning set (stb pragma, a `snprintf` buffer),
and `pinball_physics` differing between the interpreter and the AOT build because gcc fuses multiply-adds on aarch64: the engine and the AOT and cross builds now compile with `-ffp-contract=off`, so every host rounds alike.
The workflow `.github/workflows/zinc-next.yml` has not run yet (no push from here).
