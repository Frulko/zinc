#pragma once
// ZBC: typed register bytecode module, its binary form, verifier, disassembler and the emitter from the IR.
// Dependency direction: zbc includes ir (and everything left of it), never the reverse.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "ir/ir.h"
#include "zn/bytecode.h"
#include "zn/limits.h"
#include "zn/opcodes.h"

namespace zn::zbc {

// Register and value classes: I = integers of every width and booleans, S = f32, D = f64, R = a reference to an object
// (the class travels with the type, see VType). None = void / undefined.
enum class Cls : std::uint8_t { None, I, S, D, R };

struct VType {
  Cls cls = Cls::None;
  std::uint16_t ref = 0;  // class id when cls == R
  bool operator==(const VType& o) const { return cls == o.cls && (cls != Cls::R || ref == o.ref); }
};

struct Const {
  Cls cls = Cls::I;
  std::uint64_t bits = 0;
};

// Closed-world class table. `supers` lists every ancestor and every interface the class satisfies (not the class itself);
// `fields` is the full layout (inherited first); `selectors` are the virtual methods visible on the class and `vtable`
// maps every selector id to a function index (kNoClass: none, interfaces and abstract classes have no vtable).
struct ClassInfo {
  std::string name;
  std::uint32_t parent = ir::kNoClass;
  bool isInterface = false;
  bool isAbstract = false;
  std::vector<std::uint32_t> supers;
  std::vector<VType> fields;
  std::vector<std::uint32_t> selectors;
  std::vector<std::uint32_t> vtable;
};

// A virtual method signature without the receiver.
struct SelInfo {
  std::string name;
  std::vector<VType> params;
  VType ret;
};

struct Function {
  std::string name;
  std::vector<VType> params;     // classes of r0..r(n-1) on entry
  VType ret;
  std::uint32_t nregs = 0;       // frame size; a call's window starts at a register below it
  std::vector<std::uint32_t> code;
  std::vector<Const> consts;
};

struct Module {
  std::vector<VType> globals;
  std::vector<ClassInfo> classes;
  std::vector<SelInfo> selectors;
  std::vector<Function> functions;  // functions[0] is main
};

// Emits ZBC for the numeric subset. Constructs without bytecode yet (heap objects, arrays, strings, exceptions) are
// reported in `errors`, one per function, and that function's code is left empty.
struct EmitResult {
  Module module;
  std::vector<std::string> errors;
};
EmitResult emit(const ir::Module& m);

// Empty when the module is well formed: operands in range, jumps land on instructions, every path ends in a
// terminator, and every register read has the class the operation expects (typed abstract interpretation).
std::string verify(const Module& m);

std::vector<std::uint8_t> encode(const Module& m);
// Fails (returns false, `err` set) on truncated or inconsistent bytes; callers must still run verify().
bool decode(const std::vector<std::uint8_t>& bytes, Module& out, std::string& err);

std::string disassemble(const Module& m);

}  // namespace zn::zbc
