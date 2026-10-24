#pragma once
// The shortest text of a double that reads back as the same value: std::to_chars (the C++ library's Ryu) where the library has it for
// doubles, else the fewest correctly rounded digits found with snprintf and checked with strtod: ps2dev's libstdc++, and Apple's libc++
// before macOS 13.3 / iOS 16.3, which ships the floating to_chars only from those systems (the Intel build goes down to macOS 12).
// ponytail: the fallback tries up to 17 precisions; QuickJS-ng's dtoa when an old system formats numbers in a hot loop.
#include <charconv>
#include <cstdio>
#include <cstdlib>

#if (defined(_GLIBCXX_RELEASE) && !defined(__cpp_lib_to_chars)) || \
    (defined(__ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__) && __ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__ < 130300) || \
    (defined(__ENVIRONMENT_IPHONE_OS_VERSION_MIN_REQUIRED__) && __ENVIRONMENT_IPHONE_OS_VERSION_MIN_REQUIRED__ < 160300)
#define ZN_SHORTEST_SNPRINTF 1
#endif

namespace zn {

/** Writes `v` into [b, e) and returns the end: "d.ddde+XX" when `scientific`, else the shorter of the plain and the scientific forms
 *  (to_chars's general shortest; the fallback's %g picks by exponent, so the two may differ in form, never in value). Finite values. */
inline char* shortestDouble(char* b, char* e, double v, bool scientific) {
#ifdef ZN_SHORTEST_SNPRINTF
  int n = 0;
  for (int p = scientific ? 0 : 1; p <= 17; ++p) {
    n = std::snprintf(b, static_cast<std::size_t>(e - b), scientific ? "%.*e" : "%.*g", p, v);
    if (std::strtod(b, nullptr) == v) break;
  }
  return b + (n < e - b ? n : e - b - 1);
#else
  return (scientific ? std::to_chars(b, e, v, std::chars_format::scientific) : std::to_chars(b, e, v)).ptr;
#endif
}

}  // namespace zn
