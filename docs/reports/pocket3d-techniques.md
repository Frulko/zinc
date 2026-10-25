# Pocket3D's per-console techniques, and what examples/tokyo needs to match them

Date: 2026-10-25. Research report, no code changed. Asked by the owner: examples/tokyo must match Pocket Tokyo on the
consoles with no compromise. Their published numbers (`README.md:5-11` of pocket-tokyo):

| Console | Screen | Rate | Triangles a frame | Draws | Other |
|---|---|---|---|---|---|
| PS Vita | 960 × 544, 4× MSAA | 60 fps, 0 late in 9,010 | mean 158,200 (86,800 to 200,200) | 222 | shadows that follow the clock, night glow, traffic |
| PSP | 480 × 272 | 30 fps, 5 late in 4,500 | mean 37,600 (22,800 to 42,100) | 1,255 | shadows |
| 3DS (Old) | 400 × 240 + lower screen | 30 fps, 0 late in 2,728 | mean 40,000 (21,400 to 53,600) | 276 | 17.1 ms CPU, 17.5 ms GPU a frame |

Zinc today (`docs/reports/tokyo-per-device.md`): budgets of 40,000 (Vita), 18,000 (3DS) and 14,000 (PSP); no near level on any
console; nothing beyond 1,800 to 3,500 m; no shadows; the level choice runs in the interpreter every 2 to 4 frames; emulator
numbers only.

Sources read (nothing built or run): pocket-tokyo `07764d4` with its submodule `vendor/pocketjs` `fcd49be` cloned into
`~/Lab/pocket-tokyo-src/pocket-tokyo` (outside the repository). Citations: `TK/<path>:<lines>` for pocket-tokyo, plain paths for Zinc.
This report adds to `docs/reports/games/pocket3d-hardware-adaptation.md` (2026-10-17, all Pocket3D games) and does not repeat it:
here only Tokyo, and per technique what Zinc has and what to add. Licence: pocket-tokyo is MIT (its code may be ported with the
notice); the PocketJS device kernels and the title card are under the Pocket3D License, so D141's clean-room rule stays for them.

## 0. The five findings that matter most

1. **Pocket3D draws ranges of a few big buffers, chosen by native code.** The whole city is about 1,700 batches (`ipod60` pack:
   1,736 draws, 48 blocks of 512 m, 768 cells of 128 m). A frame is a list of *index ranges* (`Item {batch, place, from, to,
   sector}`, `TK/crates/tokyo-sim/src/view.rs:25-40`) picked by `view::select` (`view.rs:145-297`): regions, blocks, cells
   tested against the frustum, and of each cell's walls only the arc of compass sectors that can face the eye. Zinc draws one
   glTF node per part per tile, walks the node tree in the interpreter, and calls the renderer once per part.
2. **The far level covers the whole city.** There is no "far reach": the far level of every region in the frustum is drawn,
   to a far plane of 12 km (`TK/psp/src/gfx.rs`, the far depth range; the 3DS `FAR_PLANE 12000`, `TK/n3ds/src/render.c:52-53`).
   The whole far level of Shiba is 19,394 triangles and the whole mid level 157,839 (`ipod60` META). Zinc stops at 1.8 km on
   the PSP and fades the rest into haze.
3. **The near level is drawn on every console**, as prisms of a 2 m raster on the PSP and the 3DS (streamed, 40 slots) and as the
   reference's own triangles on the Vita (resident). Zinc's packs leave the near level out on all three consoles (`zinc.json`).
4. **No normals and no per-vertex lighting on the handhelds: the light is per face group.** Walls and painted geometry are sorted
   by 16 compass sectors at every level; the PSP issues one draw per sector with the GE's ambient colour as the light (this is
   why it has 1,255 draws), the 3DS indexes one of 17 lights by a sector byte in the vertex (`mova`). The sky's share is baked per
   vertex (`ao`). Vertices are 8/12/8 bytes (PSP), 8/16/12 (3DS), 12/20/16 (Vita), against 36 (Zinc PSP and 3DS) and 20 + 4
   (Zinc Vita).
5. **Shadows are one integer sweep over a height grid** (`TK/crates/tokyo-sim/src/shadow.rs:19-81`, 60 lines), on a thread when
   the sun has moved 0.1° (Vita) or 1° (handhelds); each GPU consumes it its own way: a 16-bit texture compared per fragment
   (Vita), an 8-bit texture multiplied by a combiner stage (3DS), the top bit of the 8-bit ground texels with a palette whose
   upper half is the lower half in shadow (PSP).

