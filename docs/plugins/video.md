# zinc:video

Video playback for hosts with an OS and some memory: a `Player` decodes a playlist on its own thread with FFmpeg and
is shown as a runtime image. Plugin: `plugins/video/` (module `zinc:video`).

```ts
import * as gfx from 'zinc:gfx';
import { Player, EXTENSIONS, RANDOM } from 'zinc:video';

const p = new Player(gfx.width(), gfx.height());  // image size; 0 x 0 = size of the first video
p.addFolder('media', EXTENSIONS);                  // or p.add('clip.mp4') per file
p.order = RANDOM;                                  // SEQUENTIAL (default), RANDOM, RANDOM_UNIQUE
p.play();                                          // loops forever (repeat = LOOP); STOP, ONE_SHOT
gfx.onFrame(() => p.draw(0, 0, gfx.width(), gfx.height()));
```

`Player`: `add`, `addFolder`, `play`, `stop`, `pause(on)`, `next`, `previous`, `jump(i)`, `close`; setters `order`,
`repeat`, `background`; getters `image`, `width`, `height`, `index`, `count`, `position`, `duration`, `loops`,
`playing`, `paused`, `decoder`, `frames`, `dropped`. Several players run at once (up to 16).

## Support matrix

| target | status | decoder | notes |
|---|---|---|---|
| macos | supported, verified | VideoToolbox (hwaccel), software fallback | `brew install ffmpeg` (pkg-config finds it) |
| rpi1 (Pi 1, Zero, 2, 3, 4 on a 32-bit OS) | builds and links (docker, Alpine 3.20 ffmpeg 6.1); not run on hardware | `<codec>_v4l2m2m` (bcm2835-codec: H.264, also MPEG-2/4 when licensed), software fallback | screen through `display-fbdev`; see performance below |
| linux (x86_64/arm64) | builds like rpi1 (Debian ffmpeg); not run here | V4L2 M2M when the kernel has one, else software | VAAPI/NVDEC not wired |
| sim | deterministic fake | none | every file lasts 5 s, image = requested size (320x180 by default), time follows gfx frames at 60 fps, order always sequential |
| esp32 | not supported | | 520 KiB SRAM (+ a few MiB PSRAM) and no H.264 decoder or FFmpeg; MJPEG from flash is a different, much smaller plugin |
| ps1 / ps2 | not supported | | 2 MiB / 32 MiB RAM, no OS threads or FFmpeg port; PS1 MDEC/PS2 IPU need their own streaming formats (STR/PSS) |
| wasm | not supported | | the browser's `<video>` element is the right tool; FFmpeg in wasm is ~10 MB and software only |

Using `zinc:video` on an unlisted target is error Z5003 at build time.

## How it works

- **Worker thread per player**: demux + decode (FFmpeg), then swscale converts to `0x00RRGGBB` straight at the
  player's size, aspect ratio kept (sample aspect honoured), bars filled with `background`. Hardware frames are copied
  back with `av_hwframe_transfer_data` (NV12) first. Decode at the size you draw: a 1:1 `drawImage` is a row copy.
- **Hand-over**: a ring of `buffers` slots (plugin option, default 4). The worker only writes free slots; the main
  thread (a `zrt::Poller`, once per loop iteration, before `onFrame`) picks the newest frame whose timestamp is due,
  frees older ones (`dropped`), and publishes it with `raster::dyn_update`. The player's image id never changes:
  `gfx.drawImage` sees a new version every frame, and GPU compositors read the pixels with `raster::dyn_view`.
- **Pacing**: a player clock starts at the first frame and follows `hal_time_us`; frames are shown when due (within
  half a 60 Hz refresh). When the decoder falls behind, the clock waits for it (at most 100 ms ahead) instead of
  skipping.
- **Gapless looping**: one continuous timeline per playlist pass — each file starts exactly where the previous one
  ended (last PTS + frame duration). The next file (demuxer + decoder) is opened as soon as the current one shows
  its first frame, so a switch costs one decode, never an open. One file loops the same way (a second instance of it
  is pre-opened). `ZINC_VIDEO_LOG=1` prints one line per shown frame with entry, position, timeline and clock.
  Measured on macOS (M1 Pro, VideoToolbox) over 3.5 passes of a 3-file playlist with 30 and 25 fps clips: the first
  frame of each file is shown one frame period after the last frame of the previous one, within 3 ms of its due time,
  no frame dropped at any loop point (one dropped at startup).
- `stop()` shows the background colour; `repeat = ONE_SHOT` stops after each file (then `play()` starts the next
  one), `STOP` after the whole playlist.

## Options (zinc.json `plugins.video`)

| option | default | meaning |
|---|---|---|
| `buffers` | 4 | decoded frames in flight per player (3..16); each is width x height x 4 bytes |
| `hwdecode` | true | try VideoToolbox / V4L2 M2M before software decoding |

## Raspberry Pi notes

- Build: `zinc build <app> --target rpi1` installs `ffmpeg-dev` into a derived SDK image (Alpine armhf, ARMv6 +
  VFP). The binary links FFmpeg's shared libraries: run it on Alpine for Raspberry Pi (`apk add ffmpeg-libs`), or
  in a container, or rebuild against the distribution's FFmpeg on the device.
- Hardware decode needs the `bcm2835-codec` V4L2 driver (`/dev/video10`, Raspberry Pi kernels with the default
  `vc4-kms-v3d`/`fkms` overlays, Pi 1..4) and enough `gpu_mem`. When it cannot be opened the player falls back to
  software decoding silently (`player.decoder` tells which one runs).
- Performance is **not measured** (no hardware here). Expectations: a Pi 1/Zero (ARMv6, no NEON) is limited by the
  YUV to RGB conversion and memory bandwidth, so keep clips at 480p..720p and the surface equal to the framebuffer
  size; Pi 3/4 should handle 1080p H.264 through V4L2. Four simultaneous players (quad) need small clips on a Pi 1.
- Pi 5 has no H.264 decoder block (software only) and is a 64-bit target; use the `linux` target there.

## Follow-ups

- Audio (SDL3 audio on macOS, ALSA on Linux) with the video clock slaved to the audio clock; `wait_time` pauses and
  one-shot already work without it.
- Zero-copy paths: DRM PRIME / CVPixelBuffer frames handed directly to a GPU compositor instead of RGB conversion.
- Seeking (`seek(seconds)`), playback rate, frame-accurate sync between players or machines.
