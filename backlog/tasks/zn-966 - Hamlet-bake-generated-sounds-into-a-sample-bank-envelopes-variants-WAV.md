---
id: ZN-966
title: 'Hamlet: bake generated sounds into a sample bank (envelopes, variants, WAV)'
status: Backlog
assignee: []
created_date: '2026-11-01 13:08'
labels:
  - hamlet
  - demo
  - m2
  - audio
  - perf
  - size-M
  - parked
milestone: m-30
dependencies:
  - ZN-951
  - ZN-963
ordinal: 101500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
audio.ts synthesises 9 single-oscillator tones and 3 s water loops in script on first use. Add a deterministic synth with envelopes and filters for axe, log drop, bow, hit, footstep, door, deer, build, bell (2-3 variants each), render to 16-bit PCM once, cache beside the atlas, play with rate jitter. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 synth(name, seed) returns the same samples on the 3 engines (hash test)
- [ ] #2 Bank written/read as WAV via zinc:fs; cache key as for the atlas; runtime synth stays as fallback
- [ ] #3 Water loops come from the bank: no 72,000-iteration stall at first use (measured)
- [ ] #4 Played in the scene and judged by listening; the decision (kept or reverted) is in the task notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: parked. (corrected: drop proposed; the Hamlet roadmap is the owner's (commit 489242bf9, New-task: owner): far from the goal, not useless (the 2026-10-25 rule for owner asks).)
<!-- SECTION:NOTES:END -->
