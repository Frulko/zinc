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
  std::string trace;       // with traceFree: one `free <class>` line per destroyed object, in destruction order
  std::size_t leaked = 0;  // objects still alive after main returned and the globals were released (cycles, or a bug)
};

// Runs functions[0] (main). Program output (console.log) is appended to `out`, also when execution fails midway.
// `traceFree` prints one line per destroyed object (its class) to `out` after the program's own output lines.
Result run(const zbc::Module& m, std::string& out, bool traceFree = false);

}  // namespace zn::vm
