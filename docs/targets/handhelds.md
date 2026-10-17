# Consoles: PSP, PS Vita, PS2 and 3DS

Zinc Next runs a program on a console through a **console core**: the interpreter, the runtime, the graphics host (software raster) and a small
HAL per console, built once with the console's SDK (`next/targets/console`). The program is the `.zbc` that `zinc pack` writes, either linked into
the core or read beside it. Profiles: `--profile psp` (f32 numbers, 480x272), `vita` (960x544), `ps2` (f32, 640x448), `n3ds` (400x240 top screen).
Decision and plan: `docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md`; tasks ZN-453 to ZN-457, ZN-753.

## Build and run

```sh
cd next
zinc pack --profile psp ../examples/breakout -o /tmp/b.zapp && tar -xf /tmp/b.zapp -C /tmp program.zbc resources.bin
tools/build-console-core psp --embed /tmp/program.zbc /tmp/resources.bin [--frames 600]   # -> build/console-psp/EBOOT.PBP
tools/console-run psp build/console-psp/EBOOT.PBP [--timeout 60] [--shot frame.png]      # prints the program's lines, exits with its status
tools/console-demos ../examples/breakout breakout --title Breakout --id ZINC00002          # the four consoles, no frame budget, copied to ~/Documents/<console>
```

`tools/console-demos` builds what a person plays: no `--frames` (the program runs until the console quits it), one Vita title id per demo (two
demos with the same id replace each other in Vita3K), and copies `psp/<name>/EBOOT.PBP`, `vita/<name>.vpk`, `ps2/<name>.elf` and `3ds/<name>.3dsx`
into `$ZINC_DEMOS` (default `~/Documents`), the folders the emulators' game lists show. `targets/console/hello` is the console hello (text and a
moving square). `--input script` builds a pad session into a core (the `pad`/`padup` lines of a `ZINC_INPUT` script, held on top of the real pad)
and `--env NAME=VALUE` its environment (`ZINC_PROFILE=1` prints the frame times at exit, `ZINC_FRAMEHASH=last` the last frame's hash, which matches
`zinc run --interp` with the same profile, size and script).

