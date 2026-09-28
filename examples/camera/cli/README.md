# Camera CLI

A headless camera session with `zinc:gphoto2` ([plugin guide](../../../docs/plugins/gphoto2.md)), printed step by
step: detect the cameras, open the first one, list every setting, change the ISO, watch a bad value be rejected,
fire the shutter (the file arrives as an event), capture a photo into `captures/`, close. Useful as a template for
time-lapse or photobooth scripts that need no screen.

## Run it

```sh
ZINC_FAKE_CAMERA=1 zinc run examples/camera/cli    # macOS, with the built-in fake camera
zinc run examples/camera/cli                       # macOS, with a real camera over USB (PTP mode)
zinc run examples/camera/cli --target sim          # Node: always the fake camera (prints the same lines)
zinc run examples/camera/cli --target rpi1         # Raspberry Pi build under QEMU (0 cameras unless faked)
zinc run examples/camera/cli --target linux
```

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the session: one async function per step, awaited in order; errors from the camera are `Error`s |
