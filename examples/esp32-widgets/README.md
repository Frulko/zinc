# esp32-widgets

The widgets tour of the ESP32-2432S022 (240 x 320, no PSRAM) on LVGL (`zinc:lvgl`): six pages under a title bar with the frame rate,
above a navigation bar.

| Page | What it shows |
|---|---|
| Home | an arc gauge eased to each new reading, three readings, a throughput line that moves every frame |
| Input | buttons, sliders, switches, check boxes, radio buttons, a spinner and a bar, a PIN keypad (code 2432); the page scrolls |
| Music | a player: cover, a spectrum analyser (bands that jump on the beat and fall back slowly, louder on the bass side), seek slider, transport buttons |
| Lottie | a LottieFiles animation drawn by ThorVG (64 x 64, 16 KB), play, pause, replay, and what it costs a frame |
| Bench | objects bouncing in four scenes (rounded squares, translucent circles, text, a mix), 4 to 64 of them, "Run" measures each scene for 3 s and prints the results on the console; LVGL's time, the pixels sent, the panel bus's time and the board's estimated frame rate; the page scrolls |
| Info | the auto tour, a button that turns the screen to landscape and back (the pages lay out again at the new size), the backlight, LVGL's memory, the JavaScript heap, the board's heap, a frame's cost, the chip, CPU, flash, firmware and ESP-IDF (`zinc:device`); the page scrolls |

```sh
zinc run examples/esp32-widgets --target esp32                     # on the board (mquickjs, from zinc.json)
zinc run examples/esp32-widgets --target esp32 --emulator --live   # in esp32sim, no board: its window, the mouse is the finger
zinc run examples/esp32-widgets                                    # on the Mac
```

The program only builds the objects and sets values; LVGL lays them out, scrolls, animates and redraws what changed, in C, in 32-row areas
sent straight to the panel. A page is built when it is shown and deleted when it is left. Every five seconds the console prints the page,
the frame rate, LVGL's time a frame, LVGL's memory and the free heap.

On the computer LVGL draws from a pool of the board's size (`plugins/lvgl/lv_conf.h`), so a page that would not fit the board fails here
too; the board's frame rate is estimated from the pixels sent and the panel's 10 MHz bus, which neither the computer nor the emulator
counts.

`src/`: `main.ts` (start, navigation, the frame), `state.ts` (the clock, the simulated sensors, the player, the benchmark, LVGL's
figures), `lottie.ts` (the animation's JSON, LVGL's example, MIT), `constants.ts` (sizes, the zinc palette, LVGL's symbols), `components/`
(the shell and the card, row, badge pieces) and one file per page in `pages/`.