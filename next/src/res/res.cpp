// Port of compiler/src/resources.ts (TrueType parser, 4x4 supersampling rasterizer, font baking, PNG and SVG images, program scan).
// The arithmetic follows the original expression by expression (doubles, JavaScript's Math.round and sort stability) so the bitmaps are identical.
#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_PSD
#define STBI_NO_TGA
#define STBI_NO_HDR
#define STBI_NO_PIC
#define STBI_NO_PNM
#define STBI_NO_STDIO
#include "hb-subset.h"
#include "res/res.h"
#include "res/codec.h"
#include "rt/unicode.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <filesystem>
#include <map>
#include <regex>
#include <set>
#include <sstream>

#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-function"
#elif defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wmaybe-uninitialized"
#endif
#include "stb_image.h"
#include "webp/decode.h"
#include "webp/encode.h"
#include "res/codec.h"
#if defined(__clang__)
#pragma clang diagnostic pop
#elif defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

namespace fs = std::filesystem;

namespace zn::res {
namespace {

using Pt = std::pair<double, double>;
using Poly = std::vector<Pt>;

double jsRound(double x) { return std::floor(x + 0.5); }  // Math.round: ties go up

// ---------------------------------------------------------------- geometry + scanline rasterizer
// Nonzero-winding coverage with 4x4 supersampling; 0..255 per pixel of a w x h box.
std::vector<std::uint8_t> rasterize(const std::vector<Poly>& polys, int w, int h) {
  const int S = 4;
  std::vector<std::uint8_t> out(static_cast<std::size_t>(w) * h);
  struct Edge { double x0, y0, x1, y1; int dir; };
  std::vector<Edge> edges;
  for (const Poly& p : polys)
    for (std::size_t i = 0; i < p.size(); ++i) {
      const Pt& a = p[i];
      const Pt& b = p[(i + 1) % p.size()];
      if (a.second == b.second) continue;
      edges.push_back(a.second < b.second ? Edge{a.first, a.second, b.first, b.second, 1} : Edge{b.first, b.second, a.first, a.second, -1});
    }
  std::vector<std::uint16_t> acc(static_cast<std::size_t>(w) * h, 0);
  struct X { double x; int d; };
  for (int sy = 0; sy < h * S; ++sy) {
    double y = (sy + 0.5) / S;
    std::vector<X> xs;
    for (const Edge& e : edges)
      if (y >= e.y0 && y < e.y1) xs.push_back({e.x0 + (y - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0), e.dir});
    if (xs.empty()) continue;
    std::stable_sort(xs.begin(), xs.end(), [](const X& a, const X& b) { return a.x < b.x; });
    int wind = 0;
    std::size_t row = static_cast<std::size_t>(sy / S) * w;
    for (std::size_t k = 0; k + 1 < xs.size(); ++k) {
      wind += xs[k].d;
      if (wind == 0) continue;
      int from = std::max(0, static_cast<int>(std::ceil(xs[k].x * S - 0.5))), to = std::min(w * S - 1, static_cast<int>(std::floor(xs[k + 1].x * S - 0.5)));
      for (int sx = from; sx <= to; ++sx) acc[row + (sx >> 2)]++;
    }
  }
  for (std::size_t i = 0; i < out.size(); ++i) out[i] = static_cast<std::uint8_t>(std::min(255.0, jsRound(acc[i] * 255.0 / (S * S))));
  return out;
}

void quad(Poly& out, Pt a, Pt c, Pt b, int n = 8) {
  for (int i = 1; i <= n; ++i) {
    double t = static_cast<double>(i) / n, u = 1 - t;
    out.push_back({u * u * a.first + 2 * u * t * c.first + t * t * b.first, u * u * a.second + 2 * u * t * c.second + t * t * b.second});
  }
}
void cubic(Poly& out, Pt a, Pt c1, Pt c2, Pt b, int n = 12) {
  for (int i = 1; i <= n; ++i) {
    double t = static_cast<double>(i) / n, u = 1 - t;
    out.push_back({u * u * u * a.first + 3 * u * u * t * c1.first + 3 * u * t * t * c2.first + t * t * t * b.first,
                   u * u * u * a.second + 3 * u * u * t * c1.second + 3 * u * t * t * c2.second + t * t * t * b.second});
  }
}

// ---------------------------------------------------------------- TrueType
struct Ttf {
  const std::uint8_t* buf = nullptr;
  std::size_t size = 0;
  int unitsPerEm = 0, ascent = 0, descent = 0, lineGap = 0, numGlyphs = 0, numH = 0;
  bool longLoca = false;
  std::size_t head = 0, hhea = 0, maxp = 0, hmtx = 0, loca = 0, glyf = 0;
  std::map<std::uint32_t, std::uint32_t> cmap;
  bool cff = false;   // OpenType with CFF outlines: embedded for the shaping tier, no glyphs baked

  unsigned u16(std::size_t o) const { return o + 2 <= size ? (buf[o] << 8) | buf[o + 1] : 0; }
  int i16(std::size_t o) const { unsigned v = u16(o); return v >= 0x8000 ? static_cast<int>(v) - 0x10000 : static_cast<int>(v); }
  std::uint32_t u32(std::size_t o) const { return (static_cast<std::uint32_t>(u16(o)) << 16) | u16(o + 2); }
  int i8(std::size_t o) const { return o < size ? static_cast<std::int8_t>(buf[o]) : 0; }

