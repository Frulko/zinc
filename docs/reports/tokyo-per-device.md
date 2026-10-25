# Pocket Tokyo per device (examples/tokyo, 2026-10-25)

`examples/tokyo` is one program on every device. What differs between devices lives in two places:

- The table of `examples/tokyo/src/devices.ts`: reaches, haze, triangle budget, how often the levels are chosen, night, sky dome, freeing models.
- The per-target asset rules of `examples/tokyo/zinc.json`: which levels and pictures a device's pack carries, and at what size.

This page gives each device's limits, the settings chosen and the frame times measured.

## The route

The city is Pocket Tokyo's published `ipod60` pack (177 MB, checked by SHA-256). `tools/city-gltf.py` turns it into standard glTF:

- One GLB per 256 m tile and level: near, mid and far (192 tiles).
- The Tokyo Tower at three levels.
- The ground pictures by day and by night (lamps), and the facade pictures by day and by night (lit windows).
- A height map and an index in plain text (`city.txt`).

Zinc's asset build imports the files like any project's glTF: gltfpack, then `.zmesh`, then textures resized per target. Two engine additions
were needed:

- An asset rule's `targets` options. A rule takes options for one target only, and `"skip": true` leaves a file out of that target's packs.
- `zinc pack --profile <console>` packs that console's assets, not the Mac's.

## What every device does

- **Loading.** The opening reads every tile within reach of the first view and of the tour's next 8 seconds. It does this behind a loading
  screen, in slices of 30 ms a frame, so the screen keeps drawing.
- **Read-ahead.** Every 8 frames the flight reads one model the eye will want in 4 seconds: on the tour, its path; in free flight, straight on.
  A tile is there before it comes into view.
- **Haze.** zinc:3d's new `Fog` fades the city into the horizon colour of the sky. The haze ends at 95% of the device's reach, so tiles and
  level changes come out of it instead of popping in. The sky dome is left out of the haze (`material.fog = false`).
- **Choice of level.** At most one model is read in a frame. Until it is, a tile shows a coarser level it already has.

## Settings

| Device | Pack | Near / mid / far reach | Haze from | Triangle budget | Levels chosen every | Night | Sky | Models freed |
|---|---|---|---|---|---|---|---|---|
| Mac (desktop) | 334 MB: all levels, ground 1024² near | 700 / 2200 / 6000 m | 2500 m | 250,000 | frame | yes | dome | no |
| PS Vita | 17.6 MB: mid + far, ground 128² | — / 1400 / 3500 m | 1600 m | 40,000 | 2 frames | yes | dome | no |
| 3DS | 16.6 MB: mid + far, ground 128², facades 256² | — / 700 / 2000 m | 500 m | 18,000 | 3 frames | yes | one colour | after 4 s out of reach |
| PSP | 11.1 MB: mid + far, ground 64², facades 256², no night pictures | — / 600 / 1800 m | 400 m | 14,000 | 4 frames | no | one colour | after 4 s out of reach |
| Raspberry Pi 1 (`rpi1`) | not built yet | — / 600 / 1800 m | 300 m | 8,000 | 3 frames | no | one colour | no |

### Mac

- **Limits:** none that matter here. About 115,000 triangles in view, at 1.7 ms of render.

### PS Vita

- **Limit 1, memory:** 256 MB, and the pack is linked into the binary. A 36 MB pack, with 256² ground pictures and their night copies,
  ended in `std::bad_alloc` at start. The ground pictures are now 128².
- **Limit 2, the fragment program:** it only multiplies texture by colour, and its vertex program must not change (the GXP compiled on the
  console). So on the Vita the haze is computed per vertex on the CPU, and a textured draw gets the haze as a second, blended pass. That
  pass costs about 1.3 ms a frame. The haze starts at 1600 m so that only the far tiles pay for it.

### 3DS

- **Limit:** about 64 MB of memory on an original 3DS for the program and its embedded pack.
- **Haze:** the PICA200 has a fog table (citro3d `FogLut`), filled per frame from the camera's planes. It is free.

### PSP

