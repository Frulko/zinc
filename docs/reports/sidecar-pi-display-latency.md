# Sidecar on a Pi 3B+: showing each picture sooner, without tearing (research, 2026-10-28)

Research only: no code changed, no task created. It follows `docs/reports/sidecar-video-audio-research.md` (the hybrid lossless + H.264
plan, the DRM plane, audio) and looks only at the receiver: from the moment a picture's bytes reach the Pi to the moment it shows on the
HDMI screen. Receiver: `plugins/display-fbdev/fbdev.cpp` and `plugins/display-rmpp/stream.h` on Pi OS, kernel 6.18 rpi-v8, `vc4-kms-v3d`,
1080p60 HDMI. **[inference]** marks a claim that was not measured or sourced.

## 0. In short

1. **Frames already reach the screen through DRM/KMS, not fbdev.** With `ZINC_FBDEV_FLIP` on (the default), each frame is converted
   into one of two ARGB8888 dumb buffers on an overlay plane, and a non-blocking atomic commit flips it at the vblank
   (`planes_present`, fbdev.cpp:673). Scan-out tearing is already gone. What is left is **when** a picture is presented and **who**
   reads `surf` while the stream writes it.
2. **The biggest receiver gain is to present when a picture ends, not on the app's next tick.** Today a picture finished at a random
   moment is converted only at the next vblank (fb_present runs right after `wait_refresh`) and shown at the vblank after that:
   16.7 to 33 ms, 25 ms on average, before scan-out starts. Presenting from the stream thread at `flush` cuts that to 0 to 16.7 ms plus
   the convert time: **about -15 ms on average, -16 ms at worst** **[inference from the code path; to be measured, §4]**.
3. **The picture lock in the working tree (uncommitted, `picture_mu`) has a starvation problem.** `fb_present` takes the lock *before*
   `kms::wait_refresh`, so it holds it while it waits for the vblank (up to 16.7 ms) every frame. The stream can write a picture only
   in the short gap between two presents. Take the lock after `wait_refresh`, around the convert only, or better, do step 2, where
   the lock is no longer needed at all (§3.1).
4. **Vanilla's real win was in the decoder loop, not the display.** Its "mandatory" 3 frames on a Pi Zero 2W (the Pi 3's VideoCore IV
   and `bcm2835-codec`) came from a decode loop that sent another packet when the decoder said EAGAIN, instead of polling for the frame
   that was still being decoded. The first frame takes ~50 ms and the next ones ~5 ms, so that loop built a backlog that never drained.
   With polling on its own thread, the Pi reached ~50 ms end to end, against ~33 ms for the real GamePad. Our `tools/kmsvid.cpp:218-224`
   and `plugins/video/native/video.host.cpp:272-276` use the same send-another-packet loop. That is fine for files but wrong for the
   coming H.264 region (§3.6).
5. **Do not copy Vanilla's async page flips.** They save up to one refresh, but they tear, and no tearing is the goal.

## 1. Vanilla (vanilla-wiiu/vanilla)