And one data finding: **the published pack is `ipod60`, and its geometry is the 3DS's.** `TK/profiles/ipod60.json` differs from
`n3ds30.json` only in picture sizes and the landmark's lamps; `psp30.json` differs from `n3ds30.json` only in picture sizes and the
cell room (36,000 against 56,000 bytes, which coarsens the painted geometry of a few PSP cells, `TK/crates/tokyo-cook/src/main.rs:770-790`).
So the PSP and 3DS geometry can be rebuilt exactly from the `ipod60` pack Zinc already downloads (re-encoding vertices, keeping
the sector byte and the `SPAN` groups), and their pictures re-encoded from its RGB565 ones. **The Vita's `vita60` pack is not
published**: its near level is the reference's triangles, its mid level prisms of a 1 m raster, its ground 1,024² BC1 per block
(`TK/profiles/vita60.json`). Matching the Vita's 158,000 triangles exactly needs Pocket Tokyo's own pipeline run once (fetch 3 GB of
PLATEAU, OSM and GSI, export in headless Chrome, cook: `TK/README.md:28-57`), or a Vita that draws the `ipod60` geometry with a
larger near distance (the same triangle count, prisms instead of the reference's roof shapes near the eye).

## 1. The pack and the cook (`TK/crates/tokyo-cook`, `TK/crates/tokyo-pack`)

### 1.1 What the cook precomputes, per profile

| | `psp30` | `n3ds30` | `vita60` |
|---|---|---|---|
| Target (`target.rs:20-38`) | `Psp`: vertices as the GE reads them | `Pica`: as the vertex programs read them | `Vita`: resident, with normals |
| Places | cell 128 m (4 × 4 a block), block 512 m, region = 1 block | same | cell 128 m, block 512 m, region 2 × 2 blocks (1,024 m) |
| Near level | prisms of a 2 m raster (`near` rule), one record per cell in `NEAR`, at most 36,000 bytes of geometry | same, 56,000 bytes | the reference's own triangles (PLATEAU roofs, structures within 0.15 m, a crown on every tree) |
| Mid / far | prisms of 4 m and 8 m rasters, buildings over 10 m / 40 m | same | prisms of 1 m and 4 m, over 2 m / 14 m |
| Ground mesh | terrain within 1.5 m / 6 m, flaps on place borders (`main.rs:525-555`) | same | 0.5 m / 4 m |
| Landmark (Tokyo Tower) | own model at 3 levels: 3,388 / 1,732 / 564 triangles, by distance 450 / 1,100 m (`README.md:126-140`) | same | the reference's triangles in the block batches |
| Pictures | CLUT8 pairs: day + night palette, swizzled, ground 128 colours; block 256², cell 256² (0.5 m), facades 512 × 128 | ground ETC1 (day only), facades RGB565 day + window emission, Morton tiled; block 256², cell 128² (1 m), facades 1,024 × 128; lamps 1,024² RGB565 | BC1 ground 1,024² per block, 512² per region; BC3 facades (alpha = wall mask), BC1 window emission; 6 mips |
| Per vertex baked | sky share × colour into RGB565 | sky share byte, sector byte, window gain | sky share, normal, window gain and `late` (when the rooms come on) |
| Heights (`HMAP`) | 2 m raster stored at 4 m (`store: 2`), `u16` in 1/128 m | same | 2 m, 2,048 × 1,536 |
| Lamps (`LAMP`) | baked into the night palettes of the ground (`handheld.rs:65-79`) | a 1,024² texture over the grid (`main.rs:1169-1193`) | `u16` per 2 m cell |
| Traffic | `LANE`, `LPTS` (6,777 lanes from OSM) | same | same, drawn |

Steps, in order (`main.rs:300-1219`): read the tiles in parallel; draw every roof into one 1 m grid with its owner
(`prisms::RoofGrid`); per tile the ground at two errors, the prisms at each level (`prisms.rs:1-8`: cells within 4 m of height
become a terrace, its outline straightened into walls, a flat top), painted geometry simplified per level (`simplify.rs`);
the heights raster; lamp light per 2 m cell from 9,128 lamps with a dither (`main.rs:605-645`); then the batches.

**Batches** (`main.rs:129-195`, `650-800`): triangles welded into chunks of at most 65,535 vertices (`chunks`), per place and
kind (top, wall, solid, open). Within a mid or far batch, triangles are sorted by cell, and walls within a cell by sector
(`sort_by_key(cell * 17 + sector)`, `main.rs:669-672`); `SPAN` stores where each group starts (`Out::batch`, `main.rs:179-194`).
Near batches of a handheld are sorted by sector only. Indices are `u16` relative to the batch's first vertex.

**Quantisation** (`main.rs:116-127`, `207-265`): x and z are `u16` over the place (tops) or the place plus a 128 m margin (walls,
solids); y over −16 m to 496 m (0.8 cm a step). The handhelds store them as `s16` (`q − 32768`): neither GPU has an unsigned
16-bit attribute. The renderer folds origin and span into the matrix of the place (`TK/n3ds/src/render.c:229-244`); the eye is
subtracted on the CPU first on the PSP, so a float has no precision problem (`gfx.rs:486-493`).

**Sky share** (`heights.rs:61-81`): 8 directions × 4 distances (3, 7, 14, 28 m) over the heights, `0.3 + 0.7 × open`, one byte.
**Sector** (`city.rs:36-51`): `atan2(n.z, n.x)` in 16 steps; 16 for faces that look up or down.

### 1.2 The pack format (`TKPK` v3, `TK/crates/tokyo-pack/src/lib.rs:1-45`)

Little-endian; header `TKPK`, version, section count; a table of 16-byte entries (tag, offset, size); sections on 16-byte
boundaries. Tables are `repr(C)` records read in place (`City`, `Region`, `Block`, `Cell`, `Batch`, `NearCell`, `Landmark`,
`HandPicture`). A handheld keeps every section except `NEAR` in memory (10 MB on the PSP) and reads `NEAR` a cell at a time;
`NEAR` is last so the head can be read in one go (`main.rs:1205-1208`). A `NearCell` record has five 16-byte aligned parts: top,
wall and solid vertices, indices, picture (`lib.rs:235-247`).

## 2. Per console: what Pocket Tokyo does

### 2.1 PSP (GE, `TK/psp/src`)

| Technique | How | Where |
|---|---|---|
| Vertex formats | top and solid: RGB565 colour + `s16` xyz = 8 B, `COLOR_5650 \| VERTEX_16BIT \| INDEX_16BIT`; wall: `u16` uv + RGB565 tint + `s16` xyz = 12 B; no normals | `gfx.rs:89-97`, `tokyo-cook/src/main.rs:221,240,259` |
| Dequantisation | a model matrix per place (scale `span × 32768/65535`, translation `origin − eye`), set only when the place changes | `gfx.rs:486-493` |
| Ground UV | none in the vertex: the GE's texture matrix makes them from the position (`TexMapMode::TextureMatrix`) | `gfx.rs:466,479,622-625` |
| Memory | vertices, indices, pictures in main RAM, exact-size allocations; VRAM holds only two 512 × 272 RGB565 buffers and a 16-bit depth buffer | `gfx.rs:64,231-233`, `mem.rs` |
| Display list | one a frame, static 384 KiB, 64-byte aligned, written through the uncached mirror; draws chosen (`choose`) while the GE draws the frame before, the list written (`draw`) after `sceGuSync` | `gfx.rs:51-59,528-547`, `main.rs:340-423` |
| A draw | three raw commands (base + index address, primitive); a full `sceGuDrawArray` only every 24th draw; place matrix, ambient colour, vertex pointer and texture bound only when they change (`Last`) | `gfx.rs:499-518` |
| Lighting | `SingleColor` light with `ColorMaterial(AMBIENT)`: the vertex colour is the material, `sceGuAmbient(by_sector[k] × 0.5)` the light of the draw; `Fragment2X` doubles it | `gfx.rs:247-251,557-558`, `tokyo-sim/src/sky.rs:92-103` |
| Why 1,255 draws are cheap | a draw costs a few words; passes in a fixed order (top, wall, solid, open) × two depth ranges, so vertex type and texture mode change about 8 times a frame; a list costs 1.5 ms + 0.63 ms per 1,000 triangles whatever the state | `README.md:145` |
| Depth | two ranges of the 16-bit buffer: near cells in 65535..16384 (near plane 3 m), mid and far in 16384..0 (to 12 km); inverted test | `gfx.rs:67-68,575-620`, `README.md:146` |
| Culling and LOD | `view::select`; governor ×0.97 over the budget, ×1.008 under 88 % of it, scale 0.25 to 1 over near 600 m / mid 1,600 m; budget 42,000, 39,000 behind the title, 31,000 behind the menu | `view.rs:299-328`, `main.rs:181,287-288,346-356` |
| Streaming | 40 slots of the largest record; a reader thread (priority 36) reads the nearest wanted cell (126 KiB at most, 8 ms over USB), shades it, writes back the cache; a slot is retired beyond near + 96 m and reused only after the GE finished; cells behind the eye count 2.2 × farther | `stream.rs:29,74-77,114-136,158,210-283`, `README.md:147` |
| Pictures | CLUT8 (`PsmT8`, 256 × RGBA8888), swizzled 16 B × 8 rows, mips to 16 texels, `LinearMipmapNearest`; the palette the GE reads is day and night mixed in 64 steps, at most 10 palettes a frame | `handheld.rs:81-93,168-201`, `gfx.rs:190-224,606-611` |
| Night | the mix of the palettes is the whole night: lamps are in the ground's night palette, lit windows in the facade's; the sector lights tend to 1 at night | `handheld.rs:43-79` |
| Shadows | sweep of the 4 m heights on a thread (priority 44) when the sun moved 1°; the result sets bit 7 of the ground indices (whole 16 × 8 blocks with one word mask when uniform), the upper half of each ground palette is the lower half × the shadow colour; cells patched when read; 320 ms a sweep, 1.7 s to patch, all in the frame thread's wait | `shade.rs:67-173`, `gfx.rs:199-207,561`, `README.md:124,147` |
| Fog, sky | GE fog 120 to 9,000 m in the horizon colour, the clear colour the same; a 129-vertex dome coloured on the CPU | `gfx.rs:391-426,568-592` |
| CPU a frame | choosing 4.4 ms, writing the list 4.4 ms (native Rust at 333 MHz) against 28 ms of GE; the UI turn fits in the GE wait | `README.md:149` |

### 2.2 Nintendo 3DS (PICA200, `TK/n3ds/src`, core `TK/n3ds/core/src/lib.rs`)

| Technique | How | Where |
|---|---|---|
| Vertex formats | top: `s16` xyz + sky share + 0 = 8 B; wall: xyz + sky + sector + tint and window gain + `s16` uv = 16 B; solid: xyz + sky + sector + RGBA = 12 B; `GPU_SHORT` / `GPU_UNSIGNED_BYTE` loaders | `render.c:49,118-128`, `tokyo-cook/src/main.rs:223,243,261` |
| Memory | resident levels in four `linearAlloc` sections flushed once; 40 cell slots in linear memory with a 128² 3-level ETC1 texture each; all textures in linear memory | `main.c:204-246`, `render.c:134-163` |
| Submission | citro3d `C3D_DrawElements` over `u16` index ranges; buffers rebound only when the vertex pointer changes; place matrix only when the place changes; command buffer × 4 | `render.c:229-313` |
| Vertex programs (4) | sky; top: texcoord 0 from position for the picture, 1 = 2 from position for one grid over the city (lamps, shadows), colour = sky light × sky share; wall: the facade coordinate in all three, colour = `lights[sector]` × tint × share; solid: (`lights[sector]` × share + night/2 × alpha) × colour. Every program writes all three texcoords | `TK/n3ds/src/*.v.pica`, `README.md:157` |
| 17 lights | sun × max(n_k · sun, 0) + mix(ground, sky), halved (the combiner doubles), mixed to the night colour; filled per frame on the CPU | `n3ds/core/src/lib.rs:308-335`, `render.c:246-250` |
| Combiner (TEV) | ground: `MODULATE(primary, shadow)`, `MULTIPLY_ADD(lamps, constant night × 0.8, previous)`, `MODULATE(previous, picture) ×2`; wall: `MODULATE(primary, facade) ×2`, `MULTIPLY_ADD(windows, constant night, previous)`; solid: primary ×2 | `render.c:213-224,342-396` |
| Haze | the hardware fog table: 128 steps of exp(−0.00022 d) over the depth buffer's own values; near plane 12 m so the city is not all in step 0; 24-bit depth; the eye keeps 30 m clear | `render.c:52-53,172-185`, `lib.rs:254` |
| Culling, LOD | `view::select` as the PSP, but one draw for the whole arc (no split); governor over 600 / 1,600 m, budget 60,000 | `main.c:51`, `lib.rs:253` |
| Streaming | the same slot scheme, read from `romfs:/city.pack` by a worker one priority below the frame thread on the other core | `main.c:260-300,537`, `lib.rs:420-471` |
| Pictures | ETC1 (own encoder, PICA order: last row first, 8 × 8 squares, Z order, bytes reversed), RGB565 Morton-tiled facades and lamps, mips averaged in linear light | `tokyo-cook/src/etc1.rs:79-100`, `handheld.rs:95-114`, `tex.rs:49-71` |
| Shadows | the sweep written straight into a tiled 1,024² L8 texture (255 in sun, lowered by the depth of the shade), sampled at texcoord 2; swept when the sun moved 1° or the sky's share changed by 0.03, by the cell reader when no cell is wanted | `lib.rs:477-519`, `render.c:150-156,283-284` |
| Both screens | the city on the top 400 × 240 target; the interface's second surface on the lower screen, redrawn when its list changes (8 times a second on the tour) | `README.md:159` |
| CPU a frame | city alone 9.7 ms (selection, submission), 17.1 ms with the interface (a guest turn 12.3 ms taken 15 times a second); GPU 16.2 → 17.5 ms | `README.md:160` |

### 2.3 PS Vita (GXM, `TK/vita/src`)

| Technique | How | Where |
|---|---|---|
| Vertex formats | top 12 B (`u16n` xyz, sky share, `s8n` normal), wall 20 B (+ gain, `late`, tint, `s16n` uv), solid 16 B (+ RGBA, alpha 255 = lamp) | `tokyo-pack/src/lib.rs:275-315`, `vita/src/city.rs:210-217` |
| Memory | the whole city resident: the four sections in one GPU-mapped main-memory block; textures in CDRAM; `u16` indices relative to each batch | `city.rs:222-235`, `gpu.rs:200-204` |
| Draws | one vertex stream, `sceGxmDraw` over index ranges; programs bound once per kind, the place's matrix and ground texture only when the place changes; 2 µs of GPU and 4 µs of CPU a draw | `city.rs:341-414`, `README.md:105` |
| Governor | budget 200,000 (150,000 with a list up); ×0.97 over the budget, ×0.985 when the frame waited > 6 ms for the GPU, ×1.008 under 88 % but not for 2 s after such a wait; over near 300 m / mid 1,300 m | `main.rs:549-562,752-785` |
| Programs (Cg, compiled on the console by SceShaccCg, named by an FNV-1a hash of the source) | top: ground BC1 × light, shadow compare, at night + lamps; wall: facade × mix(white, tint, mask), at night + windows × ramp(night − 0.6 late); solid: two-sided light, lamps glow; per-vertex haze `1 − 1/(1 + x + x²/2)` capped at 0.94; sky dome; bloom: bright, two blurs, add | `TK/vita/shaders/*.cg`, `gpu.rs:67-124` |
| Shadows | 2,048 × 1,536 `u16` heights swept on a thread when the sun moved 0.1° (410 ms); two `U16_RRRR` textures in CDRAM, the new one used 3 frames after it is ready; each fragment compares its height with one texel read at its own varying (1.1 ms; 2.9 ms from the `.zw` of a shared one); walls look 3 m out of themselves | `vita/src/shadow.rs:37-115`, `README.md:93,108` |
| MSAA | 4× straight into the display surface (`vita2d_init_advanced_with_msaa`), no off-screen scene (that cost 3.75 ms); parameter buffer 32 MB (`--wrap=sceGxmInitialize`: 16 MB overflows near 150,000 triangles, then a frame takes 3 × as long) | `main.rs:64-82,485-488`, `vita/build.rs` |
| Night glow | 240 × 136 chain from the frame on display (one frame late), bright, blur across, blur down, added by a full-screen triangle | `post.rs:213-262` |
| Traffic | 800 cars on 6,777 lanes, moved on the CPU; those within 1,700 m and the frustum written as 28 vertices (20 B) each into a 2-slot ring; one index buffer built once; one draw | `cars.rs:17-133`, `tokyo-sim/src/traffic.rs:127` |
| Pictures | BC1 ground 1,024² per block with mips, BC3 day facades, BC1 windows, `U5U6U5` lamps; 65 MB of city in CDRAM | `city.rs:237-296`, `README.md:99` |
| CPU and GPU a frame | scene pass 3.0 ms + 0.053 ms per 1,000 triangles (≈ 11.6 ms at 160,000); 222 draws ≈ 0.9 ms of CPU; the GPU is the limit | `README.md:103-107` |

## 3. What Zinc has, what to add, and where (ordered by expected gain)

What Zinc has today, in one line each: zinc:3d draws one `.zmesh` part per call with float vertices (`include/zn/zmesh.h`:
36 bytes with uv and colour), the node tree walked in TypeScript (`plugins/3d/index.ts:296-326`); the PSP renderer sets the whole
state for every draw and lights per vertex with normals in the GE (`plugins/3d/native/render3d.psp.cpp:209-262`); the 3DS renderer
runs one vertex program with four lights and specular for every draw, about 80 instructions (`render3d.n3ds.v.pica`); the Vita
renderer has no normals on the GPU and **lights every vertex of every draw on the CPU** (`render3d.vita.cpp:297-339`), fogs on the
CPU and adds a second blended pass for the haze (`:344-382`), draws into a texture composed by the 2D path, without MSAA
(`:190`, `targets/vita/gxm_vita.cpp:266`), with linear RGBA8 textures and no mips; no renderer has frustum culling, index ranges,
shadows or texture compression. `examples/tokyo/src/city.ts` chooses the levels per tile in the interpreter.

The engine stays agnostic: everything below is a zinc:3d feature any large static scene uses (a city, a terrain, a level), not a
Tokyo path. The Tokyo-specific part is only the converter `examples/tokyo/tools/city-gltf.py` and the program.

### 3.1 The common core (all three consoles; do it first)

| # | Add | Gain | Files |
|---|---|---|---|
| C1 | **A static world asset: places, levels, batches of index ranges.** A cooked file (`.zworld`, or ZMS2) of places on a grid (cells in blocks in regions), each with its level batches; per batch the vertex range, the index range, the box and the `SPAN` groups (by cell, and by facing sector for upright faces); vertices in the target's own layout (C3). `city-gltf.py` writes it straight from the pack, keeping the pack's batches and spans as they are; `zinc assets build` gets a `"format": "zworld"` rule for glTF scenes whose nodes carry `extras.cell`/`level`. | removes the per-node walk and per-part calls; makes C2 possible | new `include/zn/zworld.h`, `src/assets/model.cpp`, `plugins/3d/index.ts` (`loadWorld`), `examples/tokyo/tools/city-gltf.py` |
| C2 | **Selection in native code**: `world.select(eye, view, proj, near, mid)` in the renderer, a port of `view::select`, `facing` and `arcs` (`TK/crates/tokyo-sim/src/view.rs:63-297`, about 230 lines, MIT) to C++; it fills the frame's draw list of ranges, and `world.draw()` issues it. The governor (`view.rs:299-328`, plus the Vita's GPU-wait rule `TK/vita/src/main.rs:752-785`) as a few lines in the same module. The program keeps its device table (budget, distances) and reads the counts. | the interpreter's 2 to 5 ms of `select()` every 2 to 4 frames becomes about 1 ms native every frame (Pocket's own is 4.4 ms on a PSP for the whole city); the far level everywhere; a third of the walls never sent | `plugins/3d/native/world.cpp`, `#include`d by `render3d.host.cpp` as every console renderer includes it (a console core links only the Render3D module, `targets/console/stubs.cpp:28-55`), `render3d.spec.ts`, `examples/tokyo/src/city.ts` (shrinks to the device table and the clock) |
| C3 | **Quantised vertex layouts per target**, decoded by the place's matrix: `s16` positions over the place's box (PSP, 3DS), `u16n` (Vita), RGB565 baked colour, sky share and sector bytes, no normals for faceted geometry | vertex fetch 3 to 4 × smaller (the GE is fetch-bound: 0.7 ms per 1,000 triangles sent, drawn or not); city memory 3 × smaller, so the near level fits | `render3d.{psp,n3ds,vita}.cpp` (`keep()`/`upload()`, vertex type per mesh), `include/zn/zworld.h` |
| C4 | **Cell streaming**: the near level as one record per cell, read by a thread into a fixed set of slots (40), retired beyond near + 96 m, reused only after the GPU finished; a cell not there yet is drawn at the mid level | the near level on the consoles without holding 134 MB | `plugins/3d/native/world.cpp` (slots), `targets/console` (a reader thread over the pack: `hal` threads and file reads) |
| C5 | **Height-grid shadows**: a port of `shadow::sweep` (`TK/crates/tokyo-sim/src/shadow.rs:19-81`, integer only) run on a low-priority thread when the light moved more than a threshold; output to the renderer's own consumer (C-PSP4, C-3DS3, C-Vita3) | the shadows that follow the clock | `plugins/3d/native/world.cpp`, `render3d.spec.ts` (`world.shadows(heights, w, h, step, unit)`) |
| C6 | **Face-group lighting**: a batch's sector picks one of 17 light colours computed per frame from the sun, sky and ground (`TK/crates/tokyo-sim/src/sky.rs:92-103`); the renderer applies it per draw (PSP ambient) or per vertex (3DS uniform array) | no per-vertex lighting cost; the same look as Pocket | `render3d.psp.cpp`, `render3d.n3ds.cpp`, `render3d.n3ds.v.pica` (a second program) |

