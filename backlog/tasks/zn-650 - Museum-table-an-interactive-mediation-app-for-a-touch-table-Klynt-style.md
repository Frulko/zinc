---
id: ZN-650
title: 'Museum table: an interactive mediation app for a touch table, Klynt style'
status: Done
assignee: []
created_date: '2026-10-10 17:50'
labels:
  - demo
  - ui
  - touch
  - 3d
  - size-L
milestone: m-27
dependencies: []
ordinal: 17000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Epic. examples/museum-table: an app a museum could put on a multi-touch table for visitors: a collection presented as linked sequences in the manner of Klynt (interactive storytelling: sequences of media and text joined by links, a storyboard to navigate), with photos handled by gestures like prints on a light table, 3D models of objects to turn and inspect, descriptions in several languages and guided presentations. All content comes from a project file; the app is the player. (Owner request, 2026-10-10: a demo app useful for mediation in museums: an interactive presentation on a touch table, photo gestures, 3D models, descriptions, presentations, in the manner of Klynt.)

Owner's answers, 2026-10-10: a horizontal touch table; one or two visitors at a time sharing one story; texts and panels turn toward the side of the last touch; a sample collection from CC0 sources; French and English; media: photos, 3D models, text, audio narration, video and 360-degree panoramas; glTF/GLB models in addition to OBJ; narration by a synthesised voice (the Mac's say), replaceable; accessibility: text size and contrast, every control reachable from the edge, subtitles, audio description; kiosk: fullscreen without a way out, attract loop and reset (60 s then 120 s, in the project file), content replaced remotely, anonymous visit statistics; a theme defined in the project file; the player and the storyboard editor are built in parallel; other targets later (a Linux touch table, the web, a Raspberry Pi); if the machine saturates the pinball goes first; no deadline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 every subtask is Done
- [x] #2 the demo is listed in the examples status and has a README with screenshots
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: closed as Done. Every subtask is Done and the demo has its README with screenshots. Close the epic. Evidence: examples/museum-table (README with 8 images); tests/t1/museum_visit.sh; all 20 subtasks Done Verifier: All 20 subtasks (650.01-650.14 and 650.07.01-.06) are Done; examples/museum-table/README.md has 8 screenshots and tests/examples.lst:59-60 lists the player and editor as OK; tests/t1/museum_visit.sh exists.
<!-- SECTION:NOTES:END -->
