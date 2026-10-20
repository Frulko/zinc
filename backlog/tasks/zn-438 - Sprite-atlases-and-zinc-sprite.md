---
id: ZN-438
title: 'Sprite atlases and zinc:sprite'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 13:17'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-432
  - ZN-434
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor stb_rect_pack and stb_image_resize2. Sprite importer: trim, extrude, padding, pages per max size, POT, .aseprite through cute_aseprite, TexturePacker JSON-hash input. Pure-Zinc zinc:sprite plugin for frames, animations and pivots. Report: docs/reports/games/toolchain-assets-loading.md (4.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 game-2d draws from one atlas page
- [x] #2 frames at 1x are pixel-identical to the loose images
- [x] #3 display-gl draw calls of the play scene before and after are in the task notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (agent worktree, branch worktree-agent-ac0e4125f2c9367ed).

What landed:
- `src/assets/sprite.{h,cpp}`: the importer `"as": "sprite"` (PNG/JPEG/WebP/SVG one frame named by its path without @Nx; .aseprite through cute_aseprite 1.04: frames, durations, the whole-file animation and one per tag; TexturePacker JSON hash/array and Aseprite `--data` sheets: frames cut out of meta.image, rotated ones turned back, untrimmed size restored, pivots, durations, frameTags and `animations`; numbered loose files make an animation at `fps`). Trim keeps one transparent texel; extrude in points (default 1, times the frame's scale), padding in texels (1), pages up to `maxSize` (2048), `pot`; stb_rect_pack 1.01 with a stable sort. Entries `<atlas>.atlas` (text table) and `<atlas>.atlas.<n>` (ZIM1 rgba8, straight alpha). Docs: docs/reports/zinc-next-assets.md "Sprites and atlases", docs/plugins/sprite.md.
- `plugins/sprite` (zinc:sprite, pure Zinc): `atlas(name)`, `Atlas.frame/has/animation`, `Frame.draw(x, y, w, h, alpha, flags, rotation, tint, blend)` (trim offsets, flips, rotation around the pivot), `Animation.frameAt(ms, loop)` (forward, reverse, pingpong). Without packs a frame is the loose image (the wasm export, boards).
- Runtime: zinc:gfx `image(name)` falls back to an image entry of the mounted packs (`zn_asset_image`, sys_host.cpp; `assets::read` takes a kind). `zinc run` builds packs and `zinc pack` carries them when zinc.json has rules, not only groups (`Assets::packed()`).
- GL replay: a boxed one-texel-a-pixel copy keeps the texture's filter instead of forcing nearest (both filters give the texel at texel centres), so frames of one page drawn 1:1 and scaled stay in one batch.
- game-2d: zinc.json rule `{ "match": "*.svg", "as": "sprite", "atlas": "sprites" }`, scenes.ts draws `sprites.frame('player.svg').draw(...)`; README row.

Acceptance:
- #1 game-2d draws from one atlas page: `atlas('sprites')` has 1 page, 97x50 texels (player 50x46 trimmed from 64x64 at 7,11; coin 38x38 from 40x40), in both `zinc run` and a `zinc build` executable (reads build/assets/macos).
- #2 frames at 1x pixel-identical: game-2d frame hashes before (loose images) and after (atlas), same binary, ZINC_INPUT Start then moving: title frame 8 d9172d35c1f857c6 (the templates golden, unchanged), play frame 12 b62d8099f490f6c6 and 40 d4067cddf071514e at ZINC_SCALE=1, 7b0e2a63406fa655 and 95a170a0a1997c1d at ZINC_SCALE=2: identical (coins at fractional positions, 2x SVG art downscaled). tests/t1/sprite_atlas.sh: every frame at its size, whole and fractional positions, scales 1 and 2, exact; scaled by 1.5 within 2 a channel (the sample ratio is a float of the texture's size, a page's or the image's: rounding, the atlas texels are the same); sheet and Aseprite frames equal their source texels.
- #3 display-gl draw calls, game-2d play scene (ZINC_RENDERER=gl, display-gl window 640x400, ZINC_DETERMINISTIC, 120 frames, 106 replayed, Start at frame 2, ZINC_GL_STATS; load 2.7): before 4.0 draw calls and 17 quads a frame, after 3.0 and 17. Batches of a play frame before: background (1 quad), HUD bar and text (9), coins (5, coin texture), player (1, player texture); after: background, HUD and text, sprites (6, one page). Without the GL replay change the atlas alone gave 4.0 too (the 1:1 player switched the page to nearest between the coins and it). CPU to submit 502 / 496 us, GPU 116 / 116 us a frame (noise).

Measured: `zinc assets build` of game-2d (two SVGs, a WAV, the atlas) 5 ms first, 1 ms second (load 2.7 to 3.0).

Decisions (no number; for the coordinator's record):
- Atlases are assembled when their pack is written, from per-file cached frame artifacts (not a cached atlas): a changed frame re-imports one file, an unchanged project reads nothing; packing and composing take milliseconds. Artifacts name frames relative to their file (a key covers bytes, not paths: the same SVG under two names is one artifact; found by tests/t0/assets.sh's symlink case).
- Pages are straight alpha (ZIM1 flags 0), against the report's 4.2 "premultiply": the rasterizer samples straight texels, and premultiplied rgba8 loses the colour of translucent texels, so frames would not be the loose images. Revisit with ZN-439 when GPU formats come.
- The frame table is text read by pure Zinc (split, parseFloat): tiny, readable; binary when tables reach thousands of frames.
- Trim keeps one transparent texel and extrusion counts points (x scale): with linear filtering at fractional positions a frame paints exactly the pixels of the whole image (docs/reports/zinc-next-assets.md).
- `image(name)` resolves pack image entries rather than a new API; zinc:sprite falls back to loose images without packs, so game-2d still runs in the browser export (image_rect_wasm passes).
- stb_image_resize2 not vendored: nothing in the atlas resamples (a frame keeps its texels; one larger than a page is an error); it belongs to ZN-439's mipmaps.

Tests: sprite_atlas (new, T1) PASS; assets (T0, unit checks of pages, straight alpha, extrusion, three errors) PASS; zapp PASS (expected content now has packs/default.zpk); templates_kickstart, fuse, assets_groups, aot_assets, project_assets, guide_store, image_rect_wasm, image_rect, image_rect_gl, gl_renderer PASS; proto-capture compare --canary 4 of 4.

Lines for later.md:
- zinc export (native targets) carries build/assets/<target> into dist, so exported games draw from their atlases (today zinc:sprite falls back to the loose images there).
- The res baker skips images a sprite rule takes when the program runs from packs (game-2d's SVGs are in resources.bin and in the atlas).
- Atlas page format, maxSize and pot from the target's asset profile (rgb565/rgba4444, ZN-439 encoders), not only rule options.
- zinc:assets v2 image handles: pack images freed with their group (today an image() of a pack entry lives for the program).
- Browser export with the atlas (ZN-449 group packs); TexturePacker rotated frames checked on a sheet TexturePacker itself wrote (the test sheet follows its documentation: clockwise).
<!-- SECTION:NOTES:END -->
