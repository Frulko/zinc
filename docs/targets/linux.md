# Linux: zinc and its programs on aarch64, armhf and x86

Zinc runs on Linux on three CPU families: 64-bit ARM (a Raspberry Pi 3, 4 or 5 on a 64-bit OS, ARM servers, Linux VMs on Apple
silicon), 32-bit ARM (every Raspberry Pi on a 32-bit Raspberry Pi OS, the Pi 1 and the Zero included) and x86 (64-bit PCs and
servers; 32-bit i686 as a bonus). Everything below is built **from a Mac** (or any machine with the pinned zig): no Docker, no Linux
machine, no Raspberry Pi needed to build.

Two things are built for Linux:

- **`zinc` itself** (the CLI: checker, interpreter, QuickJS, `zinc run` with windows and the GPU, `zinc build`, `zinc dev`...), with
  `tools/build-linux`. One archive per architecture: `zinc-<version>-linux-<arch>.tar.gz` (`bin/zinc`, `share/zinc`).
- **A program compiled ahead of time** for a Linux machine: `zinc build --target <target> prog.ts -o prog` (one executable,
  the runtime linked in) or `zinc export --target rpi|rpi1|rpi2|linux` (the program, its assets, a `.deb` with `--deb`).

## Where it stands (2026-10-17)

| | aarch64 (arm64) | armhf (ARMv6, 32-bit) | x86_64 (amd64) | i686 (x86) |
|---|---|---|---|---|
| `zinc` cross-built from the Mac (`tools/build-linux`) | yes, 17.9 MB | yes, 16.7 MB | yes, 18.7 MB | yes, 19.4 MB |
| needs from the system | glibc 2.28+ only | glibc 2.28+ only | glibc 2.28+ only | glibc 2.28+ only |
| SDL3 video drivers in it | X11, KMS/DRM, offscreen (loaded at run time) | same | same | same |
| `--version`, `run`, `run --interp`, `check`, `run --engine quickjs` on Debian 10 (glibc 2.28) | passes (emulated) | passes (emulated, ARMv7 and ARMv6 `-cpu arm1176` on Raspbian Buster) | passes (emulated) | passes (emulated) |
| a UI program headless, frame identical to the Mac's | yes | yes (ARMv7 and ARMv6) | yes | yes |
| a window on X11 (Xvfb + Mesa, Debian 12) | yes, CPU renderer (llvmpipe) | yes | yes | not tried |
| a window on a real screen, the GPU, KMS/DRM, input | not proven here (the Pi rig: `docs/reports/raspberry-pi.md`) | not proven | not proven | not proven |
| `zinc build --target` a console program | `aarch64-linux` runs on glibc 2.28 | `armhf-linux` and `armv7-linux` run on 2.28 since the floor (they needed 2.34 before) | `x86_64-linux` runs on 2.28 | `x86-linux` new |
| `zinc build --target` a UI program (graphics host cross-built, `zinc export`) | yes (since ZN-132; hero runs on the Pi 3B+) | yes: the frame identical on ARMv6 (`-cpu arm1176`) | yes: identical frame on Debian 10 | yes: identical frame on Debian 10 |
| `zinc plugin-build --target` (the plugins' native code, from the Mac) | 25 of 32 | 25 of 32 | 25 of 32 | 25 of 32 |

"Emulated" means a Debian container run by Docker (OrbStack) on the Mac, which emulates the CPU (arm64 runs natively in its Linux VM on
Apple silicon): it proves the binary, its loader, its libc floor and its code; not the speed of a device, the GPU drivers or the input
devices. The device checks are the lines of "Cross-platform pass"
in `backlog/later.md`.

## Build zinc for Linux

```sh
tools/build-linux --arch aarch64     # or armhf, armv7, x86_64, i686; next/dist/linux-<arch>/zinc-<version>-linux-<arch>.tar.gz
tools/build-linux --arch armhf --headless --no-package   # no window support, no sysroot download; just build-linux-armhf/zinc
```

What it does: fetches the target's sysroot once (below), configures `build-linux-<arch>` with `cmake/zig-linux.cmake`,
builds `zinc` through `tools/build` (one job per core, polite beside other builds), prints the size, the libraries the binary needs
(`DT_NEEDED`) and the newest glibc symbol it uses, and packs the archive with `tools/package --linux-arch <arch>`. The archive holds the
plugins' native sources: zinc compiles each with the pinned zig on the device the first time a program imports it (the zig for that
machine is downloaded and checked once, about 50 MB; pinned for aarch64, armhf, x86_64 and i686 hosts). zig's own ARM build needs
ARMv7: on a Pi 1 or Zero, zinc runs (the interpreter, QuickJS, UI programs) but cannot compile a plugin or a program; build those
elsewhere with `zinc build --target armhf-linux` or `zinc export --target rpi1`.

