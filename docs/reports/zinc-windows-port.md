# The Windows port of Zinc Next: audit, choices, first steps (2026-10-16)

Windows opens the cross-platform pass (AGENTS.md, owner 2026-10-11). This report is the plan: what is POSIX-only today, what each plugin needs,
the scored choices (RULES.md §4: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1), how far the
cross build from the Mac goes, and the blockers in order. The practical guide for a Windows machine is [`docs/targets/windows.md`](../targets/windows.md);
the earlier state is in [`zinc-next-hosts.md`](zinc-next-hosts.md) (ZN-714: console programs cross-built).

## Verdicts

| Question | Choice | Score (next best) |
|---|---|---|
| Compiler | **the pinned zig, `x86_64-windows-gnu` / `aarch64-windows-gnu`** (mingw-w64 13, libc++, winpthreads, all static); no Visual Studio | 65 (MSVC/clang-cl 45, MSYS2 gcc 43) |
| Renderer | **OpenGL through SDL3 (WGL), the replay path Linux uses (`ZN_HAL_GL`, glad)**, with the CPU renderer (`ZINC_RENDERER=cpu`) as the always-there fallback; ANGLE only if GL drivers fail in the field | 65 (SDL_GPU 55, CPU only 55, ANGLE 51) |
| Tests on Windows | **the existing `.sh` tests in Git Bash** (Git for Windows is needed for git anyway); new tests stay POSIX sh; pty tests skip with exit 77 | 60 (rewrite in `zinc test`/Zinc 59, a Python runner 54) |
| Plugins as `.dll` | **an import library of `zinc.exe`** (`--out-implib`, the `hal_*`/`zrt_*`/registry symbols exported by a `.def`); plugins link it | 60 (host-API table in `ZnHostApi`, 60: tie, fewer moving parts wins) |
| Distribution of `zinc` | **a signed `.zip` + `install.ps1`, then a winget manifest**; MSIX later for apps from the Store | 62 (Inno Setup 53, NSIS 49, MSIX 41; fit, size, maintenance and effort decide) |
| Signing | **Azure Artifact Signing** through an organisation (EU companies are eligible, individuals only in the US and Canada), signed from CI with `jsign`; SignPath Foundation if the project qualifies as open source | — (OV certificate on a token: $150 to 300 a year, no SmartScreen advantage since 2024) |
| CI | keep the two gated jobs (`vars.ZINC_WINDOWS_JOBS`); `windows-cross` also cross-builds `zinc.exe` with `cmake/zig-windows.cmake`; `windows-console` runs it; a native `windows-latest` (Server 2025) job when T0 passes in Git Bash; `windows-11-arm` (free for public repositories) for aarch64 | — |

### The compiler

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| zig `windows-gnu` (pinned 0.15.2) | 5 | 4 | 4 | 5 | 5 | 5 | 5 | **65** |
| MSVC or clang-cl + Windows SDK | 2 | 5 | 4 | 3 | 3 | 2 | 2 | 45 |
| MSYS2 mingw-w64 gcc | 2 | 4 | 3 | 3 | 4 | 2 | 3 | 43 |

zig is already the compiler of every cross build and of plugins; it cross-builds Windows from the Mac (proved below), users install nothing, and the
`.exe` imports only system DLLs (kernel32, the UCRT `api-ms-win-crt-*`, advapi32, bcrypt, psapi, ws2_32). The bundled headers are mingw-w64 13
(`_mingw_mac.h`), with Media Foundation (`mfapi.h`, `mfidl.h`, `mfreadwrite.h`), WASAPI (`audioclient.h`, `mmdeviceapi.h`), Direct3D 11/12,
`dxgi1_6.h`, `dwmapi.h`, `shcore.h`, `wrl.h`, `roapi.h` and their import libraries (`lib/libc/mingw/lib-common/*.def`). Its limits:

- **No C++/WinRT** (`winrt/base.h`) and no WinRT projection headers: toast notifications and the newer Windows APIs go through raw COM over
  `roapi.h`/`hstring.h` or a classic fallback (`Shell_NotifyIconW` balloons).
