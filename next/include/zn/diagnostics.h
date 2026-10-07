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
    "Parameters and class fields need an annotation, a declaration needs an initializer, and a function that calls "  \
    "itself needs a return type, when the type cannot be inferred.", "Add a type annotation.", "function f(a) {\n  return 1;\n}") \
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
    "class A { }\nclass B extends A {\n  x: i32 = 1;\n  constructor() { this.x = 2; }\n}")                       \
  X(ModuleNotFound, "Z0119", "Cannot find module",                                                                     \
    "An import must name a file relative to the importing file ('./x' or '../x'); `.ts`, `.tsx` and `/index.ts` are "  \
    "tried.", "Fix the path or create the file.", "import { x } from './missing';")                                      \
  X(VarForbidden, "Z1001", "`var` is not supported",                                                                   \
    "`var` hoists and has function scope, which a typed engine cannot give a static meaning to.",                       \
    "Use `let` (reassigned) or `const`.", "var x = 1;\nconsole.log(x);")                                               \
  X(ArgumentsForbidden, "Z1002", "`arguments` is not supported",                                                       \
    "The `arguments` object is an untyped list of every argument.", "Use explicit parameters, or a rest parameter.",   \
    "function f(): number { return arguments.length; }")                                                              \
  X(EvalForbidden, "Z1003", "`eval` is not supported",                                                                 \
    "A program is compiled ahead of time: there is no engine to run text at run time.", "Parse the data (JSON.parse) or call a function.", \
    "eval('1 + 1');")                                                                                                 \
  X(WithForbidden, "Z1005", "`with` is not supported",                                                                 \
    "`with` changes name resolution at run time.", "Name the object: `o.x` instead of `with (o) { x }`.",             \
    "with ({}) { }")                                                                                                  \
  X(DeleteForbidden, "Z1007", "`delete` is not supported",                                                             \
    "A typed object has a fixed list of fields: a field cannot be removed.", "Use a Map (`map.delete(key)`), or set the field to null.", \
    "const o = { a: 1 };\ndelete o.a;")                                                                               \
  X(DynamicImport, "Z1009", "Dynamic `import()` is not supported",                                                    \
    "Every module of a program is known when it is compiled.", "Use a static `import` at the top of the file.",        \
    "import('./x').then(() => {});")                                                                                  \
  X(PrototypeMutation, "Z1010", "Prototype mutation is not supported",                                                \
    "Classes have a fixed shape; `prototype` and `__proto__` cannot be written or read.", "Declare a method in the class, or extend it.", \
    "class A { }\nA.prototype.x = 1;")                                                                                \
  X(HoleyArray, "Z1011", "Arrays with holes are not supported",                                                       \
    "An array is a contiguous list: `[1, , 2]` would need a value that is not there.", "Write the value, `null`, or `undefined`.", \
    "const a = [1, , 2];")                                                                                            \
  X(GlobalThisForbidden, "Z1015", "`globalThis` is not supported",                                                    \
    "There is no global object whose properties can be added or read by name.", "Import what you need, or keep it in a module.", \
    "console.log(globalThis);")                                                                                       \
  X(LabeledStatement, "Z9011", "Labeled statements are not supported yet",                                            \
    "`break label` and `continue label` are not implemented yet.", "Use a flag, or move the inner loop into a function.", \
    "outer: for (let i = 0; i < 2; i++) { }")                                                                         \
  X(InOperator, "Z9026", "The `in` operator is not supported on a typed value",                                       \
    "The properties of a typed object are fixed, so `\"a\" in o` is known when compiling.", "Use `Map.has(key)`, or compare to the field.", \
    "const o = { a: 1 };\nconsole.log('a' in o);")                                                                    \
  X(PluginRequires, "Z5005", "A plugin needs a capability the target does not have",                                   \
    "A plugin's plugin.json \"requires\" lists the platform capabilities it needs (heap>=4M, fs, dynlib...); the profile in force must offer them.", \
    "Build for a target that has them, or pass --force to build anyway.",                                                                  \
    "// zinc-profile: rmpp\nimport 'zinc:ffi';")                                                                                          \
  X(SystemPermission, "Z5006", "A system module needs a permission",                                                       \
    "The modules zinc:system/<feature> (notification, menu, tray, dialog, window, shortcut, instance, deeplink, autostart, dock, power, clipboard, opener) are denied unless zinc.json lists the "  \
    "permission \"<feature>\" (or \"<feature>:<operation>\"); a project without \"permissions\" can use none.", "Add the id to \"permissions\" in zinc.json.",     \
    "import { isSupported } from 'zinc:system/tray';\nconsole.log(isSupported());")                                                                 \
  X(NativeTypeNotExpressible, "Z5010", "A native member uses a type the native ABI cannot carry yet",                      \
    "A native module is called with scalars (i32, u32, boolean, f64), strings, and arrays of u8, i32 and f64; its Spec lists the members. "  \
    "Callbacks, promises, resources and other number kinds are not expressible yet.", "Change the member to use one of those types.",        \
    "import { NativeModule, requireNative } from 'zinc:native';\ninterface Spec extends NativeModule { f(m: Map<string, i32>): void }\nconst n = requireNative<Spec>('Fixture');") \
  X(NativeNotLinked, "Z5011", "The native module is not linked into this engine",                                      \
    "requireNative<Spec>('Name') needs the module registered in the engine (or a stand-in next to the spec, x.next.ts or x.sim.ts) with the "  \
    "export and signature the Spec describes.", "Link the module, add a stand-in, or fix the Spec to match the module.",                      \
    "import { NativeModule, requireNative } from 'zinc:native';\ninterface Spec extends NativeModule { f(): void }\nconst n = requireNative<Spec>('Nowhere');") \
  X(FixedUnrepresentable, "Z4001", "The value cannot be represented in fixed point",                                      \
    "Under a fixed-point profile (`--profile ps1`, or `// zinc-profile: ps1`) `number` is Q20.12: no Infinity and no NaN, so Math.min() and Math.max() "\
    "with no argument (which are Infinity and -Infinity) have no value.", "Give the call at least one argument.",                                \
    "// zinc-profile: ps1\nconsole.log(Math.max());")                                                                                              \
  X(DynInStrict, "Z1006", "`any` is not allowed in a strict profile",                                                  \
    "A strict profile (the line `// zinc-profile: strict` at the top of the entry file, or `--strict`) keeps every value "\
    "statically typed: `any` and the untyped result of JSON.parse are the gradual (Dyn) part of the language.",         \
    "Give the value a type, use `unknown` and narrow it, or drop the strict profile.", "// zinc-profile: strict\nconst x: any = 1;\nconsole.log(x);")

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