By hand, as for Windows:

```sh
cmake -S . -B build-linux-aarch64 -DCMAKE_TOOLCHAIN_FILE=cmake/zig-linux.cmake -DZN_LINUX_ARCH=aarch64 -DCMAKE_BUILD_TYPE=Release
BUILD_DIR=build-linux-aarch64 tools/build zinc
```

Options of the toolchain file: `ZN_LINUX_ARCH` (aarch64, armhf, armv7, x86_64, x86), `ZN_LINUX_LIBC` (gnu, musl), `ZN_LINUX_GLIBC`
(2.28), `ZN_LINUX_SYSROOT` (default `$ZINC_HOME/sysroots/<arch>-linux`), `ZIG` (default: the newest in `$ZINC_HOME/toolchains`).
`-DSDL_UNIX_CONSOLE_BUILD=ON` builds without X11 when there is no sysroot. A `Release` build is stripped; `RelWithDebInfo` keeps the
symbols for gdb (the binary is then about 190 MB).

`tools/linux-build` (the other name order) is the older way: a native build inside a Debian container, which can also run the tests.

### The sysroot

zig brings the C library. SDL3's X11 and KMS/DRM backends need the headers of X11, DRM and GBM and the libraries' files (CMake reads
their sonames; SDL3 then loads them with `dlopen`, nothing is linked). `tools/linux-sysroot --arch <arch>` downloads 41 Debian
bookworm packages (X11 and its extensions, xkbcommon, libdrm, GBM, EGL, GLES, GL, ALSA, libffi) from snapshot.debian.org at one fixed
date, checks each against the SHA-256 of `tools/linux-sysroot.lock` (a changed file is refused), and unpacks them into
`$ZINC_HOME/sysroots/<arch>-linux` (16 to 19 MB; static archives left out). It lays them over what is there: a sysroot filled by hand
with a device's FFmpeg (`docs/reports/raspberry-pi.md`) keeps it. `zinc build --target` and `zinc plugin-build --target` use the same
directory for the plugins that need a system library (display-gl's EGL, GBM and DRM, zinc:midi's ALSA, zinc:ffi). `--lock` writes the
lock again (a maintainer's step, when the snapshot date or the list changes). The packages are under MIT/X11-style licences (their
copyright files are in `usr/share/doc` of the sysroot), except libasound2 (LGPL-2.1, loaded at run time, never linked statically).

Why a fetched sysroot and not headers vendored in `third_party/`: SDL3's CMake needs the library files too, not only headers (it
reads the soname of each X11 library), the plugins need the same libraries' `.pc` files, and one pinned list serves both; vendored
headers would have needed stub libraries and a patch to SDL3's CMake.

## The flavours, and why

Scores as `RULES.md` §4 asks (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1; 1 to 5).

**glibc 2.28, dynamic (chosen) or musl, static.** A static musl `zinc` is one file that runs on any Linux kernel, Alpine included, but a
static musl program cannot `dlopen`: no plugin library, no X11 or KMS/DRM (SDL3 loads them at run time), no Mesa, no GPU. It would be a
server or container build only (`--musl`, which forces `--headless`).

