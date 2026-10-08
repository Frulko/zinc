# {{name}}

A device made from the `iot-board` template: an ESP32-S3, a QMI8658 motion sensor and a 128x64 SSD1306 OLED, showing a bubble level and the
sensor's temperature. Shake it to set the current position as level.

```sh
zinc run                        # on the desktop: the OLED in a window, the sensor emulated (arrows or a mouse drag tilt, Space shakes)
zinc test                       # the level's maths (tests/level.test.ts)
zinc sim scenarios/level.yaml   # the board of board.json, driven by a scenario: shake, then check the screen
zinc flash --target esp32       # the core firmware on a real board, then zinc run --target esp32
```

| File | What it does |
|---|---|
| `src/main.ts` | reads the sensor every frame and draws the screen |
| `src/level.ts` | angles, calibration and where the bubble goes, without hardware |
| `board.json` | the parts and their wiring (Wokwi's diagram format): the simulator and the docs read it |
| `scenarios/level.yaml` | a `zinc sim` scenario: waits for the program, shakes the board, compares the screen |

The OLED is on I2C (SDA 21, SCL 22 on the ESP32; `/dev/i2c-1` on a Raspberry Pi), set per target in `zinc.json`.
