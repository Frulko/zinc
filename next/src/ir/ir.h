#pragma once
// Typed SSA IR, the single source of truth every backend derives from. Control flow uses block parameters instead of
// phis: a branch passes arguments to the target block's parameters. Effects and exceptional edges are part of the
// representation: every instruction has an effect set, and a Call may carry an unwind edge; Throw is a terminator.
// Dependency direction: ir includes frontend (types of numeric kinds), never the reverse.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/check.h"
#include "zn/builtins.h"
#include "zn/runtime.h"

namespace zn::ir {

using TypeId = std::uint32_t;
using ValueId = std::uint32_t;
using BlockId = std::uint32_t;
inline constexpr std::uint32_t kNoValue = 0xFFFFFFFFu;
// A Const of a string, array, Map or Set type with this `imm` is null (references to objects have only null as a constant).
inline constexpr std::int64_t kNullConst = -1;

struct Type {
  enum class K : std::uint8_t { Void, Bool, Num, Str, Ref, Array, Map, Set } k = K::Void;
  frontend::Num num = frontend::Num::f64;  // Num
  std::uint32_t aux = 0;                   // Ref: class index; Array and Set: element TypeId; Map: value TypeId
  std::uint32_t aux2 = 0;                  // Map: key TypeId
  bool operator==(const Type& o) const { return k == o.k && num == o.num && aux == o.aux && aux2 == o.aux2; }
  bool builtinRef() const { return k == K::Str || k == K::Array || k == K::Map || k == K::Set; }  // may be a Const null (kNullConst)
};

enum class Builtin : std::uint32_t {
#define X(id, name, arity) id,
  ZN_BUILTINS(X)
#undef X
  Count
};
const char* builtinName(Builtin b);
int builtinArity(Builtin b);  // -1: variadic

enum class IrOp : std::uint8_t {
  Const,                                                    // imm (int, bool, string index) or fimm; a reference constant is null
  Add, Sub, Mul, Div, Rem, Pow,                             // numeric, operands and result of one type
  And, Or, Xor, Shl, Shr, UShr,                             // integer kinds
  Neg, Not, BitNot,
  Eq, Ne, Lt, Le, Gt, Ge,                                   // result bool; operands of one type
  Conv,                                                     // numeric kind conversion
  RefCast,                                                  // reference to a related class or interface (checked at run time when it is a downcast)
  InstOf,                                                   // sym = class; bool, false for null
  Call,                                                     // sym = function; optional edges[0] = unwind
  CallVirt,                                                 // args[0] = receiver, sym = selector; dispatches through the receiver's vtable
  Builtin,                                                  // sym = Builtin
  New, GetField, SetField, GetGlobal, SetGlobal,
  ArrNew,                                                   // a new empty array, Map or Set of the result type
  ArrGet, ArrSet, ArrLen, ArrPush, ArrPop,
  StrConcat, ToStr, StrLen,
  Retain, Release,                                          // one more / one less reference to a string, array, Map, Set or object (immortal and null values ignore them); inserted by insertRc
  Rt,                                                       // sym = zn::Rt (zn/runtime.h): string, array, Map and Set operations; args[0] is the receiver
  Br, CondBr, Ret, Throw, Unreachable,                      // terminators
};
const char* opName(IrOp o);
bool isTerminator(IrOp o);

enum Effect : std::uint8_t { kPure = 0, kReads = 1, kWrites = 2, kThrows = 4, kAllocs = 8 };

struct Edge {
  BlockId to = 0;
  std::vector<ValueId> args;
};

struct Inst {
  IrOp op = IrOp::Const;
  TypeId ty = 0;                 // result type; the Void type when there is no result
  ValueId res = kNoValue;
  std::vector<ValueId> args;
  std::int64_t imm = 0;
  double fimm = 0;
  std::uint32_t sym = 0;         // Call: function; Builtin: Builtin; New: class; GetField/SetField: field; globals: global
  std::vector<Edge> edges;       // Br: [target]; CondBr: [then, else]; Call: [unwind] or none
};

struct Block {
  std::vector<ValueId> params;
  std::vector<Inst> insts;       // the last instruction is the terminator
};

struct Function {
  std::string name;
  std::vector<ValueId> params;   // the entry block's parameters
  TypeId ret = 0;
  std::vector<Block> blocks;     // blocks[0] is the entry
  std::vector<TypeId> valueTypes;
};

struct Field { std::string name; TypeId type; };
inline constexpr std::uint32_t kNoClass = 0xFFFFFFFFu;

// A virtual method signature (without the receiver); a call through a vtable names one.
struct Selector {
  std::string name;
  std::vector<TypeId> params;
  TypeId ret = 0;
};

// Closed-world class layout: `fields` is the full layout (inherited fields first, so a field has one offset in every
// subclass). `implements` lists the interfaces the class (or interface) satisfies, parents' included. `selectors` are the
// virtual methods visible on the class; `vtable` maps a selector id to the implementing function (kNoClass: none).
struct Class {
  std::string name;
  std::vector<Field> fields;
  std::uint32_t parent = kNoClass;
  bool isInterface = false;
  bool isAbstract = false;
  std::vector<std::uint32_t> implements;
  std::vector<std::uint32_t> selectors;
  std::vector<std::uint32_t> vtable;
};
struct Global { std::string name; TypeId type; };

struct Module {
  std::vector<Type> types;
  std::vector<Class> classes;
  std::vector<Selector> selectors;
  std::vector<Global> globals;
  std::vector<std::string> strings;
  std::vector<Function> functions;  // functions[0] is @main, the top-level code

  TypeId intern(const Type& t);
  TypeId voidT() { return intern({Type::K::Void, frontend::Num::f64, 0}); }
  TypeId boolT() { return intern({Type::K::Bool, frontend::Num::f64, 0}); }
  TypeId strT() { return intern({Type::K::Str, frontend::Num::f64, 0}); }
  TypeId numT(frontend::Num n) { return intern({Type::K::Num, n, 0}); }
  TypeId refT(std::uint32_t cls) { return intern({Type::K::Ref, frontend::Num::f64, cls}); }
  TypeId arrayT(TypeId elem) { return intern({Type::K::Array, frontend::Num::f64, elem}); }
  TypeId mapT(TypeId key, TypeId val) { return intern({Type::K::Map, frontend::Num::f64, val, key}); }
  TypeId setT(TypeId elem) { return intern({Type::K::Set, frontend::Num::f64, elem}); }
  // a is b, derives from b, or satisfies the interface b
  bool isSubtype(std::uint32_t a, std::uint32_t b) const;
};

std::uint8_t effects(const Module& m, const Inst& i);
std::string typeName(const Module& m, TypeId t);
std::string dump(const Module& m);
// Empty when well formed; otherwise the first problem found (function, block and instruction named).
std::string verify(const Module& m);

// Inserts Retain and Release so that every reference is released exactly once on every path (see rc.cpp for the conventions).
void insertRc(Module& m);

// Lowers a checked program. Fails with diagnostics (Z0005) for constructs the IR does not cover yet.
struct LowerResult {
  Module module;
  std::vector<frontend::Diag> diags;
};
LowerResult lower(const frontend::Ast& ast, const frontend::Checked& checked, std::string_view src);

}  // namespace zn::ir
