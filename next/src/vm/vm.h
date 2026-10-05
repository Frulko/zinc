#pragma once
// Stub of the interpreter. Replaced by the real one in ZN-010.
#include <cstdint>
#include <vector>

#include "zn/limits.h"
#include "zn/opcodes.h"
#include "zn/value.h"

namespace zn::vm {

// Number of ops executed before Ret, or -1 if the program is malformed.
int run(const std::vector<Op>& code);

}  // namespace zn::vm
