// The fixed-function replay of zinc:gfx command lists (ZN-467), shared by the console GPUs without fragment programs (the PSP's GE, the 3DS's
// PICA200): a frame's commands become textured or coloured quads, cut to the clips on the CPU (exact for the axis-aligned clips of zinc:gfx).
// The backend uploads textures and draws quads; it is one file per console (targets/psp/gu_psp.cpp, targets/n3ds/c3d_n3ds.cpp) that defines
// the functions below. What the replay draws: CLEAR, RECTs of one colour, IMAGEs (atlas boxes, flips, tint, alpha, nearest or linear), TEXT of
// the glyph tables, rectangular CLIPs, and the single-colour shapes the software raster would draw (rounded RECTs, BORDERs, SHADOWs, filled
// POLYs), vertical and horizontal gradients included: the raster draws each once into a coverage bitmap, kept in the shape atlas and drawn as
// coverage times the colour (a gradient: the quads' corner colours). A frame with anything else (radial gradients and paints, rounded clips,
// turned matrices, lines, images with a radius or a blend mode) is not drawable: the HAL rasterizes
// it in software and shows it as one texture.
#pragma once
#include <stdint.h>

#include "hal.h"

namespace zn::ff {
constexpr int32_t kAtlasW = 512, kAtlasH = 512;   // the coverage atlases (0 glyphs, 1 shapes): one byte a texel, rows of kAtlasW

// The backend's part. A texture is the backend's own handle; u, v run 0..1 over the image (or the atlas).
const void* texture(int32_t image, int32_t* w, int32_t* h);   // the image as a texture, uploaded again when its version changed; null: cannot
const void* atlas(int i);                                       // a coverage atlas's texture, drawn as coverage times the quad's colour
uint8_t* atlas_memory(int i);                                   // its bytes
void atlas_written(int i, int32_t x, int32_t y, int32_t w, int32_t h);   // texels were written there (cache writeback, retiling)
bool quads_pending();   // quads of the frame are queued: the shape atlas cannot be emptied under them
void draw_quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a);
// The same with a colour per corner (x0 y0, x1 y0, x0 y1, x1 y1), blended across the quad: the linear gradients.
void draw_quad4(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, const uint32_t rgb[4], float a);

// The replay's part.
bool drawable(const HalCmdList* const* lists, int32_t n);       // every command is one the replay draws (images are uploaded on the way)
// One list on a w x h surface, shown at screen x = ox + k x, y = oy + k y.
void replay(const HalCmdList* l, int32_t w, int32_t h, float k, float ox, float oy);
// The whole surface as one quad of `tex` (the software frame).
void full(const void* tex, int32_t w, int32_t h, float k, float ox, float oy);
}  // namespace zn::ff
