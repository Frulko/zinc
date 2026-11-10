#pragma once
// ZBC to C++: every function of a verified module becomes a C++ function over the same register window the interpreter uses,
// so the compiled program and the interpreter share the machine, the heap and the runtime calls (src/rt) and the value
// semantics of every operation (include/zn/ops.h). The module is also embedded as bytes: class tables, strings, constants
// and globals load through the same code as in the interpreter.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "zbc/zbc.h"

namespace zn::aot {

// RLE-packed tables-only module shared by native embedding and the standalone emitter.
std::vector<std::uint8_t> tableBytes(const zbc::Module& m);

// The source of a program that behaves like `zinc run` of the module. Build it with
//   c++ -std=c++20 -O2 -I include -I src program.cpp libzn_rt.a libzn_zbc.a ...
// `resources` (the blob of src/res) is embedded and installed when the program starts, for programs that draw (usesHost); with `resourcesFile`
// instead, the program reads that file at start, beside its executable or in its .app's Resources (zinc build --no-embed, --bundle).
// unpackedResources: native embedded resources are zstd-packed; the compiler records their original byte count. Zero keeps the raw blob.
// rnLayout: the program was compiled for the rn layout engine (Yoga); in classic its layout rows are never called, so the engine is neither installed nor linked (ZN-355).
// resourcesIncbin: the file that holds the same bytes as `resources`, which the assembler copies into the object by .incbin (ZN-429) instead of
// a literal the compiler parses; it must exist when the C++ is compiled. Empty: the literal (a compiler without .incbin, C++ compiled elsewhere).
std::string emitCpp(const zbc::Module& m, const std::vector<std::uint8_t>* resources = nullptr, bool rnLayout = true, const std::string& resourcesFile = {}, const std::string& resourcesIncbin = {}, std::size_t unpackedResources = 0);
// The same program as several translation units when `maxParts` > 1 and the program is large (512 KB of C++ or more): the first has the tables,
// the baked resources and main, each other one ZN_AOT_UNIT_FNS (48) functions in index order, so a change to one function changes one unit;
// with more than one unit the functions have external linkage (ZN-604, ZN-427).
// With sharedDeclarations, split units omit their common declarations: the caller writes that header and includes it in every unit.
// packedTables/unpackedTables: optional native zstd tables and their original RLE byte count; other exports keep tableBytes().
std::vector<std::string> emitCppParts(const zbc::Module& m, const std::vector<std::uint8_t>* resources, bool rnLayout, unsigned maxParts, const std::string& resourcesFile = {}, const std::string& resourcesIncbin = {}, std::string* sharedDeclarations = nullptr, std::size_t unpackedResources = 0, const std::vector<std::uint8_t>* packedTables = nullptr, std::size_t unpackedTables = 0);

// Whether the module calls the graphics host (the Rt::Host* entries).
bool usesNative(const zbc::Module& m, std::string_view module);   // reachable native calls, including workers
bool usesHost(const zbc::Module& m);
bool usesLayout(const zbc::Module& m);   // the program calls the host layout engine: link zn_layout and zn_yoga
bool usesGl(const zbc::Module& m);       // the program calls zinc:gl (ZN-562): link zn_gl, glad and glslang
bool usesNet(const zbc::Module& m);      // the program calls the network, zinc:subtle or writes packs: the whole system host (ZN-805)
unsigned rtNeeded(const zbc::Module& m); // the highest runtime call id the module uses + 1: the Rt::Count an engine needs to run it (.zapp needs.rt)

}  // namespace zn::aot
