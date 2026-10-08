// The text-shaping tier (ZN-114): itemise by direction, script and font, shape with HarfBuzz, wrap at the break opportunities of UAX #14, reorder each line (UAX #9).
#include "text/layout.h"

#include <algorithm>
#include <cmath>
#include <cstring>

extern "C" {
#include "SheenBidi/SheenBidi.h"
#include "linebreak.h"
}
#include "hb.h"
#include "hb-ot.h"

#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#include "stb_truetype.h"

namespace zn::text {

struct Face::Impl {
  hb_blob_t* blob = nullptr;
  hb_face_t* face = nullptr;
  hb_font_t* font = nullptr;
  stbtt_fontinfo info{};
  int upem = 1000;
};

std::unique_ptr<Face> Face::open(const uint8_t* data, size_t size) {
  auto* i = new Impl;
  i->blob = hb_blob_create(reinterpret_cast<const char*>(data), static_cast<unsigned>(size), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
  i->face = hb_face_create(i->blob, 0);
  i->upem = static_cast<int>(hb_face_get_upem(i->face));
  i->font = hb_font_create(i->face);
  if (!stbtt_InitFont(&i->info, data, stbtt_GetFontOffsetForIndex(data, 0)) || hb_face_get_glyph_count(i->face) == 0) {
    hb_font_destroy(i->font); hb_face_destroy(i->face); hb_blob_destroy(i->blob); delete i;
    return nullptr;
  }
  std::unique_ptr<Face> f(new Face);
  f->impl_ = i;
  return f;
}
Face::~Face() {
  if (!impl_) return;
  hb_font_destroy(impl_->font); hb_face_destroy(impl_->face); hb_blob_destroy(impl_->blob);
  delete impl_;
}
int Face::unitsPerEm() const { return impl_->upem; }
float Face::ascent(float px) const { int a, d, g; stbtt_GetFontVMetrics(&impl_->info, &a, &d, &g); return a * stbtt_ScaleForMappingEmToPixels(&impl_->info, px); }
float Face::descent(float px) const { int a, d, g; stbtt_GetFontVMetrics(&impl_->info, &a, &d, &g); return -d * stbtt_ScaleForMappingEmToPixels(&impl_->info, px); }
bool Face::hasEmoji(uint32_t cp) const { hb_codepoint_t g; return hb_font_get_nominal_glyph(impl_->font, cp, &g) || hb_font_get_variation_glyph(impl_->font, cp, 0xFE0F, &g); }
bool Face::isColor() const {   // sbix, COLR or CBDT: the font draws its glyphs in colour
  for (hb_tag_t t : {HB_TAG('s', 'b', 'i', 'x'), HB_TAG('C', 'O', 'L', 'R'), HB_TAG('C', 'B', 'D', 'T')}) {
    hb_blob_t* b = hb_face_reference_table(impl_->face, t);
    bool has = hb_blob_get_length(b) > 0;
    hb_blob_destroy(b);
    if (has) return true;
  }
  return false;
}
bool Face::hasGlyph(uint32_t cp) const { hb_codepoint_t g; return hb_font_get_nominal_glyph(impl_->font, cp, &g); }

bool rasterize(const Face& f, uint32_t gid, float px, Bitmap& out) {
  stbtt_fontinfo* info = &f.impl()->info;
  float s = stbtt_ScaleForMappingEmToPixels(info, px);
  int w, h, xo, yo;
  unsigned char* b = stbtt_GetGlyphBitmap(info, s, s, static_cast<int>(gid), &w, &h, &xo, &yo);
  if (!b || w == 0 || h == 0) { if (b) stbtt_FreeBitmap(b, nullptr); return false; }
  out.w = w; out.h = h; out.left = xo; out.top = -yo;
  out.a.assign(b, b + static_cast<size_t>(w) * h);
  stbtt_FreeBitmap(b, nullptr);
  return true;
}

std::vector<bool> breakOpportunities(std::string_view s, const char* lang) {
  static bool init = false;
  if (!init) { init_linebreak(); init = true; }
  std::vector<char> b(s.size() + 1);
  if (!s.empty()) set_linebreaks_utf8(reinterpret_cast<const utf8_t*>(s.data()), s.size(), lang ? lang : "", b.data());
  std::vector<bool> out(s.size());
  for (size_t i = 0; i < s.size(); i++) out[i] = b[i] == LINEBREAK_ALLOWBREAK || b[i] == LINEBREAK_MUSTBREAK;
  return out;
}

namespace {

struct Cp { uint32_t cp; uint32_t off; };

std::vector<Cp> decode(std::string_view s) {
  std::vector<Cp> out;
  for (size_t i = 0; i < s.size();) {
    unsigned char c = static_cast<unsigned char>(s[i]);
    int n = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 1;
    uint32_t cp = n == 1 ? c : c & (0xff >> (n + 1));
    for (int k = 1; k < n && i + k < s.size(); k++) cp = (cp << 6) | (static_cast<unsigned char>(s[i + k]) & 0x3f);
    out.push_back({cp, static_cast<uint32_t>(i)});
    i += n;
  }
  return out;
}

struct Item {
  uint32_t begin, end;   // bytes of the paragraph
  int face, level;
  hb_script_t script;
  std::vector<Glyph> glyphs;   // as shaped (visual order within the item)
};

bool isMark(hb_unicode_funcs_t* u, uint32_t cp) {
  hb_unicode_general_category_t c = hb_unicode_general_category(u, cp);
  return c == HB_UNICODE_GENERAL_CATEGORY_NON_SPACING_MARK || c == HB_UNICODE_GENERAL_CATEGORY_ENCLOSING_MARK || c == HB_UNICODE_GENERAL_CATEGORY_SPACING_MARK;
}

void paragraph(const std::vector<Face*>& faces, std::string_view p, uint32_t base, const Options& o, std::vector<Line>& lines) {
  auto cps = decode(p);
  hb_unicode_funcs_t* uf = hb_unicode_funcs_get_default();
  // bidirectional levels per byte
  std::vector<uint8_t> levels(p.size(), 0);
  if (!p.empty()) {
    SBCodepointSequence seq{SBStringEncodingUTF8, const_cast<char*>(p.data()), p.size()};
    SBAlgorithmRef alg = SBAlgorithmCreate(&seq);
    SBLevel bl = o.dir == Direction::Ltr ? 0 : o.dir == Direction::Rtl ? 1 : SBLevelDefaultLTR;
    SBParagraphRef para = SBAlgorithmCreateParagraph(alg, 0, p.size(), bl);
    const SBLevel* lv = SBParagraphGetLevelsPtr(para);
    for (size_t i = 0; i < p.size(); i++) levels[i] = lv[i];
    SBParagraphRelease(para);
    SBAlgorithmRelease(alg);
  }
  // face and script of every character
  std::vector<int> face(cps.size());
  std::vector<hb_script_t> script(cps.size());
  hb_script_t last = HB_SCRIPT_INVALID;
  for (size_t i = 0; i < cps.size(); i++) {
    uint32_t cp = cps[i].cp;
    int f = -1;
    bool glue = cp == 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F) || (i > 0 && cps[i - 1].cp == 0x200D);
    hb_script_t sc = hb_unicode_script(uf, cp);
    bool common = sc == HB_SCRIPT_COMMON || sc == HB_SCRIPT_INHERITED;   // spaces and punctuation stay in the font of the text before them
    if (i + 1 < cps.size() && cps[i + 1].cp == 0xFE0F) for (size_t k = 0; f < 0 && k < faces.size(); k++) if (faces[k]->isColor() && faces[k]->hasEmoji(cp)) f = static_cast<int>(k);   // emoji presentation asks for a colour font
    if (f < 0 && i > 0 && (glue || ((common || isMark(uf, cp)) && levels[cps[i].off] == levels[cps[i - 1].off])) && faces[face[i - 1]]->hasGlyph(cp)) f = face[i - 1];
    else if (f < 0 && i > 0 && glue) f = face[i - 1];
    for (size_t k = 0; f < 0 && k < faces.size(); k++) if (faces[k]->hasGlyph(cp)) f = static_cast<int>(k);
    face[i] = f < 0 ? 0 : f;
    hb_script_t s = hb_unicode_script(uf, cp);
    if (s == HB_SCRIPT_COMMON || s == HB_SCRIPT_INHERITED || s == HB_SCRIPT_UNKNOWN) s = last;
    else last = s;
    script[i] = s;
  }
  for (size_t i = 0; i < cps.size() && script[i] == HB_SCRIPT_INVALID; i++) { for (size_t k = i; k < cps.size(); k++) if (script[k] != HB_SCRIPT_INVALID) { script[i] = script[k]; break; } }
  // items: same level, face and script
  std::vector<Item> items;
  for (size_t i = 0; i < cps.size(); i++) {
    uint32_t off = cps[i].off;
    int lvl = levels[off];
    if (!items.empty() && items.back().level == lvl && items.back().face == face[i] && (items.back().script == script[i] || script[i] == HB_SCRIPT_INVALID)) { items.back().end = off + 1; continue; }
    items.push_back({off, off + 1, face[i], lvl, script[i], {}});
  }
  for (size_t k = 0; k < items.size(); k++) items[k].end = k + 1 < items.size() ? items[k + 1].begin : static_cast<uint32_t>(p.size());
  hb_language_t lang = o.lang ? hb_language_from_string(o.lang, -1) : HB_LANGUAGE_INVALID;
  hb_buffer_t* buf = hb_buffer_create();
  for (Item& it : items) {
    Face::Impl* fi = faces[it.face]->impl();
    hb_buffer_clear_contents(buf);
    hb_buffer_add_utf8(buf, p.data(), static_cast<int>(p.size()), it.begin, static_cast<int>(it.end - it.begin));
    hb_buffer_set_direction(buf, it.level & 1 ? HB_DIRECTION_RTL : HB_DIRECTION_LTR);
    hb_buffer_set_script(buf, it.script);
    if (lang != HB_LANGUAGE_INVALID) hb_buffer_set_language(buf, lang);
    hb_shape(fi->font, buf, nullptr, 0);
    unsigned n;
    hb_glyph_info_t* gi = hb_buffer_get_glyph_infos(buf, &n);
    hb_glyph_position_t* gp = hb_buffer_get_glyph_positions(buf, &n);
    float s = o.size / static_cast<float>(fi->upem);
    for (unsigned k = 0; k < n; k++) {
      Glyph g;
      g.gid = gi[k].codepoint; g.cluster = gi[k].cluster; g.face = it.face;
      g.x = gp[k].x_offset * s; g.y = -gp[k].y_offset * s; g.advance = gp[k].x_advance * s;
      it.glyphs.push_back(g);
    }
  }
  hb_buffer_destroy(buf);
  // advance per byte position (the width of a cluster sits on its first byte) and the break opportunities
  std::vector<float> pre(p.size() + 1, 0);
  {
    std::vector<float> w(p.size() + 1, 0);
    for (const Item& it : items) for (const Glyph& g : it.glyphs) w[g.cluster] += g.advance;
    for (size_t i = 0; i < p.size(); i++) pre[i + 1] = pre[i] + w[i];
  }
  std::vector<bool> brk = breakOpportunities(p, o.lang);
  std::vector<std::pair<uint32_t, uint32_t>> ranges;   // line byte ranges
  uint32_t start = 0, cand = 0;
  auto trimmed = [&](uint32_t b, uint32_t e) { while (e > b && (p[e - 1] == ' ' || p[e - 1] == '\t')) e--; return pre[e] - pre[b]; };
  for (size_t i = 0; i < cps.size(); i++) {
    uint32_t endByte = i + 1 < cps.size() ? cps[i + 1].off : static_cast<uint32_t>(p.size());
    if (endByte == p.size() || !brk[endByte - 1]) continue;
    if (o.maxWidth > 0 && cand > start && trimmed(start, endByte) > o.maxWidth) { ranges.push_back({start, cand}); start = cand; }
    cand = endByte;
  }
  ranges.push_back({start, static_cast<uint32_t>(p.size())});
  // lines: slice the items, reorder the pieces (UAX #9 rule L2)
  for (auto [b, e] : ranges) {
    Line ln; ln.begin = base + b; ln.end = base + e;
    struct Piece { Run r; int level; };
    std::vector<Piece> pieces;
    for (const Item& it : items) {
      Piece pc; pc.level = it.level; pc.r.face = it.face; pc.r.rtl = it.level & 1;
      for (const Glyph& g : it.glyphs) if (g.cluster >= b && g.cluster < e) { pc.r.glyphs.push_back(g); pc.r.width += g.advance; }
      if (pc.r.glyphs.empty()) continue;
      if (!pieces.empty() && pieces.back().level == pc.level && pieces.back().r.face == pc.r.face) {   // a script change inside one direction and font is still one run
        for (const Glyph& g : pc.r.glyphs) pieces.back().r.glyphs.push_back(g);
        pieces.back().r.width += pc.r.width;
        continue;
      }
      pieces.push_back(std::move(pc));
    }
    int hi = 0, lo = 255;
    for (auto& pc : pieces) { hi = std::max(hi, pc.level); if (pc.level & 1) lo = std::min(lo, pc.level); }
    for (int l = hi; l >= lo && l > 0; l--) {
      for (size_t i = 0; i < pieces.size();) {
        if (pieces[i].level < l) { i++; continue; }
        size_t j = i; while (j < pieces.size() && pieces[j].level >= l) j++;
        std::reverse(pieces.begin() + i, pieces.begin() + j);
        i = j;
      }
    }
    for (auto& pc : pieces) { ln.width += pc.r.width; ln.runs.push_back(std::move(pc.r)); }
    lines.push_back(std::move(ln));
  }
}

}  // namespace

std::vector<Line> layout(const std::vector<Face*>& faces, std::string_view utf8, const Options& o) {
  std::vector<Line> lines;
  if (faces.empty()) return lines;
  size_t i = 0;
  while (true) {
    size_t nl = utf8.find('\n', i);
    size_t e = nl == std::string_view::npos ? utf8.size() : nl;
    paragraph(faces, utf8.substr(i, e - i), static_cast<uint32_t>(i), o, lines);
    if (nl == std::string_view::npos) break;
    i = nl + 1;
  }
  return lines;
}

}  // namespace zn::text