  bool parse(const std::uint8_t* b, std::size_t n, std::string& err) {
    buf = b; size = n;
    std::map<std::string, std::size_t> tables;
    unsigned nt = u16(4);
    for (unsigned i = 0; i < nt; ++i) { std::size_t o = 12 + i * 16; tables[std::string(reinterpret_cast<const char*>(b + o), 4)] = u32(o + 8); }
    auto t = [&](const char* name) -> std::size_t { auto it = tables.find(name); if (it == tables.end()) { err = std::string("font: missing table ") + name; return SIZE_MAX; } return it->second; };
    cff = tables.count("CFF ") || tables.count("CFF2");
    head = t("head"); hhea = t("hhea"); maxp = t("maxp"); hmtx = t("hmtx");
    if (!cff) { loca = t("loca"); glyf = t("glyf"); }
    std::size_t cmapT = t("cmap");
    if (!err.empty()) return false;
    unitsPerEm = static_cast<int>(u16(head + 18));
    longLoca = i16(head + 50) == 1;
    numGlyphs = static_cast<int>(u16(maxp + 4));
    numH = static_cast<int>(u16(hhea + 34));
    unsigned nsub = u16(cmapT + 2);
    long best = -1;
    int bestFmt = 0;
    for (unsigned i = 0; i < nsub; ++i) {
      unsigned pid = u16(cmapT + 4 + i * 8), eid = u16(cmapT + 6 + i * 8);
      std::size_t off = cmapT + u32(cmapT + 8 + i * 8);
      unsigned fmt = u16(off);
      if ((pid == 3 && (eid == 10 || eid == 1)) || pid == 0) if (fmt == 12 || (fmt == 4 && bestFmt != 12)) { best = static_cast<long>(off); bestFmt = static_cast<int>(fmt); }
    }
    if (bestFmt == 4) {
      std::size_t b0 = static_cast<std::size_t>(best);
      std::size_t segs = u16(b0 + 6) / 2, ends = b0 + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
      for (std::size_t s = 0; s < segs; ++s) {
        unsigned end = u16(ends + s * 2), start = u16(starts + s * 2), ro = u16(ranges + s * 2);
        int delta = i16(deltas + s * 2);
        for (unsigned c = start; c <= end && c != 0xffff; ++c) {
          unsigned g = 0;
          if (!ro) g = static_cast<unsigned>(c + delta) & 0xffff;
          else { std::size_t gi = ranges + s * 2 + ro + (c - start) * 2; g = u16(gi); if (g) g = static_cast<unsigned>(g + delta) & 0xffff; }
          if (g) cmap[c] = g;
        }
      }
    } else if (bestFmt == 12) {
      std::size_t b0 = static_cast<std::size_t>(best);
      std::uint32_t ng = u32(b0 + 12);
      for (std::uint32_t i = 0; i < ng; ++i) {
        std::size_t o = b0 + 16 + i * 12;
        std::uint32_t s = u32(o), e = u32(o + 4), g0 = u32(o + 8);
        for (std::uint32_t c = s; c <= e && c < 0x30000; ++c) cmap[c] = g0 + c - s;
      }
    }
    ascent = i16(hhea + 4); descent = i16(hhea + 6); lineGap = i16(hhea + 8);
    return true;
  }

  std::size_t locOf(int g) const { return longLoca ? u32(loca + static_cast<std::size_t>(g) * 4) : static_cast<std::size_t>(u16(loca + static_cast<std::size_t>(g) * 2)) * 2; }

