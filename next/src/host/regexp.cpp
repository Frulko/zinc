#include "regexp.h"

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <vector>

extern "C" {
#include "libregexp.h"
void zn_lre_begin(void);
}

namespace zn::re {
namespace {

struct Prog {
  std::vector<uint8_t> bc;
  int captures = 1, alloc = 2;
  std::vector<std::string> names;
};
std::vector<std::unique_ptr<Prog>> gProgs;
std::map<std::string, int> gCache;
std::string gError;
std::vector<int> gCaps;
std::vector<int> gAll;

// The UTF-16 form of the last subject: a loop of matches over one string converts it once.
std::string gLastUtf8;
std::vector<uint16_t> gLast16;

void toUtf16(const std::string& s, std::vector<uint16_t>& out) {
  out.clear();
  out.reserve(s.size());
  for (size_t i = 0; i < s.size();) {
    unsigned char c = static_cast<unsigned char>(s[i]);
    uint32_t cp = 0xFFFD;
    size_t len = 1;
    if (c < 0x80) cp = c;
    else if (c >= 0xC2 && c <= 0xDF && i + 1 < s.size()) { cp = ((c & 0x1Fu) << 6) | (static_cast<unsigned char>(s[i + 1]) & 0x3Fu); len = 2; }
    else if (c >= 0xE0 && c <= 0xEF && i + 2 < s.size()) { cp = ((c & 0x0Fu) << 12) | ((static_cast<unsigned char>(s[i + 1]) & 0x3Fu) << 6) | (static_cast<unsigned char>(s[i + 2]) & 0x3Fu); len = 3; }
    else if (c >= 0xF0 && c <= 0xF4 && i + 3 < s.size()) { cp = ((c & 0x07u) << 18) | ((static_cast<unsigned char>(s[i + 1]) & 0x3Fu) << 12) | ((static_cast<unsigned char>(s[i + 2]) & 0x3Fu) << 6) | (static_cast<unsigned char>(s[i + 3]) & 0x3Fu); len = 4; }
    i += len;
    if (cp >= 0x10000) { cp -= 0x10000; out.push_back(static_cast<uint16_t>(0xD800 + (cp >> 10))); out.push_back(static_cast<uint16_t>(0xDC00 + (cp & 0x3FF))); }
    else out.push_back(static_cast<uint16_t>(cp));
  }
}

}  // namespace

const std::string& error() { return gError; }

int compile(const std::string& source, const std::string& flags) {
  std::string key = flags + "/" + source;
  auto hit = gCache.find(key);
  if (hit != gCache.end()) return hit->second;
  int f = 0;
  for (char c : flags) {
    switch (c) {
      case 'g': f |= LRE_FLAG_GLOBAL; break;
      case 'i': f |= LRE_FLAG_IGNORECASE; break;
      case 'm': f |= LRE_FLAG_MULTILINE; break;
      case 's': f |= LRE_FLAG_DOTALL; break;
      case 'u': f |= LRE_FLAG_UNICODE; break;
      case 'v': f |= LRE_FLAG_UNICODE_SETS; break;
      case 'y': f |= LRE_FLAG_STICKY; break;
      case 'd': f |= LRE_FLAG_INDICES; break;
      default: break;
    }
  }
  char msg[160] = "";
  int len = 0;
  zn_lre_begin();
  uint8_t* bc = lre_compile(&len, msg, sizeof msg, source.data(), source.size(), f, nullptr);
  if (!bc) { gError = msg[0] ? msg : "invalid pattern"; return -1; }
  auto p = std::make_unique<Prog>();
  p->bc.assign(bc, bc + len);
  std::free(bc);
  p->captures = lre_get_capture_count(p->bc.data());
  p->alloc = lre_get_alloc_count(p->bc.data());
  p->names.assign(static_cast<size_t>(p->captures), std::string());
  if (const char* g = lre_get_groupnames(p->bc.data())) {
    for (int i = 1; i < p->captures; ++i) {
      p->names[static_cast<size_t>(i)] = g;
      g += std::strlen(g) + LRE_GROUP_NAME_TRAILER_LEN;
    }
  }
  gProgs.push_back(std::move(p));
  int h = static_cast<int>(gProgs.size()) - 1;
  gCache[key] = h;
  return h;
}

int captureCount(int h) { return h >= 0 && static_cast<size_t>(h) < gProgs.size() ? gProgs[static_cast<size_t>(h)]->captures : 1; }
std::string groupName(int h, int i) {
  if (h < 0 || static_cast<size_t>(h) >= gProgs.size()) return "";
  const Prog& p = *gProgs[static_cast<size_t>(h)];
  return i >= 0 && static_cast<size_t>(i) < p.names.size() ? p.names[static_cast<size_t>(i)] : "";
}

int exec(int h, const char* utf8, size_t size, int from) {
  if (h < 0 || static_cast<size_t>(h) >= gProgs.size()) { gError = "no such regular expression"; return -1; }
  const Prog& p = *gProgs[static_cast<size_t>(h)];
  if (gLastUtf8.size() != size || std::memcmp(gLastUtf8.data(), utf8, size) != 0) { gLastUtf8.assign(utf8, size); toUtf16(gLastUtf8, gLast16); }
  int n = static_cast<int>(gLast16.size());
  gCaps.assign(static_cast<size_t>(p.captures) * 2, -1);
  if (from < 0) from = 0;
  if (from > n) return 0;
  std::vector<uint8_t*> cap(static_cast<size_t>(p.alloc > 0 ? p.alloc : 2), nullptr);
  static const uint16_t kEmpty = 0;
  const uint8_t* base = reinterpret_cast<const uint8_t*>(n ? gLast16.data() : &kEmpty);
  zn_lre_begin();
  int rc = lre_exec(cap.data(), p.bc.data(), base, from, n, 1, nullptr);
  if (rc == 1) {
    for (int i = 0; i < p.captures; ++i)
      if (cap[static_cast<size_t>(2 * i)] && cap[static_cast<size_t>(2 * i + 1)]) {
        gCaps[static_cast<size_t>(2 * i)] = static_cast<int>((cap[static_cast<size_t>(2 * i)] - base) >> 1);
        gCaps[static_cast<size_t>(2 * i + 1)] = static_cast<int>((cap[static_cast<size_t>(2 * i + 1)] - base) >> 1);
      }
    return 1;
  }
  if (rc == 0) return 0;
  gError = rc == LRE_RET_TIMEOUT ? "regular expression took too long (catastrophic backtracking?)" : rc == LRE_RET_MEMORY_ERROR ? "out of memory in regular expression" : "corrupted regular expression";
  return -1;
}

int execAll(int h, const char* utf8, size_t size, int from) {
  if (h < 0 || static_cast<size_t>(h) >= gProgs.size()) { gError = "no such regular expression"; return -1; }
  const Prog& p = *gProgs[static_cast<size_t>(h)];
  if (gLastUtf8.size() != size || std::memcmp(gLastUtf8.data(), utf8, size) != 0) { gLastUtf8.assign(utf8, size); toUtf16(gLastUtf8, gLast16); }
  int n = static_cast<int>(gLast16.size());
  gAll.clear();
  if (from < 0) from = 0;
  std::vector<uint8_t*> cap(static_cast<size_t>(p.alloc > 0 ? p.alloc : 2), nullptr);
  static const uint16_t kEmpty = 0;
  const uint8_t* base = reinterpret_cast<const uint8_t*>(n ? gLast16.data() : &kEmpty);
  bool uni = (lre_get_flags(p.bc.data()) & (LRE_FLAG_UNICODE | LRE_FLAG_UNICODE_SETS)) != 0;
  int count = 0;
  zn_lre_begin();
  while (from <= n) {
    int rc = lre_exec(cap.data(), p.bc.data(), base, from, n, 1, nullptr);
    if (rc < 0) { gError = rc == LRE_RET_TIMEOUT ? "regular expression took too long (catastrophic backtracking?)" : rc == LRE_RET_MEMORY_ERROR ? "out of memory in regular expression" : "corrupted regular expression"; return -1; }
    if (rc == 0) break;
    for (int i = 0; i < p.captures; ++i) {
      bool taken = cap[static_cast<size_t>(2 * i)] && cap[static_cast<size_t>(2 * i + 1)];
      gAll.push_back(taken ? static_cast<int>((cap[static_cast<size_t>(2 * i)] - base) >> 1) : -1);
      gAll.push_back(taken ? static_cast<int>((cap[static_cast<size_t>(2 * i + 1)] - base) >> 1) : -1);
    }
    ++count;
    int a = gAll[gAll.size() - 2 * static_cast<size_t>(p.captures)], b = gAll[gAll.size() - 2 * static_cast<size_t>(p.captures) + 1];
    from = b;
    if (b == a) {
      from = b + 1;
      if (uni && b + 1 < n && gLast16[static_cast<size_t>(b)] >= 0xD800 && gLast16[static_cast<size_t>(b)] < 0xDC00 && gLast16[static_cast<size_t>(b) + 1] >= 0xDC00 && gLast16[static_cast<size_t>(b) + 1] < 0xE000) from = b + 2;
    }
  }
  return count;
}
int allCapture(int k) { return k >= 0 && static_cast<size_t>(k) < gAll.size() ? gAll[static_cast<size_t>(k)] : -1; }

int capture(int i) { return i >= 0 && static_cast<size_t>(i) < gCaps.size() ? gCaps[static_cast<size_t>(i)] : -1; }

}  // namespace zn::re
