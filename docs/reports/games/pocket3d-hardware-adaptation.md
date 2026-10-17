# How Pocket3D adapts to each piece of hardware: notes and what Zinc should take

Date: 2026-10-17. Research report, no code changed. Asked by the owner (2026-10-17): "prends bonnes notes sur comment
Pocket3D s'adapte aux différents hardware".

This adds to, and does not repeat, `docs/reports/hardware/pocketjs-pocket3d.md` (2026-10-09, 1,206 lines: machines,
packs, budgets, 40-task plan), `docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md`,
`docs/reports/games/console-2d-3d-frameworks.md`, and decisions D119, D126, D141. Clean-room rule (D141): no Pocket3D
code is copied (device kernels are under the Pocket3D License, which forces a title card); designs are learnt from.

Method: WebFetch of https://3d.pocket.nexus/, the Studio pages (maneuver, requiem, duty), and the public repositories of
https://github.com/pocket-nexus cloned read-only into /tmp (nothing built or run). Revisions read: pocketjs `3d09837`
(2026-10-16), pocket-tokyo `07764d4`, pocket-atlas `0d698ea`, pocket-duty `048fdf3` (new since the last report),
open-strike `8f1b58c`, pocket-voxel `903f516`, pocket-island `c1dcda3`. Citation keys: PJ, TK, AT, DU, OS, VX, IS = the
repository; `TK/README.md:93` = file and line. Anything not confirmed by a page or by code is marked [unverified].
Maneuver and Requiem have no public repository and their Studio pages give almost no technical detail (only fps,
package sizes, knight and house counts); everything said about their internals comes from the 3D site and the blog.

## 0. What changed since 2026-10-09 (corrections and new facts)

