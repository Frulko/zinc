# 0012 — PlayStation: PSn00bSDK + PCSX-Redux for ps1, gsKit for ps2

**Context.** 0009 left `ps1` as an ISA check (the fx12 runtime as a hosted Linux binary under `qemu-mipsel`) and
`ps2` text-only; both HALs had no screen. Sony's PsyQ stays excluded (spec rule 10).

**Choice.**

- **`--target ps1` is the console.** A PS-EXE (`app.exe`) plus a bootable CD image (`app.bin/.cue`, mkpsxiso) built
  with [PSn00bSDK](https://github.com/Lameguy64/PSn00bSDK) v0.24: its official Linux release zip ships the
  `mipsel-none-elf` GCC 12.3 toolchain, libpsn00b and mkpsxiso, so the image downloads one pinned file (sha256)
  instead of building GCC. The QEMU ISA check is not kept as a second target: the emulator below runs the same
  conformance programs on an R3000 model with the real SDK, which covers what it checked (`docker/sdk-mips` is now
  unused). `--profile ps1` on the host is unchanged.
- **Runner: [PCSX-Redux](https://github.com/grumpycoders/pcsx-redux) headless** (`-cli -testmode -stdout`). It
  boots its own **OpenBIOS**, so no Sony BIOS is needed anywhere; BIOS TTY output goes to stdout; a 16-bit write to
  `0x1f802082` ends the emulator with an exit code; an 8-bit write to `0x1f802081` runs a Lua slot (used for
  screenshots). The HAL checks the `"PCSX"` id at `0x1f802080` before touching these, so the same executable runs on
  hardware. PCSX-Redux has no tagged releases: the image pins a content-addressed dev build (x86_64 AppImage,
  extracted) by sha256; it needs glibc 2.43, hence `ubuntu:26.04`.
  DuckStation was the alternative (its `duckstation-regtest` dumps frames), but it needs a BIOS image and has no exit
  or TTY channel as direct as Redux's debug registers.
- **Missing libc pieces are Zinc's**: PSn00bSDK has no libm and no float printf/strtod, so `targets/ps1/crt_ps1.cpp`
  implements exact shortest/`toFixed`/`parseFloat` conversions (bignum) and a small libm (series kernels, ~1-3 ulp,
  checked against the host libm by `crt_check.cpp`). Soft-float throughout (R3000 has no FPU).
- **ps2 display with gsKit** (already in the ps2dev image): the rasterizer fills a CT32 texture in RAM, gsKit's
  texture manager uploads it, a sprite covers the double-buffered framebuffer. Running stays manual: PCSX2 needs the
  user's BIOS dump (not redistributable).
- Target specifics live in `targets/<id>/<id>.cmake`, included by the generated CMakeLists through
  `ZINC_TARGET_CMAKE`; `zinc run` builds bake a frame budget (`ZINC_FRAMES`, default 60) because a console program
  cannot read the host environment.

**Consequences.** `zinc test --target ps1` compares PS-EXE output with the fx12 sim oracle byte for byte (9/9, 3
skipped for unavailable modules). Rendering is the shared float rasterizer on a soft-float CPU: about 20 fps for
breakout in PCSX-Redux; a fixed-point or GPU-primitive path is the upgrade. Stdout and stderr share the TTY on ps1.
