# scroll-text

A smooth, looping marquee on a WS2812 (NeoPixel) LED matrix, drawn with the `zinc:pixelfont` 5x7 bitmap font. On
macOS the matrix appears in an emulator window (round LED dots); on an ESP32 or a Raspberry Pi the same program
drives real LEDs. The display and its wiring are chosen per target in `zinc.json`.

## Run it

```sh
zinc run examples/led/scroll-text                  # macOS: 32x8 matrix emulator
zinc run examples/led/scroll-text --target esp32   # firmware: data on GPIO 13 (vertical serpentine wiring)
zinc build examples/led/scroll-text --target rpi1  # Raspberry Pi: SPI MOSI (GPIO 10)
```

Change `width` / `height` in `zinc.json` for another panel (a 16x16 panel works: the line is centred). Wiring,
level shifting and power: [docs/plugins/displays.md](../../../docs/plugins/displays.md).

Controls: **Left / Right** change the speed, **Space** (pad A) cycles the colour.

## What to look at

| File | Role |
| --- | --- |
| `src/main.ts` | the frame loop: buttons, then advance and draw the marquee |
| `src/marquee.ts` | the `Marquee` class: whole-pixel scrolling, a second copy for a seamless loop, speed and colour |
| `zinc.json` | the display per target: `ws2812` emulator on macOS, pin and serpentine layout on ESP32 |
