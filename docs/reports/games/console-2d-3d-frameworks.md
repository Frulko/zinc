# Console 2D and 3D frameworks: PSP, PS Vita and PS2 for two small games

Date: 2026-10-17. Status: research report, no code changed. Audience: the owner and the backlog (ZN-753, ZN-754).

Question (owner, 2026-10-17): a small 2D game and a small 3D game running on PSP, PS Vita and PS2 (in PPSSPP, Vita3K and
Play!), using the frameworks and SDKs that make this easier, with a look at PocketJS and at DanielSant0s's AthenaEnv and
his other projects. Which back end should Zinc use on each console, what should it vendor and what should it write, and
what should the two games be?

Method: the public source trees were read through the GitHub API (READMEs, file trees, Makefiles, renderer headers),
along with the vendor and emulator documentation listed under Sources. Nothing was built or run.
Companion reports, not repeated here:

- [`hardware/handhelds-psp-vita-3ds-iphone4s.md`](../hardware/handhelds-psp-vita-3ds-iphone4s.md): HALs, SDKs,
  emulators, and the fixed-function replay of §6.1.
- [`hardware/pocketjs-pocket3d.md`](../hardware/pocketjs-pocket3d.md): PocketJS/Pocket3D, its kernels, and the
  measured PSP and Vita budgets.
- [`js-game-libraries.md`](js-game-libraries.md).

Statements marked *[unverified]* have no source behind them. Statements marked *[inference]* are reasoned from the
sources but not measured.

## 0. Summary

| | PSP | PS Vita | PS2 |
|---|---|---|---|
| 2D (zinc:gfx command lists) | fixed-function replay (§6.1 of the handhelds report), **own sceGu back end**: sprites, glyph and corner atlases, CPU tiles | the same replay on **own GXM back end** using SDL3's precompiled zlib GXP programs (clear, colour, texture); the SDF uber shader as a GXP later | the same replay on **own gsKit back end** (sprites, CLUT textures, scissor); today's software raster + upload stays the fallback |
| zinc:3d | **sceGu/sceGum hardware T&L**: 4 lights (zinc:3d has exactly 4), vertex colours, textures, blending | **own GXM back end**: render3d's CPU front half (transform, per-vertex light, clip) feeding a depth-tested GXP pair compiled once from Cg | stage 1: **render3d's CPU front half + GS triangles through gsKit**. Stage 2: **VU1 with AthenaEnv's microprograms** (MIT), our own packet code on ps2sdk packet2 |
| Vendor | nothing; pspsdk (BSD) is the SDK | SDL3 3.4.16 `render/vitagxm` GXP blobs + `.cg` (zlib) | AthenaEnv `src/vu1/*.vsm` + `.vcl` at `359485433f` (MIT), stage 2 only |
| Do not use | oslib (GPL-2.0), gLib2D (LGPL-3.0), pspgl, raylib4Psp | vitaGL (LGPL-3.0; users must extract `libshacccg.suprx`), PVR_PSP2 (no licence, Sony modules), vita2d (dormant; SDL covers it), raylib4Vita | ps2gl (LGPL-2.1), Tyra (Apache-2.0, an engine; study only), raylib4PlayStation2 (ps2gl), Enceladus (GPL-3.0) |
| Sound (zinc:audio, a miniaudio custom backend) | `sceAudioChReserve`/`sceAudioOutputBlocking` on a thread (8 hardware channels; mix in software) | `sceAudioOutOpenPort` at 48 kHz | audsrv (ps2sdk): mixed PCM stream, VAG/ADPCM sound effects on SPU2 voices, as AthenaEnv does |
| Emulator | PPSSPPHeadless | Vita3K | **Play!**: HLE BIOS, so no BIOS dump; `--elf`; a libretro core |

The idea shared by all three consoles: **the GPU rasterises, the engine keeps its own front half.**

- render3d's software pipeline already produces clip-space vertices with a per-vertex shade and uv (`struct V` in
  `plugins/3d/native/render3d.host.cpp:58`), clipped by `clip()`.
- A console back end replaces `raster()` with a GS, GXM or GE draw. PSP is the exception: its GE does its own T&L.
- On consoles zinc:3d draws into the framebuffer, never into a read-back image. The 2D frame goes on top: either
  replayed, or rasterised in software into an RGBA overlay that is uploaded only when damaged.
