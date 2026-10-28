# Sidecar: video, audio and sync on a networked colour screen (research, 2026-10-28)

Research only: no code changed, no task created. Scope: the colour Sidecar (Mac `app/sidecar/mac/screen.swift` to a Raspberry Pi 3B+
running `app/sidecar-screen` on `plugins/display-fbdev`, protocol in `plugins/display-rmpp/stream.h`). Every claim is either sourced
(URL or file at the end of the section) or marked **[inference]**. Scores follow RULES.md §4 (fit x3, performance x3, size x2,
maintainability x2, licence x2, portability x1, effort x1; maximum 70).

## 0. Decision in short

1. **First, a day of cheap fixes in the lossless design (step 1).** Most of the tearing and patchwork the owner sees comes from the
   receiver, not from the codec. The stream thread writes each RECT straight into the surface that `fb_present` is converting at the
   same time, and `fb_present` runs on the app's 60 Hz loop, not when a picture is complete. So a refresh can show half of one picture
   and half of the next. On the Mac, the rough-then-exact rule redraws tiles that are still moving one by one at different times,
   which looks like a patchwork. A blocking `write()` on the same serial queue that handles ACKs also inflates the measured round trip.
2. **Then a hybrid codec (steps 2 to 4).** The still UI stays as lossless tiles. A region that keeps moving (a YouTube player)
   becomes one H.264 stream: VideoToolbox low-latency encode on the Mac, the Pi 3's `bcm2835-codec` decoder (`/dev/video10`) on
   the Pi, and its dmabuf shown on a KMS overlay plane under the UI plane. The plane path is the one ZN-731/ZN-735 already built
   into display-fbdev (`HalDisplay.layers`, `HAL_LAYER_HOLE`). This is RDP's "mixed mode" and what RetinaRelay switches to during
   full-screen video.
3. **Then audio with a shared clock (step 5).** Capture with a Core Audio process tap (macOS 14.2+, `mutedWhenTapped`, so the
   Mac goes quiet) or with ScreenCaptureKit audio. Encode with Opus restricted-low-delay (libopus is already vendored in
   `plugins/webrtc/vendor`). Estimate the clock offset NTP-style over the existing socket. Play through ALSA on HDMI, and show
   both the audio and the video picture at capture time + a fixed target latency (60 ms over USB or Ethernet, 120 ms over Wi-Fi).
   Correct drift by adding or dropping single samples, as Snapcast does.
4. **Keep TCP.** Add `TCP_NOTSENT_LOWAT` and drop frames *before the encoder*, never after. Consider UDP + FEC only if Wi-Fi
   measurements after step 4 show stalls caused by retransmits.
5. **Do not adopt Kyber, Sunshine or Moonlight wholesale.** Their licences are AGPL-3 (Kyber, dual-licensed) and GPL-3, and the
   two ends are different machines. Copy their techniques instead: QUIC-like stream multiplexing, a push pipeline with no buffering
   in the decoder, drop-before-encode, DRM-plane presentation.

Expected result for a 1080p YouTube video on the Pi 3B+ (an estimate, see §6): about 8 to 12 Mbit/s instead of 25 to 38. Over
USB-C, about 40 to 60 ms from motion to light, with audio locked at a 60 ms target. Over Wi-Fi, 5 to 8 Mbit/s with a 100 to 120 ms
A/V target, and no more stutter as long as the link carries 10 Mbit/s steadily.

## 1. What is happening now (repo reading)

- **Mac** (`app/sidecar/mac/screen.swift`). ScreenCaptureKit captures BGRA from a `CGVirtualDisplay` at 60 Hz
  (`minimumFrameInterval` 1/60, `queueDepth` 4). Tiles are 64 px. The changed runs go through PNG Sub + zstd 1 on every core
  (`concurrentPerform`) and are then written with a **blocking `writeFull` on the serial queue `q`** (lines 200-203). ACKs are
  handled by `q.async` on that same queue, so they wait until the whole picture is in the socket. The round trip measured from
  them (`stats.rtt`) therefore includes the time spent writing into the socket. A picture goes rough (5-6-5) when a sixth of the
  screen changed or the previous picture is not acknowledged yet. A rough tile that has rested 300 ms is sent again exact, tile by
  tile (lines 159-185).
