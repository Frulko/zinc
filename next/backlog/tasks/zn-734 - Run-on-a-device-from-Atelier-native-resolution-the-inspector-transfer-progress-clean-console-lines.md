---
id: ZN-734
title: >-
  Run on a device from Atelier: native resolution, the inspector, transfer
  progress, clean console lines
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 16:15'
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
- [ ] #2 Debug on a device opens the inspector on the running sketch with no import in the sketch, as zinc dev does on the desktop; Run then Inspector says what to do in one clear sentence or just does it
- [ ] #3 Notes of a deploy are shown as notes, errors as errors; a console line longer than the card wraps or is cut without covering the next line
- [ ] #4 The transfer to a device shows its progress live in Atelier's console and status line (percent, size, speed), from lines zinc device prints as it sends
- [ ] #5 Tests on the Mac against a local agent for the progress, the inspector choice and the console lines; the check on the Pi is run once if the device is free, else its command is in the notes
<!-- AC:END -->
