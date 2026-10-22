# lvgl plugin (`zinc:lvgl`)

[LVGL](https://lvgl.io) 9.6 (C, MIT, `plugins/lvgl/vendor/`, pinned in `vendor/PIN`) from TypeScript: the interface of a small board
without PSRAM. LVGL keeps the widgets, the flex layout, scrolling with inertia, the animations and the drawing in C; the program holds
handles (`i32`), sets values and reads events. LVGL redraws only what changed. On the ESP32 it renders 32-row areas in RGB565 and sends
them to the panel itself (`zn_panel_flush`, `firmware/esp32-mquickjs/main/zn.h`). Its objects live outside the 96 KB JavaScript heap.
On the computer the same program runs on the interpreter, AOT or QuickJS, and the screen is one `zinc:gfx` image.

`zinc:ui` and the kits are the interface of the computer and the phone. On a microcontroller, `zinc:lvgl` is the one to take: a whole
page of widgets costs about 60 KB of bytecode, where `zinc:ui` does not fit the board's heap.

```ts
import * as lv from 'zinc:lvgl';

lv.start(240, 320, true, 0x3b82f6);                 // the screen, the dark default theme, its primary colour
const page = lv.screen();
lv.flex(page, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_CENTER);
const volume = lv.slider(page, 0, 100, 60);
const play = lv.button(page, 'Play');
lv.on(volume, lv.EVENT_VALUE_CHANGED, () => console.log('volume ' + lv.value(volume)));
lv.on(play, lv.EVENT_CLICKED, () => lv.setText(lv.buttonLabel(play), 'Pause'));
lv.run((dt: number) => { /* the program's frame, before LVGL's */ });
```

- **Start and run.** `start(w, h, dark, primary)` once. `run(each)` takes over `onFrame`. Each frame it calls `each(dt)`, then gives
  LVGL the frame's time and the pointer, runs LVGL's timers and redraw, calls the listeners, and shows the result. LVGL's clock is the
  frame's: a deterministic run (`ZINC_DETERMINISTIC=1`) gives the same pixels every time.
- **Objects.** `obj`, `label`, `button` (with a centred label: `buttonLabel`), `slider`, `toggle`, `checkbox`, `arc`, `bar`, `chart`,
  `spinner`, `buttonMatrix` (one object for a keypad), `led`, `roller`. `child(o, i)`, `remove(o)` and `clean(o)` also work on them.
- **Charts.** `chart(parent, type, points, min, max)`, `chartSeries(chart, rgb)`, then `chartPush` shifts a series by one value (a
  line that scrolls) and `chartSet(chart, series, index, value)` sets a point in place (a spectrum's bars).
- **Lottie.** `lottie(parent, json, w, h)` plays a LottieFiles JSON in a loop, drawn by ThorVG (the copy LVGL carries) into a buffer of
  `w * h * 4` bytes of LVGL's memory; `lottiePlay(anim, on)` pauses and resumes it, `lottieRestart(anim)` goes back to its first frame.
  LVGL draws a frame only while the animation is visible. On a board without PSRAM keep it small: 64 x 64 is 16 KB.
- **Layout.** `size`, `pos`, `align`, `flex(o, flow, main, cross)`, `grow`, `pct(v)`, `SIZE_CONTENT`. `FLAG_OVERFLOW_VISIBLE` on a row
  lets a pressed button, which the theme grows a little, draw past the row's edge.
- **Turning the display.** `rotate(quarter)` (0 as started, 1 to 3 clockwise) and LVGL lays the screens out again at the turned size;
  `width()` and `height()` give it, so a program builds what depends on the size again. On the board the panel turns (MADCTL) and the
  touch with it; on the computer the picture is centred in the window, upright (a square window holds both).
- **Deleting.** `remove(o)` and `clean(o)` also drop the handlers of the objects deleted and their queued events, so a program can build a
  page when it is shown and delete it when it is left: on a board without PSRAM, only the page shown then takes memory.
- **Style.** `style(o, prop, value, selector)` for numbers (`PAD_*`, `RADIUS`, `BORDER_WIDTH`, `BG_OPA`...). `color(o, prop, rgb,
  selector)` for colours. `bg`, `textColor`, `pad`, `gap`, `radius`, `border` and `font(o, px)` are shortcuts; the fonts are Montserrat
  12, 14, 20 and 28. A selector is a part (`PART_INDICATOR`...) or'ed with a state (`STATE_CHECKED`...).
- **Values and events.** `setText`, `setValue`, `value`, `checked`, `selected`, `buttonText`, `scrollTo`, `scrollY`.
  `on(o, EVENT_*, fn)`: the events wait in a queue the frame reads, so no C calls into JavaScript.
- **Figures.** `stats()`: since the last call, the turns, LVGL's microseconds (total and slowest), the areas and pixels sent; then the
  free heap and its lowest point (the board's; -1 on the computer) and LVGL's pool in use, its size and its peak (the computer's; 0 on
  the board, where LVGL takes the heap).
- **Symbols.** LVGL's Font Awesome glyphs are in its fonts: `''` (home), `''` (play)... (`LV_SYMBOL_*` in
  `vendor/lvgl/src/font/lv_symbol_def.h`).

**Configuration.** `plugins/lvgl/lv_conf.h`: RGB565, the software renderer with ThorVG, no logs, and the widgets above. Changing it
rebuilds the library and the board's firmware.

**Memory.** On the board LVGL takes the heap the JavaScript runtime leaves (`malloc`): there is no pool to fragment, and the heap is the
real limit. On the computer (the window and the mquickjs check of `--target esp32`) LVGL draws from a pool of `LV_MEM_SIZE`: the board's
budget in 64-bit objects (96 KB for the board's 138 KB), so a screen that would not fit the board does not fit the computer either, and
`create` says "LVGL's memory pool is full" instead of the board crashing later. The firmware's main task gets a 28 KB stack when
`zinc:lvgl` is in it (`sdkconfig` in `plugin.json`): ThorVG goes 21 KB deep to draw a Lottie animation, where 8 KB is the default.

**Example.** `examples/esp32-widgets`: six pages (dashboard, controls, player, Lottie, benchmark, system). **Test.**
`tests/t0/mquickjs_esp32.sh` checks it under mquickjs with LVGL's C built for the computer.
