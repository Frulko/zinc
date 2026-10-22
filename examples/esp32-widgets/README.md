# esp32-widgets

The widgets tour of the ESP32-2432S022 (240 x 320, no PSRAM) on LVGL (`zinc:lvgl`): five pages under a title bar with the frame rate,
above a navigation bar.

| Page | What it shows |
|---|---|
| Home | an arc gauge, three readings, a live line chart |
| Input | buttons, sliders, switches, check boxes, radio buttons, a spinner and a bar, a PIN keypad (code 2432); the page scrolls |
| Music | a player: cover, spectrum, seek slider, transport buttons |
| Bench | squares that bounce (`+4`/`-4`), and LVGL's time and pixels a frame |
| Info | frame rate, LVGL's cost, the board's free heap, the uptime |

```sh
zinc run examples/esp32-widgets --target esp32              # on the board (mquickjs, from zinc.json)
zinc run examples/esp32-widgets --target esp32 --emulator   # in esp32sim, no board (no touch: the first page)
zinc run examples/esp32-widgets                             # on the Mac
```

The program only builds the objects and sets values; LVGL lays them out, scrolls, animates and redraws what changed, in C, in 32-row
areas sent straight to the panel. The whole tour is about 60 KB of bytecode. Every five seconds the console prints the page, the frame
rate, LVGL's time a frame and the free heap.

`src/`: `main.ts` (start, navigation, the frame), `state.ts` (the clock, the simulated sensors, the player), `constants.ts` (sizes, the
zinc palette, LVGL's symbols), `components/` (the shell and the card, row, badge pieces) and one file per page in `pages/`.
