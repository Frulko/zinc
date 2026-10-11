#pragma once
// Limits shared by compiler and VM. The only place a limit is defined (see ARCHITECTURE.md).
#include <cstdint>

namespace zn {

// Decided in ZN-010: the old tree disagreed (VM 1024, compiler 16383). 10000 frames covers deep but sane recursion; the
// VM also bounds the register stack, so frames with many registers overflow earlier.
inline constexpr std::uint32_t kMaxCallDepth = 10000;
inline constexpr std::uint32_t kMaxRegisters = 256;       // register operands are 8 bits
inline constexpr std::uint32_t kMaxCodeWords = 65535;     // conditional jump targets are 16 bits
inline constexpr std::uint32_t kMaxFunctions = 65535;     // Call's function operand is 16 bits
inline constexpr std::uint32_t kMaxConsts = 65535;        // LoadK's pool index is 16 bits
inline constexpr std::uint32_t kMaxClasses = 60000;       // class ids are 16 bits (register states use 16)
inline constexpr std::uint32_t kMaxStrings = 65535;      // LoadStr's string index is 16 bits
inline constexpr std::uint32_t kMaxFields = 255;           // GetField/SetField index is 8 bits
// The web environment refuses a larger image before its pixels are allocated (src/qjs/webenv.cpp): the file may come from a network, and
// its header alone can ask for gigabytes. 2^26 pixels is 8192 x 8192, 256 MiB of RGBA: above any texture a game loads.
inline constexpr std::int64_t kMaxImagePixels = std::int64_t{1} << 26;
// The largest data alignment of a ZPK pack (src/zpk, docs/zpk.md): a power of two up to 1 MiB (4 KiB and 2 KiB sectors fit well under it).
inline constexpr std::uint32_t kMaxPackAlignment = 1u << 20;

}  // namespace zn
