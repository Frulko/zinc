# Zinc Next on the consoles: breakout on PSP, PS Vita, PS2 and 3DS (ZN-753)

`examples/breakout` runs unchanged on the four console cores (`docs/targets/handhelds.md`), in their emulators, driven by each console's pad.
Since 2026-10-17 it wears Kenney's Puzzle Pack (CC0, `examples/breakout/assets/kenney`): bricks, paddle, ball and a starry background drawn as
sprites by `src/skin.ts`; the rules are untouched, and `src/render.ts` keeps the original look (the prototype's frames, `breakout-mods`).

## What each console shows

Every picture below is the emulator's own output, not the HAL's frame: PPSSPP's screenshot (PSP), PCSX2's save-state screenshot of the GS
output (PS2), and the framebuffer the display scans out, read back through the console's own call (`sceDisplayGetFrameBuf` on the Vita, the
3DS buffer shown since the last swap). Vita3K and Azahar have no screenshot a script can ask for (a key in their window), and window captures
need the Screen Recording permission.

The console hello (`next/targets/console/hello`), PSP, Vita, PS2 (PAL BIOS: 640x512, the 448-row frame centred) and 3DS:

![hello on the four consoles](../img/consoles/hello.png)

breakout's pad session (`next/tests/golden/breakout/pad.input`: start, serve, move left and right, break bricks, lose a life, serve again), at
frames 300, 600 and 900:

PSP, 480x272 (PPSSPPHeadless 1.20.4, software renderer):
![breakout on the PSP](../img/consoles/psp-breakout.png)

PS Vita, the program at 480x272 shown doubled on the 960x544 screen (`zinc.json` `targets.vita`; Vita3K):
![breakout on the Vita](../img/consoles/vita-breakout.png)

PS2, 640x448 in a PAL 640x512 picture (PCSX2 2.8.2, the owner's BIOS):
![breakout on the PS2](../img/consoles/ps2-breakout.png)

Nintendo 3DS top screen, 400x240 (Azahar 2126.2):
![breakout on the 3DS](../img/consoles/n3ds-breakout.png)

The last frame of the session has the same hash on the console as `zinc run --interp` with the console's profile, size and script
(`tests/golden/breakout/pad.hashes`): PSP, Vita and 3DS byte for byte; the PS2 ends on the same game (score, lives, bricks, paddle), its pixels
within one or two colour steps (no pixel differs by more than 3%): the EE's FPU is not IEEE (it rounds toward zero, has no denormals), which the
raster's blends feel. Its own hash is the golden's fourth column.

## Frame times

`ZINC_PROFILE=1` built into the core, 900 frames of the session, in milliseconds. *work* is the program and the draw list (input, game, paint,
diff); *present* is the software raster of the damaged rows and the copy to the console's framebuffer. Clocks: the emulated clock on PPSSPP
(333 MHz), PCSX2 and Azahar, so these are console times as far as the emulator models the CPU's speed (PPSSPP and Azahar estimate cycles, they
are not cycle-exact); Vita3K runs the ARM code on the host and its clock is the host's, so its numbers are the Mac's, not a Vita's.

| Console | Screen | work p50 / p99 / max | present p50 / p99 / max | 60 fps? |
|---|---|---|---|---|
| PSP (PPSSPP, 333 MHz) | 480x272 | 1.16 / 1.22 / 1.90 | 0.00 / 6.42 / 19.67 | yes; a full redraw (a new wall, the title) takes one frame over |
| PS2 (PCSX2, EE 294 MHz) | 640x448 | 1.75 / 1.81 / 3.07 | 0.79 / 17.64 / 44.02 | no at a full redraw (one to three frames), yes in play; PAL is 50 Hz |
| 3DS (Azahar, old 3DS 268 MHz) | 400x240 | 0.53 / 0.60 / 1.01 | 0.00 / 3.27 / 16.15 | yes |
| Vita (Vita3K, host clock) | 480x272 x2 | 0.13 / 0.62 / 11.90 | not printed (Vita3K drops lines) | yes on the Mac; unmeasured on a Vita |
| Vita (Vita3K, host clock) | 960x544 | 0.36 / 4.83 / 9.56 | | |

In play only the rows that change are rastered (the ball, the paddle, a brick): the p50 of *present* is under a millisecond everywhere. The
p99 is the frames that redraw everything (the title, the wall of a new level): 320,000 pixels on the PS2 through one EE core and a texture
upload. The GE, GXM and PICA replays (later tasks) take that off the CPU.

PPSSPP's GPU backend does not change these numbers: the core writes its pixels to VRAM itself and the backend only shows them, so the
"software and GPU modes" of PPSSPP give the same frame and the same times; the run above uses `--graphics=software`.

## What each port needed

- **All**: a built-in pad session (`tools/build-console-core --input`, the `pad`/`padup` lines of a `ZINC_INPUT` script, held on top of the
  real pad) and environment (`--env ZINC_PROFILE=1 ZINC_FRAMEHASH=last ZINC_DETERMINISTIC=1`); the analog stick (circle pad) as the d-pad; the
  text screen for a program that ends with nothing drawn; `tools/console-demos` for the copies a person plays (no frame budget, a Vita title id
  per demo).
