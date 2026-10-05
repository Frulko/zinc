#pragma once
// Limits shared by compiler and VM. The only place a limit is defined (see ARCHITECTURE.md).
#include <cstdint>

namespace zn {

// ponytail: placeholder, the old tree disagrees (VM 1024, compiler 16383); decide with the measured fib depth in ZN-010.
inline constexpr std::uint32_t kMaxCallDepth = 1024;
inline constexpr std::uint32_t kMaxRegisters = 256;

}  // namespace zn
