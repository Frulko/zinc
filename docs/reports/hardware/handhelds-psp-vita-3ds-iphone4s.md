# Zinc Next on handhelds: Sony PSP, PS Vita, Nintendo 3DS, iPhone 4S (iOS 9.3.6)

Date: 2026-10-09. Status: research report. No code was changed and nothing was built. Audience: the Zinc owner and the Zinc Next backlog.

Scope: platform bring-up. For each device this report covers the hardware, the homebrew SDK, emulators and CI, how Zinc Next's
architecture maps onto it, where the milliseconds are, and ordered tasks: hello, then bouncing-ball, then a UI demo, then 3D.
The companion report [`pocketjs-pocket3d.md`](pocketjs-pocket3d.md), written the same day, covers the PocketJS / Pocket3D demos
on the same four devices: the 3D content pipeline (the "cooker"), pack formats, and what those demos need. This report does not
repeat it. Target ids follow that report: `psp`, `vita`, `n3ds`, `ios-legacy`.

How facts were checked:

- Web sources are listed at the end ([S1]... in the text).
- Repository facts come from reading `next/`, `runtime/`, `targets/`, `plugins/` and `docs/`.
- Six facts were checked on this machine (2026-10-09) and are marked **(local)**:
  - Xcode 26.3's `ld` (ld-1230.1) prints `configured to support archs: armv6 armv7 armv7s arm64 ...` and
    `will use ld-classic for: armv6 armv7 armv7s ...`.
  - Apple clang 21 compiles C and C++20 (including `thread_local`) for `-target armv7-apple-ios9.0`.
  - The Docker Hub tags of `pspdev/pspdev` (amd64 only), `vitasdk/vitasdk` (amd64 and arm64) and `devkitpro/devkitarm`
    (amd64 and arm64).
  - The release assets of pspdev `v20261001`, VitaSDK `sdk-snapshot-20260926` and Azahar `2126.2`.
  - The command-line parsers of PPSSPPHeadless, Vita3K and Azahar, read from source.
  - Azahar logs `svcOutputDebugString` under the `Debug_Emulated` class.

Statements marked *(inference)* or *(verify)* are not confirmed by a source.

---

## 0. Summary

