#include "text/module.h"
#include "assets/sprite.h"
#include "assets/font.h"
#include "zn/msdf.h"
#include "hb-subset.h"
#include "msdfgen.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
namespace zn::text::font {
// ---- one glyph's outline from HarfBuzz into an msdfgen shape (font units, y up)
struct Pen { msdfgen::Shape shape; msdfgen::Contour* contour = nullptr; };
msdfgen::Point2 at(float x, float y) { return msdfgen::Point2(x, y); }
void moveTo(hb_draw_funcs_t*, void* d, hb_draw_state_t*, float, float, void*) { Pen& p = *static_cast<Pen*>(d); p.contour = &p.shape.addContour(); }
void lineTo(hb_draw_funcs_t*, void* d, hb_draw_state_t* st, float x, float y, void*) {
  Pen& p = *static_cast<Pen*>(d);
  if (p.contour && (st->current_x != x || st->current_y != y)) p.contour->addEdge(msdfgen::EdgeHolder(at(st->current_x, st->current_y), at(x, y)));
}
void quadTo(hb_draw_funcs_t*, void* d, hb_draw_state_t* st, float cx, float cy, float x, float y, void*) {
  Pen& p = *static_cast<Pen*>(d);
  if (p.contour) p.contour->addEdge(msdfgen::EdgeHolder(at(st->current_x, st->current_y), at(cx, cy), at(x, y)));
}
void cubicTo(hb_draw_funcs_t*, void* d, hb_draw_state_t* st, float c1x, float c1y, float c2x, float c2y, float x, float y, void*) {
  Pen& p = *static_cast<Pen*>(d);
  if (p.contour) p.contour->addEdge(msdfgen::EdgeHolder(at(st->current_x, st->current_y), at(c1x, c1y), at(c2x, c2y), at(x, y)));
}
void closePath(hb_draw_funcs_t*, void* d, hb_draw_state_t*, void*) { static_cast<Pen*>(d)->contour = nullptr; }   // HarfBuzz closes it with a line first

hb_draw_funcs_t* drawFuncs() {
  static hb_draw_funcs_t* f = [] {
    hb_draw_funcs_t* g = hb_draw_funcs_create();
    hb_draw_funcs_set_move_to_func(g, moveTo, nullptr, nullptr);
    hb_draw_funcs_set_line_to_func(g, lineTo, nullptr, nullptr);
    hb_draw_funcs_set_quadratic_to_func(g, quadTo, nullptr, nullptr);
    hb_draw_funcs_set_cubic_to_func(g, cubicTo, nullptr, nullptr);
    hb_draw_funcs_set_close_path_func(g, closePath, nullptr, nullptr);
    hb_draw_funcs_make_immutable(g);
    return g;
  }();
  return f;
}

std::string num(double v) { char b[32]; std::snprintf(b, sizeof b, "%.3f", v); std::string s = b; while (s.back() == '0') s.pop_back(); if (s.back() == '.') s.pop_back(); return s == "-0" ? "0" : s; }

struct Cell { std::uint32_t cp; int w = 0, h = 0, x = 0, y = 0; double left = 0, top = 0, adv = 0; std::vector<std::uint8_t> rgb; };

/** The atlas of `cps` from the font `ttf`, `size` pixels per em: its ZIM1 page and its table. */
bool msdfAtlas(const std::string& ttf, const std::set<std::uint32_t>& cps, int size, std::string& zim, std::string& table, std::string& err) {
  hb_blob_t* blob = hb_blob_create(ttf.data(), static_cast<unsigned>(ttf.size()), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
  hb_face_t* face = hb_face_create(blob, 0);
  hb_font_t* font = hb_font_create(face);
  const unsigned upem = hb_face_get_upem(face);
  hb_font_set_scale(font, static_cast<int>(upem), static_cast<int>(upem));
  const double s = static_cast<double>(size) / upem, pad = kMsdfRange / 2.0 + 1;   // the field reaches half the range out of the outline, and a texel for the blend
  std::vector<Cell> cells;
  for (std::uint32_t cp : cps) {
    hb_codepoint_t gid = 0;
    if (!hb_font_get_nominal_glyph(font, cp, &gid)) continue;
    Cell c;
    c.cp = cp;
    c.adv = hb_font_get_glyph_h_advance(font, gid) * s;
    Pen pen;
    hb_font_draw_glyph(font, gid, drawFuncs(), &pen);
    pen.shape.normalize();
    if (!pen.shape.contours.empty() && pen.shape.validate()) {
      const msdfgen::Shape::Bounds b = pen.shape.getBounds();
      const int l = static_cast<int>(std::floor(b.l * s - pad)), bt = static_cast<int>(std::floor(b.b * s - pad));
      const int r = static_cast<int>(std::ceil(b.r * s + pad)), t = static_cast<int>(std::ceil(b.t * s + pad));
      c.w = r - l; c.h = t - bt; c.left = l; c.top = t;
      msdfgen::edgeColoringSimple(pen.shape, 3.0, cp);   // seeded by the character: the same atlas on every build
      msdfgen::Bitmap<float, 3> field(c.w, c.h);
      msdfgen::generateMSDF(field, pen.shape, msdfgen::Projection(msdfgen::Vector2(s), msdfgen::Vector2(-l / s, -bt / s)), msdfgen::Range(kMsdfRange / s));
      c.rgb.resize(static_cast<std::size_t>(c.w) * c.h * 3);
      for (int y = 0; y < c.h; ++y)   // msdfgen's rows go up from the baseline, the atlas's down
        for (int x = 0; x < c.w; ++x)
          for (int k = 0; k < 3; ++k) c.rgb[(static_cast<std::size_t>(c.h - 1 - y) * c.w + x) * 3 + k] = msdfgen::pixelFloatToByte(field(x, y)[k]);
    }
    cells.push_back(std::move(c));
  }
  hb_font_extents_t ext{};
  hb_font_get_h_extents(font, &ext);
  hb_font_destroy(font);
  hb_face_destroy(face);
  hb_blob_destroy(blob);
  if (cells.empty()) { err = "the font has none of the charset's characters"; return false; }
  // rows of cells, the tallest first, one texel apart: a page of a power-of-two width about as wide as it is high
  std::size_t area = 0;
  for (const Cell& c : cells) area += static_cast<std::size_t>(c.w + 1) * (c.h + 1);
  int W = 64;
  while (static_cast<std::size_t>(W) * W < area) W *= 2;
  std::vector<Cell*> order;
  for (Cell& c : cells) if (c.w) order.push_back(&c);
  std::stable_sort(order.begin(), order.end(), [](const Cell* a, const Cell* b) { return a->h > b->h; });
  int x = 0, y = 0, rowH = 0;
  for (Cell* c : order) {
    if (c->w > W) { err = "a glyph is wider than the atlas"; return false; }
    if (x + c->w > W) { x = 0; y += rowH + 1; rowH = 0; }
    c->x = x; c->y = y;
    x += c->w + 1;
    rowH = std::max(rowH, c->h);
  }
  const int H = std::max(1, y + rowH);
  if (H > 8192) { err = "the atlas would be " + std::to_string(W) + " x " + std::to_string(H) + ": a smaller size or charset"; return false; }
  std::string px(static_cast<std::size_t>(W) * H * 4, '\0');
  for (std::size_t i = 3; i < px.size(); i += 4) px[i] = static_cast<char>(255);   // opaque: the distances are the colour, the alpha unused
  for (const Cell* c : order)
    for (int r = 0; r < c->h; ++r)
      for (int q = 0; q < c->w; ++q)
        for (int k = 0; k < 3; ++k) px[(static_cast<std::size_t>(c->y + r) * W + c->x + q) * 4 + k] = static_cast<char>(c->rgb[(static_cast<std::size_t>(r) * c->w + q) * 3 + k]);
  zim = assets::zimHeader(1 /* rgba8 */, 1, 0 /* straight */, W, H) + px;
  table = "{\"size\": " + std::to_string(size) + ", \"range\": " + num(kMsdfRange) + ", \"ascent\": " + num(ext.ascender * s) + ", \"descent\": " + num(-ext.descender * s) +
          ", \"lineGap\": " + num(ext.line_gap * s) + ", \"width\": " + std::to_string(W) + ", \"height\": " + std::to_string(H) + ", \"glyphs\": [";
  for (std::size_t i = 0; i < cells.size(); ++i) {
    const Cell& c = cells[i];
    table += std::string(i ? ", " : "") + "[" + std::to_string(c.cp) + ", " + std::to_string(c.x) + ", " + std::to_string(c.y) + ", " + std::to_string(c.w) + ", " +
             std::to_string(c.h) + ", " + num(c.left) + ", " + num(c.top) + ", " + num(c.adv) + "]";
  }
  table += "]}\n";
  return true;
}

std::size_t fontCharacters(const std::string& ttf) {
  hb_blob_t* blob = hb_blob_create(ttf.data(), static_cast<unsigned>(ttf.size()), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
  hb_face_t* face = hb_face_create(blob, 0);
  hb_set_t* set = hb_set_create();
  hb_face_collect_unicodes(face, set);
  const std::size_t n = hb_set_get_population(set);
  hb_set_destroy(set);
  hb_face_destroy(face);
  hb_blob_destroy(blob);
  return n;
}

bool subsetTtf(const std::vector<std::uint8_t>& in, const std::set<std::uint32_t>& cps, std::vector<std::uint8_t>& out) {
  hb_blob_t* blob = hb_blob_create(reinterpret_cast<const char*>(in.data()), static_cast<unsigned>(in.size()), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
  hb_face_t* face = hb_face_create(blob, 0);
  hb_subset_input_t* input = hb_subset_input_create_or_fail();
  bool ok = false;
  if (input) {
    hb_set_t* u = hb_subset_input_unicode_set(input);
    for (std::uint32_t cp : cps) hb_set_add(u, cp);
    hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_NO_HINTING);
    hb_set_t* drop = hb_subset_input_set(input, HB_SUBSET_SETS_DROP_TABLE_TAG);
    for (const char* t : {"GPOS", "GDEF", "kern", "DSIG", "STAT", "fvar", "gvar", "HVAR", "avar"}) hb_set_add(drop, HB_TAG(t[0], t[1], t[2], t[3]));
    hb_set_t* features = hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
    hb_set_clear(features);
    hb_set_add(features, HB_TAG('t', 'n', 'u', 'm'));
    if (hb_face_t* sub = hb_subset_or_fail(face, input)) {
      hb_blob_t* b = hb_face_reference_blob(sub);
      unsigned n = 0;
      const char* d = hb_blob_get_data(b, &n);
      if (d && n) { out.assign(reinterpret_cast<const std::uint8_t*>(d), reinterpret_cast<const std::uint8_t*>(d) + n); ok = true; }
      hb_blob_destroy(b);
      hb_face_destroy(sub);
    }
    hb_subset_input_destroy(input);
  }
  hb_face_destroy(face);
  hb_blob_destroy(blob);
  return ok;
}

}
