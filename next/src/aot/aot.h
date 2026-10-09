#pragma once
// ZBC to C++: every function of a verified module becomes a C++ function over the same register window the interpreter uses,
// so the compiled program and the interpreter share the machine, the heap and the runtime calls (src/rt) and the value
// semantics of every operation (include/zn/ops.h). The module is also embedded as bytes: class tables, strings, constants
// and globals load through the same code as in the interpreter.
#include <cstdint>
#include <string>
#include <vector>

#include "zbc/zbc.h"

namespace zn::aot {

// The source of a program that behaves like `zinc run` of the module. Build it with
//   c++ -std=c++20 -O2 -I include -I src program.cpp libzn_rt.a libzn_zbc.a ...
// `resources` (the blob of src/res) is embedded and installed when the program starts, for programs that draw (usesHost).
// rnLayout: the program was compiled for the rn layout engine (Yoga); in classic its layout rows are never called, so the engine is neither installed nor linked (ZN-355).
std::string emitCpp(const zbc::Module& m, const std::vector<std::uint8_t>* resources = nullptr, bool rnLayout = true);
// The same program as up to `maxParts` translation units to compile at once (a large program only, about 2 MB of C++ each); the first has the
// tables and main, the others only functions; with more than one, the functions have external linkage (ZN-604).
std::vector<std::string> emitCppParts(const zbc::Module& m, const std::vector<std::uint8_t>* resources, bool rnLayout, unsigned maxParts);

// Whether the module calls the graphics host (the Rt::Host* entries).
bool usesHost(const zbc::Module& m);
bool usesLayout(const zbc::Module& m);   // the program calls the host layout engine: link zn_layout and zn_yoga

}  // namespace zn::aot