- **WebView2**: `WebView2.h` comes from the `Microsoft.Web.WebView2` NuGet package (BSD-3-Clause header, vendored like any library) and compiles with
  mingw (webview/webview does); `WebView2LoaderStatic.lib` is MSVC-only, so the plugin loads `WebView2Loader.dll` (shipped beside it, from the same
  package) with `LoadLibraryW`.
- **Debug info**: DWARF by default (lldb reads it); a PDB for WinDbg needs `-gcodeview` and lld's `--pdb`: unproven with the pinned zig.
- **C++ exceptions, `thread_local`, `std::thread`** link (the console programs and `zinc.exe` use them); proven to run under Wine 11 (below), not yet on Windows.

If one component ever needs MSVC, the Build Tools workload is named in the guide; nothing does today.

### The renderer

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| OpenGL via SDL3/WGL, the Linux replay path | 5 | 4 | 5 | 5 | 5 | 3 | 5 | **65** |
| SDL_GPU (D3D12 / Vulkan) | 4 | 5 | 4 | 2 | 5 | 5 | 1 | 55 |
| CPU frame through SDL_Renderer (d3d11 / software) only | 3 | 2 | 5 | 5 | 5 | 5 | 5 | 55 |
| ANGLE (GLES 2/3 over D3D11) | 4 | 4 | 2 | 3 | 5 | 4 | 3 | 51 |

SDL3's Windows video driver gives a WGL context; the engine already presents with OpenGL on macOS and Linux (`ZN_HAL_GL`, functions loaded
through SDL into glad's table), so Windows is the same code with a third branch in CMake. The configure run of the vendored SDL3 for Windows
lists the render drivers d3d, d3d11, d3d12, ogl and ogl_es2 (GPU is off in our build). VMs and old Intel drivers are where WGL fails: the CPU
renderer is there already, and ANGLE (`libEGL.dll` + `libGLESv2.dll`, about 7 to 8 MB, BSD) or Mesa's llvmpipe `opengl32.dll` are drop-ins
for a GL test without a driver. SDL_GPU is the long-term path for all desktops (D3D12/Vulkan/Metal) but is a new backend with its own shaders.

### Tests

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| The `.sh` tests in Git Bash | 4 | 3 | 5 | 5 | 5 | 4 | 5 | **60** |
| Port them to `zinc test` (Zinc scripts) | 5 | 4 | 5 | 3 | 5 | 5 | 1 | 59 |
| Port them to a Python runner | 4 | 4 | 5 | 2 | 5 | 5 | 1 | 54 |

457 scripts (T0 133, T1 301, T2 23), all `#!/bin/sh`; `tests/run` is sh and calls Python 3. They use `mktemp` (321 files), `trap` (319),
`/dev/null` (293), `diff` (198), `python3` (141), `expect`/`script -q` (70: pseudo-terminals, which Git Bash does not give), `cmp` (64),
`timeout` (58), `tar` (23), `ln -s` (19). Git for Windows ships all of them but `expect`/`script`, and `windows-latest` runners have it as
`shell: bash`. So: run the tests in Git Bash, make the pty tests exit 77 on MSYS (`uname -s` starts with `MINGW`), and rewrite a test only when it
fails for a reason Git Bash cannot fix. Fork is slow under MSYS: a T0 run takes longer than on the Mac, which is acceptable.

### Plugins as DLLs

A plugin module exports one `zn_module_<Name>` and gets the host through the `ZnHostApi` table (`include/zn/native.h`), but 18 plugin files also
call `hal_*` and `zrt_*` of the engine directly, which a Mach-O (`-undefined dynamic_lookup`) or an ELF `.so` resolve at load time and a PE `.dll`
cannot. Two ways: an import library of `zinc.exe` (a `.def` of the exported engine symbols, `-Wl,--out-implib`, plugins link `-lzinc`), or every
direct call routed through the table (an ABI change, 18 files). Both score 60; the import library has fewer moving parts and no ABI change.
Compiled programs (`zinc build`) already link plugins statically (`pluginSource()`), so they need neither.

