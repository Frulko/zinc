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
// `resources` (the blob of src/res) is embedded and installed when the program starts, for programs that draw (usesHost); with `resourcesFile`
// instead, the program reads that file at start, beside its executable or in its .app's Resources (zinc build --no-embed, --bundle).
// rnLayout: the program was compiled for the rn layout engine (Yoga); in classic its layout rows are never called, so the engine is neither installed nor linked (ZN-355).
std::string emitCpp(const zbc::Module& m, const std::vector<std::uint8_t>* resources = nullptr, bool rnLayout = true, const std::string& resourcesFile = {});
// The same program as several translation units when `maxParts` > 1 and the program is large (512 KB of C++ or more): the first has the tables,
// the baked resources and main, each other one ZN_AOT_UNIT_FNS (48) functions in index order, so a change to one function changes one unit;
// with more than one unit the functions have external linkage (ZN-604, ZN-427).
std::vector<std::string> emitCppParts(const zbc::Module& m, const std::vector<std::uint8_t>* resources, bool rnLayout, unsigned maxParts, const std::string& resourcesFile = {});

// Whether the module calls the graphics host (the Rt::Host* entries).
bool usesHost(const zbc::Module& m);
bool usesLayout(const zbc::Module& m);   // the program calls the host layout engine: link zn_layout and zn_yoga
bool usesGl(const zbc::Module& m);       // the program calls zinc:gl (ZN-562): link zn_gl, glad and glslang

}  // namespace zn::aot
