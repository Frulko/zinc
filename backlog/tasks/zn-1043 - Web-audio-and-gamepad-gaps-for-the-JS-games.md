---
id: ZN-1043
title: Web audio and gamepad gaps for the JS games
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
updated_date: '2026-11-08 23:50'
labels:
  - audio
  - input
  - size-M
milestone: m-8
dependencies: []
ordinal: 7700
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
- [x] #1 OscillatorNode makes sound; loopStart/loopEnd read; suspend() pauses; ZINC_AUDIO_LOG prints a peak per channel
- [x] #2 A web program that makes sound does not stop at a first-run plugin build without a message
- [x] #3 SDL_GameControllerDB embedded; display-gl reads gamepads
- [x] #4 examples/midi plays a tone at first run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).

Research (sonnet sub-agent): Web Audio spec (https://webaudio.github.io/web-audio-api/): loopStart/loopEnd used only when 0 <= loopStart < loopEnd, else the whole buffer; suspend() stops currentTime and rendering, scheduled sources simply wait. ZzFX renders its own samples into an AudioBuffer (no oscillator: createBuffer + buffer source + gain + panner, all there). Howler loops sprites with start(0, seek, 86400) and loopStart/loopEnd = the sprite (https://github.com/goldfire/howler.js). miniaudio: loop region per data source (ma_data_source_set_loop_point_in_pcm_frames), the engine clock only moves when frames are read. SDL_GameControllerDB is zlib, one mapping per line with a platform field (https://github.com/mdqinc/SDL_GameControllerDB); SDL_AddGamepadMappingsFromIO; SDL drops joystick input while no window has focus unless SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS.

Decisions:
- OscillatorNode is an AudioBufferSourceNode of one period (floor(48000/f)+1 samples, so the voice rate is > 1 and stays pitched) looped; frequency/detune follow once a frame within the mixer's 1/64..64 rates (six octaves). PeriodicWave and createPeriodicWave added. Scored against miniaudio's ma_waveform (a new native voice kind, no custom wave): the JS table reuses every existing path (start/stop/when/route/log).
- suspend() holds the whole zinc:audio mixer (new native suspend(on): the device callback gives silence, mix() renders silence without moving time), so currentTime, start delays and stop times wait, as the spec says. Ceiling: one mixer, so suspending one context also holds audio elements and other contexts.
- loopStart/loopEnd: new Voice.loopPart(from, to) -> native voiceLoop -> ma_data_source_set_loop_point_in_pcm_frames (not for a clip still decoding). sim, web and console implementations kept in step (console: no-ops).
- ZINC_AUDIO_LOG prints the peak of each channel (the T1 golden page.out rewritten from this run).
- #2: the first-run build already said so (ZN-824 step line 'building audio, once'); the defect was the failure path: native code loads at its first call, so a failed build threw an uncaught ReferenceError at the first currentTime read and stopped the page. sound() now makes that first call inside its try: one line, the page goes on in silence. T0 tests/t0/webenv_audio_silent.sh (fake compiler).
- #3: third_party/SDL_GameControllerDB pinned at 07af1d5 (sha256 in third_party/README.md); CMake keeps this system's lines (325 for macOS, 88 KB) in build/gamepad_db.cpp; hal_sdl adds them when the gamepads start (190 added on macOS, the others SDL had). display-gl's SDL loop calls zn_sdl_gamepads_poll (exported by the window host, weak in the plugin). ZINC_VIRTUAL_GAMEPAD sets SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS (a test window is never focused).
- #4: examples/midi plays each note as a zinc:audio triangle tone (MIDI_TONE=0 to leave it to the instrument).

Proof (short runs): audio page with the real plugin (oscillator square 0.25 peaks 0.25/0.25; pan right 0.00 left 0.80 right; loop part peaks 0.20, not 0.80; held true while suspended, the source started meanwhile plays after resume); webenv_audio_silent PASS; pads.js on ZINC_DISPLAY=gl with the virtual Xbox pad: 1 gamepad, every button and axis seen (main tree binary: 0 gamepads); midi headless with keys a and g on the interpreter and QuickJS.

Later: a rendered graph for p5.sound/Tone.js (filters, modulation of params); an oscillator past six octaves of sweep; per-context suspend; streaming audio elements (still decoded whole); a source with no frames has no clock (a sound-only script needs frames); display-gl gamepads on the Pi's KMS driver (evdev, not SDL); AOT run of examples/midi not made.

Proposed tests: tests/t1/webenv_audio.sh (page.out rewritten here; also its js-phaser half; 30 s, 400 MB); tests/t1/webenv_gamepad.sh and tests/t1/gamepad_window.sh (DB added at init must not change the virtual pads' goldens; 20 s each, 300 MB); a display-gl run of pads.js with ZINC_DISPLAY=gl ZINC_VIRTUAL_GAMEPAD=xbox (window, 10 s, 300 MB); examples/midi by hand with sound on (a key is heard at first run; 1 min); a real unknown pad (8BitDo or generic USB) on macOS, by hand.
<!-- SECTION:NOTES:END -->
