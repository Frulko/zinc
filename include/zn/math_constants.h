#pragma once
#include <string_view>

namespace zn {
struct MathConstant { std::string_view name; double value; };
inline constexpr MathConstant mathConstants[] = {
  {"E", 2.71828182845904523536}, {"LN10", 2.30258509299404568402},
  {"LN2", 0.69314718055994530942}, {"LOG10E", 0.43429448190325182765},
  {"LOG2E", 1.44269504088896340736}, {"PI", 3.14159265358979323846},
  {"SQRT1_2", 0.70710678118654752440}, {"SQRT2", 1.41421356237309504880},
};
}
