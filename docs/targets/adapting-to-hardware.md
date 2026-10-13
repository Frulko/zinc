# Adapting Zinc to a device

How to bring Zinc to a machine it has never run on and make it fast there. The method below is the one followed for the
HP TouchPad (webOS 3, 2011: two ARMv7 cores at 1.2 GHz, Adreno 220, a 2008 C library); every number comes from that work
and is detailed in `docs/reports/hardware/hp-touchpad-webos.md`. The rules hold for the other small targets (Raspberry
Pi 1, CHIP, the consoles): each section ends with what to check there.

The order matters: a program that runs, then the screen, then measures, then the fixes the measures name. Guessing
costs more than measuring: on the TouchPad the three first guesses (the depth buffer, the tile count, the vertex
uploads) changed nothing, and the three real causes were found by a profile, a driver trace and a 40-line benchmark.

## 1. Read the device before building for it

One script, run on the device, read-only:

| Question | Where it is read | Why it matters |
|---|---|---|
| C library and its version | run `/lib/libc.so.6`, or `ldd --version` | the target's floor: zig links against the version you name, and a newer symbol does not load |
| Calling convention | `readelf -A` of a system binary (`Tag_ABI_VFP_args`), the vendor's build flags | a hard-float program cannot call a soft-float system library (GL, SDL) |
| CPU features | `/proc/cpuinfo` | NEON, VFP level, the number of cores for the band pool |
| Kernel | `uname -r` | system calls the vendored libraries assume (libuv: Linux 3.10) |
| Screen and input | `/dev/fb*`, `/sys/class/graphics`, `/proc/bus/input/devices`, the running daemons | touch is not always an evdev device (webOS: a daemon and a socket) |
| GL libraries | `ls /usr/lib \| grep -iE "egl\|gles"`, `ldd` of the system UI | which window system gives a context |
| Certificates and clock | `/etc/ssl`, `date` | an old store or a wrong date fails every HTTPS request |
| Tools on the device | `strace`, `gdbserver`, `perf` | what the next sections can use |

## 2. The target row

`next/src/tc/tc.cpp`: a name, zig's target with the C library version, the CPU flags.

- Name the device's own C library version (`arm-linux-gnueabi.2.8`), never a newer one.
- Match the system's calling convention. With an FPU and soft-float calls (`-mfloat-abi=softfp`) check that the FPU is
  really used: `zig cc ... -dM -E -x c /dev/null | grep -E "__SOFTFP__|__ARM_FP|__ARM_NEON"`, and disassemble a function
  that multiplies two doubles. zig's `arm-linux-gnueabi` alone is pure software floating point.
- A compiler crash on vendored code is a flag problem first: zig 0.15.2 leaves VFPv3 and NEON on with VFPv2 off for
  that target, and LLVM dies on NEON intrinsics; `-Xclang -target-feature -Xclang +vfp2` repairs it.
- Start with a console program (`zinc build --target <t> hello.ts`) before anything with a screen.

## 3. What an old system lacks

Three kinds of failure, each with its own symptom:

| Symptom | Cause | Where it is handled |
|---|---|---|
| the link fails on an undefined symbol | the C library is older than the call (`pipe2`, `accept4`, `aligned_alloc`) | `next/src/host/glibc_compat.c`, `next/src/rt/alloc.cpp`: the call made as a system call |
| the program starts and dies or hangs | the C library has the call, but an older meaning: glibc 2.8 refuses every flag of `eventfd`, and its `epoll_pwait` for ARM is a stub that answers ENOSYS without a system call | the same file; found with `strace` on the device |
| the kernel answers ENOSYS | the system call came later (`sendmmsg`, `getrandom`) | nothing to do when the library has a fallback: check that it takes it |

A program that waits for the network and spins a core, or a request that times out, is the second kind. Trace it
(`strace -f -e trace=network,desc`) before reading code.

## 4. The math library: one check for every target

On the TouchPad `sin`, `cos`, `exp`, `log` and `sqrt` were zig's own implementations, built without the FPU for the
soft-float ABI, and the program took them before the device's libm: every call was computed in software.

```sh
llvm-nm prog | grep -E " (sin|cos|exp|log|sqrt|floor|pow)f?$"        # t or T: in the program; U: from the system's libm
llvm-objdump -d -C prog | awk '/^[0-9a-f]+ <.*>:$/ { f = $0 } /bl.*<__(aeabi_d|aeabi_f|muldf3|adddf3|divdf3|mulsf3)/ { n[f]++ } END { for (k in n) print n[k], k }' | sort -rn | head
```

The second line lists the functions that call the compiler's software floating point. On a machine with an FPU the
list should hold conversions and 64-bit divisions only. To check on each target:

- Raspberry Pi 1 and Zero (`armhf-linux`, VFPv2, hard-float): zig's math is built with the FPU; confirm with the line above.
- CHIP (`armv7-linux`, static musl): the math is musl's, built with the target's flags; confirm.
- PSP and PS2 (MIPS with a single-precision FPU): a `double` has no hardware there. Zinc numbers are f64, so every
  number operation is a software call unless the program is built with the f32 number profile. This is the first
  thing to measure on those targets.
