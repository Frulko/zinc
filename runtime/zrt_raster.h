// zrt raster: software renderer shared by every target (UI-09, UI-15, UI-16).
// The frame is a list of commands; each frame is diffed against the previous one and only the damaged
// rectangle is re-rasterized, band by band (HALs choose the band height: full frame on hosts, 16 lines on SPI panels).
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace zrt { namespace raster {

struct Glyph { uint32_t cp; int16_t x0, y0; uint16_t w, h; int32_t adv; uint32_t off; };
struct Font { const char* name; int32_t px, ascent, descent, lineGap, count; const Glyph* glyphs; const uint8_t* bitmap; };
struct Image { const char* name; int32_t w, h; const uint8_t* rgba; };
extern const Font fonts[];
extern const int font_count;
extern const Image images[];
extern const int image_count;

// Runtime images (video frames, camera preview, cached map tiles, render-to-image): opaque 0x00RRGGBB pixels.
// Ids start at DYN_BASE so they never collide with baked images. Buffers are read on the main thread during
// hal_present: a producer thread must hand over a finished buffer with dyn_update, never write the shown one.
static const int32_t DYN_BASE = 1 << 20;
int32_t dyn_create(int32_t w, int32_t h);                                      // runtime-owned buffer
int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t stride);    // caller-owned buffer
void dyn_update(int32_t id, const uint32_t* px, int32_t stride);                // new pixels (null: same buffer), marks damage
uint32_t* dyn_pixels(int32_t id);
void dyn_resize(int32_t id, int32_t w, int32_t h);                             // runtime-owned buffers only
void dyn_destroy(int32_t id);
bool image_size(int32_t id, int32_t* w, int32_t* h);
uint32_t image_version(int32_t id);
/** Current pixels of a runtime image (GPU compositors upload them when the version changes). */
bool dyn_view(int32_t id, const uint32_t** px, int32_t* w, int32_t* h, int32_t* stride);

enum Kind : uint8_t { CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP };

struct Cmd {
  uint8_t kind, alpha, grad;   // grad: 0 none, 1 vertical (c1 top -> c2 bottom), 2 horizontal, 3 radial; IMAGE: 1 = nearest filter
  uint8_t pad;                 // POLY: bit 0 = even-odd fill rule (default nonzero)
  int32_t res;                 // font or image index
  float x, y, w, h;            // LINE: x,y -> w,h ; POLY: bbox
  float r, s;                  // radius; border width / shadow blur / line width / tracking
  uint32_t c1, c2;             // 0xRRGGBB; IMAGE: c2 = image version (frame diff sees new video frames)
  uint32_t off, n;             // payload (text bytes or points) in the frame pools
};

struct Rect { int32_t x0, y0, x1, y1; };

/** Returns the index of the font `name` whose pixel size is closest to `px`. */
int32_t find_font(const char* name, uint32_t name_len, int32_t px);
int32_t find_image(const char* name, uint32_t name_len);
/** Advance of UTF-8 text in 26.6 fixed point, tracking in px added between glyphs. */
int32_t text_advance(int32_t font, const char* s, uint32_t n, float tracking);

/** Stroke outline as nonzero contours into `out` ([count, x, y, ...]*). Returns contours | (floats used << 16). */
uint32_t stroke_contours(const float* pts, uint32_t n, float width, bool closed, float* out, uint32_t cap);

struct Frame {
  const Cmd* cmds; uint32_t count;
  const char* text; const float* pts;
};
/** Rasterizes `f` into rows [y0, y1) of a `w`-wide buffer (0x00RRGGBB), limited to `damage`. */
void render(const Frame& f, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage);
/** Damage between two frames (empty rect when identical). */
Rect diff(const Frame& a, const Frame& b, int32_t w, int32_t h);

}  // namespace raster

namespace gfx {
/** For C++ plugins: appends a raw command to the current frame, copying `len` floats of payload into the point pool
 *  (POLY: [count, x, y, ...]*, contour count is filled in). The caller sets the box, colors and flags. Null when full. */
raster::Cmd* emit(uint8_t kind, const float* pts, uint32_t len);
}
}  // namespace zrt
