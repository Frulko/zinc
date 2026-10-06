# Zinc Next: fonts and images baked by the engine

A program that draws needs glyph bitmaps and image pixels. The engine makes them itself, from the program, with no Node and no old tool.

## What is baked

From the texts of every file of the program (user code and standard modules) `src/res` decides:

- **sizes**: 16 px always, every Tailwind text size mentioned (`text-xs` to `text-6xl`), `text-[27px]`, `font-size: 19px`, `font('sans', 14)`, canvas font strings;
- **families**: `sans` (Inter Regular) and `sans-bold` (Inter Bold) always, `mono` (JetBrains Mono) when `font-mono` appears, and every TrueType file of the assets;
- **characters**: printable ASCII plus the characters of every string literal and JSX text, so `é`, `—` or `✓` in a literal are there;
- **grid fonts**: the six crisp monospace cells of the legacy `gfx.text` (8 to 64 px);
- **images**: every PNG and SVG of an `assets` directory beside the entry file or above it (`name@2x.png` files, SVG baked at the display scale up to 1024 px wide).

Glyphs use the original algorithm: parse the TrueType file, flatten the outlines, rasterize with 4x4 supersampling and nonzero winding. It is a port of
`compiler/src/resources.ts`, expression by expression (JavaScript's `Math.round` and sort stability included), because the frames of the old build are the
goldens: the result is bit-identical (`tests/t0/res.sh` compares every glyph and image of a fixture with what the old tool produced; `tests/golden/res/expected.json`).
This is why `stb_truetype` or `nanosvg` were not used for the rasterizers: they anti-alias differently. PNG decoding is lossless, so `stb_image` (vendored, `third_party/stb`) does it.

## Where it happens

`zinc run` bakes in memory before the program starts (a few milliseconds for the standard UI) and installs the tables in the runtime's rasterizer
(`src/host/resources.cpp`). `zinc build` bakes at build time and embeds the blob in the C++ of the program, which installs it when it starts.
The TrueType files are in the blob too, so the runtime can rasterize any other size (HiDPI windows). `zinc bake prog.ts -o blob.bin` writes the blob for inspection.

## Not covered

Fonts and images are fixed per program: an image or a size chosen at run time from data is not found by the scan. Plugin and board profiles with their own
asset rules, image formats other than PNG and SVG, font hinting, and ligatures or complex scripts (the rasterizer draws one glyph per code point).
