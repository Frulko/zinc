#pragma once
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <stdexcept>
namespace zinc {
inline std::chrono::steady_clock::time_point deadline() {
  double ms = 60000;
  if (const char* s = std::getenv("ZINC_EXECUTION_TIMEOUT_MS")) {
    char* end; ms = std::strtod(s, &end);
    if (end == s || *end || !std::isfinite(ms) || ms < 0 || ms > 86400000)
      throw std::runtime_error("ZINC_EXECUTION_TIMEOUT_MS must be between 0 and 86400000 (0 disables the timeout)");
  }
  return ms == 0 ? std::chrono::steady_clock::time_point::max() : std::chrono::steady_clock::now() + std::chrono::milliseconds((int64_t)ms);
}
}
