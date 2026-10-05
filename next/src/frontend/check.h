#pragma once
// Binder and checker for the numeric subset: scopes and symbols, types for every expression, Z01xx diagnostics.
// Stricter than TypeScript by design (machine numeric kinds, boolean conditions, no truthiness): everything accepted
// here must be accepted by the oracle (tools/oracle), never the reverse. Rules for numeric kinds are ported from
// compiler/src/sema.ts (`arith`, LNG-05). Hoisting: functions and classes are declared before their scope runs and their
// bodies are checked after the scope's other statements, so bodies see every declaration of the enclosing scope.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

using TypeId = std::uint32_t;
inline constexpr TypeId kNoType = 0xFFFFFFFFu;

enum class TK : std::uint8_t { Error, Any, Num, Bool, Str, Void, Null, Array, Func, Object };
enum class Num : std::uint8_t { f64, f32, fx12, fx16, i8, i16, i32, i64, u8, u16, u32, u64, isize, usize };

struct Type {
  TK k = TK::Error;
  Num num = Num::f64;           // Num
  TypeId elem = 0;              // Array: element; Func: return type
  std::vector<TypeId> params;   // Func
  std::uint32_t minArgs = 0;    // Func
  bool variadic = false;        // Func (builtin console.log)
  std::uint32_t obj = 0;        // Object: index into Checked::objs
};

struct Member {
  std::string name;
  TypeId type;
  bool readonly = false;
  bool method = false;
};

struct ObjInfo {
  std::string name;
  std::vector<Member> members;
  TypeId ctor = kNoType;  // Func type of the constructor (classes only)
  bool isClass = false;
};

enum class SymKind : std::uint8_t { Var, Param, Func, Class, Builtin };
struct Symbol {
  SymKind kind;
  std::string_view name;
  TypeId type;
  std::uint32_t decl;  // declaring node or kNone
  bool isConst;
};

struct Checked {
  std::vector<Type> types;
  std::vector<ObjInfo> objs;
  std::vector<Symbol> syms;
  std::vector<TypeId> nodeType;        // per AST node: type of an expression or declared type of a declaration, else kNoType
  std::vector<std::uint32_t> nodeSym;  // per AST node: resolved symbol of an Ident, else kNone
  std::vector<Diag> diags;
};

Checked check(const Ast& ast);

// Lossless implicit conversion between machine numeric kinds (also used by the IR lowering).
bool widens(Num from, Num to);
std::string typeName(const Checked& c, TypeId t);

// One line per Function, Method, Param, Declarator and Field: `line:col Kind name: type`.
std::string dumpTypes(const Checked& c, const Ast& ast, std::string_view src);

}  // namespace zn::frontend
