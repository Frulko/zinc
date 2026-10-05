#pragma once
// ZBC interpreter: the reference semantics. Computed-goto dispatch, an explicit call stack (no C++ recursion), typed
// operations with no tag checks: it trusts zbc::verify(), so callers must verify a module before running it.
#include <string>

#include "zbc/zbc.h"
#include "zn/limits.h"
#include "zn/value.h"

namespace zn::vm {

struct Result {
  bool ok = true;
  std::string error;  // runtime error: division by zero, stack overflow, trap, uncaught throw
};

// Runs functions[0] (main). Program output (console.log) is appended to `out`, also when execution fails midway.
Result run(const zbc::Module& m, std::string& out);

// ECMAScript Number::toString for a double (shortest round-trip digits, JS exponent thresholds).
std::string numberToString(double v);

}  // namespace zn::vm
