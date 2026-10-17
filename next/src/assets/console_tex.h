#pragma once
#include <cstdint>
#include <vector>

namespace zn::assets {

/** PSP CLUT8 swizzle: reorder a width*height 8-bit buffer into the GE's swizzled layout (and back). Round-trips. */
void pspSwizzle8(std::vector<std::uint8_t>& buf, int width, int height);
void pspUnswizzle8(std::vector<std::uint8_t>& buf, int width, int height);

}  // namespace zn::assets