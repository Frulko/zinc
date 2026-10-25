# Meadow Run 3D (n3ds-platformer)

The platformer of [`examples/platformer`](../platformer) made for the Nintendo 3DS's two screens. The top screen plays the level in
stereoscopic 3D: the far hills and clouds sink behind the screen, the coins and the messages come out of it. The bottom screen holds the
lives, the coins, the score and the time, and the whole level as a map with the hero, the critters, the coins, the flag and the part the
top screen shows; holding the stylus on the map moves the top screen's camera there to look ahead. The rules, the level, the art and the
sounds are the platformer's, unchanged (its `src/world.ts`, `assets/`).

```sh
zinc run --simulate n3ds examples/n3ds-platformer                              # on a desktop: the second window is the bottom screen
ZINC_DEMOS=~/Documents tools/console-demos examples/n3ds-platformer n3ds-platformer --title "Meadow Run 3D" n3ds   # the .3dsx
```

## Controls

| | 3DS | keyboard (desktop) |
|---|---|---|
| move | d-pad, circle pad | arrows |
| jump (hold for higher) | A, B | Space / Z, X |
| run | Y, X | V, C |
| start, pause | START, a tap on the bottom screen (title, end) | Enter |
| look around the level | the stylus held on the map | the mouse on the second window |

## How it is made

| File | Role |
|---|---|
| `src/main.ts` | the frame loop: fixed steps of 1/60 s on the left eye's frames, the camera (or the stylus's look), the top screen for each eye |
| `src/top.ts` | the level as the platformer draws it, each layer shifted for the eye by its depth; the title and the end messages |
| `src/bottom.ts` | the bottom screen: the header, the map (the Collisions layer painted once into an image), the look-ahead, the progress bar |
| `src/input.ts`, `src/constants.ts` | the 3DS's buttons into the platformer's `Controls`; colours, sizes, depths |

## On the 3DS

- Tiles, atlas frames, rectangles and the pixel font: every frame is the PICA200's.
- Measured in Azahar (`ZINC_PROFILE=1`, the platformer's scripted run to the flag, 3D on): the program's own time per refresh (both eyes and
  the bottom screen) p50 7 ms, p99 9 ms; no frame falls back to the software raster.
