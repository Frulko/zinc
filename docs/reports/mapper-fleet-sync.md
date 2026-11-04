# Mapper fleet sync: frame-tight playback across HDMI players

Goal: any device with an HDMI output on a projector joins a fleet; each holds its media locally; playback is as tight as a
Sonos group or AirPlay 2, visually clean across edge-blended projectors. Research 2026-11-04. No code changed.

Legend: **[V]** verified (URL or repo path read this session), **[K]** from memory/training knowledge, not re-checked, **[A]** assumption to measure.

## 0. Recommendation in five lines

1. Clock: own NTP-style 4-timestamp exchange over UDP (not PTP), Cristian/min-RTT filtering plus a linear drift fit; target 0.2-1 ms on WiFi, <0.1 ms on Ethernet.
2. Timeline: the leader publishes `{media, startAt: T_leaderClock, rate: 1, loop: duration}`; every device derives `position = (clock() - startAt + trim) mod duration`. No per-frame messages.
3. Per device: schedule the first frame for a vsync, then servo by dropping/repeating single frames (or, where possible, by timestamped release) so the error stays under half a frame; per-device `trim` (ms) calibrates HDMI/projector latency.
4. Audio: one device only (the leader or a chosen one); others muted. No audio resampling servo.
5. Test with a binary-counter/flash video filmed by a 240 fps camera (or a 60 fps camera with intentional exposure tricks). Pass: <= 1 frame (16.7 ms) between any two projectors at all times, <= 8 ms median after calibration.

Without genlock the floor is one vsync of random phase between displays (0-16.7 ms at 60 Hz). It is not removable in software; section 2.4 says what can be done.

## 1. How the others do it

