`tone.opus` is an original generated 0.24-second, 440-Hz sine (48 kHz stereo), no third-party recording. Generated with FFmpeg 9.0.2's libopus encoder:

```
ffmpeg -v error -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.24 -ac 2 -c:a libopus -b:a 48k tone.opus
```

SHA-256: `f97e9881ba181be01dd6042b3c1d7fa5ba1b960a8bea7599b98fdf8dcec96ad6`.
The fixture is committed, so tests need no encoder or system install. Ogg stream serials may differ when regenerating it.
