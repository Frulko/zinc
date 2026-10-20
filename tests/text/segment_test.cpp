// Segmentation (ZN-165): line break opportunities (UAX #14), grapheme cursor steps over ZWJ emoji and combining marks, UTF-8 and UTF-16 agree.
#include <cstdio>
#include <string>
#include "text/segment.h"
using namespace zn::text;
static int fails = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FAIL line %d: %s\n", __LINE__, #c); ++fails; } } while (0)

int main() {
  auto lines = boundaries(std::string_view("hello big-world 日本語"), Seg::Line);
  // opportunities after "hello ", after "big-", after "world ", and between the CJK characters
  CHECK((lines == std::vector<uint32_t>{6, 10, 16, 19, 22, 25}));
  CHECK(boundaries(std::string_view("a\nb"), Seg::Line).size() == 2);   // the newline is a mandatory break after it
  std::string fam = "\xF0\x9F\x91\xA8\xE2\x80\x8D\xF0\x9F\x91\xA9\xE2\x80\x8D\xF0\x9F\x91\xA7";   // man ZWJ woman ZWJ girl: one cursor step
  std::string s = "a" + fam + "e\xCC\x81z";
  CHECK(nextGrapheme(s, 0) == 1);
  CHECK(nextGrapheme(s, 1) == 1 + fam.size());
  CHECK(nextGrapheme(s, 1 + fam.size()) == 1 + fam.size() + 3);   // e + U+0301
  CHECK(prevGrapheme(s, 1 + fam.size()) == 1);
  CHECK(prevGrapheme(s, s.size()) == s.size() - 1);
  CHECK(nextGrapheme(s, s.size()) == s.size() && prevGrapheme(s, 0) == 0);
  CHECK((boundaries(std::u16string_view(u"a\U0001F44Db"), Seg::Grapheme) == std::vector<uint32_t>{1, 3, 4}));
  CHECK(boundaries(std::string_view(""), Seg::Word).empty());
  std::printf(fails ? "segment_test: %d failed\n" : "segment_test ok\n", fails);
  return fails != 0;
}