- The two games: a 2D platformer (zinc:sprite, zinc:tilemap) and a 3D marble course (zinc:3d, a level made from a
  tilemap, rigid animation, no physics library). Both are sized for the PSP-1000 and run unchanged on the desktop
  (§4.4).

## 1. AthenaEnv and DanielSant0s's projects

### 1.1 AthenaEnv: what it is

- **Architecture.** AthenaEnv is a JavaScript runtime for the PS2 (EE, ps2sdk + newlib), MIT, 698 stars, 569 commits
  (524 of them by DanielSant0s). Its last commit on main is `359485433f` (2026-08-01). Releases are a rolling
  "Development build" from CI in the `ghcr.io/ps2homebrew/ps2homebrew` image.
- **QuickJS fork.** A lightly modified QuickJS adds an **f32 number type**: a `15.0f` literal, and `Math.fround`
  returning real singles. The README gives the reason: "the console only processes 32-bit floats on its FPU". This is
  the same choice as Zinc's `f32` profile for the PS2.
- **AOT compiler.** `Native.compile` is an AOT compiler from typed JS functions to R5900 code (`src/native_compiler/`,
  277 KB of C), claimed at "40x+" on math [unverified].
- **Bundled libraries.** QuickJS, cgltf, fast_obj, ODE (physics), BearSSL, FreeType, libpng/jpeg, vorbis.
- **Build.** One `make` produces `athena.elf` and a packed `athena_pkd.elf`. Feature flags (`GRAPHICS`, `AUDIO`,
  `PADEMU`, `STATIC_NETWORK`...) cut the RAM it uses (`docs/BUILDING_ATHENA.md`).
- **Programs.** Programs are `.js` files loaded from the device at run time. The README recommends PCSX2 with HostFS
  for testing.

### 1.2 How AthenaEnv draws

- **gsKit, headers only.** AthenaEnv takes gsKit's (AFL-2.0) headers and types (`GSGLOBAL`) but does not link
  libgskit: the Makefile links only `-ldmakit`, and the `gsKit_queue_exec` calls in `graphics.c` are commented out.
- **"owl" packet layer.** All drawing goes through its own **"owl" packet layer** (`src/owl_packet.c`,
  `include/owl_packet.h`): 16-byte-aligned qword packets per DMA channel (VIF1, GIF...), VIF `unpack` lists and a
  double-buffered VU1 memory layout (`vu1_set_double_buffer_settings(270, 339)`).
- **3D: VU1 microprograms.** They are written in **VCL** (`src/vu1/*.vcl`). The **generated `.vsm` assembly is
  committed**, so a build needs only dvp-as, not the 32-bit VCL binary. There are seven pipelines: `draw_3D_colors`,
  `draw_3D_lights`, `draw_3D_spec`, the `_skin` variant of each, and `draw_3D_lights_ref` (environment map).
- **Clipping and maths.** Shared clip routines handle scissor clipping (`proc/process_scissor_clip*.i`, about 27 KB
  each). VU0 does the matrices.
- **Features.** Lights are 4 directional ones with ambient, diffuse and specular (`LightData` in
  `include/render.h`). Also: flat or Gouraud shading, face culling, emboss bump mapping, skinning from glTF,
  draw-call and triangle counters, and `Batch`, `SceneNode` and `AsyncLoader` helpers.
- **The match with zinc:3d.** zinc:3d's native interface is 4 directional lights, ambient, Blinn-Phong specular,
  vertex colours, one texture, opaque/over/add blending and back-face culling (`plugins/3d/native/render3d.spec.ts`).
  AthenaEnv's no-skin pipelines cover all of it.
- **2D.** "MMI accelerated" shapes and images (`owl_draw.c`). A **VU1 tile-list microprogram**
  (`draw_2D_tile_list.vcl`) draws thousands of sprites from an `ArrayBuffer` with materials and blending
  (`docs/TILEMAP.md`). Fonts use FreeType and image fonts (`fntsys.c`). Textures go through its own
  `texture_manager.c`, with VRAM lock/unlock and async loading.
- **Sound.** audsrv (ps2sdk): ADPCM effects on hardware voices with volume, pan and pitch, plus WAV/OGG streams
  (`sound_sfx.c`, `sound_stream.c`). MPEG-1/2 video plays through the IPU.

### 1.3 AthenaEnv: API surface, performance, maturity

