---
id: ZN-442
title: 'Font importer: subsets, charsets, MSDF option'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-11-09 07:32'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-428
  - ZN-434
ordinal: 13600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Font subsets as an importer, with charset declarations (named sets, files of strings). MSDF atlas option through msdf-atlas-gen, with its shader in display-gl and WebGL. Report: docs/reports/games/toolchain-assets-loading.md (4.4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 text from an i18n JSON file is baked
- [x] #2 a label scaled 8x stays sharp (pixel test against a reference)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09.
What: the `font` importer (src/assets/font.{h,cpp}, a bundle like model): `charset` = named sets (ascii, latin-1 default, latin-ext, greek, cyrillic, punctuation) and globs of assets files (JSON: string values; other files: text), read as side files (part of the key; a glob matching nothing fails the build naming it); hb-subset (res::subsetTtf, now declared in res.h) keeps the name so loadFont reads it; report.json: format ttf|msdf, gpuBytes of the atlas, `glyphs` (characters kept). `"sdf": "msdf"`: msdfgen 1.13 core vendored (third_party/msdfgen, MIT, no FreeType: hb_font_draw_glyph feeds msdfgen::Shape), `size` px/em (32), range kMsdfRange = 4 atlas px (include/zn/msdf.h with msdfCoverage), shelf-packed page `<font>.msdf` (ZIM rgba8 straight) and `<font>.msdf.json`. Runtime: ImageFlag.Msdf = 16 (IMAGE grad 3) in runtime/raster.cpp (draw_boxed, draw_xform interior and edges) and the GL replay (shader: median, range in c2 sixteenths; no fwidth so GLES2 without OES_standard_derivatives works; LEAN_IMAGE skipped for grad 3); `zinc:gfx/msdf` (lib/std/msdf.ts) MsdfFont.load/draw/width/lineHeight.
Proof: tests/t0/font_assets.sh PASS (0.7 s): report glyphs 107 (ASCII + 12 from tests/data/font_assets/assets/i18n/text.json), run prints "Ł true П true ж false", a 12 px label drawn at 96 px directly and through setTransform(8) vs Inter rasterized at 96 px: SSIM 0.9962 (blurred upscale control: 0.83), 551 edge pixels vs 508 for the reference (blurred: 5462); a charset glob matching nothing fails naming it. Same framehash 44b91bf80b1d39d3 on AOT, --interp and QuickJS. One windowed GL run (ZINC_RENDERER=gl, density 4): GL vs software 0.000% over 24, mae 0.013, max 8, 1 draw call for the label. T0 assets PASS.
Numbers: Inter ASCII + 12 chars: atlas 512 x 164 (335,872 GPU bytes), import 88 ms, cached rebuild 0.6 ms; subset TTF + atlas + table 351,450 B.
Web search (sonnet): hb-subset API and flags (https://harfbuzz.github.io/harfbuzz-hb-subset.html); msdfgen/msdf-atlas-gen MIT, core has no deps, Shape from any outline source (https://github.com/Chlumsky/msdfgen); msdf-atlas-gen default pxrange 2, examples 4; screenPxRange >= 2 or 1 minimum (README); Godot MSDF 48 px / range 16, warns on overlapping contours (generateMSDF's overlap support is on); fwidth needs OES_standard_derivatives on WebGL1, so the range is computed on the CPU (Red Blob: https://www.redblobgames.com/articles/sdf-fonts/).
Proposed decision (coordinator numbers it): MSDF text is core, not a plugin: a plugin cannot add a sampling mode to the raster and the GL replay. msdfgen 1.13 core vendored (build side only), outlines from HarfBuzz (no FreeType), fixed range 4 atlas px (include/zn/msdf.h), ImageFlag.Msdf = IMAGE grad 3 on the CPU and GL, the screen range on the CPU (no derivatives: GLES2 floor), the colour is the tint; zinc:gfx/msdf draws a glyph per drawImageRect. The baker still embeds assets TTFs as before (a font rule's subset is the pack's).
later.md lines (coordinator):
- ZN-442: the browser host (canvas 2D) and the console cores draw ImageFlag.Msdf as a plain image (the distances as colours): a median-to-alpha path there so zinc:gfx/msdf works on the web and consoles.
- ZN-442: with a font rule the baker still embeds the TTF in the program beside the pack's subset (twice the bytes): leave it to the pack (res::Options.leave) once loadFont and font-[Name] read pack entries (zn_asset_font reads only the assets directory).
- ZN-442: kerning (GPOS pairs into .msdf.json), MTSDF for outlines and shadows, MSDF text for zinc:3d labels and zoomable maps.
Proposed tests: tests/run --only font_assets (T0, 1 s, 100 MB); a T1 GL compare of tests/data/font_assets in modes msdf and turned with ZINC_RENDERER=gl vs software through tools/glcompare (10 s, a window); tests/t1/gl_replay_es2.sh (the image shader as GLSL ES 1.00, 20 s).
<!-- SECTION:NOTES:END -->
