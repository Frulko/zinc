# sprite documentation audit

## What it is
Frames, animations and pivots of the sprite atlases the asset build packs (PNG/SVG/Aseprite) for 2D games, drawn with `zinc:gfx`.

## Targets and status
`plugin.json`: macos, linux, windows, rpi1, wasm, esp32, ps2 (pure Zinc). Doc has no target table; it notes the run without packs (browser export, boards) falls back to loose images and animations need the table. Backlog: ZN-572 (blit speed), ZN-438 (zig c++ warnings).

## What the docs have
- [x] overview (`docs/plugins/sprite.md`, 43 lines)
- [~] install: the `zinc.json` rule is shown; Aseprite/atlas tooling prerequisites are not
- [x] quick start
- [x] API reference table (Atlas, Frame, Animation) matches `index.ts`
- [x] example code
- [~] runnable example: `examples/platformer`, `examples/n3ds-platformer`, `templates/game-2d`; the page names none
- [ ] screenshots (atlas page image, an animation strip)
- [ ] tutorial
- [ ] commands (`zinc dev` hot reload is mentioned, no command shown)
- [~] notes: reload and no-packs behaviour; no note on atlas size limits or `@2x`
- [x] tests: `sprite_atlas`, `asset_reload`, `assets`

## What is missing
1. Name and link the examples: `examples/platformer`, `templates/game-2d` (`zinc new --template game-2d`), with a screenshot of the platformer.
2. A 6-step tutorial "A walking hero": draw frames in Aseprite, add the `sprite` rule, load `atlas()`, play a tag, flip and tint, hot-reload under `zinc dev`.
3. An image of a packed atlas page (what the build produces) next to the `sprites.atlas` table.
4. Document the rule options (`atlas`, scale, trimming, padding) with a table; they live in `docs/reports/zinc-next-assets.md` only.
5. A frame-anatomy diagram: `x y w h`, `ox oy`, `width height`, pivot.
6. Troubleshooting: `Unknown names throw`, blurry pixel art (`ImageFlag.Nearest`), missing frames without packs.
7. Pointer to `tilemap` and `pixelfont` as companions.
8. (hardware) a PS2/ESP32 run of an atlas.

## Wrong or stale
- Nothing contradicts `index.ts`. The page cites game-2d's draw-call counts (4 and 3) which should be re-checked against the current template.
- The page does not list the `ps2`/`esp32` targets of `plugin.json`.

## Suggested pages
- Sprites and atlases: overview
- A walking hero (tutorial)
- API reference (generated)
- Atlas rules in zinc.json
- Aseprite workflow and hot reload
- Pixel-art tips (nearest filtering, scaling)
- Examples