Sources: the repository (cloned 2026-10-28, 519 commits), the video "Eliminating video delay on the Raspberry Pi"
(https://www.youtube.com/watch?v=R3cpt9a8Cgc, auto transcript), the earlier video "Can you make a Wii U gamepad from a Raspberry Pi?"
(https://www.youtube.com/watch?v=si-TUEwC5_M), Hackaday's write-up
(https://hackaday.com/2026/08/13/troubleshooting-video-delay-on-the-raspberry-pi/) and PR #438.

| # | Trick | What it saved | Where |
|---|---|---|---|
| V1 | **Poll the decoder for the finished frame**: a decode thread sends a packet, then calls `avcodec_receive_frame` every 500 µs (up to 40 times) instead of sending another packet on EAGAIN. A decoded frame is published at once (mutex + condition variable + sequence number). The packet queue holds 8 and drains. | The ~3 frames (~50 ms) of "mandatory" Pi latency. The first frame takes ~50 ms to decode and the next ones ~5 ms; the old loop kept that first delay forever as a backlog. After the fix: ~50 ms end to end against ~33 ms for the real GamePad (itsmattkc on PR #438), and "the Pi Zero 2W is now equivalent to the gamepad/Orange Pi". Inserting dummy frames did **not** help: the delay is in time, not in frames. | commit `ceb1b7f` (PR #438), `gui/menu/menu_game.c` (`vpi_decode_loop`, `vpi_decode_submit_packet`, `VPI_DECODE_POLL_US`); the tool `gui/tests/latencytest.c` (send one frame, poll up to 16.7 ms) |
| V2 | **Write the SPS with `bitstream_restriction`**: `max_num_reorder_frames = 0`, `max_dec_frame_buffering = 1`. | About 0.5 s of buffering in the Pi decoder, down to ~4 frames (before V1). | `lib/gamepad/video.c:641-694`, commit `8e1ce4e`; first video |
| V3 | **"Fast DRM mode"**: the decoder's `AV_PIX_FMT_DRM_PRIME` frame goes straight to an overlay plane (`drmPrimeFDToHandle` cached per fd, `drmModeAddFB2WithModifiers`, the old FB removed after the flip), with no SDL/GL composition. It is optional and off by default, since toasts and scaling are lost. | No figure given ("we can save a little time"). | `gui/ui/ui_sdl_drm.c` (`vui_sdl_drm_present`), commits `df4345c`, `6e52b5c` |
| V4 | **Atomic async page flip** (`DRM_MODE_PAGE_FLIP_ASYNC` on the plane's `FB_ID` alone) when `DRM_CAP_ATOMIC_ASYNC_PAGE_FLIP` is set. It falls back to `drmModeSetPlane`, which waits for the vblank, if the driver refuses. | Part of "further reduce latency" in #438; up to one refresh. **It tears.** | `gui/ui/ui_sdl_drm.c` `set_plane_async`, commits `ceb1b7f`, `c457217` |
| V5 | **Wake the presenter on a new frame**: the UI loop waits on `vpi_present_frame_cond` with a deadline instead of sleeping. Input ticks at 180 Hz, UI drawn every 3rd tick. | Not measured; it removes up to one tick of waiting. | `gui/ui/ui_sdl.c:2193-2225` (`vui_sdl_wait_for_next_tick`), commit `48a31be` |
| V6 | **Wi-Fi power saving off** (nl80211 `NL80211_PS_DISABLED`) during a session, restored after. | Not measured (power-save wake-ups add jitter on brcmfmac **[inference]**). | `pipe/linux/wpa.c:1490-1505`, commit `2c0cd01` |
| V7 | Smaller CPU fixes on the Pi Zero: bit reversal only on needed header fields (<1 ms), a power-state poll that ran every frame instead of every 2 s, a busy `wpa_ctrl_recv` loop, and pipe and frontend on one machine to avoid a relay copy. | <1 ms each, mostly CPU headroom. | first video; commits `e1e9128`, `410b002`, `242386e` |
| V8 | Buildroot image: `vc4-kms-v3d`, rpi-ffmpeg (jc-kynesim, `release/5.1/main`), `gpu_mem=100`, quiet boot, the app started from inittab (no desktop, no compositor). | Boot and simplicity, not ms. | `buildroot/board/raspberrypi/*`, `buildroot/package/rpi-ffmpeg/rpi-ffmpeg.mk` |

No CPU governor change, no `SCHED_FIFO` and no V4L2 buffer-count tuning were found in Vanilla.

## 2. moonlight-qt, moonlight-embedded, Steam Link

- **moonlight-qt** (`app/streaming/video/ffmpeg.cpp:512-547`, `ffmpeg-renderers/drm.cpp`, `drm.h:589-663`) sets
  `AV_CODEC_FLAG_LOW_DELAY`, `OUTPUT_CORRUPT` + `SHOW_ALL` (show something rather than wait), `err_recognition = AV_EF_EXPLODE` (ask for
  a keyframe on the first error), `thread_count = 1` for hardware decode, and `extra_hw_frames = PACER_MAX_OUTSTANDING_FRAMES` (so
  frames held by the screen never stall the decoder). The DRM renderer does one atomic commit per frame, blocking, and uses
  `DRM_MODE_PAGE_FLIP_ASYNC` only when the user turns V-sync off. It retries as a normal flip if the async one is refused. It sets
  `zpos` above the active planes. On MMAL Pi builds it disables `h264_v4l2m2m` because the old V4L2-over-MMAL wrapper could not do
  1080p60 (rpi-ffmpeg PR 25). That is about the 32-bit MMAL era and is not a verdict on today's `bcm2835-codec`. **What it adds to us:**
  `extra_hw_frames`, the error flags, and the async-flip fallback pattern (which we do not need).
- **moonlight-embedded** (`libgamestream/sps.c:42-71`) rewrites the SPS exactly as Vanilla V2 does (`bitstream_restriction_flag = 1`,
  `num_reorder_frames = 0`, `max_dec_frame_buffering = 1`), "which increases decoding latency on some devices". Its Pi path
  (`src/video/mmal.c`: 5 input and 3 output buffers, MMAL renderer on dispmanx layer 128) needs the firmware stack that the KMS
  64-bit Pi OS no longer has. Nothing else to take.
- **Steam Link on Pi 3**: closed, and built on the same firmware (dispmanx/MMAL) path. Its only lesson was already recorded in the earlier
  report: the Pi 3's VPU decodes a low-latency 1080p stream. Nothing to copy **[inference: not re-fetched]**.

## 3. What to change in our receiver, in order

The present path today: the stream thread decodes a RECT and writes it into `surf`. At the picture's end (`flush`, stream.h:383) it
grows `streamed`. The app's loop calls `fb_present` (fbdev.cpp:729), which waits for the previous flip (`kms::wait_refresh`), converts
the `streamed` box from `surf` into the free dumb buffer, and commits it non-blocking for the next vblank. The loop is therefore paced
by the vblank, and the conversion always happens right after one.

### 3.1 Present at the picture's end, from the stream thread (first; -15 ms on average)

- `stream.h`: add `std::function<void()> present` to `Target`, called at the end of `flush` for a colour target. `fbdev.cpp`: a
  `stream_present()` that, under one mutex with the KMS state, (1) waits for the pending flip only if there is one (`kms::wait_refresh`
  returns at once otherwise), (2) converts the picture's box into the back buffer (`planes_present`), and (3) commits with
  `DRM_MODE_PAGE_FLIP_EVENT | DRM_MODE_ATOMIC_NONBLOCK`. While `stream::active`, `fb_present` does not touch `surf` or the planes; it
  only paces the app with a `usleep` to the next period.
- The stream thread is then the only one that writes `surf` and the only one that reads it while a Mac is connected. The mixed
  pictures go away without `picture_mu`, so the working-tree lock can be dropped. If the lock is kept instead, move it after
  `kms::wait_refresh` in `fb_present`, so it covers the convert (2 to 6 ms) and not the vblank wait.
- Coalescing comes for free: while it waits for a pending flip, the next picture's bytes wait in the socket. A picture that arrives
  during the wait is drawn at the next `flush`, and the Mac's ACK flow control already keeps few pictures in flight.
- Gain: flush-to-scan-out goes from 16.7-33 ms (25 on average) to convert + 0-16.7 ms (about 10 on average) when no flip is pending
  **[inference]**. Without tearing: the flip stays at the vblank.
- Hand-back: on disconnect, wait for the last flip, then set `ended` as today. The app's first present redraws everything (`full = 2`).

### 3.2 Measure it before and after (with 3.1)

- **SHOWN** (tablet message kind 12): `a` = the number of the picture's last RECT (the ACK's `seq`); `b` = µs from the first header
  byte of the picture to the vblank that showed it; `c` = µs of decode in that picture. The vblank time is free: read
  `drm_event_vblank` (`tv_sec`, `tv_usec`, CLOCK_MONOTONIC) in `wait_refresh` instead of only its type, and match it to the commit that
  carried the picture. Send it when the flip event arrives. Split `b` locally into decode / wait-for-flip / convert / wait-for-vblank
  in `ZINC_FBDEV_STATS`.
- **Capture to light** once the earlier report's CLOCK offset exists: Mac capture time + offset vs the SHOWN vblank time. Until then
  the Mac can compute send-to-shown with RTT/2 from the speed test's ping (`SINK` len 0), which is precise to about 1 ms over USB-C.
- **Glass to glass** (once, to check the model, and to measure the TV): film the Mac's display and the HDMI screen together with a
  phone at 240 fps while the Mac shows a frame counter or a moving bar. One video frame is 4.2 ms. The difference minus the SHOWN
  figure is the screen's own processing lag.
- The ACK's `b` (decode µs per RECT) stays the CPU measure for §3.4.

### 3.3 The screen's own lag (free, possibly the largest)

A TV can add 20 to 100 ms of processing outside game or PC mode **[inference]**. Set the connector's `content type` property to
"Game" in the same atomic request if vc4's HDMI connector offers it. Check with `modetest -c`; vc4 support is **not verified**. Also
tell the user to pick the TV's game or PC mode. The glass-to-glass check of §3.2 measures it.

### 3.4 CPU: the governor and the RECT decode (-5 to -20 ms on full-motion pictures)

- **Governor.** Nothing in `image/` sets one. Read `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` on the Pi. If it is
  `ondemand` or `schedutil`, a burst that starts at 600 MHz runs at less than half the speed of 1.4 GHz until the governor ramps up.
  Write `performance` while a Mac is connected (root, the same place as `SCHED_FIFO`, stream.h:311) and restore the old governor when
  it leaves. HOST already reports the throttled bits, which shows when heat caps the clock instead **[inference: gain = the decode and
  convert time ratio, up to 2.3x on the first pictures of a burst]**.
- **Decode in parallel and in one pass.** A RECT is decompressed (zstd), unfiltered (PNG Sub, one byte at a time) and expanded from
  3 to 4 bytes, all on the stream thread. A full 1080p 24-bit picture is 6.2 MB raw, about 25-35 ms on one A53 core **[inference;
  the ACK's `b` gives the real figure]**. Fixes: fuse the Sub unfilter and the 3-to-4 expansion into one loop that writes into `surf`
  (one pass over memory instead of two). Then decode the RECTs of one picture on the existing `zbands::Pool` (one `ZSTD_DCtx` per
  worker), since a picture's RECTs do not overlap. Expected: ~8-12 ms for a full picture, and nothing changes for small ones.

### 3.5 Wi-Fi power saving off (only on Wi-Fi)

As Vanilla V6: on connect, if the stream's socket is on `wlan0`, turn power saving off (`iw dev wlan0 set power_save off`, or nl80211
as Vanilla does) and restore it on leave. This removes wake-up jitter on brcmfmac, which is not measured here (compare SHOWN p95 over
Wi-Fi with it on and off).

### 3.6 For the H.264 region (step 3 and 4 of the earlier plan)

1. Decode loop as Vanilla V1: its own thread; send a packet, then poll `avcodec_receive_frame` (every 0.5 ms, up to one frame period)
   and publish each frame at once (the newest replaces the older one). Never send another packet on EAGAIN to "push" a frame out.
   `tools/kmsvid.cpp:218-224` and `plugins/video/native/video.host.cpp:272-276` show the pattern to avoid in a live stream. A
   `latencytest`-style mode in `kmsvid` (send one access unit, time until the frame) is the first measurement.
2. SPS: check with `ffmpeg -bsf:v trace_headers` that VideoToolbox's low-latency SPS has `bitstream_restriction_flag = 1`,
   `max_num_reorder_frames = 0` and `max_dec_frame_buffering = 1`. If not, rewrite it on the Mac (Vanilla V2, moonlight-embedded).
   On the Pi Zero this alone was ~0.5 s.
3. Decoder flags as moonlight-qt: `AV_CODEC_FLAG_LOW_DELAY`, `thread_count = 1`, `extra_hw_frames` of 2-3 (the plane holds a frame
   until its replacement is on screen), and `AV_EF_EXPLODE` → ask the Mac for a keyframe.
4. The first frame is slow (~50 ms on this decoder). Open the decoder once per session and keep it across regions; do not reopen it
   per region **[inference]**.
5. Present the frame through the same `stream_present` as 3.1, so the video plane and the UI plane change in one atomic commit at one
   vblank.

### 3.7 Later, only if SHOWN says convert time matters

- **Mailbox (third buffer).** While a flip is pending, convert the next picture into a third dumb buffer and commit it from the flip
  event. This saves the convert time (2-6 ms at full motion) when pictures come back to back, at a cost of 8 MB of CMA (the earlier
  report flagged CMA pressure).
- **Convert less.** `surf` is already XRGB with alpha 0xFF (the stream writes `d[3] = 0xFF`), the same layout as the ARGB8888 plane.
  The convert is a copy of the damaged box from cached memory into write-combined memory. It can only be removed by decoding straight
  into the back buffer and replaying the previous picture's damage, which is more code for 2-6 ms **[inference]**.

### Not to do

- Async page flips (Vanilla V4, moonlight with V-sync off): they tear, against the goal. vc4's acceptance of atomic async flips on an
  overlay plane is not verified either.
- Dummy or duplicated frames to "flush" the decoder: Vanilla showed they change nothing.
- SDL, EGL or a compositor in the path: we already commit straight to KMS planes, which is Vanilla's "fast DRM mode".

## 4. Expected effect on a Pi 3B+ (estimates to check with SHOWN)

| Stage (full-motion 1080p picture, lossless path) | Now | After 3.1 + 3.4 |
|---|---|---|
| Decode all RECTs | ~25-35 ms | ~8-12 ms |
| Picture end to commit | 0-16.7 ms (wait for the next vblank) + convert | convert (2-6 ms), or the pending flip |
| Commit to the start of scan-out | 16.7 ms | 0-16.7 ms |
| **Picture end to light, average** | **~25 ms + convert** | **~10 ms + convert** |
| Screen processing | 0-100 ms depending on the TV | game mode: minimal |

The order: 3.1 with 3.2 in the same change (the measurement proves it), then 3.3 and the governor of 3.4 (a few lines each), then the
parallel decode, then 3.5 on Wi-Fi. 3.6 belongs to the H.264 step, and 3.7 only if the figures ask for it.

## 5. Measured: bcm2835-codec with the VideoToolbox stream (2026-10-28)

`tools/v4l2dec-probe.cpp` on the Pi 3B+ (1.4 GHz, `gpu_freq=300`), streams from `sidecar-screen --h264-dump`:

- **The held picture.** VideoToolbox's SPS has no VUI timing. Without it the decoder gives picture N out only when unit N+1 comes in, which costs one picture of delay at whatever rate the video runs (33 ms at 30), and the last picture of a burst stays held. The cause was isolated by changing one thing at a time on the same stream: the POC type (0 to 2, as Vanilla's SPS has), `nal_ref_idc`, an AUD before or after each unit, EOS and filler NAL units all leave the hold; adding `timing_info` (any rate: 60, 120, 500, 30000 fps were tried) removes it. ffmpeg decodes the rewritten stream to the same pictures (framemd5). The Mac now rewrites the SPS's VUI (`VideoEncoder.timedSPS`).
- **Decode latency grows with the area**, one picture in flight, 60 a second sustained: 1920x1080 25 ms, 1280x720 13.4 ms, 854x480 7.0 ms. Vanilla's figure is the Wii U's 854x480. A video region on the Mac is rarely the whole screen, so the region path pays in proportion to its size.
- Next lever, not tried (the Pi still reports under-voltage): `gpu_freq`/`h264_freq` above 300 MHz should shorten the 25 ms in proportion.
