---
id: ZN-714
title: >-
  Windows, first step: a cross build of zinc with the pinned zig and a Windows
  CI job
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-11 16:08'
updated_date: '2026-10-11 17:42'
labels:
  - windows
  - size-L
milestone: m-12
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc build --target windows-x86_64 of a console program links with the pinned zig; what does not compile is listed by module
- [ ] #2 a CI job on a Windows runner builds zinc natively or runs the cross-built program and its T0 tests; the workflow file is committed, pushing it is the owner's step
- [x] #3 the list of what a window, a file dialog and an installer need on Windows is written as lines for next/backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
What existed (read first): ZN-054 (parked, Review) verified Linux and left Windows as a list in docs/reports/zinc-next-hosts.md; the workflow had a windows-latest matrix entry that builds zinc natively and cannot pass (experimental). RULES.md: no new POSIX-only assumptions in include/zn, src/frontend, src/ir, src/zbc, src/vm. POSIX-only places by module (grep and a zig syntax-only pass for x86_64-windows-gnu): the table "Windows, first step" in docs/reports/zinc-next-hosts.md. The portable core holds: src/frontend, src/ir, src/zbc, src/vm, src/aot, src/rt pass the syntax pass (33 files); include/zn/log.h includes unistd.h (fine with mingw, not MSVC).

Step 1 (done, 64e4d57b): target x86_64-windows (zig x86_64-windows-gnu; aliases windows-x86_64, windows) in src/tc/tc.cpp. zinc build --target x86_64-windows tests/golden/run/library.ts -o library.exe links with the pinned zig 0.15.2: "PE32+ executable (console) x86-64", 1.1 MB, static libc++/winpthreads, imports only kernel32, UCRT api-ms-win-crt-*, advapi32, bcrypt, psapi. 64 s for the first build on the loaded Mac (10 runtime objects, then cached in ~/.zinc/cache/x86_64-windows). One portability defect, fixed: mmap of the VM stack in src/rt/machine.cpp (calloc on Windows). A program that draws, uses a plugin or the event loop (aot::usesHost: timers too, tests/golden/run/async.ts) is refused with one line: the host library (libuv and SDL3 are vendored without their Windows sources) is where it turns into a port. Test: tests/t2/cross_windows.sh (PASS; skips 77 without the pinned zig). Also PASS: shared_headers, cli_core, aot, run, tc, release_workflow.

Step 2 (written, never run, 2nd commit): jobs windows-cross (ubuntu: builds zinc, tools/windows-cross build: library, exceptions, dyn_values, records, const_globals, all five link here) and windows-console (windows-latest: tools/windows-cross check, each .exe against its frozen output, \r stripped) in .github/workflows/zinc-next.yml, both continue-on-error. release_workflow checks the jobs and runs the check half on stand-in programs. Criterion 2 stays open: no T0 test runs on Windows (zinc.exe does not exist; the frozen-output programs stand in) and the jobs have never run. Next command, the owner's: git push, then read the windows-console job; when it is green remove continue-on-error from both jobs. actionlint is not installed here: the YAML was only parsed with PyYAML.

Not proven: nothing ran on Windows (no machine, no Wine, as asked). Unknown until the first run: stack overflow detection (cStackLimit returns null on Windows, so typed recursion without end crashes instead of the "stack overflow" message), console output of non-ASCII text (the console code page), exit codes.

Decision to record (coordinator): Windows programs are built with zig's mingw-w64 target (x86_64-windows-gnu), linked statically, not MSVC: the pinned zig is already the cross compiler of every target, needs no Visual Studio or Windows SDK, and the .exe needs no redistributable. Revisit if a plugin needs an MSVC-only SDK (WebView2 has a mingw-usable C header; Media Foundation works with mingw).

Lines for next/backlog/later.md (criterion 3), under "Cross-platform pass":
- ZN-714: push and read the first run of the CI jobs windows-cross and windows-console, then make them blocking; nothing has run on Windows yet.
- ZN-714: Windows runtime details to check on the first machine: cStackLimit (GetCurrentThreadStackLimits) so endless recursion prints "stack overflow", SetConsoleOutputCP(65001) for UTF-8 console.log, VirtualAlloc for the VM stack if launch time shows the calloc.
- ZN-714: the host library for Windows (timers, files, sockets: every program aot::usesHost sees): vendor libuv's src/win, port src/host/sys_host.cpp (CreateProcess for fork/pipe/waitpid, FindFirstFile or std::filesystem for dirent, no pwd/utsname/sysctl), link ws2_32 iphlpapi userenv dbghelp ole32.
- ZN-714: a window on Windows: vendor SDL3's Windows sources (src/video/windows, src/core/windows, src/render/direct3d11 or the OpenGL/WGL path the GL host uses, audio wasapi, joystick, src/loadso/windows), build libzn_window as a DLL (LoadLibrary where window_module.cpp and splash.cpp use dlopen), per-monitor DPI awareness in the manifest, the transparent and frameless window pieces that are Cocoa today.
- ZN-714: a file dialog on Windows: SDL3's src/dialog/windows (IFileDialog) is not vendored; the system plugin's macOS backend (notifications, menus, tray, dock) needs a Win32 one (Shell_NotifyIcon, toast notifications, jump lists).
- ZN-714: plugins on Windows: a "windows" target in plugin.json (none names it), .dll and import libraries in src/tc/plugin_build.cpp (dlopen, .dylib/.so names, sh command lines with single quotes), LoadLibrary in main.cpp, the plugins' own system libraries (webview: WebView2, video: Media Foundation, socket: winsock, process, displays, serial COMn in src/dev/client.cpp).
- ZN-714: zinc.exe itself: src/tc shells out to curl, tar and sh (use libuv processes or CreateProcess, .zip for the zig pin x86_64-windows, esptool and QEMU pins), fork/termios/poll in cli_core.cpp and src/dbg, fnmatch in tuf.cpp, st_mtim in bundle.cpp; then the existing windows-x86_64 matrix job builds natively and T0 runs there.
- ZN-714: an installer for Windows: tools/package package_windows (a .zip, never run) needs a real installer (Inno Setup or WiX/MSIX, or winget and scoop manifests), Authenticode signing (a paid certificate or Azure Trusted Signing, else SmartScreen warns), an install.ps1 beside install.sh, PATH, the uninstall entry; for apps: zinc pack/fuse with a .exe stub, icon and version resources (.rc), the update path of zinc update-app.
- ZN-714: aarch64-windows (Windows on ARM, school Surface devices): one more row in tc.cpp once x86_64 runs.
<!-- SECTION:NOTES:END -->