| | PSP (1000 / 2000+) | PS Vita | 3DS (Old / New) | iPhone 4S |
|---|---|---|---|---|
| CPU | Allegrex MIPS32 (R4k-based), 1–333 MHz, 16+16 KiB L1, 16 KiB scratchpad, **single-precision FPU only**, VFPU (128 × f32) [S1][S2][S3] | 4× Cortex-A9 (3 for apps), 333 MHz default, **444 MHz** max supported, NEON [S10][S11][S14] | ARM11 MPCore, VFPv2, no NEON. Old: 2 cores at 268 MHz. New: 4 cores at 804 MHz + 2 MiB L2 [S20][S21] | Apple A5: 2× Cortex-A9 at 800 MHz, NEON, 32+32 KiB L1, 1 MiB L2 [S30] |
| RAM / video memory | 32 / 64 MiB + 2 MiB GE eDRAM [S1] | 512 MiB + 128 MiB VRAM (CDRAM) [S10] | 128 / 256 MiB FCRAM + 6 MiB VRAM [S20][S21] | 512 MiB shared [S30] |
| App budget | ~24 MiB (1000); larger partition through `MEMSIZE` in PARAM.SFO (2000+) [S5] | 256 MiB (+~109 MiB in extended mode) + 112 MiB CDRAM + 26 MiB phycont [S15] | 64 MiB (Old, Prod) / 124 MiB (New, Prod) [S22] | stay under ~200 MiB (Apple's advice for devices before the 6s) [S35] |
| GPU, API | GE: fixed function, display lists, `sceGu` | SGX543MP4+, GXM (low level), GLES1/2 through PVR_PSP2 or vitaGL | PICA200: programmable vertex/geometry, fixed fragment (TEV), citro3d/citro2d | SGX543MP2, **OpenGL ES 2.0 only** (no ES3; Metal needs A7) [S31][S32] |
| Screen | 480×272 LCD | 960×544 (OLED on 1000, LCD on 2000) | top 400×240 (×2 for stereo, 800 wide mode), bottom 320×240 resistive touch | 960×640 (480×320 points at scale 2) |
| SDK | pspdev: GCC **15.2.0**, binutils 2.44, newlib 4.5.0, pthread-embedded [S6] | VitaSDK: GCC **15.2.0**, binutils 2.46.1 [S12] | devkitARM: buildscripts pin GCC **16.1.0**, binutils 2.46.0, newlib 4.6.0; libctru, citro3d [S23] | Xcode 26 clang + ld-classic (local) + an iPhoneOS SDK that still has armv7 stubs [S33][S34] |
| Emulator | PPSSPPHeadless: stdout, `--compare`, `--screenshot-save`, `--graphics=software` [S8] | Vita3K (GPLv2): `--installed-path`, `--console`, firmware PUP needed [S16] | Azahar 2126.2 (Qt `-g` gdb stub, `-p` movie, `-d` video dump) or its libretro core + RetroArch `--max-frames-ss` [S24][S25] | none faithful. The Simulator is modern iOS only; use a device lab (libimobiledevice) |
| Zinc number profile | **f32** (doubles are software-emulated) | f64 | f64 (VFP11 has double precision) | f64 |
| 2D on the GPU | fixed-function replay: GE sprites + glyph and corner atlases + CPU tiles | the display-gl GLES2 renderer (PVR_PSP2) or a GXM port of it | fixed-function replay on PICA (citro3d) | the display-gl GLES2 renderer, **almost as is** |
| 3D | `zinc:3d` on the GE (hardware T&L, VFPU gum) | `zinc:3d` on GLES2 + WebGL1; three.js ≤ r162 only | `zinc:3d` on citro3d (+ stereo) | `zinc:3d` on GLES2 + WebGL1; three.js ≤ r162 only |

Recommendations, in priority order:

1. **Two delivery paths per device, as on the ESP32** (`docs/reports/zinc-next-esp32.md`).
   - A **prebuilt core**: interpreter + `src/rt` + the graphics host + the HAL, built once per device by maintainers and
     committed or downloaded.
   - `zinc export --target psp|vita|n3ds|ios-legacy` packs the program's `.zbc` and assets next to that core:
     DATA.PSAR or a folder for PSP, the VPK zip for Vita, the 3DSX RomFS for 3DS, the `.app` bundle for iOS.
   - No SDK or Docker is needed for users. This matches the single-app vision.
   - The **AOT** path (SDK needed) is for release builds and speed.
2. **Native HALs** (`targets/<id>/hal_<id>.cpp` implementing `runtime/include/hal.h`), modelled on `targets/ps2/hal_ps2.cpp`
   (about 100 lines).
   - The vendored SDL3 3.4.16 knows PSP, Vita and N3DS in its CMake (`SDL_VIDEO_DRIVER_PSP/VITA/N3DS`), but the sources were
     pruned from `third_party/SDL3`.
   - SDL3 needs iOS 11 or newer [S36], so it cannot serve the 4S.
   - Native HALs are shorter than a port of SDL to every SDK, and the GPU work below is native anyway.
3. **The software rasterizer first, then GPU replay of `HalCmdList`.** The display-gl design
   (`docs/reports/gpu-renderer-design.md`) already turns the 10 command kinds into GPU draws.
   - iPhone 4S and Vita are GLES2 (the GLSL ES 1.00 uber shader in `plugins/display-gl/src/gl_renderer.cpp`).
   - PSP and 3DS have no fragment shaders. They need a shared **fixed-function replay**: sprites, a glyph atlas, a corner
     atlas, vertex-colour gradients, scissor, and CPU-rasterized tiles for what cannot be expressed.
4. **No libuv on the consoles.**
   - libuv needs epoll or kqueue, which the consoles do not have.
   - Its Darwin clock calls `mach_continuous_time()` (`third_party/libuv/src/unix/darwin.c:62`), which is iOS 10+.
   - A small console system host (clock, wait, args, files) in the style of `next/targets/wasm/host_wasi.cpp` serves all four.
5. **iOS 9 C++20 pitfalls.**
   - `src/rt/machine.cpp:41` formats numbers with floating-point `std::to_chars`, which Apple's libc++ marks unavailable
     before recent OS versions [S37].
   - Link a static LLVM libc++ (or swap in a header-only shortest round-trip printer).
6. **3D: `zinc:3d` per-target native backends** (`plugins/3d/native/render3d.<target>.cpp` already exists per target), with
   the three.js API subset (`plugins/three`) on top.
   - Real three.js through `zinc:script` + WebGL is possible only on Vita and the 4S, and only with **three.js ≤ r162**:
     r163 removed WebGL1 [S38], and both GPUs are ES2-only.
7. **Testing without hardware.**
   - PSP: PPSSPPHeadless is the best runner of the four (stdout, screenshot, exit code).
   - 3DS: Azahar (log + gdb stub) or its libretro core under RetroArch `--max-frames --max-frames-ss`.
   - Vita: Vita3K, the weakest (needs firmware files, Vulkan/OpenGL 4.4 GPU).
   - iOS: no emulator. A Simulator build covers logic only; a tethered device lab gives the real gate.

---

## 1. What Zinc has today that matters

- **Prototype targets `ps1` and `ps2`.**
  - Built by the old compiler (`compiler/src/cli.ts` `DOCKER` table, docker images `docker/sdk-psx`, `docker/sdk-ps2`).
  - HALs `targets/ps1/hal_ps1.cpp` and `targets/ps2/hal_ps2.cpp` (gsKit texture upload, libpad).
  - PS1 runs headless in PCSX-Redux with TTY markers `zinc:start` / `zinc:exit`. PS2 is build-only (`docs/targets/playstation.md`).
  - Next does not build them: `docs/reports/zinc-next-toolchain.md` lists "PS1 and PS2 (their own toolchains)" as not covered.
    ZN-156 (freestanding PS1 runtime spike) and ZN-145 (4-byte references in AOT for 32-bit targets) are parked.
  - The HAL files under `targets/` are shared by both engines, so a `hal_psp.cpp` serves Next directly.
- **The Next profile table** (`next/src/frontend/profile.cpp`) already has `f32` (`esp32`, `ps2`) and `fx12` (`ps1`) rows.
  `targets/capabilities.json` has `ps1` and `ps2` entries.
- **32-bit precedent.**
  - The interpreter already runs with 4-byte pointers in the WASI build (`next/tools/build-wasm`, ZN-135).
  - The ESP32 core image (Xtensa, 32-bit) is 841 KB with ESP-IDF (`firmware/esp32/prebuilt/esp32-core-flash.bin`).
  - AOT cross builds exist for `armhf-linux` (`src/tc/tc.cpp`).
- **Engine core needs nothing exotic.**
  - `src/rt`, `src/vm` and `src/zbc` throw no C++ exceptions. The only throw is `std::bad_alloc` in `rt.h` allocate; the WASI
    build stubs `__cxa_throw` (`next/targets/wasm/stubs.cpp`).
  - They use no `<filesystem>`. `src/rt/native.cpp` uses `std::thread`/`std::mutex` (the native-plugin registry).
  - The VM dispatches with computed `goto` (GCC/Clang extension, fine on all four toolchains).
- **The graphics host** (`src/host/gfx_host.cpp`) runs the old runtime (`runtime/zrt.cpp`, `raster.cpp`, `gfx.cpp`) with its
  own flags (C++17, no exceptions, no RTTI). `runtime/raster.cpp` uses `thread_local` (`ZRT_TLS`): check TLS on each toolchain.
- **GPU 2D**: `plugins/display-gl` replays `zrt::raster::Cmd` (`CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP,
  UNCLIP`) with a GLSL ES 1.00 SDF shader. It is verified on a Pi 3B+ with GLES2.
- **3D**:
  - `zinc:3d` is software, with per-target native files (`render3d.host.cpp`, `.esp32`, `.rpi1`, `.wasm`).
  - `plugins/three` is a three.js API subset over `zinc:3d`.
  - Real three.js r186 runs in `zinc:script` (QuickJS) over `libzn_webgl` (`next/src/gl`, `Api::Gles2` is used for the Pi 3).
- **Missing**: `zinc:audio` (ZN-390, miniaudio planned).

---

## 2. Sony PSP

### 2.1 Hardware

- **CPU.** Allegrex, a 32-bit MIPS32 R4k-based core with extra multiply-add, bit-field and byte-swap instructions.
  - Clocked 1–333 MHz. Licensed software was capped at 222 MHz until firmware 3.50 [S1][S2].
  - 16 KiB I-cache, 16 KiB D-cache, 16 KiB scratchpad. No MMU. The system bus runs at half the CPU clock [S1].
  - Cache control is manual: the GE does not snoop the CPU cache, so data must be written back before the GPU reads it [S2].
  - **The FPU is single precision only** [S2]. Doubles are software-emulated, so the PSP profile must use `f32` numbers.
- **VFPU** (coprocessor 2): 128 single-precision registers in 8 blocks of 16, addressable as scalars, rows, columns, 4×4
  matrices or transposed matrices.
  - `vmmul.q` multiplies 4×4 matrices in one instruction. Prefix instructions swizzle and negate operands [S4].
  - Peak quoted at 2.6–3.2 GFLOPS [S1].
  - Sony never documented it. `pspdev/vfpu-docs` is the reference [S4].
- **Media Engine.** A second Allegrex without VFPU, with its own 2 MiB eDRAM. Officially not programmable.
  - Homebrew can run code on it (MElib, a wrapper of Daedalus64's ME work).
  - 2026 work by m-cid unlocked more of it [S9].
- **Memory.**
  - 32 MiB (PSP-1000) or 64 MiB (2000 and later) main RAM, plus 4 MiB eDRAM: 2 MiB for the GE, 2 MiB for the ME [S1].
  - PSP-1000 user space is ~24 MiB [S5b].
  - pspsdk's `build.mak` writes `MEMSIZE` into PARAM.SFO by default for firmware > 3.90 (opt-out `PSP_LARGE_MEMORY=0`). On
    2000+ models this gives the larger user partition (commonly cited as ~52 MiB, *verify on device*) [S5].
  - `PSP_HEAP_SIZE_KB(-1)` (`sce_newlib_heap_kb_size`) gives the newlib heap everything that is left [S5].
- **GPU (GE).** 166 MHz, draws only into VRAM, reads textures from VRAM or RAM (slower from RAM) [S1][S3].
  - Display lists of 32-bit commands (8-bit opcode + 24-bit data).
  - Vertex formats with 8/16/32-bit positions, normals and UVs and 16/32-bit colours.
  - Hardware T&L with 4 lights. A screen-space rectangle primitive (`GU_SPRITES`).
  - The hardware clipper handles **only the near plane**. Triangles beyond a 4096×4096 virtual viewport are discarded [S3].
  - Framebuffers in 5650/5551/4444/8888 with a 16-bit depth buffer. CLUT textures with shift/mask lookup. Bezier and spline
    patches [S3].
  - Textures are power-of-two, up to 512×512. Swizzled layout of 16 bytes × 8 rows, set by the last argument of
    `sceGuTexMode` [S7].
- **Display**: 4.3" 480×272 [S1]. The framebuffer stride is 512 pixels.
- **Audio**: hardware PCM channels through `sceAudio`, and the ME's decoders (ATRAC3, MP3, AAC) via `sceAtrac`/`sceMp3`.
- **Input**: D-pad, four face buttons, L/R, Start, Select, an analog nub that slides [S1]. HOME is handled by the system: the
  HAL must register an exit callback. No touch screen and no motion sensors.
- **Connectivity**: Wi-Fi 802.11b only, ad hoc and infrastructure [S1].
  - Stock firmware never supported WPA2. ARK-4 custom firmware added WPA2-AES in 2025, 2.4 GHz only [S17].
  - IrDA on the PSP-1000. Bluetooth on the PSP Go only. Mini-USB (PSPLINK).
  - Camera: the Go!Cam USB accessory (`sceUsbCam`).

### 2.2 SDK and toolchain

- **pspdev** (BSD-licensed pspsdk; GCC is GPL with the runtime exception).
  - `psptoolchain-allegrex` pins GCC `allegrex-v15.2.0`, binutils `allegrex-v2.44`, newlib `allegrex-v4.5.0`,
    pthread-embedded [S6].
  - Release `v20261001` ships ready tarballs: `pspdev-macos-latest-arm64.tar.gz`, `pspdev-macos-15-intel-x86_64.tar.gz`,
    `pspdev-ubuntu-latest-x86_64.tar.gz`, `pspdev-ubuntu-24.04-arm-arm64.tar.gz`, Debian and Fedora (local).
  - Docker `pspdev/pspdev:latest` and `v20261001` exist for amd64 only (local).
- **CMake**: `psp-cmake` or `-DCMAKE_TOOLCHAIN_FILE=$PSPDEV/psp/share/pspdev.cmake`.
  - `create_pbp_file(TARGET ... TITLE ... BUILD_PRX ...)` runs `psp-fixup-imports`, `mksfoex` and `pack-pbp`.
  - Current firmware runs PRX, not ELF: build with `BUILD_PRX=1` [S6b].
- **C++20**: GCC 15 covers C++20. libstdc++ includes floating `std::to_chars`.
  - Build the core with `-fno-exceptions -fno-rtti -ffp-contract=off -G0` (*inference: -G0 avoids small-data overflow in big
    binaries*).
- **Integration into Zinc.** Pin the pspdev tarball per host in `src/tc/tc.cpp` with its SHA-256, like zig. No Docker.
  - Users of the core path need none of it. Only `zinc build --aot --target psp` and maintainers rebuilding the core do.
- **Dev loop on hardware**: custom firmware (ARK-4 on 6.60/6.61) + PSPLINK.
  - `usbhostfs_pc` maps a host folder as `host0:`; `pspsh` runs programs from it [S18].
  - ARK-4's repository was archived on 2026-08-02. ARK-5 needs ARK-4 installed first [S18].

### 2.3 Emulators and CI

- **PPSSPPHeadless** (GPLv2+), from `headless/Headless.cpp`, local read [S8].
  - Takes a PRX, ELF, PBP or ISO. Forwards the program's stdout/stderr (on by default).
  - Options: `--root`, `--compare` (line-by-line against `.expected`), `--timeout-wall=`, `--graphics=software`,
    `--screenshot-save=x.png`.
  - Exit code 0/1 for pass/fail. Screenshot comparison is MSE on a 512×272 image [S8b].
  - `ppsspp_emu_api.h` lets a program detect the emulator and emit a screenshot [S8c].
  - CI recipe: build PPSSPPHeadless from a pinned commit (Linux and macOS), then
    `PPSSPPHeadless --graphics=software --timeout-wall=30 --screenshot-save=shot.png app/EBOOT.PBP`.
  - Read the output between the HAL markers `zinc:start` / `zinc:exit`, the same contract as the PS1 runner.
- **RetroArch + the PPSSPP libretro core** is an alternative (`--max-frames=N --max-frames-ss --max-frames-ss-path=`, local
  read of `retroarch.c`) [S25].
- **Limits**: PPSSPP is HLE. Timing, cache behaviour and some GE corner cases differ from hardware [S8b]. Performance numbers
  from PPSSPP are not authoritative.

### 2.4 How Zinc maps

| Zinc piece | PSP implementation |
|---|---|
| HAL init / frame | `sceDisplaySetMode`, `sceGuInit`, two 16-bit framebuffers (512×272×2 bytes each) + optional 16-bit depth in VRAM, `sceDisplayWaitVblankStart`. `scePowerSetClockFrequency(333, 333, 166)` at start |
| `hal_present` (stage 1) | render the damaged bands into a 5650 RAM buffer, `sceKernelDcacheWritebackRange`, copy to the back buffer with `sceGuCopyImage` (GE block transfer), flip at vblank |
| `hal_present` (stage 2) | fixed-function replay (§6.1) with `GU_SPRITES` and `GU_TRANSFORM_2D` |
| Input | `sceCtrlSetSamplingMode(PSP_CTRL_MODE_ANALOG)` + `sceCtrlReadBufferPositive` into `HalInput.buttons`. The nub drives a virtual pointer for `zinc:ui` (toggle with Select). Circle/Cross confirm follows the system setting |
| Text input | `sceUtilityOskInitStart` from `hal_text_input` |
| Clock | `sceKernelGetSystemTimeWide()` (µs) |
| System host | the console host of §6.2: `ms0:/PSP/GAME/<app>/` as the app directory, `sceIo` through newlib stdio |
| Threads | one core; `std::thread` via pthread-embedded (*verify*). Band threads give nothing, so keep one band |
| Networking | `sceNetInit` + `sceNetApctlConnect` (stored profile) + BSD sockets (`sceNetInet`), 802.11b. mbedTLS from `next/third_party` for TLS |
| Audio (after ZN-390) | a miniaudio custom backend over `sceAudioChReserve`/`sceAudioOutputBlocking` at 44.1 kHz on a dedicated thread. Later, decoding on the ME (MElib) |
| Memory | TLSF heap of 16 MiB on 2000+ (8 MiB on 1000, set per project in zinc.json). Code ≈ 1.5–3 MiB for core + runtime (*estimate from the ESP32 core and WASI object sizes*). VRAM: framebuffers 557 KiB + depth 278 KiB, about 1.1 MiB left for atlases and textures |
| AOT | `psp-g++ -O2 -march=allegrex -G0 -ffp-contract=off -fno-exceptions -fno-rtti`, linked with `src/rt` + host into a PRX inside EBOOT.PBP. ZN-145 (4-byte references) halves the slot memory later |
| 3D | `render3d.psp.cpp`: hardware T&L (4 lights), `sceGum` with VFPU matrices, near-plane clip in hardware, software culling for the other planes |
| WebGL | not possible (no programmable shaders). three.js API subset only |

### 2.5 Where the milliseconds are

- **Clock**: run at 333/166 MHz. The default may be 222 MHz.
- **f32 everywhere.**
  - Audit `runtime/` and the host for `double` math in hot paths: `raster.cpp` is float.
  - Use `-fsingle-precision-constant` in raster code only. A double literal silently pulls in the soft-float library.
- **16-bit colour**: 5650 framebuffers + GE dithering halve fill and copy bandwidth against 8888.
- **Display lists**:
  - One list per frame, double-buffered, allocated with `sceGuGetMemory`.
  - Use the uncached alias (`| 0x40000000`) or write back the D-cache once per frame, not per draw.
  - `sceGuFinish` + `sceGuSync` once.
- **Sprites, not triangles**: `GU_SPRITES` takes 2 vertices per rectangle. Use 16-bit vertex positions and UVs
  (`GU_VERTEX_16BIT|GU_TEXTURE_16BIT|GU_COLOR_8888`).
- **Textures**:
  - Swizzle everything static.
  - A 4-bit CLUT (T4) or 8-bit glyph atlas: T4 alpha ramps cut texture memory 8× against 8888.
  - Keep atlases in VRAM.
  - Draw wide textured sprites in vertical strips of about 64 px so the texture cache does not thrash (the texture cache is
    small, commonly cited as 8 KiB, *verify*).
- **VFPU** for `zinc:3d` transforms and skinning (pspgum's VFPU variant). Possibly for layout math in AOT builds via a
  `zn::ops` VFPU specialisation (*inference: measure first*).
- **Scratchpad (16 KiB)**: candidate for the VM's hottest register window or the dispatch table (*inference: measure*).
- **Damage**: the runtime's damage rectangles already limit raster work. With GPU replay, redraw everything and skip the
  CPU work instead.
- **ME**: audio mixing and decoding off the main CPU (MElib needs `mediaengine.prx` next to the EBOOT [S9]).

---

## 3. Sony PS Vita

### 3.1 Hardware

- **CPU.** Quad-core ARM Cortex-A9 MPCore [S10].
  - 333 MHz by default; 444 MHz is the officially supported maximum.
  - Plugins (PSVshell, LOLIcon) reach 494–500 MHz. The GPU steps go up to 222 MHz [S11][S11b].
  - Apps get three cores: `SCE_KERNEL_CPU_MASK_USER_0..2` in the VitaSDK headers [S14].
  - NEON + VFPv3.
  - Clocks are set with `scePowerSetArmClockFrequency`, `scePowerSetGpuClockFrequency`, `scePowerSetBusClockFrequency`,
    `scePowerSetGpuXbarClockFrequency` [S13].
- **Memory.** 512 MiB RAM + 128 MiB VRAM [S10].
  - SDL's Vita notes break it down: 256 MiB for the app (+~109 MiB in extended mode), +26 MiB physically contiguous,
    +112 MiB CDRAM (VRAM), the rest reserved [S15].
  - VitaSDK's newlib allocates a **128 MiB heap by default**. Override it with `_newlib_heap_size_user` (local read of
    `sbrk.c`) [S15b].
- **GPU.** PowerVR SGX543MP4+ (ES2-class, TBDR).
  - Native API: **GXM**, close to D3D11 with lower-level parts (immediate and deferred contexts, "precomputed" state) [S16b].
  - Shaders are GXP binaries. Sony's offline compiler is not redistributable.
  - At run time, `libshacccg.suprx` (from the PSM runtime, extracted on the user's console with ShaRKBR33D/ShaRKF00D) compiles
    Cg/GLSL. vitaGL needs it [S17v].
  - **PVR_PSP2** ports Imagination's GLES1.1/GLES2 drivers + EGL to the Vita: unit tests pass, latest release v3.9, 2023.
    SDL enables it with `-DVIDEO_VITA_PVR=ON` [S17p][S17s].
  - Whether PVR_PSP2's GLSL compiler needs `libshacccg` is not stated (*verify, task VITA-03*).
  - SDL's `vitagxm` renderer and vita2d ship **precompiled GXP shaders**, enough for 2D blits.
- **Display**: 5" 960×544, OLED (PCH-1000) or LCD (PCH-2000) [S10].
- **Input**: two analog sticks, D-pad, four face buttons, L/R, Start, Select, PS. Front capacitive multitouch and a rear touch
  pad. Three-axis gyro and accelerometer (plus compass). Front and back 0.3 MP cameras (640×480 at 60 fps) [S10].
- **Connectivity**: Wi-Fi 802.11b/g/n, Bluetooth 2.1+EDR (no BLE), optional 3G (PCH-1100). Micro-USB on the 2000 [S10].
- **Audio**: `sceAudioOut` ports (48 kHz), `SceNgs` mixer.

### 3.2 SDK and toolchain

- **VitaSDK.** Licences are mixed: vita-headers MIT, newlib, GCC.
  - buildscripts pin GCC 15.2.0, binutils 2.46.1 and a newlib commit [S12].
  - Snapshot releases (`sdk-snapshot-20260926.790.1`) ship `vitasdk-arm64-apple-darwin-*.tar.bz2`, x86_64 macOS, Linux
    (glibc, musl), FreeBSD and Windows, with `SHA256SUMS` (local).
  - A `vita_softfp` snapshot line also exists (an ABI variant; stay on the default).
  - Docker `vitasdk/vitasdk` has amd64 and arm64 (local).
  - Packages (SDL2/3, vitaGL, vita2d, curl...) come through `vdpm`.
- **CMake**: `$VITASDK/share/vita.cmake` with `vita_create_self` / `vita_create_vpk`. A VPK is a zip: `eboot.bin` (SELF),
  `sce_sys/param.sfo`, LiveArea assets.
- **C++20**: GCC 15, libstdc++, TLS supported (*verify `thread_local` with a T2 probe*).
- **Integration**: pin the snapshot tarball in `src/tc`, exactly like zig. The VPK for the core path can be produced without
  the SDK: the core `eboot.bin` + `param.sfo` come prebuilt, and Zinc adds `program.zbc` and assets with its own zip writer.
- **Dev loop on hardware**: HENkaku/Ensō.
  - vitacompanion: FTP on 1337, a command port on 1338 (`launch <TITLEID>`, `destroy`, `reboot`).
  - Logs through PrincessLog or debugnet (UDP 18194) [S19].

### 3.3 Emulators and CI

- **Vita3K** (GPLv2; Windows, Linux, macOS, Android) [S16].
  - CLI (local read of `config.cpp`): positional `content-path` (.vpk/.zip/folder to install and run),
    `--installed-path/-r <TITLEID>`, `--console/-z` (no SDL init), `--firmware <pup>`, `--backend-renderer/-B`,
    `--log-level`, `--recompile-shader`.
  - Needs the user's firmware PUP (and font package) installed once, and a GPU with OpenGL 4.4 or Vulkan [S16c].
  - Output: `sceClibPrintf`/stdout appears in the Vita3K log.
  - CI recipe:
    - Linux runner with Xvfb + Mesa llvmpipe/lavapipe (*verify that the emulator draws under lavapipe*).
    - `Vita3K -B Vulkan app.vpk` with `timeout`, then parse the log between markers.
    - For pixels, follow the companion report: the app writes its own frame (the CPU oracle) to `ux0:data` and exits.
  - vitaGL apps need special build flags for Vita3K [S17v]. PVR_PSP2 support in Vita3K is unconfirmed
    (*verify: it talks to the SGX driver layer, not GXM*). For CI, prefer paths built on GXM: SDL3 vitagxm, vita2d, or our own
    GXM backend.
- **No libretro core** exists for Vita.

### 3.4 How Zinc maps

| Zinc piece | Vita implementation |
|---|---|
| Init | `scePowerSetArmClockFrequency(444)`, GPU 222. A CDRAM memblock for 2–3 framebuffers (960×544×4, 256 KiB aligned). `sceDisplaySetFrameBuf` + `sceDisplayWaitVblankStart` |
| `hal_present` (stage 1) | raster bands on 3 threads (one per user core) into a CDRAM or write-combined buffer, then display it directly (software path, no GXM), or upload to a GXM texture drawn with SDL/vita2d precompiled GXPs |
| `hal_present` (stage 2) | display-gl's GLES2 renderer (§6.1) on the chosen GL path |
| Input | `sceCtrlPeekBufferPositive` (sticks: left → pointer or scroll, right → scroll). `sceTouchPeek` front → `HalTouch[]`, scaled from the 1920×1088 panel grid to 960×544 (*verify the grid*). Back touch → wheel or pinch |
| Text | `sceImeDialogInit` from `hal_text_input` |
| Clock | `sceKernelGetProcessTimeWide()` |
| System host | console host (§6.2): `ux0:data/<id>/` writable, `app0:` read-only |
| Networking | `sceNetInit` / `sceNetCtlInit`, BSD sockets through newlib, `sceNetEpoll*` for a loop. mbedTLS from the tree |
| Audio | miniaudio custom backend over `sceAudioOutOpenPort(SCE_AUDIO_OUT_PORT_TYPE_BGM, ..., 48000, stereo)` |
| Memory | TLSF heap 192 MiB (`_newlib_heap_size_user` set to ~224 MiB); CDRAM for framebuffers, textures and atlases |
| AOT | `arm-vita-eabi-g++ -O2 -mcpu=cortex-a9 -mfpu=neon -ffp-contract=off`, `vita-elf-create` → `vita-make-fself` → VPK |
| 3D / WebGL | `render3d.vita.cpp` on GLES2. `libzn_webgl` linked statically with `Api::Gles2` (WebGL1). three.js ≤ r162 under `zinc:script` (QuickJS fits easily in 256 MiB) |

### 3.5 Where the milliseconds are

- **444/222 MHz.**
- Band rasterization on 3 cores. `backend_sw.cpp` already has band threads; replace "a thread per band per frame" with
  persistent workers pinned by affinity mask.
- **NEON**: build `raster.cpp` with `-O3 -mfpu=neon` (auto-vectorized span fills and blends).
- **CDRAM**:
  - The CPU must never read it back. It is uncached or write-combined *(inference from GXM practice)*.
  - Keep atlases in CDRAM. Keep CPU-side staging in LPDDR.
- **GXM**:
  - Swizzled textures (`SCE_GXM_TEXTURE_SWIZZLED`).
  - One ring vertex buffer per frame.
  - Indexed quads.
  - Avoid mid-frame scene splits (TBDR: one `sceGxmBeginScene` per frame).
  - Use the display queue with 2–3 buffers.
- **Native resolution**: render at 960×544. The UI can use density 1.5–2 (see ZN-385 pixel scale).
- **Memory**: plenty. Bake fonts at 2× and keep everything resident.

---

## 4. Nintendo 3DS (Old and New)

### 4.1 Hardware

- **CPU.** ARM11 MPCore with VFPv2 (single and double precision in hardware, no NEON; ARMv6 SIMD instructions such as
  `UQADD8`/`SMLAD`) [S20][S21].
  - Old 3DS: 2 cores at 268 MHz. Core 0 is the app core; core 1 is the system core, limited to a time slice that
    `APT_SetAppCpuTimeLimit` sets between 5 and 89 %. More than 30 % does not help on Old 3DS [S26].
  - New 3DS: 4 cores at up to 804 MHz with an optional 2 MiB L2.
    - libctru's `osSetSpeedupEnable(true)` turns on 804 MHz + L2 [S26b].
    - A third core is available to apps on New 3DS *(libctru: `APT_SetAppCpuTimeLimit` / core 2 via `threadCreate` affinity;
      verify)*.
  - ARM9 at 134 MHz (system only). CEVA TeakLite DSP at 134 MHz.
- **Memory.**
  - 128 MiB FCRAM (Old; 32 MiB for the OS) / 256 MiB (New; 64 MiB OS). 6 MiB VRAM on the SoC [S20][S21].
  - Application region: 64 MiB on Old (Prod mode), 124 MiB on New (Prod), larger dev modes [S22].
  - libctru splits the free app memory **half linear heap (GPU-visible), half app heap** by default. Override it with
    `__ctru_heap_size` / `__ctru_linear_heap_size` (local read of `allocateHeaps.c`).
- **GPU.** PICA200 at 268 MHz.
  - Programmable vertex processors: three, plus a primitive engine usable as a geometry shader or a fourth vertex unit.
  - **Fixed-function fragment stage**: six colour combiner stages (TEV), fragment lighting through lookup tables (Blinn-Phong,
    Cook-Torrance...), fog, shadows.
  - Three texture units + one procedural texture unit [S27][S27b].
  - Textures and render targets are tiled (8×8 Morton tiles *verify on 3dbrew*). Power-of-two sizes. Formats include
    RGBA8, RGB565, RGBA4, LA/L/A 4–8 bit and ETC1.
  - `GX_DisplayTransfer` converts tiled to linear (with optional 2× downscale for anti-aliasing) and writes the LCD
    framebuffers.
  - The LCDs are natively portrait, so framebuffers are 240×400 / 240×320, rotated.
- **Screens**:
  - Top: 3.53" (3.88" New XL) autostereoscopic, 800×240 (400×240 per eye). The 800-wide mode uses both halves without stereo.
  - Bottom: 3.0" 320×240 resistive single touch [S21].
- **Input**: Circle Pad, D-pad, A/B/X/Y, L/R, Start, Select. New 3DS adds the C-stick and ZL/ZR. Accelerometer + gyroscope,
  microphone, three 0.3 MP cameras (two outer for stereo) [S21].
- **Connectivity**: Wi-Fi 802.11b/g 2.4 GHz (WPA2 supported), local wireless (UDS), IR. NFC on New 3DS. **No Bluetooth** [S21].
- **Audio**: NDSP on the DSP, through libctru. It needs `sdmc:/3ds/dspfirm.cdc`, Nintendo's signed DSP firmware, which the
  user dumps from their own console (Rosalina: Miscellaneous options > Dump DSP firmware). Without it, audio is silent.
  On emulators an empty file works [S28].

### 4.2 SDK and toolchain

- **devkitPro / devkitARM.** libctru, citro3d and citro2d are zlib-licensed; GCC is GPL.
  - buildscripts master pins GCC 16.1.0, binutils 2.46.0, newlib 4.6.0.20260123 [S23].
  - Tools: `picasso` (PICA shader assembler), `tex3ds`, `3dsxtool` (`--romfs`), `smdhtool`. `makerom`/`bannertool` for CIA.
  - Install with dkp-pacman on macOS (pkg installer, last release v6.0.2) or with the official docker image
    `devkitpro/devkitarm` (tags `20260610`, `latest`, amd64 and **arm64**, local).
  - devkitPro asks users **not to run pacman in CI** and to use the docker images instead [S23b].
  - **Do not repackage their toolchain** into Zinc downloads *(their stance on redistribution is not documented in the sources
    found; ask before mirroring)*. Pin the docker image digest, or detect a user install (`$DEVKITPRO`).
- **C++20**: GCC 15/16 with libstdc++. Threads via libctru's pthread glue (*verify*). TLS works (libctru provides the thread
  pointer, *verify*).
- **Dev loop on hardware.**
  - Luma3DS (boot9strap) + Homebrew Launcher.
  - `3dslink app.3dsx` sends the file (press Y in the launcher; `-a <ip>` when broadcast fails; `-0` sets argv[0]).
  - Rosalina's GDB stub (`target remote <ip>:4003`-ish, the menu shows the port) [S29].

### 4.3 Emulators and CI

- **Azahar** (GPLv2+): the merger of Lime3DS and PabloMK7's Citra fork. Release 2126.2 on 2026-10-08 (local).
  - Assets: macOS arm64/x86_64/universal, Windows, Android, and **libretro cores** for Linux x86_64, macOS, iOS and tvOS.
  - The Qt frontend accepts `game_path`, `-g/--gdbport`, `-p/--movie-play`, `-r/--movie-record`, `-d/--dump-video`, `-i`
    (install CIA) (local read of `citra_qt.cpp`). The old SDL `citra` CLI is gone.
  - `svcOutputDebugString` is logged as `LOG_DEBUG(Debug_Emulated, ...)` (local read of `svc.cpp`). With the log filter
    `*:Info Debug.Emulated:Debug`, a program's debug output lands in the log.
  - The GDB stub also serves host I/O (HIO) requests.
  - The libretro core loads `.3dsx` [S24].
- **CI recipe A**: RetroArch + the Azahar libretro core.
  `retroarch -L azahar_libretro.so app.3dsx --max-frames=600 --max-frames-ss --max-frames-ss-path=shot.png` under Xvfb
  (RetroArch flags confirmed in source [S25]). The program's text goes to `svcOutputDebugString` and the core's log.
- **CI recipe B**: Azahar Qt under Xvfb with `-p input.ctm` for scripted input and a log filter, killed by `timeout`.
- **Limits**: use the software renderer for goldens. Vulkan readbacks were unreliable for Pocket3D (companion report §3.5).
  Timing proves nothing. **Panda3DS** is a younger emulator with Lua scripting, worth a later look.

### 4.4 How Zinc maps

| Zinc piece | 3DS implementation |
|---|---|
| Init / loop | `gfxInitDefault`, `aptMainLoop()` each frame (home menu, sleep, quit → `HalInput.quit`). `osSetSpeedupEnable(true)` when `APT_CheckNew3DS` |
| Surface | `zinc.json` `targets.n3ds.screen`: `top` (400×240, default for games), `bottom` (320×240, touch, default for UI), or `both` (a 400×480 virtual surface: top above, bottom centred under it, the 40-px side margins unused). zinc:ui sees one surface. A second-surface API stays out of scope |
| `hal_present` (stage 1) | software raster into a linear buffer, then `GX_DisplayTransfer` (or a rotated CPU copy) into the LCD framebuffer, then `gfxSwapBuffers` + `gspWaitForVBlank` |
| `hal_present` (stage 2) | fixed-function replay (§6.1) on citro3d. citro2d (4096 objects per frame by default [S27c]) is a candidate base |
| Input | `hidScanInput`/`hidKeysHeld` → buttons, `hidTouchRead` → pointer and one `HalTouch`, `hidCircleRead` (±156) → scroll or virtual cursor, C-stick on New. Gyro and accelerometer via `HIDUSER_Enable*` for a later `zinc:sensors` |
| Text | the `swkbd` applet from `hal_text_input` |
| Clock | `svcGetSystemTick()` / `osGetTime()` |
| System host | console host (§6.2): `sdmc:/3ds/<app>/` writable, `romfs:/` read-only (holds `program.zbc` in the core path) |
| Threads | one band thread on the system core (Old) or core 2 (New) |
| Networking | `socInit(memalign(0x1000, size), size)` + BSD sockets + `poll`. `httpc`/`sslc` exist but use mbedTLS for consistency |
| Audio | miniaudio custom backend over NDSP (needs `dspfirm.cdc`; say so at start when it is missing) |
| Memory | TLSF heap 16 MiB (Old) / 48 MiB (New). The linear heap holds GPU buffers. VRAM (6 MiB) holds render targets and atlases |
| AOT | `arm-none-eabi-g++ -march=armv6k -mtune=mpcore -mfloat-abi=hard -mtp=soft -O2 -ffp-contract=off` + 3dsx / CIA |
| 3D | `render3d.n3ds.cpp`: picasso vertex shader, fragment lighting LUTs or vertex lighting, stereo (`gfxSet3D(true)`, eye offset from `osGet3DSliderState()`) |
| WebGL | not possible (fixed fragment stage). three.js API subset only |

### 4.5 Where the milliseconds are

- **New 3DS speedup** (804 MHz + L2): about 3× CPU. Request it at start, and keep a profile for Old.
- The **Old 3DS is the floor** (268 MHz, no NEON). The software raster cannot fill 400×240 at 60 fps with many objects
  (*inference*), so GPU replay is mandatory there.
- **Geometry shader quad expansion**: send one vertex per rectangle (x, y, w, h, colour, uv) and let the PICA primitive engine
  emit the quad. This cuts CPU vertex writes 4× *(inference; picasso supports GS)*.
- **TEV**:
  - Vertex colour × texture in stage 0.
  - Gradients through vertex colours.
  - Rounded corners from a corner atlas.
  - Shadows as pre-blurred 9-slice textures.
- **Tiled textures at bake time**:
  - `src/res` writes Morton-tiled ETC1 for photos.
  - A4/LA4 for glyph atlases.
  - Avoid run-time tiling except for dynamic images (use `GX_DisplayTransfer` with tiled output).
- **Anti-aliasing** for 3D: render 800×240 in wide mode or 2× and downscale with `GX_DisplayTransfer` scaling.
- **ARMv6 SIMD** (`__uqadd8`, `__smlad`) in software blend loops on Old 3DS.
- **Stereo** costs twice the 3D draws. Make it opt-in and skip it when the slider is 0.

---

## 5. iPhone 4S on iOS 9.3.6

### 5.1 Hardware

- **SoC.** Apple A5 (45 nm): dual Cortex-A9 at 800 MHz (rated 1 GHz). 32 KiB L1 I and D, 1 MiB L2 [S30].
  - PowerVR SGX543MP2 [S30].
  - 512 MiB RAM [S30b].
- **GPU API.** OpenGL ES 1.1 and 2.0 only. No ES 3.0. Metal needs A7 [S31][S32].
  - ES2 limits (SGX 543): `MAX_TEXTURE_SIZE` 4096, 8 texture units, **0 vertex texture units**, 16 attributes,
    128 vertex / 64 fragment uniform vectors, 8 varyings [S31].
  - Extensions [S31]: `OES_vertex_array_object`, `EXT_discard_framebuffer`, `APPLE_framebuffer_multisample`,
    `OES_depth_texture`, `OES_texture_float`/`half_float`, `OES_standard_derivatives`, `EXT_shader_texture_lod`,
    `EXT_texture_filter_anisotropic`, `IMG_texture_compression_pvrtc`, `EXT_shader_framebuffer_fetch`,
    `OES_element_index_uint`, `EXT_texture_rg`, `EXT_shadow_samplers`, `EXT_occlusion_query_boolean`.
  - Apple's notes for this GPU (TBDR):
    - Draw opaque content and minimise blending and `discard`.
    - Modify buffers and textures only at frame start or end.
    - Use VBOs.
    - Use combined depth/stencil.
    - Keep renderbuffer sizes at multiples of 32 [S31].
- **Display**: 3.5" 960×640 IPS (326 ppi), 480×320 points at scale 2 [S30].
- **Input**: multitouch, accelerometer, gyroscope, compass, 8 MP rear and VGA front cameras, microphone.
- **Connectivity**: Wi-Fi 802.11b/g/n (2.4 GHz), **Bluetooth 4.0** (the first iPhone with BLE; CoreBluetooth central and
  peripheral), HSDPA, the 30-pin dock (USB to a Mac via libimobiledevice) [S30].
- **Memory budget**: Apple advises staying under 200 MB at all times on devices before the iPhone 6s [S35]. Jetsam's exact
  limits are undocumented.

### 5.2 SDK, toolchain, signing

- **Xcode 14 dropped armv7 and deployment targets below iOS 11** [S33]. libwebp removed its 32-bit iOS slices after they
  failed with Xcode 16.4 [S33b].
- **But the pieces still work on this Mac (local).**
  - Apple clang 21 (Xcode 26.3) emits `armv7-apple-ios9.0` objects, including C++20 and `thread_local`.
  - Xcode's `ld` still lists armv7 and delegates it to **ld-classic**.
- **What is missing is an SDK with armv7 `.tbd` stubs and a C++ runtime.**
  - SDK: the iPhoneOS SDK from **Xcode 13.4.1** (iOS 15.5, the last Xcode that targets armv7 / iOS 9). Apple-hosted download
    with the user's Apple ID, so the licence is clean.
  - Alternatively, the community `theos/sdks` repository has patched SDKs from `iPhoneOS9.3.sdk` to `16.5` [S34]. Their
    redistribution is a grey zone, so do not ship them; point to them.
  - The old route of `cctools-port` + libtapi on Linux also supports armv7 [S34b].
  - LLVM's own `ld64.lld` has **no 32-bit ARM Mach-O support** (`lld/MachO/Arch` holds ARM64, ARM64_32 and X86_64 only,
    local check of the LLVM tree). Use Apple's ld-classic or cctools' ld64.
