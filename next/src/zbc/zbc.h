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

enum class CKind : std::uint8_t { Object, String, Array, Map, Set };

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
// Strings, arrays, Map and Set are builtin classes with no fields, selectors or parent: `elem` is the element type of an
// array or Set and the value type of a Map, `key` the key type of a Map. Each distinct one appears once in the table.
struct ClassInfo {
  std::string name;
  CKind kind = CKind::Object;
  VType elem, key;
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

// An exception raised by the Call, CallVirt or Throw at `at` goes to `target` when the thrown object is an instance of `cls`
// (otherwise the exception moves on to the caller); the object arrives in register `reg`, typed as `cls`.
struct Handler {
  std::uint32_t at = 0;
  std::uint32_t target = 0;
  std::uint16_t cls = 0;
  std::uint8_t reg = 0;
};

struct Function {
  std::string name;
  std::vector<VType> params;     // classes of r0..r(n-1) on entry
  VType ret;
  std::uint32_t nregs = 0;       // frame size; a call's window starts at a register below it
  std::vector<std::uint32_t> code;
  std::vector<Const> consts;
  std::vector<Handler> handlers;
};

struct Native { std::string module, name, sig; };  // an export of a native module: the loader finds it in the registry and compares the signature

struct Module {
  std::vector<std::string> strings;  // LoadStr operands
  std::vector<VType> globals;
  std::vector<ClassInfo> classes;
  std::vector<SelInfo> selectors;
  std::vector<Function> functions;  // functions[0] is main
  std::vector<Native> natives;      // the targets of CallNative
  std::string profile;              // the target profile the program was built for (esp32, ps1...; "" = the host's) and its heap budget in bytes (0 = none): enforced by the runtime, in an AOT program too
  std::uint32_t heapBytes = 0;
};

// Emits ZBC. Constructs without bytecode yet (exceptions, fixed-point numbers) are
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
