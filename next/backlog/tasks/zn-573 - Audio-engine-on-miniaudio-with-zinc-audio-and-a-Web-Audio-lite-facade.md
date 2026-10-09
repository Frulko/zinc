---
id: ZN-573
title: 'Audio engine on miniaudio with zinc:audio and a Web Audio lite facade'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-390
  - ZN-568
ordinal: 352270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One native graph (libzn_audio on miniaudio, decision D12; 128-frame quanta, sample-accurate AudioParam timelines) behind the typed zinc:audio of ZN-390 and a JS AudioContext covering what Howler, Phaser, Kaplay, LittleJS and three.js call: currentTime/state/resume/suspend, decodeAudioData (WAV, MP3, FLAC, Ogg Vorbis; codecs shared with ZN-440), AudioBufferSourceNode (loop, playbackRate, detune, onended), Gain, StereoPanner, Panner + Listener, BiquadFilter, Delay, Analyser, MediaElementSource; HTMLAudioElement with canPlayType (Howler needs it even for Web Audio); a null backend headless. The audio callback never enters QuickJS: commands on a bounded SPSC queue, events back through a ring buffer. Tone.js and p5.sound need almost the full spec: web-audio-api-rs as an optional plugin later. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Howler play/loop/fade/pan, Phaser's WebAudioSoundManager and Kaplay's play() work (null-backend tests compare rendered buffers with expected envelopes)
- [ ] #2 no QuickJS call and no allocation on the audio thread (debug assertion)
- [ ] #3 zero underruns in a 10-minute soak with 32 voices while the frame loop stalls 100 ms every second
- [ ] #4 the game-2d template's sounds (ZN-390) play through the same engine
<!-- AC:END -->
