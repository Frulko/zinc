---
id: ZN-809
title: 'Cross-platform pass: Windows port, first run and checks'
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-L
  - cross
milestone: m-11
dependencies: []
ordinal: 54400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-774.05: `zinc tour` on Windows (`cmd` needs `cd /d` and double quotes, a console reader in place of `poll`) and on Linux (the Atelier launcher path, `xdg-open`), tested on those machines.
- ZN-774.01: merge the CoreFoundation language lookup of `src/i18n` and `systemLocale()` of `src/host/sys_host.cpp` into `src/platform`, and add Windows `GetUserPreferredUILanguages` there.
- ZN-774.02: `zinc new`'s question on Windows: a console raw mode for the arrow keys (it shows numbers there now).
- ZN-773: zinc.exe cross built headless (`-DZN_HOST_GFX=OFF`, the windows-cross job) compiles again but does not link: 14 zrt symbols undefined at `<root>` (add_poller, arena_owns, arena_take, StrBuilder, clear_timer, insp_object...), seen 2026-10-21; the job is off until ZINC_WINDOWS_JOBS is set. A macOS build with `ZN_HOST_GFX=OFF` stops on zn_window_load (plugin_build.cpp's weak reference).
- Live resize (owner, 2026-10-16): Windows: dragging the edge runs Win32's modal size loop; check that SDL's watcher gets the size changes and its live-resize expose there so the frames come from `zrt_redraw` (`ZINC_LIVE_RESIZE=40` with tests/t1/window_live_resize.sh), and that min/max/aspectRatio hold.
- ZN-733: Linux: the taskbar name of a run app (SDL app metadata, WM class), `ps` (prctl or the same link) and the raise under X11 and Wayland; Windows: the taskbar and Task Manager name, and SetForegroundWindow's rules from a console.
- ZN-729: `zinc device` on Windows (Winsock, ConPTY for the terminal); the agent itself stays Linux and macOS.
- owner, 2026-10-11: Windows opens the pass; list its tasks at the review (host and window of ZN-054, dialogs, installers, a CI runner or a machine).
- Windows (docs/reports/zinc-windows-port.md, blockers 1-13 with sizes): vendor libuv 1.53.0 `src/win` and SDL3 3.4.16's Windows backends from the pinned archives, then build the host with `cmake/zig-windows.cmake` and ZN_HOST_GFX on: no event loop and no window on Windows before that.
- Windows: port the host library to `src/platform` (`host/sys_host.cpp`, `runtime/mod/fs.cpp`, `os.cpp`, `sock.h`, a `hal_win32.cpp` beside `hal_posix.cpp`, `MapViewOfFile` in `assets_host.cpp`/`splash.cpp`, the system certificates in `tls.cpp`): every program that uses timers, files, sockets or a window needs it.
- Windows: toolchain pins for a Windows host (zig 0.15.2 zips, sha256 3a0ed1e8… x86_64, b926465f… aarch64) and the 40 `/bin/sh` command lines of `src/tc`, `cli_core.cpp`, `main.cpp`, `plugin_build.cpp` as argument lists through `zn::plat::run`: `zinc build` stops on Windows today ("no pinned zig for this machine").
- Windows: an application manifest through `zig rc` (UTF-8 code page, longPathAware) and UTF-8/VT console setup: non-ASCII file names and the colours of the CLI depend on it.
- Windows: one ZINC_HOME resolver (`tc::home()` on `zn::plat::homeDir()`, its five copies in sys_host, agent and runtime/mod/os removed): `$HOME` does not exist there.
- Windows: `zinc dev` channels without socketpair (loopback TCP), a job object per child for `zn::plat::stop`, the sampling profiler on a thread, serial ports on COMn (`zinc monitor --port`, the device upload), ConPTY for `zinc device shell`: each reports "not on Windows yet" today.
- Windows: plugins as .dll through an import library of zinc.exe (scored against a host-API table in the report), `pluginTarget()` windows, then the `"windows"` entries of the TypeScript-only and portable plugins.
- Windows: first run of `tools/windows-setup.ps1` on a real machine (written without PowerShell here), of T0 in Git Bash (pty tests skip on MINGW), and of the `windows-cross`/`windows-console` jobs that now build and run zinc.exe and platform_test.exe; PDB output for WinDbg.
- Windows: packaging (`tools/package` zip, `install.ps1`, a winget manifest) and Authenticode signing through Azure Artifact Signing as an organisation (individuals are eligible only in the US and Canada), from CI with jsign.
- ZN-650.14: `loadFont` takes only POSIX absolute paths (leading `/`); add drive-letter paths on Windows.
- ZN-718: Windows: the zip of `tools/package` (never run), an install.ps1, a `windows` plugin target, after ZN-054.
- ZN-714: Windows, first run of the two CI jobs (windows-cross, windows-console), then remove their continue-on-error; nothing has run on Windows yet (output equality, exit codes, UTF-8 console, stack overflow instead of a crash).
- ZN-714: Windows host library: vendor libuv's `src/win` and SDL3's Windows sources, port `sys_host.cpp` (CreateProcess, ws2_32), `libzn_window` as a DLL; any program that uses the host (window, plugin, timers) is refused today. Table by module in `docs/reports/zinc-next-hosts.md`.
- ZN-714: Windows plugins (a `windows` target in plugin.json, .dll in plugin_build.cpp, WebView2, Media Foundation, COM serial), file dialog and the system plugin's Win32 backend.
- ZN-714: zinc.exe itself (curl/tar/sh in src/tc, fork/termios/poll) and the installer (install.ps1, signing, winget or scoop, update-app).
- ZN-?: Cross-platform pass: `zinc add npm:` on Windows (.cmd shims, quoting in cli_pm.cpp), yarn classic and berry, esbuild download on Linux and Windows
- ZN-761: check the device record on Linux (a Raspberry Pi's device tree, a PC's DMI), Windows (no record yet: WMI or the registry) and the web (navigator.userAgentData).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc.exe and the host library build and link on Windows (libuv/SDL3 win backends, sys_host port, plugins as dll)
- [ ] #2 windows-cross and windows-console CI jobs green, continue-on-error removed
- [ ] #3 zinc tour/new/device/dev, loadFont drive paths, live resize, taskbar name checked on a Windows machine
- [ ] #4 Installer (install.ps1, zip, winget) and signing path run once
<!-- AC:END -->