- **Limits:**
  - 24 to 52 MB of memory.
  - A 333 MHz CPU that runs the interpreter.
  - The GE: transform and lighting in hardware, and hardware fog (`sceGuFog`), which is free.
- **What helped:**
  - The choice of levels runs every 4 frames (about 18 ms each time).
  - Only the drawn tiles are in the scene.
  - zinc:3d keeps the matrices of nodes that did not move: before, each node cost about 0.5 ms a frame.

### Raspberry Pi

- The Pi 1's settings are in the table, but not built or measured: cross-platform work comes last.
- A Pi 3 or 4 running Linux reports `linux` and takes the Mac's settings. That is probably too heavy for it (`backlog/later.md`).

## Frame times

All console numbers are emulators on the Intel Mac:

- **PPSSPP headless:** its own emulated clock.
- **Azahar:** emulated clock.
- **Vita3K:** the Mac's clock, so its times depend on the Mac's load.

None of these is the hardware. The owner's hardware runs of examples/3d/orbit show a real PSP is slower than PPSSPP: 25 ms against 15 ms.

The figures are the program's own, from its `tokyo: … 300 frames after the loading` line, and the time is the work of a frame, without the
wait for the screen. A frame that reads a model goes over budget; those frames make the max.

| Device | Before (first port, no haze, all levels chosen every frame) | After | Frame rate |
|---|---|---|---|
| Mac, windowed, Retina GPU | work p50 1.55 ms, p99 46 ms (reads) | work p50 1.0 ms, p95 2.0 ms, max 95 ms; render 1.7 ms | 60 fps (vsync) |
| PS Vita (Vita3K) | work p50 10.7 ms, p99 32 ms; 58.6 fps over 300 frames | work p50 13 ms, p95 14 ms, max 32 ms; render 11.9 ms | 60 fps after the loading (54.4 over 500 frames with the loading) |
| 3DS (Azahar) | work p50 12.7 ms, p99 283 ms | work p50 7 ms, p95 15 ms, max 100 ms; select 2.1, render 5.8 ms | 30 fps target held; reads drop frames |
| PSP (PPSSPP) | work p50 168 ms (block models, all nodes in the scene); then 29 ms with tiles; p99 243 ms | work p50 8 ms, p95 28 ms, max 218 ms; select 5.1, render 6.6 ms | 30 fps target held between reads |

Loading screens:

| Device | Models read | Frames |
|---|---|---|
| PSP | 116 | 83 |
| 3DS | 134 | 88 |
| Vita | 214 | 39 |
| Mac | 235 | 32 |

What is left:

- **Model reads, fixed.** A tile's mid model is about 50 KB, and `zinc:assets` `readBytes` makes one host call per byte: a read cost about
  200 ms on the PSP and up to 100 ms on the 3DS. zinc:3d's `loadModel` now has the renderer read the file in one call
  (`R.assetOpen`, from the pack or the assets directory) and build the meshes from its own copy; the interpreter reads only the header.
  On PPSSPP the loading went from 83 to 62 frames, the read-ahead from 2.0 to 0.8 ms a frame, and no frame of the tour stalls on a read any
  more. The one slow frame left is the first choice of levels after the loading (181 ms, once).
- **The real consoles are not measured.**

## How to measure again

```sh
python3 -I examples/tokyo/tools/city-gltf.py fetch && python3 -I examples/tokyo/tools/city-gltf.py build ~/.zinc/cache/tokyo/ipod60.pack examples/tokyo/assets/city
zinc pack --profile psp examples/tokyo -o /tmp/t.zapp     # then tools/build-console-core psp --embed program.zbc resources.bin packs/default.zpk --frames 500 --env ZINC_PROFILE=1
tools/console-run psp build/.../EBOOT.PBP                  # the 3DS only through lockf -k /tmp/zinc-azahar.lock
```

The program prints the `tokyo:` lines on every device. `ZINC_TOKYO_DEVICE=<name>` tries a device's settings on the Mac, and
`ZINC_TOKYO_BUDGET=<n>` tries another triangle budget.
