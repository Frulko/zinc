# Pocket Tokyo per device (examples/tokyo, 2026-10-25)

`examples/tokyo` is one program on every device. What differs between devices lives in two places:

- The table of `examples/tokyo/src/devices.ts`: reaches, haze, triangle budget, how often the levels are chosen, night, sky dome, freeing models.
- The per-target asset rules of `examples/tokyo/zinc.json`: which levels and pictures a device's pack carries, and at what size.

This page gives each device's limits, the settings chosen and the frame times measured.

## The route

The city is Pocket Tokyo's published `ipod60` pack (177 MB, checked by SHA-256). `tools/city-world.py` turns it into a zinc:3d world
(`include/zn/zworld.h`), Pocket Tokyo's own model (`docs/reports/pocket3d-techniques.md`, steps 1 and 2):

- 769 cells: the pack's 768 of 128 m, and the Tokyo Tower.
- The far level of the whole city in one chunk: 19,394 triangles, out to 12 km.
- The mid level in one chunk per 512 m block: 157,839 triangles in all.
- The near level in one chunk per cell: 359,868 triangles in all.
- Each batch keeps its indices grouped by cell, and its walls (and the faceted solids) by 16 compass sectors, so a draw is an index range.
- Vertices are 20 bytes: `s16` position over the batch's box, `s16` uv, RGBA8 colour, `s8` normal.
- The ground pictures of the mid and far levels come in atlases of 2 × 2 blocks: 12 by day and 12 by night. A console holds 64 runtime
  pictures at once (`ZRT_DYN_IMAGES`); with one picture per block, 48 by day and 48 by night, the 3DS ran out and drew a white ground.
  The near level has its own ground pictures.

zinc:3d's `World` reads the chunks and chooses natively what each frame draws (`plugins/3d/native/render3d.host.cpp`, a port of Pocket
Tokyo's `view.rs`):

- The cells in the frustum.
- Each cell's level by distance, coarser only past the distance times 1.15. A cell whose level is not loaded shows a coarser one, else a
  finer one: there are no holes.
- Of its walls, the sectors that can face the eye.
- The governor: over the budget the reaches come in by 3% a frame; under 88% of it they go out by 0.8%.
- The chunks to read, the coarsest level and the nearest first, for the eye and the tour's next 2 and 4 seconds; and those to free.

The draw is a list of index ranges in batch order: the state changes only between batches. Every renderer (GL, software, PSP, 3DS, Vita)
draws a range of a mesh's indices. The program keeps the camera tour, the clock, the loading and the device table.

## What every device does

- **Loading.** The opening reads the chunks for the first view and the tour's next 8 seconds, behind a loading screen, 30 ms a frame.
- **Read-ahead.** Each frame reads what the selection asks for, within the device's milliseconds (`readMs`), at least one chunk.
- **Haze.** zinc:3d's `Fog` fades the city into the horizon colour of the sky.
- **Freeing.** On the PSP and the 3DS, a chunk nobody has wanted for 4 seconds is freed (never the far level).
- **Slots.** On the 3DS and the PSP the near level is streamed into 40 slots (64 on the Vita), as Pocket Tokyo's (`World.slots`, `defaults3D().slots`): the nearest cells
  take them, those 140 m away and more behind the eye counted 2.2 times farther; a loaded chunk gives its slot up only to one at most 1/1.25
  as far. A cell without a slot shows its mid level.

## Settings