| | fit | perf | size | maint | licence | port. | effort | total |
|---|---|---|---|---|---|---|---|---|
| glibc 2.28, dynamic | 5 | 4 | 4 | 4 | 5 | 3 | 5 | **61** |
| musl, static | 2 | 4 | 4 | 4 | 5 | 5 | 5 | 54 |

Measured (aarch64, natively on the M1 in Debian 12 containers, `zinc run --interp`, best of 3): binarytrees 22 / 21 ms, fib 45 / 43,
mapset 48 / 41, strings 24 / 23, nbody 799 / 795 (glibc / musl): the same speed, since the runtime's objects come from mimalloc on both.
Size: 17.9 MB (glibc, dynamic) against 16.6 MB (musl, static, nothing needed from the system). The musl build was made with
`tools/build-linux --arch aarch64 --musl` without a change to the code; it runs on Alpine 3.20 (`--version`, a program, a UI frame
headless, identical to the others) where the glibc build does not start. It stays an option for servers and containers.

The floor, 2.28, is the oldest system still met: Debian 10 and Raspberry Pi OS Buster (2.28), RHEL 8 (2.28), Ubuntu 20.04 (2.31), Raspberry Pi OS Bullseye (2.31), Bookworm (2.36), Trixie (2.41). Ubuntu 18.04 (2.27)
and Alpine (musl) are below it: build from source there, or `--musl` for a headless server. On 32-bit targets a 2.28 floor means a
32-bit `time_t` (the 64-bit time functions came with glibc 2.34): dates after January 2038 are wrong there, as in every 32-bit
program built for those systems.

**armhf: ARMv6 + VFPv2 (chosen) or ARMv7 + NEON.** The 32-bit archive targets the Pi 1's ARM1176, as Raspberry Pi OS's own 32-bit
packages do, so one file runs on every Pi on a 32-bit OS, the Pi 1, Zero and Zero W included (the cheapest boards, the ones classrooms
have). ARMv7 with NEON (`--arch armv7`, `zinc build --target armv7-linux`) is faster on a Pi 2 and later but stops at the Zero.

| | fit | perf | size | maint | licence | port. | effort | total |
|---|---|---|---|---|---|---|---|---|
| ARMv6 (arm1176jzf-s) | 5 | 3 | 4 | 5 | 5 | 5 | 5 | **62** |
| ARMv7 (cortex-a8, NEON) | 3 | 4 | 4 | 5 | 5 | 3 | 5 | 57 |

A Pi 3 or later is better served by the 64-bit OS and the aarch64 archive. `install.sh` and `zinc update` pick the armhf archive on a
32-bit Raspberry Pi OS even when its kernel is 64-bit (`uname -m` says aarch64 there; `getconf LONG_BIT` says 32).

