# Nova Patrol DS (n3ds-pinball)

The space pinball of [`examples/pinball`](../pinball) made for the Nintendo 3DS's two screens. The table stands across both: its upper
half (the top lanes, the pop bumpers, the wormhole, the drop targets, the spinner, the top of the ramp) on the top screen, in stereoscopic
3D, and its lower half (the slingshots, the flippers, the plunger) on the touch screen; the ball rolls from one screen to the other. The
rules, the table and the physics are the desktop game's, unchanged: missions, ranks, multiball, the ball saver, the tilt, 1 to 4 players and
the high scores.

```sh
zinc run --simulate n3ds examples/n3ds-pinball                                 # on a desktop: the second window is the bottom screen
tools/build-console-core n3ds --aot examples/n3ds-pinball --title "Nova Patrol DS 0.2.2" -B build/n3ds-pinball-native  # compiled .3dsx
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

The ball and spark sprites are Kenney's `ballGrey.png` and `particleSmallStar.png` (Puzzle Pack 1.1, CC0), in
`assets/kenney`. `assets/bumper-cap.png` is the Zinc Tidal Lock cap texture, with the same Kenney CC0 star;
its editable source is `examples/pinball3d/tools/tidal_lock_art.py`. The textured caps, their recoil and the
new navy score panels belong to this dual-screen renderer; desktop-only overlays are not imported.

## On the 3DS

- Every frame is replayed on the PICA200: images, rectangles, text and shapes that keep their geometry (the lamps, the bumper caps on whole
  pixels, the flippers at 11 angles), each rasterized once into the shape atlas. The art, which uses gradients and strokes, is painted once
  at the start in software (about 0.6 s).
- 3D: the bumper caps, a ball riding the ramp (by its height), the score popups and the message band come out of the screen.
- Use the **compiled program** (`--aot`) for the console. An embedded `.zbc` runs through the interpreter;
  combining that path with 960 Hz Box2D calls caused the previous slow version.
- The 3DS profile uses 12 image-based sparks, no soft halos or trails. Contacts still use Box2D at the same
  fixed rate and retain adaptive travel subdivision; this does not reduce physics accuracy to gain speed.

## Shared physics update

The desktop game now uses Box2D through `examples/pinball-kit`. Rebuild the console core with the current
`tools/build-console-core` to include its Physics2D module; older cores cannot run this version. The 0.2 build is compiled to C++ and includes the native Box2D module. Unchanged ball and mechanism state
is no longer resent through the native bridge on every substep. A held flipper is stopped once, explicitly.
The compiled 3DS binary and visible assets are checked in Azahar; physical-console timing still needs the
owner's play session. Measurements and the regression checks are in `docs/reports/zinc-next-pinball-physics.md`.

The release build command above has no frame limit, scripted inputs or profiling environment. For a measured
session, use a separate build directory and add `--frames 360 --input tests/data/n3ds-demos/pinball.input
--env ZINC_PROFILE=1`, then `lockf -k /tmp/zinc-azahar.lock tools/console-run n3ds <file.3dsx>`.

## Stereo timing regression check

`tools/multiball.ts` imports the real application, serves three balls, checks positions/speed and compares
gameplay time with elapsed time after warm-up. `tests/run --only n3ds_pinball_multiball` exercises it headless.
For the real 3DS HAL in Azahar, compile this entry with `--aot`, `--frames 3600`, `--env ZINC_PROFILE=1` and
`--env ZINC_3D_SLIDER=1`, then run it under `/tmp/zinc-azahar.lock`. Repeat with slider 0 for the flat case.
A fixed 1/60-second delta per eye is incorrect: stereo draws two eye callbacks per refresh. Live 3DS builds
now use elapsed time; deterministic tests can still request their fixed virtual clock. New 3DS hardware also
requests libctru's supported higher CPU clock and L2 cache; Old 3DS hardware keeps its existing mode.


## Physical FPS follow-up (0.2.2)

The bottom-left panel displays refresh FPS, counted once per eye pair, rather than counting eye callbacks as full frames.
The DS game now requests a 240 Hz base physics clock; desktop retains 960 Hz. Both use the same Box2D adapter,
travel-limited adaptive steps and continuous collision detection. This reduces complete adapter scans and native bridge calls;
fast contacts can still request more than 240 solver steps per second. Timing/interpolation use the selected base step.

The 3DS build disables the runtime's extra 8 ms callback cap: citro3d already synchronizes display output, and the
software HAL waits for vblank. Profiling also reports `n3ds replay: ... GPU, ... software surfaces` (texture/atlas failures included)
and separates `n3ds-pinball physics` from total program cost. Use `--env ZINC_PROFILE=1` in a separate measured build.
The playable build keeps profiling off, avoiding repeated diagnostic SD writes. CPU costs and refresh FPS on physical
hardware still need measuring; emulator timing alone does not establish 60 FPS on a console.
