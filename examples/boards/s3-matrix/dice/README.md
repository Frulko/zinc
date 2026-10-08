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

## Scenario

`scenarios/shake.yaml` shakes the die and checks what it prints and shows, in virtual time, without a window (`zinc sim`). `board.json` says that the part `imu` shakes with the gamepad button A
(`attrs.inputs`); the steps `set-control`, `wait-serial`, `advance`, `expect-frame` (the hash of the 8x8 frame), `take-screenshot` and `expect-pixel` work, a failing step exits 1 and leaves its last frame in `--out`.

```sh
zinc sim examples/boards/s3-matrix/dice/scenarios/shake.yaml
zinc sim examples/boards/s3-matrix/dice/scenarios/shake.yaml --update-goldens   # rewrites shots/landed.png
```