- **PSP**: nothing beyond the above; the screenshot is cropped to 480 columns (the VRAM stride is 512).
- **Vita**: a surface smaller than the screen is shown scaled by a whole factor and centred (breakout at 480x272 doubled: its 8x8 text is
  readable); the ARM clock raised to 444 MHz; the shot read back from `sceDisplayGetFrameBuf`. Vita3K does not show newlib's stdout and drops
  repeated lines.
- **PS2**: the frame centred and the screen cleared around it (a PAL BIOS gives 640x512: the 64 rows under a 448-row frame showed old video
  memory); `hal_env` reads the environment; a test build keeps its last frame on the screen after `zinc:exit` so PCSX2's save state holds it;
  the DualShock 2 set to analog mode for its stick. The owner's black screen was the one-line text program: it drew nothing.
- **3DS**: the top screen is double-buffered and the HAL wrote only the damaged rows into the buffer being drawn, so each buffer missed the
  other frame's changes (a moving object left a ghost every other frame); each buffer now takes every row changed since it was last shown.

## Kenney skin

`examples/breakout/assets/kenney`: eleven PNGs of the Puzzle Pack 1.1 (<https://kenney.nl/assets/puzzle-pack-1>) and its `License.txt` (CC0).
The bricks keep their size (64x32 sprites drawn at the rules' 44x10 on the PSP), the ball sprite is drawn 2 px larger than its 5 px hitbox, the
paddle 2 px taller. No sound: the console cores have no audio yet, and `zinc:audio` is a plugin the console cores do not load (Kenney's
"Interface Sounds" go in when they do). The prototype's frozen breakout frame is no longer compared (`manifest.json` skip row, the owner's
choice); `breakout-mods` still draws `render.ts` and is compared.

## Files for the owner

`~/Documents/psp/breakout/EBOOT.PBP`, `~/Documents/vita/breakout.vpk` (title "Breakout", ZINC00002), `~/Documents/ps2/breakout.elf`,
`~/Documents/3ds/breakout.3dsx`, and the hello beside them (`zinc-hello`, ZINC00001). Controls: the d-pad or the left stick (circle pad) move
the paddle, Cross (A on the 3DS) or START starts and serves. Rebuild them with `tools/console-demos ../examples/breakout breakout --title
Breakout --id ZINC00002`.

## Hardware demos: every part of each console (ZN-759)

`examples/hardware-psp`, `hardware-vita`, `hardware-ps2` and `hardware-n3ds` show each part of the console live, one screen each, with Kenney's
Input Prompts and Puzzle Pack (CC0, each project's `assets/kenney`); START and SELECT move between the screens, and a line in orange says what
the console (or its emulator) does not give. The parts are zinc APIs every target has (`docs/targets/handhelds.md`, "Hardware"): zinc:gfx's
gamepad 0, touch points and windows, zinc:audio, zinc:storage and zinc:hardware, so the same screens run on a desktop
(`zinc run --simulate psp examples/hardware-psp`). The pictures below are the emulators' own (as for breakout), from a pad session built into
the core (`tools/build-console-core --input`): each shot is the last frame of a session that goes to that screen and presses its buttons.

### PSP (PPSSPPHeadless 1.20.4)

Buttons (LEFT, CROSS and R held), the analog nub, the sound (sceAudio at 44.1 kHz, the samples of the last tone), the screen (40 sprites at
59.9 fps), the system (battery and mains from PPSSPP, the Wi-Fi switch, the clock, a counter saved with zinc:storage):

![the PSP hardware demo](../img/consoles/psp-hardware.png)

| Part | Live | Note |
|---|---|---|
| D-pad, CROSS CIRCLE SQUARE TRIANGLE, L, R, START, SELECT | yes, each with its note | gamepad 0 in W3C order |
| Analog nub | yes (left stick axes; it also drives the d-pad buttons) | no second stick on a PSP: said on screen |
| Sound | yes: zinc:audio's mixer at 44100 Hz on a 1024-frame channel | PPSSPPHeadless plays no sound; PPSSPPSDL does |
| Screen | 480x272 at 60 fps with 40 sprites: work 2.8 ms, present 11.2 ms (p50, emulated 333 MHz) | |
| Battery, clock | `scePowerGetBatteryLifePercent`, mains, charging; `gettimeofday` (UTC) | PPSSPP reports 100 %, on the mains |
| Wi-Fi | the WLAN switch (`sceWlanGetSwitchState`): on or off | a PSP joins no network here |
| Saving | zinc:storage in the game's folder | PPSSPPHeadless runs from `umd0:` |
| Vibration, touch, motion, microphone | none on a PSP: said on screen | |

Controls in PPSSPP: its own keyboard or gamepad mapping (Settings, Controls); the nub is a gamepad's left stick there.
