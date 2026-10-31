---
id: ZN-913
title: 'screen picker like Discord''s: tabs, big previews, no blinking, quality presets'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:34'
labels:
  - discord
  - ui
dependencies: []
ordinal: 607460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 (screenshots of Discord's Go Live dialog: tabs Applications / Entire screen / Devices, two-column grid of large live previews with the app icon and name under each, a preset line with SD/HD and a gear, a Nitro banner for HD). Ours blinks between black and the image on each refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Thumbnails never blink black: a refresh keeps the old image until the new one is ready (per source, no list rebuild)
- [ ] #2 Tabs Applications, Entire screen, Devices (cameras) with a two-column grid of large previews, app icon and name under each, selected one outlined
- [ ] #3 A preset line (name, description, resolution, fps) with an SD/HD switch and a settings button for resolution and frame rate; HD and 60 fps locked with the plain note the app gives (no Nitro branding in the engine piece)
- [ ] #4 Reusable engine piece (plugins/screen-capture/picker.ts) still used by examples/discord and examples/webrtc-call; test on frames
<!-- AC:END -->
