#pragma once
// Untyped syntax tree: one uniform node type, kind-specific child layout (documented per kind). The checker (ZN-007)
// builds typed information beside it. kNone marks an absent optional child.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "zn/diagnostics.h"

namespace zn::frontend {

inline constexpr std::uint32_t kNone = 0xFFFFFFFFu;

enum class N : std::uint8_t {
  // statements
  Program,    // [stmt...]
  Block,      // [stmt...]
  Empty,      //
  VarDecl,    // text=let|const|var  [Declarator...]
  Declarator, // text=name  [type|none, init|none]
  Function,   // text=name  [returnType|none, body|none, Param...]
  Param,      // text=name  [type|none, default|none]; text starts with "..." for a rest parameter
  Class,      // text=name  [Field|Method...]
  Field,      // text=name  [type|none, init|none]
  Method,     // text=name ("constructor" for the constructor)  [returnType|none, body, Param...]
  If,         // [test, then, else|none]
  For,        // [init|none, test|none, update|none, body]  (init is a VarDecl or an expression)
  ForOf,      // text=let|const|var  [Declarator(no init), iterable, body]
  ForIn,      // same layout as ForOf
  While,      // [test, body]
  DoWhile,    // [body, test]
  Return,     // [expr|none]
  Break,      //
  Continue,   //
  ExprStmt,   // [expr]
  // expressions
  Ident,      // text=name
  Number,     // text=source
  BigInt,     // text=source
  String,     // text=source with quotes
  Template,   // [quasi, expr, quasi, expr, ..., quasi]: quasis are String nodes with the raw text between delimiters (no quotes)
  Literal,    // text=true|false|null
  This,       //
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
  Member,     // text=name or "?.name" for optional chaining  [object]
  Index,      // [object, index]
  // types
  TypeRef,    // text=name (may be qualified a.b)  [typeArg...]
  TypeArray,  // [element]
  TypeUnion,  // [member...]
  TypeFunc,   // [returnType, Param...]
  TypeTuple,  // [element...]
  TypeLit,    // text=literal source
};

struct Node {
  N kind;
  std::uint32_t start, end;  // byte offsets, [start, end)
  std::string_view text;     // views the source
  std::vector<std::uint32_t> kids;
};

struct Ast {
  std::vector<Node> nodes;
  std::uint32_t root = kNone;
};

struct Diag {
  const char* code;     // registry code (zn/diagnostics.h)
  std::uint32_t pos;    // byte offset
  std::string detail;   // what was found or expected, appended to the registry title
};

using zn::kZBadAssignTarget;
using zn::kZBadLiteral;
using zn::kZExpected;
using zn::kZUnexpectedToken;
using zn::kZUnsupported;

}  // namespace zn::frontend
