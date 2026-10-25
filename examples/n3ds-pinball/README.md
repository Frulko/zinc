# Nova Patrol DS (n3ds-pinball)

The space pinball of [`examples/pinball`](../pinball) made for the Nintendo 3DS's two screens. The table stands across both: its upper
half (the top lanes, the pop bumpers, the wormhole, the drop targets, the spinner, the top of the ramp) on the top screen, in stereoscopic
3D, and its lower half (the slingshots, the flippers, the plunger) on the touch screen; the ball rolls from one screen to the other. The
rules, the table and the physics are the desktop game's, unchanged: missions, ranks, multiball, the ball saver, the tilt, 1 to 4 players and
the high scores.

```sh
zinc run --simulate n3ds examples/n3ds-pinball                                 # on a desktop: the second window is the bottom screen
tools/build-console-core n3ds --aot examples/n3ds-pinball --title "Nova Patrol DS 0.2.6" -B build/n3ds-pinball-native  # compiled .3dsx
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
  at loading in software, with a progress bar.
- 3D: stars occupy two planes behind the playfield; ramp floors, rails and wire tracks follow their height. Bumper caps,
  a ball riding the ramp, score popups and the message band come out of the screen.
- Use the **compiled program** (`--aot`) for the console. An embedded `.zbc` runs through the interpreter;
  combining that path with 960 Hz Box2D calls caused the previous slow version.
- The 3DS profile uses 12 image-based sparks, no soft halos or trails. Contacts use Box2D with the 240 Hz DS base clock, adaptive travel subdivision and CCD.

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
The 0.2.2 playable build kept profiling off, avoiding repeated diagnostic SD writes. CPU costs and refresh FPS on physical
hardware still need measuring; emulator timing alone does not establish 60 FPS on a console.


## Buffered hardware capture (0.2.3)

The delivered 0.2.3 build enables `ZINC_PROFILE=defer,ZINC_FRAME_CAPTURE=1`. Hold START+SELECT to exit
and save the latest minute to `sdmc:/zinc-frames.csv`; it does not write the CSV during gameplay.
Run `tools/n3ds-frame-report /Volumes/DS/zinc-frames.csv --source hardware --gate` after remounting the SD.
[Capture fields and interpretation](../../docs/targets/n3ds-performance.md) explain the complete-refresh
measurements and the 60 Hz gate. The FPS label moves six pixels right for readability.

0.2.3 flushes only the modified GPU buffers and the command list (citro3d previously also flushed the whole
linear heap), caches fixed lamp contours, skips kept-window hashing, and packs Box2D state/events into one
native call. Gravity, CCD, contact subdivisions and the 240 Hz DS base clock are unchanged.


## Physical trace correction (0.2.4)

The owner's 0.2.3 Old3DS capture measured 41.11 FPS, 1639 missed refreshes and physics p99 47.263 ms
(max 96.940 ms), with no software fallback or texture upload. GPU queue time stayed below 6.425 ms.
The global relative-travel bound was subdividing even a lone fast ball far from moving mechanisms.

0.2.4 lets Box2D CCD handle free-flight board contacts and retains travel guards for nearby same-layer
ball pairs and nearby slow balls struck by a moving flipper/plunger. Slow-ball guards remain important:
Box2D activates CCD based on the ball's own motion. The fixed base clock, gravity, materials, speed cap
and catch-up clock remain unchanged. Dead tangent-edge updates are removed; Box2D owns flipper geometry.
The capture adds `physics_steps`, the number of native Box2D world-step calls per complete refresh.
Close with START+SELECT to save and compare actual hardware results; emulator success alone does not
establish 60 FPS on the console.


## Impact feedback correction (0.2.5)

Powered bumper/slingshot kicks, scores, target drops, flashes, recoil and sparks now use Box2D's solved
`ContactKind.Hit` events. Begin-contact events can have zero pre-solve approach speed and are unsuitable
for triggering those reactions, particularly after CCD free-flight optimization. Travel guards, the 240 Hz
base clock and the optimized GPU path remain unchanged.

`tests/run --only pinball_feedback` drives real bumper, slingshot and target hits through the application
on the interpreter and QuickJS. `tools/feedback.ts` can also be compiled as a short native proof; the main
playable build has no scripted input or frame limit. The existing deferred capture remains enabled.


## Stereo table depth (0.2.6)

Stars sit behind the playfield on two depth planes; the ramp and wire track use height-dependent stereo
disparity, so their slope has depth. The upper screen caches nine views during loading (mono plus left/right
views at four strengths); the lower screen caches one. The slider selects the nearest of five depth levels.
Changing depth during play does not repaint or upload the board. Compared with the previous single upper
view, this uses about 4 MiB more GPU texture memory and 3 MiB more CPU image storage at native resolution.

`tests/run --only n3ds_pinball_stereo` checks projection, unchanged mono images, ramp disparity and cache reuse.
Physics, impact feedback and the shared GPU renderer are unchanged. Physical stereo comfort and refresh timing
need the owner's console session; emulator measurements are recorded in the pinball report.
