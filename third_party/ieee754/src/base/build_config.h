// Zinc stand-in for V8's src/base/build_config.h: ieee754.cc only asks for the compiler family.
#pragma once
#if defined(_MSC_VER) && !defined(__clang__)
#define V8_CC_MSVC 1
#else
#define V8_CC_MSVC 0
#endif
