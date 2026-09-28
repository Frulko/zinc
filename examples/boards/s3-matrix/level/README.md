# level

A spirit level for the [Waveshare ESP32-S3-Matrix](../../../../docs/boards.md#waveshare-esp32-s3-matrix): the 2x2
bubble floats to the higher side; within 2 degrees of level it turns green and the four marks around the centre light
up. A dim rainbow drifts behind it. The angles and the sensor temperature are printed once per second on the serial
console.

| file | what |
| --- | --- |
| `src/main.ts` | angles from `zinc:imu`, bubble smoothing and drawing |
| `src/color.ts` | rainbow and dimming helpers |
| `zinc.json` | `"board": "waveshare-esp32-s3-matrix"` |

```sh
zinc run examples/boards/s3-matrix/level                  # macOS emulator: arrows / mouse drag tilt
zinc flash examples/boards/s3-matrix/level --target esp32 # the real board, then: zinc monitor --port /dev/cu.usbmodem*
```

Tune `LEVEL_DEG` (tolerance) and `RANGE_DEG` (tilt that puts the bubble at the edge) in `src/main.ts`. A sensor that
reads a degree or two off when the board lies flat is normal: put the printed angles of a level board in
`OFFSET_X` / `OFFSET_Y`.