  std::vector<Poly> glyph(int g, int depth = 0) const {
    std::vector<Poly> polys;
    if (g >= numGlyphs || depth > 4) return polys;
    std::size_t o = glyf + locOf(g);
    if (locOf(g + 1) == locOf(g)) return polys;
    int nc = i16(o);
    if (nc < 0) {  // composite: offsets (+ uniform scale)
      std::size_t p = o + 10;
      unsigned flags = 0;
      do {
        flags = u16(p);
        int gi = static_cast<int>(u16(p + 2));
        p += 4;
        double dx = 0, dy = 0;
        if (flags & 1) { dx = i16(p); dy = i16(p + 2); p += 4; } else { dx = i8(p); dy = i8(p + 1); p += 2; }
        double sx = 1, sy = 1;
        if (flags & 8) { sx = sy = i16(p) / 16384.0; p += 2; }
        else if (flags & 0x40) { sx = i16(p) / 16384.0; sy = i16(p + 2) / 16384.0; p += 4; }
        else if (flags & 0x80) { sx = i16(p) / 16384.0; sy = i16(p + 6) / 16384.0; p += 8; }
        for (const Poly& poly : glyph(gi, depth + 1)) {
          Poly q;
          for (const Pt& pt : poly) q.push_back({pt.first * sx + dx, pt.second * sy + dy});
          polys.push_back(std::move(q));
        }
      } while (flags & 0x20);
      return polys;
    }
    std::vector<int> endPts;
    for (int i = 0; i < nc; ++i) endPts.push_back(static_cast<int>(u16(o + 10 + static_cast<std::size_t>(i) * 2)));
    int npts = nc ? endPts[static_cast<std::size_t>(nc) - 1] + 1 : 0;
    std::size_t p = o + 10 + static_cast<std::size_t>(nc) * 2;
    p += 2 + u16(p);
    std::vector<int> fl;
    while (static_cast<int>(fl.size()) < npts) {
      int f = buf[p++];
      fl.push_back(f);
      if (f & 8) { int r = buf[p++]; while (r--) fl.push_back(f); }
    }
    std::vector<double> xs, ys;
    int v = 0;
    for (int f : fl) { if (f & 2) { int d = buf[p++]; v += (f & 16) ? d : -d; } else if (!(f & 16)) { v += i16(p); p += 2; } xs.push_back(v); }
    v = 0;
    for (int f : fl) { if (f & 4) { int d = buf[p++]; v += (f & 32) ? d : -d; } else if (!(f & 32)) { v += i16(p); p += 2; } ys.push_back(v); }
    int s = 0;
    for (int e : endPts) {
      struct Q { double x, y; bool on; };
      std::vector<Q> pts;
      for (int i = s; i <= e; ++i) pts.push_back({xs[static_cast<std::size_t>(i)], ys[static_cast<std::size_t>(i)], (fl[static_cast<std::size_t>(i)] & 1) != 0});
      s = e + 1;
      if (pts.empty()) continue;
      int k = -1;
      for (std::size_t i = 0; i < pts.size(); ++i) if (pts[i].on) { k = static_cast<int>(i); break; }
      Pt start;
      if (k < 0) { start = {(pts[0].x + pts[1 % pts.size()].x) / 2, (pts[0].y + pts[1 % pts.size()].y) / 2}; k = 0; }
      else { start = {pts[static_cast<std::size_t>(k)].x, pts[static_cast<std::size_t>(k)].y}; k = k + 1; }
      Poly poly{start};
      Pt prev = start, ctrl{};
      bool haveCtrl = false;
      for (std::size_t i = 0; i < pts.size(); ++i) {
        const Q& q = pts[(static_cast<std::size_t>(k) + i) % pts.size()];
        if (q.on) {
          if (haveCtrl) quad(poly, prev, ctrl, {q.x, q.y}); else poly.push_back({q.x, q.y});
          prev = {q.x, q.y}; haveCtrl = false;
        } else {
          if (haveCtrl) { Pt mid{(ctrl.first + q.x) / 2, (ctrl.second + q.y) / 2}; quad(poly, prev, ctrl, mid); prev = mid; }
          ctrl = {q.x, q.y}; haveCtrl = true;
        }
      }
      if (haveCtrl) quad(poly, prev, ctrl, start);
      polys.push_back(std::move(poly));
    }
    return polys;
  }
  double advance(int g) const { return u16(hmtx + static_cast<std::size_t>(std::min(g, numH - 1)) * 4); }
};

// ---------------------------------------------------------------- baked data
struct BakedGlyph { std::uint32_t cp; int x0, y0, w, h, adv; std::uint32_t off; };
struct BakedFont { std::string name; int px, ascent, descent, lineGap; std::vector<BakedGlyph> glyphs; std::vector<std::uint8_t> bitmap; };
struct BakedImage { std::string name; int w, h, scale; std::vector<std::uint8_t> rgba; };
struct Grid { int cell; bool threshold; };

bool readFile(const std::string& path, std::vector<std::uint8_t>& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  out.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}

// Rasterizes `chars` of a font at `px` pixels. `grid` forces a monospace cell (the legacy 8x8 gfx.text).
BakedFont bakeFont(const Ttf& ttf, const std::string& name, int px, const std::vector<std::uint32_t>& chars, const Grid* grid, bool italic = false) {
  double scale = static_cast<double>(px) / ttf.unitsPerEm;
  BakedFont f;
  f.name = name; f.px = px;
  std::set<std::uint32_t> uniq(chars.begin(), chars.end());
  if (ttf.cff) uniq.clear();
  for (std::uint32_t cp : uniq) {
    auto it = ttf.cmap.find(cp);
    if (it == ttf.cmap.end()) continue;
    int g = static_cast<int>(it->second);
    std::vector<Poly> polys = ttf.glyph(g);
    for (Poly& p : polys) for (Pt& pt : p) pt = {(pt.first + (italic ? 0.2126 * pt.second : 0)) * scale, -pt.second * scale};
    double minX = INFINITY, minY = INFINITY, maxX = -INFINITY, maxY = -INFINITY;
    for (const Poly& p : polys) for (const Pt& pt : p) { minX = std::min(minX, pt.first); minY = std::min(minY, pt.second); maxX = std::max(maxX, pt.first); maxY = std::max(maxY, pt.second); }
    int adv = static_cast<int>(jsRound(ttf.advance(g) * scale * 64));
    if (grid) adv = grid->cell * 64;
    if (polys.empty()) { f.glyphs.push_back({cp, 0, 0, 0, 0, adv, static_cast<std::uint32_t>(f.bitmap.size())}); continue; }
    int x0 = static_cast<int>(std::floor(minX)), y0 = static_cast<int>(std::floor(minY));
    if (grid) x0 = std::min(x0, static_cast<int>(std::floor((grid->cell - (maxX - minX)) / 2 - minX + minX)));
    int w = static_cast<int>(std::ceil(maxX)) - x0, h = static_cast<int>(std::ceil(maxY)) - y0;
    for (Poly& p : polys) for (Pt& pt : p) pt = {pt.first - x0, pt.second - y0};
    std::vector<std::uint8_t> a = rasterize(polys, w, h);
    f.glyphs.push_back({cp, x0, y0, w, h, adv, static_cast<std::uint32_t>(f.bitmap.size())});
    for (std::uint8_t v : a) f.bitmap.push_back(grid && grid->threshold ? (v > 72 ? 255 : 0) : v);
  }
  f.ascent = static_cast<int>(jsRound(ttf.ascent * scale));
  f.descent = static_cast<int>(jsRound(-ttf.descent * scale));
  f.lineGap = static_cast<int>(jsRound(ttf.lineGap * scale));
  return f;
}

// ---------------------------------------------------------------- images
bool isWebp(const std::uint8_t* d, std::size_t n) { return n >= 12 && !std::memcmp(d, "RIFF", 4) && !std::memcmp(d + 8, "WEBP", 4); }

bool decodePng(const std::vector<std::uint8_t>& buf, BakedImage& im, std::string& err) {
  int w = 0, h = 0, n = 0;
  if (isWebp(buf.data(), buf.size())) {   // WebP (ZN-226): libwebp, straight RGBA like the other decoders
    std::uint8_t* px = WebPDecodeRGBA(buf.data(), buf.size(), &w, &h);
    if (!px) { err = "image: not a valid WebP file"; return false; }
    im.w = w; im.h = h;
    im.rgba.assign(px, px + static_cast<std::size_t>(w) * h * 4);
    WebPFree(px);
    return true;
  }
  unsigned char* px = stbi_load_from_memory(buf.data(), static_cast<int>(buf.size()), &w, &h, &n, 4);
  if (!px) { err = std::string("image: ") + stbi_failure_reason(); return false; }
  im.w = w; im.h = h;
  im.rgba.assign(px, px + static_cast<std::size_t>(w) * h * 4);
  stbi_image_free(px);
  return true;
}

std::string attr(const std::string& s, const std::string& n) {
  std::regex re("\\b" + n + "=\"([^\"]*)\"");
  std::smatch m;
  return std::regex_search(s, m, re) ? m[1].str() : std::string("\x01");  // \x01: absent
}
bool has(const std::string& v) { return v != "\x01"; }
double num(const std::string& v, double d) { return has(v) ? std::atof(v.c_str()) : d; }

std::vector<Poly> svgPath(const std::string& d) {
  std::vector<std::string> tok;
  {
    static const std::regex re("[a-zA-Z]|-?\\d*\\.?\\d+(?:e-?\\d+)?");
    for (auto it = std::sregex_iterator(d.begin(), d.end(), re); it != std::sregex_iterator(); ++it) tok.push_back(it->str());
  }
  std::vector<Poly> polys;
  Poly cur;
  double x = 0, y = 0, sx = 0, sy = 0;
  char cmd = 0;
  std::size_t i = 0;
  Pt lc{};
  bool haveLc = false;
  auto n = [&]() { return i < tok.size() ? std::atof(tok[i++].c_str()) : 0.0; };
  while (i < tok.size()) {
    if (std::isalpha(static_cast<unsigned char>(tok[i][0]))) cmd = tok[i++][0];
    bool rel = std::islower(static_cast<unsigned char>(cmd)) != 0;
    char C = static_cast<char>(std::toupper(static_cast<unsigned char>(cmd)));
    double ox = rel ? x : 0, oy = rel ? y : 0;
    if (C == 'M') { if (!cur.empty()) polys.push_back(cur); x = n() + ox; y = n() + oy; sx = x; sy = y; cur = {{x, y}}; cmd = rel ? 'l' : 'L'; }
    else if (C == 'L') { x = n() + ox; y = n() + oy; cur.push_back({x, y}); }
    else if (C == 'H') { x = n() + ox; cur.push_back({x, y}); }
    else if (C == 'V') { y = n() + oy; cur.push_back({x, y}); }
    else if (C == 'C' || C == 'S') {
      Pt c1;
      if (C == 'C') { double a = n() + ox, b = n() + oy; c1 = {a, b}; } else c1 = haveLc ? Pt{2 * x - lc.first, 2 * y - lc.second} : Pt{x, y};
      double a = n() + ox, b = n() + oy;
      Pt c2{a, b};
      double ex = n() + ox, ey = n() + oy;
      Pt e{ex, ey};
      cubic(cur, {x, y}, c1, c2, e);
      lc = c2; haveLc = true; x = e.first; y = e.second;
      continue;
    } else if (C == 'Q') { double a = n() + ox, b = n() + oy; double ex = n() + ox, ey = n() + oy; quad(cur, {x, y}, {a, b}, {ex, ey}); x = ex; y = ey; }
    else if (C == 'A') { n(); n(); n(); n(); n(); x = n() + ox; y = n() + oy; cur.push_back({x, y}); }  // arcs as chords
    else if (C == 'Z') { if (!cur.empty()) polys.push_back(cur); cur.clear(); x = sx; y = sy; }
    else ++i;
    haveLc = false;
  }
  if (!cur.empty()) polys.push_back(cur);
  return polys;
}

bool rasterizeSvg(const std::string& text, int outW, BakedImage& im, std::string& err) {
  std::smatch tagM;
  if (!std::regex_search(text, tagM, std::regex("<svg\\b[^>]*>"))) { err = "svg: no <svg> element"; return false; }
  std::string svgTag = tagM[0].str();
  double vb[4] = {0, 0, 64, 64};
  std::string vbs = attr(svgTag, "viewBox");
  if (has(vbs)) {
    std::string t = vbs;
    for (char& c : t) if (c == ',') c = ' ';
    std::istringstream in(t);
    for (double& v : vb) in >> v;
  } else { vb[2] = num(attr(svgTag, "width"), 64); vb[3] = num(attr(svgTag, "height"), 64); }
  double iw = num(attr(svgTag, "width"), vb[2]), ih = num(attr(svgTag, "height"), vb[3]);
  int w = static_cast<int>(jsRound(outW > 0 ? outW : iw));
  int h = static_cast<int>(jsRound(w * ih / iw));
  double sx = w / vb[2], sy = h / vb[3];
  std::vector<double> rgba(static_cast<std::size_t>(w) * h * 4, 0.0);
  struct C3 { double r, g, b; bool ok; };
  auto color = [](const std::string& c) -> C3 {
    if (!has(c) || c == "none") return {0, 0, 0, false};
    if (!c.empty() && c[0] == '#') {
      std::string x = c.substr(1);
      if (c.size() == 4) { std::string y; for (char d : x) { y += d; y += d; } x = y; }
      auto hex = [&](int a) { return static_cast<double>(std::strtol(x.substr(static_cast<std::size_t>(a), 2).c_str(), nullptr, 16)); };
      return {hex(0), hex(2), hex(4), true};
    }
    if (c == "white") return {255, 255, 255, true};
    if (c == "red") return {255, 0, 0, true};
    if (c == "blue") return {0, 0, 255, true};
    if (c == "green") return {0, 128, 0, true};
    return {0, 0, 0, true};
  };
  struct Tf { double tx, ty, ks, kt; };
  std::vector<Tf> stack{{0, 0, 1, 1}};
  static const std::regex tagRe("<(/?)(\\w+)([^>]*?)(/?)>");
  for (auto it = std::sregex_iterator(text.begin(), text.end(), tagRe); it != std::sregex_iterator(); ++it) {
    std::string close = (*it)[1], tag = (*it)[2], rest = (*it)[3], selfClose = (*it)[4];
    if (tag == "g") {
      if (!close.empty()) { if (stack.size() > 1) stack.pop_back(); continue; }
      Tf cur = stack.back();
      std::string tr = attr(rest, "transform");
      double nx = 0, ny = 0, s1 = 1, s2 = 1;
      std::smatch m;
      if (has(tr)) {
        if (std::regex_search(tr, m, std::regex("translate\\(([-\\d.]+)[ ,]*([-\\d.]*)\\)"))) { nx = std::atof(m[1].str().c_str()); ny = m[2].str().empty() ? 0 : std::atof(m[2].str().c_str()); }
        if (std::regex_search(tr, m, std::regex("scale\\(([-\\d.]+)[ ,]*([-\\d.]*)\\)"))) { s1 = std::atof(m[1].str().c_str()); s2 = m[2].str().empty() ? s1 : std::atof(m[2].str().c_str()); }
      }
      if (selfClose.empty()) stack.push_back({cur.tx + nx * cur.ks, cur.ty + ny * cur.kt, cur.ks * s1, cur.kt * s2});
      continue;
    }
    if (!close.empty()) continue;
    std::string fillS = attr(rest, "fill");
    C3 fill = color(has(fillS) ? fillS : std::string("black"));
    if (!fill.ok) continue;
    double op = num(attr(rest, "opacity"), 1) * num(attr(rest, "fill-opacity"), 1);
    Tf t = stack.back();
    auto P = [&](double x, double y) { return Pt{((x * t.ks + t.tx) - vb[0]) * sx, ((y * t.kt + t.ty) - vb[1]) * sy}; };
    auto nv = [&](const char* n) { return num(attr(rest, n), 0); };
    std::vector<Poly> polys;
    if (tag == "circle" || tag == "ellipse") {
      double cx = nv("cx"), cy = nv("cy"), rx = tag == "circle" ? nv("r") : nv("rx"), ry = tag == "circle" ? nv("r") : nv("ry");
      Poly pts;
      for (int i = 0; i < 64; ++i) pts.push_back(P(cx + rx * std::cos(i / 64.0 * M_PI * 2), cy + ry * std::sin(i / 64.0 * M_PI * 2)));
      polys = {pts};
    } else if (tag == "rect") {
      double x = nv("x"), y = nv("y"), rw = nv("width"), rh = nv("height");
      double rr = nv("rx") != 0 ? nv("rx") : nv("ry");
      double r = std::min(rr, std::min(rw / 2, rh / 2));
      Poly pts;
      auto corner = [&](double cx, double cy, double a0) { for (int i = 0; i <= 8; ++i) { double a = a0 + i / 8.0 * M_PI / 2; pts.push_back(P(cx + r * std::cos(a), cy + r * std::sin(a))); } };
      if (r > 0) { corner(x + rw - r, y + r, -M_PI / 2); corner(x + rw - r, y + rh - r, 0); corner(x + r, y + rh - r, M_PI / 2); corner(x + r, y + r, M_PI); }
      else { pts.push_back(P(x, y)); pts.push_back(P(x + rw, y)); pts.push_back(P(x + rw, y + rh)); pts.push_back(P(x, y + rh)); }
      polys = {pts};
    } else if (tag == "polygon") {
      std::string ps = attr(rest, "points");
      std::vector<double> v;
      std::string cur;
      for (char c : (has(ps) ? ps : std::string()) + " ") { if (std::isspace(static_cast<unsigned char>(c)) || c == ',') { if (!cur.empty()) v.push_back(std::atof(cur.c_str())); cur.clear(); } else cur += c; }
      Poly pts;
      for (std::size_t i = 0; i + 1 < v.size(); i += 2) pts.push_back(P(v[i], v[i + 1]));
      polys = {pts};
    } else if (tag == "path") {
      std::string d = attr(rest, "d");
      for (Poly& p : svgPath(has(d) ? d : std::string())) { for (Pt& pt : p) pt = P(pt.first, pt.second); polys.push_back(std::move(p)); }
    } else continue;
    std::vector<std::uint8_t> cov = rasterize(polys, w, h);
    for (std::size_t i = 0; i < static_cast<std::size_t>(w) * h; ++i) {
      double a = cov[i] / 255.0 * op;
      if (!a) continue;
      double da = rgba[i * 4 + 3], oa = a + da * (1 - a);
      double cs[3] = {fill.r, fill.g, fill.b};
      for (int k = 0; k < 3; ++k) rgba[i * 4 + static_cast<std::size_t>(k)] = (cs[k] * a + rgba[i * 4 + static_cast<std::size_t>(k)] * da * (1 - a)) / oa;
      rgba[i * 4 + 3] = oa;
    }
  }
  im.w = w; im.h = h;
  im.rgba.assign(static_cast<std::size_t>(w) * h * 4, 0);
  for (std::size_t i = 0; i < static_cast<std::size_t>(w) * h; ++i) {
    for (int k = 0; k < 3; ++k) im.rgba[i * 4 + static_cast<std::size_t>(k)] = static_cast<std::uint8_t>(jsRound(rgba[i * 4 + static_cast<std::size_t>(k)]));
    im.rgba[i * 4 + 3] = static_cast<std::uint8_t>(jsRound(rgba[i * 4 + 3] * 255));
  }
  return true;
}

// ---------------------------------------------------------------- the program scan
int textSize(const std::string& k) {
  static const std::map<std::string, int> t = {{"xs", 12}, {"sm", 14}, {"base", 16}, {"lg", 18}, {"xl", 20}, {"2xl", 24}, {"3xl", 30}, {"4xl", 36}, {"5xl", 48}, {"6xl", 60}};
  auto it = t.find(k);
  return it == t.end() ? 16 : it->second;
}

std::vector<std::uint32_t> utf8Chars(const std::string& s) {
  std::vector<std::uint32_t> r;
  for (std::size_t i = 0; i < s.size();) {
    unsigned char c = static_cast<unsigned char>(s[i]);
    std::uint32_t cp = c;
    int n = 1;
    if (c >= 0xF0) { cp = c & 7; n = 4; } else if (c >= 0xE0) { cp = c & 15; n = 3; } else if (c >= 0xC0) { cp = c & 31; n = 2; }
    for (int k = 1; k < n && i + static_cast<std::size_t>(k) < s.size(); ++k) cp = (cp << 6) | (static_cast<unsigned char>(s[i + static_cast<std::size_t>(k)]) & 63);
    r.push_back(cp);
    i += static_cast<std::size_t>(n);
  }
  return r;
}

// Characters of every string literal and JSX text: what the original found with /(["'`])((?:\\.|(?!\1).)*)\1|>([^<>{}]+)</g.
void literalChars(const std::string& t, std::set<std::uint32_t>& chars) {
  std::size_t n = t.size();
  for (std::size_t i = 0; i < n;) {
    char c = t[i];
    if (c == '"' || c == '\'' || c == '`') {
      std::size_t j = i + 1;
      bool closed = false;
      while (j < n && t[j] != '\n') {
        if (t[j] == '\\' && j + 1 < n && t[j + 1] != '\n') j += 2;
        else if (t[j] == c) { closed = true; break; }
        else ++j;
      }
      if (closed) { for (std::uint32_t cp : utf8Chars(t.substr(i + 1, j - i - 1))) chars.insert(cp); i = j + 1; continue; }
      ++i;
    } else if (c == '>') {
      std::size_t j = i + 1;
      while (j < n && t[j] != '<' && t[j] != '>' && t[j] != '{' && t[j] != '}') ++j;
      if (j > i + 1 && j < n && t[j] == '<') { for (std::uint32_t cp : utf8Chars(t.substr(i + 1, j - i - 1))) chars.insert(cp); i = j + 1; continue; }
      ++i;
    } else ++i;
  }
}

void writeU32(std::vector<std::uint8_t>& b, std::uint32_t v) { for (int i = 0; i < 4; ++i) b.push_back(static_cast<std::uint8_t>(v >> (8 * i))); }
void writeStr(std::vector<std::uint8_t>& b, const std::string& s) { writeU32(b, static_cast<std::uint32_t>(s.size())); b.insert(b.end(), s.begin(), s.end()); }

}  // namespace

// The TrueType file reduced to `cps` with hb-subset (ZN-428): no hinting and no layout tables, which the runtime rasterizer (runtime/ttf.cpp:
// head, hhea, hmtx, loca, glyf, cmap, maxp) does not read; the outlines and metrics it reads are kept. False: keep the whole file.
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
    for (const char* t : {"GSUB", "GPOS", "GDEF", "kern", "DSIG", "STAT", "fvar", "gvar", "HVAR", "avar"}) hb_set_add(drop, HB_TAG(t[0], t[1], t[2], t[3]));
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

bool bake(const std::vector<std::string>& sources, const Options& opt, std::vector<std::uint8_t>& blob, std::string& err) {
  const bool embedTtf = opt.hiScale > 0;
  std::set<int> sizes{16};
  std::set<std::uint32_t> chars;
  for (int c = 32; c < 127; ++c) chars.insert(static_cast<std::uint32_t>(c));
  bool fontMono = false, italicUsed = false, caseUsed = false, ellipsisUsed = false;
  static const std::regex reText("text-(xs|sm|base|lg|xl|[2-6]xl)\\b"), reTextPx("text-\\[(\\d+)(?:px)?\\]"), reFontSize("font-size\\s*:\\s*(\\d+)px"),
      reFontCall("\\bfont\\(\\s*['\"][\\w-]+['\"]\\s*,\\s*(\\d+)\\s*\\)"),
      reCanvas("['\"`](?:(?:bold|normal|italic|[1-9]00)\\s+)*(\\d+)px\\s+[\\w\\s,\"-]*(?:sans|serif|mono|system-ui|Inter|Arial|Helvetica)"), reMono("\\bfont-mono\\b");
  bool gridUsed = !embedTtf;   // the legacy gfx.text: every grid size when a program calls it (or when no TrueType file backs the overlays)
  static const std::regex reGfxText("\\btext\\s*\\(");
  for (std::size_t si = 0; si < sources.size(); ++si) {
    const std::string& text = sources[si];
    // the library's sizes are real uses (a kit Button is text-sm), but its style tables name every face (italic, font-mono, uppercase) and its comments
    // say "text (": those faces and the grid come from the program's own files; the runtime rasterizes the rest from the TrueType files (ZN-428)
    const bool lib = embedTtf && si < opt.library.size() && opt.library[si];
    if (!lib && !gridUsed && text.find("zinc:gfx") != std::string::npos && std::regex_search(text, reGfxText)) gridUsed = true;
    // line by line: the patterns do not span lines, and short subjects keep the regex engine fast
    std::size_t at = 0;
    while (at < text.size()) {
      std::size_t nl = text.find('\n', at);
      std::string line = text.substr(at, nl == std::string::npos ? std::string::npos : nl - at);
      at = nl == std::string::npos ? text.size() : nl + 1;
      std::smatch m;
      if (line.find("text-") != std::string::npos) {
        for (auto it = std::sregex_iterator(line.begin(), line.end(), reText); it != std::sregex_iterator(); ++it) sizes.insert(textSize((*it)[1].str()));
        for (auto it = std::sregex_iterator(line.begin(), line.end(), reTextPx); it != std::sregex_iterator(); ++it) sizes.insert(std::atoi((*it)[1].str().c_str()));
      }
      if (line.find("font-size") != std::string::npos) for (auto it = std::sregex_iterator(line.begin(), line.end(), reFontSize); it != std::sregex_iterator(); ++it) sizes.insert(std::atoi((*it)[1].str().c_str()));
      if (line.find("font(") != std::string::npos) for (auto it = std::sregex_iterator(line.begin(), line.end(), reFontCall); it != std::sregex_iterator(); ++it) sizes.insert(std::atoi((*it)[1].str().c_str()));
      if (line.find("px") != std::string::npos) for (auto it = std::sregex_iterator(line.begin(), line.end(), reCanvas); it != std::sregex_iterator(); ++it) sizes.insert(std::atoi((*it)[1].str().c_str()));
      if (!ellipsisUsed && (line.find("truncate") != std::string::npos || line.find("text-ellipsis") != std::string::npos || line.find("line-clamp") != std::string::npos || line.find("textOverflow") != std::string::npos)) ellipsisUsed = true;
      if (lib) continue;
      if (!caseUsed && (line.find("uppercase") != std::string::npos || line.find("lowercase") != std::string::npos || line.find("capitalize") != std::string::npos || line.find("textTransform") != std::string::npos)) caseUsed = true;
      if (!italicUsed && line.find("italic") != std::string::npos) italicUsed = true;
      if (!fontMono && line.find("font-mono") != std::string::npos && std::regex_search(line, reMono)) fontMono = true;
    }
    literalChars(text, chars);
  }
  if (ellipsisUsed) chars.insert(0x2026);   // truncate, text-ellipsis, line-clamp (ZN-269)
  if (caseUsed)   // uppercase / lowercase / capitalize (ZN-268): the other case of every non-ASCII letter is baked with it
    for (std::uint32_t cp : std::vector<std::uint32_t>(chars.begin(), chars.end()))
      if (cp >= 128 && cp < 0xD800) {
        std::u16string one(1, static_cast<char16_t>(cp));
        for (const std::u16string& m : {zn::uni::upper(one), zn::uni::lower(one)}) for (char16_t c : m) chars.insert(c);
      }
  std::vector<std::uint32_t> cps(chars.begin(), chars.end());
  struct Family { std::string name, file; };
  std::vector<Family> families{{"sans", opt.fontDir + "/Inter-Regular.ttf"}, {"sans-bold", opt.fontDir + "/Inter-Bold.ttf"}};
  std::string monoFile = opt.fontDir + "/JetBrainsMono-Regular.ttf";
  if (fontMono) families.push_back({"mono", monoFile});
  if (!opt.assetsDir.empty() && fs::exists(opt.assetsDir)) {  // every TrueType file of the assets: font-[FileName]
    std::vector<fs::path> found;
    for (auto& e : fs::recursive_directory_iterator(opt.assetsDir)) if (e.is_regular_file() && (e.path().extension() == ".ttf" || e.path().extension() == ".otf")) found.push_back(e.path());
    std::sort(found.begin(), found.end());
    // weight and italic faces (Roboto-Medium, Roboto-BoldItalic) are baked only when the app names the file or its family (ZN-267); other files stay: the shaper falls back on them
    auto named = [&](const std::string& stem) {
      std::size_t dash = stem.rfind('-');
      static const std::set<std::string> faces{"Thin", "ExtraLight", "Light", "Medium", "SemiBold", "Bold", "ExtraBold", "Black", "Italic", "BoldItalic", "LightItalic", "MediumItalic", "SemiBoldItalic", "BlackItalic", "ThinItalic"};
      if (dash == std::string::npos || !faces.count(stem.substr(dash + 1))) return true;
      std::string fam = stem.substr(0, dash);
      for (const std::string& t : sources) if (t.find(stem) != std::string::npos || (!fam.empty() && t.find(fam) != std::string::npos)) return true;
      return false;
    };
    for (auto& p : found) if (named(p.stem().string())) families.push_back({p.stem().string(), p.string()});
  }
  std::map<std::string, std::vector<std::uint8_t>> fontBytes;
  std::vector<BakedFont> fonts;
  for (int px : sizes)
    for (const Family& f : families) {
      if (!fontBytes.count(f.file) && !readFile(f.file, fontBytes[f.file])) { err = "cannot read the font " + f.file; return false; }
      Ttf ttf;
      std::string e;
      if (!ttf.parse(fontBytes[f.file].data(), fontBytes[f.file].size(), e)) { err = f.file + ": " + e; return false; }
      fonts.push_back(bakeFont(ttf, f.name, px, cps, nullptr));
      if (italicUsed) fonts.push_back(bakeFont(ttf, f.name + "~i", px, cps, nullptr, true));   // font-italic: the synthetic slant of the face
    }
  {  // the legacy gfx.text(x, y, s, color, scale): crisp monospace on an 8 px grid; the larger cells serve HiDPI screens
    if (!fontBytes.count(monoFile) && !readFile(monoFile, fontBytes[monoFile])) { err = "cannot read the font " + monoFile; return false; }
    Ttf mono;
    std::string e;
    if (!mono.parse(fontBytes[monoFile].data(), fontBytes[monoFile].size(), e)) { err = monoFile + ": " + e; return false; }
    std::vector<std::uint32_t> ascii;
    for (int i = 0; i < 95; ++i) ascii.push_back(static_cast<std::uint32_t>(i + 32));
    for (int k : {1, 2, 3, 4, 6, 8}) {
      if (!gridUsed && k > 3) continue;   // the runtime's own overlays (errors, profiler) use 8 x the pixel scale
      Grid grid{8 * k, true};
      BakedFont g = bakeFont(mono, "grid", static_cast<int>(jsRound(8 * k * 1.3)), ascii, &grid);
      g.px = 8 * k; g.ascent = static_cast<int>(jsRound(7.0 * k)); g.descent = k; g.lineGap = 0;
      fonts.push_back(std::move(g));
    }
  }
  std::vector<BakedImage> images;
  if (!opt.assetsDir.empty() && fs::exists(opt.assetsDir)) {
    std::vector<fs::path> files;
    for (auto& e : fs::recursive_directory_iterator(opt.assetsDir)) if (e.is_regular_file()) files.push_back(e.path());
    std::sort(files.begin(), files.end());
    for (const fs::path& p : files) {
      std::string rel = fs::relative(p, opt.assetsDir).generic_string(), f = p.filename().string();
      bool hidden = false;
      for (const fs::path& part : fs::relative(p, opt.assetsDir)) if (!part.empty() && part.string()[0] == '.') hidden = true;
      if (hidden) continue;
      std::smatch hi;
      std::string ext = p.extension().string();
      if (std::regex_search(f, hi, std::regex("@([234])x\\.png$"))) {
        if (embedTtf) {
          std::vector<std::uint8_t> b; BakedImage im;
          if (!readFile(p.string(), b) || !decodePng(b, im, err)) { if (err.empty()) err = "cannot read " + p.string(); return false; }
          im.name = std::regex_replace(rel, std::regex("@[234]x\\.png$"), ".png"); im.scale = hi[1].str()[0] - '0';
          images.push_back(std::move(im));
        }
      } else if (ext == ".png") {
        bool hasHi = false;
        for (int k : {2, 3, 4}) { fs::path q = p; q.replace_extension(); if (fs::exists(q.string() + "@" + std::to_string(k) + "x.png")) hasHi = true; }
        if (!(embedTtf && hasHi)) {
          std::vector<std::uint8_t> b; BakedImage im;
          if (!readFile(p.string(), b) || !decodePng(b, im, err)) { if (err.empty()) err = "cannot read " + p.string(); return false; }
          im.name = rel; im.scale = 1;
          images.push_back(std::move(im));
        }
      } else if (ext == ".jpg" || ext == ".jpeg" || ext == ".webp") {   // a photograph (or a WebP): decoded like a PNG, no @2x variants
        std::vector<std::uint8_t> b; BakedImage im;
        if (!readFile(p.string(), b) || !decodePng(b, im, err)) { if (err.empty()) err = "cannot read " + p.string(); return false; }
        im.name = rel; im.scale = 1;
        images.push_back(std::move(im));
      } else if (ext == ".svg") {
        std::vector<std::uint8_t> b;
        if (!readFile(p.string(), b)) { err = "cannot read " + p.string(); return false; }
        std::string text(b.begin(), b.end());
        BakedImage base;
        if (!rasterizeSvg(text, 0, base, err)) return false;
        int k = embedTtf ? std::max(1, std::min(opt.hiScale, 1024 / std::max(1, base.w))) : 1;
        BakedImage im = base;
        if (k > 1 && !rasterizeSvg(text, base.w * k, im, err)) return false;
        im.name = rel; im.scale = k;
        images.push_back(std::move(im));
      }
    }
  }
  // the blob (version 1): 'ZRS1', fonts (name, px, ascent, descent, lineGap, glyph count, glyphs, bitmap), images (name, w, h, scale, rgba), TrueType files (name, bytes)
  blob.clear();
  blob.insert(blob.end(), {'Z', 'R', 'S', '1'});
  writeU32(blob, static_cast<std::uint32_t>(fonts.size()));
  for (const BakedFont& f : fonts) {
    writeStr(blob, f.name);
    writeU32(blob, static_cast<std::uint32_t>(f.px)); writeU32(blob, static_cast<std::uint32_t>(f.ascent)); writeU32(blob, static_cast<std::uint32_t>(f.descent)); writeU32(blob, static_cast<std::uint32_t>(f.lineGap));
    writeU32(blob, static_cast<std::uint32_t>(f.glyphs.size()));
    for (const BakedGlyph& g : f.glyphs) {
      writeU32(blob, g.cp);
      writeU32(blob, static_cast<std::uint32_t>(g.x0)); writeU32(blob, static_cast<std::uint32_t>(g.y0));
      writeU32(blob, static_cast<std::uint32_t>(g.w)); writeU32(blob, static_cast<std::uint32_t>(g.h));
      writeU32(blob, static_cast<std::uint32_t>(g.adv)); writeU32(blob, g.off);
    }
    writeU32(blob, static_cast<std::uint32_t>(f.bitmap.size()));
    blob.insert(blob.end(), f.bitmap.begin(), f.bitmap.end());
  }
  writeU32(blob, static_cast<std::uint32_t>(images.size()));
  for (const BakedImage& im : images) {
    writeStr(blob, im.name);
    writeU32(blob, static_cast<std::uint32_t>(im.w)); writeU32(blob, static_cast<std::uint32_t>(im.h)); writeU32(blob, static_cast<std::uint32_t>(im.scale));
    blob.insert(blob.end(), im.rgba.begin(), im.rgba.end());
  }
  std::vector<Family> ttfs;
  if (embedTtf) { ttfs = families; if (!fontMono) ttfs.push_back({"mono", monoFile}); }
  writeU32(blob, static_cast<std::uint32_t>(ttfs.size()));
  // what the program can show: its characters, ASCII, Latin-1 and Latin Extended-A (text typed at run time), common punctuation and symbols
  std::set<std::uint32_t> keep(chars.begin(), chars.end());
  for (std::uint32_t c = 0x20; c < 0x17F; ++c) keep.insert(c);
  for (std::uint32_t c : {0x2010u, 0x2011u, 0x2012u, 0x2013u, 0x2014u, 0x2018u, 0x2019u, 0x201Au, 0x201Cu, 0x201Du, 0x201Eu, 0x2020u, 0x2021u, 0x2022u, 0x2026u, 0x2030u, 0x2039u, 0x203Au, 0x20ACu, 0x2122u, 0xFFFDu}) keep.insert(c);
  for (const Family& f : ttfs) {
    if (!fontBytes.count(f.file) && !readFile(f.file, fontBytes[f.file])) { err = "cannot read the font " + f.file; return false; }
    std::vector<std::uint8_t> sub;
    const std::vector<std::uint8_t>& bytes = !opt.wholeFonts && subsetTtf(fontBytes[f.file], keep, sub) ? sub : fontBytes[f.file];
    writeStr(blob, f.name);
    writeU32(blob, static_cast<std::uint32_t>(bytes.size()));
    blob.insert(blob.end(), bytes.begin(), bytes.end());
  }
  return true;
}

bool decodeRgba(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba) {
  int n = 0;
  if (isWebp(data, size)) {
    std::uint8_t* q = WebPDecodeRGBA(data, size, &w, &h);
    if (!q) return false;
    rgba.assign(q, q + static_cast<size_t>(w) * h * 4);
    WebPFree(q);
    return true;
  }
  unsigned char* p = stbi_load_from_memory(data, static_cast<int>(size), &w, &h, &n, 4);
  if (!p) return false;
  rgba.assign(p, p + static_cast<size_t>(w) * h * 4);
  stbi_image_free(p);
  return true;
}


std::vector<uint8_t> encodeWebp(const uint8_t* px, int w, int h, int comp, bool lossless, float quality) {
  std::vector<uint8_t> out;
  uint8_t* data = nullptr;
  size_t n = 0;
  if (comp == 4) n = lossless ? WebPEncodeLosslessRGBA(px, w, h, w * 4, &data) : WebPEncodeRGBA(px, w, h, w * 4, quality, &data);
  else if (comp == 3) n = lossless ? WebPEncodeLosslessRGB(px, w, h, w * 3, &data) : WebPEncodeRGB(px, w, h, w * 3, quality, &data);
  if (n && data) out.assign(data, data + n);
  WebPFree(data);
  return out;
}
}  // namespace zn::res
