---
id: ZN-751
title: 'zinc:video on Android and iOS with the platform decoders; hero exports'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-16 23:14'
updated_date: '2026-10-16 23:40'
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
- [x] #1 examples/hero exports with zinc export --target android and --target ios and runs: its video plays on the Android emulator or the Nexus 7 and on the iOS simulator (screenshots, frame times)
- [x] #2 examples/video (or the zinc:video test program) plays a file and a playlist on both phones; seek and loop work
- [x] #3 a T0 test with no Apple or Android tool (export trees), and the desktop video tests unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent): done.
- Android: plugins/video/native/video.android.cpp, player.h's backend: AMediaExtractor over the file's descriptor (open() here: the extractor never reads app files by path), AMediaCodec rendering into an AImageReader of YUV_420_888 (API 24 = the export's minSdk; the layout CTS requires of every decoder there, with each plane's strides and the crop, so no vendor colour format, stride or slice height is guessed); a decoder that refuses the reader's window decodes to ByteBuffers (COLOR_FormatYUV420Planar, SemiPlanar, Qualcomm NV12 32m; stride and slice-height from the output format, 0 or short means the height; tiled formats refused in the log); ZINC_VIDEO_BYTEBUFFER=1 forces that path. Scaled (nearest sample) and converted to 0x00RRGGBB on the decode thread with the webOS backend's arithmetic (BT.601 / BT.709 from 720 lines, the format's colour-range). Decoder name via AMediaCodec_getName (API 28, dlsym). Links mediandk, android, log.
- iOS: plugins/video/native/video.ios.mm: AVAssetReader + AVAssetReaderTrackOutput in kCVPixelFormatType_32BGRA (VideoToolbox), loadTracksWithMediaType (tracksWithMediaType is deprecated in iOS 18) waited on a semaphore; the picture only scaled to the box (row copy at 1:1, alpha masked). Manual reference counting like camera.macos.mm; ZRT_HOSTED_CPP (AVFoundation brings <new>). Frameworks AVFoundation, CoreMedia, CoreVideo, Foundation.
- plugin.json android/ios entries; tests/data/plugins-table.txt row updated. No audio (none on the desktop either). Seek: zinc:video has no seek(seconds) on any target; jump(i)/previous() restart an entry (hero's Restart) and are what the test proves.
- Proof, AC1: zinc export examples/hero --target android --apk --abis arm64-v8a, emulator API 37 arm64 (Pixel_10, headless), bbb.mp4 copied into files/media with run-as: decoder c2.goldfish.h264.decoder (mediacodec), 224 pictures in 9.2 s (24/s), 1 dropped at start, conversion 0.8 to 5.4 ms; 600 frames ZINC_PROFILE: work p50 0.26 / p99 11.8 ms, present p50 16.4 ms. ByteBuffer path: colour 0x13 stride 640 slice 360, plays the same. iOS: --ipa --simulator, iPhone 17 simulator (iOS 26.3, created and deleted): avc1 (avfoundation), 231 pictures in 9.5 s, 0 dropped, copy 0.1 to 0.4 ms; 600 frames: work p50 0.27 / p99 7.2 ms. Screenshots docs/reports/zinc-next-android/hero-video.png, zinc-next-ios/hero-video.png.
- AC2: tests/data/mobile-video (two clips in assets/, playlist looping, jump(1), previous()): the Mac (h264 videotoolbox), the Android emulator and the iOS simulator print entries 0,1,0 (loop 1), jumped to 1, back to 0, video ok (Mac 261 shown 0 dropped; Android 260 / 1; iOS 259 / 2).
- AC3: tests/t0/video_phone.sh (exports, clips, backends compiled -Wall -Wextra -Werror for NDK arm64 and armv7a and the iOS simulator SDK when present); T1 video passes unchanged (video.host.cpp untouched); export_android, export_ios, app_library, plugin_manifest pass.
- Nexus 7 not used: dev.zinc.music was in front the whole session.
- Decision text (for the coordinator): "zinc:video on phones uses the platform decoders behind player.h: Android AMediaCodec into an AImageReader of YUV_420_888 (CTS-guaranteed layout with strides; ByteBuffer planar/semi-planar fallback), iOS AVAssetReader in 32BGRA; converted to the runtime image on the decode thread. Rejected: FFmpeg on phones (size, licence of the codecs, no hardware decode without MediaCodec/VideoToolbox glue anyway), ByteBuffer-only on Android (vendor colour formats and slice-height quirks on old devices; flexible YUV has no NDK Image API), a SurfaceTexture/EGLImage path (the software raster is the default on phones; it belongs with the GPU replay). Revisit when the GPU replay is the phone default (zero copy) or when a device's decoder refuses both paths."
- later.md lines: "- ZN-751: zinc:video audio on phones (AAudio / AVAudioEngine) with the video clock slaved to it, as the desktop follow-up"; "- ZN-751: zinc:video seek(seconds) on every backend (av_seek_frame, AMediaExtractor_seekTo, AVAssetReader timeRange, GStreamer seek); today jump(i) restarts an entry"; "- ZN-751: zinc:video keeps decoding while an Android app is in the background (hero played on behind another app): pause players on the lifecycle pause"; "- ZN-751: a zinc export run with ZINC_DETERMINISTIC=1 silently compiles a plugin's fake (video.next.ts) instead of its native code: the export should ignore it"; "- ZN-751: hero on a phone is laid out wider than the screen (the Video card is cut at the right on the Pixel 10 emulator and the iPhone 17 simulator)"; Cross-platform pass: "- ZN-751: zinc:video on the Nexus 7 (Tegra 3 MediaCodec: which path, which colour format) and on an iPhone".
<!-- SECTION:NOTES:END -->
