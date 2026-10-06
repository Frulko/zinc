#pragma once
// Binder and checker for the numeric subset: scopes and symbols, types for every expression, Z01xx diagnostics.
// Stricter than TypeScript by design (machine numeric kinds, boolean conditions, no truthiness): everything accepted
// here must be accepted by the oracle (tools/oracle), never the reverse. Rules for numeric kinds are ported from
// compiler/src/sema.ts (`arith`, LNG-05). Hoisting: functions and classes are declared before their scope runs and their
// bodies are checked after the scope's other statements, so bodies see every declaration of the enclosing scope.
#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

using TypeId = std::uint32_t;
inline constexpr TypeId kNoType = 0xFFFFFFFFu;

enum class TK : std::uint8_t { Error, Any, Num, Bool, Str, Void, Null, Array, Func, Object, Param };
enum class Num : std::uint8_t { f64, f32, fx12, fx16, i8, i16, i32, i64, u8, u16, u32, u64, isize, usize };

struct Type {
  TK k = TK::Error;
  Num num = Num::f64;           // Num
  TypeId elem = 0;              // Array: element; Func: return type
  std::vector<TypeId> params;   // Func
  std::uint32_t minArgs = 0;    // Func
  bool variadic = false;        // Func (builtin console.log)
  std::uint32_t obj = 0;        // Object: index into Checked::objs; Param: index into Checked::tparams
};

struct Member {
  std::string name;
  TypeId type;
  bool readonly = false;
  bool method = false;
  std::uint32_t owner = 0xFFFFFFFFu;  // declaring class or interface (ObjInfo index)
  std::uint8_t access = 0;            // 0 public, 1 protected, 2 private
  bool isStatic = false;
  bool isAbstract = false;
};

struct ObjInfo {
  std::string name;
  std::vector<Member> members;
  TypeId ctor = kNoType;  // Func type of the constructor (classes only)
  bool isClass = false;
  bool isInterface = false;
  bool isAbstract = false;
  bool isTuple = false;                   // an anonymous class [A, B]: fields named 0, 1, ...
  std::uint8_t ctorAccess = 0;            // 0 public, 1 protected, 2 private
  std::uint32_t parent = 0xFFFFFFFFu;     // extended class (ObjInfo index)
  std::uint32_t genericSym = 0xFFFFFFFFu; // the generic class or interface this is an instance of
  std::vector<TypeId> typeArgs;           // its type arguments
  bool isTemplate = false;                // an instance over type parameters: checked, never lowered
  std::vector<std::uint32_t> ifaces;       // interfaces named in `implements`
};

enum class SymKind : std::uint8_t { Var, Param, Func, Class, Builtin, TypeAlias, GenericFunc, GenericClass };
struct Symbol {
  SymKind kind;
  std::string_view name;
  TypeId type;
  std::uint32_t decl;  // declaring node or kNone
  bool isConst;
};

// A type parameter of a generic declaration, seen as an opaque type while the template itself is checked.
struct TParam {
  std::string name;
  TypeId constraint = kNoType;
};

struct Checked {
  std::vector<Type> types;
  std::vector<TParam> tparams;
  std::vector<ObjInfo> objs;
  std::vector<Symbol> syms;
  std::vector<TypeId> nodeType;        // per AST node: type of an expression or declared type of a declaration, else kNoType
  std::vector<std::uint32_t> nodeSym;  // per AST node: resolved symbol of an Ident, else kNone
  std::vector<Diag> diags;
  // Concrete instances of generic functions and classes: cloned declaration nodes to lower, with their names.
  std::vector<std::uint32_t> instances;
  std::unordered_map<std::uint32_t, std::string> nodeNames;
};

// Checks the program. Generic declarations are instantiated by cloning their nodes into `ast`.
Checked check(Ast& ast);

// Lossless implicit conversion between machine numeric kinds (also used by the IR lowering).
bool widens(Num from, Num to);

// Class relations over ObjInfo indices (also used by the IR lowering for closed-world devirtualisation).
bool isSubclass(const Checked& c, std::uint32_t a, std::uint32_t b);                   // a == b or a derives from b
const Member* lookupMember(const Checked& c, std::uint32_t obj, std::string_view name, bool wantStatic);
bool objAssignable(const Checked& c, std::uint32_t a, std::uint32_t b);               // subclass, or structurally an interface
std::string typeName(const Checked& c, TypeId t);

// One line per Function, Method, Param, Declarator and Field: `line:col Kind name: type`.
std::string dumpTypes(const Checked& c, const Ast& ast, std::string_view src);

}  // namespace zn::frontend
