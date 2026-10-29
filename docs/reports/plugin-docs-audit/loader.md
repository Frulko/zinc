# loader (`zinc:loader`, `zinc:loader/ui`)

## What it is
The loading screens shown while a game's asset groups load (`zinc.json` "loading"): a progress bar, a splash with a thin bar, and a zinc:ui `<Loader>` for your own screens. For game makers who want a first-run screen that does not flash.

## Targets and status
- plugin.json: macos, linux, windows, rpi1, wasm, esp32, ps2 (pure Zinc, no native code).
- Doc says the stage runs in the interpreter, a built executable and `--engine quickjs`; says nothing about targets.
- backlog/later.md ZN-447: the stage does not run yet in the browser export (worker's blocking frame loop) nor on the ESP32 device core (needs asset host rows). So wasm/esp32 in the manifest are ahead of the truth.
- Test: `tests/t1/loader.sh` (data `tests/data/loader/`, golden `tests/golden/loader/frames.txt`). Template: `templates/game-2d` declares a bar loader.
- Other lines: ZN-851 (memo of a failed plugin build), ZN-650.07.06 (a different "loader": data field paths), ZN-?: Rspack/webpack recipe.

## What the docs have
- [x] Overview (the stage, where the design lives)
- [x] Requirements: `zinc.json` keys table (`screen`, `groups`, `minMs`, `fadeMs`)
- [x] Quick start (zinc.json snippet + a custom screen module)
- [~] API reference: `bar`, `splash`, `Loader`, `screen()`; no `Screen` type, `LoaderProps`
- [x] Example code
- [~] Runnable example: only `templates/game-2d` and the test data; no `examples/` demo shows the stage
- [ ] Screenshot or GIF (none, although `ZINC_SHOT_FRAMES` can capture the stage)
- [ ] Tutorial
- [ ] Commands (no `zinc run` line, no `ZINC_SHOT_FRAMES` recipe)
- [~] Notes: progress, no-flash rule, frame counting, engines
- [x] Test

## What is missing
1. Screenshots: bar screen, splash screen with the thin bar, `<Loader>` themed light and dark. Use `tests/data/loader` with small asset turns (`ZINC_ASSET_TURN=...`, `ZINC_SHOT_FRAMES=3,10 ZINC_SHOT=docs/img/loader-bar.png`) or `templates/game-2d`.
2. GIF of the cross-fade (`fadeMs`) from the frame hash run.
3. 4-step tutorial "Add a loading screen to a game": declare groups, add `loading`, make your own screen module, show a level loaded in game with `assets.loadGroup` and `<Loader>`.
4. Table of the zinc.json "loading" keys defaults (fadeMs default, minMs 0) in one place and cross-link from docs/guide/01-getting-started.md (which has a one-line summary).
5. API section for the types: `Screen`, `LoaderProps` (`progress`, `className`).
6. Target table: state browser export and ESP32 are not wired (ZN-447 later line) and fix the manifest if needed.
7. Troubleshooting: "my screen never appears" (groups already resident, load within one frame), the TSX screen needs a typed engine, `setTheme(DARK)`.
8. Link a real demo (add the loader to a bigger example such as examples/marble or an asset-heavy demo).
9. Mention `zinc:loader` in docs/plugins.md index (check).

## Wrong or stale
- Manifest lists `wasm`, `esp32`, `ps2`, while ZN-447's later line says the stage is not run in the browser export or on the ESP32 core.
- Doc intro refers to "design: 7.5 of docs/reports/games/toolchain-assets-loading.md": verify the section number.
- No lowercase-tag or `class` problems: ui.tsx uses `<View className=...>`.
- Doc says "`splash(background, fit, scale, color)`" fit values (0/1/2): matches code.

## Suggested pages
- API: loader (generated: bar, splash, Screen) and loader/ui (Loader, screen)
- Guide: The loader stage (zinc.json "loading", progress, no flash, frames)
- Steps: Add a loading screen to a game
- Steps: A custom screen with zinc:gfx or zinc:ui
- Examples: game-2d template, tests/data/loader
- Notes: Targets and engines (browser/ESP32 gaps)
