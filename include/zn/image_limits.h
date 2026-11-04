#pragma once
#include <stdint.h>
namespace zn {
inline constexpr int32_t kRuntimeImageMaxSide = 16384;
inline constexpr uint64_t kDecodedImageMaxPixels = uint64_t{1} << 24;
}