| System | Clock protocol | Leader | Accuracy / source |
|---|---|---|---|
| AirPlay 2 (Apple) | PTP (IEEE 1588-2008 subset), UDP 319/320; devices share one network clock, playback is `rtp-timestamp -> clock time` | The PTP best-master algorithm picks a grandmaster (often a HomePod/Apple TV) | Apple gives no number. Shairport-sync + nqptp: nqptp "listens to PTP timing traffic on UDP ports 319 and 320, tracks one clock", exposes master clock ID and local-to-master offset through POSIX shared memory, no hardware timestamping, "probably buggy" [V: https://github.com/mikebrady/nqptp]. Community figure: ~1 ms or better on a quiet LAN [K, unquantified by source]. |
| Sonos groups | Proprietary; per-group coordinator ("group coordinator") streams audio with presentation timestamps; members sync clocks to it (SonosNet / WiFi) | The coordinator speaker of the group | Sonos states sync within a few ms or better (they claim "sample-accurate" to the ear) [K, no primary source fetched]. |
| Snapcast | Each client continuously syncs its clock to the server (NTP-like exchanges over TCP); server timestamps every chunk with its time; client plays at server-time + buffer | The server | "typical deviation below 0.2 ms"; drift corrected by adding/dropping individual samples, 0.02 ms each at 48 kHz [V: https://github.com/badaix/snapcast]. Buffers are fixed (default 1000 ms server, ALSA 80 ms) so start time is always in the future. |
| omxplayer-sync / VLC netsync / dbus-based Pi walls | Leader sends its position over UDP/dbus; followers compare and speed up or slow down (omxplayer-sync) or seek | A chosen master process | Typically tens of ms, visible tearing on edges, because no shared clock, only position messages [K]. This is the design to avoid. |
| Resolume / Arena | MIDI/SMPTE LTC timecode, or OSC/Art-Net/Ableton Link; each machine chases timecode | An external timecode source | Chase to the frame (a 25-60 fps frame, so up to one frame error) [K]. |
| Dataton Watchout | Production computer holds the timeline; displays get timeline time over TCP/UDP and run locally with prefetched media; clock sync of the display computers | The production computer | Frame-level; with genlock (Quadro Sync) to the pixel scan [K]. |
| disguise | Timecode (LTC/PTP) + genlock to the output cards; frame-lock in multi-machine "d3net" | Director/understudy | Frame-accurate, genlocked, fraction-of-line [K]. |
| BrightSign | "Synchronized playback" groups on UDP or PTP (newer players use PTP); players share presentation timestamps and nudge | A master unit | Vendor claims frame accuracy (typically "within one frame", fewer on HDMI-synced players) [K]. |
| NVIDIA Quadro Sync / G-Sync II | Hardware genlock/framelock: the sync card distributes the vertical-sync pulse to all GPUs; swap barrier across nodes | Sync card master | Sub-line. Only relevant to prove what we cannot do on commodity HDMI [K]. |

Lesson common to all that work: **a shared clock + presentation timestamps in the future**, not "position messages and chase". Audio
systems also pick the leader as the clock source; video walls without genlock end up within one frame.

## 2. Design for Zinc

### 2.1 Clock
Use an NTP-style exchange (client sends t1, server stamps t2/t3, client stamps t4; offset = ((t2-t1)+(t3-t4))/2, rtt = (t4-t1)-(t3-t2)).
- Why not PTP: needs UDP 319/320 (privileged on Linux/Android, no hardware timestamps on commodity boards, nqptp itself is software-only and says so [V]). Software NTP-style gives the same achievable precision as software PTP: both are bounded by OS wakeup jitter and WiFi asymmetry, not by the protocol.
- Packet: 32 bytes UDP on one fixed port, timestamps from a monotonic clock (`hal_time_us()`, see 4), never wall-clock.
- Rate: burst of 8 probes at join (50 ms apart), then 1 per second steady, 1 per 250 ms for 10 s after a step.
- Filter: per burst keep the sample with the **minimum RTT** (jitter on WiFi is one-sided: queueing only adds delay) [K, standard Cristian/NTP clock filter]. Feed the min-RTT offsets of the last ~60 s into a least-squares line (offset vs local time) to get offset and drift (ppm; phone/box crystals are 10-100 ppm [K]). Reject samples with RTT > 2x the median.
- Expected precision [A, measure in phase 1]: Ethernet 50-200 us; 5 GHz WiFi 0.3-2 ms with the min-RTT filter, the worst case on a busy 2.4 GHz channel 5-10 ms (Android 4.4 box with a cheap radio). Anything under ~2 ms is below one frame and invisible; the clock is not the bottleneck, vsync phase is.
- Android WiFi caveat: power-save adds up to 100+ ms wakeup latency to incoming UDP; hold a `WifiManager.WifiLock` (full high-perf) and a WAKE_LOCK, as an always-on HDMI box would [K].
- Leader election: the device with the lowest id among those seen (or the one the operator marks "leader", plus automatic fallback to the lowest id when it disappears for 3 s). A new leader continues the same timeline (see 2.2) so a switch does not restart playback. Followers sync to the leader only (star, not PTP BMCA; fleets are tens of devices, a star of 1 Hz packets is nothing).

### 2.2 Shared timeline
The leader publishes (and re-sends every 1 s, and on any join): `{epoch: n, media: name+hash, startAt: T_leader_us, rate: 1.0, loop: duration_us, trim: {}}`.
- Each device converts `startAt` to its own monotonic time: `local = startAt - offset(drift-corrected)`. Position at local time t: `(t - local) mod duration`. Everything is pure arithmetic; a late joiner or a rebooted box lands on the right frame with no message exchange.
- "Play" is `startAt = now_leader + 1.5 s` (prepare time: open file, prime the decoder, upload first frame). Devices that are late to prepare seek to where they should be and join at the next loop point or after a seek-and-skip.
- Transport commands (pause, seek, change media) are new epochs with a future `startAt`. The same message channel carries the existing mapping state (`/state/...`, see 4) later.
- Media identity by content hash so every device checks it has the exact file (each holds its own prepared files; mismatch is reported to the leader, not streamed).

### 2.3 Per-device correction
Compute the **expected frame index** `i = floor(position * fps)` each vsync and compare with the frame the decoder is about to show:
- error < 0.5 frame: do nothing.
- 0.5-1.5 frames: drop or repeat exactly one frame, once, then wait (no more than one correction per second so it is never visible as a stutter).
- > 1.5 frames (a few frames): seek (hard resync; accept a visible glitch, log it). Counted per device as `resyncs`.
- Continuous drift correction by rate change (1.001x) only on platforms with a rate control (FFmpeg path, API 23+ Android); elsewhere frame drop/repeat is enough: a 50 ppm crystal difference drops one frame about every 5.5 minutes at 60 fps.
The corrected value is a position, so the same code drives every backend.

### 2.4 Vsync alignment without genlock
- Each display refreshes on its own free-running clock; two HDMI outputs of the same nominal 60.000 Hz differ by 10-100 ppm, so their phase slides by one full frame every 3-30 minutes [A, from typical crystal tolerance]. Nothing in software changes that.
- Expected residual: the shown frame on two devices differs by 0-1 vsync period of *phase* (0-16.7 ms), plus whatever sub-frame error remains in the clock; when the video is 30 fps on 60 Hz displays, add up to another vsync from the 2:2 pulldown cadence unless every device uses the same cadence anchored to the timeline (do: `showFrame = floor(position*fps)`, the same function everywhere so the cadence is identical).
- Nudging phase: possible on Linux KMS (you choose which vblank you flip on, so you can delay a flip by whole vblanks but not by fractions; fractional phase needs changing the pixel clock/total vertical lines, e.g. `modetest`/custom modeline with a line or two more vtotal for a few frames; this works on some DRM drivers and is a *later* optimisation [A]); on Android there is no API to shift the display's phase [K]. On macOS the display link follows the display; the phase cannot be moved either [K].
- Practical answer: accept up to one vsync of randomly distributed phase; it is below the eye's threshold for most video content, and for edge-blend zones the only hazard is a one-frame offset on fast horizontal motion. Where a project needs better, add real genlock hardware (HDMI sources with an external sync input), outside this plan.
- To keep even that stable, correct against the **vsync timestamp**, not the app's loop time: use `Choreographer.FrameCallback.doFrame(frameTimeNanos)` on Android (API 16+, nanosecond vsync timestamp, `System.nanoTime` base) [K], KMS page-flip event timestamps on the Pi [K], `CVDisplayLink` output time on macOS [K]. Compute error at the *display time* of a frame (vsync time plus one frame of pipeline), not at `update()` time.

### 2.5 Latency calibration per device
Each device has a `trim_ms` (signed) added to its position: it compensates HDMI cable/box pipeline (typically 1-3 vsyncs on Android with SurfaceFlinger), and projector processing (1-4 frames, 8-80 ms depending on the model and "game/fast mode"). Calibration is manual-assisted: play the counter video (section 5), film the walls, read the offset per device, type the trim in the controller; store with the device in the mapping/fleet config. A "flash" calibration mode in the player plays the test pattern on demand. Automatic calibration with a phone camera is later.

### 2.6 Audio
One device only (the leader by default; any chosen device), others `volume 0` and no audio decode where possible. Multi-device audio sync is a different problem (sample-level, Snapcast-class: 0.2 ms, resampling servo) and has no value for projectors in a room where the speaker is one PA. Audio plays at the audio hardware clock; because the video follows the shared clock, the audio device's A/V offset is just its own `trim`.

## 3. Platform capabilities

### Android 4.4 (API 19) with MediaPlayer (what plugins/mapping uses today, see 4)
- `MediaPlayer.seekTo(int ms)`: API 1; for most H.264 files it lands on the **previous sync frame (keyframe)**, not the exact frame; exact-seek modes (`seekTo(long, int mode)`, `SEEK_CLOSEST`) arrive in API 26 [K, and confirmed as API 26 by the Android doc excerpt fetch: https://developer.android.com/reference/android/media/MediaCodec was fetched, MediaPlayer part from knowledge]. Consequence: prepare media with **short GOPs** (keyframe every 0.5 s or all-intra, e.g. `ffmpeg -g 15`) so a seek lands within 0.5 s, then correct the rest by "fast-forward through frames" which MediaPlayer cannot do.
- `getCurrentPosition()`: integer ms, updated by the media server with latency of tens of ms and jitter; not a precise position source [K, A: measure on the RK3128].
- `setPlaybackParams()` (speed change): API 23, not on API 19 [V as "API 23 (M)" in the excerpt reference above for the neighbouring MediaCodec docs; PlaybackParams itself from knowledge]. No rate servo on 4.4 with MediaPlayer.
- `start()` timing: `prepare` then `start()` has an unpredictable 30-150 ms onset [A]; treat start as "calibrated per device" and avoid reliance on it. Best use: prepare, `seekTo(0)`, `pause` state primed, then `start()` at the leader's `startAt`; measure the actual onset with the visible counter and fold it into `trim`.
- **Conclusion for MediaPlayer on 4.4**: it can only be "start at T, trim, and re-seek when error > ~0.1-0.2 s". Accuracy: tens of ms, jitter by seek granularity. Not good enough for "perfect", good enough for loops of a few minutes with a re-seek on each loop boundary (which is itself a natural resync point).
- **MediaCodec on API 19**: Java MediaCodec exists since API 16 with output to a Surface; you decode, then `releaseOutputBuffer(index, true)` renders immediately (self-timed). The timestamped overload `releaseOutputBuffer(index, long renderTimestampNs)` is API 21+ [V: https://developer.android.com/reference/android/media/MediaCodec]. On 19 you hold the output buffer until the right Choreographer vsync and release it with `true`: a decision granularity of one vsync, which is enough. Cost: you must demux yourself (`MediaExtractor`, API 16) and feed codec input; audio needs its own `AudioTrack` or none (we do video-only on followers, 2.6). Frame-accurate seek is then possible: seek to the previous keyframe with `MediaExtractor.seekTo(us, SEEK_TO_PREVIOUS_SYNC)`, decode and discard output buffers (`releaseOutputBuffer(i, false)`) up to the target frame. For a short-GOP file that is <15 frames of decode work, which a Rockchip hardware decoder does in a couple hundred ms.
- Recommended Android path: **MediaCodec + MediaExtractor into the existing SurfaceTexture** (phase 3), because the present code already gives the decoder a Surface from a SurfaceTexture (ZincMappingMedia.java) and the compositor draws the texture; only the producer changes from MediaPlayer to MediaCodec. MediaPlayer stays the fallback for the first phase.
- API 21+ (Chromecast with Google TV is Android 10+, Xiaomi box likely 7+): `releaseOutputBuffer(index, vsyncTimeNs)` and `Choreographer` give a clean schedule; `setPlaybackParams` available from 23 for a ~1.001x servo.

### macOS / Linux with the FFmpeg player
- plugins/video/native/player.h already runs a presentation clock (`p->clock`, advanced by wall-time `hal_time_us()` in `update()`, frames carry `t`; a frame is shown when `s.t <= clock + 0.008`, frames older than the shown one are dropped; the clock is held back to `last_t + 0.1` if the decoder is late) [V: plugins/video/native/player.h lines ~312-352]. This is exactly the right shape: to follow a fleet timeline, replace "`clock += dt`" with `clock = timeline_position(now)` and keep the drop logic; a large error (> 0.1 s) triggers the existing restart path (`restart`, new timeline, line ~232).
- `update()` runs once per loop iteration, on the app's frame cadence; its `now` is not the vsync time but the loop time. Use the HAL's present/frame timestamp when exposed (see 4, `include/zn/frame_trace.h` has frame times) [A: confirm what is available].
- macOS display: `CVDisplayLink` / SDL's present gives one vsync of granularity [K].

### Raspberry Pi (KMS/DRM)
- Page flips deliver the vblank sequence and a `CLOCK_MONOTONIC` timestamp in the page-flip event (`drmModePageFlip` with `DRM_MODE_PAGE_FLIP_EVENT`; `drmVBlank` timestamps) [K]. Use them to correct `position` at display time and, since each flip waits for a vblank, a frame scheduled for vsync N can be presented exactly there. The Pi 3 (rpi1 target in the repo, 'mapping.rpi1.cpp') is the weak case for decode performance, not for sync [K].
- Phase nudging by modeline vtotal tweak is plausible on vc4 [A, untested].

## 4. What exists in the repo (reuse; do not rewrite)

- **plugins/video/native/player.h**: the whole player and its presentation clock (`update(Player*, now)`; `position(id)`, `play`/`restart` at ~line 232/309). The fleet hooks in at the clock: a `setClock(fn)`/`seekTo(position)` entry on the Player, nothing else. [V]
- **plugins/mapping**: compositor driven by OSC: `command(address, numbers, strings)`, `listen(port)`, `sync(host, port)` (/state/info, /state/layer), `toJson`/`fromJson`/`save`/`load` in `plugins/mapping/index.ts`; `native/mapping.host.cpp` (desktop), `mapping.rpi1.cpp`, `mapping.android.cpp` + `native/android/ZincMappingMedia.java` (MediaPlayer into a SurfaceTexture, `update(float[])` called once per drawn frame, `onFrameAvailable` flag) [V]. Layers already own the media object, so a `layer.start(at)` / `layer.seek(pos)` goes into `ZincMappingMedia` (Java) and the host player.
- **zinc:osc/full (plugins/osc/index.ts)**: OSC 1.0 over UDP on `zinc:socket`, **bundles with NTP time tags** (`TimeTag`, `timeTag(unixMs)`), written in Zinc. A bundle's time tag is an exact vehicle for "apply this at T" if T is the shared clock; use wall-clock only if you also run an NTP-class clock; our own clock (2.1) is separate [V, first 25 lines read]. The mapping's `listen`/`sync` uses the engine's short `zinc:osc` (numbers and strings).
- **plugins/socket/index.ts**: `udp()`/`UdpSocket`/`Datagram` for the clock probes (an exchange in Zinc is 20 lines) [V]. Check the datagram timestamp precision: Zinc's event loop adds latency; the probe replies should be stamped in the native receive handler if possible [A].
- **plugins/link** (`zinc:link`): DNS-SD discovery (`browse(service)`, `advertise`), 6-digit pairing, TLS 1.3 channel with the paired key, `Channel` reconnecting by itself; `Peer {id,name,host,port,paired}` [V: plugins/link/index.ts]. Fleet membership = link peers advertising a `_zincmap._tcp` service; leader messages (timeline, commands, state) ride on the `Channel` (TCP, in order, encrypted); **clock probes go on a separate UDP port, unencrypted** (an attacker able to forge them can only skew time, and encryption adds jitter on old CPUs). The Android target (LinkLife.java, multicast lock) already exists.
- **zinc agent / device** (`docs/reports/zinc-next-agent.md`, `src/agent/*.cpp`: `server.cpp`, `client.cpp`, `mdns.cpp`, `player.cpp`, `ota.cpp`): the fleet's *provisioning* path: `push` the prepared media and mapping JSON to each device, `install`/`run` the player, `info`/`top` to see state, `logs`. Port 7733, TLS-PSK, one request per connection. It is not a low-jitter channel (35 ms per session) and must not carry clock probes. `deploy` already builds what is needed to put the app on Pi/Linux boxes [V: docs/reports/zinc-next-agent.md protocol table].
- **src/agent/live.cpp and docs/plugins/display-sidecar.md** are a *screen mirror* (frames streamed to a viewer): they belong to the later "live from master" stage (section 6), not to sync. Measured numbers to remember: adb link ping 4.2 ms median, picture round trip 12 ms median while streaming [V: docs/reports/sidecar-android-usb-link-2026-10-29.md].
- **include/zn/frame_trace.h** and `hal_time_us()`: the engine's microsecond monotonic clock and a thread-safe ring of frame times [V: header comment]. The clock offset is relative to `hal_time_us()` on every target.
- Nothing in the repo implements a shared clock, a leader election or a networked timeline [V: grep for ntp/NTP/PTP/clockOffset in plugins/link, plugins/socket, src/agent returned nothing]. New code: a `zinc:fleet` (or `zinc:sync`) module on top of `zinc:socket` + `zinc:link`, about 300 lines of Zinc plus the per-backend `seek`/`start` hooks.

## 5. Proving sync: a measurable test

Test material (one 60 s clip, prepared identically for every device, 1080p30 or 60 per device capability):
- A full-frame **frame counter**: large binary-coded square grid (e.g. 16 black/white cells = frame index mod 65536) plus a decimal counter, plus a white flash in a corner every 30 frames. Generate once with ffmpeg `drawtext`/`geq` or a small Zinc script; same file on every device (hash-checked).

Procedure A, ground truth with a camera:
1. Two (or all) projectors on one wall, or one monitor per device, side by side; one camera (phone slow-motion at 240 fps) framing both. At 240 fps one camera frame is 4.2 ms, enough to resolve a 16.7 ms vsync.
2. Start the clip from the leader; film 60 s, twice per configuration: a) fresh start, b) after 10 min (drift), c) after killing and rebooting one follower mid-run (late join).
3. For every camera frame, read the counters of both screens (OCR of the decimal counter or decode the grid with a script; `tools/pixel-compare`-style scripts exist [V: AGENTS.md tools list, not read in detail]). Offset = counter difference converted to ms, plus the visual-in-frame position of the scan to resolve sub-frame offset where the camera's rolling shutter shows it [K].
4. Report p50, p95, max of |offset| per pair, and the number of resyncs.

Targets: **after trim calibration, p95 <= 1 frame (16.7 ms), median <= 8 ms, max <= 2 frames, zero visible glitches in the steady state; after a late join, converged within 3 s; a 30 min run drifts <= 1 frame**. MediaPlayer/API 19 path: expect to meet only p95 <= 3 frames until phase 3 (MediaCodec) is in. Edge-blend pass criterion: a horizontal bar sweeping across the blend zone at 1 screen/s shows no doubled edge by eye.

Procedure B, without a camera (clock and scheduling only): each device logs `(vsync_time_local, expected_index_of_frame_shown)`; after the run the leader collects logs and computes the cross-device offset *in the shared clock*. Verifies the algorithm and clock, not the display latency; faster, runs in CI with `ZINC_HEADLESS` for the logic.

Procedure C, clock quality alone: log `offset`, `rtt`, `drift_ppm` per device every second; targets Ethernet |residual| < 0.3 ms, WiFi < 2 ms p95; compare two devices' clocks by flashing a GPIO or LED at a scheduled time and filming (an LED visible by the camera: error < 4 ms).

## 6. Live interactive mapping from a master over Ethernet (later)

Only constraints, no design:
- The same timeline model still applies: the master sends *state changes stamped with a future time* (OSC bundles with time tags on the shared clock), so every device applies a corner-pin drag at the same frame; never "apply on receipt".
- Control bandwidth is tiny (a mesh point is a few bytes), so the master sends deltas at 60 Hz over UDP (loss-tolerant, last-state-wins) plus a TCP/`Channel` full-state resync (existing `sync()` in plugins/mapping/index.ts).
- Look-ahead of 1-2 frames (17-34 ms) added to all live edits is the price of simultaneity; a drag feels fine at that latency on the master's own preview if it applies the same delay to itself.
- Ethernet for the control/clock path; a media server or video streaming (real-time sources like NDI/Sidecar-like frames) would change everything (needs decode and sync of the streamed frames, bandwidth), which is why live **video** is out of scope here.

## 7. Phases

1. **Clock + timeline** (module `zinc:fleet`): UDP probes, min-RTT filter, drift fit, leader election, timeline message, over `zinc:socket` + `zinc:link`; a headless test with two processes on one Mac using a simulated offset. Log offsets.
2. **Desktop and Pi players follow the timeline** (player.h hook: `clock = timeline`, one-frame drop/repeat, re-seek > 0.1 s); trim per device; test procedure A with two Macs/Pi.
3. **Android**: first MediaPlayer (start at T, loop resync, short-GOP media, measure onset and p95 on the RK3128); then MediaCodec+MediaExtractor into the same SurfaceTexture with vsync-timed release (Choreographer, API 19; timestamped release on 21+).
4. **Fleet operations**: provision media/configs through `zinc device push`, hash check, one status view, automatic trim helper from a phone camera.
5. Optional: vtotal phase nudging on KMS, genlock hardware notes; live master (section 6).

## 8. Open items to measure (assumptions above)

- WiFi clock error distribution on the RK3128 box (min-RTT filter) and Android 4.4 UDP wakeup jitter.
- MediaPlayer `start()` onset and `seekTo` landing error on API 19 with short-GOP H.264 on the RK3128 decoder.
- `getCurrentPosition()` granularity on the same box.
- Pi KMS flip timestamps and whether vc4 accepts small modeline vtotal changes live.
- HDMI/projector latency of the actual projectors (read off the first camera test).
