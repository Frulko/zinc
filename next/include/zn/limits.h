#pragma once
// Limits shared by compiler and VM. The only place a limit is defined (see ARCHITECTURE.md).
#include <cstdint>

namespace zn {

// ponytail: placeholder, the old tree disagrees (VM 1024, compiler 16383); decide with the measured fib depth in ZN-010.
inline constexpr std::uint32_t kMaxCallDepth = 1024;
inline constexpr std::uint32_t kMaxRegisters = 256;       // register operands are 8 bits
inline constexpr std::uint32_t kMaxCodeWords = 65535;     // conditional jump targets are 16 bits
inline constexpr std::uint32_t kMaxFunctions = 65535;     // Call's function operand is 16 bits
inline constexpr std::uint32_t kMaxConsts = 65535;        // LoadK's pool index is 16 bits

}  // namespace zn
