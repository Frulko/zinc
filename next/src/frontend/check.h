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

enum class TK : std::uint8_t { Error, Any, Num, Bool, Str, Void, Null, Array, Func, Object, Param, Union, Map, Set };
enum class Num : std::uint8_t { f64, f32, fx12, fx16, i8, i16, i32, i64, u8, u16, u32, u64, isize, usize };

struct Type {
  TK k = TK::Error;
  Num num = Num::f64;           // Num
  TypeId elem = 0;              // Array and Set: element; Map: value; Func: return type
  std::vector<TypeId> params;   // Func: parameters; Union: members, sorted and without duplicates; Map: the key type
  std::uint32_t minArgs = 0;    // Func
  bool variadic = false;        // Func (builtin console.log)
  bool undef = false;           // Union with null: the absent value is `undefined` (prints so); same representation as the `null` flavour
  std::uint32_t obj = 0;        // Object: index into Checked::objs; Param: index into Checked::tparams; Num: 1 + index into Checked::enumNames for an enum type
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
  std::string literal = {};                // a property typed with a string literal (`kind: 'circle'`): its type is string, only this value is allowed
  bool hasLiteral = false;
  bool optional = false;              // declared `name?: T`: an object literal may leave it out (it is then null)
  bool getter = false;                // a `get name()` accessor: `type` is the method's signature, a read calls it
};

struct ObjInfo {
  std::string name;
  std::vector<Member> members;
  TypeId ctor = kNoType;  // Func type of the constructor (classes only)
  bool isClass = false;
  bool isInterface = false;
  bool isAbstract = false;
  bool isTuple = false;                   // an anonymous class [A, B]: fields named 0, 1, ...
  bool isRecord = false;                  // an interface of data properties, or the shape of an object literal: a final class made only by literals
  std::uint8_t ctorAccess = 0;            // 0 public, 1 protected, 2 private
  std::uint32_t parent = 0xFFFFFFFFu;     // extended class (ObjInfo index)
  std::uint32_t genericSym = 0xFFFFFFFFu; // the generic class or interface this is an instance of
  std::vector<TypeId> typeArgs;           // its type arguments
  bool isTemplate = false;                // an instance over type parameters: checked, never lowered
  std::vector<std::uint32_t> ifaces;       // interfaces named in `implements`
};

enum class SymKind : std::uint8_t { Var, Param, Func, Class, Builtin, TypeAlias, GenericFunc, GenericClass, GenericAlias, Enum };
struct Symbol {
  SymKind kind;
  std::string_view name;
  TypeId type;
  std::uint32_t decl;  // declaring node or kNone
  bool isConst;
  std::uint32_t ownerFn = 0xFFFFFFFFu;  // function or lambda node that declares a variable (none: top-level code)
  bool isGlobal = false;                // a variable declared directly at the top level: reached through a global, never captured
  bool forward = false;                 // declared ahead of its statement (a top-level variable of known type): functions may use it, the code before it may not
  bool captured = false;                // referenced from a lambda or nested function other than its owner
  bool reassigned = false;              // assigned after its declaration: a captured one then lives in a shared cell
  bool tdz = false;                     // a top-level variable that functions above its declaration use: a read from a function checks the flag __tdz_<name> (ReferenceError before the declaration ran)
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
  // Closures: variables each lambda (or nested function) captures, transitively; lambdas that use `this`; identifiers that
  // name a function without calling it.
  std::unordered_map<std::uint32_t, std::vector<std::uint32_t>> captures;
  std::vector<std::uint32_t> lambdaUsesThis;
  std::unordered_map<std::uint32_t, std::uint32_t> selfSym;  // named function expression -> the variable that holds its own closure inside its body
  std::vector<std::uint32_t> funcValueUses;
  std::unordered_map<std::uint32_t, std::string> lambdaNames;  // the name a function expression takes from `const f = ...`, `f = ...`, `{ f: ... }` or a field initialiser
  // Numeric enums: members and values per enum symbol; the enum's type is i32.
  std::unordered_map<std::uint32_t, std::vector<std::pair<std::string, std::int64_t>>> enumMembers;
  std::vector<std::string> enumNames;  // an enum's type is an i32 Type with obj = 1 + its index here: assignable only from itself
};

// Checks the program. Generic declarations are instantiated by cloning their nodes into `ast`.
/** What `number` means for the next check(): f64 (default), f32 (esp32, ps2) or fx12 (ps1): the target profile (ZN-120). */
void setNumberAlias(Num m);
/** The current alias of `number` (what the lowering gives a literal that nothing constrains). */
Num numberAlias();
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
