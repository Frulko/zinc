# Pocket Tokyo on Zinc

A flight over the Shiba district of Tokyo, around Tokyo Tower: the city of [Pocket Tokyo](https://github.com/pocket-nexus/pocket-tokyo)
(MIT), drawn by `zinc:3d`. The same program runs on a Mac, a Raspberry Pi, a PSP, a PS Vita and a 3DS. What differs between them is one
table (`src/devices.ts`) and the per-target asset rules of `zinc.json`. `docs/reports/tokyo-per-device.md` gives the settings and the
frame times measured.

## Make the city

The city data is not in git: 177 MB of PLATEAU and OpenStreetMap data. Fetch Pocket Tokyo's published pack once. The script checks its
SHA-256. Then turn it into glTF files, one per 256 m tile and level of detail:

```sh
python3 -I examples/tokyo/tools/city-gltf.py fetch          # ~/.zinc/cache/tokyo/ipod60.pack
python3 -I examples/tokyo/tools/city-gltf.py build ~/.zinc/cache/tokyo/ipod60.pack examples/tokyo/assets/city
```

`build` takes about a minute. It writes:

- `t<x>_<z>.{near,mid,far}.glb`: the tiles.
- `landmark0.*.glb`: Tokyo Tower.
- The ground pictures, by day and by night.
- The facade pictures.
- `heights.bin`.
- `city.txt`: the index the program reads.

Zinc's asset build then imports the files: gltfpack, `.zmesh`, and textures sized per target.

## Run

```sh
zinc run examples/tokyo                                    # the Mac
ZINC_TOKYO_DEVICE=psp zinc run examples/tokyo              # the PSP's settings, on the Mac
tools/console-demos examples/tokyo tokyo --title "Pocket Tokyo" psp vita n3ds
```

Useful variables:

- `ZINC_TOKYO_HOUR=21` starts at night.
- `ZINC_TOKYO_BUDGET=<triangles>` tries another triangle budget.

## Controls

| Pad | Keyboard | What it does |
|---|---|---|
| Stick or d-pad | arrows | fly ahead and turn (leaves the tour) |
| Right stick | | look around (Vita) |
| Triangle / Cross | Y / A | look up / down |
| R / L | R / L | climb / descend |
| Square | X | faster |
| Circle | B | turn the clock (the sun, then the night) |
| Start | Start | the tour on or off |
| Select | Select | the readout (fps, ms, triangles, device, hour) |

## Layout

| File | What it holds |
|---|---|
| `src/main.ts` | the frame |
| `src/city.ts` | the tiles, the choice of level per tile within the triangle budget, the loading, the night pictures |
| `src/flight.ts` | the tour (Catmull-Rom over the original's keys) and the free flight |
| `src/sky.ts` | the sun and moon, the light, the sky dome |
| `src/devices.ts` | the per-device table |
| `src/input.ts` | the pad |
| `src/hud.ts` | the readout |
| `tools/city-gltf.py` | pack to glTF |

## Credits and licences

- 3D city model, roof photos, bridges, street furniture: Project PLATEAU, MLIT Japan (PLATEAU terms, compatible with CC BY 4.0).
- Elevation: Geospatial Information Authority of Japan (GSI), DEM tiles.
- Road network and railways: © OpenStreetMap contributors (ODbL 1.0).
- The cooked city, the tour and the sky: Pocket Tokyo, pocket-nexus (MIT), and its Procedural Tokyo source (MIT).

The program shows the credit line in a corner of the screen. Keep it there in any copy you share.
