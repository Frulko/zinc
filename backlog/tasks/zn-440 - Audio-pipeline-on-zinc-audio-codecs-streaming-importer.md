---
id: ZN-440
title: 'Audio pipeline on zinc:audio: codecs, streaming, importer'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-390
  - ZN-433
  - ZN-434
ordinal: 15200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On ZN-390's miniaudio: optional decoders (WAV and IMA ADPCM through dr_wav, QOA, Vorbis through stb_vorbis, Opus through libopus as a custom decoder) and streaming from packs. Audio importer: dr_libs input, libopusenc, adpcm-xq, QOA, r8brain resampling, libebur128 loudness. Report: docs/reports/games/toolchain-assets-loading.md (4.5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ZN-390's AC passes
- [ ] #2 music streams from a pack with under 64 KB resident
- [ ] #3 effects start within 10 ms on macOS
- [ ] #4 the report gives bytes per codec
- [ ] #5 decode CPU per codec measured on the Pi 3 is in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: split into subtasks (Audio importer: QOA/ADPCM encode at pack time, per-codec bytes in report.json; Streaming music from a ZPK pack under 64 KB resident; Opus decode (libopus) as an optional codec, decode CPU on the Pi 3 (cross)). Decoders for WAV/FLAC/MP3/Vorbis shipped with zinc:audio (ZN-390). Missing: the audio importer (QOA, IMA ADPCM, Opus, loudness, resampling), streaming from packs with a small resident set, bytes-per-codec report. Too big as one task.
<!-- SECTION:NOTES:END -->
