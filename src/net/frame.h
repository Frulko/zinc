#pragma once
// The frames inside the TLS sessions of `zinc agent` and zinc:link: one byte of type, four bytes of length (big endian), the payload.
#include <cstddef>
#include <string>
#include <string_view>

namespace zn::net {

inline std::string frame(char type, std::string_view payload) {
  std::string f;
  f.reserve(5 + payload.size());
  f.push_back(type);
  for (int shift = 24; shift >= 0; shift -= 8) f.push_back(static_cast<char>((payload.size() >> shift) & 0xff));
  f.append(payload);
  return f;
}

/** Takes one whole frame from the front of `in`; false while it is not all there, or (`bad` set) when it says it is longer than `max`. */
inline bool takeFrame(std::string& in, std::size_t max, char& type, std::string& payload, bool* bad = nullptr) {
  if (in.size() < 5) return false;
  const auto* p = reinterpret_cast<const unsigned char*>(in.data());
  const std::size_t n = (static_cast<std::size_t>(p[1]) << 24) | (static_cast<std::size_t>(p[2]) << 16) | (static_cast<std::size_t>(p[3]) << 8) | p[4];
  if (n > max) { if (bad) *bad = true; return false; }
  if (in.size() < 5 + n) return false;
  type = in[0];
  payload.assign(in, 5, n);
  in.erase(0, 5 + n);
  return true;
}

}  // namespace zn::net