- **Wire** (`stream.h`). It is RECT/COPY/CURSOR with the `more` flag, so the receiver knows where a picture ends. There is no
  timestamp, no picture number and no audio.
- **Receiver** (`plugins/display-fbdev/fbdev.cpp` lines 724-760 and 873-883; `stream.h` lines 440-472). The stream thread
  decodes each RECT and **writes it into `surf` at once**. Only at the picture's last RECT (`flush`) does it call `t.update`,
  which grows the `streamed` box. `fb_present` takes that box whenever the app's frame loop calls it and converts `surf` into
  the back buffer. The ZN-735 flip path (on by default, `ZINC_FBDEV_FLIP`) then commits at the vblank. The vblank flip removes
  scan-out tearing, but nothing stops the conversion from reading `surf` while the stream thread writes the next picture into it.
  That gives **mixed pictures, with tile-shaped seams**: the "tiling" the owner sees.
- **Measured** (brief). In a full-motion area: 77-118 KB per picture, 26-56 fps, 66-99% rough, round trip p95 up to 200 ms over
  USB, and 139 KB queued in the socket. 100 KB per picture at 40 fps is 32 Mbit/s. That is above what Wi-Fi gives (10-35 Mbit/s),
  so on Wi-Fi the stream can only stutter. Over USB-C the link has room (245 Mbit/s), so the 200 ms is queueing and receiver
  time, not the wire **[inference]**.

## 2. What others do (question 1)

| System | Codec and split | Transport | Latency tricks | Licence / usable here |
|---|---|---|---|---|
| **Kyber** (VideoLAN people, J-B Kempf) | "All codecs", FFmpeg push server; NVENC, QSV, AMF, VA-API backends (Windows/Linux servers; macOS server "coming soon") | QUIC multiplexing video, audio, input, files and USB on one encrypted connection; `kymux` also has a non-QUIC custom transport | Push pipeline encoder to decoder to display; a modified VLC clock; Rust; restarts the video server when the resolution or codec changes; claims 8 ms glass-to-glass; says it does *not* care about A/V sync or constant latency, only the lowest latency | AGPL-3 or commercial. Cannot be vendored into Zinc; no macOS server and no Pi 3 client. Worth copying: restart on topology change, push without buffering, one multiplexed connection |
| **Moonlight / Sunshine** | H.264/HEVC/AV1, whole screen | Video RTP on UDP 47998, audio RTP/Opus on UDP 48000, control on ENet UDP 47999; audio FEC 4 data + 2 parity Reed-Solomon packets | moonlight-qt's DRM renderer: `AV_PIX_FMT_DRM_PRIME` frames straight onto a plane, one atomic commit per frame, frames kept referenced while scanned, "does not buffer any frames in the graphics pipeline"; on Pi builds EGL is off by default | GPL-3. The DRM renderer is a reference recipe for step 3; Pi 3 numbers not found |
| **Parsec** | H.264/H.265 whole screen, optional 4:4:4 | Proprietary UDP protocol (BUD) | Closed **[inference, not re-fetched]** | Not usable |
| **RDP 8.1/10 (MS-RDPEGFX)** | "Mixed mode": H.264 for pictures, a separate codec for text; AVC444 (two 4:2:0 streams) because H.264 leaves halos around text; RemoteFX progressive codec | TCP or UDP | Region-based: lossless for text, video codec where it pays | The model for the hybrid |
| **SPICE** | Detects video regions and streams them as MJPEG (later GStreamer codecs) | TCP | QEMU turned detection **off by default** because the heuristics took desktop animations for video and left JPEG artefacts on the desktop | A warning for our detector: demand a sustained rate, a size and a fill ratio, with hysteresis |
| **Apple Sidecar / AirPlay mirroring** | HEVC/H.264 whole screen | Proprietary | Closed **[inference]** | Not usable |
| **RetinaRelay** (Mac to old iMac) | GPU block-texture format + lossless pass on cables (14-19x on a desktop); a video codec on Wi-Fi, 100 Mbit Ethernet, and gigabit during full-screen video; automatic quality step down when full-screen video starts, back up 1-2 s after | Unencrypted TCP over a point-to-point cable, Wi-Fi fallback | Cursor drawn by the receiver; measured 32-40 ms Mac to screen (gigabit, 5K60), Wi-Fi 65 to 39 ms; audio through a virtual audio device "tracks the same measured delay as the video" | Closed. Its design is the closest to ours and confirms the hybrid plus a shared fixed delay |
| **Deskreen** | WebRTC to a browser | WebRTC (UDP, SRTP) | Browser jitter buffer | Not for a Pi console app |
| **WebRTC** | VP8/H.264, GCC congestion control, NACK/FEC, jitter buffer, playout-delay extension | UDP | Adaptive delay | Zinc has `plugins/webrtc`, but its receive path is CPU decode and adds jitter buffering **[inference]** |
| **scrcpy** | H.264 from Android MediaCodec | TCP over adb, no buffering, shows the latest frame | 35-70 ms typical **[inference, not re-fetched]** | Proves that TCP plus showing the latest frame is fine on a clean cable |
| **NDI** | SpeedHQ intra-only (about 100+ Mbit/s at 1080p) or NDI\|HX (H.264/HEVC) | TCP/UDP multicast on LAN | Intra-only = no reference chain **[inference]** | Proprietary SDK |
| **Steam Link on Pi 3** | H.264 1080p60 decoded by the Pi 3's firmware decoder | UDP | Reported 1080p60 over 5 GHz Wi-Fi "with a little latency"; ~20 ms network+render in the 2018 beta; one outlier user report of 170-330 ms on wired | Closed; shows that the Pi 3's VPU can decode a 1080p60 low-latency stream |

