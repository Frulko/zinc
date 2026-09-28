// String operations on arbitrary bytes (invalid UTF-8, lone surrogates, truncated sequences): UTF-16 indexing,
// slicing, searching and case mapping must stay inside the buffer (runtime/zrt.cpp).
#include "fuzz.h"
using zrt::String;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n < 2 || n > 4096) return 0;
  int32_t k = (int8_t)d[0], m = (int8_t)d[1];  // indices, negative included
  String s = zfuzz::str(d + 2, n - 2), needle = zfuzz::str(d + 2, (n - 2) / 4);
  int32_t len = s.length();
  int64_t sum = 0;
  for (int32_t i = -2; i <= len + 1; i++) sum += s.charCodeAt(i) + s.at(i).bytes();
  sum += s.slice(k).bytes() + s.slice(k, m).bytes() + s.substring(k, m).bytes() + s.substring(m).bytes();
  sum += s.indexOf(needle, k) + s.lastIndexOf(needle, m) + (s.includes(needle) ? 1 : 0);
  sum += s.split(needle).length() + s.trim().bytes() + s.toUpperCase().bytes() + s.toLowerCase().bytes();
  sum += s.padStart(len + (m & 15), needle).bytes() + s.padEnd(len + (k & 15)).bytes() + s.repeat(k & 3).bytes();
  sum += s.replace(needle, s.slice(0, 3)).bytes() + s.replaceAll(needle, s.slice(0, 3)).bytes();
  sum += zrt::parse_int(s, (k & 31) + 2) == 0 ? 1 : 0;
  sum += zrt::parse_float(s) == 0 ? 1 : 0;
  String c = zrt::cat(s, needle, (double)k, m);
  sum += c.bytes() + zrt::str_cmp(s, needle) + (int32_t)zrt::hash(s);
  if (sum == 0x7fffffffffffLL) __builtin_trap();  // keep the work observable
  return 0;
}
