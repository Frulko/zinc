#include "zbc/zbc.h"

namespace zn::zbc {

bool fits(std::uint32_t registers, std::uint32_t callDepth) {
  return registers <= kMaxRegisters && callDepth <= kMaxCallDepth;
}

std::vector<Op> stubProgram() { return {Op::LoadInt, Op::LoadInt, Op::Add, Op::Ret}; }

}  // namespace zn::zbc
