# HP TouchPad: video playback for zinc:video (measured 2026-10-15)

zinc:video is FFmpeg (modern API) on macOS and Linux; webOS 3.0.0 has no such FFmpeg, so the plugin has no webOS backend yet.

## What the device has

- GStreamer 0.10 with Palm's hardware decoder `palmvideodecoder` (sink: `video/mpeg`, `video/x-h263`, `video/x-h264`; Qualcomm
  `libOmxVdec.so` underneath), `palmvideosink` (the MDP video plane: fit/fill, angle, frame capture to RGB), `qtdemux`, `souphttpsrc`,
  `queue2`, `typefind`, `decodebin2`, `playbin2`, `ffmpegcolorspace`, `ffvideoscale`, and `libgstapp-0.10.so` (appsrc / appsink).
- No HLS element (no `hlsdemux`, no MPEG-TS demuxer in GStreamer). FFmpeg 0.6-era libraries: `libavformat.so.52` (has `mpegts`, not
  `applehttp`), `libavcodec.so.52`, `libswscale.so.0` (`sws_scale` with NV12 input).

## Measured (H.264 main profile, 4 Mb/s, 10 s, 300 frames, `filesrc ! qtdemux ! palmvideodecoder ! fakesink sync=false`)

| Clip | Decode time (300 frames, start included) | Frames a second |
|---|---|---|
| 640x360 | 6.06 s | 49 |
| 1280x720 | 4.97 s | 60 |
| 1920x1080 | 6.83 s | 44 |

- The decoder's output is `NT12`: NV12 in Qualcomm's 64x32 tiles, height padded to 16 (`1920x1088`, `cropheight 1080`).
- `palmvideodecoder ! palmvideosink` plays the 720p clip in real time (10.01 s for 10 s); the video plane does not show in
  `takeScreenShot`.

## Plan

1. A webOS backend of zinc:video: GStreamer by `dlopen` (`filesrc`/`appsrc ! qtdemux ! palmvideodecoder ! appsink`), the NT12 frame
   untiled and converted to the player's size (libswscale.so.0 or a GL shader that reads the tiles), published as the player's image.
2. Full screen without a copy: `palmvideosink` on the video plane under the card, the card's alpha opened over the player's rectangle
   (display-gl forces it to 1 today).
3. HLS: Zinc reads the playlist and the segments (its own HTTPS: the device's TLS is too old for today's servers), the TS segments
   demuxed (libavformat 52's `mpegts` or a vendored demuxer) and fed to the decoder through `appsrc`.

## zinc:video on the tablet (2026-10-15, plan step 1 done)

- zinc:video is one player (`plugins/video/native/player.h`: playlists, gapless, pacing, the image) over a backend: FFmpeg
  (`video.host.cpp`, unchanged behaviour: tests `video` and `video_layers` pass on the Mac) or GStreamer (`video.webos.cpp`).
- The webOS backend opens GStreamer 0.10 by `dlopen`: `filesrc ! qtdemux ! palmvideodecoder ! appsink`. The NT12 picture is read
  through its 64x32 tiles (VLC's `qcom.c` arithmetic; the test pattern comes out right), scaled to the player's size and converted to
  RGB in one pass.
- The decoder's buffers have no cache: read in place, a 1080p picture took 350 to 550 ms; copied whole first, 28 ms of copy and 45 of
  conversion; now only the rows the scale samples are untiled into a line (64-byte reads), the halves on the two cores: 28 to 40 ms a
  picture for 1080p or 720p to 1024x576. A real program shows 20.7 frames a second of the 1080p clip (`VideoTest`, in its jail).
- The PDK jail has no `/dev/msm_vidc_dec`: zinc-helper adds the node to every `/var/palm/jail/org.zinc.*/dev` (it survives a launch).
  A per-application `jail_app.conf` must carry Palm's signature, so it is no way.
- Next for 30 frames a second and more: the video plane (`palmvideosink`, no copy at all) under the card for a full-screen player;
  the CPU path stays for small players and pictures drawn over.