- **C++ library.**
  - The SDK's libc++ headers are versioned with the SDK. With iOS 9 as the deployment target, Apple's availability markup
    hides dylib-backed features. Floating-point `std::to_chars` (used by `src/rt/machine.cpp`) needs a far newer iOS, and the
    `strict` attribute rules out a run-time check [S37].
  - **Build LLVM's libc++ and libc++abi as static libraries for `armv7-apple-ios9.0`** (one pinned LLVM release, built once
    by a script) and link them. Another option is a header-only shortest round-trip printer for that one call site.
  - UIKit and Foundation are Objective-C, so two C++ runtimes in one process are harmless as long as no C++ types cross the
    boundary.
- **SDL**: SDL3 deploys to iOS 11+ only. SDL2 deploys back to iOS 8 [S36]. Not needed: write a native UIKit HAL.
- **Signing and install** (iOS 9.3.6 on iPhone4,1).
  - (a) **Jailbreak** with Phœnix (semi-untethered, 32-bit iOS 9.3.5–9.3.6, re-run after reboot) + AppSync Unified.
    - Sign with `ldid -S`, install over SSH or with `ideviceinstaller` [S39].
    - No 7-day expiry. Best for a lab device.
  - (b) **Free Apple ID** development certificate + profile.
    - `codesign`, then `ideviceinstaller -i`. The profile expires every 7 days [S39].
    - Current Xcode cannot deploy to iOS 9 from the IDE, but `codesign` + libimobiledevice do.
