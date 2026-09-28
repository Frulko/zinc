# dice

Shake the [Waveshare ESP32-S3-Matrix](../../../../docs/boards.md#waveshare-esp32-s3-matrix) to roll a die: the face
tumbles through random values, slows down, lands with a small hop and stays in its colour. Left alone, it dims.
Every roll is printed on the serial console (`zinc monitor --port /dev/cu.usbmodem*`).

| file | what |
| --- | --- |
| `src/faces.ts` | pip layouts (2x2 pips on a 3x3 grid) and colours |
| `src/main.ts` | shake detection (`zinc:imu`), the rolling animation |
| `zinc.json` | `"board": "waveshare-esp32-s3-matrix"` |

```sh
zinc run examples/boards/s3-matrix/dice                  # macOS emulator: Space shakes
zinc flash examples/boards/s3-matrix/dice --target esp32 # the real board
```

The shake threshold is in `plugins/imu-qmi8658/index.ts` (`SHAKE_G`, about 0.9 g away from rest).
