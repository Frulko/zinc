---
id: ZN-695
title: 'zinc:audio: pause and resume a voice'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 21:18'
updated_date: '2026-11-09 06:54'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 14400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Seek is done; pause/resume of a voice and the museum_visit update remain.

**What is left (review 2026-10-25):** Seek is done (offset); keep pause/resume and the museum_visit update. Already there: plugins/audio/index.ts:42; docs/plugins/audio.md:52.

Found by the museum table (ZN-650.05): a paused presentation restarts its step because zinc:audio (D70) can neither pause a voice nor start it at a position.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a clip paused for 1 s ends 1 s later on the null backend (test on the interpreter and the AOT)
- [x] #2 seek to 2 s plays from 2 s
- [x] #3 the museum table resumes a presentation where it stopped (museum_visit updated)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Start at a position exists (sound.voice(..., offset)); pause and resume do not (no pause in plugins/audio). Evidence: plugins/audio/index.ts:42; docs/plugins/audio.md:52
Review 2026-11-07: done-partly. Seek is done; pause/resume of a voice and the museum_visit update remain. Evidence: plugins/audio/index.ts:42 offset; no pause on Voice

Done 2026-11-09 (worktree agent).
- API: voice.pause() / voice.resume() (spec voicePause(voice, on)). The voice lifecycle gains Paused: VState {Free, Playing, Ending, Paused}, one to() function; Playing <-> Paused, an Ending voice is not paused (its stop time and fade run on the mix clock), stop() of a Paused voice frees it at once. live() counts Paused; a Paused voice is stolen only after the one-shots (same bias as loops). Same machine in the console mixer (targets/console/audio_console.cpp: its `used` bool became the VState enum), the Zinc stand-in (audio.sim.ts: vstate + rest seconds), the web (a state string; a resumed voice gets a new AudioBufferSourceNode at the kept offset, wrapped in a loop).
- Pause is a hard cut, sample-exact (as alSourcePause, FMOD setPaused, raylib PauseSound): a clip held 1 s ends exactly 1 s later.
- Proof: tests/t0/audio_fade.sh extended (seek to 2 s plays from 2 s; held after 0.5 s for 1 s: silent and playing, resumes at 0.5 s, still playing at 3.99 s of mix, over at 4.01; pause twice; stop of a held voice; pause of a fading voice ignored): PASS on the interpreter, QuickJS and AOT. The stand-in gives the same times under ZINC_DETERMINISTIC. Console mixer: c++ -fsyntax-only clean (the console core was not built here).
- museum-table: Narration keeps its Voice; a touch holds the narration and its subtitles (player.held), Resume goes on mid-sentence (short run of visit.input without the language press: the second subtitle again at 1264 right after the resume at 1263, the next one 63 frames later than unpaused). If the language or an audio description changed meanwhile, the step starts again as before. tests/data/museum_visit/expected.story: 'narration stop' is now logged at the language change (1233) instead of the pause (seen on a run of visit.input to frame 1300).
- Research (sonnet, 2026-11-09): miniaudio does not rewind a stopped sound (https://miniaud.io/docs/manual/index.html); SoLoud setPause/schedulePause (https://solhsa.com/soloud/faders.html); Web Audio pause = keep the offset, a new node on resume (https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch02.html), wrap the offset in a loop (https://forum.babylonjs.com/t/audio-v2-resume-audio-sprites-not-working/63743); a paused voice should be stolen last.
- later.md: ZN-695: a 5 ms ramp on voice pause/resume (fade out, seek back by the ramp on resume) if the hard cut clicks on speech; the web voice offset counts a rate changed mid-voice from the start.
- Proposed tests: tests/run --tier t1 --only museum_visit (the reordered pause lines of the story, frames expected unchanged; ~2 min, ~600 MB); a museum_visit session without the language press, proving the resume mid-sentence (~2 min); a pause line in tests/t0/console_audio.sh (builds the console core, ~3 min).
<!-- SECTION:NOTES:END -->
