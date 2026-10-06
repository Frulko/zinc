# Zinc Next: window and input

`zinc run app.tsx` on a program that uses `zinc:gfx` or `zinc:ui` opens a window (the SDL HAL of the old runtime, `targets/macos/hal_sdl.cpp`) and runs
until it is closed; the same holds for programs built with `zinc build`. A run with `ZINC_DETERMINISTIC=1`, `ZINC_HEADLESS=1`, `ZINC_RECORD` or
`ZINC_REPLAY`, or an engine built without SDL3, uses the headless HAL: virtual clock, fixed time step of 1/60 s, no window. Tests and goldens use that one.

Both HALs are in one binary: their `hal_*` functions are renamed at compile time and `src/host/hal_dispatch.cpp` forwards to one of them when the
program starts. With a window the time step is measured (at most 0.1 s) and a frame lasts at least 8 ms; `ZINC_FRAMES=n` still ends a run after n frames.

## Input

Every input function of `zinc:gfx` (pointer, buttons, wheel and trackpad scroll, pinch, touch, pen, keys, typed text, text-input requests, clipboard,
cursor, Escape) reads the HAL through host calls (`Rt::HostGfx*`, one table in `include/zn/runtime.h`). A frame starts with `HostGfxPoll`: input is
read, then the time step is taken, as in the old runtime's loop.

Headless runs can be scripted with `ZINC_INPUT=file`, one event per line, `<frame> <event>`:

```
5 move 57 201        # pointer to (57, 201)
8 down               # press the left button (also: up, right-down, right-up)
10 key Backspace     # a key (names as in KeyboardEvent.key; modifiers after: shift ctrl alt meta)
12 text zinc         # typed text
15 wheel 0 -3        # scroll steps (x, y)
```

The events reach `zinc:ui` as a window's would, so the whole chain is tested: `tests/golden/ui/click.tsx` (a button press fills a progress bar) and
`type.tsx` (typing and Backspace in a text field), with goldens made here and checked by eye.

## Checked and not

`tests/t1/input.sh` (scripted pointer and keys, clipboard, the window HAL on SDL's dummy video driver), `tests/t2/input_aot.sh` (the same in a
compiled program). A real window was opened and ran 180 frames at vsync speed; mouse and keyboard through the operating system were not exercised
(the scripted events take the same path from the HAL up).
