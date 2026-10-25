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

## Settings

| Device | Pack | Near / mid reach | Haze | Triangle budget | Sectors | Night | Sky |
|---|---|---|---|---|---|---|---|
| Mac (desktop) | all levels | 600 / 2000 m | 2500 to 5800 m | 400,000 | yes | yes | dome |
| PS Vita | 13.9 MB: mid + far, grounds 256² (128² a block) | — / 1300 m | 1600 to 5800 m | 40,000 | yes | yes | dome |
| 3DS | 12.9 MB: mid + far, grounds 256², facades 256² | — / 2400 m | 1200 to 5800 m | 60,000 | yes | yes | one colour |
| PSP | 7.4 MB: mid + far, grounds 128² (64² a block), facades 256², no night | — / 1600 m | 1200 to 5800 m | 40,000 | yes | no | one colour |
| Raspberry Pi 1 (`rpi1`) | not built yet | 300 / 900 m | 600 to 3000 m | 12,000 | yes | no | one colour |

The far level reaches the whole city on every device. The consoles leave the near level out of their packs: they have no room for it in
memory without streaming (`backlog/later.md`).

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

- **Limit:** about 64 MB of memory on an original 3DS for the program and its embedded pack.
- **Haze:** the PICA200 has a fog table (citro3d `FogLut`), filled per frame from the camera's planes. It is free.

### PSP

- **Limits:**
  - 24 to 52 MB of memory.
  - A 333 MHz CPU that runs the interpreter.
  - The GE: transform and lighting in hardware, and hardware fog (`sceGuFog`), which is free.
- **What helped:** the selection moved from the interpreter (18 ms every 4 frames) to native code (3.9 ms every frame), and the city
  became a few hundred index ranges of resident meshes instead of a scene of nodes.
- **What is left:** each range is a full draw, with the whole state set again (`render3d.psp.cpp`); Pocket's PSP draws 1,255 ranges a
  frame with only the ambient colour changed between them.

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
| PS Vita (Vita3K) | budget 40,000; work p50 13, p95 14 ms; render 11.9 ms | 30,200 triangles, 303 draws (mid reach 1300 m); work p50 13, p95 14 ms; select 1.9, render 10.7 ms; 58.6 fps | 158,200 triangles, 222 draws, 60 fps |
| 3DS (Azahar) | budget 18,000; work p50 7, p95 15 ms; select 2.1, render 5.8 ms | 55,500 triangles, 383 draws (budget 60,000, reaches at 0.87); work p50 8, p95 8 ms; select 5.1, render 2.0 ms; 30 fps held | 40,000 triangles, 276 draws, 30 fps |
| PSP (PPSSPP) | budget 14,000; work p50 8, p95 28 ms; select 5.1, render 6.6 ms | 37,100 triangles, 328 draws (budget 40,000); work p50 9, p95 9 ms; select 3.9, render 3.2 ms; 30 fps held | 37,600 triangles, 1,255 draws, 30 fps |

The work no longer has spikes from reads: a chunk is read whole, natively, and the far level of the whole city is resident. The max of
each run (26 to 62 ms) is the first frame after the loading.

Loading screens: PSP 94 chunks in 20 frames, 3DS 109 in 33, Vita 48 in 3, Mac 102 in 9.

Two fixes the measurements found:

- **The 3DS drew a white ground** with a ground picture per block: 96 pictures by day and night, over the 64 a console holds. The
  atlases of 2 × 2 blocks fixed it.
- **The Vita lit three times the vertices it drew.** Its renderer lights and hazes on the CPU every vertex between the lowest and the
  highest index of a range, and a cell's vertices were spread over the batch. `city-world.py` now numbers each cell's vertices in a run of
  their own, in the order the indices use them: the Vita's render went from 19.6 to 10.7 ms for the same 30,200 triangles.

What is left (the next agents' per-console work):

- **Vita, 158,000 triangles:** lighting and haze in a vertex program instead of the CPU (`render3d.vita.cpp`), then the near level.
- **PSP:** cheap draws (only the ambient colour between ranges), two depth ranges, vertices of 8 to 12 bytes; the near level needs
  streaming.
- **3DS:** per-surface vertex programs and combiners; the near level needs streaming.
- **The selection** costs 3.9 ms a frame on the PSP and 5.1 on the 3DS, against Pocket's 4.4 ms on a PSP.
- **The real consoles are not measured.**

## How to measure again

```sh
python3 -I examples/tokyo/tools/city-world.py fetch && python3 -I examples/tokyo/tools/city-world.py build ~/.zinc/cache/tokyo/ipod60.pack examples/tokyo/assets/city
zinc pack --profile psp examples/tokyo -o /tmp/t.zapp     # then tools/build-console-core psp --embed program.zbc resources.bin packs/default.zpk --frames 500 --env ZINC_PROFILE=1
tools/console-run psp build/.../EBOOT.PBP                  # the 3DS only through lockf -k /tmp/zinc-azahar.lock
```

The program prints the `tokyo:` lines on every device. `ZINC_TOKYO_DEVICE=<name>` tries a device's settings on the Mac, and
`ZINC_TOKYO_BUDGET=<n>` tries another triangle budget.