### Distribution and signing

`zinc` is one executable and a `share/` tree: a `.zip` with `install.ps1` (per-user, `%LOCALAPPDATA%\Programs\zinc`, PATH for the user, no
administrator) matches `install.sh`, and a winget manifest points at the same zip. Inno Setup is the next step for Zinc Atelier (Start menu,
uninstaller); MSIX packaging adds a container that gets in the way of a tool that starts compilers and writes caches. SmartScreen reputation is
earned by a stable signing identity over downloads; an EV certificate no longer skips it (2024). Azure Artifact Signing costs about $10 a month,
needs no hardware token and signs from CI (`jsign` from macOS or Linux, `signtool` on Windows); an individual is eligible only in the US and
Canada, so in France it goes through a company. Sources: learn.microsoft.com "code signing options" (updated 2026-08-29).

## What is POSIX-only today (counts from grep over `next/src`, `include`, `runtime/`, `targets/common`)

| Area | Hits | Where | Windows answer |
|---|---|---|---|
| fork / exec / posix_spawn / waitpid / pipe | ~45 sites | `cli_core.cpp`, `main.cpp`, `test_cmd.cpp`, `agent/*`, `tc/progress.cpp`, `tc/selfupdate.cpp`, `host/sys_host.cpp` | `CreateProcessW`: **`zn::plat::spawn/wait/stop/run/capture`** (done for the CLI, below) |
| `std::system` / `popen` with `/bin/sh` lines | 40 sites | `tc/tc.cpp` (curl, tar, unzip, cmake), `cli_core.cpp` (git, ditto, hdiutil, ssh, scp, tar), `main.cpp` (the link line), `plugin_build.cpp` (pkg-config, a shell loop) | argument lists through `zn::plat::run`; Windows 10 1803+ ships `curl.exe` and `tar.exe` (bsdtar), so most lines keep their tool and lose the shell (`2>/dev/null`, single quotes, `command -v`) |
| dlopen / dlsym | 4 files | `main.cpp` (WebGL module), `host/window_module.cpp`, `tc/plugin_build.cpp`, `host/splash.cpp` | `LoadLibraryW`: **`zn::plat::libOpen`** (done for main and plugin_build) |
| BSD sockets and `poll` | ~12 files, ~20 `poll` calls | `agent/*`, `dbg/cdp.cpp`, `dbg/dap.cpp`, `dev/hot.cpp`, `cli_core.cpp`, `runtime/mod/sock.h` | Winsock 2 + `WSAPoll`: **`platform/socket.h`** (done for cdp, hot, the dev loop) |
| termios / ioctl / pty | 5 files | `cli_core.cpp` (`zinc monitor --port`), `dev/client.cpp` (serial upload), `agent/client.cpp`, `agent/server.cpp` | COM ports (`CreateFileW("\\\\.\\COMn")`, `SetCommState`), ConPTY for `zinc device shell` |
| signals, process groups | ~10 sites | `cli_core.cpp`, `agent/*`, `test_cmd.cpp`, `host/loop.cpp` (signal-name table), `prof/prof.cpp` (SIGPROF sampler) | `SetConsoleCtrlHandler`; a job object per child; a sampler thread (`SuspendThread`/`GetThreadContext`) |
| mmap | 4 files | `host/assets_host.cpp`, `host/splash.cpp`, `assets/assets.cpp`, `runtime/vm/jit.h`; `rt/machine.cpp` already guarded | `CreateFileMapping`/`MapViewOfFile`; `VirtualAlloc`/`VirtualProtect` for the JIT |
| `$HOME` and `ZINC_HOME` | 6 places | `tc::home()` (`tc/tc.cpp:196`) and 5 copies (`host/sys_host.cpp`, `agent/server.cpp`, `agent/ota.cpp`, `runtime/mod/os.cpp`) | one resolver: `ZINC_HOME`, else `zn::plat::homeDir()` (`USERPROFILE`) + `\.zinc` |
| setenv / unsetenv | 69 sites | `main.cpp` (35), `cli_core.cpp`, `test_cmd.cpp`, `sys_host.cpp` | given by `platform.h` on Windows (`_putenv_s`) |
| `st_mtim`, `realpath`, `mkdtemp`, `getpwuid`, `uname`, `/proc` | ~80 sites | `tc/bundle.cpp`, `zapp.cpp`, `main.cpp`, `cli_core.cpp`, `runtime/mod/fs.cpp`, `runtime/mod/os.cpp`, `host/sys_host.cpp` | `zn::plat::fileStamp`, `_fullpath`, `fs::temp_directory_path`, Win32 system queries |
| Text-mode `fopen` | 10 sites | `main.cpp:468`, `hal_dispatch.cpp`, `targets/macos/hal_sdl.cpp`, `agent/*`, `qjs_prof.cpp` | `"rb"`/`"wb"` where bytes are compared; the console writes `\r\n` |
| UTF-8 file names and console | every `fopen`/`ifstream(std::string)` | — | an application manifest with `activeCodePage` UTF-8 (Windows 10 1903+) and `longPathAware`, embedded with `zig rc`; `SetConsoleOutputCP(CP_UTF8)` and `ENABLE_VIRTUAL_TERMINAL_PROCESSING` for the colours (`cli_core.cpp` Paint) |
| Paths | ~150 `+ "/"` joins | everywhere | Windows accepts `/`; drive letters break the "absolute starts with `/`" tests (`loadFont`, the resolver): `fs::path::is_absolute` |
| Vendored sources | — | `third_party/libuv` (no `src/win`), `third_party/SDL3` (no `video/windows`, `core/windows`, `thread/windows`, `loadso/windows`, `joystick/windows`, ...) | re-vendor them from the pinned archives (libuv 1.53.0 sha256 `279f3f67…`, SDL3 3.4.16 sha256 `7322236c…`) |