- **Integration into Zinc.** `zinc toolchain install ios-legacy` checks for Xcode's clang and ld, asks for an SDK path (or
  finds `Xcode-13.4.1.app`), and builds the static libc++ once into `~/.zinc/toolchains/ios-legacy-libcxx-<llvm>/`.
  - The core path is a prebuilt, re-signable app binary. `zinc export --target ios-legacy` adds `program.zbc` to the
    bundle and signs it with `ldid` or `codesign`.

### 5.3 Emulators and CI

- **No emulator runs a 32-bit iOS 9 app with GLES2.**
  - The Xcode Simulator runs only modern x86_64/arm64 iOS runtimes. It is a different GL implementation, without the SGX
    TBDR and with a different extension set [S31].
  - touchHLE targets early iPhone OS games and covers too little UIKit (companion report §3.5).
- **CI plan.**
  - (1) The same HAL builds for the iOS Simulator (arm64, modern iOS) as a logic test (T2, skipped without Xcode).
  - (2) The GLES2 renderer is already checked on desktop and Pi 3 GLES2 (display-gl).
  - (3) A **device lab** on a self-hosted macOS runner:
    - `ideviceinstaller -i`, then launch (`idevicedebug run` with the 9.3 DeveloperDiskImage mounted by
      `ideviceimagemounter`, or `open` over SSH when jailbroken).
    - Read `idevicesyslog` between `zinc:start` / `zinc:exit`.
    - Take screenshots with `idevicescreenshot`, which needs the DeveloperDiskImage.

### 5.4 How Zinc maps

