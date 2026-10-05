#pragma once
// ZBC opcodes, defined once as an X-macro so the emitter, the interpreter and the disassembler cannot drift.
// Stub set: ZN-009 extends it.
#include <cstdint>

#define ZN_OPCODES(X) \
  X(Nop)              \
  X(LoadInt)          \
  X(Add)              \
  X(Call)             \
  X(Ret)

namespace zn {

enum class Op : std::uint8_t {
#define X(name) name,
  ZN_OPCODES(X)
#undef X
  Count
};

inline constexpr const char* kOpNames[] = {
#define X(name) #name,
    ZN_OPCODES(X)
#undef X
};

}  // namespace zn
