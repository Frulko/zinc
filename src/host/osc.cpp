#include "osc.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace zn::osc {
namespace {

void padStr(std::string& b, const std::string& s) {
  b += s;
  b += '\0';
  while (b.size() % 4) b += '\0';
}
void be32(std::string& b, uint32_t v) {
  char c[4] = {static_cast<char>(v >> 24), static_cast<char>(v >> 16), static_cast<char>(v >> 8), static_cast<char>(v)};
  b.append(c, 4);
}
uint32_t rd32(const uint8_t* p) { return uint32_t(p[0]) << 24 | uint32_t(p[1]) << 16 | uint32_t(p[2]) << 8 | p[3]; }
uint64_t rd64(const uint8_t* p) { return uint64_t(rd32(p)) << 32 | rd32(p + 4); }

// A NUL-terminated string at off; returns the offset after its padding, or -1 when it does not end inside the buffer.
long strAt(const uint8_t* p, size_t n, size_t off, std::string* out) {
  size_t e = off;
  while (e < n && p[e]) e++;
  if (e >= n) return -1;
  out->assign(reinterpret_cast<const char*>(p) + off, e - off);
  return static_cast<long>((e + 4) & ~size_t(3));
}
std::string num(double v) {
  char b[40];
  std::snprintf(b, sizeof b, "n:%.17g", v);
  return b;
}

bool message(const uint8_t* buf, size_t n, std::vector<std::string>& out) {
  std::string address, tags;
  long off = strAt(buf, n, 0, &address);
  if (off < 0 || address.empty() || address[0] != '/') return false;
  off = strAt(buf, n, static_cast<size_t>(off), &tags);
  if (off < 0 || tags.empty() || tags[0] != ',') return false;
  std::string packed = address;
  size_t o = static_cast<size_t>(off);
  for (size_t t = 1; t < tags.size(); t++) {
    char c = tags[t];
    if ((c == 'i' || c == 'c') && o + 4 <= n) { packed += '\x1e' + num(c == 'i' ? double(int32_t(rd32(buf + o))) : double(rd32(buf + o))); o += 4; }
    else if (c == 'f' && o + 4 <= n) { uint32_t u = rd32(buf + o); float f; std::memcpy(&f, &u, 4); packed += '\x1e' + num(f); o += 4; }
    else if (c == 'd' && o + 8 <= n) { uint64_t u = rd64(buf + o); double d; std::memcpy(&d, &u, 8); packed += '\x1e' + num(d); o += 8; }
    else if (c == 'h' && o + 8 <= n) { packed += '\x1e' + num(double(int64_t(rd64(buf + o)))); o += 8; }
    else if (c == 't' && o + 8 <= n) { packed += '\x1e' + num(double(rd64(buf + o))); o += 8; }
    else if (c == 'T' || c == 'F') packed += '\x1e' + num(c == 'T' ? 1 : 0);
    else if (c == 'N' || c == 'I') continue;
    else if (c == 'r' && o + 4 <= n) { for (int k = 0; k < 4; k++) packed += '\x1e' + num(buf[o + k]); o += 4; }   // RGBA colour: four numbers 0..255
    else if (c == 's' || c == 'S') { std::string s; long e = strAt(buf, n, o, &s); if (e < 0) break; packed += "\x1es:" + s; o = static_cast<size_t>(e); }
    else if (c == 'b' && o + 4 <= n) { size_t len = rd32(buf + o); if (len > n - o - 4) break; o += 4 + ((len + 3) & ~size_t(3)); }
    else break;
  }
  out.push_back(std::move(packed));
  return true;
}

void packet(const uint8_t* buf, size_t n, std::vector<std::string>& out, int depth) {
  if (n >= 16 && std::memcmp(buf, "#bundle", 8) == 0) {   // "#bundle\0", a timetag, then size-prefixed elements
    if (depth > 8) return;
    size_t o = 16;
    while (o + 4 <= n) {
      size_t len = rd32(buf + o);
      o += 4;
      if (len > n - o) return;
      packet(buf + o, len, out, depth + 1);
      o += len;
    }
    return;
  }
  message(buf, n, out);
}

}  // namespace

std::string encode(const std::string& packed) {
  std::vector<std::string> parts;
  size_t s = 0;
  for (;;) {
    size_t e = packed.find('\x1e', s);
    parts.push_back(packed.substr(s, e == std::string::npos ? e : e - s));
    if (e == std::string::npos) break;
    s = e + 1;
  }
  std::string tags = ",", body;
  for (size_t i = 1; i < parts.size(); i++) {
    const std::string& p = parts[i];
    if (p.size() < 2) continue;
    if (p[0] == 's') { tags += 's'; padStr(body, p.substr(2)); continue; }
    double v = std::strtod(p.c_str() + 2, nullptr);
    if (v == std::floor(v) && std::fabs(v) <= 2147483647.0) { tags += 'i'; be32(body, uint32_t(int32_t(v))); }
    else { float f = static_cast<float>(v); uint32_t u; std::memcpy(&u, &f, 4); tags += 'f'; be32(body, u); }
  }
  std::string b;
  padStr(b, parts[0]);
  padStr(b, tags);
  return b + body;
}

std::vector<std::string> decode(const uint8_t* buf, size_t n) {
  std::vector<std::string> out;
  packet(buf, n, out, 0);
  return out;
}

}  // namespace zn::osc
