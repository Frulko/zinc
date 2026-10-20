#pragma once
// Value layout shared by compiler and VM: a 64-bit slot.
#include <cstdint>

namespace zn {

using Slot = std::uint64_t;
inline constexpr unsigned kSlotBytes = sizeof(Slot);
static_assert(kSlotBytes == 8, "ZBC slots are 64-bit");

}  // namespace zn
