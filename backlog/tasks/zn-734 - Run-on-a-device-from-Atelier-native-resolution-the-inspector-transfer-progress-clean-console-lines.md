---
id: ZN-734
title: >-
  Run on a device from Atelier: native resolution, the inspector, transfer
  progress, clean console lines
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-12 16:15'
updated_date: '2026-10-12 16:16'
labels:
  - app
  - device
  - size-M
milestone: m-10
dependencies: []
ordinal: 495410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner report (2026-10-12, a screenshot of Atelier running a sketch on the Raspberry Pi "spark" through the agent, `zinc device spark deploy . --name interface_2`), on the work of ZN-729.05, .06 and .08: (1) the picture is pixelated: the console says `fbdev: /dev/fb0 800x480 16 bpp, surface 320x240 at 80,0 size 640x480`, a sketch whose zinc.json names no display is drawn at 320x240 and doubled; (2) the inspector cannot be opened on the device: the console says "inspector: it opens when the sketch has import 'zinc:devtools'" and the status line "Debug the sketch first", where on the desktop `zinc dev` adds the inspector by itself; (3) an informative line is shown as an error, in red ("spark is linux aarch64 (…): exporting for rpi, shown on its framebuffer (ZINC_DISPLAY=fbdev: zinc.json names no display for Linux)"), and when it wraps its second row is drawn over the next line; (4) the transfer shows no progress: only "installed interface_2 on spark (35 MiB)" at the end.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A sketch that names no size is drawn at the device screen's own resolution (800x480 on that Pi), sharp; a project that names a size keeps it; the rule is the same for fbdev and the other device displays and is written in the display's doc
- [x] #2 Debug on a device opens the inspector on the running sketch with no import in the sketch, as zinc dev does on the desktop; Run then Inspector says what to do in one clear sentence or just does it
- [x] #3 Notes of a deploy are shown as notes, errors as errors; a console line longer than the card wraps or is cut without covering the next line; the console's lines can be selected with the pointer and copied (Cmd+C, Cmd+A with the focus, a Copy control for everything)
- [x] #4 The transfer to a device shows its progress live in Atelier's console and status line (percent, size, speed), from lines zinc device prints as it sends
- [x] #5 Tests on the Mac against a local agent for the progress, the inspector choice and the console lines; the check on the Pi is run once if the device is free, else its command is in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked 2026-10-12 in a worktree (agent of the coordinator), on the Mac. Criteria 2 to 5 are proven; criterion 1 is written and proven on the driver with a simulated framebuffer, not on the Pi: spark was reachable but busy (`./hero` at 138 % of a core for 8 minutes, started outside the agent), so nothing was deployed there. The task is in Review for that one run.

1. Pixelated. Cause: the surface of a program that names no size was 320x240 whatever shows it (startSurface, src/host/gfx_host.cpp); fbdev then scaled it (640x480 at 80,0 on 800x480). Fix: HalDisplay has native_size (runtime/include/hal.h): the host asks it before the display's init when ZINC_SIZE is not set (zinc.json's size for the target and a board's are baked as ZINC_SIZE, so a named size wins). display-fbdev answers with the framebuffer's mode (FBIOGET_VSCREENINFO, or the simulated format), display-gl on KMS with the connector's mode (open_card is asked once); display-gl in a window answers nothing, so the desktop default is unchanged, like every panel driver (their boards name the size). Doc: docs/plugins/display-fbdev.md ("The surface's size"), display-gl.md. Evidence: tests/native/chip_fbdev.cpp (in chip_models, PASS) on an 800x480x16 screen: `fbdev: /dev/fb0 800x480 16 bpp, surface 800x480 at 0,0 size 800x480`, nothing scaled; a 64x48 surface on 128x112 is still scaled 2x; a screen that cannot be read leaves 320x240. kms.cpp and display_gl.cpp compile for aarch64-linux with the pinned zig and the sysroot (objects only).
   Not proven: the host's call on a real export (no cross build here), the Pi's screen, KMS at run time. Command for the Pi, from next/ on main once integrated (nothing else on its screen):
   `mkdir -p /tmp/zn734 && printf "import { onFrame, clear, rect, width, height } from 'zinc:gfx';\nconsole.log('surface ' + width() + 'x' + height());\nonFrame((dt: number) => { clear(0x101820); rect(0, 0, width(), 2, 0xffffff); rect(0, height() - 2, width(), 2, 0xffffff); });\n" > /tmp/zn734/main.ts && build/zinc device spark deploy /tmp/zn734 --name zn734`
   expected in the log: `fbdev: /dev/fb0 800x480 16 bpp, surface 800x480 at 0,0 size 800x480` and `surface 800x480`, two sharp lines at the top and bottom edges; then `build/zinc device spark stop zn734 && build/zinc device spark uninstall zn734`.
   hal.h is in the cache key of every plugin: the first run after this commit builds each plugin again, once.

