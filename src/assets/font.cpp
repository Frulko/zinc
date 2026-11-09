// The font importer (ZN-442): see font.h. hb-subset trims the file (src/res subsetTtf), HarfBuzz draws each glyph's outline into msdfgen's
// shape, msdfgen computes its distance field, and the cells go on one atlas page, row by row.
#include "assets/font.h"

#include "assets/model.h"
#include "assets/sprite.h"
#include "res/res.h"
#include "zn/msdf.h"

#include "hb.h"

#include "msdfgen.h"
#include "yyjson.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <set>

namespace zn::assets {
namespace {

struct Named { const char* name; std::vector<std::pair<std::uint32_t, std::uint32_t>> ranges; };
const std::vector<Named>& namedSets() {
  static const std::vector<Named> s = {
      {"ascii", {{0x20, 0x7E}}},
      {"latin-1", {{0x20, 0x7E}, {0xA0, 0xFF}}},
      {"latin-ext", {{0x100, 0x24F}}},
      {"greek", {{0x370, 0x3FF}}},
      {"cyrillic", {{0x400, 0x4FF}}},
      {"punctuation", {{0x2010, 0x2027}, {0x2030, 0x203A}, {0x20AC, 0x20AC}, {0x2122, 0x2122}}},
  };
  return s;
}

void addUtf8(std::string_view s, std::set<std::uint32_t>& out) {
  for (std::size_t i = 0; i < s.size();) {
    const unsigned char c = static_cast<unsigned char>(s[i]);
    const int n = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 0;
    if (!n || i + n > s.size()) { ++i; continue; }   // not UTF-8 there: skipped
    std::uint32_t cp = n == 1 ? c : c & (0x7F >> n);
    for (int k = 1; k < n; ++k) cp = cp << 6 | (static_cast<unsigned char>(s[i + k]) & 0x3F);
    if (cp >= 0x20 && cp != 0x7F) out.insert(cp);
    i += n;
  }
}
void addJsonStrings(yyjson_val* v, std::set<std::uint32_t>& out) {
  if (yyjson_is_str(v)) addUtf8(std::string_view(yyjson_get_str(v), yyjson_get_len(v)), out);
  else if (yyjson_is_arr(v)) { size_t i, n; yyjson_val* x; yyjson_arr_foreach(v, i, n, x) addJsonStrings(x, out); }
  else if (yyjson_is_obj(v)) { size_t i, n; yyjson_val *k, *x; yyjson_obj_foreach(v, i, n, k, x) addJsonStrings(x, out); }   // the values: keys are names, not text
}

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
  zim = zimHeader(1 /* rgba8 */, 1, 0 /* straight */, W, H) + px;
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

}  // namespace

std::vector<std::string> charsetItems(const std::string& option) {
  std::vector<std::string> items;
  if (option.empty() || option[0] != '[') { if (!option.empty()) items.push_back(option); return items; }
  yyjson_doc* doc = yyjson_read(option.data(), option.size(), 0);
  yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
  size_t i, n; yyjson_val* v;
  if (yyjson_is_arr(root)) yyjson_arr_foreach(root, i, n, v) if (yyjson_is_str(v)) items.push_back(yyjson_get_str(v));
  yyjson_doc_free(doc);
  return items;
}
bool namedCharset(const std::string& item) {
  for (const Named& n : namedSets()) if (item == n.name) return true;
  return false;
}

bool importFont(const std::string& name, const std::string& in, const std::map<std::string, std::string>& side, const std::map<std::string, std::string>& opts,
                std::string& out, std::string& err) {
  auto opt = [&](const char* k, const char* d) { auto it = opts.find(k); return it == opts.end() ? std::string(d) : it->second; };
  const std::string sdf = opt("sdf", "none");
  if (sdf != "none" && sdf != "msdf") { err = "sdf \"" + sdf + "\" is not one the font importer makes: msdf, or none"; return false; }
  const std::string sizeText = opt("size", "32");
  char* end = nullptr;
  const long size = std::strtol(sizeText.c_str(), &end, 10);
  if (!end || *end || size < 16 || size > 128) { err = "size must be the pixels per em of the atlas, a whole number from 16 to 128, not " + sizeText; return false; }
  std::set<std::uint32_t> cps = {0x20};
  std::vector<std::string> items = charsetItems(opt("charset", ""));
  if (items.empty()) items.push_back("latin-1");
  for (const std::string& item : items)
    for (const Named& n : namedSets())
      if (item == n.name) for (const auto& [a, b] : n.ranges) for (std::uint32_t c = a; c <= b; ++c) cps.insert(c);
  for (const auto& [file, text] : side) {   // the files the charset's globs matched (assets.cpp)
    if (file.size() > 5 && file.compare(file.size() - 5, 5, ".json") == 0) {
      yyjson_doc* doc = yyjson_read(text.data(), text.size(), YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS);
      if (!doc) { err = "the charset file " + file + " is not JSON"; return false; }
      addJsonStrings(yyjson_doc_get_root(doc), cps);
      yyjson_doc_free(doc);
    } else addUtf8(text, cps);
  }
  const std::vector<std::uint8_t> src(in.begin(), in.end());
  std::vector<std::uint8_t> sub;
  if (!res::subsetTtf(src, cps, sub)) { err = "not a TrueType or OpenType font, or none of the charset's characters is in it"; return false; }
  std::vector<BundleEntry> entries;
  entries.push_back({name, 0, 0, 0, std::string(sub.begin(), sub.end())});
  if (sdf == "msdf") {
    std::string zim, table;
    if (!msdfAtlas(entries[0].data, cps, static_cast<int>(size), zim, table, err)) return false;
    entries.push_back({name + ".msdf", 1, 0, 0, std::move(zim)});
    entries.push_back({name + ".msdf.json", 0, 0, 0, std::move(table)});
  }
  out = bundleOf(entries);
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

}  // namespace zn::assets
