---
title: Video playback
description: Play a playlist of video files on a thread of its own and draw it like an image.
order: 0
---

`zinc:video` plays video files. A `Player` decodes a playlist on its own thread (FFmpeg on a desktop or a Pi, the platform's decoders
on phones and webOS) and hands you the latest picture as a runtime image, so a video is drawn like any other image, and several
players can run at once.

![A bouncing video window over a coloured background](img/video-bounce.png)

```ts
import { Player, EXTENSIONS } from 'zinc:video';
```

## Good to know

- Where it runs: macOS (VideoToolbox), Linux and the Raspberry Pi (V4L2 when the kernel has it, else software), Android, iOS and
  webOS. It does not run on the ESP32, the PlayStations or the web: use the browser's own `<video>` there.
- On a desktop FFmpeg must be installed (`brew install ffmpeg` on macOS).
- Using it on a target that lacks it is the build error `Z5003`.

## Where to go next

- [Play a folder of videos](01-play-a-folder.mdx).
- The reference lists the support matrix, how the player works and its performance on a Pi:
  [docs/plugins/video.md](https://github.com/Frulko/zinc/blob/main/docs/plugins/video.md).
- Examples: [`examples/video/bounce`](https://github.com/Frulko/zinc/tree/main/examples/video/bounce) (the picture above),
  [`looper`](https://github.com/Frulko/zinc/tree/main/examples/video/looper) and
  [`quad`](https://github.com/Frulko/zinc/tree/main/examples/video/quad).
- The code: [`plugins/video/index.ts`](https://github.com/Frulko/zinc/blob/main/plugins/video/index.ts).