2. Inspector. Cause: zinc dev writes an entry with `import 'zinc:devtools'` in front of the program; deploy sent the program as it is, and Atelier said to write the import. Fix: that entry is one function (inspectEntry, cli_core.cpp) used by zinc dev and by the new `--inspect` of zinc pack, zinc export and zinc device deploy (a project that never names zinc:ui is built as it is, as under zinc dev). Atelier's Debug on a device is `deploy --inspect`; Tools > Open the Inspector shows the inspector of a debug run, and with a plain run or none starts the sketch (again) in debug and says so. Evidence: agent_inspect (PASS): a UI program without the import deployed with --inspect has its inspector on the port the agent says, the source is untouched, and without the option it has none. atelier_devices (PASS): Open the Inspector with nothing running gives `$ zinc device bench deploy . --name blink --inspect` and `Debugging on bench`. By hand, headless, a UI sketch without the import, Debug on a loopback agent: `zinc devtools: … localhost:61039` from the app, then `inspector: opened on port 61045`.

3. Console. Cause of the red note: every line of stderr that is not a step was an error for Atelier, and deploy wrote its note as plain text on stderr. Fix: what deploy sends and why is a step line (`  device     spark is linux aarch64 (…): exporting for rpi, …`, quiet under -q), which the console already shows in its quiet tone; the parser of step lines is one function (stepOf, app/atelier/model.ts). Cause of the overlap: a console row had a fixed height of 19 px and its text wrapped. Fix, with the owner's second request (select and copy): the console's lines are one read-only text field of zinc:ui (the TextArea the editor is made of), so a long line wraps onto the rows it needs and the pointer selects (drag, double click a word, triple click a line, Shift+click), Cmd+C copies, Cmd+A selects all once it has the focus; a Copy control on the status line and Tools > Copy the Console take everything. Each line keeps the colour of its kind; a place a line names (`main.ts:12:5`) is a link in the accent colour, a click on it opens the file. What went: the error cards (a text field holds text): a diagnostic is a red line with its place as a link. Evidence: atelier (t0, PASS): stepOf on the note, the progress, an error, a program's indented line. atelier_ide (PASS), session `console`: a line of 520 characters on four rows above the next line, a click on `main.ts:3:1` puts the caret at Ln 3, three clicks and Cmd+C give `[clipboard] the line after it`, Copy the Console every line (golden console-60.png, two crops). The plain clipboard is not in the system simulator's log (that log is zinc:system's; the text clipboard is zinc:gfx's, private to a headless run): the session command `clipboard` prints it.

4. Progress. Cause: sendTree sent the whole tree without a word. Fix: it tells a callback the bytes handed to the connection after each frame of 32 KiB; deploy, install and push print step lines `  send       45%  16 MiB of 35 MiB  2.1 MiB/s`, rewritten in place in a terminal (every 200 ms), a line every 500 ms on a pipe (ZINC_PROGRESS_MS sets it), and the last one with the duration. Atelier keeps one line for a step that is said again (the progress, the native builds, `compile ...` then its result) and repeats the transfer on the status line (`Sending to spark: 45%, 16 MiB of 35 MiB, 2.1 MiB/s`). Evidence: agent_deploy (PASS): the export's deploy ends with its 100 % line; a push of 300 kB prints one line on a pipe, ten with ZINC_PROGRESS_MS=0 (10 % to 100 %), none with ZINC_STEPS=0. atelier_devices (PASS): the `send` line in the console and `Sending to bench: 100%, …` on the status line.

Tests run (the worktree's build, tests/run): atelier (t0), agent (t0), agent_deploy, agent_inspect, atelier_devices, atelier_ide, chip_models, dev_mode: PASS.

Decisions (reversible, no record number taken): the default size is asked from the driver at run time, not from the device at deploy time (an export copied to another screen stays right); notes are steps, no new `note:` style; the inspector is asked by an option, never added to a plain Run; the console is a text field rather than selectable rows (zinc:ui selects inside one text node only).

Not proven: the Pi (above); a transfer slow enough to show several lines without ZINC_PROGRESS_MS; the in-place line of a terminal (looked at in the code, not in a tty); Chrome on a device's inspector.

Lines for backlog/later.md:
- ZN-734 (Cross-platform pass): run the Pi command of the task notes on spark (fbdev 800x480, 1:1), and a sketch without a size under ZINC_DISPLAY=gl on a KMS screen.
- ZN-734: zinc:platform's SCREEN_W and SCREEN_H are the size known at compile time (320x240 for a sketch): on a device that gives its own they differ from width() and height(); two examples read them.
- ZN-734: a large screen (1080p HDMI on a Pi 3) is now drawn whole by the software rasterizer for a sketch without a size: measure, and consider a cap or a scale for slow boards.
- ZN-734: the app's own step lines in a device's log (`  run        interpreter`) set Atelier's status a second time; harmless.
- ZN-734: zinc device pull shows no progress (the device sends; the size is not known before).
- ZN-734: the console's links have no underline and no pointer cursor (a text field colours runs, nothing more).
<!-- SECTION:NOTES:END -->