| Zinc piece | iOS 9 implementation |
|---|---|
| App shell | `targets/ios-legacy/hal_ios.mm`: `UIApplicationMain`, one `UIViewController` whose view's layer is a `CAEAGLLayer` (`contentsScale = 2`), `EAGLContext` ES2, `CADisplayLink` (`frameInterval = 1`; `preferredFramesPerSecond` is iOS 10+) calling the frame step. No storyboard |
| `hal_present` | stage 1: upload the software raster as a texture and draw one quad. Stage 2 (the target): `plugins/display-gl/src/gl_renderer.cpp` as is (GLSL ES 1.00), with an EAGL context file next to `kms.cpp`/`sdl.cpp` |
| Input | `touchesBegan/Moved/Ended` → `HalTouch[]` (multitouch) + pointer. A hidden `UIView<UIKeyInput>` (later `UITextInput` for marked text) for `hal_text_input` |
| Clock | `mach_absolute_time()` (not `mach_continuous_time`/`clock_gettime`, both iOS 10+) |
| Lifecycle | `applicationWillResignActive`: stop the display link and `glFinish()` (GL calls in the background get the app killed). Memory warnings drop the glyph and image caches |
| System host | console host (§6.2) with `NSHomeDirectory()/Documents` writable and the bundle read-only. libuv only when `zinc:net`/`process` are needed, then patch `uv__hrtime` to `mach_absolute_time` |
| Threads | 2 cores: one band thread for the software path. GCD or `std::thread` both work |
| Networking | BSD sockets + mbedTLS (App Transport Security applies only to `NSURLSession`/`CFNetwork`) |
| Audio | miniaudio (Core Audio backend) after ZN-390 |
| Memory | TLSF heap 96 MiB; aim for < 150 MiB resident |
| AOT | clang `-target armv7-apple-ios9.0 -mcpu=cortex-a9 -mfpu=neon -O2 -ffp-contract=off` + static libc++ |
| 3D / WebGL | `render3d.ios-legacy.cpp` on GLES2. `libzn_webgl` linked statically (no dlopen) with `Api::Gles2` = WebGL1. three.js ≤ r162 in `zinc:script` |

### 5.5 Where the milliseconds are

- **GPU replay, not CPU**: 614,400 pixels at scale 2 is the largest surface of the four. The software raster at scale 2 on
  two A9 cores will not hold 60 fps for busy frames *(inference)*. For bouncing-ball stage 1, render at scale 1 (480×320)
  and let the GPU upscale.
- **TBDR rules** [S31]:
  - One render pass per frame.
  - `glDiscardFramebufferEXT` for depth at frame end.
  - Glyph and image uploads before the first draw.
  - No `glReadPixels` except in tests.
- **Textures**:
  - `GL_ALPHA` or `EXT_texture_rg` R8 glyph atlas.
  - PVRTC 4bpp for opaque photos, baked by `src/res` *(new encoder; PVRTC tools are proprietary, so check the licence
    first)*.
  - Power-of-two atlases.
- **VAO** (`OES_vertex_array_object`) and one streaming VBO with orphaning.
- **NEON** for software paths. `-mcpu=cortex-a9`.

---

## 6. Shared building blocks

### 6.1 Fixed-function replay of `HalCmdList` (PSP, 3DS)