| Console | SDK (`zinc toolchain install <id>`) | Core | Runner (`tools/console-run`) |
|---|---|---|---|
| `psp` | pspdev v20261001, GCC 15.2.0 (`$PSPDEV` wins) | `EBOOT.PBP` (PRX), `targets/psp/hal_psp.cpp` | PPSSPPHeadless 1.20.4, built once from the pinned sources; `--window`: PPSSPPSDL.app |
| `vita` | VitaSDK sdk-snapshot-20261015, GCC 15.2.0 (`$VITASDK`) | `zinc.vpk` (title ZINC00001), `targets/vita/hal_vita.cpp` | Vita3K (build 4189 pinned; `/Applications/Vita3K.app` first), SDL frontend |
| `ps2` | ps2dev v2.0.0, EE GCC 15.2.0 (`$PS2DEV`) | `zinc-core` (ELF), `targets/ps2/hal_ps2.cpp` (the prototype's) | PCSX2 with your BIOS when installed, else Play! 0.72 (no BIOS); `--emu play` forces it |
| `n3ds` | devkitARM in devkitPro's image pinned by digest (`$DEVKITPRO` for a local install) | `zinc-core.3dsx`, `targets/n3ds/hal_n3ds.cpp` | Azahar (2126.2 pinned; an installed `Azahar.app` first) |

`zinc toolchain install ppsspp-headless|ppsspp|vita3k|play|pcsx2|azahar` prints where each emulator is: an app in `/Applications` (or unpacked
in `~/Downloads`) first, with its own settings, firmware and BIOS; else the pinned release in `~/.zinc/toolchains` (SHA-256 checked). PCSX2 is
never downloaded: it needs the user's own BIOS. `ZINC_EMU_PINNED=1` takes the pinned ones only.

## The contract between a core and its runner

- The core prints `zinc:start`, the program's lines, then `zinc:exit <status>` (0, 1 runtime error, 101 uncaught exception, 2 no or bad program).
  The runner prints the lines between and exits with the status; 124 when no `zinc:exit` came in time (the emulator is stopped); 77 when the
  emulator is missing, with the reason.
- A core built with `--frames N` stops after N frames and leaves its last frame for `--shot`, taken from what the screen shows: the PSP through
  PPSSPP's screenshot device, the PS2 from PCSX2's own save state (written when the runner stops it; it holds a screenshot of the GS output, and the
  core keeps its last frame on the screen after `zinc:exit`), the Vita and the 3DS read back from the framebuffer the display scans out
  (`sceDisplayGetFrameBuf`, the 3DS buffer shown since the last swap, rotated back): Vita3K and Azahar have no screenshot a program or a script can
  ask for (a key in their window; Azahar's `-d` video dump needs an encoder its bundled FFmpeg lacks with the default settings).
- A program that ends with nothing drawn, or with an error, leaves its last lines on the screen (the text screen of `core_main.cpp`) until START,
  HOME or the frame budget: a console has no terminal. `zinc:exit` comes after it.
- Windowed emulators start with `open -g`: they never take the focus. Play! is the exception (its emulation does not start under `open -g`), so
  on a desktop with a BIOS PCSX2 is used.

## What each emulator needs and does

- **PPSSPPHeadless**: prints only what reaches PPSSPP's `kemulator:` device (devctl 2): the PSP HAL sends its lines there as well as to stdout.
  Fast-forwards (30 frames in 0.1 s). The macOS build needs an empty MoltenVK stand-in and `_DARWIN_C_SOURCE` (src/tc/consoles.cpp).
- **Vita3K**: runs Zinc's homebrew without firmware; with the user's install it uses a copy of their config (`-c <copy> -w`), so their settings and
  firmware (pref-path) are used and never changed. newlib's stdout goes to `tty0:`, which Vita3K does not show: the HAL's lines go through
  `sceClibPrintf`. Vita3K drops repeated identical lines ("Skipped N duplicate messages"): a test that prints the same line twice in a row sees one.
- **PCSX2** (the owner's, with their BIOS): run with its own data directory `~/.zinc/emulators/pcsx2` whose ini points at the user's BIOS folder
  (never copied), with the EE and IOP consoles logged and the host filesystem on (`host:` is the ELF's directory). Never start it with an empty
  data directory: its first-run migration copies the BIOS there.
- **Play!**: keeps its data in `~/Documents/Play Data Files` (it cannot be moved); the runner turns on `iop.fileio.stdlogging` (the EE's stdout in
  `ps2_stdout.txt`) and off `ui.pausewhenfocuslost`. `host:` is its `vfs/host` directory.
- **Azahar**: logs debug strings only at its Debug level (the default filter is `*:Info`), so the 3DS HAL also writes its lines to `sdmc:/zinc.log`
  (`~/Library/Application Support/Azahar/sdmc`). `-d file` records a video of the session; `-p` replays a TAS movie (scripted pad input).

## devkitPro natively on macOS

`pkg.devkitpro.org` answers scripts with a Cloudflare challenge (HTTP 403), and devkitPro's macOS installer puts pacman in `/opt/devkitpro` with
sudo, so zinc uses the pinned docker image. For a native toolchain (faster builds, no docker), once, by hand:

```sh
curl -LO https://github.com/devkitPro/pacman/releases/download/v6.0.2/devkitpro-pacman-installer.pkg   # sha256 da74156211cd3d8664ba7fb95544fbc0a2fbef1dd87b1a6bfafb30d2d446cd30
sudo installer -pkg devkitpro-pacman-installer.pkg -target /
sudo dkp-pacman -Sy && sudo dkp-pacman -S 3ds-dev        # devkitARM, libctru, citro3d, citro2d, 3dstools, picasso, tex3ds
export DEVKITPRO=/opt/devkitpro DEVKITARM=/opt/devkitpro/devkitARM   # zinc toolchain install n3ds then names it
```

## Hardware: every part of the console as a zinc API (ZN-759)

A program reaches a console's parts through the APIs it already uses on every target, so the same code runs on a desktop, a phone and the four
consoles, and says so on its screen where a machine has none. The demos `examples/hardware-psp`, `hardware-vita`, `hardware-ps2` and
`hardware-n3ds` show each part live, one screen each (screenshots: `docs/reports/zinc-next-consoles.md`).

| Part | API | Consoles | On a desktop |
|---|---|---|---|
| Buttons, d-pad, sticks, shoulders | zinc:gfx gamepad 0 (`gamepadButton`, `gamepadAxis`, W3C order) and the `Btn` buttons | all; the 3DS's C-stick and ZL / ZR on a New 3DS | a gamepad, else the keyboard |
| Pressure-sensitive buttons | `gamepadButtonValue(0, b)`: 0..1 | PS2 (DualShock 2 pressure mode) | 1 when held; a script: `gbutton I B VALUE` |
| Vibration of a pad | `gamepadRumble(0, low, high, ms)`: low the big motor, high the small one | PS2 (both motors); Vita only on a PS TV with a DualShock 3 | an SDL gamepad's motors; `ZINC_DEVICE_LOG` records it headless |
| Touch screen | zinc:gfx touch points (`touchCount`, `touchX`...) and the pointer | Vita (front, multitouch), 3DS (bottom screen) | the mouse |
| Second screen | zinc:gfx `openWindow(title, 320, 240, draw)`: the window is the 3DS's bottom screen, its stylus the window's pointer | 3DS | a second window |
| Rear touch pad | zinc:hardware `rearTouches()`, `hasRearTouch()` | Vita | the right mouse button; `--simulate vita`: the panel's rear pad |
| Motion | zinc:hardware `accelerometer()` (m/s²), `gyroscope()` (°/s) | Vita, 3DS | null; `--simulate`: the panel's tilt |
| Microphone level | zinc:hardware `microphoneLevel()`: 0..1, -1 without one | 3DS | -1; `--simulate n3ds`: the panel's level |
| Stereoscopic 3D | zinc:hardware `stereoDepth()` (the 3D slider), `setStereo(true)`, `stereoEye()`: the frames alternate between the eyes, both shown at each refresh | 3DS | -1 (flat); `--simulate n3ds`: the slider, one eye shown |
| Sound | zinc:audio (tones, samples, WAV and Ogg Vorbis files, voices, streams) | all: PSP 44.1 kHz (sceAudio), Vita 48 kHz, PS2 48 kHz (audsrv), 3DS 22.05 kHz (ndsp, else CSND) | miniaudio |
| Saving | zinc:storage; zinc:hardware `saveLocation()` | the PS2's memory card (`mc0:`), the PSP's memory stick, the Vita's `ux0:data`, the 3DS's SD card | a file (`~/.zinc/storage.kv`) |
| Battery, clock, network | zinc:hardware `battery()`, `network()`; `Date` | PSP, Vita, 3DS (the PS2 has neither) | the machine's own; `--simulate` |

zinc:hardware (`lib/std/hardware.ts`) is a set of queries of zinc:sys `device()`: a console core's HAL answers them (`hal_device` in
`targets/<console>/hal_*.cpp`), a simulated device answers them on a desktop: `zinc run --simulate psp|vita|ps2|n3ds <project>` opens the device's
control panel (`devices/<console>.json`) beside the program, with its battery, network, tilt, microphone level, 3D slider and rear pad.
zinc:audio is a plugin on a desktop; a console core links its mixer instead (`next/targets/console/audio_console.cpp`, the same native
module and contract), rendered on the program's thread at the end of each frame. It decodes PCM WAV and Ogg Vorbis (stb_vorbis, the
decoder plugins/audio vendors); FLAC and MP3 play on a desktop.

The assets: `zinc pack` writes the project's asset pack (`packs/default.zpk`: data files, sprite atlases, tile maps, sounds) and
`tools/build-console-core --embed program.zbc resources.bin default.zpk` (and `tools/console-demos`) links it into the core, which serves
zinc:assets (`exists`, `readText`, `readBytes`, `list`) from it and makes its images zinc:gfx images (uncompressed ZIM formats; a
block-compressed one is a GPU's and draws transparent). zinc:sprite and zinc:tilemap work unchanged: `examples/platformer` plays on the PSP, the
Vita and the 3DS. Only the default pack: the groups of zinc:assets (`<group>.zpk`, loadGroup) are not served on a console yet.

## Limits

- Software raster only (the GE, GXM and PICA replays are later tasks); one thread (and the HAL's audio thread); no `zinc:fs` directories or stat (the console host
  serves files through stdio, storage, the clock, args and env: `next/targets/console/host_console.cpp`).
- A program that calls `exit()` ends without `zinc:exit`: the runner reports a timeout.
- The Vita and 3DS shots are the displayed framebuffer read back, not the emulator's window: a bug in how the emulator draws it shows only in
  its window. A window capture (`screencapture -l`) needs the Screen Recording permission for the terminal.
- Pads: the PSP and Vita left stick, the PS2 left stick (DualShock 2 in analog mode) and the 3DS circle pad also drive the d-pad buttons. PCSX2's
  runner data directory has no pad bindings: the tests drive the pad with `--input`; the owner's PCSX2 uses its own bindings.
