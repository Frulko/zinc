#pragma once
// ZBC interpreter: the reference semantics. Computed-goto dispatch, an explicit call stack (no C++ recursion), typed
// operations with no tag checks: it trusts zbc::verify(), so callers must verify a module before running it.
#include <string>

#include "rt/rt.h"
#include "zbc/zbc.h"
#include "zn/limits.h"
#include "zn/value.h"

namespace zn::vm {

using zn::rt::Result;

// Runs functions[0] (main). Program output (console.log) is appended to `out`, also when execution fails midway.
// `traceFree` prints one line per destroyed object (its class) to `out` after the program's own output lines.
Result run(const zbc::Module& m, std::string& out, bool traceFree = false);

}  // namespace zn::vm
