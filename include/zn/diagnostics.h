#pragma once
// The diagnostics registry: the only place a diagnostic code, title, explanation, fix or example is written.
// Messages, `zinc explain` and docs/diagnostics.md are all generated from this table. Its English title, why and fix are repeated in
// i18n/en/diag.json for the translators (`zinc explain --catalog` prints them; tests/t0/diagnostics.sh keeps the two the same, D159).
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
  X(JsxClass, "Z0006", "`class` in JSX: write `className`",                                                            \
    "JSX is the language React defines: `class` is a keyword of JavaScript and TypeScript, so the attribute that "     \
    "carries the style classes, and the prop of a component that takes them, are named `className`.",                 \
    "Rename the attribute to className (`<View className=\"p-4\">`) and declare the prop of your components as className; " \
    "`zinc migrate jsx-classname --apply` rewrites a whole project.", \
    "function App(): i32 {\n  return <View class=\"p-4\" />;\n}")                                                     \
  X(JsxLowercaseTag, "Z0007", "JSX components start with a capital letter",                                          \
    "As in React and React Native, a JSX tag names a component and components start with a capital letter: `<View>`, " \
    "`<Text>`, `<Button>`, `<Image>`, `<ScrollView>`, `<Canvas>`, `<Input>`, `<TextArea>` or one of yours. A lowercase " \
    "tag is not a component of Zinc.", "Write the capitalised component the message names: `<view>` is `<View>`, `<scroll>` is `<ScrollView>`; " \
    "`zinc migrate jsx-capitalised-tags --apply` rewrites a whole project.", \
    "function App(): i32 {\n  return <view />;\n}")                                                                    \
  X(CannotFindName, "Z0101", "Cannot find name",                                                                      \
    "The identifier is not declared in this scope, or is declared later in the same scope.",                          \
    "Declare it before use, or fix the spelling.", "let a = b;")                                                       \
  X(DuplicateDeclaration, "Z0102", "Duplicate declaration",                                                            \
    "A name can be declared only once per scope.", "Rename one of the declarations.", "let a = 1;\nlet a = 2;")        \
  X(NotAssignable, "Z0103", "Type is not assignable",                                                                  \
    "The value's type cannot be used where another type is expected. Machine numeric kinds (i32, f64, ...) are "      \
    "distinct: only lossless widening is implicit, and conditions must be boolean. `number` is f64 (f32 or fixed "    \
    "point on some boards, see --profile); messages say number.",                                                       \
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
  X(InOperator, "Z9026", "The `in` operator is not supported on a typed value",                                       \
    "The properties of a typed object are fixed, so `\"a\" in o` is known when compiling.", "Use `Map.has(key)`, or compare to the field.", \
    "const o = { a: 1 };\nconsole.log('a' in o);")                                                                    \
  X(PluginRequires, "Z5005", "A plugin needs a capability the target does not have",                                   \
    "A plugin's plugin.json \"requires\" lists the platform capabilities it needs (heap>=4M, fs, dynlib...); the profile in force must offer them.", \
    "Build for a target that has them, or pass --force to build anyway.",                                                                  \
    "// zinc-profile: rmpp\nimport 'zinc:ffi';")                                                                                          \
  X(SystemPermission, "Z5006", "A system module needs a permission",                                                       \
    "The modules `zinc:system/<feature>` (notification, menu, tray, dialog, window, shortcut, instance, deeplink, autostart, dock, power, clipboard, opener) are denied unless zinc.json lists the "  \
    "permission `\"<feature>\"` (or `\"<feature>:<operation>\"`); a project without \"permissions\" can use none. "  \
    "The host features (net, fs, process, serial, camera, microphone, location) are checked at run time by their modules once zinc.json has \"permissions\": zinc:camera's devices() and open() fail naming \"camera\" in an exported app.", "Add the id to \"permissions\" in zinc.json.",     \
    "import { isSupported } from 'zinc:system/tray';\nconsole.log(isSupported());")                                                                 \
  X(NativeTypeNotExpressible, "Z5010", "A native member uses a type the native ABI cannot carry yet",                      \
    "A native module is called with scalars (i32, u32, boolean, f64), strings, and arrays of u8, i32 and f64; its Spec lists the members. "  \
    "Callbacks, promises, resources and other number kinds are not expressible yet.", "Change the member to use one of those types.",        \
    "import { NativeModule, requireNative } from 'zinc:native';\ninterface Spec extends NativeModule { f(m: Map<string, i32>): void }\nconst n = requireNative<Spec>('Fixture');") \
  X(NativeNotLinked, "Z5011", "The native module is not linked into this engine",                                      \
    "`requireNative<Spec>('Name')` needs the module registered in the engine (or a stand-in next to the spec, x.next.ts or x.sim.ts) with the "  \
    "export and signature the Spec describes.", "Link the module, add a stand-in, or fix the Spec to match the module.",                      \
    "import { NativeModule, requireNative } from 'zinc:native';\ninterface Spec extends NativeModule { f(): void }\nconst n = requireNative<Spec>('Nowhere');") \
  X(WorkerMessageNotData, "Z5012", "A worker's message type is not data",                                                \
    "A worker shares nothing with its parent: each message is copied as data. Numbers, i32, u32, booleans, strings, u8[] buffers, arrays, "     \
    "T | null and records (interfaces and object types of those) cross; maps, sets, functions and class instances do not.",                     \
    "Send a record of the data instead (a Map as an array of [key, value] records, an object as its fields).",                                  \
    "import { Worker } from 'zinc:worker';\nconst w = new Worker<Map<string, i32>, number>('./work.ts');")                                         \
  X(WorkerEntryNotStatic, "Z5013", "A worker's file is not named by a literal",                                                \
    "A worker is a second program compiled with this one, so its file must be known at build time: a string literal, or "                      \
    "`new URL('./file.ts', import.meta.url)`.", "Write the worker's path as a literal.",                                                            \
    "import { Worker } from 'zinc:worker';\nconst file = './work.ts';\nconst w = new Worker<number, number>(file);")                              \
  X(FixedUnrepresentable, "Z4001", "The value cannot be represented in fixed point",                                      \
    "Under a fixed-point profile (`--profile ps1`, or `// zinc-profile: ps1`) `number` is Q20.12: no Infinity and no NaN, so Math.min() and Math.max() "\
    "with no argument (which are Infinity and -Infinity) have no value.", "Give the call at least one argument.",                                \
    "// zinc-profile: ps1\nconsole.log(Math.max());")                                                                                              \
  X(DynInStrict, "Z1006", "`any` is not allowed in a strict profile",                                                  \
    "A strict profile (the line `// zinc-profile: strict` at the top of the entry file, or `--strict`) keeps every value "\
    "statically typed: `any` and the untyped result of JSON.parse are the gradual (Dyn) part of the language.",         \
    "Give the value a type, use `unknown` and narrow it, or drop the strict profile.", "// zinc-profile: strict\nconst x: any = 1;\nconsole.log(x);")

// What a beginner meets in the lessons and the templates (ZN-774.28, after Rust's error index and Elm's messages): per code, the page of
// docs/learn (or docs/guide) that teaches it and two or three fixed versions of the registry's example, each opening with a comment that
// says what it changes. `zinc explain` and docs/diagnostics.md print them under the example; tests/t0/explain_fixes.sh compiles the
// example (it must give its code) and every fix (it must give none).
// X(code, page, fix1, fix2, fix3): fix3 may be ""
#define ZN_DIAGNOSTIC_FIXES(X) \
  X("Z0001", "learn/01-window-and-shape", \
    "// Give the variable a value after =\nlet x = 0;", \
    "// Or say only its type, and give it a value later\nlet x: number;\nx = 1;", \
    "") \
  X("Z0002", "learn/01-window-and-shape", \
    "// One value per statement\nlet a = 1\nlet b = 2;", \
    "// Or an operator between the two values\nlet a = 1\nlet b = 2 + 3;", \
    "// Or two statements, each ending with ;\nlet a = 1\nlet b = 2; let c = 3;") \
  X("Z0003", "learn/01-window-and-shape", \
    "// Close the string on the same line\nconst s = \"abc\";", \
    "// A text over several lines goes between backquotes\nconst s = `abc\ndef`;", \
    "") \
  X("Z0004", "learn/02-colours-and-movement", \
    "// The variable that changes goes on the left of =\nlet a = 0;\na = 1 + 2;", \
    "// To compare two values, write ===\nconst a = 3;\nconsole.log(1 + 2 === a);", \
    "") \
  X("Z0006", "learn/07-components", \
    "// className carries the classes\nfunction App(): i32 {\n  return <View className=\"p-4\" />;\n}", \
    "// and a component of yours takes them as className too\nfunction Card(props: { className: string }): i32 {\n  return <View className={props.className} />;\n}\nfunction App(): i32 {\n  return <Card className=\"p-4\" />;\n}", \
    "") \
  X("Z0007", "learn/07-components", \
    "// Components start with a capital letter\nfunction App(): i32 {\n  return <View />;\n}", \
    "// A list that scrolls is a ScrollView\nfunction App(): i32 {\n  return <ScrollView><Text>Hello</Text></ScrollView>;\n}", \
    "") \
  X("Z0101", "learn/01-window-and-shape", \
    "// Declare b before it is used\nlet b = 1;\nlet a = b;", \
    "// A function of the engine: import it from its module first\nimport { width } from 'zinc:gfx';\nlet a = width();", \
    "// Or check the spelling: names are case-sensitive\nlet total = 1;\nlet a = total;") \
  X("Z0102", "learn/02-colours-and-movement", \
    "// Give the second variable another name\nlet a = 1;\nlet b = 2;", \
    "// Or change the first one's value: no let the second time\nlet a = 1;\na = 2;", \
    "") \
  X("Z0103", "learn/01-window-and-shape", \
    "// A number where a number is expected\nlet a: i32 = 1;", \
    "// Or declare that it holds a text\nlet a: string = \"x\";", \
    "// Or turn the text into a number\nlet a: number = parseFloat(\"1.5\");") \
  X("Z0104", "learn/01-window-and-shape", \
    "// Pass what the function declares\nfunction f(a: i32): i32 { return a; }\nf(1);", \
    "// Or declare a second parameter\nfunction f(a: i32, b: i32): i32 { return a + b; }\nf(1, 2);", \
    "// Or give it a default value, so it can be left out\nfunction f(a: i32, b: i32 = 0): i32 { return a + b; }\nf(1);\nf(1, 2);") \
  X("Z0105", "learn/02-colours-and-movement", \
    "// A value is used without parentheses\nlet a = 1;\nconsole.log(a);", \
    "// Or make it a function\nconst a = (): i32 => 1;\na();", \
    "") \
  X("Z0106", "learn/02-colours-and-movement", \
    "// Use a member the type has (the cheat sheet lists them)\nlet a = 1;\nconsole.log(a.toFixed(2));", \
    "// Or make an object that has the property\nconst a = { foo: 1 };\nconsole.log(a.foo);", \
    "") \
  X("Z0107", "learn/02-colours-and-movement", \
    "// Numbers with numbers\nlet a = 1 - 2;", \
    "// Or turn the text into a number first\nlet a = 1 - parseFloat(\"2\");", \
    "// + joins a number and a text into a text\nlet a = 1 + \"x\";") \
  X("Z0108", "learn/02-colours-and-movement", \
    "// A value that changes is declared with let\nlet a = 1;\na = 2;", \
    "// Or keep it constant and make a new one\nconst a = 1;\nconst b = a + 1;", \
    "") \
  X("Z0109", "learn/01-window-and-shape", \
    "// Say the type of each parameter\nfunction f(a: number) {\n  return 1;\n}", \
    "// and, to be clear, the type it returns\nfunction f(a: number): number {\n  return a + 1;\n}", \
    "") \
  X("Z0110", "learn/01-window-and-shape", \
    "// Return a value on every path\nfunction f(a: i32): i32 {\n  if (a > 0) return 1;\n  return 0;\n}", \
    "// Or with else\nfunction f(a: i32): i32 {\n  if (a > 0) return 1;\n  else return -1;\n}", \
    "") \
  X("Z0111", "guide/02-language", \
    "// Give the field a first value\nclass A {\n  x: i32 = 0;\n}", \
    "// Or set it in the constructor\nclass A {\n  x: i32;\n  constructor(x: i32) { this.x = x; }\n}", \
    "") \
  X("Z0113", "learn/08-state", \
    "// Index an array\nconst a = [1, 2, 3];\nconsole.log(a[0]);", \
    "// Or the characters of a text\nconst a = \"abc\";\nconsole.log(a.charAt(0));", \
    "") \
  X("Z0116", "guide/02-language", \
    "// Write every member the interface lists\ninterface I { f(): i32; }\nclass A implements I {\n  f(): i32 { return 1; }\n}", \
    "// Or do not claim the interface\ninterface I { f(): i32; }\nclass A { }", \
    "") \
  X("Z0117", "guide/02-language", \
    "// Make the field public\nclass A { x: i32 = 1; }\nconst a = new A();\nconsole.log(a.x);", \
    "// Or keep it private and read it through a method\nclass A {\n  private x: i32 = 1;\n  value(): i32 { return this.x; }\n}\nconst a = new A();\nconsole.log(a.value());", \
    "") \
  X("Z0119", "learn/01-window-and-shape", \
    "// The engine's modules start with zinc: (the cheat sheet lists them)\nimport { width } from 'zinc:gfx';\nconsole.log(width());", \
    "// Or declare the value in this file\nconst x = 1;\nconsole.log(x);", \
    "") \
  X("Z1001", "learn/02-colours-and-movement", \
    "// A value that changes: let\nlet x = 1;\nx = 2;\nconsole.log(x);", \
    "// A value that does not: const\nconst x = 1;\nconsole.log(x);", \
    "") \
  X("Z1007", "learn/08-state", \
    "// Keys that come and go belong in a Map\nconst o = new Map<string, i32>();\no.set('a', 1);\no.delete('a');", \
    "// Or an optional property set to undefined\nconst o: { a?: i32 } = { a: 1 };\no.a = undefined;", \
    "")

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

// The site the documentation is published on: a page of docs/ is <kDocsUrl><path without .md>/ (site/docs-map.mjs)
inline constexpr const char* kDocsUrl = "https://frulko.github.io/zinc/docs/";

struct DiagFixes {
  const char* code;
  const char* page;      // learn/01-window-and-shape: docs/learn/01-window-and-shape.md
  const char* fixes[3];  // "" when there are two
};
inline constexpr DiagFixes kDiagFixes[] = {
#define X(code, page, f1, f2, f3) {code, page, {f1, f2, f3}},
    ZN_DIAGNOSTIC_FIXES(X)
#undef X
};
inline const DiagFixes* findFixes(std::string_view code) {
  for (const DiagFixes& f : kDiagFixes)
    if (code == f.code) return &f;
  return nullptr;
}

inline const DiagInfo* findDiag(std::string_view code) {
  for (const DiagInfo& d : kDiagnostics)
    if (code == d.code) return &d;
  return nullptr;
}

}  // namespace zn
