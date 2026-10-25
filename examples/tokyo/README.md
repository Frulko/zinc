# Pocket Tokyo on Zinc

A flight over the Shiba district of Tokyo, around Tokyo Tower: the city of [Pocket Tokyo](https://github.com/pocket-nexus/pocket-tokyo)
(MIT), drawn by `zinc:3d`. The same program runs on a Mac, a Raspberry Pi, a PSP, a PS Vita and a 3DS. What differs between them is one
table (`src/devices.ts`) and the per-target asset rules of `zinc.json`. `docs/reports/tokyo-per-device.md` gives the settings and the
frame times measured.

## Make the city

The city data is not in git: 177 MB of PLATEAU and OpenStreetMap data. Fetch Pocket Tokyo's published pack once. The script checks its
SHA-256. Then turn it into a zinc:3d world (`include/zn/zworld.h`): the 769 cells of 128 m, the far level of the whole city in one chunk,
the mid level a chunk per 512 m block, the near level a chunk per cell, each batch's indices grouped by cell and by wall sector.

```sh
python3 -I examples/tokyo/tools/city-world.py fetch          # ~/.zinc/cache/tokyo/ipod60.pack
python3 -I examples/tokyo/tools/city-world.py build ~/.zinc/cache/tokyo/ipod60.pack examples/tokyo/assets/city
```

`build` takes about a minute. It writes:

- `city.zworld`: the index of cells and chunks.
- `far.zwc`, `b<x>_<z>.mid.zwc`, `c<n>.near.zwc`, `landmark0.*.zwc` (Tokyo Tower): the chunks.
- The ground pictures, by day and by night, and the facade pictures.
- `heights.bin`.
- `city.txt`: the view, the tour, the heights' grid, the credits.

The asset build copies the chunks and sizes the pictures per target. At run time zinc:3d's `World` chooses natively what a frame draws:
the cells in view, each at the level of its distance, the wall sectors facing the eye, within the device's triangle budget.

## Run

```sh
zinc run examples/tokyo                                    # the Mac
ZINC_TOKYO_DEVICE=psp zinc run examples/tokyo              # the PSP's settings, on the Mac
tools/console-demos examples/tokyo tokyo --title "Pocket Tokyo" psp vita n3ds
```

At start, a loading screen reads the tiles within reach of the first view and of the tour ahead. The flight then reads ahead of the eye, and
the far edge fades into a haze in the colour of the sky, so tiles come out of the haze instead of popping in.

Each device prints one `tokyo:` line with its frame times, 300 frames after the loading.

Useful variables:

- `ZINC_TOKYO_HOUR=21` starts at night.
- `ZINC_TOKYO_BUDGET=<triangles>` tries another triangle budget.
- `ZINC_TOKYO_TAP=<frame>:<x>:<y>` touches the panel at (x, y), that many frames after the loading (the consoles' scripted runs, whose
  input scripts hold buttons but not the stylus).
- `ZINC_TOKYO_STEREO=1` starts with the stereo picture on (3DS).

## The control panel

The same panel of 320 × 240 on every device, with three pages:

- **Places:** a map of Shiba with the eye on it, and Tokyo Tower, Zojo-ji, Shiba Park, Hamamatsucho, Shiodome, Takeshiba pier and
  Shinbashi (Pocket Tokyo's coordinates and viewpoints, `src/places.ts`). Touch one and the eye flies there over the roofs, then stays in
  free flight.
- **Settings:** the time of day (day, dusk, night) and whether the clock runs, the haze (off, near, normal, far), the triangle budget
  (half the device's, the device's, twice), the shadows (3DS), the readout, and the stereo picture (3DS; mono by default, as Pocket runs).
- **Controls:** the guided tour or free flight, and the buttons.

On the 3DS the panel is the touch screen, drawn again only when something it shows has changed. On the other devices Select (Tab on a
computer) opens it over the city; the d-pad moves between its buttons, A presses one, B or Select closes it, and the mouse clicks it.

## Controls

| Pad | Keyboard | What it does |
|---|---|---|
| Stick or d-pad | arrows | fly ahead and turn (leaves the tour) |
| Right stick | | look around (Vita) |
| Triangle / Cross | V / Space | look up / down |
| R / L | E / Q | climb / descend |
| Square | C | faster |
| Circle | X | turn the clock (the sun, then the night) |
| Start | Return | the tour on or off |
| Select | Tab | the control panel (on the 3DS, whose panel is the touch screen: the readout) |

## Layout

| File | What it holds |
|---|---|
| `src/main.ts` | the frame |
| `src/city.ts` | the world, the reading of the chunks it asks for, the heights, the night pictures |
| `src/flight.ts` | the tour (Catmull-Rom over the original's keys) and the free flight |
| `src/sky.ts` | the sun and moon, the light, the sky dome |
| `src/devices.ts` | the per-device table |
| `src/input.ts` | the pad |
| `src/hud.ts` | the readout |
| `src/panel.ts` | the control panel (a `zinc:stage` node) |
| `src/settings.ts` | what the panel changes, and its actions |
| `src/places.ts` | the points of interest |
| `tools/city-world.py` | pack to a zinc:3d world |

## Credits and licences

- 3D city model, roof photos, bridges, street furniture: Project PLATEAU, MLIT Japan (PLATEAU terms, compatible with CC BY 4.0).
- Elevation: Geospatial Information Authority of Japan (GSI), DEM tiles.
- Road network and railways: © OpenStreetMap contributors (ODbL 1.0).
- The cooked city, the tour and the sky: Pocket Tokyo, pocket-nexus (MIT), and its Procedural Tokyo source (MIT).

The program shows the credit line in a corner of the screen. Keep it there in any copy you share.
