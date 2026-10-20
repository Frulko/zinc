---
id: ZN-223
title: 'Pixel differences with the prototype: 13 examples'
status: Done
assignee: []
created_date: '2026-10-07 10:44'
updated_date: '2026-10-08 02:25'
labels:
  - render
  - parity
dependencies: []
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/proto-capture compare lists the entries whose frame 30 differs from the prototype (known rows in tests/golden/examples/proto/manifest.json): small text/clock areas (esp32-2432s022, camera/remote, pocket-hero, process/shell, text/main-react, remarkable dashboard and notes, webview/hybrid) and whole-frame differences (pinball, three/cubes, video/bounce, looper, quad). Find each cause (time-dependent state, font rendering, plugin renderer), fix or justify with a tolerance, remove the known row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every known row of the manifest is removed or has a documented tolerance
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Causes: (1) tools/proto-capture captured the prototype with the project directory while compare ran the entry file, and from another cwd: text/main-react, pinball, three/cubes, video/looper, webview/hybrid were stale goldens, not engine differences (both now run the entry file from the project directory; all goldens recaptured). (2) camera/remote: a thread-completed native promise (camera detect) was not done by frame 30 in a deterministic run; nativePoll now waits for pending native promises there (3 s budget per run). Remaining known rows with documented reasons: esp32-2432s022 and pocket-hero (ulp-level path coordinates: prototype C++ fuses multiply-add), remarkable dashboard/notes (wall-clock status bar), process/shell (child process output), video/bounce and quad (deterministic run uses the fake player, D12). 42 of 42 entries match the manifest.
<!-- SECTION:NOTES:END -->
