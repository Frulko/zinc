# Nova Patrol DS (n3ds-pinball)

The space pinball of [`examples/pinball`](../pinball) made for the Nintendo 3DS's two screens. The table stands across both: its upper
half (the top lanes, the pop bumpers, the wormhole, the drop targets, the spinner, the top of the ramp) on the top screen, in stereoscopic
3D, and its lower half (the slingshots, the flippers, the plunger) on the touch screen; the ball rolls from one screen to the other. The
rules, the table and the physics are the desktop game's, unchanged: missions, ranks, multiball, the ball saver, the tilt, 1 to 4 players and
the high scores.

```sh
zinc run --simulate n3ds examples/n3ds-pinball                                 # on a desktop: the second window is the bottom screen
ZINC_DEMOS=~/Documents tools/console-demos examples/n3ds-pinball n3ds-pinball --title "Nova Patrol DS" n3ds   # the .3dsx
```

## Controls

| | 3DS | keyboard (desktop) |
|---|---|---|
| left flipper | L, d-pad left, the left half of the touch screen | Q, left arrow |
| right flipper | R, A, the right half of the touch screen | E, Space / Z |
| plunger (hold, release) | B, d-pad down, the stylus on the shooter lane or the PULL strip | X, down arrow |
| bump the table | X, d-pad up | C, up arrow |
| start, add a player before the first launch, pause | START | Enter |
| pause | SELECT | Tab |
| initials of a high score | L / R change the letter, B moves on | |

## How it is made

| File | Role |
|---|---|
| `src/main.ts` | the frame loop: the rules and the physics on the left eye's frames, the top screen for each eye, the bottom screen's window once per pair |
| `src/art.ts` | each screen's table painted once into an image by the desktop game's own painter, seen from straight above, with the ramps and the apron |
| `src/half.ts` | one screen's half: the image, then the lamps, targets, spinner, bumper caps, flippers, plunger, balls, sparks and popups |
| `src/panels.ts` | the side panels (score, ball, rank, mission; tilt meter, plunger strip) and the message band |
| `src/input.ts`, `src/constants.ts` | the buttons and the stylus into the desktop game's `Controls`; sizes, depths and colours |

The ball is Kenney's `ballGrey.png` (Puzzle Pack, CC0), in `assets/kenney`.

## On the 3DS

- Every frame is replayed on the PICA200: images, rectangles, text and shapes that keep their geometry (the lamps, the bumper caps on whole
  pixels, the flippers at 11 angles), each rasterized once into the shape atlas. The art, which uses gradients and strokes, is painted once
  at the start in software (about 0.6 s).
- 3D: the bumper caps, a ball riding the ramp (by its height), the score popups and the message band come out of the screen.
- Measured in Azahar (`ZINC_PROFILE=1`, a scripted game, 3D on): the program's own time per refresh (both eyes, the physics at 960 Hz and the
  bottom screen) p50 8 ms, p99 12 ms; no frame falls back to the software raster.
- `--engine quickjs` does not run it (nor `examples/pinball`, which imports `zinc:platform`'s `TOUCH`).

## Shared physics update

The desktop game now uses Box2D through `examples/pinball-kit`. Rebuild the console core with the current
`tools/build-console-core` to include its Physics2D module; older cores cannot run this version. The new
Box2D registration is checked on the development Mac, not yet on the physical 3DS. Earlier frame-time
numbers above describe the previous solver and need remeasurement.
