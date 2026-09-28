# tilt-sand

Coloured grains of sand in the 8x8 box of the [Waveshare ESP32-S3-Matrix](../../../../docs/boards.md#waveshare-esp32-s3-matrix):
tilt the board and they pour to the lower side, shake it and they fly everywhere.

| file | what |
| --- | --- |
| `src/main.ts` | reads the IMU every frame, steps the sand, draws one LED per grain |
| `src/sand.ts` | the sand rules: fall one cell downhill, slide diagonally around obstacles, flow along the surface to fill holes |
| `src/sand.check.ts` | self-check of the rules (`zinc run src/sand.check.ts --target sim` prints `sand ok`) |
| `zinc.json` | `"board": "waveshare-esp32-s3-matrix"`: 8x8, WS2812 on GPIO14, IMU pins, esp32s3 + PSRAM |

```sh
zinc run examples/boards/s3-matrix/tilt-sand                      # macOS emulator: arrows / mouse drag tilt, Space shakes
zinc run examples/boards/s3-matrix/tilt-sand --target esp32       # firmware in Espressif QEMU (no LEDs, no IMU: level board)
zinc flash examples/boards/s3-matrix/tilt-sand --target esp32     # build + flash the real board over USB-C
```

On the board: if the sand rolls the wrong way, the IMU axes need adjusting (`plugins.imu-qmi8658.x/y` in `zinc.json`,
see docs/boards.md).
