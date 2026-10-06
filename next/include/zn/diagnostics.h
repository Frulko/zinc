#pragma once
// The diagnostics registry: the only place a diagnostic code, title, explanation, fix or example is written.
// Messages, `zinc explain` and docs/diagnostics.md are all generated from this table.
// Every code needs a fixture (tests/golden/*/errors/<name>.ts + .expect); tests/t0/diagnostics.sh enforces it.
#include <string_view>

// X(Name, code, title, why, fix, example)
#define ZN_DIAGNOSTICS(X)                                                                                              \
  X(UnexpectedToken, "Z0001", "Unexpected token",                                                                      \
    "The parser found a token that cannot start or continue the construct before it, or the input ended early.",      \
    "Check the line for a missing operand, bracket or keyword.", "let x = ;")                                          \
  X(Expected, "Z0002", "Expected a specific token",                                                                    \
    "The construct requires a particular token (such as ';', ')' or ':') and found something else.",                  \
    "Insert the missing token, or end the previous statement with ';' or a newline.", "let a = 1\nlet b = 2 3;")       \
  X(BadLiteral, "Z0003", "Invalid or unterminated literal",                                                            \
    "A string, template, regular expression or comment is not closed, or a character is not valid in the source.",    \
    "Close the literal on the same line (strings) or remove the stray character.", "const s = \"abc")                  \
  X(BadAssignTarget, "Z0004", "Invalid assignment target",                                                             \
    "Only a variable, a property (a.b) or an element (a[i]) can be assigned to.",                                     \
    "Assign to a variable or property instead.", "1 + 2 = a;")                                                         \
  X(Unsupported, "Z0005", "Syntax not supported yet",                                                                  \
    "The syntax is valid TypeScript but this engine does not implement it yet.",                                      \
    "Rewrite it with supported syntax, or wait for the task that adds it.", "function* g() { }") \
  X(CannotFindName, "Z0101", "Cannot find name",                                                                      \
    "The identifier is not declared in this scope, or is declared later in the same scope.",                          \
    "Declare it before use, or fix the spelling.", "let a = b;")                                                       \
  X(DuplicateDeclaration, "Z0102", "Duplicate declaration",                                                            \
    "A name can be declared only once per scope.", "Rename one of the declarations.", "let a = 1;\nlet a = 2;")        \
  X(NotAssignable, "Z0103", "Type is not assignable",                                                                  \
    "The value's type cannot be used where another type is expected. Machine numeric kinds (i32, f64, ...) are "      \
    "distinct: only lossless widening is implicit, and conditions must be boolean.",                                  \
    "Convert explicitly or change the declared type.", "let a: i32 = \"x\";")                                          \
  X(WrongArgCount, "Z0104", "Wrong number of arguments",                                                               \
    "A call must pass every required parameter and no more than the function declares.",                              \
    "Add or remove arguments.", "function f(a: i32): i32 { return a; }\nf(1, 2);")                                    \
  X(NotCallable, "Z0105", "Expression is not callable",                                                                \
    "Only functions and methods can be called, and only classes can be used with new.",                               \
    "Call a function, or remove the parentheses.", "let a = 1;\na();")                                                \
  X(NoSuchProperty, "Z0106", "Property does not exist",                                                                \
    "The type has no member with this name, or the builtin library does not provide it yet.",                         \
    "Check the name against the type's declaration.", "let a = 1;\na.foo;")                                           \
  X(BadOperand, "Z0107", "Operator cannot be applied to these types",                                                  \
    "The operands' types do not support the operator.", "Convert the operands or use another operator.",              \
    "let a = 1 - \"x\";")                                                                                             \
  X(AssignToConst, "Z0108", "Cannot assign to a constant",                                                             \
    "A const binding or read-only member cannot be reassigned.", "Declare it with let, or do not assign.",            \
    "const a = 1;\na = 2;")                                                                                            \
  X(CannotInfer, "Z0109", "Cannot infer a type",                                                                       \
    "Parameters, class fields and non-void function results need an annotation, and a declaration needs an "         \
    "initializer, when the type cannot be inferred.", "Add a type annotation.", "function f(a: i32) {\n  return a;\n}") \
  X(MissingReturn, "Z0110", "Not all code paths return a value",                                                       \
    "A function with a non-void return type must return on every path.", "Add a final return.",                      \
    "function f(a: i32): i32 {\n  if (a > 0) return 1;\n}")                                                           \
  X(UninitializedField, "Z0111", "Field is not initialized",                                                           \
    "A field without an initializer must be assigned in the constructor.", "Initialize it or assign it in the constructor.", \
    "class A {\n  x: i32;\n}")                                                                                        \
  X(NotAllowedHere, "Z0112", "Not allowed in this context",                                                            \
    "break and continue need an enclosing loop, return needs a function, this needs a class.",                        \
    "Move the statement.", "break;")                                                                                  \
  X(NotIndexable, "Z0113", "Expression cannot be indexed or iterated",                                                 \
    "Only arrays can be indexed or used with for...of for now.", "Use an array.", "let a = 1;\na[0];") \
  X(InvalidHierarchy, "Z0114", "Invalid class hierarchy or override",                                                  \
    "A class must extend a class, an override must keep the base member's kind and type, and the hierarchy must not "  \
    "loop.", "Match the base class member, or rename the member.",                                                   \
    "class A { f(): i32 { return 1; } }\nclass B extends A { f(): string { return \"x\"; } }")                          \
  X(AbstractViolation, "Z0115", "Abstract member misused",                                                             \
    "Abstract classes cannot be instantiated, abstract members belong in abstract classes, and a concrete class must "  \
    "implement every abstract member it inherits.", "Implement the member, or make the class abstract.",              \
    "abstract class A { abstract f(): i32; }\nclass B extends A { }")                                                  \
  X(MissingInterfaceMember, "Z0116", "Class does not implement the interface",                                         \
    "A class that declares `implements I` must have a public member for every member of I with the same type.",       \
    "Add the missing member or fix its type.",                                                                        \
    "interface I { f(): i32; }\nclass A implements I { }")                                                             \
  X(NotAccessible, "Z0117", "Member is not accessible",                                                                \
    "A private member is visible only inside its class, a protected member inside its class and subclasses.",         \
    "Use a public member or access it from inside the class.",                                                        \
    "class A { private x: i32 = 1; }\nconst a = new A();\nconsole.log(a.x);")                                          \
  X(BadSuperCall, "Z0118", "Invalid super call",                                                                       \
    "A derived class constructor must start with `super(...)`, and `super` is only valid in a derived class.",        \
    "Call super(...) as the first statement of the constructor.",                                                     \
    "class A { }\nclass B extends A {\n  x: i32 = 1;\n  constructor() { this.x = 2; }\n}")

namespace zn {

struct DiagInfo {
  const char* code;
  const char* title;
  const char* why;
  const char* fix;
  const char* example;
};

#define X(name, code, title, why, fix, example) inline constexpr const char* kZ##name = code;
ZN_DIAGNOSTICS(X)
#undef X

inline constexpr DiagInfo kDiagnostics[] = {
#define X(name, code, title, why, fix, example) {code, title, why, fix, example},
    ZN_DIAGNOSTICS(X)
#undef X
};

inline const DiagInfo* findDiag(std::string_view code) {
  for (const DiagInfo& d : kDiagnostics)
    if (code == d.code) return &d;
  return nullptr;
}

}  // namespace zn
