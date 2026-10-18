# Windows: working on Zinc from a Windows machine

Windows (x86_64 first, then aarch64) opens the cross-platform pass. The plan, the audit and the choices are in
[`docs/reports/zinc-windows-port.md`](../reports/zinc-windows-port.md); this page is the practical side: how to set up a
machine, build, test and debug, and the milestones to a working `zinc run examples/hero`.

## Where it stands

| What | Status |
|---|---|
| Console programs (`zinc build --target x86_64-windows prog.ts -o prog.exe`, from a Mac or Linux) | cross-built since ZN-714; never run on Windows |
| `zinc.exe` itself, headless (checker, interpreter, QuickJS, ZBC; no window, no event loop) | cross-built from the Mac with `next/cmake/zig-windows.cmake`; `--version`, `run`, `run --engine quickjs`, `check`, `doctor` work under Wine 11; never run on Windows |
| `zinc build` on Windows, serial ports, `zinc dev`'s live reload, the profiler | report that they are not there yet |
| `zinc.exe` built natively on Windows with the window (SDL3, OpenGL through WGL or the CPU renderer), the event loop and the plugins that build as DLLs | `zinc run examples/hero` runs on the GPU and on the CPU renderer; `zinc doctor` names the Windows profile |
| The package and the installer | `tools/package` makes `zinc-<version>-windows-x86_64.zip`, `tools/install.ps1` installs it, the `package-windows-x86_64` CI job builds, tests and releases it (experimental, unsigned) |
| Plugins without a Windows build yet (camera, devtools, process, serial, socket; video needs FFmpeg), the device agent, installers (MSI), code signing | not started: see the milestones below |

## Which graphics card

A laptop with two GPUs (Intel for the desktop, NVIDIA or AMD for games) gives the window the faster one by default: `zinc.exe` exports the
`NvOptimusEnablement` and `AmdPowerXpressRequestHighPerformance` variables the drivers read. `ZINC_GPU=integrated` asks for the integrated one
(battery); `ZINC_GPU=discrete` or nothing asks for the discrete one. Windows' own page (Settings > System > Display > Graphics) overrides both.
`ZINC_RENDERER=cpu` skips the GPU and draws with the CPU renderer (`ZINC_RENDER_THREADS=n` sets its threads); `ZINC_GL_STATS=1` prints the card in use.
A program exported with `zinc export` does not carry the exports yet.

## Smoke tests from the Mac, under Wine

