---
id: ZN-731
title: >-
  Zero-copy video: from the hardware decoder to the screen without a CPU copy
  (Raspberry Pi first)
status: Backlog
assignee: []
created_date: '2026-10-12 13:56'
labels:
  - perf
  - video
  - size-L
milestone: m-21
dependencies: []
ordinal: 492410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, at the Pi 3B+: 'we want performance, zero-copy; no milliseconds lost without a reason; a video must be fast'. Today a decoded picture goes through CPU memory, a swscale conversion to BGR and the software rasterizer (plugins/video/native/video.host.cpp, the IMAGE command of a dyn image): the film of museum-table shows about 11 pictures a second on the Pi (ZN-730 removes the 30 ms of raster a picture costs under a matrix, the copies stay). The research on the paths (decoder dmabuf, KMS plane composed by the Pi's HVS, EGLImage, what mpv, Kodi and flutter-pi do, the other targets) is docs/reports/video-zero-copy.md: read it, then docs/reports/gpu-renderer-design.md section 7b and decision D111 (the UI stays in software on VideoCore IV: video, maps and 3D go to hardware layers under or over it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The design is chosen from the research and recorded as a decision (scored as RULES 4 says): how a decoded picture stays a dmabuf, how a display driver places it (a KMS plane, a GPU texture), what the software rasterizer does when no driver takes it
- [ ] #2 On the Pi 3B+ the decoder is the hardware one and its pictures reach the screen without a CPU copy or a CPU colour conversion when the video is an upright rectangle; the proof is a counter or a trace that shows no pixel of the picture touched on the CPU
- [ ] #3 museum-table's film and hero's Video tab on the Pi: 24 and 30 pictures a second shown without a dropped picture over a minute, with the CPU of the whole program measured before and after (tools/device), at 1400 MHz
- [ ] #4 What the hardware path cannot draw (a turned card, a rounded clip, a blend) falls back to today's path and looks the same; subtitles and UI drawn over the video stay in front of it; a test covers the fallback
- [ ] #5 The other targets keep working: macOS (VideoToolbox) and the software targets pass their video tests unchanged; the zero-copy route of each (macOS first) is a line of later.md or done
- [ ] #6 Numbers in docs/reports/raspberry-pi.md and the performance log
<!-- AC:END -->
