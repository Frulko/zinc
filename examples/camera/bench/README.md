# Camera live view benchmark

Measures the `zinc:gphoto2` live view pipeline ([plugin guide](../../../docs/plugins/gphoto2.md), results there):
preview JPEGs are decoded with TurboJPEG on the plugin's worker thread and drawn in a 1024x683 window for 8 seconds,
first at 1:1, then scaled to the 736x532 box of the remote app. One line per second:

```
t=5s 736x490: camera 30.0 fps, shown 30.0 fps, decode 2.41 ms, ui 60 frames/s
```

## Run it

```sh
ZINC_FAKE_CAMERA=1 zinc run examples/camera/bench     # fake camera paced at 30 fps
ZINC_FAKE_CAMERA=max zinc run examples/camera/bench   # unthrottled: the decoder's ceiling
zinc run examples/camera/bench                        # a real camera over USB
zinc build examples/camera/bench --target rpi1        # Raspberry Pi (also linux)
```

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | opening the camera, the two phases (`setViewSize` switches the decode scale), the per-second report |
