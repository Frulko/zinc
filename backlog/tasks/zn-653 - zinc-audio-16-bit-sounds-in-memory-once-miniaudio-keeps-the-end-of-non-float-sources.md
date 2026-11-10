---
id: ZN-653
title: >-
  zinc:audio: 16-bit sounds in memory once miniaudio keeps the end of non-float
  sources
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 17:57'
updated_date: '2026-11-10 12:50'
labels:
  - audio
  - size-S
milestone: m-22
dependencies: []
priority: low
ordinal: 19500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Check whether the vendored miniaudio still drops the last frames; if fixed, bump and store 16-bit (halves memory, test a 480-frame clip); if not, drop the task.

Found in ZN-390: miniaudio 0.11.25 (and its master on 2026-10-10) drops the last frames, up to 512, of any non-float sound (a 960-frame 16-bit clip played 512 frames, a 480-frame one nothing), so zinc:audio keeps every sound as float: 21 MiB per minute of 44.1 kHz stereo. Reporting it upstream is the owner's step (the reproduction is in the notes of ZN-390). May fold into ZN-440.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the upstream report exists and is linked
- [x] #2 a 480-frame 16-bit clip is heard whole (test)
- [x] #3 the memory of a loaded 16-bit sound halves
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Upstream report is the owner's step. Memory for long sounds matters on modest machines. Evidence: plugins/audio keeps all sounds as float

2026-11-10 — completed in work/653, isolated worker tree.

**Upstream research.** Existing public report [miniaudio #1125](https://github.com/mackron/miniaudio/issues/1125) describes an entire short source disappearing when a read exceeds its remaining frames. [Fix 5bf32c47](https://github.com/mackron/miniaudio/commit/5bf32c47e582ec18ac166367fd86bb1e4b512b16) keeps MA_SUCCESS while converted frames remain in the sound cache; [0.11.26](https://github.com/mackron/miniaudio/releases/tag/0.11.26), released 2026-10-31, includes it. No upstream message was sent. The report already exists, so AC1 needs no outward-facing owner action.

**Implementation.** Pin miniaudio 0.11.26 unmodified (archive SHA256 838ba55a21c9142adf7b76bdc4351e5cd8b7ae128f46b25ec25f94ae9969c600, header 6b376c7fbb1352ba1e0e432ab66069b335ea9405e45cb6c30b97ef0f3c9c3e0e); LICENSE and stb_vorbis hashes are unchanged. Updated inventory, manifest description and its fixture. A decoder probe selects s16 only for a native s16 source (16-bit WAV/QOA); every other source keeps the existing float conversion, including higher-precision WAV and the FLAC/MP3/Vorbis decoders. Tone, fromSamples, streaming rings and loadMusic stay float. Clip carries its format through progressive decoding, buffer reads, playback and normalized samples(). No engine, allocator, HAL, UI or API change.

**Decision proposal for the coordinator.** Choose native-s16/otherwise-float over forcing every source to s16 (loss of source precision) or keeping all native formats (changes the old 8-bit normalization). It adds one decoder initialization per load, without decoding PCM twice. No timing or speed claim. Revisit only if that extra initialization becomes a measured first-load bottleneck.

**Proof.** `ZINC=<common>/build/zinc tests/run --only audio_storage`: PASS, 1 passed/0 failed. The production HostAudio test checks every mixed sample and the final marker of 240/480/960/2000-frame mono and stereo clips, then silence and end state. It compares normalized samples() to the float decoder, preserves 8/24/32-bit and float WAV behavior plus tone/fromSamples precision, drives the real progressive QOA decoder thread, and checks partial-buffer silence/cursor/format transitions. The same test against the original 0.11.25 header fails at the mixed-sample assertion; the exact 0.11.26 header hash was restored. A public-API 480-frame fixture passes zinc check, interpreter, QuickJS and an explicit native AOT build/run: `480-frame clip whole true playing false`, `computed precision true`, `tone true frames 480`. Default zinc run is the interpreter; the AOT claim comes from zinc build and running its executable. All runs were bounded/headless; no output device or window opened and no process remains.

**Memory and artifacts (aarch64 macOS).** The test instruments actual decoder allocation callbacks: PCM capacity for each short mono clip is 16,384 bytes in float versus 8,192 in s16; stereo is 32,768 versus 16,384. This is allocated capacity (4096 frames), not just logical sample bytes. The actual progressive 48,000-frame mono QOA PCM allocation is 96,000 bytes; the previous float allocation formula requests 192,000. These numbers concern PCM storage, not total RSS, the caller's encoded bytes, decoder temporaries or total sound-object memory. The format field adds a fixed 2 KiB to the 256-slot table on this 64-bit ABI (64 to 72 bytes/slot). Public native feature executable 5,791,792 bytes, SHA256 be2d4d559d568ff9448880ca40c5946b7f5c1297fcfab58581ea5dcf72e434f0. Built plugin dylib 1,023,040 bytes (SHA a12b13d60cdcf8a711e243c7723745fb448993c91202c5f0ac5835966fdf4e5e); its binding archive 332,224 bytes excludes the separate vendor archive. No artifact-size reduction claim.

**Provenance and limits.** Read-only common compiler source f8e61be28, SHA256 17ffede27ec51d37cee17c44bd0aa1bd9ca1553f390c1df1472d72daeaf09538, with this worker's plugin sources through ZINC_ROOT; no full engine build. Proof logs/source/binary: `.logs/audio-653/`; cached plugin `~/.zinc/cache/macos/plugins/audio-8b84ae3a8b63957c`. No physical listening, cross-platform/device run, suite, benchmark or long soak. Other miniaudio consumers (asset encoder, microphone, Discord voice) were read and keep their existing interfaces; their broader checks remain proposed. The unmodified upstream header has one added trailing-space line (31454); owned files pass diff --check. No later.md line or new decision number requested.

usage: n/a (tools/usage).

**Proposed tests** (owner chooses; estimates, memory unmeasured):
- `tests/run --only audio`: existing decoder/mixer feature across interpreter/AOT, about 10–20 s with warm plugin cache, under 200 MB estimate.
- `tests/run --only audio_music` and `--only audio_stream_pack`: unchanged float music/looping paths after the vendor bump, about 5–20 s each, under 200 MB estimate.
- `tests/run --only audio_import`: asset encoder uses the same vendored header, about 5–15 s, under 200 MB estimate.
- `tests/run --only voice_aec` and `--only discord_echo`: other shared-miniaudio consumers, about 10–30 s each, under 300 MB estimate.
- The 480-frame public fixture on the Pi/Mojave/OptiPlex and a low-volume physical device check: native playback/cross portability; about 10 s plus one plugin build, memory unmeasured.
<!-- SECTION:NOTES:END -->
