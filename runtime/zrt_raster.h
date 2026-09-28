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

enum Kind : uint8_t { CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP };

struct Cmd {
  uint8_t kind, alpha, grad;   // grad: 0 none, 1 vertical (c1 top -> c2 bottom), 2 horizontal
  uint8_t pad;
  int32_t res;                 // font or image index
  float x, y, w, h;            // LINE: x,y -> w,h ; POLY: bbox
  float r, s;                  // radius; border width / shadow blur / line width / tracking
  uint32_t c1, c2;             // 0xRRGGBB
  uint32_t off, n;             // payload (text bytes or points) in the frame pools
};

struct Rect { int32_t x0, y0, x1, y1; };

/** Returns the index of the font `name` whose pixel size is closest to `px`. */
int32_t find_font(const char* name, uint32_t name_len, int32_t px);
int32_t find_image(const char* name, uint32_t name_len);
/** Advance of UTF-8 text in 26.6 fixed point, tracking in px added between glyphs. */
int32_t text_advance(int32_t font, const char* s, uint32_t n, float tracking);

struct Frame {
  const Cmd* cmds; uint32_t count;
  const char* text; const float* pts;
};
/** Rasterizes `f` into rows [y0, y1) of a `w`-wide buffer (0x00RRGGBB), limited to `damage`. */
void render(const Frame& f, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage);
/** Damage between two frames (empty rect when identical). */
Rect diff(const Frame& a, const Frame& b, int32_t w, int32_t h);

}}  // namespace zrt::raster
