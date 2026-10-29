# lvgl doc audit

## What it is
`zinc:lvgl`: the LVGL 9.6 widget library from TypeScript, for small boards without PSRAM (and on the Mac in an image). The program holds handles and sets values; LVGL does layout, scrolling, animations and redraw in C.

## Targets and status
- plugin.json: `macos`, `linux`, `esp32` (module, not a display). LVGL pinned in `vendor/PIN`.
- Verified: Mac (deterministic runs), mquickjs ESP32 check, esp32sim (touch), ESP32-2432S022 board per the example's screenshots. Lottie, rotation, animations covered by `tests/t1/lvgl.sh`.

## What the docs have
- [x] Overview and rationale (`docs/plugins/lvgl.md`, 85 lines)
- [~] Requirements: none stated (needs the esp32 target; first build compiles LVGL, about a minute)
- [x] Quick start code, animation snippet
- [~] API reference: described by topic, not complete. 158 exports in `index.ts`; about 90 are not named in the page
- [x] Example: `examples/esp32-widgets` (six pages, README with commands), `examples/touch-check`
- [x] Screenshots: `docs/img/esp32/*.png` (9) used by the example
- [ ] Tutorial
- [x] Commands: `zinc run ... --target esp32 [--emulator --live]`
- [~] Troubleshooting: memory/pool and stack notes; no symptom table
- [x] Tests: `lvgl` (t1), `mquickjs_esp32` (t0), `esp32sim_touch`, `touch_check`

## What is missing (priority order)
1. A generated API table of every export with signature (the `index.ts` declarations are the source). Undocumented: all `ALIGN_*`, `FLEX_*` (END, ROW, ROW_WRAP, SPACE_*), `PART_*`, `STATE_*`, `FLAG_*`, `EVENT_PRESSED/RELEASED/SCROLL/LONG_PRESSED/SHORT_CLICKED`, style props (`BG_COLOR, BG_GRAD_*, BORDER_*, PAD_*, SHADOW_WIDTH, ARC_*, LINE_*, TEXT_*`), `CHART_LINE/BAR`, `flag`, `hasState`, `hidden`, `LENGTH`, `ANIM_DURATION`.
2. A "Requirements and targets" table (esp32 board, mac preview, linux, no wasm) and the sizes (60 KB bytecode, 96 KB JS heap).
3. A 6-step tutorial "A settings screen on a 240x320 board": layout with flex, slider + label, button event, style, animate, run on the Mac then esp32sim. Screenshot each step with `ZINC_SHOT=step.png zinc run`.
4. Widgets gallery: one image per widget (`obj` ... `roller`) from the Mac run.
5. Notes: fonts available (12, 14, 20, 28), symbols list with names (the page prints empty-looking `''` glyphs), the pressed-button 3 px padding rule.
6. Compare with `zinc:ui` on one page: when to take which.
7. AOT ESP32 path without mquickjs: owner decision 2026-10-22, doc `esp32-aot-lvgl.md` (backlog); note as "planned".

## Wrong or stale
- Symbols bullet prints `''` for the glyphs: private-use characters do not show; use names.
- Page says "Example `esp32-widgets` ... six pages" matches README: fine. No other stale item found.

## Suggested pages
- API/reference: zinc:lvgl (generated)
- Guide: Build a board UI with LVGL
- Steps: Your first LVGL screen (tutorial)
- Explanation: Memory, rendering and the frame loop
- Notes: Animations, Lottie, Rotation, Fonts and symbols
- Examples: ESP32 widgets, Touch check
