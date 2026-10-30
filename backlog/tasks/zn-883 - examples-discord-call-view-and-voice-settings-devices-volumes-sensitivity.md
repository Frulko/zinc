---
id: ZN-883
title: 'examples/discord: call view and voice settings (devices, volumes, sensitivity)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 20:28'
updated_date: '2026-10-30 20:56'
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
- [x] #1 A call view shows each participant with a speaking ring and mute/deafen state, plus mute, deafen and disconnect buttons
- [x] #2 Voice & audio settings: input and output device choice, input and output volume, per-user volume, saved and restored
- [x] #3 Input sensitivity: voice activity threshold with a live meter, or push-to-talk on a chosen key; nothing is sent below the threshold or with the key up
- [ ] #4 The voice demo session (tests/t1/discord_voice.sh) covers the call view and the settings with a golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (owner: make it work first, tests later): zinc:discord-voice gained inputDevices()/outputDevices() (miniaudio, ids as zinc:microphone's), setDevices (live switch), setVolumes (input/output gain, voice activity threshold), setUserVolume, level(). Frontend: a class field initialised from an imported const is inferred (src/frontend/check.cpp, case in tests/golden/modules). App: components/CallView.tsx (tiles, speaking ring, mute/deafen flags from VOICE_STATE_UPDATE, duration, mute/deafen/disconnect), Settings.tsx with a Voice & audio pane (devices, volumes, per-user volume, voice activity + live meter or push-to-talk with a recorded key), stored under zinc:storage key 'voice'. DISCORD_DEMO=voice now logs the threshold (nothing sent above our tone), the input volume and the settings kept, and saves call.png and settings.png in DISCORD_SHOTS; tests/t1/discord_voice.sh and discord pass (discord hash re-recorded after looking at the frame: the settings got a side nav). AC #4 open: the two frames are captured but not compared (no hash golden yet: the meter and duration need care). Next: add shasum of call.png/settings.png to tests/t1/discord_voice.sh with a frames.txt golden, run it 3 times to prove it is stable. Not done: QuickJS fails the RTP vectors (u8[]/u32 args to the native side), only the device lines are compared there.
<!-- SECTION:NOTES:END -->