| Device | Pack | Near / mid reach | Haze | Triangle budget | Sectors | Night | Sky |
|---|---|---|---|---|---|---|---|
| Mac (desktop) | all levels | 600 / 2000 m | 2500 to 5800 m | 400,000 | yes | yes | dome |
| PS Vita | 13.9 MB: mid + far, grounds 256² (128² a block); near in `app0:near.zpk` inside the .vpk (64 slots) | 600 / 1300 m | 1600 to 5800 m | 40,000 | yes | yes | dome |
| 3DS | 12.7 MB on the SD card (default.zpk): mid + far, grounds 512² and facades 1024 × 128 in ETC1 with mipmaps; near on the SD card (30.5 MB, 40 slots) | 600 / 2400 m | 1200 to 5800 m | 40,000 (Pocket's; 55,000 held a real Old 3DS XL at 20 fps) | yes | yes | one colour |
| PSP | 9.2 MB: mid + far, grounds 256² (128² a block) and facades 512 × 64 in CLUT8 with their night palettes, the heights for the shadows; the pack on the memory stick (`default.zpk` 9.2 MB, `near.zpk` 17.0 MB, 40 slots), not in the EBOOT | 600 / 1600 m | 1200 to 5800 m | 42,000 | yes | yes | one colour |
| Raspberry Pi 1 (`rpi1`) | not built yet | 300 / 900 m | 600 to 3000 m | 12,000 | yes | no | one colour |

The far level reaches the whole city on every device. The 3DS, the PSP and the Vita stream the near level from the card (the memory
stick, the .vpk's `app0:`) with one reader, `targets/console/sdpack.cpp`.

### Mac

- **Limits:** none that matter here. About 68,000 triangles at the tour's opening (the near level within 600 m), at 1.7 ms of render.

### PS Vita

- **Limit 1, memory:** 256 MB, and the pack is linked into the binary. A 36 MB pack, with 256² ground pictures and their night copies,
  ended in `std::bad_alloc` at start. The ground pictures are now 128².
- **Limit 2, the fragment program:** it only multiplies texture by colour, and its vertex program must not change (the GXP compiled on the
  console). So on the Vita the haze is computed per vertex on the CPU, and a textured draw gets the haze as a second, blended pass. That
  pass costs about 1.3 ms a frame. The haze starts at 1600 m so that only the far cells pay for it.
- **Limit 3, the lighting on the CPU:** the Vita renderer lights every vertex it draws on the CPU, so its time follows the triangles
  (about 0.35 ms per 1,000 in Vita3K). Pocket Tokyo's 158,000 triangles need the lighting in a vertex program (the next agents' Vita shaders).

### 3DS

- **Limit:** 64 MB on an original 3DS or 2DS for the code, the heap and the linear (GPU) heap. The 12.7 MB pack linked into the `.3dsx`
  left 24 MB of heap (libctru's split) for Tokyo's 33: the real Old 3DS XL froze on a black screen after `n3ds c3d: on`. Azahar gives a
  `.3dsx` 96 MB whatever the model, so it ran there. Now the default pack lives on the SD card beside `near.zpk` (`3ds/tokyo/default.zpk`,
  the `.3dsx` 1.8 MB), the linear heap is fixed at 22 MB and the heap gets the rest (38 MB); in Azahar as an Old 3DS the HAL holds the
  extra 32 MB back so the emulator fails where the console would. Old 3DS (Azahar, night tour, 900 frames): heap at most 34.2 of 38 MB,
  linear memory at least 5.6 of 22 MB free; work p50 4, p95 5 ms after the loading (30 fps held, 56,400 triangles, near level kept). The
  trade: the loading reads its 77 chunks from the card, 175 frames instead of 32.
- **Haze:** the PICA200 has a fog table (citro3d `FogLut`), filled per frame from the camera's planes. It is free.
- **Pocket Tokyo's PICA200 path** (`render3d.n3ds.cpp`, `worldMesh` and `worldDraw`; `docs/reports/pocket3d-techniques.md`):
  - Each batch is decoded at load into one of three vertex layouts, each with its own small vertex program (`render3d.n3ds.top.v.pica`,
    `wall`, `solid`, assembled by picasso into the same DVLB as the old program): 8 bytes for the ground and roofs (`s16` position, a grey;
    the uvs come from the position), 16 for textured walls (plus colour and `s16` uv), 12 for painted geometry. No normals and no float
    copy: the position is decoded from the batch's box by the model matrix.
  - The light: a face's sector of the compass (16 around, one up or down) is stored in its vertices, and the vertex program reads one of 17
    lights, computed once a frame from the scene's ambient and lights.
  - Three combiner stages: light × shadow, × the day's picture, then mixed into the night's picture by how far the night has come
    (`World.setNight` takes 0 to 1): the dusk is a smooth blend instead of a switch at 0.5.
  - Shadows: `World.shadows` hands the renderer the pack's height map (1024 × 768 at 4 m, `city/hmap.bin`, written by
    `city-world.py hmap`); tokyo-sim's sweep turns it into an 8-bit map of what the sun does not reach, swept again (24 rows a frame) when the
    sun has turned by a degree. The ground and the roofs read it as a third texture.
  - Pictures: the pack keeps the grounds and facades as ETC1 (an asset rule `"format": "etc1"`, encoded by basisu), and the 3DS uploads the
    blocks and their mipmaps as they are, in the PICA's tile order. Four times the ground's resolution for half the memory.

- **The near level from the SD card** (Pocket Tokyo reads 40 slots from its ROMFS pack):
  - `zinc.json` puts the near chunks and their ground pictures (`b*.near.png`, `b*.night.png`, 512² ETC1 with mipmaps on the 3DS) in an
    asset group, `near`. The linked pack stays the 12.7 MB of the mid and far levels; `tools/console-demos` writes the group as
    `3ds/tokyo/near.zpk` (30.5 MB) beside `3ds/tokyo.3dsx`.
  - The core opens every `.zpk` of the folder named as the `.3dsx` (`targets/console/sdpack.cpp`; the Homebrew Launcher gives the path,
    Azahar gives none: then `ZINC_SD_DIR`, which `console-demos` sets to `sdmc:/3ds/<name>/`). Only the index is read (`zn::zpk::Reader`
    over the index alone, `decode()` for each entry read from the file); an entry the linked pack has not is read from the card.
  - A reader thread on the other core, below the program's priority, reads ahead what the World asks for: `worldLoad` answers -2 while a
    chunk or one of its pictures is on its way (`zn_asset_ready`), and keeps a chunk's bytes until its pictures are there. A picture of the
    near level is freed with the last chunk that draws it.
  - Each chunk's pictures go to the GPU when it loads (`render3d.n3ds.cpp worldLoad`) instead of in the first frame that draws it: the
    first frame after the loading went from 48 ms to under 15.
  - The night pictures go to the GPU only once the dusk has begun (`World.setNight` above 0), 3 a frame, and the dark texture is drawn only
    for a chunk whose night picture is there: by day the 3DS's linear memory keeps them free (at least 17.8 MB free instead of 15.1).
  - The linked pack's chunks are read ahead too: an entry over 16 KB that a frame asks for goes to the reader thread on core 1 (the
    application's CPU time limit raised to 80% while it runs), at most 2 at a time; beyond them, or under 16 KB, the frame reads it itself.
    The 15 to 70 ms a frame took to read and convert a mid chunk are gone from the frames: 36 to 47 ms each on the other core (Azahar,
    Old 3DS mode), work max 12 ms after the loading instead of 15.

### The near level on the PSP and the Vita

- **One reader for the three consoles** (`targets/console/sdpack.cpp`): the 3DS's, with a thread layer per console. The PSP's reader runs
  at priority 36, below the program's 32 (one core: it reads during the vblank and GE waits); the Vita's on its two other cores (affinity
  0x60000, priority 0xB0). The folder: the `.3dsx`'s on the 3DS, the EBOOT's (the current directory; PPSSPP names it `umd0:/` in capitals,
  so the names are compared without case) on the PSP, `app0:` on the Vita.
- **Slots by measuring**: the PSP 40 (its heap stays at 15 to 15.7 MB with them), the Vita 64 (its memory is not the limit).
- **PSP, the pack on the memory stick:** `tools/console-demos` no longer links `default.zpk` into the EBOOT; it writes it beside
  `EBOOT.PBP` with `near.zpk`. The EBOOT went from 12.5 to 3.3 MB, and the runtime heap from 16 MB to 1 MB (an interpreted core keeps
  the program's objects in the C heap; the runtime's own peak is the `psp heap:` line's).
- **PSP CLUT8 for the near pictures:** the `{base}` placeholder of the `night` option (the name before its first dot) pairs
  `b12.near.png` with `b12.night.png`.
- **PSP-1000:** with the heap capped at 17,000 KB (`ZN_PSP_HEAP_KB=17000` at the core's build), 2,400 frames of the tour ran in PPSSPP
  without running out: the heap at most 15.8 MiB of 16.6, about 23 of the 24 MB a program gets with the EBOOT's 5.6 MiB image. It fits on
  paper, with 1 MB to spare; a real PSP-1000 is not tried.
- **Vita:** the runtime heap of an interpreted core is 16 MiB instead of 192 (`vita.cmake`): with 192, newlib's 224 MiB were full and the
  loading hung once the near level was there.
- **PSP shadows on their own thread:** the sweep's rows go into a bit mask of the cells in shade, on a thread at priority 44 that runs in
  the vblank and GE waits; the pictures are patched from the mask under a lock, 16 rows at a time for a new picture. The main thread's
  share went from 0.9 to 1.0 ms a render to 0.06 to 0.15 (3.3 to 3.8 ms of wall time on the thread).
- **The first frames are drawn behind the loading screen** (3 frames of select, read and render once the loading is done): their
  pictures, palettes and lists are made before the flight. The first frame after the loading took 26 to 62 ms.

### PSP

- **Limits:**
  - 24 to 52 MB of memory.
  - A 333 MHz CPU that runs the interpreter.
  - The GE: transform and lighting in hardware, and hardware fog (`sceGuFog`), which is free.
- **What helped:** the selection moved from the interpreter (18 ms every 4 frames) to native code (3.9 ms every frame), and the city
  became a few hundred index ranges of resident meshes instead of a scene of nodes.
- **Pocket Tokyo's GE path** (`render3d.psp.cpp`, `worldMesh` and `worldDraw`; `docs/reports/pocket3d-techniques.md` P1 to P3, P6):
  - Each batch is decoded at load into the GE's own vertices: 8 bytes (RGB565 colour, `s16` position) for the ground, roofs and painted
    geometry, 12 for walls (plus `u16` uvs). No normals and no float copy: the ground's uvs come from the position through the texture
    matrix, and the position from the batch's box through the model matrix, with the eye subtracted on the CPU.
  - No per-vertex lighting: the World splits each cell's walls into one range per compass sector (`Engine::worldSectorDraws`), and a
    range's light is its sector's, computed once a frame from the scene's ambient and lights (the software renderer's shading of a wall)
    and set as the GE's ambient colour.
  - A range costs a few words of display list: the vertex address, matrix and picture only when the batch changes, the ambient when the
    sector does, then the index address and the primitive (a full `sceGuDrawArray` every 24th, which also lets the GE read on).
  - Two depth ranges: the cells within 400 m (`Engine::worldSplit`) draw first into 65535..16384 with a far plane just past them, the
    rest into 16384..0 from 240 m to the far plane. At 2 km a depth step is 1 m instead of 15.
  - The selection lists the ranges in draw order (kind, chunk, batch, index) instead of sorting them.
  - The memory the vertices no longer take (72 bytes a vertex before, the float mesh and the GE's copy) leaves room for the night: the
    PSP pack now carries the night pictures (8.4 MB instead of 7.4) and the device table turns the night on.
  - Pictures in CLUT8 (`P4`): the asset rule `"format": "clut8", "night": "{stem}.night.png"` quantises a picture and its night together
    (a median cut over each texel's day and night colours, `src/assets/console_tex.cpp`) into one set of indices and two palettes. The GE reads
    a palette that is the two mixed by `World.setNight` in 64 steps, so the dusk is a smooth blend and the night pictures are no longer in the
    pack. A byte a texel: the grounds went from 128² to 256² (4 m a texel, the heights' own grid) and the facades from 256 × 32 to 512 × 64,
    and the pictures still take half as much: 0.85 MB against 1.64 MB.
  - Shadows (`P4`, `C5`): `World.shadows` hands the renderer the pack's heights (1024 × 768 at 4 m), and the 3DS's sweep (now
    `ShadowSweep` in `render3d.host.cpp`, shared by both) runs 12 rows a frame when the sun has turned by a degree. Each row sets the top bit of
    the ground pictures' texels over it where something stands between them and the sun; a ground picture keeps to 128 colours
    (`"colors": 128`) and the upper half of its palette is the lower half under the ambient light only. The shade's darkness is in the
    palettes, so it follows the light every frame without patching texels; by moonlight there is nothing to see and no sweep.
  - `World.clearShadows()` turns them off (the Shadows button of the panel): the heights are freed, the shaded half of the palettes becomes the
    lit one. No picture or map is freed while a frame may draw it (the 3DS frees its map after the GPU's frame).

### Raspberry Pi

- The Pi 1's settings are in the table, but not built or measured: cross-platform work comes last.
- A Pi 3 or 4 running Linux reports `linux` and takes the Mac's settings. That is probably too heavy for it (`backlog/later.md`).

## Frame times

All console numbers are emulators (2026-10-25, on the M1 Pro Mac), not hardware:

- **PPSSPP headless:** its own emulated clock.
- **Azahar:** emulated clock.
- **Vita3K:** the Mac's clock, so its times depend on the Mac's load. With other trees building (load average 50 to 110) the same Vita
  build measured 19.6 ms of render, against 10.7 ms with a load of about 12: only the quiet runs are given.

The owner's hardware runs of examples/3d/orbit show a real PSP is slower than PPSSPP: 25 ms against 15 ms.

The figures are the program's own, from its `tokyo: … 300 frames after the loading` line: the work of a frame (the tour, the selection,
the reads, the render), without the wait for the screen. "Before" is the glTF tiles of the first port (a scene of nodes, levels chosen
in the interpreter); "after" is the world. Pocket Tokyo's figures are its own, on hardware (`docs/reports/pocket3d-techniques.md`).

| Device | Before (glTF tiles) | After (World) | Pocket Tokyo |
|---|---|---|---|
| Mac | 115,000 triangles; work p50 1.0, p95 2.0 ms; render 1.7 ms | 68,400 triangles, 433 draws; work p50 1.0, p95 1.0 ms; select 0.1, render 1.7 ms | — |
| PS Vita (Vita3K) | budget 40,000; work p50 13, p95 14 ms; render 11.9 ms | 30,200 triangles, 303 draws (mid reach 1300 m); work p50 13, p95 14 ms; select 1.9, render 10.7 ms; 58.6 fps. With the near level (64 slots): 30,300 triangles, 304 draws; work p50 12, p95 23, max 47 ms (12, 14, 45 without); render 11.8 ms; 58.4 fps; heap at most 52 MB | 158,200 triangles, 222 draws, 60 fps |
| 3DS (Azahar) | budget 18,000; work p50 7, p95 15 ms; select 2.1, render 5.8 ms | 55,500 triangles, 383 draws (budget 60,000, reaches at 0.87); work p50 8, p95 8 ms; select 5.1, render 2.0 ms; 30 fps held. With Pocket's PICA200 path: the same 55,500 triangles and 383 draws, with shadows, ETC1 pictures and the dusk blend; work p50 5, p95 5 ms; select 3.6 to 3.9, render 0.5 to 0.8 ms; 30 fps held. With the near level from the SD card: 54,500 triangles, 385 draws (reaches at 0.81), 5 to 17 cells drawn at the near level out of the 40 in their slots; work p50 5, p95 6, max 15 ms (48 before, the first frame); read 0.1, select 4.0, render 0.4 ms. In Old 3DS mode, with the night pictures sent at dusk, the linked pack read ahead and the first frames drawn behind the loading screen: 54,400 triangles, 382 draws; work p50 4, p95 5, max 12 ms (5, 6, 15 before); read 0.1, select 3.1, render 0.4 ms | 40,000 triangles, 276 draws, 30 fps |
| PSP (PPSSPP) | budget 14,000; work p50 8, p95 28 ms; select 5.1, render 6.6 ms | 37,100 triangles, 328 draws (budget 40,000); work p50 9, p95 9 ms; select 3.9, render 3.2 ms; 30 fps held. With Pocket's GE path: 38,900 triangles, 1,451 draws (budget 42,000, reaches at 1.00); work p50 7, p95 8 ms; select 4.3, render 1.3 ms (1.0 building the list); 30 fps held, 1,500 frames. With CLUT8 pictures and shadows (15:30): the same 38,900 triangles and 1,451 draws; work p50 7, p95 9 ms (6 and 7 before); select 3.4, render 2.2 ms (1.2 before), of which 0.9 the sweep and its patch; 30 fps held. Shadows off: work p50 6, p95 7, render 1.1 ms. With the near level from the memory stick (40 slots), the shadows on their thread and the first frames drawn behind the loading screen: 38,100 triangles, 1,358 draws (reaches at 0.89); work p50 6, p95 7, max 19 ms (7, 8, 42 before; the max is a 13 ms read at the 5th frame); select 3.4, render 1.2 ms; heap 15.0 to 15.6 MB in use (29.2 to 29.7 before) | 37,600 triangles, 1,255 draws, 30 fps |

The work no longer has spikes from reads: a chunk is read whole, natively, and the far level of the whole city is resident. The max of
each run (26 to 62 ms) is the first frame after the loading.

Loading screens: PSP 94 chunks in 20 frames, 3DS 109 in 33, Vita 48 in 3, Mac 102 in 9. The 3DS with its near level: 79 chunks in 62
frames (Azahar's clock; 109 in 67 for the same build without the card's pack, whose near chunks counted as reads that failed); in Old 3DS
mode with the linked pack read ahead, 84 in 48 (79 in 64 before). The PSP with its near level: 65 chunks in 193 frames (94 in 42 before),
PPSSPP's memory-stick timing; the Vita 48 in 15.

The 3DS's memory, the same build with and without `near.zpk` on the card (Azahar, the tour's opening and 20 seconds of it, sampled at each
chunk asked for): the heap at most 30.5 MB without, 32.6 MB with; linear memory (the GPU's) at least 20.4 MB free without, 15.5 MB with
(the night pictures now go to the GPU with their chunk, by day too). The card's entries read in 13 to 14 ms each in Azahar (a chunk of
25 to 80 KB, a picture of 171 KB), all of them ahead of the frames (none waited for).

Two fixes the measurements found:

- **The 3DS drew a white ground** with a ground picture per block: 96 pictures by day and night, over the 64 a console holds. The
  atlases of 2 × 2 blocks fixed it.
- **The Vita lit three times the vertices it drew.** Its renderer lights and hazes on the CPU every vertex between the lowest and the
  highest index of a range, and a cell's vertices were spread over the batch. `city-world.py` now numbers each cell's vertices in a run of
  their own, in the order the indices use them: the Vita's render went from 19.6 to 10.7 ms for the same 30,200 triangles.

What is left (the next agents' per-console work):

- **Vita, 158,000 triangles:** lighting and haze in a vertex program instead of the CPU (`render3d.vita.cpp`).
- **PSP:** the GE's time on hardware (Pocket's 1.5 ms + 0.63 ms per
  1,000 triangles: about 26 ms for 38,900). Memory (PPSSPP, `psp heap:` line): 29.2 MB of heap in use with the shadows (27.7 without; 29.1
  before CLUT8), 16 MB of it the runtime's, beside a 12.5 MB EBOOT whose pack is 9.2 MB. That is 42 MB: a PSP-2000, 3000 or Go (52 MB with
  the EBOOT's `MEMSIZE=1`) holds it. Since the near level: 15.0 to 15.7 MB of heap and a 3.3 MB EBOOT, the packs on the stick: a PSP-1000
  holds it on paper (see above), not tried on one. CLUT8 mipmaps are not done.
- **3DS:** the GPU's time on hardware is not known: Azahar does not time the PICA200. A real Old 3DS XL drew 55,000 triangles at about 20 fps (work p50 16, p95 33 ms; select 12.3, read 5.0 ms: about 3 times Azahar's clock); the budget is now Pocket's 40,000.
  The SD card's timing on hardware is not measured.
- **The selection** costs 4.3 ms a frame on the PSP (with a range per sector) and 3.6 to 3.9 on the 3DS (5.1 before; Azahar's clock), against
  Pocket's 4.4 ms on a PSP. On the 3DS, Azahar's clock: the cells 1.8 ms (the facing sectors were 1.3 ms more with `atan2f`, now a
  polynomial whose result is checked against the exact one near a sector's edge), the ranges 0.8, the chunks to read 0.8.
- **The real consoles are not measured.**

## How to measure again

```sh
python3 -I examples/tokyo/tools/city-world.py fetch && python3 -I examples/tokyo/tools/city-world.py build ~/.zinc/cache/tokyo/ipod60.pack examples/tokyo/assets/city
zinc pack --profile psp examples/tokyo -o /tmp/t.zapp     # then tools/build-console-core psp --embed program.zbc resources.bin packs/default.zpk --frames 500 --env ZINC_PROFILE=1
tools/console-run psp build/.../EBOOT.PBP                  # the 3DS only through lockf -k /tmp/zinc-azahar.lock
# the 3DS's near level: packs/near.zpk of the same .zapp into Azahar's sdmc/3ds/tokyo/ (~/Library/Application Support/Azahar/sdmc), and
# --env ZINC_SD_DIR=sdmc:/3ds/tokyo/ (Azahar gives the program no path); the core prints `zinc: sd packs: ...` with ZINC_PROFILE=1
```

The program prints the `tokyo:` lines on every device. `ZINC_TOKYO_DEVICE=<name>` tries a device's settings on the Mac, and
`ZINC_TOKYO_BUDGET=<n>` tries another triangle budget.