Wine runs the cross-built console programs without a Windows machine (not a proof: its console and file system are not Windows'):

```sh
cmake -S next -B next/build-win -DCMAKE_TOOLCHAIN_FILE=next/cmake/zig-windows.cmake -DZN_HOST_GFX=OFF
BUILD_DIR=next/build-win next/tools/build zinc platform_test
export WINEDEBUG=-all MVK_CONFIG_LOG_LEVEL=0 ZINC_ROOT=$PWD/next   # quiet Wine and MoltenVK; the engine's files
wine next/build-win/platform_test.exe                                # platform: ok (windows x86_64)
wine next/build-win/zinc.exe run next/tests/golden/run/library.ts    # the frozen output of library.out
```

The first run creates the Wine prefix (`~/.wine`) without a window. Nothing stays running: `wineserver -k` when done.

## A machine or a VM

- **Windows 11** (or Windows 10 22H2), x64. 8 GB of RAM, 40 GB of disk; 16 GB and an SSD make the builds bearable.
- **VM on the Mac**: on Apple Silicon, UTM or Parallels run Windows 11 for Arm: build for `aarch64` there (`-DZN_WIN_ARCH=aarch64`); x64 programs also run under Windows' own emulation. On an Intel Mac, VMware Fusion (free for personal use) or Parallels run Windows 11 x64.
- **No GPU driver in a VM** (or a basic one): OpenGL may be missing or 1.1 only. The engine's CPU renderer (`ZINC_RENDERER=cpu`) is the path that must always work; Mesa's llvmpipe `opengl32.dll` beside `zinc.exe` gives a software OpenGL when a GL test needs one.
- **A Dev Drive** (Settings > System > Storage > Disks & volumes > Create Dev Drive) for the checkout and `ZINC_HOME`: ReFS and Defender's performance mode make builds faster than folder exclusions do.

## Setup in one command

From PowerShell, in the checkout:

```powershell
powershell -ExecutionPolicy Bypass -File next\tools\windows-setup.ps1 -DryRun   # what it would do
powershell -ExecutionPolicy Bypass -File next\tools\windows-setup.ps1           # do it (no administrator rights)
# from an elevated PowerShell, once: long paths on and Defender exclusions for the checkout and ZINC_HOME
powershell -ExecutionPolicy Bypass -File next\tools\windows-setup.ps1 -Admin -NoBuild
```

It is idempotent and prints each step. It installs with `winget` what is missing (per user when the package allows; winget asks
for elevation otherwise): **Git for Windows** (git and the bash the tests run in), **CMake**, **Ninja**, **Python 3**, with a
`~/bin/python3` shim for Git Bash (the tests call `python3`, which the python.org installer does not create); sets `ZINC_HOME` (default `%USERPROFILE%\.zinc`); downloads
**zig 0.15.2** (the pin of `src/tc/tc.cpp`) into `%ZINC_HOME%\toolchains\zig-<arch>-windows-0.15.2` and checks its SHA-256;
sets `core.autocrlf=false`, `core.symlinks=true`, `core.longpaths=true` and the commit hook on the checkout; then configures
`next\build` with Ninja and the zig toolchain file and builds `zinc.exe`.

**No Visual Studio.** The pinned zig is the C and C++ compiler (mingw-w64 13 headers and import libraries, libc++ and
winpthreads linked statically): `zinc.exe` and the programs it builds need nothing installed. If a component ever needs
MSVC (an `.lib` that only `link.exe` reads), the Build Tools are enough, without the IDE:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --add Microsoft.VisualStudio.Component.VC.Llvm.Clang"
```

## Environment

| Variable | What |
|---|---|
| `ZINC_HOME` | toolchains and caches (default `%USERPROFILE%\.zinc`; the setup script sets it for the user) |
| `ZINC_ROOT` | the `next` directory of a checkout, for a `zinc.exe` built with `ZN_REPRODUCIBLE` or moved elsewhere |
| `ZIG` | the zig the toolchain file uses (default: the newest under `%ZINC_HOME%\toolchains`) |
| `ZINC_BACKGROUND=1` | windows open without taking the focus (`tests/run` sets it) |
| `ZINC_HEADLESS=1`, `ZINC_RENDERER=cpu` | no window; the CPU renderer |
| `MSYS_NO_PATHCONV=1` | in Git Bash, when an argument such as `/target:x` must not become a Windows path |

## Build

```sh
# Git Bash, in the checkout (the same tools/build as on the Mac: one job per core, load-aware)
cmake -S next -B next/build -G Ninja -DCMAKE_TOOLCHAIN_FILE=next/cmake/zig-windows.cmake -DZN_HOST_GFX=OFF
BUILD_DIR=next/build next/tools/build zinc
next/build/zinc.exe --version
```

From the Mac (cross, the same toolchain file): `cmake -S next -B next/build-win -DCMAKE_TOOLCHAIN_FILE=next/cmake/zig-windows.cmake -DZN_HOST_GFX=OFF`,
then `BUILD_DIR=next/build-win next/tools/build zinc`. Add `-DZN_WIN_ARCH=aarch64` for Windows on Arm. `-DZN_HOST_GFX=OFF`
leaves the host library out until libuv's and SDL3's Windows sources are vendored (milestones 4 and 5).

## Run the tests

The tests are POSIX shell scripts (`next/tests/<tier>/*.sh`) and stay so: they run in **Git Bash** (the choice is scored in
the report). In Git Bash:

```sh
cd next
ZINC=build/zinc.exe tests/run --only <name>        # one test
ZINC=build/zinc.exe tests/run --tier t0            # the stage tests
```

A test that cannot run on Windows (a pseudo-terminal through `script`/`expect`, `ln -s` without Developer Mode, a macOS
tool) exits 77 and is reported `SKIP` with its reason. Outputs are compared byte for byte: keep `core.autocrlf=false`, and
a program that prints through the C runtime in text mode writes `\r\n` (`tools/windows-cross check` strips it).

## Debug

- **lldb** (from the LLVM release for Windows, `winget install LLVM.LLVM`) reads the DWARF that zig writes with `-g`:
  `cmake ... -DCMAKE_BUILD_TYPE=RelWithDebInfo`, then `lldb next/build/zinc.exe -- run examples/hero`.
- **WinDbg** (`winget install Microsoft.WinDbg`) needs a PDB: compile with `-gcodeview` and link with `-Wl,--pdb=` (lld's
  MinGW driver); not tried yet with the pinned zig, the first Windows session checks it.
- `ZN_TRAP_TRACE=1` prints the interpreter's trace on a trap, as on the Mac. Crashes outside the engine: `procdump -e -ma zinc.exe`
  (Sysinternals) writes a dump WinDbg opens.
- Which DLL a program imports: `zig objdump -p zinc.exe | grep "DLL Name"` (or the Dependencies tool). File and registry
  accesses: Sysinternals Process Monitor.

## Antivirus

Defender scans every file a build writes and every `.exe` it starts, which makes builds and tests several times slower.
Best: the checkout and `ZINC_HOME` on a Dev Drive. Otherwise exclude both folders (`windows-setup.ps1 -Admin` does it, or
`Add-MpPreference -ExclusionPath <dir>` from an elevated PowerShell). A freshly built unsigned `zinc.exe` downloaded from
elsewhere carries the Mark of the Web and SmartScreen asks once: `Unblock-File zinc.exe`.

## First 10 milestones to `zinc run examples/hero`

Each is checked on a Windows machine or the `windows-console` CI job; the cross-built half is checked from the Mac.

1. [ ] **`zinc.exe` cross-links headless** from the Mac (`-DZN_HOST_GFX=OFF`) and prints `--version` on Windows (done up to Wine, 2026-10-16: the Windows run is left).
2. [ ] **CI**: `windows-cross` also cross-builds `zinc.exe`; `windows-console` runs it and the five console programs (repository variable `ZINC_WINDOWS_JOBS=true`).
3. [ ] **Processes and the shell**: one `spawn(argv)` seam on `CreateProcessW` replaces `fork`/`execv`/`posix_spawn` and the `/bin/sh` lines (`curl.exe` and `tar.exe` ship with Windows 10 1803+; no `sh -c`); `zinc run` re-execs by spawning.
4. [ ] **Event loop**: libuv's `src/win` vendored from the pinned 1.53.0 archive into `zn_uv`; timers, promises and `zinc:process` work.
5. [ ] **Window**: SDL3's Windows backends vendored from the pinned 3.4.16 archive; `hal_sdl.cpp` opens a window and presents the CPU frame (`ZINC_RENDERER=cpu`).
6. [ ] **GPU present**: the GL replay path (`ZN_HAL_GL`, glad through SDL/WGL, as on Linux); ANGLE as the fallback for a broken GL driver.
7. [ ] **Files and text**: a UTF-8 application manifest (`activeCodePage`, `longPathAware`) embedded with `zig rc`; drive-letter paths (`loadFont`, the project resolver); `ZINC_HOME` from `USERPROFILE`; binary-mode `fopen` where outputs are compared.
8. [ ] **Tests**: T0 passes in Git Bash on a Windows machine (pty tests skipped with a reason).
9. [ ] **`zinc run examples/hero`** opens, draws, takes the mouse and the keyboard; one frame hash matches the Mac's CPU frame.
10. [ ] **Plugins**: `.dll` build in `plugin_build.cpp` (import library of `zinc.exe` for the `hal_*`/`zrt_*` symbols), `LoadLibraryW`; `process`, `socket` and `system` first.

After these: the toolchain pins and `zinc toolchain` on a Windows host, packaging (zip + `install.ps1`, then winget), Authenticode signing, WebView2, Media Foundation, WASAPI (through miniaudio), serial ports.
