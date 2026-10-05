#pragma once
// Stub of the bytecode emitter. Replaced by the real one in ZN-009.
#include <cstdint>
#include <vector>

#include "zn/limits.h"
#include "zn/opcodes.h"

namespace zn::zbc {

// Refuses programs the VM could not hold: depth and register count come from zn/limits.h.
bool fits(std::uint32_t registers, std::uint32_t callDepth);
std::vector<Op> stubProgram();

}  // namespace zn::zbc