Sources: [Kyber README](https://gitlab.com/kyber/kyber/-/raw/main/README.md), [Kyber remote desktop](https://kyber-front-71c4b9.gitlab.io/page/remote-desktop),
[Kempf interview](https://streaminglearningcenter.com/codecs/an-interview-with-jean-baptiste-kempf-of-kyber.html),
[Moonlight protocols (Wolf)](https://games-on-whales.github.io/wolf/stable/protocols/index.html), [RTP Opus FEC](https://games-on-whales.github.io/wolf/stable/protocols/rtp-opus.html),
[moonlight-qt drm.cpp](https://raw.githubusercontent.com/moonlight-stream/moonlight-qt/master/app/streaming/video/ffmpeg-renderers/drm.cpp),
[RDP 10 AVC/H.264](https://techcommunity.microsoft.com/t5/microsoft-security-and/remote-desktop-protocol-rdp-10-avc-h-264-improvements-in-windows/ba-p/249588),
[MS-RDPEGFX AVC444v2](https://msdn.microsoft.com/en-us/library/3b337b87-f478-4786-a63b-97794aa72075), [QEMU: SPICE streaming-video off](https://qemu.googlesource.com/qemu/+/f1d3e586f069e17f83b669842bc02d60d509daca),
[RetinaRelay FAQ](https://retinarelay.com/faq), [RetinaRelay changelog](https://retinarelay.com/changelog),
[Steam Link Pi guide](https://core-electronics.com.au/guides/how-to-stream-steam-games-to-your-raspberry-pi-with-steam-link/), [cnx-software Steam Link Pi 3](https://www.cnx-software.com/2018/12/06/steam-link-raspberry-pi-3-board/?amp=1).

## 3. Options scored

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| A. Lossless only, with the cheap fixes of §5 | 3 | 2 | 5 | 5 | 5 | 5 | 5 | **55** |
| **B. Hybrid: lossless tiles + H.264 video region on a KMS plane (after A)** | 5 | 5 | 4 | 3 | 5 | 4 | 2 | **60** |
| C. Whole screen as H.264/HEVC (Moonlight style) | 3 | 4 | 4 | 4 | 5 | 4 | 3 | 54 |
| D. Adopt Kyber or Sunshine/Moonlight | 2 | 4 | 2 | 2 | 1 | 3 | 2 | 33 |
| E. GPU block-texture frames (RetinaRelay cable mode) | 3 | 2 | 4 | 3 | 5 | 3 | 2 | 44 |

- **C**: text halos at the bitrates Wi-Fi allows (the reason RDP built AVC444). The Pi 3 decoder stops at 1920x1920, so C has no
  way to 5K. Every still frame also costs decode time and power.
- **E**: the Pi 3's GPU path is slower than software for UI (D111), and VideoCore IV reads ETC1 only.
- **B** keeps A's strengths for the desktop (exact text, bytes proportional to change, scales to 5K for UI) and moves only the
  moving pixels to the hardware. A is its first step, not an alternative.

## 4. The video path (question 2)

**Mac encoder.** `VTCompressionSession` H.264, with `kVTVideoEncoderSpecification_EnableLowLatencyRateControl` in the encoder
specification. This is hardware only; Apple says it saves up to 100 ms at 720p30; FFmpeg's support notes that it removes frame
reordering and encodes one frame in, one frame out. Set `RealTime` true, `AllowFrameReordering` false, profile High, level 4.2,
`AverageBitRate` + `DataRateLimits`, a long `MaxKeyFrameInterval`, and a keyframe on demand (new region, receiver error).
HEVC is also accepted in low-latency mode (FFmpeg enabled it in 2023), but the Pi 3 has no HEVC decoder, so the receiver
announces `+h264` or `+hevc` and the Mac picks. One known failure is `-12902` at session creation: fall back to a normal real-time
session. VT converts BGRA to YUV in hardware. The region is cropped by copying its rows into a pooled `CVPixelBuffer` (about 1 ms for
720p BGRA **[inference]**). On a region size change, a new session is created, as Kyber restarts on topology change.
Sources: [WWDC21 10158](https://developer.apple.com/wwdc21/10158), [FFmpeg low-latency VT commit](https://ffmpeg.org/pipermail/ffmpeg-cvslog/2023-May/137359.html),
[HEVC low-latency patch](https://ffmpeg.org/pipermail/ffmpeg-devel/2023-September/313753.html).

**Region detection (Mac).** For each tile, keep a 1-bit history of the last 30 captures. A tile is *moving* when it changed in at
least 12 of them. A region is the bounding box of connected moving tiles when it is at least 256x144, at least 70% of its tiles are
moving, and that holds for 0.5 s. It ends 1 s after its tiles stop changing; then the region is resent as exact tiles. Align it
to 16 px and keep it fixed while it lasts (the video's place does not move). SPICE's failure (animations taken for video) is
the reason for the fill ratio, the size and the hysteresis. A YouTube video runs at 24 to 30 fps, and SCK only delivers changed
frames, so the encoder sees about 30 fps even at a 60 Hz capture **[inference]**.

**Pi decoder.** `bcm2835-codec` on `/dev/video10`: stateful M2M, H.264/MPEG-4/MJPEG/H.263, no HEVC, 32x32 to 1920x1920. It hands
out `YU12`/`NV12` dmabufs; FFmpeg 7.1.3 rpt1 on the board gives `AV_PIX_FMT_DRM_PRIME` with a `get_format` callback alone
(`docs/reports/video-zero-copy.md` §1, §9; this was built in ZN-731). The Pi 3 is officially 1080p30 for H.264. Steam Link
reached 1080p60 on Pi 3 in practice, and a video region is usually smaller than 1080p and at most 30 fps. **The open risk is
decoder delay.** V4L2 M2M wrappers can hold several frames: a 2021 FFmpeg patch cut a real-time 60 fps stream on a Pi 4 from
about 200 ms to about 20 ms by dequeuing output before more input is given, and a 2024 report on a Pi Zero 2 (the Pi 3's VPU)
asks about the same N-frame delay without an answer. Plan:
use libavcodec `h264_v4l2m2m` (system library on Pi OS, as `plugins/video` already does) with `AV_CODEC_FLAG_LOW_DELAY` and few
capture buffers, and make sure the SPS says `max_num_reorder_frames=0` (VT low-latency should; rewrite the VUI if not). Measure
frames in vs out. If the delay is above one frame, drive `/dev/video10` directly: the V4L2 stateful decoder API is a few hundred
lines and lets us dequeue as soon as a buffer is ready. libcamera is not involved. Steam Link's Pi build used the closed firmware
path and gives no recipe to copy.
Sources: [FFmpeg v4l2m2m dequeue patch](https://patchwork.ffmpeg.org/comment/69170/), [Pi Zero 2 delay thread](https://ffmpeg.org/pipermail/libav-user/2024-May/013484.html),
[bcm2835-codec level 4.1/4.2 mapping patch](https://lore.kernel.org/linux-media/20240303152635.2762696-1-maarten@rmail.be/T/).

**Presentation.** Already there: display-fbdev puts a `HalPicture` dmabuf on an HVS overlay plane under an ARGB8888 plane that
carries the software frame. The rasterizer's `HAL_LAYER_HOLE` pixels are transparent, and one atomic commit per vblank shows both
(`runtime/include/hal.h` `HalLayer`/`HalDisplay.layers`, fbdev.cpp lines 272-500, `docs/plugins/display-fbdev.md` "Hardware
layers"). ZN-731 measured an 854x480 YU12 plane scaled under an 800x480 ARGB plane at 24-30 fps with no refused commit and
no late flip. For the sidecar, the stream thread hands the decoded frame and the region rectangle to the same layer list and fills
the region with `HAL_LAYER_HOLE` in `surf`. The cursor and any UI drawn over it come out as opaque pixels on the top plane.
The HVS does the colour conversion and any scaling, the CPU never touches video pixels, and the flip is vsync-locked, which is
the same recipe as moonlight-qt's DRM renderer and mpv's `drmprime-overlay`. Not measured yet: 1080p NV12 + 1080p ARGB on the
Pi 3's HVS at once (an HVS bandwidth limit is possible; the driver already test-commits and falls back to software).

**Pi 4/5 and 5K.** The Pi 4 decodes HEVC 4Kp60 and H.264 1080p; the Pi 5 has HEVC only, with H.264 in software
**[inference, not re-fetched]**. Hence the `+h264`/`+hevc` capability. A 5K screen is beyond every Pi decoder for full-screen video.
The hybrid still scales for the desktop (bytes follow the change, not the resolution), but 5K full-screen video needs a desktop-class
receiver, as RetinaRelay's iMac. Keep the codec choice per receiver.

## 5. Cheap wins inside the current design (question 5)

1. **Picture-atomic presentation** (the main cause of "le tiling"). The stream thread must never write into `surf` while
   `fb_present` converts it, and a present must only show whole pictures. Two ways:
   - **lock**: the stream thread takes `stream_mu` at a picture's first RECT and releases it after `flush`; `fb_present` holds it
     while it reads the streamed box;
   - **staging**: decode a picture into a side buffer and copy it into `surf` under the lock at `flush` (more memory; the lock is
     held only for a memcpy).

   Start with the lock: decode per picture is a few ms on 4 cores, against a 16.7 ms refresh **[inference: measure with the ACK's
   decode µs]**. Also have `flush` wake the main loop, so a finished picture goes out at the next vblank instead of waiting for
   the app's tick.
2. **Rough without a patchwork.** A tile that is part of a moving area (the 30-capture history of §4) stays rough until the
   whole connected area has rested 500 ms. The exact repaint then goes out as **one picture for the whole area**, not tile by tile
   on 300 ms timers. The rough decision is made per area with hysteresis, not per picture, so neighbouring tiles do not flip
   between rough and exact.
3. **Unblock the Mac's queue and stop buffer bloat.** Write from a dedicated writer thread or with non-blocking writes + `poll`,
   so ACKs are processed on time and the measured round trip is real. Set `TCP_NOTSENT_LOWAT` to about 32 KB, so the socket says
   "writable" only when little is unsent. On Darwin this governs only the wake-up (a large write still fills the buffer), so write
   one RECT at a time and stop at not-writable. Apple's own "snappy screen sharing" work (Stuart Cheshire, IETF 122) uses exactly
   this. Sources: [Cheshire, Source Buffer Management slides](https://datatracker.ietf.org/meeting/122/materials/slides-122-quic-ietf-122-stuart-cheshire-source-buffer-management-00),
   [draft-cheshire-sbm](https://www.ietf.org/archive/id/draft-cheshire-sbm-04.txt), [apenwarr summary](https://apenwarr.ca/log/20150414/another-thing-i-learned-from-stuart-cheshires-talk-a-couple-of-weeks).
4. **Drop, never queue.** This is already done: a newer capture replaces the waiting one. Keep at most 2 pictures in flight,
   and only 1 when the smoothed round trip exceeds 2 frame intervals, so a slow link costs frame rate, not latency.
5. **Half-resolution rough.** For a moving area, send rough tiles at half resolution (a new RECT flag; the receiver doubles them).
   That is 4x fewer pixels, which would make 1080p video fit Wi-Fi even before a codec **[inference: ratio after zstd not
   measured]**. Optional: worth it only if step 2 is late.
6. **Capture pacing.** The virtual display is already 60 Hz (`CGVirtualDisplayMode refreshRate: 60`). Nothing more is needed, and
   `queueDepth` 4 does not add latency because the newest capture wins.
7. **Measure what matters.** Add a capture timestamp to each picture (it comes free with step 5's clock) and have the receiver
   report capture-to-commit time. Today's round trip mixes socket queueing, decode and ACK delay.

## 6. Audio and sync (question 3)

**Capture on the Mac.** There are two routes; take the first on macOS 14.2+.
- **Core Audio process tap**: `CATapDescription` of all processes except our own, with `muteBehavior = .mutedWhenTapped`, read
  through an aggregate device. The Mac's speakers go silent while the sound is captured, which is what a "move the sound to the
  other screen" user expects. Quirks: the IOProc only fires while something plays, and there are reports of all-zero buffers in some
  setups. Sources: [CATapMuteBehavior](https://developer.apple.com/documentation/coreaudio/catapmutebehavior.md),
  [AudioCap sample](https://github.com/MuShare/AudioCap), [forum: taps on HDMI](https://developer.apple.com/forums/thread/848578),
  [forum: zero buffers](https://developer.apple.com/forums/thread/825780).
- **ScreenCaptureKit** `capturesAudio = true`, `excludesCurrentProcessAudio = true`: it shares the screen capture's stream and
  needs no new permission, but it does not mute the Mac locally. The user must lower the Mac's volume, and whether SCK still
  captures with the output muted is **not verified**. The clock of SCK's sample buffer timestamps was questioned on Apple's
  forums with no answer; compare it against `mach_absolute_time` once at start. Source: [Apple SCK sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos.md).
- A virtual audio device (BlackHole-style AudioServerPlugIn, what RetinaRelay does) is the fallback for macOS < 14.2. BlackHole
  is GPL-3, so we would write our own from Apple's null-driver sample. Not needed if the tap works. macOS cannot attach an audio
  device to a `CGVirtualDisplay`, so the screen's HDMI audio is reached only through one of these routes.

**Codec.** Opus with `OPUS_APPLICATION_RESTRICTED_LOWDELAY`, 48 kHz stereo, 10 ms frames, 128 kbit/s. libopus 1.6.1 is already
vendored (BSD-3, `plugins/webrtc/vendor`). It decodes on the Pi CPU in well under 1% of a core **[inference]**. Moonlight
also uses Opus RTP with Reed-Solomon parity on UDP.

**Clock.** The Mac sends `CLOCK` pings with its host time. The Pi answers with its `CLOCK_MONOTONIC` time and its own receive and
send times. The Mac keeps the offset from the exchange with the smallest round trip in the last 8 s, as NTP's clock filter does
(USB RTT 2 ms means ±1 ms; Wi-Fi ±5 ms is fine for lip sync). The Pi needs the offset, so the Mac sends it back, or the roles are
swapped. Each picture and each audio packet carries its capture host time.

**Playout.** Target latency L (60 ms on USB/Ethernet, 120 ms on Wi-Fi; adjusted upward if late packets exceed 1%):
- audio is written to ALSA (HDMI) so that the sample captured at t plays at t + offset + L. A small ring of 2-3 periods of 5 ms
  is enough. miniaudio (vendored in `plugins/audio`) has an ALSA backend; raw ALSA is also fine.
- each video picture (codec region and lossless tiles alike) is committed at the vblank closest to t + offset + L. A picture
  that arrives late is shown at once and never queued behind a newer one.
- drift between the Mac's clock and the HDMI audio clock (tens of ppm) is corrected Snapcast-style. When the measured age error
  passes about 0.5 ms, add or drop one sample per few hundred; a hard resync happens beyond 50 ms. No resampler library is needed.
  Source: [snapcast-client stream.rs](https://docs.rs/crate/snapcast-client/0.12.0/source/src/stream.rs).
- Sunshine/Moonlight favour latency over sync, and Kyber says it does not care about A/V sync. RetinaRelay and Snapcast use a
  shared fixed delay, which is what a YouTube video on a secondary screen needs: lip sync matters more than 20 ms. Use the fixed
  L for video only while audio is playing; with no audio, show pictures as soon as they are ready (L = 0).

## 7. Transport (question 4)

- **Today's links.** USB-C (245 Mbit/s, RTT 2 ms) and direct Ethernet (312 Mbit/s; the Pi 3B+'s LAN7515 sits on USB 2) lose
  almost nothing: TCP's head-of-line blocking never shows up there, and bufferbloat at the source was the real problem (§5.3).
  Wi-Fi does lose and retransmit; a retransmit adds about 1 RTT (13 ms+) to one picture.
- **Recommendation.** Stay on **one TCP connection**, with message types for VIDEO, AUDIO and CLOCK added to `stream.h`.
  - Audio packets are small and go first in the writer's queue (priority by type).
  - Congestion is handled **before the encoder**: when unsent bytes are above the low-water mark, skip feeding the next capture
    to VideoToolbox. H.264 then just sees a lower frame rate, and there is no reference-chain damage. Lower `AverageBitRate`
    when the smoothed send rate falls.
  - This is scrcpy's and RetinaRelay's choice (TCP, latest frame wins), and it keeps the code small.
- **UDP later, only if measured.** If Wi-Fi shows retransmit stalls after step 4, move VIDEO and AUDIO to UDP with Moonlight's
  scheme: RTP-like packets, Reed-Solomon parity per frame, keyframe or intra request on loss. The lossless tiles stay on TCP. A
  QUIC library (Kyber's choice) brings TLS and much more code than this needs. Raw UDP + FEC is the smaller step **[inference]**.
- **Best realistic figures.** USB-C/Ethernet: the wire costs about 1 ms for a 20 KB coded picture, so latency is capture +
  encode + decode + vblank. Wi-Fi: 13 ms RTT plus jitter; 5-8 Mbit/s of video is safe under the 10-35 measured, and 30 Mbit/s of
  lossless rough tiles is not.

## 8. Expected numbers (estimates, to be measured)

1080p YouTube video in a window on the virtual display; the Pi 3B+ on HDMI 1080p.

| Stage | USB-C | Wi-Fi |
|---|---|---|
| Capture (SCK after compositor) | 8-16 ms | 8-16 ms |
| VT low-latency encode, 720p-1080p region | 3-6 ms | 3-6 ms |
| Wire + one-way (8-12 Mbit/s, ~25-40 KB a frame at 30 fps) | 1-2 ms | 8-25 ms (with jitter) |
| `bcm2835-codec` decode (if 1 frame of delay) | 15-35 ms | 15-35 ms |
| Wait for vblank + scanout | 8-16 ms | 8-16 ms |
| **Motion to light** | **~40-60 ms** | **~50-95 ms** |
| A/V target L | 60 ms | 120 ms |
| Bandwidth (video region + UI trickle) | 8-12 Mbit/s | 5-8 Mbit/s (lower rate) |

For comparison: the current lossless stream is 25-38 Mbit/s with p95 up to 200 ms, and RetinaRelay reports 32-40 ms on gigabit and
39 ms on Wi-Fi to a much faster receiver.

## 9. Plan, in steps with the files each touches

1. **Cheap fixes (§5.1-5.4, 5.7).** Picture lock and wake-up on flush; area-based rough with a whole-area exact repaint; writer
   thread + `TCP_NOTSENT_LOWAT`; 1 in flight on a slow round trip. Files: `plugins/display-rmpp/stream.h` (picture lock around
   RECT application, wake callback in `Target`), `plugins/display-fbdev/fbdev.cpp` (`fb_present` under the lock, wake the loop),
   `app/sidecar/mac/screen.swift` (writer, low-water mark, rough by area). Proof: the owner's YouTube case before and after,
   ACK-based round trip p95, no seams on a screen photo at 1/1000 s.
2. **Clock and timestamps.** `CLOCK` messages both ways, a capture time on each picture, capture-to-commit reported in PROFILE/HOST.
   Files: `stream.h` (wire comment, new kinds), `screen.swift`, `fbdev.cpp` (commit time). This is also the measuring tool for
   everything after.
3. **Pi decode to plane, from a file first.** Feed a VT-like low-latency H.264 file (made on the Mac with
   `ffmpeg -c:v h264_videotoolbox -realtime 1 -bf 0`) through `h264_v4l2m2m` to a `HalLayer`. Measure frames of delay and
   1080p30/60 decode time. `tools/kmsvid.cpp` already plays a file on a plane, so extend it with a low-delay, per-frame latency
   mode. Files: `tools/kmsvid.cpp`; a direct V4L2 decoder only if the delay is above one frame.
4. **Hybrid stream.** Region detector + VT session on the Mac; `VIDEO` message (region rect, keyframe flag, capture time, Annex-B
   access unit); `+h264` capability; the receiver decodes on its own thread, fills the region with `HAL_LAYER_HOLE`, and hands the
   frame to the layer list. Files: `app/sidecar/mac/screen.swift` (+ a `video.swift` if it grows), `plugins/display-rmpp/stream.h`
   (message, wire comment), `plugins/display-fbdev/fbdev.cpp` (layer from the stream), `app/sidecar-screen/src/main.tsx`
   (show the codec in the status), `app/sidecar/mac/tray.swift` (a "video: auto/off" setting).
5. **Audio.** Process tap (SCK audio as the fallback) + Opus on the Mac; `AUDIO` message; Opus decode + ALSA playout at
   t + offset + L with sample-drop drift correction on the Pi; video presentation at the same target. Files: `screen.swift`
   (+ `audio.swift`), `app/sidecar/mac/build.sh` (link libopus from `plugins/webrtc/vendor`), `stream.h`, `fbdev.cpp` or a small
   `stream_audio.h` beside `stream.h` (playout, linking libopus and ALSA or miniaudio), `app/sidecar/mac/tray.swift` (sound on or off).
6. **Only if Wi-Fi measurements ask for it.** VIDEO/AUDIO over UDP with Reed-Solomon parity; adaptive bitrate from the send rate.
7. **Later.** `+hevc` for Pi 4/5 receivers. For a 5K screen: the hybrid as is for the desktop, and a desktop-class receiver for
   full-screen 5K video.

## 10. Risks

- **Decoder delay** in `h264_v4l2m2m` / `bcm2835-codec` (one to several frames). Step 3 measures it first; direct V4L2 is the
  fallback. The SPS VUI may need `max_num_reorder_frames=0` written in.
- **Pi 3 decode ceiling**: officially 1080p30. 1080p60 regions may not keep up, so cap the region at 30 fps above 720p (videos
  are 24-30 fps anyway).
- **HVS bandwidth** with a full-screen NV12 plane under a full-screen ARGB plane at 1080p is not measured. The driver's test
  commit falls back to software, which would be the old CPU path.
- **CMA pressure** (256 MB, already 20 MB free once): keep capture buffers to 4-6.
- **Region detector false positives** (SPICE's lesson): animations become blurry. Use the thresholds of §4, a tray switch, and
  never use video for regions under 256x144.
- **VT `-12902`** with low-latency on some Macs or OS versions: fall back to a plain real-time session (it adds about a frame).
- **Audio capture quirks**: process taps can deliver zeros in some setups, and SCK's timestamp clock is unconfirmed. Calibrate
  at start, and keep SCK as the second route.
- **Text inside the video region** (a YouTube page scrolled under the player) is lossy while the region lasts. It is exact again
  1 s after the motion stops.
- **Licences**: nothing new on the Pi (system libavcodec LGPL, dynamically linked, as `plugins/video` already does; libdrm via
  ioctls, as today). libopus is BSD-3, already vendored. Kyber (AGPL) and Sunshine/Moonlight (GPL-3) are used as references
  only, never copied.
