#pragma once
// ZBC to C++: every function of a verified module becomes a C++ function over the same register window the interpreter uses,
// so the compiled program and the interpreter share the machine, the heap and the runtime calls (src/rt) and the value
// semantics of every operation (include/zn/ops.h). The module is also embedded as bytes: class tables, strings, constants
// and globals load through the same code as in the interpreter.
#include <string>

#include "zbc/zbc.h"

namespace zn::aot {

// The source of a program that behaves like `zinc run` of the module. Build it with
//   c++ -std=c++20 -O2 -I include -I src program.cpp libzn_rt.a libzn_zbc.a ...
std::string emitCpp(const zbc::Module& m);

}  // namespace zn::aot
