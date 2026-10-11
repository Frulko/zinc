# Hosts: macOS, Linux, Windows (ZN-054)

| Host | Status | How it is checked |
|---|---|---|
| macOS arm64 | built and tested every task (T0, T1, T2) | local, and `.github/workflows/zinc-next.yml` (macos-14) |
| Linux aarch64 and x86_64 | builds warning-free with gcc 13; T0 and T1 pass (the 2 tests that need Node's `tsc` skip themselves); T2 run in an `ubuntu:24.04` container (see below) | Docker here, the workflow (ubuntu-24.04, ubuntu-24.04-arm) |
| Windows x86_64 | **console programs only, cross-built** (ZN-714): `zinc build --target x86_64-windows prog.ts -o prog.exe` from a Mac or Linux; `zinc` itself is not ported | `tests/t2/cross_windows.sh` (a PE32+ executable links); the CI jobs `windows-cross` and `windows-console` run five programs on a Windows runner (written, never run) |

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

## Windows, first step (ZN-714, 2026-10-11)

What works: the AOT output of a console program and the runtime it links (`src/rt`, `src/zbc`, mimalloc, libunicode) compile and link for `x86_64-windows-gnu` with the pinned zig
(mingw-w64, libc++ and winpthreads linked statically): a 1.1 MB `.exe` that imports only system DLLs (kernel32, the UCRT `api-ms-win-crt-*`, advapi32, bcrypt, psapi), so Windows 10 and 11
with nothing installed. One defect fixed: `mmap` for the VM stack (`calloc` on Windows). Nothing has run on Windows: no machine, no Wine; the CI job is the first run.

A syntax-only pass of the engine's sources for the same target (`zig c++ -target x86_64-windows-gnu -fsyntax-only`): `src/frontend`, `src/ir`, `src/zbc`, `src/vm`, `src/aot`, `src/rt`
pass, all 33 files. What stops `zinc.exe`, by module (POSIX headers and calls, counted with grep):

| Module | What is POSIX-only |
|---|---|
| `include/zn/log.h` | `unistd.h` (`isatty`, `write`): passes with mingw, not with MSVC |
| `src/tc` | `dlfcn.h` (plugin libraries), `popen`, `sys/wait.h`, `fnmatch.h` (TUF), `st_mtim` (bundle), and every download or unpack is a shell line (`curl`, `tar`, `sh`, single quotes) |
| `src/main.cpp`, `src/cli_core.cpp`, `src/test_cmd.cpp` | `dlopen`, `posix_spawn`, `fork`, `popen`, `termios`, sockets (`arpa/inet.h`, `poll`), `std::system` with sh quoting |
| `src/host` | `sys_host.cpp` (`fork`, `pipe`, `waitpid`, `dirent`, `pwd`, `utsname`, `sysctl`, `mmap`), `window_module.cpp` and `splash.cpp` (`dlopen`), `assets_host.cpp`, `permissions.cpp` |
| `src/dev`, `src/dbg` | serial ports (`termios`, `fork`), the DevTools and DAP servers (BSD sockets, `poll`) |
| `src/qjs`, `src/prof` | `pthread`, `sys/time.h`, `sys/resource.h` (mingw has the first two) |
| `third_party` | libuv and SDL3 are vendored without their Windows sources (`libuv/src/win`, `SDL3/src/video/windows`, `SDL3/src/dialog/windows`); glslang has its `WIN32` branch in CMake |

So a program with timers, promises on the event loop, files, sockets or a window (anything `aot::usesHost` sees) is refused with one line for this target: the host library is the next step.

## Result (2026-10-06)

T0, T1 and T2 pass on macOS arm64 (41) and in the Linux container (40, 1 skipped: the oracle needs Node). Found by the Linux run and fixed: the QEMU libraries (clear message), a gcc warning set (stb pragma, a `snprintf` buffer),
and `pinball_physics` differing between the interpreter and the AOT build because gcc fuses multiply-adds on aarch64: the engine and the AOT and cross builds now compile with `-ffp-contract=off`, so every host rounds alike.
The workflow `.github/workflows/zinc-next.yml` has not run yet (no push from here).
