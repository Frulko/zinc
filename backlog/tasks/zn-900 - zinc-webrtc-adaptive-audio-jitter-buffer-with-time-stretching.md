---
id: ZN-900
title: 'zinc:webrtc: adaptive audio jitter buffer with time stretching'
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
labels:
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-899
ordinal: 594460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the fixed 60 ms audio buffer: target = 2 x p95 inter-arrival jitter, clamped 40 to 300 ms; shrink and grow by time-scaling speech with Sonic (Apache-2.0, vendored under plugins/webrtc/vendor with PIN) instead of dropping or inserting silence; jitterBufferDelay and jitterBufferTargetDelay in getStats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With 30 ms jitter the buffer settles near 60-80 ms; with none it returns to 40 ms within 10 s
- [ ] #2 No click or gap when it resizes (no zero runs in the decoded output, test)
- [ ] #3 Mouth-to-ear <= 250 ms at 100 ms RTT and 30 ms jitter, measured with the loopback
<!-- AC:END -->
