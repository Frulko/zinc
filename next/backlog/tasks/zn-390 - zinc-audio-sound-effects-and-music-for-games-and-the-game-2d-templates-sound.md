---
id: ZN-390
title: >-
  zinc:audio: sound effects and music for games (and the game-2d template's
  sound)
status: Backlog
assignee: []
created_date: '2026-10-08 23:22'
labels:
  - audio
  - size-M
dependencies: []
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-317.01: next/ has no audio API (no zinc:audio, no WebAudio in zinc:web), so the game-2d template has no sound. Pick a proven library (miniaudio, MIT-0 / public domain, single header) behind a zinc:audio module: load a WAV / OGG asset, play / stop / volume / loop, a short beep generator; a null backend headless; then add a jump / coin sound to templates/game-2d.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc:audio plays an asset on macOS and Linux and is a silent no-op headless (test); templates/game-2d plays a sound when a coin is collected
<!-- AC:END -->
