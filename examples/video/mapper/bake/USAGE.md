# Bake a mapping to video

`bake.py` exports the **saved layer state** in `mapping.json` to a silent H.264 MP4. It uses the actual Zinc GL mapping compositor, including corners, mesh, polygon masks, crop and edge blend. The resulting image is already mapped: play it on a matching output without applying the mapping a second time.

```sh
python3 examples/video/mapper/bake/bake.py /path/to/project/mapping.json /path/to/output.mp4 \
  --media /path/to/project/media --size 1920x1080 --duration 10 --fps 30 --zinc /path/to/zinc
```

Requires Python 3, Zinc with `display-gl` and `mapping`, a working background GL display, and FFmpeg with `libx264`. `--media` defaults to the `media` folder beside `mapping.json`; `--size` defaults to 1280x720, `--duration` to 5 seconds, and `--fps` to 30. Specify the target projector's exact resolution. Width and height must be even and no larger than 4096. Existing outputs are never overwritten.

By default this is a static export, not a show renderer: it holds one rendered frame for the requested duration and has no sound or cues. PNG and JPEG media, solid, gradient and pattern sources are supported. Videos are rejected unless `--animated` is selected, and missing media are rejected, as are saved runtime-image masks (their handles do not persist across runs). Live image sources without a media file are rejected. The project is read only; failure leaves no partial output.

Timed cue transitions, audio and multi-projector coordination require further work. Real-time frame capture cannot guarantee offline frame timing.

The native delivery panel shows renderer progress and can cancel a video export. Cancellation waits for its renderer/encoder to exit and removes temporary files before reporting completion. A completed MP4 is never removed; once publication starts the export finishes normally. Project assembly is a separate operation and finishes its copy instead of being killed mid-write.

## Animated export (up to four video layers)

Add `--animated` to render up to four video layers from time zero at normal speed. FFmpeg first decodes it to a fixed-rate image sequence; each frame is mapped separately by Zinc before the results are encoded. This preserves the mapping while avoiding a real-time playback clock. PNG/JPEG still layers can be composited with that video. The output remains silent and has no cues or show transitions.

```sh
python3 examples/video/mapper/bake/bake.py /path/to/project/mapping.json /path/to/output.mp4 \
  --animated --size 1280x720 --duration 2 --fps 30 --zinc /path/to/zinc
```

The current animated path accepts one to four video layers, up to 120 frames and 1920x1080 for both source and output. Duration times FPS must be an integer; the source must contain that many frames after fixed-rate conversion. No looping, media offset, variable playback speed, sound or cue automation is applied. The input and output frames are held temporarily on disk; free space is checked before decoding and the temporary directory is removed on ordinary completion or error. Every frame starts a separate Zinc process, so this first version is intentionally slow. The program reports the frame being rendered. FFprobe is also required; use `--ffprobe` if it is not on PATH.

## Select a cue column

The saved show does not store durations for columns. Supply the show, a **zero-based** column number and an explicit duration to render one column at a time:

```sh
python3 examples/video/mapper/bake/bake.py /path/to/project/mapping.json /path/to/cue.mp4 \
  --show /path/to/project/show.json --column 0 --animated --duration 2 --fps 30 --zinc /path/to/zinc
```

The column's media, source, fit, frame, picture, colour and loop setting are applied to their corresponding mapping layers. Empty cells clear their layer. Videos begin together at zero and must cover the requested duration; a loop setting is not executed. Omit `--animated` for a cue containing only still media or generator sources. The exporter does not schedule transitions between columns or infer timing; compose an explicit timeline before asking for a multi-cue show render.
