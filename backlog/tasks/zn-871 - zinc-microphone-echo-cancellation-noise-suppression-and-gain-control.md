---
id: ZN-871
title: 'zinc:microphone: echo cancellation, noise suppression and gain control'
status: Backlog
assignee: []
created_date: '2026-10-30 14:54'
labels:
  - media
  - size-M
milestone: m-28
dependencies: []
ordinal: 175
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Calls without headphones need acoustic echo cancellation; zinc:webrtc lists it as missing. Vendor a proven processor (webrtc-audio-processing AEC3/NS/AGC, BSD-3) and apply it with the speaker output as the reference; an option on the microphone stream, used by zinc:webrtc and the Discord voice plugin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An option enables AEC, NS and AGC on a microphone stream
- [ ] #2 A test with a recorded far-end and a mixed near-end shows the echo attenuated by at least 20 dB (ERLE)
- [ ] #3 examples/webrtc-call uses it
<!-- AC:END -->
