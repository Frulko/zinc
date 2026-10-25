# Starfall (n3ds-starfall)

A game made for the Nintendo 3DS's two screens and its stylus. Stars fall from the night sky of the top screen, in stereoscopic 3D, down
through the touch screen. Draw a line with the stylus under a star: it throws the star back up, out of the screen and out of the sky, and
the star takes its place in the constellation. Fill the constellation (the Plough, Cassiopeia, Orion, the Swan) for the next level, where
the stars fall faster and more meteors come. Let the meteors through: one that hits a line breaks it and costs a life, as does a star that
falls off the bottom. Two lines at a time, each throws one star and lasts four seconds. The title screen plays a demo game.

```sh
zinc run --simulate n3ds examples/n3ds-starfall                                # on a desktop: the second window is the touch screen
ZINC_DEMOS=~/Documents tools/console-demos examples/n3ds-starfall n3ds-starfall --title "Starfall" n3ds   # the .3dsx
(cd examples/n3ds-starfall && zinc test)                                       # the rules
```

## Controls

| | 3DS | desktop |
|---|---|---|
| draw a line | the stylus: press, drag, lift | the mouse on the second window |
| start | a tap on the touch screen, START | a click, Enter |
| pause | START | Enter |

## How it is made

| File | Role |
|---|---|
| `src/main.ts` | the frame loop: fixed steps of 1/60 s on the left eye's frames, the demo's autopilot, the touch screen's window |
| `src/world.ts` | the rules without drawing: the field (320 x 480, the two screens one above the other), stars, meteors, lines, the constellations |
| `src/top.ts` | the sky: the far stars behind the screen, the constellation, the falling and rising stars, lives and level |
| `src/bottom.ts` | the touch screen: what comes down, the lines, the line being drawn, the score; the title |
| `src/sound.ts`, `src/constants.ts` | the sounds on the world's events; colours, sizes, depths |
| `tests/world.test.ts` | a star on a line is caught, a meteor on a line costs a life, no lines loses, the autopilot fills a constellation |

Assets: Kenney's Puzzle Pack (the star sparkle, the meteor) and Digital Audio (three effects), CC0, copied unchanged into `assets/kenney`
(`SOURCE.txt`, the licences).

## On the 3DS

- Rectangles, discs on whole pixels, two images and the pixel font: every frame is the PICA200's. The two backdrops (gradients) are
  painted once into images.
- 3D: the far stars sink behind the screen, the constellation a little less, a star thrown up comes out of it.
- Measured in Azahar (`ZINC_PROFILE=1`, the demo game, 3D on): the program's own time per refresh (both eyes and the touch screen) p50 2 ms,
  p99 3 ms; no frame falls back to the software raster.
