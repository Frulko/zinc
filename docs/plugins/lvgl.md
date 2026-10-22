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
- **Layout.** `size`, `pos`, `align`, `flex(o, flow, main, cross)`, `grow`, `pct(v)`, `SIZE_CONTENT`.
- **Style.** `style(o, prop, value, selector)` for numbers (`PAD_*`, `RADIUS`, `BORDER_WIDTH`, `BG_OPA`...). `color(o, prop, rgb,
  selector)` for colours. `bg`, `textColor`, `pad`, `gap`, `radius`, `border` and `font(o, px)` are shortcuts; the fonts are Montserrat
  12, 14, 20 and 28. A selector is a part (`PART_INDICATOR`...) or'ed with a state (`STATE_CHECKED`...).
- **Values and events.** `setText`, `setValue`, `value`, `checked`, `selected`, `buttonText`, `scrollTo`, `scrollY`.
  `on(o, EVENT_*, fn)`: the events wait in a queue the frame reads, so no C calls into JavaScript.
- **Figures.** `stats()`: since the last call, the turns, LVGL's microseconds (total and slowest), the areas and pixels sent, the free
  heap and its lowest point (the board's; -1 on the computer).
- **Symbols.** LVGL's Font Awesome glyphs are in its fonts: `''` (home), `''` (play)... (`LV_SYMBOL_*` in
  `vendor/lvgl/src/font/lv_symbol_def.h`).

**Configuration.** `plugins/lvgl/lv_conf.h`: RGB565, the software renderer, the C library's `malloc` (the board's heap), no logs, and the widgets above.
Changing it rebuilds the library and the board's firmware.

**Example.** `examples/esp32-widgets`: five pages (dashboard, controls, player, benchmark, system). **Test.**
`tests/t0/mquickjs_esp32.sh` checks it under mquickjs with LVGL's C built for the computer.