**aarch64: ARMv8.0 tuned for the Cortex-A53** (the Pi 3's core; the A55, A72 and A76 run the same code). **x86_64: the baseline**
(SSE2), which every 64-bit PC runs; x86-64-v2 or v3 was not measured and would drop old machines for a gain the hot paths (mimalloc,
the rasterizer, the interpreter) have not shown.

**i686: built, not published.** zig builds it at no cost (SSE2 required: an x87-only CPU would round doubles differently from every other
target), and the archive passes the same checks. But 32-bit x86 Linux is fading: Ubuntu stopped it in 2019, Debian 13 keeps i386 only
for 32-bit programs on a 64-bit system. It stays a `tools/build-linux --arch i686` and a CI artifact until someone asks for it.

## On the device

- **Copy and run**: `scp zinc-<version>-linux-aarch64.tar.gz pi@pi.local:` then `tar xzf` and `zinc-<version>-linux-aarch64/bin/zinc
  --version`; or `curl -fsSL <release>/install.sh | sh` once the archives are published. `zinc device push` and `zinc device shell`
  do the same through a paired agent (`docs/reports/zinc-next-agent.md`); `zinc device deploy` builds a program here for the device
  and starts it there.
- **Groups**: `video` (the GPU and `/dev/video*` for zinc:camera), `input` (the touch screen and keyboards without a desktop), `audio`
  on systems without PulseAudio or PipeWire, `tty` to switch the console to graphics (`sudo usermod -aG video,input,tty $USER`, then
  log in again).
- **Libraries**: none for `zinc` itself beyond glibc. A window wants X11 (`libx11-6`, `libxext6`, `libxcursor1`, `libxi6`,
  `libxrandr2`) or, without a desktop, KMS/DRM (`libdrm2`, `libgbm1`) and Mesa (`libegl1`, `libgles2`, `libgl1-mesa-dri`); Raspberry Pi
  OS has them all. zinc:midi wants `libasound2`; zinc:video FFmpeg (`libavformat`, `libavcodec`, `libswscale`). Wayland desktops run
  the X11 backend through XWayland (SDL3's Wayland backend needs `wayland-scanner` at build time: not in the cross build yet).
- **GPU**: Mesa's V3D (Pi 4 and 5) and VC4 (Pi 3 and older, `dtoverlay=vc4-kms-v3d`) drivers; under llvmpipe (no GPU, a VM, Xvfb)
  the window draws with the CPU renderer on purpose.
- **Headless on a server**: `ZINC_HEADLESS=1` (no window, the null HAL; `ZINC_SHOT=frame.png` writes a frame), or
  `SDL_VIDEO_DRIVER=offscreen` for a real SDL window in memory. `zinc agent` makes the machine a device of `zinc device`.

## Cross builds of programs and plugins

`zinc build --target` takes `aarch64-linux` (`linux-arm64`), `armhf-linux` (`linux-armhf`, ARMv6), `armv7-linux` (`linux-armv7`),
`x86_64-linux` (`linux-x86_64`, `linux-amd64`) and `x86-linux` (`linux-x86`, `linux-i686`), all against glibc 2.28.
`zinc toolchain targets` lists them. A program that draws links the graphics host cross-built once into `build/cross-<target>`
(rebuilt from scratch when its triple or CPU flags change), the display driver its `zinc.json` names for Linux, and the plugins it
imports, compiled for the target (`zinc plugin-build <plugin> --target <target>` does one alone). Plugins that need a system library
find it in the sysroot above.

The plugins: camera (V4L2), microphone and audio (miniaudio), webrtc (libdatachannel), sqlite, socket, three, 3d, canvas2d, lottie,
svg, physics2d and physics3d, serial, process, system, midi (ALSA), ffi (libffi) and the others build for the four architectures. Of the 32
plugins with native code, seven do not: leapmotion, mapping and webview have no Linux target; gphoto2 and video need libraries the
pinned sysroot leaves out (libgphoto2, FFmpeg: their -dev packages pull dozens of others; FFmpeg can be copied from the device by hand,
`docs/reports/raspberry-pi.md`); script and imu-qmi8658 do not build with `zinc plugin-build` on any machine (their spec has a member
the generated thunk cannot carry). A cross build makes the static archive a program links (`zinc build --target`);
`zinc plugin-build <plugin> --target <target> --prebuild` also links the shared library `zinc run` loads on the device, which is how
the package of `tools/build-linux` ships every plugin without a system library in `share/zinc/plugins/<name>/prebuilt/linux/`
(the others are named in `sizes-linux.json` and compiled on the device at first use).

## Proving it from the Mac

```sh
docker run --rm --platform linux/arm64 -v "$PWD:/zinc:ro" -e ZINC_ROOT=/zinc debian:buster-slim /zinc/build-linux-aarch64/zinc --version
# the same with linux/arm/v7, linux/amd64, linux/386; ARMv6: qemu-arm -cpu arm1176 -L <a Raspbian Buster root> inside an arm64 container
```

Docker (OrbStack or Docker Desktop) emulates the other CPUs; no qemu needs installing on the Mac. The CI job `linux-cross` of
`.github/workflows/zinc-next.yml` builds the four archives on Ubuntu and starts each under qemu-user; it runs only when the repository
variable `ZINC_LINUX_JOBS` is `true`.
