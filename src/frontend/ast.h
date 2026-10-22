#pragma once
// Untyped syntax tree: one uniform node type, kind-specific child layout (documented per kind). The checker (ZN-007)
// builds typed information beside it. kNone marks an absent optional child.
#include <cstdint>
#include <deque>
#include <string>
#include <unordered_map>
#include <string_view>
#include <vector>

#include "i18n/i18n.h"
#include "zn/diagnostics.h"

namespace zn::frontend {

inline constexpr std::uint32_t kNone = 0xFFFFFFFFu;

enum class N : std::uint8_t {
  // statements
  Program,    // [stmt...]
  Block,      // [stmt...]
  Empty,      //
  VarDecl,    // text=let|const|var  [Declarator...]
  Declarator, // text=name  [type|none, init|none, pattern?]; a destructuring declarator has empty text and a pattern as third kid
  Function,   // text=name  [returnType|none, body|none, Param...]
  Param,      // text=name  [type|none, default|none, pattern?]; flags: kFlagRest for `...name`; empty text and a pattern for a destructured parameter
  Class,      // text=name  [extends TypeRef|none, Heritage|none (implements), Field|Method...]; flags: abstract
  Interface,  // text=name  [Heritage|none (extends), Field|Method...] (members are signatures)
  Heritage,   // [TypeRef...]
  Field,      // text=name  [type|none, init|none]; flags: modifiers
  Method,     // text=name ("constructor" for the constructor)  [returnType|none, body|none (abstract), Param...]; flags: modifiers
  If,         // [test, then, else|none]
  For,        // [init|none, test|none, update|none, body]  (init is a VarDecl or an expression)
  ForOf,      // text=let|const|var  [Declarator(no init), iterable, body]
  ForIn,      // same layout as ForOf
  While,      // [test, body]
  DoWhile,    // [body, test]
  Return,     // [expr|none]
  Break,      // text=label|empty
  Continue,   // text=label|empty
  ExprStmt,   // [expr]
  // expressions
  Ident,      // text=name
  Number,     // text=source
  BigInt,     // text=source
  String,     // text=source with quotes
  Template,   // [quasi, expr, quasi, expr, ..., quasi]: quasis are String nodes with the raw text between delimiters (no quotes)
  Literal,    // text=true|false|null
  This,       //
  Super,      // only as a callee (super(...)) or an object (super.m(...))
  Array,      // [elem...]  (Spread allowed)
  Spread,     // [expr]
  Binary,     // text=op  [lhs, rhs]   (also "," and "&&", "||", "??")
  Unary,      // text=op  [expr]       (! ~ + - typeof void delete)
  UpdatePre,  // text=++|--  [expr]
  UpdatePost, // text=++|--  [expr]
  Assign,     // text=op  [target, value]
  Cond,       // [test, then, else]
  Call,       // [callee, arg...]
  New,        // [callee, arg...]
  Member,     // text=name  [object]; flags: kFlagOptional for `a?.name`
  Index,      // [object, index]
  // types
  TypeRef,    // text=name (may be qualified a.b)  [typeArg...]
  TypeArray,  // [element]
  TypeUnion,  // [member...]
  TypeFunc,   // [returnType, Param...]
  TypeTuple,  // [element...]
  TypeLit,    // text=literal source
  TypeParam,  // text=name  [constraint type|none]; listed in Ast::tparams, not among the declaration's kids
  // binding and assignment patterns
  ArrayPattern,   // [target | Empty (hole) | Spread(target) ...]; a target is an Ident, a nested pattern or, in an assignment, a Member or Index
  ObjectPattern,  // [PatProp...]
  PatProp,        // text=property name  [target]
  TypeAlias,      // text=name  [type]; type parameters in Ast::tparams
  FuncExpr,       // arrow function or function expression: [returnType|none, body Block, Param...]; an expression body is wrapped in a Block with a Return
  // modules (top level only)
  Import,         // text=source with quotes  [ImportSpec...]   (`import './x'` has no specs)
  ImportSpec,     // text=imported name  [Ident local name]
  Export,         // [declaration]   (`export function f() {}`, `export class`, `export const`, `export interface`, `export type`)
  ExportList,     // text=source with quotes, or empty  [ExportSpec...]   (`export { a, b as c }` and `export { a } from './x'`)
  ExportSpec,     // text=local (or imported) name  [Ident exported name]
  ExportAll,      // text=source with quotes   (`export * from './x'`)
  Switch,         // [discriminant, Case...]
  Case,           // [test|none (default), statement...]
  Enum,           // text=name  [EnumMember...]
  EnumMember,     // text=name  [initialiser|none]
  ObjectLit,      // [Prop...]   (`{ a: 1, b }`)
  Prop,           // text=name  [value]; a computed key `[k]: v` has no text and [value, key]; an accessor's value is its FuncExpr (flags kFlagGetter, kFlagSetter)
  As,             // [expression, type]   (`e as T`)
  Try,            // [block, catch Ident|none, catch block|none, finally block|none]
  Throw,          // [expression]
  Await,          // [expression]
  Yield,          // [expression|none]
  TypeObject,     // `{ a: T; b?: U }`  [Field...] (a Field is [type, none]; flags: kFlagOptional)
  NonNull,        // [expression]   (`e!`: the non-null type of e, a null reference traps)
  Regex,          // /source/flags (text includes the slashes and the flags): the checker turns it into a call of the prelude's __reLit
  Labeled,        // text=label  [statement]   (`outer: for (...)`; a Break or Continue carries the label it jumps to as its text)
  TypeOther,      // text=what it is ("intersection", "conditional", "mapped", "indexed access"...)  [component types]: TypeScript type syntax the
                  // checker does not type yet; it parses so that the QuickJS engine erases it, and the checker reports it (kZUnsupported)
};

// Modifier flags on Class, Field, Method and Param nodes.
inline constexpr std::uint32_t kFlagAbstract = 1, kFlagStatic = 2, kFlagReadonly = 4, kFlagPrivate = 8, kFlagProtected = 16,
                               kFlagPublic = 32, kFlagOverride = 64, kFlagSynthetic = 128,  // synthetic: generated by the parser
                               kFlagArrow = 256,  // an arrow function (captures `this`)
                               kFlagGetter = 512,  // a `get name()` accessor: a Method read like a property
                               kFlagAsync = 1024, kFlagGenerator = 2048,  // `async function`, `function*`
                               kFlagOptional = 4096,  // `name?: T` (the type is `T | null`)
                               kFlagDefinite = 8192,  // `name!: T`: assigned elsewhere, not checked in the constructor
                               kFlagDefault = 16384,  // an Export node: `export default`
                               kFlagUndefined = 32768,  // a Literal null or TypeRef null written as `undefined` (a file without Dyn values: same representation, printed as undefined)
                               kFlagTypeQuery = 65536,  // a TypeRef written `typeof x`: the type of the value x
                               kFlagRest = 131072,  // a Param written `...name`: the remaining arguments as an array
                               kFlagSetter = 262144,  // a Prop of an object literal written `set name(v) { ... }` (kFlagGetter: `get name() { ... }`)
                               kFlagTypeOnly = 524288,  // an ExportList written `export type { ... }`: no value to export at run time
                               kFlagModuleLevel = 1048576;  // an Await outside any function (top-level await of a module)

// Class members start at this index of a Class node's kids; Interface members start at 1.
inline constexpr std::size_t kClassMembersFrom = 2;

struct Node {
  N kind;
  std::uint32_t start, end;  // byte offsets, [start, end) in the node's file
  std::string_view text;     // views the source
  std::vector<std::uint32_t> kids;
  std::uint32_t flags = 0;
  std::uint32_t file = 0;    // index into the program's files (see modules.h)
}; 

// One source file of a program, in initialisation order: its statements (imports and exports unwrapped), what it imports
// and what it exports. `from` is the module index of the file named in the statement.
struct ModuleImport { std::uint32_t from; std::string_view name, local; std::uint32_t node; };
struct ModuleExport {
  std::string_view name;       // the exported name
  std::string_view local;      // the module's own name for it, or the imported name of a re-export
  std::uint32_t from = kNone;  // re-export: module index; otherwise kNone
  bool all = false;            // `export * from`
  std::uint32_t node = kNone;
};
struct ModuleInfo {
  std::string path;
  std::uint32_t file = 0;
  std::vector<std::uint32_t> stmts;
  std::vector<ModuleImport> imports;
  std::vector<ModuleExport> exports;
};

// An export of a native module that the program calls through requireNative<Spec>('Name'): the checker declares __native_<index>, the lowering emits CallNative.
struct NativeDecl { std::string module, name, sig; };

struct Ast {
  std::vector<NativeDecl> natives;
  bool strict = false;                 // a strict profile: no `any` (Z1006)
  std::vector<std::uint32_t> prelude;  // statements of the built-in classes (Error and its subclasses), checked in the global scope before every module
  std::deque<std::string> generated;  // source text generated by the checker (formatters); nodes view it, so it never moves
  std::vector<ModuleInfo> modules;  // empty for a single parsed file; then root's kids are the statements
  // Hot mode (ZINC_HOT=1, zinc dev's Fast Refresh, ZN-742): zinc:hot's index in `modules`, kNone in every other build. The lowering then gives
  // each module an init function and `runLoop`, the generated `__runLoop();` of the last module, runs in main after them.
  std::uint32_t hotModule = kNone, runLoop = kNone;
  std::deque<Node> nodes;  // a deque: references stay valid while the checker clones declarations
  std::uint32_t root = kNone;
  // Type parameters of a generic Function, Class or Interface, and the explicit type arguments of a Call or New.
  std::unordered_map<std::uint32_t, std::vector<std::uint32_t>> tparams, targs;
};

// Where a byte of a lowered .tsx text comes from (ZN-371.03): from `out` on, a copy of the source from `src` (byte for byte), or code generated
// for the source at `src` (a JSX element), until the next piece.
struct SrcPiece { std::uint32_t out, src; bool copy; };
std::uint32_t sourceOffset(const std::vector<SrcPiece>& map, std::uint32_t out);   // the source offset of a byte of the lowered text
std::uint32_t loweredOffset(const std::vector<SrcPiece>& map, std::uint32_t src);  // the lowered offset of a byte of the source, the nearest copy when none holds it

struct Diag {
  const char* code;     // registry code (zn/diagnostics.h)
  std::uint32_t pos;    // byte offset in `file`
  std::string detail;   // what was found or expected, appended to the registry title; English, the text tools read
  std::uint32_t file = 0;
  const char* key = nullptr;      // a detail a beginner meets often (D159): its message in i18n/<lang>/diag.json, printed in the person's language
  std::vector<i18n::Arg> args{};  // the values of its {placeholders}
};

using zn::kZBadAssignTarget;
using zn::kZBadLiteral;
using zn::kZExpected;
using zn::kZUnexpectedToken;
using zn::kZUnsupported;
using zn::kZVarForbidden;
using zn::kZArgumentsForbidden;
using zn::kZEvalForbidden;
using zn::kZWithForbidden;
using zn::kZDeleteForbidden;
using zn::kZDynamicImport;
using zn::kZPrototypeMutation;
using zn::kZHoleyArray;
using zn::kZGlobalThisForbidden;
using zn::kZInOperator;

}  // namespace zn::frontend
