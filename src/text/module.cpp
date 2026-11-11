#include "text/module.h"
extern "C" __attribute__((visibility("default"))) const zn::text::Module* zn_text_open() {
  using namespace zn::text;
  static const Module api{1, sizeof(Module), Face::open, [](Face* f) { f->~Face(); }, &Face::unitsPerEm,
    &Face::ascent, &Face::descent, &Face::hasGlyph, &Face::hasEmoji, &Face::isColor,
    layout, breakOpportunities, rasterize, outline, font::subsetTtf, font::fontCharacters, font::msdfAtlas};
  return &api;
}
