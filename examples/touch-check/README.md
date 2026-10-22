# touch-check

How precise a touch screen is, and the map that corrects it. Tap the centre of each of the eight crosses; after each round the screen
shows:

- **the distortion**: a grey grid where a finger aims, and where the touch reports each point (green within 5 px, amber within 15, red
  beyond); the red dots are where the finger lifted on average at each cross;
- **how far off** the taps are, and how far once the best **affine map** (a scale, a shear, a turn or a mirror, an offset, fitted by least
  squares over every tap) corrects them;
- **the confidence** in that map, which rises with the rounds: a finger scatters its taps (8 to 10 px on the ESP32-2432S022), so the map
  is known to that scatter times sqrt(3 / taps), the standard error of the fit; 100% when it is known exactly, 0% at 8 px (a finger's
  own scatter). From the second round the report also says how much the last round moved the map at the screen's corners.

**Again** runs another round, the taps kept. **Apply** hands the map to the touch on top of the one it has (on the ESP32 the board keeps
it, for every program), and the rounds start again through it: what is left is the finger's. **Reset** forgets the taps; held, it gives
the touch the controller's own pixels again, to measure the bare panel.

```sh
zinc run examples/touch-check --target esp32            # the ESP32-2432S022 (mquickjs, LVGL)
zinc run examples/touch-check --target esp32 --emulator # esp32sim: its touch is exact
zinc run examples/touch-check                           # the computer: the mouse is exact, the system owns the touch (Apply only shows)
```

Each tap and each round go to the console (the board's UART), with the map's six coefficients: `touch: round 3, 24 taps: off by 24.3 px
(52.5 at most); x = 1.112 rx -0.180 ry +9.3, y = ... leaves 7.9 px (25.8 at most); confidence 44%, known to 2.8 px, moved 1.2 px`.

On the ESP32-2432S022 the firmware also calibrates by itself: keep a finger on the screen while the board starts and tap the five crosses
(`docs/boards.md`).

## Layout of `src/`

- `main.ts`: the screen, the two pages, the frame loop (the pointer to the state while the crosses are shown).
- `constants.ts`: the crosses, the grid, the colours, the confidence's scale.
- `state.ts`: the taps, the report of a round (errors, map, confidence), Again, Apply, Reset.
- `core/fit.ts`: the affine map, its fit by least squares, its inverse and composition.
- `components/marks.ts`: the dots, rectangles, texts and buttons the pages draw with.
- `pages/measure.ts`, `pages/result.ts`: the crosses; the report and the distortion view.
