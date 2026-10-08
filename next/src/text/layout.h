#pragma once
// The text-shaping tier (ZN-114, decision D11): HarfBuzz shapes, SheenBidi orders mixed-direction text, libunibreak finds the line breaks; stb_truetype
// rasterises glyph ids. One interface for desktop-class targets; tiny profiles do not link it (they keep the codepoint path of runtime/ttf.cpp).
#include <cstdint>
#include <memory>
#include <string_view>
#include <vector>

namespace zn::text {

// A font file (TrueType glyf outlines) opened for shaping and rasterising. The bytes stay owned by the caller and must outlive the Face.
class Face {
 public:
  static std::unique_ptr<Face> open(const uint8_t* data, size_t size);
  ~Face();
  int unitsPerEm() const;
  float ascent(float px) const;    // pixels above the baseline
  float descent(float px) const;   // pixels below the baseline (positive)
  bool hasGlyph(uint32_t cp) const;
  bool hasEmoji(uint32_t cp) const;   // a glyph for cp, or for cp followed by U+FE0F
  bool isColor() const;   // sbix, COLR or CBDT tables: colour glyphs
  struct Impl;
  Impl* impl() const { return impl_; }
 private:
  Face() = default;
  Impl* impl_ = nullptr;
};

struct Glyph {
  uint32_t gid = 0;
  uint32_t cluster = 0;      // byte offset in the text of the first character this glyph stands for
  float x = 0, y = 0;        // offset from the pen position, pixels (y down)
  float advance = 0;         // pixels
  int face = 0;              // index in the font list
};

// Glyphs of one piece of a line, all in one direction, one font; `glyphs` are in visual (left to right) order.
struct Run {
  int face = 0;
  bool rtl = false;
  float width = 0;
  std::vector<Glyph> glyphs;
};

struct Line {
  std::vector<Run> runs;     // visual order, left to right
  uint32_t begin = 0, end = 0;   // byte range of the text
  float width = 0;
};

enum class Direction { Auto, Ltr, Rtl };

struct Options {
  float size = 16;           // pixels per em
  Direction dir = Direction::Auto;   // base direction of the paragraph
  const char* lang = nullptr;        // "en", "ja", "zh"...: line-break tailoring and shaping language
  float maxWidth = 0;        // wrap at this width; 0 = one line
};

// Shapes `utf8` (hard breaks start new lines) with `faces` as the fallback chain: a character takes the first face that has its glyph.
std::vector<Line> layout(const std::vector<Face*>& faces, std::string_view utf8, const Options& o);

// Line-break opportunities: out[i] is true when a line may end after the byte i (the last byte of a character), mandatory breaks included.
std::vector<bool> breakOpportunities(std::string_view utf8, const char* lang);

// A glyph rasterised at `px` as 8-bit coverage; the origin is the pen position on the baseline. False for an empty glyph.
struct Bitmap { int w = 0, h = 0, left = 0, top = 0; std::vector<uint8_t> a; };   // top: pixels from the baseline up to the first row
bool rasterize(const Face& f, uint32_t gid, float px, Bitmap& out);

}  // namespace zn::text