- Any soft-float ABI with an FPU: `next/src/rt/alloc.cpp` already sends the five functions to the device's libm.

## 5. The screen, and what a frame costs on this GPU

A display driver is one file (`plugins/display-*`, `HalDisplay` in `runtime/include/hal.h`); a GL backend for
`display-gl` is seven functions (`plugins/display-gl/src/webos.cpp`). Loading the system's library with `dlopen` and
declaring the few functions used avoids a vendor SDK.

Before optimising, price the GPU itself with a benchmark inside the backend: a loop of clear, one quad over the
screen, swap, 120 times, then `glFinish`; then the same with a texture, with blending, with three quads over each
other. On the TouchPad:

| Frame | Time |
|---|---|
| one flat or textured quad over the screen, blended or not | 2.2 ms |
| three textured quads over each other | 5.8 ms |

This is the floor. Compare it with what the renderer needs for the same pixels (`ZINC_GL_TIME=1`, `ZINC_GL_ONLY=<mode>`):
there it was 16 ms for one colour and 32 ms for an image. The gap, not the GPU, was the problem.

Rules that the measures gave, for a mobile GPU that draws in tiles (Adreno, Mali, VideoCore, PowerVR):

1. **Few varyings, no integer emulation, no branch in a fragment shader.** The general programs of the GL replay
   reproduce the software rasterizer's blend with `floor` per pixel and carry five vectors; the lean ones
   (`ZINC_GL_LEAN=1`, `runtime/gl_replay_shaders.h`) carry two or three and blend plainly. 7 to 15 times faster a pixel.
2. **Never read the framebuffer in the middle of a frame** (`glCopyTexSubImage2D`, `glReadPixels`, a texture upload
   into a texture already drawn with, a change of render target): the GPU draws everything recorded so far and loads
   it back. Rounded clips did it once each: `ZINC_GL_CORNERS=0` doubled the frame rate of `hero`'s transitions.
3. **Find out whether the wait is the GPU or the CPU** before touching either: PC samples of the main thread (below).
   98% of the samples in the C library with the process at 17% CPU means the program waits for the GPU.
4. **A draw call and a program change are not free** in an old driver: 0.2 to 0.9 ms a draw, about 1 ms a program.
5. What changed nothing there, so measure before believing it elsewhere: no depth or stencil buffer, a 16-bit colour
   request, the occlusion pass, drawing straight to the window, client-side vertex arrays.
6. The software renderer needs every core (`render_bands.h`) and is still the wrong tool for scaled or rotated images
   (3.8 frames a second where the GPU does 59.7).

## 6. Measuring without looking at the screen

Everything below runs from the workstation.

| Tool | What it gives |
|---|---|
| `ZINC_INPUT=<file>` (`<frame> touch 0 X Y`, `<frame> touchup 0`) and `ZINC_FRAMES=n` | the same session every time: taps, flicks, tab changes |
| `ZINC_SHOT=<file>` | the last frame as a picture: the proof that the right screen was reached, and the way to read the panel |
| `ZINC_PERF_HUD=1` | frames a second in steady state and the phases of a frame (app, layout, paint, raster, present) |
| `ZINC_GL_STATS=1`, `ZINC_GL_TIME=1`, `ZINC_GL_TRACE=1` | draw calls, quads, the programs built, the time in the replay |
| `strace -T -e trace=ioctl -p <pid>` | how long each driver call blocks, and how many a frame makes |
| PC samples | a loop on the device reading field 30 of `/proc/<pid>/stat`, a few hundred times; `llvm-symbolizer` on the workstation against the unstripped binary names the functions, `/proc/<pid>/maps` the libraries |

Frames a second over a whole scripted run include the start (programs built, images decoded): use them to compare two
builds, and the panel for the steady figure.

## 7. Limits per device, and telling the developer

Not written yet; what the measures ask for:

- a profile per device in `targets/capabilities.json` (tier, GPU, the renderer to use, the lean programs, square clips);
- a frame budget in the profile and a warning in the performance panel and in `zinc dev` when a frame goes over it,
  naming the phase (the panel already counts dropped frames);
- at build time, a warning for what the device draws badly: a screen-sized animated gradient, a rounded clip, a
  polygon-heavy canvas redrawn every frame.

## Checklist

1. Device facts read (section 1) and kept in a report under `docs/reports/hardware/`.
2. Target row; a console program runs.
3. Network: one HTTPS request; `strace` clean of ENOSYS loops.
4. Math: no software floating point where there is an FPU (section 4).
5. Screen: a display driver or a GL backend; touch as presses and releases the program can count on, also at 5 frames a second.
6. The GPU's floor measured; the renderer's time for the same pixels compared with it.
7. Scripted sessions of two or three demos as the baseline; every change measured against them.
8. The defaults that won, set by the backend or the profile; what was tried without effect, written down.