### 3.2 PSP (ordered by gain)

| # | Add | Gain | Files |
|---|---|---|---|
| P1 | C1 + C2 + C3: ranges of resident buffers, `s16` positions, RGB565 colours, 8/12-byte vertices, native selection | the basis: today's 14,000 triangles at 1,800 m become the city to 12 km; the 42,000 budget is the GE's own (1.5 ms + 0.63 ms per 1,000 triangles) | `render3d.psp.cpp` (`keep()` line 65, `draw()` 209-262), `world.cpp` |
| P2 | **Cheap draws**: keep a `Last` state (texture, ambient, matrix, vertex pointer, vertex type) and write only what changed; issue a range as base + index address + primitive (`sceGuSendCommandi`), a full `sceGuDrawArray` now and then; passes in a fixed order (top, wall, solid, open) | 1,255 draws at a few words each instead of a full state block per draw | `render3d.psp.cpp:draw()` |
| P3 | **Two depth ranges** (`sceGuDepthRange(65535,16384)` near cells with near plane 3 m; `(16384,0)` the rest to 12 km) | a 16-bit depth buffer that holds a 12 km view | `render3d.psp.cpp:begin()` (line 164), driven by `world.draw()` |
| P4 | **CLUT8 pictures with day and night palettes** (`PsmT8`, swizzled, mips to 16 texels), the palette mixed by the hour in 64 steps (10 a frame at most); ground pictures keep to 128 colours and the upper half is the shadow (C5 sets bit 7) | the night and the shadows at no GE cost; pictures a quarter of RGBA8888's size, so 256² cell pictures (0.5 m) fit | `src/assets/texture.cpp` (a `psp-clut8-pair` encoding: median cut over the 6 channels of both colours, `TK/crates/tokyo-cook/src/handheld.rs:116-201`), `targets/psp` texture upload, `render3d.psp.cpp` |
| P5 | **Overlap CPU and GE**: choose the next frame's draws while the GE draws this one; wait (`sceGuSync`) only before writing the list; double the 3D list | the 9 ms of CPU hidden in the 28 ms of GE | `render3d.psp.cpp:begin()/end()` (the wait at line 157 moves) |
| P6 | Texture matrix for the ground (`GU_TEXTURE_MATRIX` from position): no uv in top vertices | 8 B ground vertices | `render3d.psp.cpp` |
| P7 | C4 streaming (reader thread, 40 slots of 126 KiB) and the PSP-2000 `MEMSIZE=1` | the near level | `world.cpp`, `targets/console/psp` |