One C++ module, `src/host` or `runtime/` side *(placement is the maintainer's call)*. It turns a frame's commands into a
small backend interface:

- upload or update a texture (with format and swizzle flags);
- set the scissor;
- draw a batch of quads (`x, y, w, h, u0, v0, u1, v1, c1, c2, gradient direction`);
- draw a cached tile;
- present.

| Command | Fixed-function mapping |
|---|---|
| CLEAR | hardware clear (`sceGuClear`, `C3D_RenderTargetClear`) |
| RECT, radius 0 | untextured sprite with vertex colours (vertical and horizontal gradients through 4 corner colours) |
| RECT, radius > 0 | 9-slice: centre and edges as sprites, corners from a **corner atlas** of quarter discs at radius levels (display-gl already keeps a 32-px corner table with 16 levels) |
| BORDER | 9-slice from the corner atlas ring version |
| TEXT | glyph quads from the A4/A8 glyph atlas (same baked fonts as the CPU raster, packed into one atlas per font size) |
| IMAGE | textured sprite (image uploaded once per `image_version`) |
| LINE, POLY, SHADOW, radial gradient | CPU-rasterized into a **cached tile** keyed by the command's `CmdSig` hash (`zrt_raster.h`), drawn as a textured sprite. Recomputed only when the hash changes |
| CLIP / UNCLIP | scissor (rectangular). Rounded clips fall back to the tile path |

- A CPU reference backend runs the same interface on the desktop, so the module is tested in T1 against
  `runtime/raster.cpp` pixels with the display-gl tolerance.
- PSP and 3DS each need only a ~300-line backend.

### 6.2 Console system host (PSP, Vita, 3DS, iOS)

- `HostSys`/`HostLoop` rows (args, env, platform, real clock, wait, epoch, files through stdio, storage as a JSON file)
  without libuv.
- It is `next/targets/wasm/host_wasi.cpp` with a real clock and real files. Unknown rows are reported once.
- One file per platform supplies the clock, sleep and app directory (about 20 lines each).

### 6.3 Core images and packaging

| Target | Core binary | Where the program goes | `zinc export` without SDK |
|---|---|---|---|
| psp | `EBOOT.PBP` (PRX in DATA.PSP) | `ms0:/PSP/GAME/<app>/program.zbc` next to the EBOOT (or DATA.PSAR) | copy the folder, write PARAM.SFO (title) with a small SFO writer |
| vita | `eboot.bin` (SELF) | `app0:/program.zbc` inside the VPK | zip writer: core files + program + `sce_sys/param.sfo` (title id) |
| n3ds | `.3dsx` | appended RomFS (`romfs:/program.zbc`) | append a RomFS image (format is documented) and the SMDH |
| ios-legacy | Mach-O armv7 in `.app` | `<bundle>/program.zbc` | copy the bundle, write Info.plist, sign with `ldid`/`codesign` |

- The dev loop reuses the ESP32 device protocol (`include/zn/devproto.h`, `src/dev/core.cpp`) over TCP:
  `zinc run --target vita --device 192.168.1.20` uploads bytecode into the running core.
  - This avoids repackaging and is faster than FTP + relaunch.
  - Wi-Fi is available on all four.

### 6.4 Profiles (`next/src/frontend/profile.cpp`, `targets/capabilities.json`)

| id | number | logical size | typing | heap | notes |
|---|---|---|---|---|---|
| `psp` | f32 | 480×272 | gradual | 16 MiB | `noFpu` false; PSP-1000 projects set 8 MiB |
| `vita` | f64 | 960×544 | gradual | 192 MiB | density 1 (or 2 with a 480×272 logical surface) |
| `n3ds` | f64 | 400×240 (top) / 320×240 (bottom) | gradual | 16 MiB | New 3DS: 48 MiB via zinc.json |
| `ios-legacy` | f64 | 480×320 at scale 2 | gradual | 96 MiB | `rn: true` (Yoga fits) |

Capabilities: `gamepad` true on the three consoles. `touch` true on vita, n3ds (bottom) and ios-legacy. `pointer` is
"optional" (virtual cursor). `gpu` is `"ge"`, `"gxm"`, `"pica"`, `"gles2"`. `net` true. `audio` true after ZN-390. `fs`
true. `threads` true except PSP (one core).

### 6.5 Estimated per-frame budget for bouncing-ball (inference, to be replaced by measurements)

At 60 fps there are 16.7 ms per frame.

- **Interpreter cost per ball update.** No handheld numbers exist yet. The M4 benchmarks put the interpreter at about 3× and
  AOT at about 1.5× native on desktop (companion report §3.1).
- **Expected order of CPU speed for this workload** *(inference)*: PSP 333 < Old 3DS 268 (VFP but ARM11) ≈ PSP < New 3DS
  804 < iPhone 4S ≈ Vita 444 (A9). The A9s are about 2–3× an ARM11 per clock *(inference)*.
- **Acceptance criteria** in the tasks below record the measured maximum ball count at 60 fps and gate later changes at 90 %
  of it, rather than inventing targets now.

---

## 7. Risks and owner inputs

- **Hardware and firmware the owner must state**:
  - PSP model (1000 versus 2000+) and custom firmware.
  - Vita firmware and HENkaku/Ensō.
  - Old or New 3DS with Luma3DS.
  - iPhone 4S jailbroken or not.
  - A Vita firmware PUP for Vita3K.
  - A DSP dump for 3DS audio.
- **Vita GPU path**: PVR_PSP2 (open, GLES2, unclear runtime needs and no Vita3K support) versus vitaGL (needs `libshacccg`
  on the console, special Vita3K build) versus own GXM with precompiled GXP (no open shader compiler). Task VITA-03 decides
  this.
- **iOS SDK licence**: use the Xcode 13.4.1 SDK the owner downloads. Do not redistribute SDKs.
- **devkitPro packaging stance**: pin the official docker image or a local install. Do not mirror their packages without
  asking.
- **Emulator gaps**: Vita3K and Azahar have no first-class headless mode, so CI uses Xvfb. PPSSPP is the only clean headless
  gate. iOS has none.
- **three.js versions**: real three.js on these GPUs stops at r162 (WebGL1). r186 (the version `examples/webgl-cube` uses)
  needs WebGL2.
- **PSP Wi-Fi**: 802.11b and no WPA2 on stock firmware. The dev loop needs an open, WEP or WPA network, or ARK-4's WPA2-AES
  option, or USB (PSPLINK).

---

## 8. Ordered backlog

Order: shared foundations, then hello on each device, then bouncing-ball, then the UI demo, then 3D, then AOT, dev loop, audio
and CI. Keys are tasks-import keys (`next/tools/tasks-import`). The full JSON with descriptions and acceptance criteria is
Appendix A.

| # | key | title | deps |
|---|---|---|---|
| 1 | hh-decision | Handheld targets: decision record, target ids, profiles and capabilities | — |
| 2 | hh-console-host | Console system host without libuv | hh-decision |
| 3 | hh-core-main | Portable core entry: load program.zbc from the package and run frames through the HAL | hh-console-host |
| 4 | hh-tc-pins | Toolchain pins for pspdev, VitaSDK, devkitARM and the iOS armv7 setup | hh-decision |
| 5 | hh-emu-runners | Emulator runners: PPSSPPHeadless, Vita3K, Azahar / RetroArch | hh-tc-pins |
| 6 | psp-hello | PSP: hello in PPSSPPHeadless | hh-core-main, hh-tc-pins, hh-emu-runners |
| 7 | vita-hello | Vita: hello in Vita3K | hh-core-main, hh-tc-pins, hh-emu-runners |
| 8 | n3ds-hello | 3DS: hello in Azahar | hh-core-main, hh-tc-pins, hh-emu-runners |
| 9 | ios-toolchain | iOS 9 armv7 toolchain spike: Xcode clang + ld-classic + armv7 SDK + static libc++ | hh-decision |
| 10 | ios-hello | iOS 9: UIKit/EAGL HAL and hello on the iPhone 4S | ios-toolchain, hh-core-main |
| 11 | psp-ball | PSP: bouncing-ball with the software raster and a GE copy | psp-hello |
| 12 | vita-ball | Vita: bouncing-ball with 3-core band raster | vita-hello |
| 13 | n3ds-ball | 3DS: bouncing-ball on the top screen | n3ds-hello |
| 14 | ios-ball | iOS 9: bouncing-ball through the display-gl GLES2 renderer | ios-hello |
| 15 | hh-ff-replay | Fixed-function GPU replay of zinc:gfx frames (sprites, atlases, cached CPU tiles) | hh-decision |
| 16 | psp-ge-replay | PSP: GE backend for the fixed-function replay | psp-ball, hh-ff-replay |
| 17 | n3ds-pica-replay | 3DS: PICA200 backend for the fixed-function replay | n3ds-ball, hh-ff-replay |
| 18 | vita-gpu-spike | Vita: choose the GPU path (PVR_PSP2, vitaGL, GXM + precompiled GXP) | vita-ball |
| 19 | vita-gpu-replay | Vita: GPU 2D replay with the display-gl renderer | vita-gpu-spike |
| 20 | psp-ui | PSP: input mapping, OSK and the UI demo | psp-ge-replay |
| 21 | vita-ui | Vita: touch, IME and the UI demo | vita-gpu-replay |
| 22 | n3ds-ui | 3DS: screens, touch, swkbd and the UI demo | n3ds-pica-replay |
| 23 | ios-ui | iOS 9: keyboard, multitouch, lifecycle and the UI demo | ios-ball |
| 24 | psp-3d | PSP: zinc:3d on the GE with VFPU transforms | psp-ge-replay |
| 25 | vita-3d | Vita: zinc:3d on GLES2 and WebGL1 | vita-gpu-replay |
| 26 | n3ds-3d | 3DS: zinc:3d on citro3d with stereoscopic 3D | n3ds-pica-replay |
| 27 | ios-3d | iOS 9: zinc:3d on GLES2 and WebGL1 | ios-ball |
| 28 | hh-aot | AOT builds for psp, vita, n3ds and ios-legacy | psp-hello, vita-hello, n3ds-hello, ios-hello |
| 29 | hh-dev-tcp | Device protocol over TCP: upload bytecode to a running handheld core | psp-hello, vita-hello, n3ds-hello, ios-hello |
| 30 | hh-audio | zinc:audio backends for the handhelds | ZN-390, psp-hello, vita-hello, n3ds-hello, ios-hello |
| 31 | ios-device-lab | iOS 9 device lab: automated runs on a tethered iPhone 4S | ios-hello |
| 32 | hh-ci | CI job: handheld emulator matrix | psp-ball, vita-ball, n3ds-ball |

Critical path to the first visible result: hh-decision → hh-console-host → hh-core-main → hh-tc-pins → hh-emu-runners →
psp-hello. The PSP comes first because PPSSPPHeadless is the only clean headless gate.

---

## Appendix A: tasks as JSON (tasks-import format)

```json
{
  "milestone": "Handhelds: PSP, Vita, 3DS, iPhone 4S",
  "tasks": [
    {"key": "hh-decision", "title": "Handheld targets: decision record, target ids, profiles and capabilities", "size": "S", "labels": ["targets", "handhelds"], "description": "Record a decision in docs/reports/zinc-next-decisions.md: targets psp, vita, n3ds, ios-legacy live in Zinc Next only (compiler/ untouched); two delivery paths per target, a prebuilt interpreter core plus program.zbc (no SDK for users, like the ESP32 core) and an AOT path (SDK needed); number profiles (psp f32: the Allegrex FPU is single precision); no libuv on the consoles. Add the four rows to next/src/frontend/profile.cpp and targets/capabilities.json (report docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 6.4).", "ac": ["decision entry written with the two delivery paths and the number profiles", "profile rows psp (f32, 480x272, 16 MiB), vita (f64, 960x544, 192 MiB), n3ds (f64, 400x240, 16 MiB), ios-legacy (f64, 480x320 at scale 2, 96 MiB) exist and a T0 test looks them up", "zinc run --profile psp examples/bouncing-ball runs in the host window with f32 numbers", "capabilities.json rows validate against requires in the existing tests"], "deps": []},
    {"key": "hh-console-host", "title": "Console system host without libuv", "size": "M", "labels": ["host", "handhelds"], "description": "next/targets/console/host_console.cpp: the HostSys and HostLoop rows (args, env, platform, real clock, wait, epoch, files through stdio, storage as a JSON file) without libuv, in the style of targets/wasm/host_wasi.cpp but with a real clock and real files; unknown rows reported once. A per-platform hook supplies now_us, sleep_us and the writable app directory. Shared by psp, vita, n3ds and ios-legacy.", "ac": ["builds with clang on macOS with no libuv symbol linked (checked with nm)", "a T0 test runs the library golden and a timers program through this host and matches the interpreter output", "the list of supported rows is documented in the file header"], "deps": ["hh-decision"]},
    {"key": "hh-core-main", "title": "Portable core entry: load program.zbc from the package and run frames through the HAL", "size": "M", "labels": ["host", "handhelds"], "description": "next/targets/console/core_main.cpp: read program.zbc from a path or an embedded blob, zbc::decode and verify, install the console host and the graphics host, run through hal_run with zinc:start and zinc:exit markers on the HAL log (same contract as the ps1 runner), map the exit status. Compiled by every handheld target and, for tests, on macOS with the headless HAL.", "ac": ["on macOS with the headless HAL, examples/hello and examples/bouncing-ball (ZINC_FRAMES=60) run from a .zbc file with output identical to zinc run", "an invalid or truncated program.zbc reports a clear error and exits non-zero (T0)", "core code size for macOS arm64 reported in the task notes"], "deps": ["hh-console-host"]},
    {"key": "hh-tc-pins", "title": "Toolchain pins for pspdev, VitaSDK, devkitARM and the iOS armv7 setup", "size": "M", "labels": ["toolchain", "handhelds"], "description": "Extend src/tc: zinc toolchain install psp (pspdev v20261001 tarball per host, sha256 pinned), vita (VitaSDK sdk-snapshot tarball, sha256 from SHA256SUMS), n3ds (devkitARM through the official docker image devkitpro/devkitarm pinned by digest, or a local $DEVKITPRO; no pacman in CI per devkitPro), ios-legacy (detect Xcode clang and ld with ld-classic for armv7, ask for an iPhoneOS SDK with armv7 stubs, e.g. from Xcode 13.4.1). Users of the core path never need these.", "ac": ["zinc toolchain targets lists psp, vita, n3ds, ios-legacy with what each needs", "install verifies the checksum and refuses a tampered archive from a local mirror (T0, like tests/t0/tc.sh)", "psp-g++ --version and arm-vita-eabi-g++ --version report 15.2.0 after install; the n3ds check runs arm-none-eabi-gcc --version in the pinned image", "zinc doctor explains a missing iOS SDK with the Xcode 13.4.1 hint"], "deps": ["hh-decision"]},
    {"key": "hh-emu-runners", "title": "Emulator runners: PPSSPPHeadless, Vita3K, Azahar / RetroArch", "size": "M", "labels": ["testing", "handhelds"], "description": "Pin and fetch or build: PPSSPPHeadless from a pinned PPSSPP commit (--graphics=software, --timeout-wall, --screenshot-save, stdout forwarded), Vita3K release (needs the user's firmware PUP, installed once with --firmware; app via content path or --installed-path, log parsed), Azahar 2126.2 (Qt with a log filter that keeps Debug.Emulated, -p input movie, -g gdb stub) and RetroArch plus the Azahar libretro core (--max-frames, --max-frames-ss-path) as the headless alternative. zinc run --target <t> --emu wraps them and prints the text between zinc:start and zinc:exit.", "ac": ["each runner is fetched or built reproducibly with a pinned hash and cached under ~/.zinc", "a prebuilt sample binary per platform prints a line through each runner within 60 s; a hung program is killed by the timeout with a clear message", "runners exit 77 (skip) when a requirement is missing (Vita firmware, no display server) and say which", "docs/targets/handhelds.md lists the runners and their limits"], "deps": ["hh-tc-pins"]},
    {"key": "psp-hello", "title": "PSP: hello in PPSSPPHeadless", "size": "M", "labels": ["psp", "handhelds"], "description": "targets/psp/hal_psp.cpp: exit callback (HOME), scePowerSetClockFrequency(333,333,166), sceKernelGetSystemTimeWide clock, sceCtrl buttons, sceDisplay + sceGu init with 16-bit framebuffers, log to stdout. next/targets/psp: CMake with the pspdev toolchain building the core PRX into EBOOT.PBP with PARAM.SFO (MEMSIZE). zinc export --target psp writes the folder with program.zbc without the SDK; zinc run --target psp --emu uses PPSSPPHeadless.", "ac": ["examples/hello prints the same output as on macOS through zinc run --target psp --emu (f32 profile)", "tests/t2/psp_hello.sh passes with the emulator and exits 77 without it", "zinc export --target psp works on a machine without pspdev (prebuilt core)", "the EBOOT boots on a PSP-2000+ with custom firmware (manual check noted in the task)"], "deps": ["hh-core-main", "hh-tc-pins", "hh-emu-runners"]},
    {"key": "vita-hello", "title": "Vita: hello in Vita3K", "size": "M", "labels": ["vita", "handhelds"], "description": "targets/vita/hal_vita.cpp: scePowerSetArmClockFrequency(444) and GPU 222, CDRAM framebuffers through sceDisplaySetFrameBuf, sceCtrl, sceClibPrintf log, _newlib_heap_size_user. next/targets/vita: CMake with VitaSDK (vita_create_self, vita_create_vpk). zinc export --target vita writes the VPK with its own zip writer (prebuilt eboot.bin and param.sfo plus program.zbc).", "ac": ["examples/hello output appears in the Vita3K log through zinc run --target vita --emu", "tests/t2/vita_hello.sh passes with Vita3K and firmware installed, else exits 77", "zinc export --target vita works without VitaSDK", "the VPK installs and runs on a HENkaku/Enso Vita (manual check noted)"], "deps": ["hh-core-main", "hh-tc-pins", "hh-emu-runners"]},
    {"key": "n3ds-hello", "title": "3DS: hello in Azahar", "size": "M", "labels": ["3ds", "handhelds"], "description": "targets/n3ds/hal_n3ds.cpp: gfxInitDefault, aptMainLoop each frame (quit), osSetSpeedupEnable on New 3DS, hid buttons, svcOutputDebugString log, romfsInit. next/targets/n3ds: Makefile or CMake with devkitARM producing the core .3dsx; zinc export --target n3ds appends a RomFS holding program.zbc and writes the SMDH without the SDK.", "ac": ["examples/hello output appears in the Azahar log (Debug.Emulated) through zinc run --target n3ds --emu", "the same .3dsx runs under RetroArch with the Azahar core and the output is captured", "tests/t2/n3ds_hello.sh passes or exits 77 when the emulator is missing", "runs on hardware through 3dslink (manual check noted)"], "deps": ["hh-core-main", "hh-tc-pins", "hh-emu-runners"]},
    {"key": "ios-toolchain", "title": "iOS 9 armv7 toolchain spike: Xcode clang + ld-classic + armv7 SDK + static libc++", "size": "M", "labels": ["ios", "toolchain", "handhelds"], "description": "Build a C++20 hello .app for armv7-apple-ios9.0 on this Mac: Xcode 26 clang (verified to emit armv7-apple-ios9 objects and thread_local) and ld (ld-classic handles armv7), an iPhoneOS SDK that still has armv7 .tbd stubs (Xcode 13.4.1's, owner-downloaded), and LLVM libc++/libc++abi built static for armv7-apple-ios9.0 by tools/build-ios-legacy-libcxx at a pinned LLVM version (src/rt/machine.cpp uses floating std::to_chars, unavailable in iOS 9's libc++). Sign with ldid on a jailbroken phone (Phoenix + AppSync Unified) or codesign with a free Apple ID profile; install with ideviceinstaller.", "ac": ["the hello binary has LC_VERSION_MIN_IPHONEOS 9.0 and is armv7 (otool -l, lipo -info)", "it runs on the iPhone 4S (iOS 9.3.6) and its output shows in idevicesyslog", "a check lists undefined symbols of the binary and finds none missing from the SDK's armv7 stubs", "the signing route used and its expiry are documented"], "deps": ["hh-decision"]},
    {"key": "ios-hello", "title": "iOS 9: UIKit/EAGL HAL and hello on the iPhone 4S", "size": "M", "labels": ["ios", "handhelds"], "description": "targets/ios-legacy/hal_ios.mm: UIApplicationMain without storyboard, a view backed by CAEAGLLayer (contentsScale 2), EAGLContext ES2, CADisplayLink with frameInterval 1, touches to HalInput, mach_absolute_time clock, background stops GL. The core app bundle is prebuilt; zinc export --target ios-legacy adds program.zbc and signs.", "ac": ["examples/hello runs on the iPhone 4S with output in idevicesyslog between the zinc markers", "the same HAL builds for the iOS Simulator (arm64) as a logic test in T2, skipped without Xcode", "going to the home screen and back neither crashes nor issues GL calls in the background"], "deps": ["ios-toolchain", "hh-core-main"]},
    {"key": "psp-ball", "title": "PSP: bouncing-ball with the software raster and a GE copy", "size": "M", "labels": ["psp", "handhelds", "perf"], "description": "Render the damaged bands into a 5650 RAM buffer, sceKernelDcacheWritebackRange, sceGuCopyImage into the 512-stride back buffer, flip at vblank; f32 numbers; audit runtime raster and gfx hot paths for double math.", "ac": ["examples/bouncing-ball runs unchanged (only zinc.json targets.psp) in PPSSPPHeadless", "a --screenshot-save golden matches the host render with the psp profile within the agreed MSE", "the maximum ball count at 60 fps is recorded in docs/reports/handheld-perf.md (hardware if available, PPSSPP marked non-authoritative) and a 90 % gate is set"], "deps": ["psp-hello"]},
    {"key": "vita-ball", "title": "Vita: bouncing-ball with 3-core band raster", "size": "M", "labels": ["vita", "handhelds", "perf"], "description": "Persistent band workers pinned to SCE_KERNEL_CPU_MASK_USER_0..2, raster built with -O3 -mcpu=cortex-a9 -mfpu=neon, frames written to CDRAM framebuffers (no CPU readback), triple buffering at vblank.", "ac": ["examples/bouncing-ball runs unchanged in Vita3K", "frame time split (logic, raster, present) logged with ZINC_LOG", "maximum ball count at 60 fps recorded with a 90 % gate"], "deps": ["vita-hello"]},
    {"key": "n3ds-ball", "title": "3DS: bouncing-ball on the top screen", "size": "M", "labels": ["3ds", "handhelds", "perf"], "description": "Software raster into a linear buffer, GX_DisplayTransfer (or a rotated copy) into the top LCD framebuffer, vblank swap; Old and New 3DS clocks; ARMv6 SIMD in blend loops if the profile shows them.", "ac": ["examples/bouncing-ball runs unchanged in Azahar; a RetroArch --max-frames-ss screenshot matches the host render with the rotation handled", "maximum ball count at 60 fps recorded for Old and New 3DS settings (hardware when available) with a 90 % gate"], "deps": ["n3ds-hello"]},
    {"key": "ios-ball", "title": "iOS 9: bouncing-ball through the display-gl GLES2 renderer", "size": "M", "labels": ["ios", "handhelds", "gpu"], "description": "Stage 1 uploads the software raster at scale 1 as a texture; stage 2 compiles plugins/display-gl/src/gl_renderer.cpp unchanged against an EAGL context file (next to kms.cpp and sdl.cpp), EXT_discard_framebuffer at frame end, scale 2.", "ac": ["examples/bouncing-ball runs unchanged on the iPhone 4S at 60 fps and the maximum ball count is recorded with a 90 % gate", "a glReadPixels golden on the device matches the desktop display-gl render within its tolerance", "gl_renderer.cpp is shared, not forked"], "deps": ["ios-hello"]},
    {"key": "hh-ff-replay", "title": "Fixed-function GPU replay of zinc:gfx frames (sprites, atlases, cached CPU tiles)", "size": "L", "labels": ["gpu", "handhelds"], "description": "A shared module that turns HalCmdList (CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP) into quads for GPUs without fragment shaders: vertex-colour gradients, a glyph atlas (A4/A8), a corner atlas for radii and borders, scissor for rectangular clips, and CPU-rasterized tiles cached by CmdSig hash for POLY, SHADOW, radial gradients and rounded clips. Backend interface: upload texture, set scissor, draw quads, draw tile, present. A CPU reference backend runs it on the desktop for tests.", "ac": ["on the layout fixtures and the bouncing-ball and kit-gallery scene dumps, the CPU reference backend matches runtime/raster.cpp within the display-gl tolerance (T1)", "quads per frame, tiles per frame and tile cache hits are reported by zinc -v", "the backend interface has no platform header in it"], "deps": ["hh-decision"]},
    {"key": "psp-ge-replay", "title": "PSP: GE backend for the fixed-function replay", "size": "L", "labels": ["psp", "gpu", "handhelds"], "description": "hh-ff-replay backend on sceGu: GU_SPRITES with 16-bit vertices in GU_TRANSFORM_2D, swizzled T4/T8 glyph and corner atlases with a CLUT in VRAM, 5650 framebuffer with GE dithering, sceGuScissor, double-buffered lists from sceGuGetMemory with one cache writeback per frame, textures at most 512, wide textures drawn in strips.", "ac": ["kit-gallery and bouncing-ball PPSSPP screenshots match the CPU reference within the hh-ff-replay tolerance", "CPU time per frame for bouncing-ball with 500 balls is at least 3x lower than psp-ball (measured on hardware or marked as PPSSPP)", "no texture exceeds 512x512"], "deps": ["psp-ball", "hh-ff-replay"]},
    {"key": "n3ds-pica-replay", "title": "3DS: PICA200 backend for the fixed-function replay", "size": "L", "labels": ["3ds", "gpu", "handhelds"], "description": "hh-ff-replay backend on citro3d: one picasso vertex shader for 2D quads (optionally a geometry shader expanding one vertex per rectangle), TEV stage 0 vertex colour times texture, tiled textures from tex3ds or GX_DisplayTransfer, A4/LA4 glyph atlas, scissor; compare with citro2d before writing more.", "ac": ["kit-gallery and bouncing-ball screenshots (RetroArch core, software renderer) match the CPU reference within tolerance", "bouncing-ball maximum ball count at 60 fps is at least 3x the n3ds-ball figure for the same 3DS model", "the choice between citro2d and own batches is recorded with numbers"], "deps": ["n3ds-ball", "hh-ff-replay"]},
    {"key": "vita-gpu-spike", "title": "Vita: choose the GPU path (PVR_PSP2, vitaGL, GXM + precompiled GXP)", "size": "M", "labels": ["vita", "gpu", "spike", "handhelds"], "description": "Build display-gl's gl_renderer (GLSL ES 1.00) on PVR_PSP2 (GLES2 + EGL) and on vitaGL; list the run-time requirements (modules shipped with the app, libshacccg for vitaGL), Vita3K support, fill rate at 960x544, and licences; compare with a GXM backend using precompiled GXP shaders (SDL vitagxm / vita2d style).", "ac": ["decision record with measurements on hardware (or Vita3K, marked) and the user-side requirements of each path", "the chosen path renders examples/ui/gl-check", "redistribution of any module shipped with the core is checked and documented"], "deps": ["vita-ball"]},
    {"key": "vita-gpu-replay", "title": "Vita: GPU 2D replay with the display-gl renderer", "size": "M", "labels": ["vita", "gpu", "handhelds"], "description": "Run plugins/display-gl/src/gl_renderer.cpp on the path chosen by vita-gpu-spike, with a Vita context file; atlases and images in CDRAM; one scene per frame.", "ac": ["kit-gallery and bouncing-ball match the CPU render within the display-gl tolerance", "bouncing-ball maximum ball count at 60 fps is at least 2x vita-ball", "gl_renderer.cpp stays shared"], "deps": ["vita-gpu-spike"]},
    {"key": "psp-ui", "title": "PSP: input mapping, OSK and the UI demo", "size": "M", "labels": ["psp", "ui", "handhelds"], "description": "D-pad and Cross focus navigation, a virtual cursor on the analog nub (Select toggles), confirm button from the system setting, sceUtilityOsk for hal_text_input, a compact theme for 480x272.", "ac": ["examples/ui/kit-gallery runs unchanged (only zinc.json targets.psp) in PPSSPP with scripted input reaching three screens", "OSK text reaches a text field (PPSSPP or hardware)", "idle screens stay at 60 fps with damage tracking"], "deps": ["psp-ge-replay"]},
    {"key": "vita-ui", "title": "Vita: touch, IME and the UI demo", "size": "M", "labels": ["vita", "ui", "handhelds"], "description": "Front touch to HalTouch (multitouch, panel grid scaled to 960x544), back touch as scroll and pinch, sticks as scroll and cursor, sceImeDialog for hal_text_input, confirm button swap; density option.", "ac": ["examples/hero runs unchanged at 960x544 in Vita3K with scripted touch reaching three screens", "IME text reaches a field (hardware if Vita3K lacks the IME)", "60 fps on idle screens"], "deps": ["vita-gpu-replay"]},
    {"key": "n3ds-ui", "title": "3DS: screens, touch, swkbd and the UI demo", "size": "M", "labels": ["3ds", "ui", "handhelds"], "description": "zinc.json targets.n3ds.screen = top | bottom | both (400x480 virtual surface, bottom centred), bottom-screen touch as pointer, Circle Pad as scroll and cursor, swkbd for hal_text_input.", "ac": ["examples/ui/kit-gallery runs unchanged with screen=bottom and screen=both in Azahar with a recorded input movie reaching three screens", "swkbd text reaches a field (hardware, noted)", "60 fps on idle screens on New 3DS settings"], "deps": ["n3ds-pica-replay"]},
    {"key": "ios-ui", "title": "iOS 9: keyboard, multitouch, lifecycle and the UI demo", "size": "M", "labels": ["ios", "ui", "handhelds"], "description": "Hidden UIKeyInput view (then UITextInput for marked text) for hal_text_input, multitouch HalTouch, memory warnings drop glyph and image caches, density 2 resources.", "ac": ["examples/hero runs unchanged on the iPhone 4S", "editing a text field with the system keyboard works", "peak resident memory of hero stays under 150 MB (logged from task_info)"], "deps": ["ios-ball"]},
    {"key": "psp-3d", "title": "PSP: zinc:3d on the GE with VFPU transforms", "size": "L", "labels": ["psp", "3d", "handhelds"], "description": "plugins/3d/native/render3d.psp.cpp: GE hardware transform and lighting (4 lights), sceGum matrices on the VFPU, 16-bit vertex formats, swizzled textures, software culling for the planes the GE does not clip (it clips only the near plane); plugins/three runs on it.", "ac": ["examples/3d/cubes and examples/three/cubes render in PPSSPP and match the host zinc:3d render structurally (golden with tolerance)", "frame rate at 480x272 recorded (hardware or marked PPSSPP)"], "deps": ["psp-ge-replay"]},
    {"key": "vita-3d", "title": "Vita: zinc:3d on GLES2 and WebGL1", "size": "L", "labels": ["vita", "3d", "webgl", "handhelds"], "description": "render3d.vita.cpp on GLES2; libzn_webgl linked statically with Api::Gles2 on the Vita context for zinc:script (WebGL1); document that real three.js needs r162 or older (r163 removed WebGL1).", "ac": ["examples/3d/cubes and examples/three/cubes run at 60 fps", "the WebGL1 conformance run reports its pass count next to the Pi 3 GLES2 figure", "a three.js r162 sample renders through zinc:script"], "deps": ["vita-gpu-replay"]},
    {"key": "n3ds-3d", "title": "3DS: zinc:3d on citro3d with stereoscopic 3D", "size": "L", "labels": ["3ds", "3d", "handhelds"], "description": "render3d.n3ds.cpp: picasso vertex shader, fragment lighting LUTs or vertex lighting, tiled textures, stereo with gfxSet3D and an eye offset from osGet3DSliderState (skipped when the slider is 0); plugins/three runs on it.", "ac": ["examples/3d/cubes and examples/three/cubes render in Azahar", "a stereo pair is produced when the slider is above 0", "frame rate recorded for Old and New 3DS settings"], "deps": ["n3ds-pica-replay"]},
    {"key": "ios-3d", "title": "iOS 9: zinc:3d on GLES2 and WebGL1", "size": "L", "labels": ["ios", "3d", "webgl", "handhelds"], "description": "render3d.ios-legacy.cpp on GLES2; libzn_webgl linked statically (no dlopen) with Api::Gles2 on EAGL for zinc:script; three.js r162 or older.", "ac": ["examples/3d/cubes and examples/three/cubes run at 60 fps on the iPhone 4S", "WebGL1 conformance pass count recorded on the device", "a three.js r162 sample renders through zinc:script"], "deps": ["ios-ball"]},
    {"key": "hh-aot", "title": "AOT builds for psp, vita, n3ds and ios-legacy", "size": "L", "labels": ["aot", "handhelds"], "description": "zinc build --aot --target <t>: AOT C++ compiled with the pinned toolchain (-O2 -ffp-contract=off -fno-exceptions -fno-rtti; -march=allegrex -G0 on PSP, -mcpu=cortex-a9 -mfpu=neon on Vita and iOS, -march=armv6k -mtune=mpcore on 3DS) and linked with src/rt and the hosts into the platform package. ZN-145 (4-byte references) stays a later memory optimisation.", "ac": ["fib, the library golden and examples/bouncing-ball give interpreter-identical output in each emulator (iOS on the device)", "bouncing-ball AOT maximum ball count at 60 fps is at least the interpreter figure on each target", "binary sizes reported per target"], "deps": ["psp-hello", "vita-hello", "n3ds-hello", "ios-hello"]},
    {"key": "hh-dev-tcp", "title": "Device protocol over TCP: upload bytecode to a running handheld core", "size": "M", "labels": ["dev", "handhelds"], "description": "Run zn::dev::Core (include/zn/devproto.h) over a TCP socket in the handheld cores so zinc run --target <t> --device <ip> uploads a .zbc into the running core and streams its output, as zinc run --target esp32 does over serial.", "ac": ["T0 test of the protocol over TCP against zinc device-sim", "an upload and run works on at least one physical handheld (noted) and in one emulator with networking", "a refused or corrupt upload leaves the core usable"], "deps": ["psp-hello", "vita-hello", "n3ds-hello", "ios-hello"]},
    {"key": "hh-audio", "title": "zinc:audio backends for the handhelds", "size": "M", "labels": ["audio", "handhelds"], "description": "miniaudio custom backends: PSP sceAudio (44.1 kHz, a dedicated thread), Vita sceAudioOut (48 kHz), 3DS NDSP (needs the user's sdmc:/3ds/dspfirm.cdc; print a clear notice when it is missing), iOS through miniaudio's Core Audio backend.", "ac": ["templates/game-2d plays its coin sound on each target (emulator or device, noted)", "missing DSP firmware on 3DS gives a single clear message and silent playback, no crash"], "deps": ["ZN-390", "psp-hello", "vita-hello", "n3ds-hello", "ios-hello"]},
    {"key": "ios-device-lab", "title": "iOS 9 device lab: automated runs on a tethered iPhone 4S", "size": "M", "labels": ["ios", "testing", "handhelds"], "description": "tools/ios-device-run: ideviceinstaller install, launch (idevicedebug with the 9.3 DeveloperDiskImage mounted, or open over SSH when jailbroken), idevicesyslog capture between zinc:start and zinc:exit, idevicescreenshot.", "ac": ["zinc run --target ios-legacy --device prints the program output and its exit status", "a T2 test is skipped (77) without a device", "documented in docs/targets/handhelds.md"], "deps": ["ios-hello"]},
    {"key": "hh-ci", "title": "CI job: handheld emulator matrix", "size": "M", "labels": ["ci", "handhelds"], "description": "A GitHub Actions job (Linux, Xvfb) that builds the cores with the pinned toolchains and runs hello and bouncing-ball goldens in PPSSPPHeadless, Azahar (RetroArch core) and Vita3K where firmware can be provided by a secret-free method (else Vita stays local).", "ac": ["the job runs on push and fails on a golden mismatch", "toolchain and emulator downloads are cached and pinned", "Vita's firmware requirement is handled without committing Sony files"], "deps": ["psp-ball", "vita-ball", "n3ds-ball"]}
  ]
}
```

---

## Sources

PSP

- [S1] PlayStation Portable hardware, Wikipedia: <https://en.wikipedia.org/wiki/PlayStation_Portable_hardware>
- [S2] PPSSPP, Allegrex overview: <https://www.ppsspp.org/docs/psp-hardware/cpu/allegrex-overview/>
- [S3] PPSSPP, GE overview: <https://www.ppsspp.org/docs/psp-hardware/gpu/ge-overview/>
- [S4] pspdev/vfpu-docs: <https://github.com/pspdev/vfpu-docs>
- [S5] pspsdk `build.mak` (MEMSIZE / PSP_LARGE_MEMORY) and `pspmoduleinfo.h` (PSP_HEAP_SIZE_KB):
  <https://github.com/pspdev/pspsdk/blob/master/src/base/build.mak>,
  <https://github.com/pspdev/pspsdk/blob/master/src/user/pspmoduleinfo.h>
- [S5b] PSP programming, hardware description (32 MB = 8 kernel + 24 user):
  <https://en.wikibooks.org/wiki/PSP_Programming/Hardware_Description>
- [S6] psptoolchain-allegrex config (GCC 15.2.0, binutils 2.44, newlib 4.5.0):
  <https://github.com/pspdev/psptoolchain-allegrex/blob/main/config/psptoolchain-allegrex-config.sh>
  - Releases: <https://github.com/pspdev/pspdev/releases>
  - Image: <https://hub.docker.com/r/pspdev/pspdev>
- [S6b] pspdev tips and psp-cmake: <https://github.com/pspdev/pspdev.github.io/blob/master/tips_tricks.md>
- [S7] SDL PSP renderer, swizzle notes: <https://discourse.libsdl.org/t/sdl-psp-dont-swizzle-streaming-textures/34814>
- [S8] PPSSPP `headless/Headless.cpp`: <https://github.com/hrydgard/ppsspp/blob/master/headless/Headless.cpp>
  - Getting started (headless): <https://www.ppsspp.org/docs/development/getting-started>
- [S8b] pspautotests and test.py: <https://github.com/hrydgard/pspautotests>,
  <https://github.com/hrydgard/ppsspp/blob/master/test.py>
- [S8c] PPSSPP emulator API: <https://www.ppsspp.org/docs/development/ppsspp-internals/emu-api/>
- [S9] PPSSPP, Media Engine: <https://www.ppsspp.org/docs/development/ppsspp-internals/media-engine>
  - MElib: <https://github.com/IridescentRose/MElib>
  - Wololo, 2026-06-16: <https://wololo.net/2026/06/16/unlocking-the-psps-dual-core-setup/>
- [S17] PSP WPA2 through ARK-4 (2025):
  <https://timeextension.com/news/2025/02/new-custom-firmware-update-allows-you-to-connect-your-psp-to-wpa2>
- [S18] PSPLINK: <https://github.com/pspdev/psplinkusb>
  - ARK-4: <https://github.com/PSP-Archive/ARK-4/wiki>
  - ConsoleMods ARK-4 guide: <https://consolemods.org/wiki/PSP:Installing_ARK-4_CFW>

PS Vita

- [S10] PlayStation Vita, Wikipedia: <https://en.wikipedia.org/wiki/PlayStation_Vita>
- [S11] TweakTown, Vita CPU 333/444 MHz:
  <https://www.tweaktown.com/news/47804/sony-underclocked-ps-vitas-cpu-frequency-444mhz/index.html>
- [S11b] PSVshell: <https://consolemods.org/wiki/Vita:PSVshell>
- [S12] VitaSDK buildscripts (GCC 15.2.0, binutils 2.46.1): <https://github.com/vitasdk/buildscripts>
  - Autobuilds: <https://github.com/vitasdk/autobuilds/releases>
  - Image: <https://hub.docker.com/r/vitasdk/vitasdk>
- [S13] VitaSDK ScePower: <https://docs.vitasdk.org/group__ScePowerUser.html>
- [S14] vita-headers (CPU affinity masks USER_0..2): <https://github.com/vitasdk/vita-headers>
- [S15] SDL commit, Vita memory split comment:
  <https://git.axiodl.com/encounter/SDL/commit/656eb7df35efcd7382a5634366ed8cd9b23633d3>
- [S15b] VitaSDK newlib `sbrk.c` (128 MiB default heap): <https://github.com/vitasdk/newlib/blob/vita/newlib/libc/sys/vita/sbrk.c>
- [S16] Vita3K: <https://github.com/Vita3K/Vita3K>
  - CLI: <https://github.com/Vita3K/Vita3K/blob/master/vita3k/config/src/config.cpp>
- [S16b] Vita3K progress report on GXM: <https://vita3k.org/2018/09/05/Summer-2018-Progress-Report.html>
- [S16c] Vita3K FAQ and quickstart: <https://vita3k.org/faq>, <https://vita3k.org/quickstart.html>
- [S17v] vitaGL: <https://github.com/TheOfficialFloW/vitaGL>
  - libshacccg: <https://consolemods.org/wiki/Vita:Installing_Libshacccg.suprx>
- [S17p] PVR_PSP2: <https://github.com/GrapheneCt/PVR_PSP2>
- [S17s] SDL README-vita: <https://github.com/libsdl-org/SDL/blob/main/docs/README-vita.md>
- [S19] vitacompanion: <https://github.com/devnoname120/vitacompanion>
  - vita-rust examples (PrincessLog): <https://github.com/vita-rust/examples>

Nintendo 3DS

- [S20] 3dbrew, Hardware: <https://www.3dbrew.org/wiki/Hardware>
- [S21] Nintendo 3DS, Wikipedia: <https://en.wikipedia.org/wiki/Nintendo_3DS>
- [S22] 3dbrew, memory layout and system modes: <https://www.3dbrew.org/wiki/Memory_layout>
- [S23] devkitPro buildscripts (GCC 16.1.0): <https://github.com/devkitPro/buildscripts/blob/master/select_toolchain.sh>
  - Image: <https://hub.docker.com/r/devkitpro/devkitarm>
- [S23b] devkitPro pacman releases (no pacman in CI; use docker): <https://github.com/devkitPro/pacman/releases>
  - Getting started: <https://devkitpro.org/wiki/Getting_Started>
- [S24] Azahar: <https://azahar-emu.org/>
  - Releases: <https://github.com/azahar-emu/azahar/releases>
  - Libretro core: <https://docs.libretro.com/library/azahar/>
  - Qt arguments: <https://github.com/azahar-emu/azahar/blob/master/src/citra_qt/citra_qt.cpp>
  - svcOutputDebugString: <https://github.com/azahar-emu/azahar/blob/master/src/core/hle/kernel/svc.cpp>
- [S25] RetroArch `--max-frames`, `--max-frames-ss`: <https://github.com/libretro/RetroArch/blob/master/retroarch.c>
- [S26] 3dbrew, APT:SetApplicationCpuTimeLimit: <https://www.3dbrew.org/wiki/APT:SetApplicationCpuTimeLimit>
- [S26b] libctru `os.h` (`osSetSpeedupEnable`) and `allocateHeaps.c`: <https://github.com/devkitPro/libctru>
- [S27] PICA200, Wikipedia: <https://en.wikipedia.org/wiki/PICA200>
- [S27b] Panda3DS, FOSDEM 2024 slides:
  <https://archive.fosdem.org/2024/events/attachments/fosdem-2024-1726-panda3ds-climbing-the-tree-of-3ds-emulation/slides/22561/Panda3DS_FOSDEM_o9U1196.pdf>
- [S27c] citro2d (C2D_DEFAULT_MAX_OBJECTS 4096): <https://citro2d.devkitpro.org/base_8h_source.html>
- [S28] DSP firmware for NDSP:
  - ScummVM 3DS docs: <https://scummvm.readthedocs.io/en/latest/other_platforms/nintendo_3ds.html>
  - devkitPro forum: <https://devkitpro.org/viewtopic.php?p=17914>
- [S29] 3dbrew, setting up a development environment (3dslink): <https://www.3dbrew.org/wiki/Setting_up_Development_Environment>
  - Luma3DS (Rosalina GDB stub): <https://github.com/LumaTeam/Luma3DS>

iPhone 4S and iOS

- [S30] iPhone 4S specifications:
  - EveryMac: <https://everymac.com/systems/apple/iphone/specs/apple-iphone-4s-specs.html>
  - Low End Mac: <https://lowendmac.com/2011/iphone-4s/>
- [S30b] iFixit 512 MB, reported by iCulture: <https://www.iculture.nl/nieuws/ifixit-iphone-4s-bevat-512-mb-ram/>
- [S31] Apple, OpenGL ES Hardware Platform Guide for iOS (SGX 543 limits and extensions):
  <https://developer.apple.com/library/archive/documentation/OpenGLES/Conceptual/OpenGLESHardwarePlatformGuide_iOS/OpenGLESPlatforms/OpenGLESPlatforms.html>
- [S32] Apple, Metal feature set tables (A7 minimum): <https://developer.apple.com/metal/Metal-Feature-Set-Tables.pdf>
- [S33] Xcode 14 drops armv7 and iOS < 11: <https://developer.apple.com/forums/thread/711222>
- [S33b] libwebp drops 32-bit iOS: <https://git.iohub.dev/dany/libwebp/commit/c00d83f6642e7838a12bb03bca94237f03cc2e00>
- [S34] theos/sdks: <https://github.com/theos/sdks>
- [S34b] cctools-port: <https://github.com/tpoechtrager/cctools-port>
- [S35] WWDC 2020 session 10078 (stay under 200 MB before the iPhone 6s): <https://nonstrict.eu/wwdcindex/wwdc2020/10078/>
- [S36] SDL README-ios (SDL3: iOS 11+; SDL2: iOS 8+):
  - <https://github.com/libsdl-org/SDL/blob/main/docs/README-ios.md>
  - <https://github.com/libsdl-org/SDL/blob/SDL2/docs/README-ios.md>
- [S37] libc++ availability markup:
  - <https://llvm.googlesource.com/llvm-project/libcxx/+/refs/heads/main/include/__availability>
  - Floating-point to_chars deployment target: <https://developer.apple.com/forums/thread/779096>
- [S38] three.js WebGLRenderer ("WebGL 1 is not supported since r163"): <https://threejs.org/docs/pages/WebGLRenderer.html>
  - Migration guide: <https://github.com/mrdoob/three.js/wiki/Migration-Guide>
- [S39] Phœnix jailbreak:
  - <https://theiphonewiki.com/wiki/Phœnix>
  - Elcomsoft: <https://blog.elcomsoft.com/2017/08/ios-9-3-5-physical-acquisition-made-possible-with-phoenix-jailbreak>

Prior art

- OpenStrike on PSP (QuickJS game logic, 60 fps):
  <https://www.generationamiga.com/2026/07/10/counter-strike-on-psp-openstrike-runs-at-60fps-with-javascript/>
- PocketJS / Pocket3D: [`pocketjs-pocket3d.md`](pocketjs-pocket3d.md)
