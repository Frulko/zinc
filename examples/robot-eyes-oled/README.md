# robot-eyes-oled

Cozmo-style eyes on a 128x64 SSD1306 (I2C), using pycozmo's eye model (MIT): per eye a size, elliptical corners and
two lids (height, angle, bend), drawn as black masks. Presets are pycozmo / expressive-eyes left-eye values, the right
eye mirrors the lid angles. Idle blinks (1/6 s), random saccades and expressions.

```sh
zinc run examples/robot-eyes-oled                        # emulator window (1-bit pixels)
ZINC_DEMO=anger zinc run examples/robot-eyes-oled        # hold one expression (see NAMES in src/main.ts)
ZINC_DEMO=tour zinc run examples/robot-eyes-oled         # cycle all of them
zinc flash examples/robot-eyes-oled --target esp32 --port /dev/cu.usbserial-XXXX   # SDA 21, SCL 22, I2C 1 MHz
```

Not done: eye and face rotation, per-corner radii beyond the upper-x one, on-device frame rate not measured (full frame =
1 KiB over I2C; `freq` 1 MHz needs a panel that accepts it, else 400000).
