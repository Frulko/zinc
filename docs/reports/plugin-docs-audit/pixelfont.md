# pixelfont documentation audit

## What it is
5x7 and 3x5 bitmap fonts (ASCII) for LED matrices and tiny screens; drawing emits one `gfx.rect` per vertical run of lit pixels.

## Targets and status
`plugin.json`: macos, linux, windows, rpi1, esp32, wasm, ps2. No `entry` field (the default `index.ts`). No page of its own: it appears in one line of `docs/plugins/displays.md`, one in `docs/prototype.md` and one in `docs/guide/03-ui-apps.md`. No test named pixelfont.

## What the docs have
- [ ] overview: only a header comment in `index.ts` and the three one-liners above
- [ ] install/requirements
- [ ] quick start
- [ ] API reference (exports: `FONT_5X7`, `FONT_3X5`, `fontHeight`, `textWidth`, `drawText(x, y, s, color, font, clipX0, clipX1)`)
- [ ] example code
- [~] runnable examples exist: `examples/led/scroll-text`, `examples/boards/s3-matrix`, `examples/boards/scrollphat` (none linked from a doc page)
- [ ] screenshots or photos
- [ ] tutorial
- [ ] commands
- [ ] notes (glyph range, uppercase-only 3x5, no `?` fallback list)
- [ ] test: no test found under tests/ that imports it directly (examples are covered by board demos only)

## What is missing
1. Create `docs/plugins/pixelfont.md` with overview, the 12-line scrolling text snippet from `examples/led/scroll-text`, and the API table above.
2. Image: a glyph sheet of both fonts (render every character, `ZINC_SHOT`), which doubles as the reference.
3. Screenshot of `examples/led/scroll-text`; simulated Scroll pHAT (`zinc run --simulate`, see `devices/`) for `examples/boards/scrollphat`.
4. A 4-step tutorial: scroll a message on a 32x8 matrix (`s3-matrix`) or on the Scroll pHAT, with the wiring pins table (hardware).
5. Document `clipX0/clipX1` use for scrolling and `textWidth` for centring.
6. Note character coverage: 0x20..0x7E for 5x7, 0x20..0x5F for 3x5 (lowercase mapped up), anything else drawn as `?`; no accents.
7. A T0 test that checks `textWidth` and a glyph hash.
8. (hardware) photo of the matrix running; (owner) decide on a larger font set (accents, 8x8).

## Wrong or stale
- `docs/guide/03-ui-apps.md` says "expect only a handful of draw commands per frame"; a long line costs about one rect per vertical run, so tens of commands. Reword.
- Targets include ps2 and wasm; no doc mentions them.

## Suggested pages
- Pixel fonts: overview
- Scroll text on an LED matrix (tutorial)
- API reference (generated)
- Glyph sheet (generated image)
- Boards and wiring (hardware)
- Examples