Portable already: `std::filesystem` (33 files, ~1170 uses), the frontend, IR, ZBC, VM, AOT, runtime (mimalloc has its Windows prim, mbedTLS uses
`BCryptGenRandom`, glslang's `OSDependent/Windows` is wired in CMake), QuickJS-ng, HarfBuzz, yyjson, zstd, lz4, libwebp, stb, Yoga, Monocypher.
Case-insensitive file systems: no code depends on case, but a test that expects "file not found" for a wrong case would pass on Windows.

## What the plugins need

52 plugin directories (33 user-facing plus the display drivers). Only `async-storage` and `gsap` declare `"windows"` in `plugin.json`; no plugin
has a `_WIN32` branch of its own (the vendored Jolt, Box2D, QuickJS, RtMidi and SQLite do). `pluginTarget()` knows `macos` and `linux` only.

| Plugin | Windows work | Size |
|---|---|---|
| gestures, ink, loader, pixelfont, sprite, tilemap, osc, sonos, spotify (TypeScript only) | add `"windows": {}` | S each |
| sqlite (amalgamation has `os_win`), physics2d (Box2D), physics3d (Jolt), script (QuickJS), wasm (wasm3), lottie, svg, canvas2d, three, device, map | add the target and its defines; portable C/C++ | S each |
| audio | miniaudio 0.11.25 has WASAPI; `pthread.h` comes from winpthreads; drop the Linux `-lm -ldl` | S |
| midi | RtMidi `__WINDOWS_MM__` + `-lwinmm` (no virtual ports on WinMM) | S |
| socket, devtools, remote-view, display-remote | Winsock 2 (`WSAStartup`, `WSAPoll`, `closesocket`, `ioctlsocket`), sharing `platform/socket.h` | M |
| process | `CreateProcessW` + anonymous pipes, `TerminateProcess`; `zn::plat` has the pieces | M |
| serial | `\\.\COMn`, `SetCommState`, `SetCommTimeouts`; enumeration from `HKLM\HARDWARE\DEVICEMAP\SERIALCOMM` or SetupAPI | M |
| display-gl, mapping, 3d (GPU path) | the SDL3 window and WGL context; the software paths work as they are | M-L |
| camera | `camera.windows.cpp` on Media Foundation (`MFEnumDeviceSources`, `IMFSourceReader` to RGB32); mingw has the headers and `mf`, `mfplat`, `mfreadwrite` | L |
| webview | WebView2 (COM) on the SDL window's HWND (`SDL_PROP_WINDOW_WIN32_HWND_POINTER`); `WebView2.h` vendored, `WebView2Loader.dll` beside the plugin; needs the Evergreen runtime (in Windows 11) | L |
| system | tray (`Shell_NotifyIconW`), notifications (balloon, then toasts over raw WinRT COM), hotkeys (`RegisterHotKey`), single instance (named mutex), autostart (`HKCU\...\Run`), dialogs (`IFileDialog`), opener (`ShellExecuteW`), deep links (a protocol key) | L (opener, dialog, notification, autostart first: M) |
| video | FFmpeg through pkg-config today: vendor a Windows FFmpeg build or a Media Foundation player backend | L |
| ffi | libffi is not vendored (Windows x64 closures) | L |
| leapmotion | `LoadLibrary("LeapC.dll")` | S-M |
| gphoto2 | libgphoto2 has no Windows build: not offered on Windows | — |
| display-fbdev, -rmpp, -scrollphat, -ssd1306, -st7789, -webos, -ws2812, remarkable, imu-qmi8658, webos | device hardware: never a Windows target | — |

The builder (`src/tc/plugin_build.cpp`): a `windows` branch of `pluginTarget()`, `.dll` beside `.dylib`/`.so`, `-shared` with the import library of
`zinc.exe`, the export of `zn_module_<Name>` (`__declspec(dllexport)` in `native_gen.cpp`'s thunk), no `pkg-config` (vendored libraries only),
double-quoted command lines, size and mtime stamps (no inode or ctime; done), and `ZRT_PLATFORM` gets a `windows` value.

## The cross build from the Mac (this session)

`next/cmake/zig-windows.cmake` is a CMake toolchain file for the pinned zig: `CMAKE_SYSTEM_NAME Windows`, wrappers `zig cc|c++ -target
<arch>-windows-gnu`, `zig ar|ranlib|rc`, static link; it finds zig in `$ZINC_HOME/toolchains` (or `-DZIG=`), takes `-DZN_WIN_ARCH=aarch64`, and on a
Windows host writes `.cmd` wrappers so the same file builds natively there.

```sh
cmake -S next -B next/build-win -DCMAKE_TOOLCHAIN_FILE=next/cmake/zig-windows.cmake -DZN_HOST_GFX=OFF
BUILD_DIR=next/build-win next/tools/build zinc
```

- With the graphics host on, configure stops in SDL3: its Windows sources are not vendored (`src/thread/windows/SDL_syscond_cv.c` first).
  `-DZN_HOST_GFX=OFF` leaves the host library (event loop, window, sockets of zinc:net) out: the headless engine.
- `src/platform/` is new: `platform.h` (environment, file stamps, shared libraries, processes, the machine, `globMatch`) and `socket.h`
  (Winsock or BSD sockets, `sockRead`/`sockWrite`/`sockClose`/`sockPoll`/`sockReadNow`). The POSIX side is the code that was inline, moved
  unchanged; `tests/t0/platform.sh` runs `platform_test` on the host, and the same test cross-built for Windows passes under Wine 11
  (`platform: ok (windows x86_64)`: quoting, glob, spawn, wait, stop, capture, child-only environment, stamps, loader).
- Ported to it: `cli_core.cpp` (runArgv, the template commit, the device-sim panel, `zinc dev`'s child, its sockets, `zinc monitor`),
  `main.cpp` (stamps, re-exec, the WebGL module), `test_cmd.cpp`, `tc/progress.cpp`, `tc/selfupdate.cpp`, `tc/tuf.cpp`, `tc/bundle.cpp`,
  `tc/plugin_build.cpp`, `zapp.cpp`, `prof/prof.cpp`, `dbg/cdp.cpp`, `dbg/dap.cpp`, `dev/client.cpp`, `dev/hot.cpp`, `assets/assets.cpp`.
- What reports "not on Windows yet" instead of working: serial ports (`zinc monitor --port`, the device upload), `zinc monitor --udp`, the dev
  and hot sockets of `zinc dev` (a save restarts the program), the sampling profiler.

Also needed, and now in CMake: `_USE_MATH_DEFINES` and `NOMINMAX` for every Windows compile (`M_PI` under `-std=c++20`; zig already sets
`_WIN32_WINNT` for Windows 10), `bcrypt` for mbedTLS's entropy, `ws2_32` for `zn_platform`, and `src/host/no_host.cpp`: the entries of the
graphics host that `main.cpp` and zinc:canvas2d call (fonts, scene replays, the WebGL present hooks, permissions) answer "no host" when
`zn_host_gfx` is not built, which also repairs `-DZN_HOST_GFX=OFF` on macOS and Linux (it did not link). One name clash: `windows.h` defines
`near` (a variable of `cli_core.cpp`, renamed).

**Result: `zinc.exe` links** (x86_64, Release, 13.5 MB, PE32+ console). It imports only `KERNEL32`, `ADVAPI32`, `bcrypt`, `WS2_32` and the UCRT
`api-ms-win-crt-*` sets, all part of Windows 10 and 11. Under **Wine 11** on the Mac (`WINEDEBUG=-all MVK_CONFIG_LOG_LEVEL=0 wine zinc.exe ...`, no
window, the prefix created headless):

| Command | Under Wine |
|---|---|
| `zinc --version`, `zinc help`, `zinc doctor` | run, same text as on the Mac |
| `zinc run hello.ts` (interpreter) | prints the right line (recursion, closures, sort, template strings, UTF-8 `é`) |
| `zinc run hello.ts --engine quickjs` | same output |
| `zinc check` | 0 on a good file; on a type error the diagnostic with its code (Z0103) and exit 1 |
| `zinc --emit=zbc-bin`, `zinc zbc --check` | the bytecode file written and verified |
| `tests/golden/run/{library,exceptions,records}.ts` | output equal to the frozen `.out` |
| `zinc build hello.ts -o hello.exe` (AOT) | refused: `no pinned zig for this machine (x86_64-unknown)`: the toolchain pins have no Windows host yet (blocker 4) |
| `platform_test.exe` | `platform: ok (windows x86_64)` |

Wine is not Windows (its console, its file system on APFS, its process model), so this is a smoke test: the first real run is the
`windows-console` CI job or a Windows machine.

**aarch64 links too**: `-DZN_WIN_ARCH=aarch64` gives an 11.6 MB PE32+ Aarch64 console `zinc.exe` with the same imports, no source change
beyond the x86_64 ones. Not run (Wine on the Mac runs x86_64 Windows programs only); `windows-11-arm` runners are the first place it can.

Four `unused` warnings remain in `main.cpp` in the `ZN_HOST_GFX=OFF` configuration on every OS (variables and helpers only the host uses);
they go when the host builds on Windows.

## Blockers, in order (size: S under a day, M one to three days, L more)

1. **libuv's Windows sources** (S): `src/win/*.c` from the pinned 1.53.0 archive (sha256 in `third_party/README.md`), a `[win]` section in
   `libuv/zn-sources.txt` and its branch in CMake, links `ws2_32 iphlpapi userenv psapi dbghelp ole32 shell32 advapi32 user32`.
2. **SDL3's Windows backends** (M): `core`, `video`, `thread`, `timer`, `loadso`, `filesystem`, `joystick`, `hidapi`, `misc`, `locale`
   `/windows` from the pinned 3.4.16 archive (configure names the first missing file); a `windows` value of `ZN_PLATFORM_NAME`, the WGL branch
   of the window (glad, `ZN_HAL_GL`), SDL linked into `zinc.exe` (no window module at first).
3. **The host library on `src/platform`** (L): `host/sys_host.cpp` (processes, `getpwuid`, `uname`, `sysctl`, `/proc`, `mmap`),
   `runtime/mod/fs.cpp`, `os.cpp` and `sock.h`, `targets/common/hal_posix.cpp` beside a `hal_win32.cpp` (clock, sleep, fault handler),
   `host/assets_host.cpp` and `splash.cpp` (`MapViewOfFile`), `host/tls.cpp` (the system certificates: `CertOpenSystemStore`), the signal table
   of `host/loop.cpp`.
4. **The toolchain on a Windows host and the shell lines** (M-L): pins for `x86_64-windows` and `aarch64-windows` hosts (zig `.zip`, sha256
   `3a0ed1e8…` and `b926465f…`, unpacked with Windows' `tar.exe`), `.exe` names, and the 40 `system`/`popen` lines of `src/tc/tc.cpp`,
   `cli_core.cpp`, `main.cpp` and `plugin_build.cpp` as argument lists through `zn::plat::run`/`capture` (Windows has `curl.exe` and `tar.exe`).
   Until then `zinc build` and the plugin builds stop on Windows, and `tc/progress.cpp`/`test_cmd.cpp` run their lines with Git's `sh`.
5. **An application manifest** (S): `activeCodePage` UTF-8 (file names and `argv` in UTF-8 through the narrow APIs), `longPathAware`,
   `SetConsoleOutputCP(CP_UTF8)` and virtual-terminal colours; a `.rc` through `zig rc` in CMake.
6. **One `ZINC_HOME` resolver** (S): `tc::home()` on `zn::plat::homeDir()` and the five copies routed to it.
7. **`zinc dev` on Windows** (M): the asset and hot channels without `socketpair` (a loopback TCP pair, the handle inherited), a job object
   per child so `stop()` ends what the program started.
8. **Serial ports and terminals** (M): `zinc monitor --port`, the device upload of `dev/client.cpp` and plugins/serial on `\\.\COMn`;
   `zinc monitor --udp` on Winsock; ConPTY for `zinc device shell` (the agent itself stays Linux and macOS).
9. **The sampling profiler** (S-M): a sampler thread that suspends the main thread (`SuspendThread`, `GetThreadContext`) instead of SIGPROF.
10. **Plugins as DLLs** (M), then their Windows backends: the import library of `zinc.exe`, `pluginTarget()` `windows`, `.dll`, no
    `pkg-config`; process, socket, serial (M each), camera on Media Foundation, webview on WebView2, system (L each).
11. **Tests on a Windows machine** (M): T0 in Git Bash with the pty tests skipped on `MINGW*`; whatever fails for a Windows reason is fixed in the
    engine, not the test.
12. **Packaging and signing** (M): `tools/package` zip + `install.ps1`, Artifact Signing from CI, a winget manifest; `update-app` for Windows.
13. **Unproven tooling** (S): `windows-setup.ps1` was written without PowerShell at hand (never run); PDB output with `-gcodeview` for WinDbg.

## CI

`.github/workflows/zinc-next.yml` has `windows-cross` (ubuntu-24.04: builds zinc, cross-builds five console programs) and `windows-console`
(windows-latest, Git Bash: runs them against their frozen outputs), both behind `vars.ZINC_WINDOWS_JOBS == 'true'` and `continue-on-error`,
never run. Next, in that order: `windows-cross` also builds `zinc.exe` with the toolchain file (one cmake line, minutes on a Linux runner) and
uploads it; `windows-console` runs `zinc.exe --version`, `zinc check`, a headless `zinc run` and `platform_test.exe`; once T0 passes in Git Bash,
a native `windows-latest` job (zig from the pinned zip, Ninja) runs `tests/run --tier t0`; `windows-11-arm` for aarch64 (free for public
repositories). Windows minutes cost about 1.7 times Linux minutes on private repositories (GitHub's 2026 price list), so the cross half stays on Linux.

## When to revisit

- A Windows API the plugins need has no mingw header or import library (then: vendor the header, or a separate MSVC-built DLL behind the plugin ABI).
- WGL fails on the machines people use (then ANGLE by default, the CPU renderer stays).
- The MSYS fork cost makes T0 longer than ten minutes on a runner (then the slowest tests move to `zinc test`).
