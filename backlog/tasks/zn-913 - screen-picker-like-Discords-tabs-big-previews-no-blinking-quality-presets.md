---
id: ZN-913
title: 'screen picker like Discord''s: tabs, big previews, no blinking, quality presets'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:34'
updated_date: '2026-10-31 08:50'
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
- [x] #1 Thumbnails never blink black: a refresh keeps the old image until the new one is ready (per source, no list rebuild)
- [x] #2 Tabs Applications, Entire screen, Devices (cameras) with a two-column grid of large previews, app icon and name under each, selected one outlined
- [x] #3 A preset line (name, description, resolution, fps) with an SD/HD switch and a settings button for resolution and frame rate; HD and 60 fps locked with the plain note the app gives (no Nitro branding in the engine piece)
- [x] #4 Reusable engine piece (plugins/screen-capture/picker.ts) still used by examples/discord and examples/webrtc-call; test on frames
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause of the blink: screen.host.cpp list() freed the previous listing's runtime images (clear_thumbs) when the next listing started, while the dialog's nodes still drew them until the async result rebuilt the list. Now two generations are kept (freed at the listing after the next). The picker also keeps its cards and only sets the new image handle on each refresh (rebuilds only when the set of sources changes). Tabs, 2-column grid, SD/HD preset line + Settings panel, lockedNote banner, optional Devices tab (devices option, kind 'device'; examples/discord does not pass it). Tests: screen_picker (updated golden: tabs, banner, tab switch), screen_capture, webrtc_call, discord, discord_voice pass.
<!-- SECTION:NOTES:END -->
