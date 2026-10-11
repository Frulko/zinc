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

## Images at run time and sprites (ZN-432)

`imageFromBytes(bytes)` decodes a PNG or a JPEG file while the program runs. The decoder is a second, static copy of `stb_image` in `src/res/codec.cpp`
(`zn_codec`), the library a program built with `zinc build` links; the baker's copy stays in the CLI. A file that declares more than 2^24 pixels is refused before
anything is allocated. The pixels become a runtime image (`raster::dyn_create`) that carries straight alpha in the top byte of each pixel when one of them is
not opaque (`raster::dyn_set_alpha`); an image used as a render target is opaque again.

`drawImageRect` records one IMAGE command, as `drawImage` does. The command keeps the rectangle painted and, in the four fields an IMAGE did not use (`s`, `c1`,
`off`, `n`: `raster::image_box`), the box the whole image would cover: the source rectangle is what of that box lies over the painted rectangle, and a negative
size mirrors the image. So a command stays 48 bytes and a frame takes as many sprites as commands. The rasterizer (`draw_boxed` in `runtime/raster.cpp`) samples
as a GPU would: linear sampling reads the texels around the source rectangle, nearest takes the texel under the pixel centre, nothing is painted outside the
image. `zinc:canvas`'s 9-argument `drawImage` is on the row; its frame is the one the earlier clip around the whole image gave (`tests/t1/image_rect.sh`).
The GL replay (`draw_image` in `runtime/gl_replay.cpp`) takes its texture coordinates from the same box and its filter from the same rule, and reads the alpha
of a decoded image: on the test's frame it is within 2 levels a channel of the software frame at the same density (`tests/t1/image_rect_gl.sh`).

Under `setTransform` (ZN-263.01) the command becomes an XFORM like any box, and the image's box travels with it: `s`, `off` and `n` in the XFORM's payload,
`c1` and the pad bit in the command, so `draw_xform` reads it from the command it rebuilds (`image_box`). The raster takes each pixel back through the matrix,
samples through the box, smooths the edges of the rectangle and of the image, and keeps the half pixel of an edge on the rectangle's own texels; the GL replay
draws the exact rectangle as a quad through the matrix, linear unless the sprite asks for nearest. `tests/data/image_rect/xform.ts` is the case: sprites
turned, stretched and mirrored, every pixel inside a texel computed back from the sheet, in software and on the GPU.

Sprites (ZN-581): `drawImageRect` takes a rotation, a tint and a blend mode after its flags (the row `host.gfxDrawImageRect` grew to 14 parameters, so the
host calls of the interpreter and QuickJS decode up to `kMaxHostParams` = 16, checked at compile time). A rotation is the matrix in force times a turn around
the centre of the destination rectangle: the command becomes an XFORM, 15 floats of the point pool. The tint and the blend mode live in the command:
pad bit `kImageTint` says `r` holds the tint as a float (24 bits, exact; such an image has no radius), pad bits 4-5 the mode (`image_tint`, `image_blend`
in `zrt_raster.h`). The raster multiplies each channel, `(c t + 127) / 255`, and blends with `blend_as` (normal, add, multiply, screen), the formulas the
GL replay's blend functions give on the premultiplied colour its shader writes (`GL_ONE, GL_ONE`; `GL_DST_COLOR, GL_ONE_MINUS_SRC_ALPHA`;
`GL_ONE, GL_ONE_MINUS_SRC_COLOR`); the shader multiplies the texel by the tint in the vertex colour, and a change of mode ends a batch.
`tests/data/image_rect/sprite.ts` is the case (`sprite_check.py` computes the tinted and blended sprites from the sheet: exact in software, within 2 on the
GPU). The replay skips the CPU culling of a frame without an opaque square rectangle (sprites over a clear: 1 ms a frame at 20,000 sprites) and keeps the
resolved texture of the last image, so consecutive sprites skip its lookups. Its shaders live in `runtime/gl_replay_shaders.h`, which
`tests/t1/gl_replay_es2.sh` compiles and links as GLSL ES 1.00 under display-gl's GLES 2 prelude with glslang (the Pi 3 floor of D29, without a device).

## Not covered

Fonts and images are fixed per program: an image or a size chosen at run time from data is not found by the scan (`imageFromBytes` decodes one). Plugin and board profiles with their own
asset rules, image formats other than PNG and SVG, font hinting, and ligatures or complex scripts (the rasterizer draws one glyph per code point).