- **A new game, Pocket Duty** (DU, 2026-10-13): PSP 30 fps, 3DS 30 fps, **Vita 60 fps**; a browser game compiled per
  console. It is the best source on the GE and PICA frame loop (section 3.2). Studio package sizes: PSP 49 MB, Vita
  79 MB, 3DS 43 MB (https://studio.pocket.nexus/games/duty).
- **Atlas PSP is no longer night-only.** It cooks all six place kinds (night street, daytime slope/street/coast, dusk
  street, dusk vista) and all seven places run on the PSP in `PLPS` v4 (176 B header) (`AT/psp/README.md:12-25`). The
  3D site still says the PSP gets a subset; Griffith (vista) is gated per place in the web registry
  (`AT/docs/COMPILER.md:156-160`).
- **Two more targets**: an Android phone (Redmi 1S, Adreno 305, GLES 3, 1280x720; TK and AT) and, in OpenStrike, a Nokia
  E7 (GLES 2, Qt/Symbian) (`OS/README.md:274`). Atlas and Tokyo also draw the iPod touch 4 with **GLES 2** (7 and 6
  programs), not GLES 1.1; only OpenStrike's iPod build is GLES 1.1 (`OS/README.md:19`).
- **Stereo 3D is off in every game**: `gfxSet3D(false)` in TK `n3ds/src/main.c:452`, AT `n3ds/src/main.c:357`, DU
  `n3ds/src/main.c:725`, IS `3ds/main.c:422` and the citro3d example. The 3D site lists "glasses-free 3D" as a
  feature of the machine, not as something a game uses. (Zinc's ZN-478 plans stereo; see section 4.)
- **The compiler architecture changed in Atlas**: PICA and GE no longer read the Vita pack; every target is lowered
  from one sealed, lossless PlaceIR (`AT/docs/COMPILER.md:23-46`). Details in section 2.2.
- **iPhone 4S itself** is still only a PocketJS UI host (Hero demo). No Pocket3D game names the 4S; all target the iPod
  touch 4 (A4, SGX535, iOS 6.1.6). Tokyo's iPod core is the 3DS's Rust source built for `armv7-apple-ios`
  (`TK/README.md:23`). No 4S frame numbers exist anywhere [unverified for the 4S; the iPod figures are a lower bound].

## 1. The adaptation model in one page

1. **One authoring source, N lowerings.** Scenes are Three.js content or a browser game run once headless in Chrome; the
   export is an intermediate representation that keeps *meaning* (heights, footprints, light records, materials with
   intent annotations), never GPU data. CityIR (TK), PlaceIR (AT), WorldIR (Maneuver), DutyIR (DU), MapIR/BSP (OS).
2. **A per-device profile file** drives the cooker: `TK/profiles/{vita60,psp30,n3ds30,ipod60,redmi1s60}.json`,
   `AT/profiles/{vita30,psp30,old3ds30,ipod30,redmi1s30}.json`, `DU/profiles/{psp30,n3ds30,vita60}.json`. A profile
   fixes host OS/ABI, GPU family, render and display size, auxiliary screen, target fps, texture caps, animation
   palette bytes, `maxMeshVertices 65535`, field point caps and per-section byte budgets. A custom profile may tighten
   budgets but cannot change the GPU or relax a reader limit (`AT/docs/COMPILER.md:177-186`).
3. **Budgets are compile errors; a failed cook leaves the previous pack and receipt intact**
   (`AT/docs/COMPILER.md:218-221`). Every cook writes a deterministic `*.compile.json` (source hash, compiler hash,
   profile hash, section sizes, texture layouts, diagnostics, no timestamps). The receipt records
   `device.status = "not-recorded"`: a cook proves construction, never speed.
4. **One renderer per GPU, no common GPU API.** Rule of the device kernels: "Do not normalize GE, PICA and GXM into one
   GPU API. Compilers must be able to see their costs and constraints. ... The caller owns GPU completion; no implicit
   waits" (`PJ/devices/README.md`). Shared code = memory, swizzle, cache publication, lifetime only.
5. **The sim is shared, the draw list is per device.** `tokyo-sim`, `duty-sim`, `openstrike-core` are `no_std` Rust built
   once and linked into every device; they choose *what* a frame draws (`view::select`), the device draws it. TK's
   iPod core is the 3DS core source; the browser tab reuses the same core (`wgpu/`) and reads the iPod/PSP/Vita pack.
6. **A runtime governor against a measured budget**, not a fixed quality: triangle budget plus GPU wait (TK Vita), GPU
   timer queries (TK Android), late-frame counting with a probing step-up (AT Vita), 22,500 triangles / 24.5 ms (DU PSP).
7. **Evidence is per device, per pack hash.** Emulators prove consistency only; every hardware bug listed in the old
   report's 2.12 and below came from a real console. Physical receipts (bench JSONL, `status.json`) are required.
8. **The 2D UI is a separate PocketJS app** drawn over (or into) the 3D frame, one bundle per *presentation*
   (`single`, `dual`, `touch`), picked at build time from the device's modality (section 3.5).

## 2. The cooker: what is baked offline, per device

### 2.1 Pack formats (all share: magic, 16-byte section table, LE, 16-byte aligned sections, deterministic)

| Game | Pack | Per-device differences |
|---|---|---|
| Tokyo | `TKPK` v3 (`TK/crates/tokyo-pack`) | Vita: reference triangles at the near level, normals, BC1/BC3 pictures, 1024 ground; PSP: prisms at every level, 8 B ground vertex, CLUT8 day+night palettes, 256 ground, 24 MB; 3DS: ETC1 + Morton RGB565, sector byte, 128 ground cells, 32 MiB `.3dsx` limit; iPod: the 3DS vertices with 16-bit row-order texels, 177 MB (134 MB of cell records, 40 resident); Android: Vita shape with ETC2 |
| Atlas | `PLCE` v7 (Vita), v5+PICA table v3 (3DS), v1 (iPod, 6 sections), v0x201 (Android), `PLPS` v4 (PSP) | each target has its own reader; "neither device loads the other's pack" by version; a change to one lowering must leave the others' bytes identical (`AT/docs/COMPILER.md:42-57`) |
| Duty | `duty.pack` (`DU/crates/duty-pack`) | PSP 30.5 MB (palette textures 128 px); 3DS 28.3 MB (RGB565/RGBA5551/A8, PICA tiled); Vita up to 80.6 MiB (BC1/BC3 512 px, 2048 px sun depth image) |
| OpenStrike | `P3D1` (`OS/domain/crates/pocket3d-bsp`) | one format; per-device reader/renderer crates `pocket3d-gu`, `-vita`, `-gles2`; PSP embeds in `.rodata` |
| Voxel | `VXPK` v9 | one pak, a named fidelity ladder (top rung pinned bit-identical by frame hashes), PSP rung won by telemetry |

Duty ships a map as pieces named by their bytes plus one list (`pocket.packs`, `PJ/docs/POCKET3D-PACKS.md`) read by
the browser, PSP and 3DS alike; a 3DS `.3dsx` can embed the first map (31.4 MB, under the 32 MiB wire limit) or read
`packs/` from the card (`DU/README.md:355`).

### 2.2 What each lowering does (vertex, index, texture, light, shadow)

**PSP (GE).**
- Vertices: positions s16 with the x32768 model scale (the GE divides 16-bit positions by 32768 in 3D mode); float
  positions in textured 3D draws "sample garbage on the real GE" while PPSSPP accepts them (`VX` blog). Tokyo ground
  vertex 8 B (position + sky/AO), walls/solids 12 B; Duty cluster-based; OpenStrike 20 B (`u,v f32, ABGR, xyz i16`,
  `OS/domain` P3D1 `WVTX`); Voxel 16 B (from 20, "a flat -20% on fetch bytes").
- Indices: u16 batches of at most 65,535 vertices; index order *is* the culling structure (Tokyo sorts walls by 16 compass
  sectors, `TK/README.md:87`, the pack stores group starts).
- Textures: CLUT8 + swizzle (16 B x 8 rows, `PJ/devices/psp/pocket-psp-ge/src/swizzle.rs`) for Tokyo, OpenStrike (WAD
  textures stay native 8-bit, full mip chain to 8x8) and Voxel; Duty 256-colour palettes at 128 px (64 and 32 for six
  families, 4 levels, 695 KiB total); Atlas PSP uses swizzled RGBA4444 (default) or RGBA8888 (gradients, glossy maps), caps
  128 px night / 256 px day / 512 px emissive, pack limit 24 MiB (`AT/profiles/psp30.json`). CLUT pages under 64 px wide
  mis-sample on hardware (VX); `sceGuTexFlush` on every bind.
- Light: baked into vertex colour (RGB565 x AO for Tokyo; OpenStrike lightmap sampled per vertex on a 32-unit grid with
  2x overbright; Duty tone-mapped to 16-bit colour with shadow edges cut into the mesh; Atlas bakes sun and sky occlusion
  *before* adaptive refinement so the simplifier sees the light boundaries, `AT/psp/README.md:36-44`). GE lighting is
  used only as "one ambient colour per draw" (Tokyo's 16 wall-direction groups = 1,255 draws).
- Shadow: the three Tokyo variants (section 2.3). Duty: one 512x512 ground shadow picture over 128 m, drawn as a second
  pass; wall shadows cut into the mesh (1 m minimum edge).
- Visibility: Tokyo cells/blocks/regions with a facing-arc test; Duty clusters of at most 32 triangles with sphere, box and
  normal cone, 43,270 clusters, and **per-cell potentially-visible cluster lists from 400,000 rays a cell**
  (`DU/README.md:178`); OpenStrike BSP PVS (point to leaf, RLE row decode cached per leaf, leaf AABB frustum test).
- Clipping: the GE only clips the near plane and drops a triangle with a vertex outside its 4096-pixel guard band; Duty
  cooks "a sphere and longest edge of every large triangle" (339,568 x 8 B) so the device cuts only those that can
  escape the band (`DU/README.md:179,190`). A chunk record is 128 B = two data-cache lines.
- Animation: GE morphing between two cached baked poses (OpenStrike, 12 B vertices, 6 actors 30 -> 58.9 fps); Duty GE
  skinning with four bones a batch (soldier 696 triangles, 406 beyond 16 m). Pocket3D does not use GE 8-bone skinning
  beyond that and does not use the VFPU for maths (only as a thread attribute) (`TK/psp/src/main.rs:56`).

**PS Vita (GXM).**
- Vertices 12/20/16 B (Tokyo), 24/32/28 B (Atlas static/skinned/baked), 40 B light-field vertex; positions quantised over
  chunk boxes. Textures BC1/BC3 via texpresso with mips averaged in linear light; BC5 normals; RGBA16F environment;
  R32F and RG16 shadow maps (`PJ/devices/vita/pocket-vita-gxm`, `ColorFormat::R32f/Rg16Unorm`).
- Light: the richest tier. Tokyo reads a 16-bit height texture per fragment for sun shadow; Duty has a 2048 px sun depth
  image (9 cm texel) and two vertex colours (lit/unlit, `WVTX`/`WSHD`) so no triangle is cut where a shadow falls
  (street near level 689,399 triangles vs 1,105,375 cut); Atlas: normal/ORM per pixel, HDR targets, bloom, planar
  reflections, light fields as `SCE_GXM_PRIMITIVE_POINTS`, vista height haze, shadow maps (static cached + 512^2 moving).
- Shaders: Cg compiled **on the console** by SceShaccCg at development time, cached by source hash (FNV-1a over source
  with includes expanded + label definitions + stage), shipped as GXP in releases (Atlas 864 programs, Duty 26-28). A
  release is refused unless a required console pass (`bun tools/atlas.ts programs`, 12 minutes for seven places)
  produced a manifest and coverage file matching the shader sources and all settings; "a setting that selects a program
  and is not in PROGRAM_SETTINGS" is the known hole (`AT/README.md:255-257`).
- Memory: Tokyo 65 MB city in CDRAM (69 MB reserved), glyph pages as 1 B/texel coverage saved 11 MB; with shadow targets in
  GPU-mapped main memory a night tour had 26 late frames in 30 s (`TK/README.md:99`). Duty street: 49 MB geometry + 44 MB
  pictures in video memory; a map change frees both first.
- Scene drawn directly into vita2d's 4x MSAA display surface (no off-screen copy: that cost 3.75 ms); parameter buffer
  raised 16 -> 32 MB (default overflows near 150,000 triangles and the frame takes 3x as long) (`TK/vita/build.rs`).

**Nintendo 3DS (PICA200).**
- Vertices 8/16/12 B (Tokyo: s16 position, AO, sector byte), 24 B (Atlas), 28 B colour stream and 40 B rigid-skin vertex
  (citro3d backend). Textures in linear memory, Morton-tiled; ETC1 in PICA order (last row first, 8x8 tiles in Z order,
  bytes reversed) for ground, RGB565/RGBA4/RGBA8 elsewhere; no palette format, so CLUT8 is expanded at cook time.
- No fragment shaders: three combiner stages do the work. Tokyo ground = (light x shadow + lamps x night) x picture; walls
  = light x tint x facade + night x emission; haze is a 128-step table over the depth buffer's own values, which is why
  the near plane is 12 m (`TK/README.md:155-156`). The shadow is an 8-bit texture over the whole city multiplied in by a
  combiner; lamp light is one texture added by another. Duty: ground in one draw (second combiner multiplies the shadow
  picture on texture unit 1), haze mixed in the last combiner via vertex alpha.
- Sector lighting: the vertex carries a compass-sector byte and the vertex program picks one of 17 lights with `mova a0.x`.
- Reflections: 128x256 target with a TEV interpolate (Atlas Konbini); water: two wave layers + Fresnel/TEV approximation.
- Uniform limit 96 float vectors: rigid skin = 29 joints x 3 rows = 87 vectors; an all-zero matrix = hidden joint, so
  expression changes need no vertex upload (`PJ/engine/pocket3d/backends/citro3d/README.md`).
- Quality: static sun shadows only (baked), exposure is an LDR adjustment, no per-pixel normal/ORM (`AT/n3ds/README.md:187-192`).

**iPod touch 4 (SGX535, GLES 2) and Android (Adreno 305, GLES 3).**
- Tokyo iPod: 7 GLSL programs, 4x MSAA (`glRenderbufferStorageMultisampleAPPLE`), RGB565 rows. Atlas iPod: the 3DS table
  with plain-row texels, surfaces up to 512, `FELD` light sprites (58,500 Griffith lights summed to 37,700 sprites),
  "sunlight without cast shadows" (one shadow ray per vertex cuts wedges across walls). Android: ETC2, relief cooked into
  textures, sun shadows per pixel from a depth map, one APK with armeabi-v7a (API 18) + arm64-v8a (16 KB aligned).
- OpenStrike iPod: GLES 1.1 fixed function at 960x640 render, 480x320 touch layout.

### 2.3 The three sun-shadow methods, side by side (Tokyo, https://3d.pocket.nexus/)

| | Vita | 3DS | PSP |
|---|---|---|---|
| Data | `HMAP` 2 m heights, 16-bit texture; thread sweeps 2048x1536 cells in 410 ms every 0.1 deg of sun | 4 m heights swept on a low-priority thread every 1 deg; 8-bit shade texture over the city | same sweep, 320 ms; **top bit of the CLUT8 index** set where the ground is shaded (palette upper half = lower half in shadow), writing into pictures takes 1.7 s |
| GPU use | each fragment of any program compares its height with one texel; penumbra softens with distance | multiplied in by a combiner stage | none: the palette does it |
| Walls facing the sun | normal . sun then lookup | sector byte -> one of 17 lights | 16 direction groups, GE ambient colour per group |
| Dusk | rooms switch at their own moment; bloom chain at 240x136 | lamp texture over the city + facade emission picture | day and night palettes mixed by the CPU (64 steps) |
| Cost | lookup 1.1 ms (own texcoord) vs 2.9 ms (read from .zw of a shared one) | within the 17.1 ms CPU / 17.5 ms GPU frame | palette rewrite is the main CPU cost; PSP sweep needs the worker in the frame thread's wait |

### 2.4 PlaceIR and the lesson of "target never feeds target" (Atlas)

Before: the PICA and GE cooks read the Vita pack (BC decompression, reconstruct from quantised vertices). Now:
`manifest.json` + `scene.gltf` with `extras.pocketAtlas` + `scene.bin` + `env.rgba16f`, all SHA-256 sealed; unknown versions
and changed resources fail. Shared analysis passes (world transform, chunking, light baking, animation sampling) produce
typed transient float output; `vita.rs`, `pica.rs`, `psp.rs`, `adreno.rs` own encodings. "Texture purpose" annotations
(`surface`, `text-atlas`, `flipbook`, `emissive-strip`) are compiler intents; each backend picks size/encoding, explicit
usage beats source size and luminance. `check --target` rejects a place before cooking when a target lacks a lowering
(PICA/GE reject city-light fields and vista height haze; GE rejects water and unlisted kinds) and "unsupported material
annotations fail rather than falling back to a standard material" (`AT/docs/COMPILER.md:140-154`).

## 3. The renderer per GPU and the frame loop

### 3.1 Frame budgets and numbers published (hardware unless noted)

| Game / device | Mode | Result | Source |
|---|---|---|---|
| Tokyo Vita | 960x544 4xMSAA 60 fps, budget 200k tri | 9,010 frames, 0 late, worst 17.6 ms, mean 158.2k tri, 222 draws; scene pass 3.0 ms + 0.053 ms/1k tri; draw 2 us GPU / 4 us CPU | `TK/README.md:5,102-112` |
| Tokyo PSP | 480x272 30 fps, 42k tri | 4,500 frames, 5 late, worst 50 ms, mean 37.6k, 1,255 draws; list = 1.5 ms + 0.63 ms/1k tri; CPU 9 ms (select 4.4 + write 4.4) vs GE 28 ms | `TK/README.md:6,144-151` |
| Tokyo Old 3DS | 400x240 30 fps, 60k tri | 2,728 frames, 0 late, mean 40k, 276 draws, CPU 17.1 ms, GPU 17.5 ms | `TK/README.md:7,160` |
| Tokyo iPod 4 | 480x320 4xMSAA 60 fps, 24k tri | 8,965 frames, 37 late, worst 39.8 ms, mean 22.2k, 205 draws; GPU 5.9 ms + 0.39 ms/1k tri | `TK/README.md:8,168` |
| Tokyo Redmi 1S | 1280x720 60 fps | 8,959 frames, 48 late, mean 67.1k, 135 draws; thermal throttle to 2 cores at 1 GHz above 60 C | `TK/README.md:9,186` |
| Atlas Vita | 480x272 -> 960x544 30 fps, governor | Griffith 30.0 fps at 640x362, GPU 14.5-24.5 ms; Konbini step 0 is 33.3 ms with serialized GPU 31-41 ms | `AT/README.md:196-213` |
| Atlas PSP | 30 fps target | Konbini 19.9, Puddles 15.0, Vending 15.0, Crossing 20.0, Inside 20.0, Wires 30.0 fps (fixed views, 2026-10-01); "first port, below Vita" | `AT/README.md:61` |
| Atlas Old 3DS | 400x240 30 fps | Griffith ~20,000 sprites in view, GPU 19 ms; 28k skinned vertices cost 37 ms | `AT/n3ds/README.md` |
| Duty PSP | 480x272 30 fps, 22.5k tri / 24.5 ms | 18,375 frames, 55 late (0.30%), 29.88 fps, longest 103 ms; GE 27 ms for 19,000 tri; CPU: match 2.4 + select 7.5 + list 11.2 + UI 2.9 ms | `DU/README.md:284-288` |
| Duty Old 3DS | 400x240 30 fps, 36k tri | 17,954 frames, 48 late (0.27%), 29.81 fps; 32.7k tri, 858 draws; CPU 22.9 ms, PICA 13.5 ms | `DU/README.md:302-304` |
| Duty Vita | 960x544 4xMSAA 60 fps, 170k tri | 37,149 frames, **0 late**, 16.68 ms; 86.4k tri (max 113.5k), 910 draws; 4 samples cost 4.1 ms; 1k tri = 0.043 ms | `DU/README.md:313-327` |
| OpenStrike PSP | 480x272 60 fps | 28,243-tri map 59.9 fps; JS 2.2 ms; combat 59.41 fps after a display-vcount guard | `OS/docs/PSP_COMBAT_PERFORMANCE.md` |
| Voxel PSP | 30 fps present, 60 Hz logic | outdoors 84 ms -> 27.8-34.2 ms; interiors 59-65 fps | `VX` blog |
| Island New 3DS | 60 fps | rigid GPU skinning 8.92 -> 59.8 fps | `IS/evidence/3ds-crowd-report.md` |
| Maneuver / Requiem | Studio pages | Maneuver 60 fps on four devices; Requiem up to 1,750 knights per Vita frame at 30 fps (4,053 in 133 cohorts) | Studio pages [no PSP/3DS fps given] |

### 3.2 PSP GE

- **Clocks**: `scePowerSetClockFrequency(333, 333, 166)` first thing in every game (`TK/psp/src/main.rs:223`,
  `DU/psp/src/main.rs:431`, `AT/psp/src/main.rs:244`). PSPLINK boots at 222 MHz (OpenStrike's first hardware run was 25
  fps for that reason).
- **Framebuffer**: Tokyo draws to a 512-stride PSM5650 buffer with dither on, `Fragment2X`, linear fog, depth 16-bit
  inverted (`sceGuDepthRange(65535,0)`), buffer layout colour 2x + depth in 2 MiB VRAM (`TK/psp/src/gfx.rs:215-250`).
  Duty/OpenStrike keep PSM8888. 5650 halves ROP bandwidth and frees ~560 KB VRAM for hot textures (PSP.md lever).
- **Two depth ranges**: near cells (Duty: within 12 m, from 0.15 m) in one part, everything else in another (Tokyo
  `DEPTH_SPLIT`, `gfx.rs:581-619`); a ray from the eye meets every near cell before any far one, so the passes never
  compare depths. Atlas vistas: near range ends 2.6 km, vista range 361 m to 139 km, depth cleared between.
- **Display list discipline**: one list per frame, written while the GE draws the previous one; the draws are chosen on the
  CPU while the GE draws the frame before; `DisplayList<WORDS>` 64-byte aligned (data-cache line), commands written through
  the uncached mirror; a word `sceGu` writes is "a bus cycle of its own", so world commands are written through the cache
  into runs the list calls (`DU/README.md:199`); pools reset only after `sceGuSync`.
- **CPU facts measured on the console** (Duty `probe=1`): FPU multiply-add 20 cycles; a data-cache line fetched while the GE
  draws costs ~1 us (CPU and GE share the bus); the GE takes 0.7 ms per 1,000 triangles it is *sent*, drawn or not
  (fetch-bound; culling at triangle level and instancing buy nothing, VX). So Duty answers per chunk and per cluster, and
  skips whole cells without reading their records.
- **Memory**: PSP-1000 24 MB, 2000+ 52 MB with `MEMSIZE=1` (PARAM.SFO asks for it; Tokyo 53.7 MB free). Tokyo's guest takes
  5.0-5.7 MB; "with 24 MB the guest is not started": the renderer still runs without UI. Duty needs 52 MB. A pack too big
  for a PSP-1000 is "listed as not on the device rather than failing to load" (Atlas). The map buffer is allocated once at
  the largest map's exact size; Duty changes map 20 times with a constant arena free count.
- **Threads**: frame thread (prio 32, 1 MB stack, `USER | VFPU`, the only allocator), cell reader (prio 36), shadow sweep
  (prio 44), audio. Reading a cell of at most 126 KiB takes 8 ms over USB. Memory Stick opens at most ~10 files at once
  (Atlas `files.rs`); Atlas packs everything into one EBOOT `DATA.PSAR` (`PKAR` index, 64-byte aligned entries).
- **Vcount guard**: after sync, an unconditional `sceDisplayWaitVblankStart` discarded an available refresh; comparing
  display vcounts took OpenStrike combat from 58.83 to 59.41 fps (`OS/docs/PSP_COMBAT_PERFORMANCE.md`).
- **Voxel 30/60**: present at an even 2-vblank beat with 60 Hz logic, "an uneven 28-to-43 feels worse than 30".

### 3.3 PS Vita GXM

- **Clocks** 444 / 222 / 222 / 166 MHz (ARM / bus / GPU / xbar); the main loop re-reads the ARM clock every 60 ticks and
  sets them again if the system lowered them after a suspend (`TK/vita/src/main.rs:100,806-815`, `DU/vita/src/main.rs:127,
  1035`), plus `sceKernelPowerTick` every 120.
- **Governor**: Tokyo scales near and mid distances (300/1,300 m x 0.25-1.0) against a 200k budget and pulls them in when
  the GPU wait for the frame *before last* exceeds 6 ms; they grow back 2 s later (budget 150k while a list is up).
  Atlas: steps down after 10 late frames, probes up with a doubling wait, predicts the time at a larger resolution as
  `t x (1 + 0.35 x (pixel ratio - 1))` and climbs only under 80% of the period for 2 s. Resolution ladder 480x272, 544x308,
  640x362, 720x408 for the globe.
- **Triple buffering is not mentioned in any repo** [unverified; vita2d's pool halves per frame and "CPU N+1 overlaps GPU N"
  are what is documented]. Parameter buffer 32 MB. Streaming: DU reads the street in 13.9 s over USB.
- **MSAA**: 4x on the display surface, costing ~4.1 ms in a 116k-triangle view (Duty `cost`); OpenStrike Vita has no MSAA.
- **UI**: PocketJS's Vita host library draws into the display scene after the city and bloom: 480x272 logical at 2 samples a
  pixel; vertices from vita2d's pool; a vita2d clip is two stencil writes over the whole multisampled surface, so Tokyo's
  instruments use faded marks instead of clips (11 -> 4 late frames).

### 3.4 Nintendo 3DS PICA200

- `osSetSpeedupEnable(true)` on the New 3DS; Old 3DS is the target (268 MHz ARM11), New 3DS only for Island and OpenStrike
  extras (C-stick). Memory: malloc heap fixed at 14 MiB so the linear heap (textures, vertices, animation) gets the rest
  (Atlas Tokyo leaves 3.4 MiB, Griffith 11.5 MiB); Duty 31.3 MB heap, 5.2 MB linear free.
- **`C3D_FrameSync` is a VBlank wait, not a retirement fence**; GPU retirement is observed at the next successful
  `C3D_FrameBegin`; render targets are freed outside a frame; a resident parking shader and white texture keep citro3d's
  cached pointers valid because `C3D_BindProgram`/`C3D_TexBind` reject NULL; 4-second GPU watchdog (`AT/n3ds/README.md:275+`).
- **`C3D_DrawElements` reads all 96 uniform registers every call: 16 us a draw on Old 3DS**. Duty's `render.c` writes the
  cell matrix, buffer offset and draw registers as raw GPU commands and lets citro3d write state only after a texture or
  combiner change: **7 us a draw, 9.4 -> 2.8 ms for 383 draws** (`DU/README.md:212`).
- **Every vertex program writes all three texture coordinates**: a unit that stays bound is read at them (`TK/README.md:157`).
  Every shader output is written once; attribute loaders consume the whole stride; a uniform is the first source of an
  instruction (`AT/n3ds/README.md:276-282`).
- **Two screens**: top = scene (400x240, monoscopic; Atlas has a 4x SSAA option rendering 800x480), bottom = the `dual`
  presentation as a second colour target redrawn only when its list differs (Tokyo 8 times a second), touch/stylus, map.
- Packages: `.3dsx` with ROMFS; the paired wire installs up to 32 MiB, so big packs go to the SD card, delivered by a
  token-protected HTTP endpoint with CRC and SHA-256 checks (`AT/n3ds/README.md:60-80`).

### 3.5 iPod touch 4 / iPhone 4S (GLES) and Android

- iPod: 60 fps up to ~34k triangles with 4 samples (~50k with one); the interface is **one more texture read in every scene
  program** (as a blended quad 38% of frames were late, as its own pass 49%, read in-program 12%); attributes must sit on
  4-byte boundaries (242 draws 34.7 ms -> 3.3 ms CPU); every fragment colour `lowp` (mediump left 1 frame in 4-8 late);
  textures are written only into the one no queued frame reads (tile-based driver copies otherwise); the EAGL layer is the
  portrait panel, opaque and unrotated, the scene drawn a quarter turn round, no UIKit view above (`TK/README.md:168-172`,
  `AT/ipod/README.md`). Frame time follows triangles (~0.2 ms/1k), not pixels. Atlas iPod: UI drawn at 480x320, one sample
  per logical pixel (at 640x960 the fill cost 16 ms).
- Android: the window gets no samples (2 samples made a 81k-tri frame go 14.6 -> 20.2 ms); fragments cost per interpolated
  number (each number on 58k triangles = 0.4-0.6 ms); 16-bit indices from a batch start with a vertex array per batch (32-bit
  indices over one array: 147 us of CPU walking indices for one block); `EXT_disjoint_timer_query` governor (in at 13 ms,
  out at 11 ms); the shadow sweep runs below every frame thread (29 -> 10 late frames).
- Legacy iOS build (PJ): hard-float armv7 sysroot extracted from the IPSW, `xcrun clang -target armv7-apple-ios6.0`,
  `ld-classic`, `ldid -S`; run `CADisplayLink` with ticks per callback bound to the measured display rate (see old report).

### 3.6 Compositing the 2D UI over the 3D, per device

Common: the game draws no text; a PocketJS app is a guest on QuickJS in the same process, talking JSON lines over the
`pocket.overlay` service (changed fields only); the guest turn rate is far below frame rate (Tokyo UI 30 turns/s offered,
taken when worth it: PSP 10, 3DS 15, iPod 13, Vita 30).

| Device | Where the UI is drawn | Cost |
|---|---|---|
| PSP | last pass of the GE list, blended; city gives up triangles (budget 39k behind title, 31k behind menu) | UI draw 0.9 ms of GE in flight, 1.9 ms title, 6.7 ms menu; a turn runs while the GE draws the previous frame (6.4 ms script + 2.9 ms layout) |
| Vita | vita2d into the display scene after the city/bloom, 2x raster | 0.75 ms CPU, 1.0 ms per turn, 1.3-2.3 ms GPU in Duty |
| 3DS | top surface drawn every frame; lower screen its own target, redrawn on hash change | guest turn 12.3 ms Old 3DS (script 8.3 + layout 4.1), 6.2 ms/frame at 15 turns/s |
| iPod | texture read inside every program, redrawn only when its draw list changes (11/s, 5.1 ms CPU) | scene loses 8k of 32k triangles |
| Android | 640x360 at 2 px per point over 1280x720 | [unverified GPU cost] |
| Browser | UI core compiled to wasm, drawn when its draw hash changes (1.6 ms at 960x544) | |

Presentations: `single` (PSP, Vita: lists walked by the pad, Vita rows also take a tap), `dual` (3DS: area map + day bar a
stylus turns on the bottom screen), `touch` (iPod, Redmi: stick, keys, finger on the city). A presentation only places
things and sizes rows (26-30 px under a pad, 36-44 px touch); parts and flow are written once (`TK/ui/app/parts.tsx`).
Hints are timed by the renderer (`wake`), because a guest timer counts its own turns and would force 30 turns a second for
7 s (9 ms each on a PSP). Lists stay built after first use (a coming list costs one frame, ~50 ms on PSP). A heap collection
stops a PSP for 60-80 ms, so it runs when a list is up, at load end or behind a fade.

### 3.7 Input and audio per device

| | Fly / move | Look | Other |
|---|---|---|---|
| PSP | analog stick | triangle/cross/square/circle (accelerating curve, OpenStrike) | R fire, L jump; d-pad; START menu |
| Vita | left stick | right stick | rear pad not used [unverified]; touch panel taps on list rows |
| 3DS | Circle Pad (radial deadzone, diagonals normalised) | C-stick (New 3DS) or X/B/Y/A; drag on the lower-screen map | L+R+START exits; lower screen = shots list, buttons, waypoint map (OS) |
| iPod / Android | floating stick, contacts keep their role until release | finger travel (sensitivity independent of fps) | FIRE/JUMP/RELOAD buttons, 44 pt rows |
| Nokia E7 | W A S D | arrows | Qt host, 30 Hz presentation, two 60 Hz ticks a frame |

Audio: PJ contract is s16 PCM streams at **44100/22050/11025 only** (divisors of the PSP's 44.1 kHz because the PSP's hardware
resampler is audibly broken); the audio thread never calls the guest; credits flow back per tick (`PJ/docs/AUDIO.md`).
Duty PSP: a mixer thread with 16 voices and priorities (`DU/psp/src/audio.rs`); Duty 3DS: `duty-sim` mixes at 22,050 Hz,
`ndsp` needs `dspfirm.cdc` on the card, else CSND (`DU/README.md:213`; the ndsp path "has not run on a console"). Voxel:
the chip synth moved from JS to Rust (1 s of 11 kHz chip audio = 2.3 s of interpreted CPU) and the PCM ring is pumped
**inside the GE wait**. Atlas: procedural rain audio on PSP, "not here: sound" on iPod. Tokyo: no audio mentioned
[unverified]. OpenStrike PSP v1: sound a non-goal. Vita audio path [unverified].

### 3.8 What fails or is cut, per device

- **PSP**: no HDR/PBR, normal maps, volumetric haze, wet ripples, bloom, dynamic per-pixel light, water glitter, cloud drift;
  16-bit depth limits facade detail; moving objects keep first-frame sunlight, no moving cast shadows; city-light fields and
  vista haze rejected for GE (Griffith web/Vita only per `targets`); Atlas Sangubashi misses 30 on Vita and is waived.
- **3DS**: static sun shadows; no per-pixel normals/ORM, no HDR bloom; Griffith needs a 130,000-sprite-vertex budget; Tokyo
  rooms/lamps simplified to textures.
- **Vita**: Sangubashi 37-41 ms; Duty's per-pixel wall shadow done, lamps per pixel and dust skirts not (`DU/README.md:246`).
- **iPod**: no per-pixel lighting, normal maps, glass reflections, steam, bloom, no sound (Atlas); leaving the app ends it.
- **Features only some get**: stereo (nobody), MSAA (Vita, iPod; not Android/PSP/3DS), shadows by method (section 2.3).

### 3.9 One game source, several devices

Rules/HUD in TypeScript (QuickJS guest) are one bundle for every device (OpenStrike `game/`: `rules.ts` 49 lines, `hud.tsx`
687 lines); Voxel puts the *entire* game state in the guest and the renderer is presentation-only (~2 ops/tick). The sim is
shared `no_std` Rust (`openstrike-core` "VERBATIM by all targets", `tokyo-sim`, `duty-sim`). Per-device: a pack per profile,
a renderer crate per GPU, a UI presentation per modality. A new target = a profile + a renderer + a shell; the page registry
(`tools/wgpu.test.ts`) fails when a device with a package is missing from the browser, the release tool or the site.

## 4. What Zinc should take (ranked)

Context from the repo: the backlog already carries most of the 2026-10-09 plan (ZN-489 cooker, 490 pack viewer, 491 GE
kernel, 493 GXM, 495 PICA, 497 GLES2, 500-509 demos, 452 texture layouts, 468-471 2D replay, 476-479 zinc:3d per console).
Marble Terraces (`examples/marble`: 2,297 triangles / 35 draws low, vertex colours, no textures) and Meadow Run
(`examples/platformer`: 346 tiles + 16 sprites, 256x128 atlas) have no console core to run on yet. The ranking below says what
the new material changes. Sizes: S under a day, M a few days, L a week or more.

1. **A cook profile file and receipt per target, in `zinc assets` (M).** Copy the model: one JSON per target with caps (texture
   side, mesh vertices 65,535, section budgets, fps), a deterministic receipt with hashes and no timestamps, `check --target`
   that rejects an unsupported feature *before* cooking, and "a failed cook leaves the previous output". Files:
   `next/src/assets/assets.cpp`, `model.cpp`, `texture.cpp`, `next/src/cli_core.cpp` (`zinc assets check/report`, ZN-436/437),
   new `targets/<id>/cook.json` read from `zinc.json` `targets`. Marble's `assets.rules` (`"format":"zmesh"`) gains a
   per-target override. Also: annotation of a texture's *purpose* (`surface`, `text-atlas`, `flipbook`) so the cooker, not the
   artist, picks size and format per target.
2. **Fix the PSP GE rules into the PSP back end before writing it (S, inside ZN-468/491/476).** Checklist to encode as tests
   and comments: s16 positions with the x32768 scale in 3D draws, never float; CLUT pages at least 64 px wide;
   `sceGuTexFlush` on every bind; 64-byte aligned display lists written through the uncached mirror; pools reset only after
   `sceGuSync`; `scePowerSetClockFrequency(333,333,166)` first; frame thread with the VFPU attribute and a 1 MB stack;
   `MEMSIZE=1`; a display-vcount guard instead of an unconditional vblank wait; PSM5650 draw buffer + dither as the default
   (halves ROP bandwidth; ZN-468 says the same). Files: `targets/psp/hal_psp.cpp`, `next/targets/console/psp.cmake`, ZN-468/476/491
   notes. Note ZN-476 says "sceGum matrices on the VFPU": Pocket3D uses the VFPU only as a thread attribute and keeps the CPU on
   scalar f32; measure before committing to hand VFPU transforms.
3. **Index order as culling structure, and a budget governor, in the cooker and in zinc:3d (M).** Sort walls/clusters by facing
   sector, store group starts; per-chunk records of 128 B; draw by ranges. Give `render3d` on the consoles a governor that
   follows measured GPU wait (Vita: skip frames, shrink distances) and a triangle budget per profile. Files:
   `plugins/3d/native/render3d.*.cpp`, `plugins/3d/gltf.ts`, a new `plugins/3d/native/render3d.psp.cpp` (ZN-476), cooker ZN-489.
4. **Marble Terraces as the first GE/PICA/GXM user (M each, in order PSP, Vita, 3DS).** It already fits the numbers: 2.3k
   triangles, 35 draws, vertex colours. For the PSP lower to s16 chunks (3x3 chunks of 8x8 cells, one mesh each as today), baked
   vertex light, no textures (or CLUT8 33 KiB atlas instead of 128 KiB RGBA); for the 3DS the same chunks in a 16 B layout with
   one TEV stage; for the Vita reuse the high pieces. Files: `examples/marble/src/scene.ts`, `pieces.ts`, `tools/`, the three
   `render3d.*` back ends. Meadow Run uses ZN-468/469/471 (sprite quads, `GU_SPRITES` in 2D, CLUT atlas of 33 KiB).
5. **PICA: write the draw as GPU commands, not `C3D_DrawElements` (M, inside ZN-469/495).** Measured 16 us -> 7 us a draw
   (2.8 ms vs 9.4 ms for 383 draws). Plan it from the start: own command writing for the cell/uniform registers, citro3d state
   only after texture or combiner changes; rigid skin = 29 joints x 3 rows; hidden joint = zero matrix; the three-coordinate
   rule; a parking shader/texture; retire on `C3D_FrameBegin`, never on `FrameSync`. Files: `targets/n3ds/hal_n3ds.cpp`,
   future `render3d.n3ds.cpp`, `next/targets/console/n3ds.cmake`. **Stereo (ZN-478)**: no Pocket3D game uses it; keep it behind the
   slider and last, do not budget it into Marble's 30 fps.
6. **Vita: precompiled GXP set with a "required console pass" (M, ZN-470/471/493).** Cg compile happens on a console; the
   cache key is a hash of expanded source + label + stage; the release tool refuses a set whose manifest or coverage does not
   match the shader sources and every setting. Zinc has fewer programs (GLSL ES 1.00 per D119/D124), so the Pocket3D numbers
   (864 programs) do not apply; but the *gate* does. D141 already pins a SDK; add the coverage file. Also: draw into the 4x MSAA
   display surface directly, 32 MB parameter buffer, clocks 444/222/222/166 re-asserted after suspend. Files:
   `targets/vita/hal_vita.cpp`, `next/targets/console/vita.cmake`, `plugins/display-gl` (gl_renderer shared, ZN-471).
7. **PS2 GS/VU1 path (M, ZN-197 and zinc:3d on PS2).** Pocket3D has no PS2 target [unverified, absent from all repos], so only
   indirect lessons apply: it is the closest relative of the GE (fixed pipeline, fill-bound): prefer baked vertex light, small
   textures with CLUT, ordered index ranges, a per-profile triangle budget and a measured 640x448 frame cost. Marble's
   `--profile ps2` rules test already runs f32. Files: `targets/ps2/hal_ps2.cpp`, `next/targets/console/ps2.cmake`.
8. **Texture layouts in the asset tool, with reference decoders (L, ZN-452).** Confirmed formats: PSP swizzle 16 B x 8 rows +
   CLUT8 (+RGBA4444/8888 for glossy); 3DS ETC1 in PICA order (last row first, 8x8 tiles in Z order, bytes reversed) and Morton
   RGB565/RGBA4; Vita BC1/BC3/BC5 (mips averaged in linear light, a smaller level's alpha raised to keep cover) and linear for
   the transfer engine; iPod RGB565 rows (no PVRTC in Pocket3D: re-check ZN-452's PVRTC1 plan for the 4S). Test: decode of
   the output equals the emulator's reference (already ZN-452 AC1). Files: `next/src/assets/texture.cpp`, new `texture_psp.cpp`,
   `texture_pica.cpp`.
9. **UI over 3D: one presentation per modality, composed by the renderer (S-M, ZN-474/475/492).** Reuse `lib/std/ui.ts` kits
   with three presentations (pad / dual-screen / touch), the renderer owning timers (`wake`), the guest turn rate far below the
   frame rate, and a heap collection scheduled behind a fade or a load. Give the console core a "UI over the frame" budget (the
   city gave up 8k of 32k triangles on iPod, 3-11k on PSP). Files: `lib/std/ui.ts`, `lib/std/kit`, `next/targets/console/core_main.cpp`.
10. **Evidence discipline (S).** Record in `docs/reports/zinc-next-consoles.md` per device: clocks, frame count, late frames,
    worst frame, triangles, draws, CPU/GPU ms from a real console, and keep emulator-only results labelled; add the list in
    section 5 to `docs/targets/handhelds.md`. A cook receipt never claims a frame time.

Not worth taking: a QuickJS-only core, the Three.js-in-Chrome export (Zinc has its own three plugin and zmesh), the title card
(licence), the Bun/Rust toolchain pins, per-game IRs (Zinc's cooker is generic and its IR is glTF + annotations).

## 5. Hardware pitfalls to carry into Zinc's console tests (all found on a real console)

PSP: float vertices in 3D draws; CLUT pages under 64 px; cache line shared by a display list and a CPU-written static
(replaced the first 12 commands, 5650 format of the reset list leaked in); texture overwritten while the GE samples it;
`sceGuTexFlush`; 222 MHz boot clock; Memory Stick refuses ~10 open files and `psp_main` is the only thread with the EBOOT folder as
cwd; QuickJS built at `-O0` (2.5x). Vita: destroying live vita2d textures faults; parameter buffer; "fd out of range" after 40
minutes; clocks lowered after suspend. 3DS: `C3D_FrameSync` is not a fence; `BindProgram(NULL)`; second UV flip not seen by the
emulator; `JS_NO_NAN_BOXING` for QuickJS; `.3dsx` 32 MiB wire limit; ndsp needs firmware. iOS 6: attribute alignment, `lowp`, missing
`glEnable(GL_TEXTURE_2D)`, ObjC1 relocations in `ld-classic`; `CADisplayLink` ticks per callback. Android: no window samples,
interpolant count, thermal throttle to two cores, 32-bit indices over one array.

## Sources

https://3d.pocket.nexus/ ; https://pocketjs.pocket.nexus/ and https://pocketjs.dev/blog/introducing-pocket3d/ (mirrored in
`PJ/site/content/blog/introducing-pocket3d.md`, `pocket-voxel.md`, `shipping-openstrike.md`) ;
https://studio.pocket.nexus/games/{maneuver,requiem,duty} ; https://github.com/pocket-nexus/{pocketjs,pocket-tokyo,
pocket-atlas,pocket-duty,open-strike,pocket-voxel,pocket-island} (READMEs, `docs/COMPILER.md`, `devices/*/README.md`,
`engine/pocket3d/PSP.md`, `engine/pocket3d/backends/citro3d/README.md`, profiles). Zinc side: `next/backlog/tasks/zn-452, 468,
469, 470, 471, 476, 478, 489-495, 754`, `docs/targets/handhelds.md`, `examples/marble/README.md`.
