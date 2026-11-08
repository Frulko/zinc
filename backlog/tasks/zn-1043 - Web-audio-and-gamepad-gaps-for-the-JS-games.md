---
id: ZN-1043
title: Web audio and gamepad gaps for the JS games
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
labels:
  - audio
  - input
  - size-M
milestone: m-8
dependencies: []
ordinal: 7700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sound and pads that games expect and the engine lacks.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-574: embed SDL_GameControllerDB (Zlib) in the window host; today an unknown pad is not seen.
- ZN-574: read gamepads in display-gl's own event loop (`plugins/display-gl/src/sdl.cpp`); a program on that driver sees none.
- ZN-715: a `zinc:audio` tone in `examples/midi` so a first run is heard.
- ZN-573: a web program that makes sound builds plugins/audio at its first run (the QuickJS engine has no stand-in for a native module); without a compiler it prints one line and stays silent: first-run experience.
- ZN-573: OscillatorNode is silent, loopStart/loopEnd are not read, suspend() mutes without pausing, the audio element decodes whole files (no streaming): what ZzFX-style synths, Howler sprites and long music need.
- ZN-573: ZINC_AUDIO_LOG prints one peak for both channels (pan cannot be proven); a sound-only script opens a window (the web audio clock needs frames).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 OscillatorNode makes sound; loopStart/loopEnd read; suspend() pauses; ZINC_AUDIO_LOG prints a peak per channel
- [ ] #2 A web program that makes sound does not stop at a first-run plugin build without a message
- [ ] #3 SDL_GameControllerDB embedded; display-gl reads gamepads
- [ ] #4 examples/midi plays a tone at first run
<!-- AC:END -->