### 3.3 Nintendo 3DS (ordered by gain)

| # | Add | Gain | Files |
|---|---|---|---|
| T1 | C1 + C2 + C3: 8/16/12-byte vertices (`GPU_SHORT`, `GPU_UNSIGNED_BYTE`), place matrix, ranges; native selection | the 18,000 budget becomes Pocket's 60,000 (mean 40,000) | `render3d.n3ds.cpp` (`keep()` 64-83, loaders 216-219, `render()` 206-301) |
| T2 | **Purpose-built vertex programs**: top, wall, solid, sky as Pocket's (each 28 to 46 lines: 4 `dp4`, a texcoord from position, `mova` into 17 lights), chosen per kind; every program writes all three texcoords | the vertex stage from about 80 instructions with four lights and specular to about 15 | new `plugins/3d/native/render3d.n3ds.{top,wall,solid}.v.pica`, `render3d.n3ds.cpp` (`C3D_BindProgram` per kind) |
| T3 | **Three combiner stages per kind**: ground `(light × shadow + lamps × night) × picture`; wall `light × tint × facade + night × windows`; solid primary × 2 | shadows, lamps and lit windows at no CPU cost | `render3d.n3ds.cpp` (`C3D_TexEnv*` per kind), `render3d.spec.ts` |
| T4 | C5 shadows written by the thread straight into a tiled 1,024² L8 texture on unit 2; lamps a 1,024² RGB565 texture on unit 1; both through one texcoord over the city | the 3DS's shadows and night | `world.cpp`, `render3d.n3ds.cpp` |
| T5 | **State hoisting**: lights, ambient and fog once a frame; the fog table rebuilt only when the planes change; texenv, blend, depth and cull only when they change; command buffer × 4 | CPU per draw (Pocket: 276 draws inside 9.7 ms with the selection) | `render3d.n3ds.cpp:render()` 220-294, `targets/n3ds/c3d_n3ds.cpp:168` |
| T6 | **ETC1 ground pictures in PICA order** with mips, RGB565 Morton facades | a sixth of RGBA8's bytes: 256² block and 128² cell pictures fit | `src/assets/texture.cpp` (an ETC1 encoder: vendor a proven one, `etcpak` or `rg_etc1`, per the libraries rule; the PICA reordering is ~30 lines), `targets/n3ds/c3d_n3ds.cpp:55,92-100` |
| T7 | Near plane 12 m with the eye 30 m clear, exponential fog table as Pocket's | a haze that uses all 128 steps | `examples/tokyo/src/constants.ts` (`NEAR_PLANE` 4 → 12, `CLEARANCE` 14 → 30), `render3d.n3ds.cpp:221-234` |
| T8 | C4 streaming from ROMFS by a worker on the other core | the near level within 64 MB | `world.cpp`, `targets/console/n3ds` |

