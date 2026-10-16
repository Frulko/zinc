---
id: ZN-751
title: 'zinc:video on Android and iOS with the platform decoders; hero exports'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-16 23:14'
labels:
  - mobile
  - media
  - size-L
milestone: m-26
dependencies:
  - ZN-628
ordinal: 201600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16 ("regarde ce que tu peux améliorer sur android et passe à ios"): examples/hero and every program using zinc:video cannot be exported to a phone today, because zinc:video needs FFmpeg's libavformat (ZN-628 step 4, its plan in the ZN-628 notes). Give zinc:video an android entry on AMediaExtractor + AMediaCodec (NDK, API 21+; NV12/YUV420 output converted the way the webOS backend does, or a SurfaceTexture/EGLImage path when the GPU replay is on) and an ios entry on AVAssetReader in 32BGRA (VideoToolbox decode), both behind the existing player.h, with plugin.json android/ios entries (D127). Audio of the video through the existing audio path if it has one on phones, else note it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hero exports with zinc export --target android and --target ios and runs: its video plays on the Android emulator or the Nexus 7 and on the iOS simulator (screenshots, frame times)
- [ ] #2 examples/video (or the zinc:video test program) plays a file and a playlist on both phones; seek and loop work
- [ ] #3 a T0 test with no Apple or Android tool (export trees), and the desktop video tests unchanged
<!-- AC:END -->
