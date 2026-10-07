// The text-shaping tier (ZN-114): kerning, Arabic and Hebrew bidi, Devanagari, a ZWJ emoji and CJK line breaking; every fixture is drawn into a gray image and
// compared byte for byte with tests/golden/text/<name>.png (`layout_test --update` rewrites them).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "text/layout.h"

using namespace zn::text;

static int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { failures++; std::printf("FAIL %s:%d: ", __FILE__, __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static std::string dataDir, goldenDir;
static bool update = false;

static std::vector<uint8_t> readFile(const std::string& p) { std::ifstream f(p, std::ios::binary); return {std::istreambuf_iterator<char>(f), {}}; }

struct Font { std::vector<uint8_t> bytes; std::unique_ptr<Face> face; };
static Font load(const char* name) {
  Font f; f.bytes = readFile(dataDir + "/fonts/" + name);
  f.face = Face::open(f.bytes.data(), f.bytes.size());
  if (!f.face) { std::printf("cannot open font %s\n", name); std::exit(2); }
  return f;
}

// stored-deflate gray PNG: no zlib needed, and the bytes are stable
static uint32_t crc(const uint8_t* d, size_t n, uint32_t c = 0xffffffffu) { for (size_t i = 0; i < n; i++) { c ^= d[i]; for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xedb88320u & (0u - (c & 1))); } return c; }
static void be32(std::vector<uint8_t>& o, uint32_t v) { for (int s = 24; s >= 0; s -= 8) o.push_back(static_cast<uint8_t>(v >> s)); }
static void chunk(std::vector<uint8_t>& o, const char* t, const std::vector<uint8_t>& b) {
  be32(o, static_cast<uint32_t>(b.size()));
  std::vector<uint8_t> tb(t, t + 4); tb.insert(tb.end(), b.begin(), b.end());
  o.insert(o.end(), tb.begin(), tb.end()); be32(o, ~crc(tb.data(), tb.size()));
}
static std::vector<uint8_t> png(int w, int h, const std::vector<uint8_t>& g) {
  std::vector<uint8_t> raw;
  for (int y = 0; y < h; y++) { raw.push_back(0); raw.insert(raw.end(), g.begin() + static_cast<size_t>(y) * w, g.begin() + static_cast<size_t>(y + 1) * w); }
  std::vector<uint8_t> z{0x78, 0x01};
  uint32_t a = 1, b = 0;
  for (uint8_t c : raw) { a = (a + c) % 65521; b = (b + a) % 65521; }
  for (size_t i = 0; i < raw.size(); i += 65535) {
    size_t n = std::min<size_t>(65535, raw.size() - i);
    z.push_back(i + n >= raw.size()); z.push_back(n & 255); z.push_back(n >> 8); z.push_back(~n & 255); z.push_back((~n >> 8) & 255);
    z.insert(z.end(), raw.begin() + i, raw.begin() + i + n);
  }
  be32(z, (b << 16) | a);
  std::vector<uint8_t> o{0x89, 'P', 'N', 'G', 13, 10, 26, 10}, ih;
  be32(ih, w); be32(ih, h); ih.insert(ih.end(), {8, 0, 0, 0, 0});
  chunk(o, "IHDR", ih); chunk(o, "IDAT", z); chunk(o, "IEND", {});
  return o;
}

// draws the lines (baseline at top + ascent) into a w x h image, black on white
static void check(const char* name, const std::vector<Face*>& faces, const std::vector<Line>& lines, float px, int w, int h) {
  std::vector<uint8_t> img(static_cast<size_t>(w) * h, 255);
  float lineH = faces[0]->ascent(px) + faces[0]->descent(px) + 4, y = 4 + faces[0]->ascent(px);
  for (const Line& ln : lines) {
    float x = 8;
    for (const Run& r : ln.runs) for (const Glyph& g : r.glyphs) {
      Bitmap bm;
      if (rasterize(*faces[g.face], g.gid, px, bm)) {
        int ox = static_cast<int>(x + g.x) + bm.left, oy = static_cast<int>(y + g.y) - bm.top;
        for (int j = 0; j < bm.h; j++) for (int i = 0; i < bm.w; i++) {
          int X = ox + i, Y = oy + j;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          int v = 255 - bm.a[static_cast<size_t>(j) * bm.w + i];
          uint8_t& d = img[static_cast<size_t>(Y) * w + X]; if (v < d) d = static_cast<uint8_t>(v);
        }
      }
      x += g.advance;
    }
    y += lineH;
  }
  std::vector<uint8_t> out = png(w, h, img);
  std::string path = goldenDir + "/" + name + ".png";
  if (update) { std::ofstream(path, std::ios::binary).write(reinterpret_cast<const char*>(out.data()), static_cast<std::streamsize>(out.size())); return; }
  std::vector<uint8_t> want = readFile(path);
  CHECK(want == out, "%s: the image differs from %s (run with --update after checking it)", name, path.c_str());
}

static size_t glyphs(const std::vector<Line>& ls) { size_t n = 0; for (auto& l : ls) for (auto& r : l.runs) n += r.glyphs.size(); return n; }

int main(int argc, char** argv) {
  dataDir = argc > 1 ? argv[1] : "tests/data"; goldenDir = argc > 2 ? argv[2] : "tests/golden/text";
  update = argc > 3 && !std::strcmp(argv[3], "--update");
  Font inter = load("Inter-Regular.ttf"), ar = load("NotoSansArabic.ttf"), he = load("NotoSansHebrew.ttf"), dev = load("NotoSansDevanagari.ttf"), emo = load("NotoEmoji.ttf");
  std::vector<Face*> all{inter.face.get(), ar.face.get(), he.face.get(), dev.face.get(), emo.face.get()};
  Options o; o.size = 28;

  // kerning: AV is narrower shaped than the sum of its letters
  { float a = layout(all, "A", o)[0].width, v = layout(all, "V", o)[0].width, av = layout(all, "AV", o)[0].width;
    CHECK(av < a + v - 0.5f, "AV (%.2f) is not kerned against A+V (%.2f)", av, a + v);
    check("kerning", all, layout(all, "AVAWAY To Ty Te", o), 28, 330, 44); }
  // Arabic: right-to-left run, joining forms (the shaped glyph ids differ from the isolated ones), the whole text is one run
  { auto ls = layout(all, "\xd9\x85\xd8\xb1\xd8\xad\xd8\xa8\xd8\xa7 \xd8\xa8\xd8\xa7\xd9\x84\xd8\xb9\xd8\xa7\xd9\x84\xd9\x85", o);
    CHECK(ls.size() == 1 && !ls[0].runs.empty() && ls[0].runs[0].rtl, "Arabic is not a right-to-left run");
    CHECK(ls[0].runs[0].face == 1, "Arabic did not take the Arabic face");
    check("arabic", all, ls, 28, 330, 56); }
  // Hebrew between Latin words: the visual order of the runs is abc, Hebrew (reversed), def
  { auto ls = layout(all, "abc \xd7\xa9\xd7\x9c\xd7\x95\xd7\x9d def", o);
    bool ok = ls.size() == 1 && ls[0].runs.size() == 3 && !ls[0].runs[0].rtl && ls[0].runs[1].rtl && !ls[0].runs[2].rtl && ls[0].runs[1].face == 2;
    CHECK(ok, "mixed Hebrew and Latin text is not three runs in order");
    // in a right-to-left paragraph the first word is on the right and the Latin word that follows it on the left
    Options r = o; r.dir = Direction::Rtl;
    auto rl = layout(all, "\xd7\xa9\xd7\x9c\xd7\x95\xd7\x9d abc", r);
    CHECK(rl.size() == 1 && rl[0].runs.size() == 2 && !rl[0].runs[0].rtl && rl[0].runs[1].rtl, "in an RTL paragraph the Latin word is not on the left");
    check("hebrew", all, ls, 28, 250, 44); }
  // Devanagari: conjuncts and matras make fewer glyphs than characters
  { const char* t = "\xe0\xa4\xb9\xe0\xa4\xbf\xe0\xa4\xa8\xe0\xa5\x8d\xe0\xa4\xa6\xe0\xa5\x80 \xe0\xa4\xa8\xe0\xa4\xae\xe0\xa4\xb8\xe0\xa5\x8d\xe0\xa4\xa4\xe0\xa5\x87";
    auto ls = layout(all, t, o);
    CHECK(glyphs(ls) > 0 && glyphs(ls) < 14, "Devanagari: %zu glyphs for 14 characters", glyphs(ls));
    check("devanagari", all, ls, 28, 280, 56); }
  // a ZWJ emoji sequence (man, woman, girl) is one glyph where the font has the ligature
  { auto ls = layout(all, "\xf0\x9f\x91\xa8\xe2\x80\x8d\xf0\x9f\x91\xa9\xe2\x80\x8d\xf0\x9f\x91\xa7 \xf0\x9f\x98\x80", o);
    CHECK(glyphs(ls) <= 3, "the ZWJ family is %zu glyphs", glyphs(ls));
    check("emoji_zwj", all, ls, 28, 160, 44); }
  // CJK: a break may fall between any two ideographs, never before the full stop
  { const char* t = "\xe4\xbb\x8a\xe6\x97\xa5\xe3\x81\xaf\xe5\xa4\xa9\xe6\xb0\x97\xe3\x81\x8c\xe3\x81\x84\xe3\x81\x84\xe3\x81\xa7\xe3\x81\x99\xe3\x81\xad\xe3\x80\x82\xe6\x98\x8e\xe6\x97\xa5\xe3\x82\x82\xe6\x99\xb4\xe3\x82\x8c\xe3\x82\x8b\xe3\x81\xa7\xe3\x81\x97\xe3\x82\x87\xe3\x81\x86";
    Options c = o; c.lang = "ja"; c.maxWidth = 180;
    auto ls = layout(all, t, c);
    CHECK(ls.size() >= 3, "CJK text wrapped into %zu lines", ls.size());
    for (size_t i = 1; i < ls.size(); i++) CHECK(std::strncmp(t + ls[i].begin, "\xe3\x80\x82", 3) != 0, "line %zu starts with the full stop", i);
    auto br = breakOpportunities(t, "ja");
    CHECK(br[2] && br[5] && !br[std::strlen("\xe4\xbb\x8a\xe6\x97\xa5\xe3\x81\xaf\xe5\xa4\xa9\xe6\xb0\x97\xe3\x81\x8c\xe3\x81\x84\xe3\x81\x84\xe3\x81\xa7\xe3\x81\x99\xe3\x81\xad") - 1], "CJK break opportunities are wrong");
    check("cjk_wrap", all, ls, 28, 220, 140); }
  // Latin wrapping at spaces, trailing spaces do not count
  { Options w = o; w.maxWidth = 200;
    auto ls = layout(all, "The quick brown fox jumps over the lazy dog", w);
    CHECK(ls.size() >= 3, "Latin text wrapped into %zu lines", ls.size());
    for (auto& l : ls) CHECK(l.width <= 200 + 40, "a line is %.1f wide", l.width);
    check("wrap_latin", all, ls, 28, 230, 140); }
  if (failures) { std::printf("%d failures\n", failures); return 1; }
  std::printf("all checks passed\n");
  return 0;
}
