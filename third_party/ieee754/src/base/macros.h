// Zinc stand-in for V8's src/base/macros.h: the names ieee754.cc and overflowing-math.h use.
#pragma once
#include <bit>
#include <cstdint>
#define V8_INLINE inline __attribute__((always_inline))
#define V8_WARN_UNUSED_RESULT __attribute__((warn_unused_result))
namespace v8::base { using std::bit_cast; }
