---
id: ZN-555
title: 'zinc:audio on the Pi: ALSA, HDMI and the static build'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-390
ordinal: 54200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Build and run the audio plugin on Linux, play game-2d sounds on HDMI and jack on the Pi 3B+, snd-aloop test, decide tinyalsa or no audio for static builds, document I2S overlays.

Make the miniaudio backend of ZN-390 work on every Pi: ALSA through alsa-lib devices (sysdefault or hdmi for vc4hdmi, which accepts only IEC958_SUBFRAME_LE on hw:), PipeWire or Pulse on desktop images, I2S DAC overlays. Decide the static armhf story: a tinyalsa custom backend or no audio. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 snd-aloop round-trip test passes in Linux CI
- [ ] #2 HDMI and the 3.5 mm jack play the game-2d sounds on the Pi 3B+
- [x] #3 the I2S DAC setup is documented with its overlay
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. zinc:audio uses miniaudio, which picks ALSA/Pulse at run time (docs/plugins/audio.md:17, "not built or run yet" on Linux). First step is to prove it on the Pi 3B+ (HDMI, jack), then the static armhf story. Carries ZN-533. Evidence: docs/plugins/audio.md:17; plugins/audio/native/audio.host.cpp
Review 2026-10-25: merged ZN-533 here (PocketCHIP audio through zinc:audio). Carry over: PocketCHIP audio: the same ALSA / tinyalsa static-flavour question as ZN-555; carry the speaker/headphone routing. ZN-555 already asks to decide the static armhf audio story (tinyalsa custom backend or none) for miniaudio. Carry the PocketCHIP speaker/headphone routing on sun4i-codec and 'static flavour has no libasound' as a criterion.
Review 2026-10-25: merged ZN-651 here (zinc:audio on Linux: build the plugin and play through ALSA or PulseAudio). Carry over: The task says itself it may fold into ZN-555 (Pi audio backends); same ALSA/PulseAudio work, cross pass. The task itself says it may fold into ZN-555 (Backlog). Carry tests/t1/audio.sh in the Linux container and the PulseAudio/PipeWire desktop case (ZN-555 is worded for the Pi) plus the linux row of docs/plugins/audio.md.
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)


2026-11-12 documentation/static-policy increment (isolated work/555-audio-platform):

- AC3: docs/plugins/audio.md now gives an exact Raspberry Pi DAC+ example with rpi-dacplus, HAT auto-detection/manual fallback, image-owner boot edit/reboot instructions, named ALSA-card/default routing and desktop audio-server guidance. Different HATs require their own overlays; no card0, control or physical pin is guessed. The configuration recipe was reviewed against official Raspberry Pi HAT docs and ALSA's plug/PCM grammar; it was not applied to an image or run on hardware.
- Source review confirms Linux native implementation/manifest exist: HostAudio opens the default through ma_device_init, miniaudio 0.11.26 runtime-loads libasound.so.2/.so, Linux manifest links m/dl/pthread, backend() reports the actual backend or null. ZINC_AUDIO recognizes only null, not alsa/hdmi. Existing Mac/null Opus440.03 proof does not establish Linux audible output; the stale platform row now says actual Linux playback is unverified.
- Normal Linux keeps miniaudio and dynamically loaded OS libraries. The fully static flavour whose runtime cannot load those libraries has a silent/null support policy with explicit ZINC_AUDIO=null; this does not claim a particular static executable was built or run. No tinyalsa backend is implemented/vendored. Corrected old Pi/CHIP report wording that implied it existed; PocketCHIP sun4i-codec speaker/headphone routing remains unproven.
- Delegated primary research .logs/research-555-next.txt was read in full. Rechecked primary sources: https://www.raspberrypi.com/documentation/accessories/audio.html ; https://www.alsa-project.org/alsa-doc/alsa-lib/pcm_plugins.html ; https://github.com/alsa-project/alsa-lib/blob/master/src/conf/cards/vc4-hdmi.conf ; https://miniaud.io/docs/manual/index.html ; https://github.com/tinyalsa/tinyalsa . ALSA's vc4-hdmi configuration owns IEC958 conversion; TinyALSA's PCM/mixer interface does not replace card policy/conversion. No new library or custom packer is justified.

Validation: documentation diff/links/local anchors and source-fact assertions pass (.logs/audio555/validation.json/.log); git diff --check passes. No build, test suite, app/audio/device/SSH/OS/routing action, service, install, benchmark or performance measurement. No owned process remains. This is documentation only; no changelog line or new test.

Status: Backlog AC3 checked; AC1/2 open. The literal prepared snd-aloop integration harness is still unwritten (a software gap), and actual Linux default-device/HDMI/jack/Pulse/PipeWire/I2S/PocketCHIP output remains unproven. No hardware-only Review or whole-task completion claim.

Proposed decision: keep dynamic OS audio for normal Linux and silent/null support for runtimes without shared-library loading. Revisit audible static audio only on an actual prepared target, with explicit format negotiation, bounded streaming/XRUN recovery and route/playback proof. Scores (engineering judgement, fit/performance/size/maintainability/licence/portability/effort; weights3/3/2/2/2/1/1): existing+silent policy4/3/5/5/5/4/5=60; new tinyalsa backend5/3/3/2/5/4/1=49. Performance scores are unmeasured, not speed claims.

Proposed later line: ZN-555: write the prepared snd-aloop public playback/capture harness, then prove Linux/Pi HDMI/jack/I2S and PocketCHIP named routes; null-mixer tests cannot establish audible output.

Proposed selected tests (none run): prepared isolated snd-aloop roundtrip with existing arecord and private named-card ALSA default, requiring non-null ALSA backend (~10–15s, memory unmeasured); bounded game-2d sounds on already configured Pi HDMI and jack (~2–5s each, memory unmeasured); actual DAC+ and PocketCHIP speaker/headphone checks with image-owner routing (~10s, memory unmeasured). No module load, package install or global routing change belongs in the runner.

Usage: n/a.

<!-- SECTION:NOTES:END -->
