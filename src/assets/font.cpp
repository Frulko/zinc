// The font importer (ZN-442): see font.h. hb-subset trims the file (src/res subsetTtf), HarfBuzz draws each glyph's outline into msdfgen's
// shape, msdfgen computes its distance field, and the cells go on one atlas page, row by row.
#include "assets/font.h"

#include "assets/model.h"
#include "assets/sprite.h"
#include "res/res.h"
#include "zn/msdf.h"

#include "text/module.h"


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
    if (!text::module().msdfAtlas(entries[0].data, cps, static_cast<int>(size), zim, table, err)) return false;
    entries.push_back({name + ".msdf", 1, 0, 0, std::move(zim)});
    entries.push_back({name + ".msdf.json", 0, 0, 0, std::move(table)});
  }
  out = bundleOf(entries);
  return true;
}


}  // namespace zn::assets
