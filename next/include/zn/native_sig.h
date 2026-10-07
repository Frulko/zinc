#pragma once
// The part of a native export's signature ("params>result", include/zn/native.h) that a program can call today: scalars (i u b d), strings (s),
// arrays of u8 (B), i32 (I) and f64 (D) in and out, no result (n). Callbacks, promises and resources come with the generator (ZN-098).
#include <cstring>
#include <string>

namespace zn::nsig {

inline bool paramLetter(char c) { return c != 0 && std::strchr("siubdBID", c) != nullptr; }
inline bool resultLetter(char c) { return c != 0 && std::strchr("nsiubdBID", c) != nullptr; }
// False when the signature uses anything else.
inline bool parse(const char* sig, std::string& params, char& result) {
  const char* gt = std::strchr(sig, '>');
  if (!gt || gt[1] == 0 || gt[2] != 0 || !resultLetter(gt[1])) return false;
  params.assign(sig, gt);
  for (char c : params) if (!paramLetter(c)) return false;
  result = gt[1];
  return true;
}

}  // namespace zn::nsig
