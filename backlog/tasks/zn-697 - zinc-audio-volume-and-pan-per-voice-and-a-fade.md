---
id: ZN-697
title: 'zinc:audio: fade a voice to silence over a time'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 21:28'
updated_date: '2026-11-09 06:27'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 13300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Only AC2 (fade) and its doc line remain. Already there: docs/plugins/audio.md:52-53.

(Follow-up of the pinball's sound and look, D80.) Volume and pan move every voice of a Sound today, so two overlapping plays of one sound cannot have their own level, and a fade is done by hand each frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 two overlapping plays of one sound at two volumes mix to both (test on the null backend)
- [x] #2 a voice fades to silence over a given time and stops
- [x] #3 docs/plugins/audio.md documents them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Per-voice volume and pan exist (sound.voice(), voice.set(volume, rate, pan)); a fade over time does not. Evidence: docs/plugins/audio.md:52-53

ZN-697 done (2026-11-09). API: voice.stop(delay = 0, fade = 0): the voice fades from its gain to 0 over `fade` seconds starting `delay` from now and stops on the frame the fade ends. Native: miniaudio's ma_sound_set_stop_time_with_fade_in_pcm_frames (fader applied per sample after the resampler, on the mixer's thread; fade start resolved on the audio thread against the engine clock, so it is exact on the null backend and on a device). Explicit state: Voice.used became enum VState {Free, Playing, Ending} with one transition function to() (Ending never goes back to Playing); handles stay the monotonic play count. Same in the console mixer (linear gain (stopAt - t)/fade, as miniaudio's fader), the Zinc stand-in (end = clock + delay + fade) and the web (gain linearRampToValueAtTime then src.stop). Decision: a fade-out on stop() rather than a general fade(volume, seconds): what the task asks, no ratio with voice.set(); a fade-in or fade-to-a-level is a later.md line.
Proof: tests/t0/audio_fade.sh (new): AC1 two plays at 0.5 and 1 mix to 0.75, then 0.25 alone; AC2 a 480-frame fade gives 0.5, 0.375 at frame 120, 0.25 at 240, 1/960 at 479, silence and playing=false from frame 480; a delayed fade; a pitched (rate 2) voice fades over the same frames of mix. Same lines on the interpreter, QuickJS and the AOT program. tests/run --only audio_fade, console_audio, webenv_audio_silent: PASS. AC3: docs/plugins/audio.md voice.stop row.
Research (sonnet sub-agent): miniaudio issue on fade-stop then restart (stop time stays set; we re-init a voice per start, so not hit) https://github.com/mackron/miniaudio/issues/714 ; no end callback after a fade-stop https://github.com/mackron/miniaudio/issues/719 ; SoLoud faders: volume per sample, others per mix call https://solhsa.com/soloud/faders.html ; Web Audio ramps and stop(when) https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime ; miniaudio manual (fades, stop times on the engine clock) https://miniaud.io/docs/manual/index.html
Proposed tests: none beyond audio_fade (T0, ~5 s, <100 MB, builds the plugin once per ZINC_HOME).
<!-- SECTION:NOTES:END -->
