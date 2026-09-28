# falling-cubes

Coloured cubes rain on a 16x16 WS2812 LED matrix, pile up like sand (a cube slides off a taller stack), and a full
row blinks then clears, Tetris style. When a column overflows the board fades out and a new round starts. It runs
unattended, which makes it a good burn-in test for a new panel.

## Run it

```sh
zinc run examples/led/falling-cubes                  # macOS: 16x16 matrix emulator
zinc run examples/led/falling-cubes --target esp32   # firmware: data on GPIO 13, serpentine wiring
zinc build examples/led/falling-cubes --target rpi1  # Raspberry Pi: SPI MOSI (GPIO 10)
```

On a 32x8 strip (set `width` / `height` in `zinc.json`) each cube is one LED; on 16x16 it is 2x2 LEDs.

Controls: **Space** (pad A) drops a burst of six cubes.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the round: spawning cubes on a timer, bursts, the fade-out after an overflow |
| `src/board.ts` | the `Board` class: settled cells, falling cubes with gravity, sand sliding, full rows |
| `src/render.ts` | one rect per run of equal colour (fewer draws on an ESP32), blinking row, brightness |