- **API.** `Screen` (modes, vsync, depth, `clear`/`flip`, VRAM statistics), `Image` and `ImageList`, `Draw`,
  `TileMap`, `Font`, `Pads` (DS2/3/4, pressure, rumble), `Keyboard`, `Mouse`, `Sound`, `Video`, `Render`,
  `RenderData`, `RenderObject`, `Camera`, `Lights` (4), `AnimCollection`, `Shadows`, `System`, `Archive`, `IOP`,
  `Network`, `Request`, `Socket`, `WebSocket`, `Thread`, `Mutex`, `Timer`, `ODE`. The model is immediate: an
  `os.setInterval` loop calling `Screen.clear()` ... `Screen.flip()`.
- **Performance.** No numbers are published: no fps or triangle counts in the README, docs or issues (searched
  2026-10-17). The `Render` frame-stats API exists so programs can measure themselves. Treat any rate as
  *[unverified]*.
- **Maturity.** Active, but essentially one developer. It has 13 open issues, for example
  "Applications not running without CMOS" (#135). For our purpose, the VU1 code has shipped in homebrew (FlappyBirdPS2,
  JS2Game) [unverified for the current pipelines].

### 1.4 DanielSant0s's other projects (non-forks, from his GitHub)

| Project | What | Licence | For Zinc |
|---|---|---|---|
| [Enceladus](https://github.com/DanielSant0s/Enceladus) | AthenaEnv's Lua predecessor for the PS2 (graphics, render, pads, sound) | GPL-3.0 | nothing; AthenaEnv supersedes it, and the licence rules out vendoring |
| [AthenaWin](https://github.com/DanielSant0s/AthenaWin) | AthenaEnv on Windows: an early stub (`main.c` + QuickJS) | MIT | nothing |
| [Athena2ME](https://github.com/DanielSant0s/Athena2ME), [AthenaStudio](https://github.com/DanielSant0s/AthenaStudio) | the same API on J2ME phones; a VS Code extension with a browser simulator | MIT | design only: an editor simulator of the console API (Zinc already has `zinc dev`) |
| [ps2isotool](https://github.com/DanielSant0s/ps2isotool) | Rust ISO/ZSO builder and verifier for PS2 discs, LBA-preserving | MIT | candidate tool for a later `zinc export --target ps2` disc image (OPL, real discs); Play! boots ELFs, so not needed now |
| [vu1_gskit_cube](https://github.com/DanielSant0s/vu1_gskit_cube) | a VU1 cube under gsKit | none | read only (no licence) |
| [r5900-jit](https://github.com/DanielSant0s/r5900-jit), [PSPLoader](https://github.com/DanielSant0s/PSPLoader) | notes on a JIT for the EE; PSP ELF loading on the PS2 | GPL-3.0 / MIT | nothing |
| [FlappyBirdPS2](https://github.com/DanielSant0s/FlappyBirdPS2), JS2Game | AthenaEnv games | GPL-3.0 | reference for the size of a "small game" on the PS2 |
| PS2-CLEO, SA-DEPLoader, mwfproject, RWParser, GTAVLegacy... | patches and tools for retail games | MIT | nothing |

He has no PSP or Vita project. **What AthenaEnv gives Zinc:**

1. The VU1 microprograms, MIT, with attribution. They are the PS2 zinc:3d stage 2.
2. The design of a qword packet builder with VIF unpack lists and double-buffered VU memory. We rewrite it on ps2sdk's
   `packet2` (AFL-2.0) rather than vendoring `owl_packet`, which is tied to AthenaEnv's globals.
3. The tile-list VU1 program, if a 2D game ever needs thousands of sprites.
4. The audsrv usage pattern.
5. Confirmation that f32 numbers and an AOT path are what the PS2 needs, as Zinc's profile already assumes.

## 2. Proven libraries per console

### 2.1 PS2

| Library | Licence, state | Gives | Verdict |
|---|---|---|---|
| ps2sdk ([ps2dev/ps2sdk](https://github.com/ps2dev/ps2sdk) `329e2bb432`) | AFL-2.0, active | `dma`, `packet`/`packet2` (DMA, VIF and GIF packets), `draw`, `graph`, `math3d`, `libvux`, libpad, audsrv; `ee/draw/samples/{cube,teapot,texture}` (EE-side transform) | the SDK, linked; packet2 for the VU1 path |
| gsKit ([ps2dev/gsKit](https://github.com/ps2dev/gsKit) `8ef73d05f0`) | AFL-2.0, active | GS init and modes, prim lists (sprites, gouraud and textured triangles), texture manager with per-frame upload, CLUT | **the 2D back end and 3D stage 1**; already used by `targets/ps2/hal_ps2.cpp` |
| AthenaEnv renderer | MIT, active | VU1 T&L, clipping, 4 lights, skinning, tile lists | **vendor the VU1 programs** (stage 2); not the C around them |
| [Tyra](https://github.com/h4570/tyra) (h4570, v2.7.3, 2024-02) | Apache-2.0; code idle since 2024, README edits in 2026 | C++20 engine: VU1 static, morph and "minecraft block" pipelines (`.vclpp`, needs VCL at build), frustum culling (whole or partial mesh), EE or VU1 clipping, audio, pads, OBJ/MD2/PNG | study its culling and block pipeline; do not vendor (an engine that owns the loop, a VCL dependency, idle) |
| [ps2gl](https://github.com/ps2dev/ps2gl) | LGPL-2.1, maintained in ps2dev | OpenGL 1.2 subset over VU1 renderers; immediate mode is slow, display lists and DrawArrays are fast (its README) | no: LGPL static linking, a GL 1.x shape that zinc:3d does not need |
| VU1 microcode tools | — | VCL: a 32-bit Linux binary + GASP (AthenaEnv, Tyra); [openvcl](https://github.com/jsvennevid/openvcl) (dormant 2016); dvp-as in ps2dev binutils | ship generated `.vsm`, assemble with dvp-as; never require VCL |

### 2.2 PSP

| Library | Licence, state | Gives | Verdict |
|---|---|---|---|
| pspsdk `sceGu`/`sceGum` ([pspdev/pspsdk](https://github.com/pspdev/pspsdk) `6ef2b21dc4`) | BSD-style, active (GCC 15.2 in pspdev) | GE display lists, `GU_SPRITES`, T&L with `GU_LIGHT0..3`, CLUT4/8, swizzle, VFPU gum | **the back end for 2D and 3D** |
| SDL3 `render/psp` (zlib) | upstream | sceGu SDL_Renderer with geometry | reference code to read |
| intraFont | CC/unclear [unverified] | firmware PGF fonts | not needed: Zinc bakes its own glyph atlases |
| [oslib](https://github.com/dogo/oslib) (GPL-2.0), [gLib2D](https://github.com/libcg/gLib2D) (LGPL-3.0, 2015), [pspgl](https://github.com/pspdev/pspgl-legacy) (BSD-3, legacy) | — | 2D helpers; a GL-ish layer | no: licences, or a layer Zinc does not need |

### 2.3 PS Vita

| Library | Licence, state | Gives | Verdict |
|---|---|---|---|
| GXM via VitaSDK headers ([vitasdk/vita-headers](https://github.com/vitasdk/vita-headers)) | MIT | the native API: TBDR scenes, CDRAM blocks, GXP programs | **the back end (D119 names GXM)** |
| SDL3 `render/vitagxm` | zlib, upstream 3.4.16 | GXM memory and tools code, plus **precompiled GXP blobs** for clear, colour and textured-times-colour with their `.cg` sources (`SDL_render_vita_gxm_shaders.h`) | **vendor the blobs** (zlib) for the fixed-function replay; positions are `float2` (z = 1), so 3D needs its own vertex program |
| [vitaGL](https://github.com/Rinnegatamante/vitaGL) (`7635e3ceb3`) | LGPL-3.0, very active | GL over GXM, GLSL translator, shader cache | no: LGPL; users must extract `libshacccg.suprx` from their console (its README), a bad first run; Vita3K support needs a special build [unverified] |
| [libvita2d](https://github.com/xerpi/libvita2d) | MIT, last commit 2021 | 2D over GXM with GXP blobs | no: SDL's code is the same idea and maintained |
| [PVR_PSP2](https://github.com/GrapheneCt/PVR_PSP2) | **no licence file**; built on PowerVR driver sources and Sony modules [inference] | GLES 1.1/2 + EGL | no: supply and licence risk |
| PocketJS Vita host | MIT (runtime), Pocket3D licence for kernels | vita2d plus Cg compiled on the console by SceShaccCg, cached and **shipped as GXP** | copy the method: compile our few Cg programs once, commit the GXP |

### 2.4 Cross-console frameworks

| Framework | Consoles | Renderer quality | Verdict |
|---|---|---|---|
| SDL3 (zlib; Zinc vendors 3.4.16 with console sources pruned) | PSP (`video/psp`, `render/psp`: sceGu), Vita (`video/vita`, `render/vitagxm`), PS2 (`video/ps2`, `render/ps2`: gsKit prim lists, 6 blend modes, `QueueGeometry`) | 2D only (SDL_Renderer); no 3D API on any of the three (SDL_GPU has no back end there) | reference code and the GXP blobs; scored below as a 2D route |
| raylib ports ([raylib4Psp](https://github.com/raylib4Consoles/raylib4Psp), [raylib4PlayStation2](https://github.com/raylib4Consoles/raylib4PlayStation2), [raylib4Vita](https://github.com/psp2dev/raylib4Vita)) | PSP (pspgl or SDL2), PS2 (ps2gl, raylib 6.0, 2026-04), Vita (PIB/piglet, raylib 4.2, 2022) | GL 1.x emulation underneath; one maintainer (psxdev) | no: an application library that owns the loop, built on layers ruled out above |
| PocketJS / Pocket3D | PSP, Vita, 3DS, iOS | per-GPU kernels, compiled packs | already studied; take the methods, write clean-room (licences in the PocketJS report §3.8) |

## 3. Budgets a small game must respect

| | PSP (480×272) | PS Vita (960×544) | PS2 (640×448 NTSC) |
|---|---|---|---|
| CPU | Allegrex 333 MHz, single-precision FPU + VFPU | 4× Cortex-A9 (3 for apps) at 444 MHz, NEON | EE 294.9 MHz, VU0 + VU1, 16 KB scratchpad |
| RAM | 32 MiB (PSP-1000, about 24 MiB for the user) / 64 MiB | 512 MiB (256 MiB app) | 32 MiB, plus 2 MiB IOP and 2 MiB sound RAM |
| Video memory | 2 MiB eDRAM; two 16-bit 512×272 buffers + Z16 = 835 KiB, **about 1.1 MiB left**; textures can sit in main RAM | 128 MiB CDRAM (112 MiB for the app) | **4 MiB GS eDRAM**: two 32-bit 640×448 buffers + Z16 = 2.8 MiB, **about 1.2 MiB left** (2.3 MiB with 16-bit buffers); textures streamed per frame by the texture manager |
| Texture size | ≤ 512×512, power of two, swizzled, CLUT4/8, 5650/4444 | ≤ 1024 for a small game (GXM allows more [unverified]), swizzled | ≤ 1024×1024 (`capabilities.json`: CLUT8/CLUT4/5551/RGBA8, power of two) |
| Fill rate | 664 Mpixel/s: 130 kpx per screen, so about 85 full layers at 60 fps in theory; budget **≤ 4× overdraw** [inference] | TBDR; Tokyo draws 960×544 with 4× MSAA at 60 fps | 2.35 Gpixel/s flat, **~1.2 Gpixel/s with Z, alpha and texture** |
| Alpha blending | reads the eDRAM framebuffer, which costs fill; use alpha test for cutouts [inference] | blend rather than `discard`; opaque first, then blended (PowerVR guidance) | in the GS pipeline at the textured rate: **cheap**. The cost is texture upload and page changes [inference] |
| Triangles/frame (measured elsewhere) | 28k at 60 fps (OpenStrike), 37–42k at 30 (Tokyo); GE cost about 1.5 ms + 0.63 ms per 1k triangles | 158k mean at 60 fps (Tokyo); 3.0 ms + 0.053 ms per 1k, 2 µs GPU / 4 µs CPU per draw | commercial games averaged **52k polygons/frame** (10k–145k), 60% at ≤ 25–30 fps (SCEE 2003); peaks of 75 M/s are theory |
| **Small game budget** | **≤ 8k tris, ≤ 300 draws, ≤ 1,500 sprites, ≤ 8 MiB assets, 60 fps** | **≤ 30k tris, ≤ 300 draws, 60 fps** | **≤ 8k tris on the CPU path (30–60 fps [inference]), ≤ 30k on VU1; ≤ 2,500 sprites; ≤ 1 MiB resident textures, 60 fps** |
| Sound | 8 hardware output channels at 44.1 kHz (`PSP_AUDIO_CHANNEL_MAX`); mix in software, ≤ 8 voices | `sceAudioOut` ports at 48 kHz | SPU2: 48 ADPCM voices, 2 MiB sound RAM, 48 kHz; music as one PCM stream |

The PSP-1000 is the floor for RAM and the PS2's eDRAM is the floor for texture memory. Every asset in both games must
fit 1 MiB of resident textures and about 8 MiB of RAM.

## 4. Recommendations

Scores follow `RULES.md` §4 (1–5 each; fit ×3, performance ×3, size ×2, maintainability ×2, licence ×2,
portability ×1, effort ×1; maximum 70).

### 4.1 The 2D back end on all three consoles (zinc:gfx command lists)

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **Fixed-function replay (handhelds §6.1) + one small native back end per GPU** (sceGu, gsKit, GXM with SDL's GXP blobs) | 5 | 5 | 5 | 4 | 5 | 3 | 3 | **64** |
| Software raster + full-frame upload (today's PS2 HAL) | 3 | 2 | 5 | 5 | 5 | 5 | 5 | 55 |
| The same replay over SDL3's three renderers (`SDL_RenderGeometry`) | 4 | 3 | 3 | 4 | 5 | 5 | 4 | 54 |
| AthenaEnv 2D (`owl_draw` + VU1 tiles) | 3 | 5 | 4 | 3 | 5 | 2 | 3 | 53 |

The software raster stays the first step and the fallback. It is enough for breakout (ZN-753: small damaged areas). A
scrolling platformer redraws the whole screen every frame, which is about 290k pixels on a 295 MHz EE and 523k on the
Vita; there it needs the replay [inference]. The SDL3 route loses because it brings SDL's video, event and audio
subsystems back for each console, to replace three back ends of about 300 lines each. SDL's sources remain the code to
read.

### 4.2 zinc:3d on the PS2

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **Our VU1 back end: packet code on ps2sdk packet2 + AthenaEnv's VU1 microprograms** (`.vsm` vendored) | 5 | 5 | 4 | 3 | 5 | 3 | 3 | **60** |
| Own VU1 microcode written from scratch (dvp-as) | 5 | 4 | 5 | 3 | 5 | 3 | 1 | 57 |
| **render3d's CPU front half + GS triangles via gsKit** (`raster()` replaced) | 4 | 2 | 5 | 5 | 5 | 3 | 5 | 56 |
| AthenaEnv's renderer vendored whole (`render.c`, `owl_packet`, texture manager) | 3 | 5 | 3 | 3 | 5 | 3 | 3 | 52 |
| Tyra's renderer extracted | 2 | 5 | 3 | 2 | 5 | 3 | 2 | 46 |
| ps2gl | 3 | 3 | 3 | 2 | 2 | 3 | 3 | 38 |

The decision is to do it in two stages:

- **Stage 1 is the CPU path** (score 56, effort 5). It is about 200 lines [inference] and reuses the clipping and
  per-vertex lighting that are already tested against the software renderer. It makes the marble game run first.
- **Stage 2 is the VU1 back end** (score 60). It comes when a frame exceeds about 8k triangles at 60 fps, or when the
  EE's frame time is over budget.

Tyra is to be studied (partial frustum culling, its block pipeline), not vendored. AthenaEnv's renderer is studied
**and** its microprograms are vendored.

### 4.3 The Vita GPU path (ZN-470's question)

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **Own GXM back end**: SDL3's zlib GXP blobs for the 2D replay at once; our own Cg (3D with depth, then the SDF uber shader) compiled once by SceShaccCg on a console and committed as GXP (PocketJS's method) | 5 | 5 | 5 | 3 | 4 | 3 | 2 | **59** |
| Software raster on 3 cores + one GXM blit (ZN-464) | 3 | 2 | 5 | 5 | 5 | 5 | 5 | 55 (stage 1) |
| SDL3 `vitagxm` renderer only | 3 | 3 | 4 | 5 | 5 | 5 | 4 | 55 (2D only) |
| vitaGL + display-gl's GL replay + `render3d.gl.cpp` | 4 | 4 | 3 | 4 | 2 | 4 | 4 | 50 |
| PVR_PSP2 GLES 2 | 3 | 4 | 3 | 2 | 1 | 3 | 3 | 39 |

The Vita is the only one of the three with shaders. Users do not need a shader compiler: the compile is a maintainer
step, with the Cg source committed beside the blob. This changes ZN-477, which assumed GLES 2 + WebGL1: three.js
under `zinc:script` on the Vita would need vitaGL. That stays a later option, not this path.

### 4.4 The two games (one source each; desktop first, then the consoles)

**2D: `examples/platformer`**: a side-scrolling platformer.

- **Content.**
  - One LDtk level of 120×17 tiles of 16 px, with two tile layers and a parallax background.
  - A hero sheet of 24×24 frames: idle 4, run 6, jump 2, hurt 1.
  - Two enemies (a walker and a flyer, 4 frames each), spinning coins (6 frames) and a goal flag.
- **Atlas.** Everything sits in **one 256×256 atlas**: CLUT8 on PSP and PS2 (65 KiB + 1 KiB palette), RGBA8 on desktop
  and Vita.
- **Scale and view.** The logical scale is 1 on PSP (30×17 tiles visible) and PS2 (40×28), and 2 on Vita and the
  desktop (960×544). The view grows with the screen; the level does not change.
- **Per frame.** At most about 2,300 quads (two layers on the PS2) plus 60 sprites and a HUD of up to 40 glyphs.
- **Input.** D-pad or left stick, Cross to jump, Square to run, Start to pause; keys on the desktop.
- **Sound.** Four effects (jump, coin, stomp, hurt; 22 kHz mono, VAG on the PS2) and a music loop of 60 s or less.
- **What it shows.** zinc:sprite animations, zinc:tilemap, a scrolling camera, fixed-step f32 physics, pad input,
  sound, text, and per-screen scale.

**3D: `examples/marble`**: a marble course in the manner of Monkey Ball. The stick tilts the board ±12°, the ball
rolls, and the player collects gems before the timer ends.

- **Level.** An LDtk IntGrid of 24×24 cells (heights 0–3) plus entities (start, 20 gems, goal, 4 moving platforms).
  The same tool as the 2D game. Zinc code turns it at load time into 8×8 chunk meshes of exposed faces: **≤ 4,000
  triangles**, vertex colours with baked AO, and one 64×64 checker texture.
- **Ball.** A 16×12 sphere (about 360 triangles) with a striped texture so the roll is visible.
- **Gems.** 8-triangle octahedra that spin and bob. This is rigid node animation: zinc:3d has no skinning, and the
  game needs none.
- **Lighting and camera.** One directional light plus ambient (hardware on GE, VU1 or CPU). The camera follows the ball
  and leans with the tilt.
- **Physics.** Our own sphere-against-grid collision at 120 Hz, safe in f32. No Jolt: zinc:physics3d is too heavy for
  the PSP [inference].
- **HUD.** Timer, gem count and "GOAL" in zinc:gfx text over the 3D layer.
- **Sound.** A rolling loop whose pitch follows the speed, a gem chime, a fall and a goal jingle.
- **Budget.** **≤ 5,000 triangles and ≤ 60 draws per frame** after per-chunk frustum culling, ≤ 64 KiB of textures,
  60 fps (30 fps acceptable on the PS2's CPU path).
- **What it shows.** Analog input, lighting, a texture, one blended draw (a translucent goal ring), animation, and 2D
  composed over 3D.

Why these two:

- Both are the smallest content that still shows animation, input and sound.
- Both use plugins that exist (zinc:sprite, zinc:tilemap, zinc:3d, zinc:audio).
- Neither needs a feature some console lacks: no shaders, no skinning, no physics engine.
- The marble's level comes from the same LDtk tool as the platformer.

### 4.5 Order, mapped onto existing tasks (the backlog is frozen: no new tasks)

1. ZN-456 (SDK pins), ZN-457 (runners).
   - Add **Play!** as the PS2 runner: an HLE BIOS, so no BIOS file is needed; `--elf`; a libretro core for headless
     frames.
   - Play! lifts the "display unverified, needs PCSX2 + BIOS" note in `docs/targets/playstation.md`. Its homebrew
     compatibility with gsKit is [unverified].
2. ZN-458/459 hello, then ZN-463/464 bouncing ball, then ZN-753 breakout (software raster on all three).
3. The platformer on the desktop (ZN-754 #1). Then the replay back ends:
   - ZN-468 (PSP GE);
   - ZN-471 (Vita, on GXM with SDL's blobs, ZN-470's answer);
   - the PS2 gsKit back end (ZN-197, parked: its criteria fit, so it can be unparked).
4. The marble game on the desktop.
   - zinc:3d PSP (ZN-476, sceGu T&L).
   - zinc:3d Vita (ZN-477, re-aimed at GXM).
   - PS2 stage 1 (CPU front half + gsKit).
   - On the consoles, `present` draws 3D into the framebuffer and the 2D goes on top.
5. PS2 VU1 stage 2 only if the measured frame needs it.

## 5. Risks and open points

- **SceShaccCg in Vita3K.** Vita3K may not run SceShaccCg [unverified]. If it does not, compiling the GXP needs a real
  Vita once (the owner's), or a Cg-to-GXP path that has not been found. Until then the Vita can draw only what SDL's
  three programs cover: 2D replay and unlit textured triangles with CPU depth sorting.
- **Play! and homebrew.** Play!'s accuracy on homebrew GS code is not documented. PCSX2 with the owner's BIOS dump is
  the fallback.
- **AthenaEnv's microprograms.** They expect AthenaEnv's VU memory layout and packet format. The port reproduces them
  from `mem_layout.i` and `render.c`. The cost is not measured.
- **The 1 MiB texture budget on the PS2** assumes 32-bit framebuffers. CT16S buffers double it, but need dithering
  for gradients.
- **PSP f32.** Desktop f64 and PSP f32 runs of the same game diverge after minutes. Scripted tests must compare
  per-console goldens, not desktop ones.

## Sources

- AthenaEnv <https://github.com/DanielSant0s/AthenaEnv> (README, `docs/BUILDING_ATHENA.md`, `docs/TILEMAP.md`, `Makefile`, `src/include/{render,owl_packet}.h`, `src/render.c`, `src/vu1/`, `src/sound_sfx.c`; main `359485433f`, 2026-08-01) and its [issues](https://github.com/DanielSant0s/AthenaEnv/issues); his repositories <https://github.com/DanielSant0s?tab=repositories>.
- PS2: Tyra <https://github.com/h4570/tyra> (v2.7.3); gsKit <https://github.com/ps2dev/gsKit>; ps2sdk <https://github.com/ps2dev/ps2sdk> (`ee/packet2`, `ee/draw/samples`); ps2gl <https://github.com/ps2dev/ps2gl>; openvcl <https://github.com/jsvennevid/openvcl>.
- PSP: pspsdk <https://github.com/pspdev/pspsdk> (`src/gu/pspgu.h`, `src/audio/pspaudio.h`); <https://github.com/dogo/oslib>; <https://github.com/libcg/gLib2D>; <https://github.com/pspdev/pspgl-legacy>; <https://github.com/tpimh/intraFont>.
- Vita: vitaGL <https://github.com/Rinnegatamante/vitaGL>; libvita2d <https://github.com/xerpi/libvita2d>; PVR_PSP2 <https://github.com/GrapheneCt/PVR_PSP2>; vita-headers <https://github.com/vitasdk/vita-headers>; libshacccg <https://samilops2.gitbook.io/vita-troubleshooting-guide/shader-compiler/extract-libshacccg.suprx>; Vita3K shader recompilation <https://vita3k.org/2018/09/05/Summer-2018-Progress-Report.html>.
- SDL3 console back ends <https://github.com/libsdl-org/SDL/tree/main/src/render> (`ps2`, `psp`, `vitagxm`, `vitagxm/shader_src/*.cg`; 3.4.18 current, 3.4.16 vendored).
- raylib ports: <https://github.com/raylib4Consoles/raylib4Psp>, <https://github.com/raylib4Consoles/raylib4PlayStation2>, <https://github.com/psp2dev/raylib4Vita>.
- Emulators: Play! <https://github.com/jpd002/Play-> (README: HLE BIOS, `--elf`, `--disc`; `Source/ui_libretro`, `tools/AutoTest`); PPSSPP <https://github.com/hrydgard/ppsspp> (v1.20.4); Vita3K <https://github.com/Vita3K/Vita3K>.
- Hardware: <https://en.wikipedia.org/wiki/PlayStation_2_technical_specifications> (GS 4 MB, 2.352/1.2 Gpixel/s, SPU2 48 voices, 2 MB sound RAM); <https://en.wikipedia.org/wiki/PlayStation_Portable_hardware> (GE 166 MHz, 2 MiB eDRAM, 664 Mpixel/s, 33 M polygons/s); <https://en.wikipedia.org/wiki/PlayStation_Vita>; SCEE, "How far have we got" (2003, polygons per frame in shipped games) <https://retrocdn.net/images/8/81/HowFarHaveWeGot.pdf>.
- PowerVR guidance: <https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/rules/do-not-use-discard.html>, <https://forums.imgtec.com/t/hsr-confusion/1315>.
- Repository: `plugins/3d/native/render3d.{spec.ts,host.cpp,gl.cpp}`, `targets/ps2/hal_ps2.cpp`, `targets/capabilities.json`, `docs/targets/playstation.md`, `docs/reports/zinc-next-decisions.md` (D119, D124, D126), `backlog/tasks/zn-{197,468,470,471,476,477,753,754}*`.
