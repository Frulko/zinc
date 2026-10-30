---
id: ZN-883
title: 'examples/discord: call view and voice settings (devices, volumes, sensitivity)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 20:28'
labels:
  - ui
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-872
ordinal: 577460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner made a real voice call but has no microphone or sound settings and no dedicated call screen. Add, as Discord does: a call view (participants as tiles with speaking ring, mute, deafen, disconnect, call duration) shown when a call is active in the channel being viewed, and a 'Voice & audio' settings pane: input device, output device, input volume, output volume, per-user volume, input mode (voice activity with a sensitivity slider and a live level meter, or push-to-talk with a chosen key). Stored with zinc:storage. Missing engine API (e.g. listing or choosing the output device) is added to the engine with a test, not worked around.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A call view shows each participant with a speaking ring and mute/deafen state, plus mute, deafen and disconnect buttons
- [ ] #2 Voice & audio settings: input and output device choice, input and output volume, per-user volume, saved and restored
- [ ] #3 Input sensitivity: voice activity threshold with a live meter, or push-to-talk on a chosen key; nothing is sent below the threshold or with the key up
- [ ] #4 The voice demo session (tests/t1/discord_voice.sh) covers the call view and the settings with a golden
<!-- AC:END -->