### 3.4 PS Vita (ordered by gain)

| # | Add | Gain | Files |
|---|---|---|---|
| V1 | **Drop the CPU lighting and fog**: normals (`s8n`) and the light in the vertex program, haze per vertex in the vertex program and `lerp` in the fragment. Needs new programs compiled on a console (`targets/vita/gxpc/gxpc.c` takes more `kPrograms[]` entries: one console run for the whole set) | today every vertex of every draw is lit on the CPU (`render3d.vita.cpp:297-339`): at 158,000 triangles that alone is several frames of CPU; the haze pass (1.3 ms) goes | `targets/vita/shaders/` (top, wall, solid, sky, bright, blur, glow), `gxpc.c`, `render3d.vita.cpp` |
| V2 | C1 + C2 + C3: `u16n` positions over the place, one vertex stream, index ranges, programs bound once per kind; native selection; the governor with the GPU-wait rule (×0.985 when the frame waited > 6 ms, hold 2 s) | 222 draws at 4 µs; 200,000-triangle budget | `render3d.vita.cpp` (`upload()` 134-149, `open()` 83-85, `submit()` 257), `world.cpp` |
| V3 | C5 shadows: two `U16_RRRR` textures in CDRAM swapped 3 frames after a sweep; the compare in every scene fragment program with its own varying | the shadows that follow the clock, 1.1 ms | `render3d.vita.cpp`, the V1 programs |
| V4 | **4× MSAA into the display surface** and the parameter buffer at 32 MB; the 3D scene drawn in the display's scene before the 2D, not into a texture composed afterwards | the published picture; 3.75 ms saved against an off-screen target | `targets/vita/gxm_vita.cpp:239,266`, `render3d.vita.cpp:190-240` |
| V5 | **BC1/BC3 textures with mips** (swizzled, `UBC1_ABGR`/`UBC3_ABGR`) | ground 1,024² per block in 65 MB instead of 128² today; the pack no longer linked into the binary (read from the VPK) | `src/assets/texture.cpp` (vendor a BC encoder: `bc7enc`'s `rgbcx` or stb_dxt), `targets/vita/gxm_vita.cpp:110-117` |
| V6 | Night: window ramp per building (`late`, gain), lamps texture on the ground, the bloom chain at 240 × 136 from the displayed frame | night glow | the V1 programs, `render3d.vita.cpp` |
| V7 | **Traffic**: a `zinc:3d` dynamic mesh written each frame into a 2-slot ring with a prebuilt index buffer, one draw; the car simulation (`TK/crates/tokyo-sim/src/traffic.rs`, 185 lines) native or AOT | traffic | `render3d.vita.cpp` (a ring like the colour ring at `:36`), `world.cpp` or the program |
| V8 | The `vita60` content: run Pocket Tokyo's pipeline once (fetch, tiles, export, cook `vita60`) and convert it as `city-gltf.py` does `ipod60`; until then the Vita draws `ipod60`'s geometry with a longer near distance | the reference's triangles near the eye | `examples/tokyo/tools/city-gltf.py` (read the resident pack shape: `Vita` vertices, `GLVL`/`GTEX`, two blocks a region) |

## 4. AOT on the consoles

**Yes, and most of it is in place.** The AOT output is C++20 over `src/rt` with no OS dependency of its own, and the console
cores already build `src/rt`, `src/zbc` and `src/vm` as C++20 with psp-gcc, devkitARM and VitaSDK's gcc
(`targets/console/CMakeLists.txt:37-42`, `ZN_NO_MIMALLOC`, `ZN_NO_MMAP`, `-fwrapv -ffp-contract=off`). The task exists:
ZN-480 ("AOT builds for the PSP, Vita, 3DS and PS2 cores", size L, m-23); D141 kept AOT "as an option for speed".

How it fits: the generated file defines `Machine::exec` itself and calls each function's `native` (`src/aot/aot.cpp:474-478`); it is
linked instead of `src/vm/vm.cpp`; natives and plugins go through the same `nativeCall` registry as the interpreter
(`aot.cpp:284`), so the console's `targets/console/stubs.cpp` module list works unchanged. Zinc exceptions are a return status,
not C++ exceptions (`aot.cpp:131-146`), so `-fno-exceptions -fno-rtti` is fine.

| Step | Change | File |
|---|---|---|
| 1 | an embedded mode: no `main` under `ZN_AOT_EMBEDDED`; export the packed module and the natives table (`zn_aot_module`, `zn_aot_natives`) | `src/aot/aot.cpp` (~20 lines; `main` at 482-484) |
| 2 | `zinc --emit=cpp --profile <console> -o <dir>`: the units compiled from the same ZBC `zinc pack --profile` makes (f32 numbers on the PSP) | `src/main.cpp` (`emitCppParts`, `ZN_AOT_CPP_ONLY` at 813) |
| 3 | `tools/build-console-core --aot <dir>` (refused with `--player`); `tools/console-demos --aot` | the two tools |
| 4 | with `ZN_CONSOLE_AOT`: `zn_console_engine` without `vm.cpp`, the units with `-O2 -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -ffunction-sections -Wl,--gc-sections` and the console's CPU flags | `targets/console/CMakeLists.txt` |
| 5 | `runOne` decodes `zn_aot_module` and passes a setup hook that binds the natives (as `src/rt/program.cpp:53-59` does) to `runModuleHooked` | `targets/console/core_main.cpp:150-185` |
| 6 | a C stack limit on the consoles (`cStackLimit` knows only Apple and Linux; deep recursion would crash instead of trapping) | `src/rt/machine.cpp:81-92` |
| 7 | proof per ZN-480: fib, the library golden and a demo identical to the interpreter in PPSSPP, Vita3K, Azahar; `.text` sizes; Tokyo's frame time | `tests/t2/` |

Size: M (1 to 2 sessions) for whole-program AOT. A hybrid (hot functions compiled, the rest interpreted) is L: the interpreter's
`L_Call` ignores `callee->native` (`src/vm/vm.cpp:113-121,161-170`), exceptions do not cross an exec boundary (`vm.cpp:141-155`),
and the emitter replaces every body with a `Trap` (`aot.cpp:413-415`). Not needed unless code size forces it. Risks: `.text` size
on a 24 MB PSP (never measured), psp-gcc compile times, f32 differences emulator against hardware.

**What AOT does and does not buy for Tokyo.** It makes the program's own loops 3.6 to 12 times faster (D36 on the desktop), so the
flight, the clock and today's `select()` stop costing frames. It does not remove the structural costs of section 3: a JS call per
draw, float vertices, per-vertex lighting on the Vita's CPU, no ranges, no culling. Pocket's selection is native and still takes
4.4 ms on a PSP; the 1,255 draws must be issued by the renderer from a native list, whatever runs the program. So C1 and C2
(selection and drawing native in zinc:3d, the pattern of commit 259d78e6 that moved `transform()` there) come first; AOT is the
general fix for the rest of the program (flight, traffic, the UI guest's work) and follows.

## 5. Recommended order

| Step | What | Consoles | Size | Proof |
|---|---|---|---|---|
| 1 | C1 world asset from the `ipod60` pack (batches, spans, sectors, sky share kept), C3 vertex layouts per target | all | L | the pack's triangle counts per level come out of the asset (far 19,394, mid 157,839, near 359,868) |
| 2 | C2 native selection and drawing of ranges, with the governor; `city.ts` reduced to the device table | all | M | Mac: the same triangles and draws as Pocket's `view::select` for a logged eye (port its test) |
| 3 | P2 + P3 (PSP cheap draws, two depth ranges), T2 + T5 (3DS programs per kind, state hoisting), V1 + V4 (Vita programs on the GPU, one console run of `gxpc`; MSAA into the display, 32 MB parameter buffer) | per console | M each | budgets raised to 42,000 / 60,000 / 200,000; frame times in the emulators, then on hardware |
| 4 | C6 face-group lighting and C5 shadows with each console's consumer (P4 palettes, T3 + T4 combiners and L8 texture, V3 `U16` compare) | per console | M each | the shadows turn with the clock; a golden frame per console |
| 5 | C4 streaming of the near level (40 slots, reader thread) | PSP, 3DS | M | no frame waits for a read; cells arrive before they are near |
| 6 | Pictures: P4 CLUT8 pairs, T6 ETC1, V5 BC1/BC3 with mips, and the night (V6, T3) | per console | M | pack sizes within the consoles' memory with Pocket's picture sizes |
| 7 | ZN-480 AOT cores (section 4) | all | M | Tokyo's CPU a frame against Pocket's (PSP 9 ms, 3DS 9.7 ms city alone) |
| 8 | V7 traffic, V8 the `vita60` content (Pocket's pipeline run once) | Vita | M | 158,000 triangles, 222 draws, 0 late over the tour on a real Vita |

The backlog is frozen: these are lines for `backlog/later.md` (the coordinator adds them) or the content of an owner-asked task
for the Tokyo port. Every console number above is Pocket's, measured on hardware; Zinc's must be measured on the owner's consoles
before any claim of parity (`tools/console-run`, `ZINC_PROFILE=1`).
