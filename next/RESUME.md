# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-06. Phase: M3.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0, M1, M2 (the `tour` conformance program is byte-identical to the frozen output; ZN-017), ZN-012 classes, ZN-013 generics/tuples/unions, ZN-014 closures, ZN-015 strings/arrays/Map/Set, ZN-016 modules (see the notes below).
- Done also: ZN-016..ZN-019, ZN-032..ZN-036, ZN-020 (async/await and generators). M3 conformance (ZN-021, the 18 programs of `corpus/M3-set.txt`, report `docs/reports/zinc-next-m3-conformance.md`) is Done. ZN-022 (AOT emitter) and ZN-023 (`tools/diff-matrix`, T2 `tests/t2/diff.sh`: 67 programs, interpreter vs AOT vs frozen output, 0 differences) and ZN-025 (native JSON.parse, Dyn fast paths, strict profile Z1006) and ZN-024 (`tools/bench-m4`, `bench/m4.json`, `docs/reports/zinc-next-m4-benchmarks.md`: 5 of 15 thresholds missed, moved to ZN-025/ZN-026) are Done; next by ordinal: see `tools/next-task` (the 18 M3 programs, `corpus/M3-set.txt`). Nothing in progress.

## Next

`/loop /zn-start` resumes with `next/tools/next-task` (M3 is complete, M4 started).

## Watch out

- The working tree has many unrelated uncommitted changes (compiler, examples, plugins). Never `git add .`; add paths explicitly.
- Do not touch `compiler/` except for fixes.
- Task files record almost no dependencies; `next-task` follows the ordinal order.
- Estimates are unvalidated; ZN-011 is the first decision gate.
- Usage per task is recorded by `next/tools/usage` in the task notes (ZN-002: ~50k in / 1.6M cached / 15k out, estimate).

## Usage per milestone (estimates from `next/tools/usage`, session totals)

| Milestone | Task | Usage |
|---|---|---|
| M0 | ZN-002, ZN-001, ZN-003 | ~150k in / ~5M cached / ~45k out, one session (harness work included) |
| M1 | ZN-004 | ~100k in / ~4M cached / ~35k out (same session, incremental) |
| M1 | ZN-005 | ~80k in / ~3M cached / ~30k out (same session, incremental) |
| M1 | ZN-006 | ~50k in / ~2M cached / ~20k out (same session, incremental) |
| M1 | ZN-007 | ~120k in / ~6M cached / ~60k out (same session, incremental; size L) |
| M1 | ZN-008 | ~110k in / ~5M cached / ~55k out (same session, incremental; size M) |
| M1 | ZN-009 | ~100k in / ~4M cached / ~50k out (same session, incremental; size M) |
| M1 | ZN-010 | ~90k in / ~3M cached / ~45k out (same session, incremental; size M) |
| M2 | ZN-012 | ~130k in / ~7M cached / ~65k out (same session; size L; includes 28-snippet adversarial rounds and an ASan-found parser bug) |
| M2 | ZN-013 | ~600k in / ~18M cached / ~150k out (same session; size L; includes 150+ adversarial snippets and three review rounds) |
| M2 | ZN-014 | ~150k in / ~5M cached / ~45k out (same session; size M) |

## Lexer notes (ZN-004)

- `>` is always a single token: merge adjacent `>`/`=` for `>>`, `>=`, `>>=`, `>>>`.
- JSX: `</` and `/>` are single Punct tokens; whitespace-only children text is a JsxText token.
- Known limits: `<T,>() =>` in .tsx lexes as JSX; regex vs divide decided by the previous token.

## Parser notes (ZN-005)

- Syntax codes Z0001-Z0005 live in `include/zn/diagnostics.h` (Z0005 = unsupported). New codes: add one X(...) entry, one fixture in `tests/golden/*/errors`, regenerate `next/docs/diagnostics.md` with `zinc explain --markdown`.
- Unsupported yet (Z0005): arrows, object literals, modules, generics, modifiers, switch/try/throw, interfaces. Later tasks (ZN-012..) lift them one by one.

## Checker notes (ZN-007) for the IR

- `Checked` gives a type per AST node (`nodeType`), the resolved symbol per Ident (`nodeSym`), types interned in `types`, objects (classes, Math, console) in `objs`. ZN-008 lowers from the AST plus this.
- Numeric kinds are first class (`Num`); `i32 / i32` is f64 (JS semantics); `.length` is i32. Literals adapt to the target kind syntactically.
- Stricter than TS on purpose; the oracle (`next/tools/oracle`, tsc 7 + lib/zinc.d.ts) must accept everything we accept.
- New codes: add the registry entry, a fixture in `tests/golden/checker/errors`, regenerate `next/docs/diagnostics.md`.

## IR notes (ZN-008) for the ZBC emitter

- Functions: `@main` is function 0 (top-level code); methods are `Class.method` with `this` first; constructors `Class.constructor` (synthesized when only field initialisers exist).
- Control flow: block parameters carry values across edges (no phis); `br`/`condbr` edges carry arguments; a `call` may have an unwind edge (not produced yet); `throw`, `unreachable` terminate.
- Types: `ref Class`, `T[]`, `str`, `bool`, numeric kinds. Globals are accessed with `getglobal`/`setglobal`; builtins with `builtin <name>(args)` (list in `include/zn/builtins.h`, shared with the VM).
- Register allocation input: every value has one definition; block params are the only merge points. Value ids are dense per function.
- Unsupported in lowering (Z0005): closures, default parameters, null, spread, for-in.

## ZBC notes (ZN-009) for the interpreter

- Registers are 64-bit slots of class I (all ints, bools), S (f32 bits), D (f64). Ints are kept canonical (sign- or zero-extended); `Narrow*` ops re-canonicalise after narrow arithmetic; `Add/Sub/MulI32` etc. wrap at 32 bits, U32 variants wrap and zero-extend.
- Calls: `Call A, fn`: args are in r[A..A+n), the callee's frame starts at r[A] (callee r0 = first arg), the result is left in r[A]. Everything at or above A is clobbered. Frame size per function is `nregs`; check stack depth against `kMaxCallDepth`.
- `Ret r` copies r to the callee's r0 (= caller's r[A]). `console.log` is `LogX` per argument, `LogSep` between, `LogEnd` newline; the VM owns number formatting (JS Number to string; the golden for fib is `2178309`).
- `LoadI` D is a signed 16-bit immediate; `LoadK` reads the per-function pool. Jump operands are absolute instruction indices.
- Always run `zbc::verify` after decode and before executing (the typed VM relies on it; `zinc zbc --check`). Decode bounds-checks but does not verify.
- The emitter's value correctness is unproven until ZN-010 runs the goldens: if an output differs, suspect regalloc/parallel moves first (`next/src/zbc/emit.cpp`).
- Unsupported (per-function error): heap ops, strings, exceptions (unwind edges), fixed-point kinds.

## M1 gate evidence (for ZN-011)

| Threshold (next/TESTING.md) | Result |
|---|---|
| `fib` output equals golden with no Node | MET (`zinc run`, T0 `run`; also mandelbrot) |
| Checker: every accepted program accepted by the oracle on a 30-file set | MET: 43 files, 0 violations (+ 28 adversarial snippets, 0 violations) |
| Interpreter `fib` at least 5x faster than QuickJS | NOT MET after one optimisation round: 4.45x (56.6 ms vs 252 ms, was 2.15x); mandelbrot 2.7x; Node JIT 51-57 ms (artifacts `next/bench/m1-*.json`, `tools/bench-m1`). Accepted at the gate, see the decision |
| M1 used at most 1.5x its budget | To judge: M1 tasks S,M,S,L,M,M,M (+gate S) = about 15-19 sessions budgeted; the whole M0+M1 ran in one long autonomous session, ~0.6M in / 36.6M cached / 0.33M out tokens, 179 turns (`tools/usage`) |

Options for the speed threshold: (a) keep 5x for the AOT path only and measure the interpreter against QuickJS as "faster" (2x+), (b) invest in immediate-operand and fused compare-branch ops, direct threading (estimated 3-3.5x), (c) accept 2x and let AOT carry the claim. Other findings: libm differs from V8's fdlibm in the last digit for `tan` (bundle fdlibm before transcendental goldens); closures, default parameters, null, spread, heap values in ZBC are still Z0005 / "no bytecode yet" (M2 tasks).

## Classes notes (ZN-012) for the next tasks

- AST: `Class` kids = [extends|none, Heritage|none, members...] (`kClassMembersFrom` = 2); `Interface` kids = [Heritage|none, members...]; modifier bits in `Node::flags` (`kFlag*`), parameter properties become Fields plus synthetic `this.x = x` statements.
- Checker: `ObjInfo` has parent, ifaces, isInterface/isAbstract, ctorAccess; `Member` has owner/access/isStatic/isAbstract. Public helpers `isSubclass`, `lookupMember`, `objAssignable` are used by the IR lowering.
- IR: `Class` has parent, full field layout (inherited first), `implements`, `selectors`, `vtable`; ops `refcast` and `callvirt`; devirtualisation looks at instantiated classes only (`new` sites).
- ZBC: register state `Ref(class)` with subtype checks; `Downcast` is checked at run time; objects leak until RC (ZN-018); the class table is part of the file (format v2).
- Run goldens needing parameter properties are generated with `node --experimental-transform-types` (tools/regen-run-goldens).
- Always test parser changes under the ASan build: `mk()` grows the node vector, never hold a `Node&` across it.
- Not yet: interface properties, accessors (get/set), generics, `instanceof`, arrays/strings in ZBC (ZN-015), TDZ for let/const in the VM (globals read as 0 before initialisation).

## ZN-013 notes (generics, tuples, destructuring, unions) for the next tasks

- Generics: templates are checked once over opaque `Param` types (a type parameter acts as its constraint: `app()`), concrete uses clone the declaration into the AST with `T` bound as a `TypeAlias` and are lowered as ordinary functions/classes named `Box<i32>`, `identity<f64>` (`Checked::instances`, `nodeNames`). Generic methods, static members of generic classes and default type arguments are Z0005. `Ast::nodes` is a deque so the checker can clone while holding node references.
- Tuples are anonymous classes (`ObjInfo::isTuple`, fields `0`, `1`, ...), literals are typed by their expected tuple type; destructuring (arrays, tuples, class instances, nested, in declarations, parameters, for-of and assignments such as `[a, b] = [b, a]`) binds through `bindPattern`; defaults and rest elements are Z0005 (rest only for arrays, not lowered yet).
- Unions: `TK::Union` (flattened, sorted), only references and `null` lower (`T | null` is a reference that may be 0; a union of classes becomes the class they all derive from). Operations on a non-narrowed union are errors. Narrowing (`Checker::narrowing`): `=== / !== null`, `instanceof`, `!`, `&&`, `||`, ternary, early exits, loops (variables assigned in a loop are reset to their declared type at entry), assignment and initialiser narrowing; only local variables and parameters, never properties. Unions of numbers, strings and booleans have no representation yet (boxing is not done).
- Type aliases (`type X = ...`, generic ones included) are resolved lazily in their declaration scope.
- ZBC: `LoadNull`, `InstanceOf`; null is a valid reference everywhere, field access and virtual calls trap on it at run time.
- Still open for M2: closures (ZN-014), strings/arrays/Map/Set through zrt (ZN-015), modules (ZN-016), the `lang` conformance program (ZN-017). The one-way rule against the oracle held on 150+ adversarial snippets; keep running such rounds when you add a feature, and run parser changes under the ASan build.

## Closures notes (ZN-014)

- A lambda is a class (`lambdaN`) with the captured variables (and `this`) as fields, implementing the interface of its function type (`fn (i32) => i32`) whose single method is `call`; calling a function value is `callvirt .call`. A named function used as a value gets a thunk class (`fnref name`).
- A captured variable that is also reassigned (`Symbol::captured && reassigned`, not a global) lives in a cell (`cell T`, one field `v`); other captured variables are copied into the closure. Top-level variables stay globals.
- Checker data for the lowering: `Checked::captures` (transitive), `lambdaUsesThis`, `funcValueUses`; lambdas are checked inline so they see the surrounding scope.
- Unsupported (Z0005 in the lowering): nested named functions that use variables of the enclosing function (use an arrow), a captured `for (let ...)` variable that the loop modifies (JS copies it per iteration), method values (`obj.m` without a call), generic lambdas. Function-value calls are not devirtualised yet.
- Next: ZN-015 puts strings, arrays, Map and Set into ZBC and the VM (ZN-014's tests avoid arrays on purpose).

## ZN-015 notes (strings, arrays, Map, Set)

- ZBC format v3: strings, arrays, Map and Set are builtin classes in the class table (`ClassInfo::kind/elem/key`, one per distinct type, appended after the IR's classes) plus a string table (`LoadStr`). Ops: `ArrGet/ArrSet/ArrLen/ArrPush`, `New` on a collection class, `LogStr`, and `Rt A,id`.
- `include/zn/runtime.h` is the single table of runtime calls (name, signature letters, flags): the checker derives members and types from it, the lowering emits `IrOp::Rt`, the verifier types `Rt` from the letters, `src/vm/rt.cpp` implements them. Adding a string/array/Map/Set method = one row + one VM case. Rt uses a call window like `Call`.
- VM: `Machine` (`src/vm/machine.h`), re-entrant `exec()` (sort calls the comparator through it; entry frames count against the depth limit). Strings are UTF-8 with a UTF-16 view; Map/Set are insertion-ordered hash tables; everything leaks until ZN-018.
- Checker: integer kinds convert implicitly among themselves (wrapping, needed by the kernels); `??` only on nullable references or directly on `Map.get` (which has no `undefined`; use `has`); `Map.values()/keys()` and `Set.values()` return arrays (as lib/zinc.d.ts says; Node returns iterators, so Node-run goldens iterate with for-of).
- Limits: `charCodeAt` out of range gives 0 (not NaN), `pop` on empty gives 0, case mapping only for ASCII, `join` only on `string[]`, no `console.log` of arrays/Map/Set, no `sort()` without comparator, no Map/Set constructor arguments, no for-of directly over Map/Set.

## ZN-016 notes (modules)

- `frontend/modules.{h,cpp}`: `loadProgram(entry, readFile)` parses every file once (relative imports only; `.ts`, `.tsx`, `/index.ts` tried), merges the nodes into one `Ast` (`Node::file`, `Diag::file`, `formatDiag`), orders modules so imports come first, and flattens every module's statements into `root.kids` (imports unwrapped, `export` stripped) so the lowering is unchanged: `@main` runs the modules' top-level code in init order.
- Checker: with `Ast::modules` non-empty each module gets its own scope; imports alias the exporter's symbols (live bindings for free); exports are resolved after the module is checked. `ast.modules` empty = a single parsed file (unit tests, `parse`).
- Position comparisons ("used before declaration") only compare nodes of the same file. New code Z0119 (module not found); missing exports reuse Z0101.
- Limits: default/namespace imports and exports, package imports ('zinc:ui' etc.), circular imports (Z0005), dynamic import. Two modules may declare the same top-level name; names in IR/ZBC dumps are not qualified by module.
- Test: `tests/t0/modules.sh` with `tests/golden/modules/` (output hand-verified; Node cannot run the extensionless imports).

## ZN-032 notes (accessors, enums, switch)

- `get name(): T {}` is a Method with `kFlagGetter`; the class `Member` keeps the method signature and has `getter = true`; a read of `obj.name` is typed as the return type and lowered to a (devirtualised or virtual) call. Setters, static and interface accessors are Z0005.
- Numeric enums: `SymKind::Enum`, a distinct i32 `Type` (`obj` = 1 + index into `Checked::enumNames`) that accepts only its own members but converts to any number; members are constants (`Checked::enumMembers`), initialisers must be integer literals (else Z0005). No `const enum`, no string enums, no reverse mapping.
- `switch`: cases compare with `===` semantics (numbers, strings, booleans, enums); clauses fall through; `break` leaves the switch, `continue` the enclosing loop; a switch with a `default`, no `break` and a last clause that returns counts as terminating.
- Known gap against tsc: tsc narrows `const`/assigned variables to literal types and then rejects comparisons such as `switch (1) { case 2: }` or `d === E.B` after `d = E.A`; we do not, so such programs are accepted by us and rejected by the oracle (pre-existing class: `const x = 1; if (x === 2)`).

## ZN-033 notes (records and object literals)

- An interface made only of data properties (no `extends`, no methods, not generic) is a *record*: `ObjInfo::isRecord`, lowered as a final class whose values come only from object literals (`N::ObjectLit` / `N::Prop`, shorthand `{ x }` supported; methods, spreads, computed keys and optional properties are Z0005). Mixed interfaces (properties and methods) are still Z0005.
- A literal is checked against the record it is expected to be (assignment, argument, return, array element, `T | null`): unknown, duplicate and missing properties are errors. Without an expected record it gets an anonymous record interned by its ordered (name, type) list (`recordOf`), named `{ x: f64; y: f64 }`.
- Records are nominal: two interfaces of the same shape, or an anonymous value passed where a named record is expected, are different types (stricter than tsc, which is structural). Classes are not assignable to records, records cannot be extended, instantiated with `new` or used with `instanceof`.
- Lowering: `New` of the record class and one `SetField` per property in source order.

## ZN-034 notes (console.log of objects, arrays, Map, Set)

- The checker rewrites a `console.log` argument of an inspectable non-primitive type into `__log<id>(arg)`, a formatter generated as Zinc source (`frontend/inspect.{h,cpp}`, a port of Node's `formatValue`/`reduceToSingleString`/`groupArrayElements`: single line within 80 columns, numeric arrays in columns, depth 2 with `[Object]`/`[Array]`, 100-item limit, `-0`, quoting rules, class names, `Map(n) {}`/`Set(n) {}`). The text is parsed and merged into the program (`Ast::generated`, `Checker::mergeSource`), declared in a private scope (`genScope`) and lowered as ordinary functions through `Checked::instances`. The VM and the verifier know nothing about it, so AOT gets it for free.
- Classes dispatch on the dynamic type with an `instanceof` chain over their concrete subclasses (most derived first); interfaces through their implementations; private fields are printed (`inspectMode` bypasses access checks only in generated code). Records print without a name.
- Limits: functions print `[Function (anonymous)]` (Node prints the name), strings longer than 16 characters with newlines are not split across lines, cyclic data recurse forever, non-ASCII strings that need escaping lose surrogate pairs, unions other than `T | null` and generic templates are not inspectable (the bytecode emitter then reports it).
- Programs that never print an object or array carry none of this code (the prelude is added on the first use).

## ZN-035 notes (array and string library)

- Machine numbers now convert implicitly among themselves, including float to integer (truncating), like the number type they alias in tsc and in the old compiler (`let sum = 0; return sum` in an i32 function). Non-integer literals into integer targets and anything involving fixed-point kinds are still errors; an enum accepts only itself.
- `arr.map/filter/some/every/forEach/reduce/concat/findIndex` and `for (... of map|set|string)` are rewritten by the checker into calls of helper functions generated as Zinc source per element and callback type (`Checker::helper`, `callGenerated`, `arrayHof`), the same mechanism as the console.log formatters; nothing new in IR, ZBC or VM. `reduce` needs an initial value; callbacks take only the element (and the accumulator).
- Runtime table: optional parameters `z` (default 0) and `w` (default " "), `slice()` without arguments, `padStart`, `padEnd`, `replace`, `replaceAll`, `parseInt`, `parseFloat`, `String.fromCharCode`; `Math.imul` lowers to a 32-bit multiply. `Math.atan` was removed from the checker: lib/zinc.d.ts has only `atan2`.
- `a || b` and `a && b` on strings and numbers yield an operand (NaN is falsy); a literal on the left is an error, as in tsc (TS2872/2873).
- tools/oracle now mimics the old compiler's configuration (`--noLib --target ES2022 --module ESNext --moduleResolution Bundler` with lib/zinc.d.ts); with the default lib it rejected for-of over Map and Set.
- examples/lang now compiles and runs end to end; its output has section headings the frozen `corpus/conformance/tour.out` does not (that file matches tests/conformance/tour.ts): ZN-017 must settle which program is the reference.

## ZN-017 notes (M2 demo)

- `tests/conformance/tour.ts` (with `./shapes`) prints exactly `corpus/conformance/tour.out`; `examples/lang` runs too and its output is frozen in `tests/golden/lang/lang.out` (the tour split into modules, with headings). Both are checked by `tests/t1/conformance.sh`.
- Added `e as T` (type assertions): numeric conversion, checked downcast, or an object literal read as a record; T must be assignable one way or the other (a subset of what tsc accepts).
- M2 summary: classes, generics, closures, strings/arrays/Map/Set, modules, accessors, enums, switch, records, console.log inspect format, callbacks and the string library, all on the interpreter with Node-identical goldens (`tests/golden/run`). Open from M2: ZN-036, RC (ZN-018, M3), exceptions (ZN-019), async/generators (ZN-020), the remaining 17 conformance programs (ZN-021).

## ZN-036 notes (cycles and function names in console.log)

- The generated formatters carry a context `i64[]`: indent, current depth, the ancestors' identities (slots 2..5), the circular targets found (6..9, count in 10). Containers check their identity against their ancestors first (`[Circular *n]`) and print `<ref *n>` when something below pointed back at them, like Node. Identity comes from the internal runtime call `ObjId` (any reference to an integer; the pointer itself), reached from generated code through the builtin `__identity`.
- Function values print their name: `ClassName` returns the closure class's name (`lambdaN:name`, `fnref name`, or plain `lambdaN` when anonymous); `Checked::lambdaNames` gives a function expression the name JavaScript would infer (`const f = ...`, `f = ...`, `{ f: ... }`, `f = ...` field initialisers). Arrow functions passed or stored anonymously print `[Function (anonymous)]`.
- Parameter properties now come before the declared fields in a class's field order (as the TypeScript-to-JavaScript transform does), so objects print like Node; layout and goldens changed accordingly.
- Still open: strings with newlines longer than 16 characters are not split, functions of other kinds (methods as values) are not supported by the language yet.

## ZN-018 notes (reference counting)

- `ir::insertRc` (src/ir/rc.cpp) runs after lowering in the compile pipeline (`--emit=ir` shows the IR before it, `--emit=ir-rc` after). Conventions: every string, array, Map, Set and object value is owned once; parameters, block parameters and results of New/ArrNew/calls/string ops/runtime calls are new references; loads (GetField, GetGlobal, ArrGet, Map.get) and RefCast lend, so the pass retains them. Stores, call arguments, `ret` and edge arguments consume; a value used again after a consuming use is retained first; a value is released after its last use or on the edge where it stops being live (critical edges are split). String constants and null are never retained or released. Runtime-call ownership is in `include/zn/runtime.h` (`rtConsumes`, `rtResultBorrowed`); calls that return their receiver (Map.set, Set.add, sort, reverse) return a new reference.
- ZBC: `Retain A` / `Release A` (verified as reference registers). VM: counts in `Obj::rc` (immortal = 0xFFFFFFFF for constants), `Machine::destroy` releases iteratively in the order the native C++ runtime would: an object's fields in reverse declaration order, array elements first to last, Map entries first to last; SetField, SetGlobal and ArrSet release the value they overwrite; globals are released in reverse order when main returns; `ZN_LEAK_CHECK=1` makes `zinc run` fail when objects remain, `ZN_TRACE_FREE=1` prints one `free <class> #<allocation number>` line per destroyed object to stderr.
- Differences from the old native runtime, deliberate: a local dies at its last use, not at the end of its scope (the destruction point is now a property of the IR). Cycles leak (a Button whose callback captures the button, cyclic data); there is no cycle warning yet (design 5.3).
- Safety note: the verifier does not prove that Retain/Release balance. Compiler output is balanced (the whole corpus runs clean under ASan with zero leaks outside the two cyclic programs), but hand-written bytecode could release twice and free an object that is still in use. Do not run untrusted bytecode until a reference-count verifier exists (or the bundle is signed).
- Elision so far is only "the last use consumes" (no retain, no release); borrowed parameters and load/store pairing are not optimised. Measured: the kernels run at the same speed as before.
- Tests: `tests/t1/rc.sh` (leaks over the corpus, destruction order `tests/golden/rc/order.trace`).

## ZN-019 notes (exceptions)

- Language: `throw` (only Error subclasses), `try/catch/finally` (the catch variable is an `Error`; `catch (e: T)` annotations are ignored), `using` with `[Symbol.dispose]()` (disposed in reverse order, also on exceptions, return, break and continue). `Error`, `TypeError`, `RangeError` are Zinc source in `frontend/modules.cpp` (`kErrorPrelude`), added in front of the program when it throws, catches, or mentions them; `Error(message: string)` needs its argument and converts to text through the hidden method `__errorString()` ("Name: message"), so `Error.toString` is not callable by user code (tsc's `Error` has none). Runtime faults (null, bounds, division by zero) are still traps, not catchable (decision 0006).
- IR: a call inside a try has an unwind edge `edges[0]` to a handler block whose single parameter is the exception (no arguments on the edge); the call ends its block so the handler sees the variables as they were. `throw` inside a try is a `br` to the handler with the exception; elsewhere a `Throw` terminator. Handlers snapshot the variables at try entry, so locals assigned inside a try (or a using scope, or a catch body when there is a finally) live in cells (`Checker::markCells`). `finally` bodies and `using` disposals are inlined on every path (normal, each return/break/continue crossing them, and a catch-all handler that rethrows).
- RC: `insertRc` computes which functions can throw, gives every call that can unwind and has owned values a cleanup pad (`release` them, then `br` to the handler or `throw`), and extends liveness to handlers.
- ZBC format v4: `Function::handlers` (call pc, target, class, register). The VM unwinds frame by frame, taking the first handler whose class matches the thrown object, delivering the object in its register. An exception that reaches the entry of the program (or a native callback such as a sort comparator) is fatal: `uncaught exception: <class>`.
- Tests: goldens `exceptions` (Node-identical), the frozen `errors` conformance program (byte-identical; `tests/t1/conformance.sh`), leak-free (`tests/t1/rc.sh`), verifier unit tests for handlers, ASan T1 green.
- Limits: `new Error()` needs a message (no default parameters yet); `e.stack`, `cause` and `finally` overriding a return value with a jump are untested; no `catch` by type (use `instanceof`); exceptions do not cross native callbacks; user subclasses that override `toString` print through `__errorString` when typed as Error.

## ZN-020 notes (async/await and generators)

- No coroutine support in the IR or VM: `src/frontend/desugar.cpp` rewrites async functions and generators into continuation-passing code over closures before checking (`desugarAsync`, called by `loadProgram`). Code is written as text and spliced with the user's nodes by `src/frontend/snippet.cpp` (`__H<n>` holes; the checker also uses it for `for...of` over a Generator).
- The Promise, microtask queue, timers (virtual clock, delays below 1 ms count as 1 like Node) and `Generator<T>` are Zinc source in `kAsyncPrelude` (modules.cpp); `__runLoop();` is appended to the entry module.
- Checker: `Promise<void>` is the class `PromiseV` (rewritten syntactically); `p.then/p.catch` become `__then/__thenV/__thenFromV/__thenVV/__catch/__catchV` (receiver kind and callback result decide); `__await` becomes `__awaitV` for a PromiseV; `Promise.resolve/all` become `__resolved(V)/__all`.
- Supported positions of `await`/`yield`: statement, variable initialiser, assignment (any operator), returned value, inside blocks, if, while, for, for-of over arrays, try/catch. Everything else (finally around await, switch, expressions, async arrows/methods, async generators, `yield` as a value) is Z0005.
- Generators are lazy: `next()` runs continuations until one sets `value`; `Generator.next(): boolean` and `value[0]` differ from JS iterator results, `for...of` is the supported way to consume them. A loop that skips yields recurses once per skipped iteration in async mode only (generators trampoline through `cont`).
- Rewritten loops are self-referencing closures: they reassign themselves to an empty lambda when the loop ends, and an abandoned generator (`break` in a for-of) calls `close()`, which releases them (`onClose`). Leak-free under ZN_LEAK_CHECK. `ZN_DUMP_AST=1` dumps the program tree after desugaring to stderr.
- Tests: goldens `tests/golden/run/{async,generators}`, errors `tests/golden/checker/errors/{await_position,generator_no_type,async_arrow}`, T1 conformance runs `tests/conformance/async.ts` against `corpus/conformance/async.out`.

## ZN-037 notes (library gaps)

- Array methods are Zinc source generated per element type (`arrayHof` in check.cpp): callbacks may take (element, index), reduce (acc, element, index); new find/findLast/findLastIndex/reduceRight/fill/lastIndexOf, indexOf/includes with a start index (includes is SameValueZero), `join` of any element type (strings still use the runtime join). Rewritten calls are recorded in `rewritten`, so checking them twice is harmless.
- `find`/`findLast` return `T | null` for objects (only under `??` or in console.log); on numbers, booleans and strings only in console.log, as text ('undefined' when missing), because nullable primitives do not exist yet (ZN-040). Annotations like `number | null` or `string | null` are Z0005 instead of crashing the lowering.
- `libraryCall` (check.cpp) rewrites `Number(x)`, `String(x)`, `Boolean(x)`, `Number.parseInt/parseFloat/isInteger/isSafeInteger`, the Number constants, `Math.min/max` with any argument count, unary `+`/`-` on strings and booleans, and `JSON.parse(text)` (validates only, as a statement: its value needs Dyn, ZN-039). A trailing `undefined` argument is dropped.
- Runtime: trimStart/trimEnd/concat, positional includes/startsWith/endsWith/indexOf, `$$ $& $\` $'` in replace, `__toNumber` (Number of a string), `join` default separator letter `y` in zn/runtime.h, string escapes `\u`, `\u{}`, `\x` as UTF-8, Math.min/max signed zeros.
- Time is deterministic: `Date.now()` and `performance.now()` read the event loop's virtual clock (setTimeout 0 does not round up to 1 ms); setInterval/clearInterval added. `Date` has only `now`.
- Prelude: `SyntaxError` joined the Error prelude; a JSON validator prelude is added when `JSON` appears. Rt ids shifted: ir and zbc goldens were regenerated.

## ZN-040 notes (nullable primitives, JSON.stringify)

- `T | null` representation (option A): strings, arrays, Map and Set keep their own IR type and may hold null (`Const` with `imm == ir::kNullConst`, emitted as `LoadNull` of the builtin class; `s === null` is a reference comparison, `EqR`); numbers and booleans live in a box class `Box<type>` created on demand by the lowering (`boxClass`), so `number | null` is a reference that is null or holds the value. `coerce` boxes a number where the union is expected and unboxes where the checker narrowed it (`Ident` reads, `??`); `boxCompare` handles `x === y` with nullable operands.
- Array literals mixing `T` and `null` are `(T | null)[]`; `console.log` of a value known to be `null` prints `null`; `string | null` prints like a string at the top level.
- JSON.stringify(x) of one argument: a generated serialiser per type (`jsonFunction` in inspect.cpp, `jsonSym` in check.cpp), same closure mechanism as console.log formatters; classes dispatch on `instanceof`, records and classes serialise fields in layout order, Map and Set give `{}`, functions are skipped. A replacer or indent is Z0005.
- Property narrowing (`n.name !== null` then `n.name.length`) still does not exist: copy to a local first. `find`/`findLast` still print 'undefined' text on primitive arrays in console.log only.

## ZN-038 notes (language gaps)

- Optional members: `name?: T` in interfaces and object types is a property of type `T | null` (flag kFlagOptional); an object literal that leaves it out gets `null`. Class fields written `x?: T` are still plain `T`.
- Spread: `[...a, 1, ...b]` is `a.concat([1]).concat(b)` (a leading literal takes the expected element type); `{ ...a, x: 1 }` becomes one property per field of `a` (the spread expression must be cheap to repeat).
- Default parameters are evaluated at the call site (a default that reads another parameter is unsupported). Callee-side `new` and virtual calls do not pad defaults yet.
- Optional chaining `a?.b`, `a?.f()`: the checker types it `T | null` (`flags & kFlagOptional`, only on nullable receivers; a single object, string, array, Map or Set), the lowering evaluates the receiver once (`optionalAccess`). `a?.b.c` does not short-circuit the whole chain: write `a?.b?.c`.
- Interface properties: a property of an interface that also has methods is a getter on the interface; classes satisfy it with a field (synthesised getter, `fieldGetter` in the lowering) or a getter. Interfaces made only of properties stay records.
- Object types `{ kind: 'circle'; r: number }` are anonymous records; a string-literal property type is `string` plus the literal (`Member::literal`). A union of records is an IR interface the records implement (`unionIface`); `s.kind` on the union reads the field by dynamic class; `s.kind === 'x'`, `!==` and `switch (s.kind)` narrow the union, and a switch covering every member counts as terminating (`exhaustiveSwitch`). console.log of such unions dispatches with `instanceof` on anonymous records (synthetic class symbols in the generated scope).
- Static generic methods are generic functions named `Class.method` (instances are plain functions); instance generic methods are still Z0005. `??=`, `||=`, `&&=` rewrite to `a = a ?? b` (the read side is a clone of the target).
- `@weak`, `@pooled(n)` and other decorators parse and are ignored; `Arena.frame(n)` exists as a no-op class with `[Symbol.dispose]` (prelude `kArenaPrelude`). A `for (let ...)` loop variable that closures capture and the loop modifies is copied per iteration.
- `a ?? b` joins the types when they differ (a union of two classes, or the wider one); `T | null` for function types works; Map.get is allowed in console.log (null when missing); string `lastIndexOf` added.

## ZN-039 notes (Dyn: any and unknown)

- Representation (option A): a Dyn is a reference to a class of the Zinc prelude `src/frontend/dyn.cpp` (`Dyn`; `DynUndef`, `DynNull`, `DynBool`, `DynNum`, `DynStr`, `DynArr`, `DynObj` over a `Map<string, Dyn>`, and `DynRefT<T>`, a live view of a typed object with closures for get/set/has/format/json). The prelude comes with `any`, `unknown`, `undefined` or `JSON.parse` in the program, together with the console.log and JSON helpers (inspectPrelude, jsonPrelude).
- Types: `any` is `tDyn` (assignable to and from everything), `unknown` is the class `Dyn` (accepts everything, converts back only by narrowing or `as`). In the prelude and in generated code (`rawDyn()`) `any` behaves as the class Dyn itself.
- Conversions are inserted by `require()` (`convertDyn`): `__dynTo<t>` wraps a typed value (numbers, strings, arrays by copy, objects as views), `__dynFrom<t>` is a checked conversion back (TypeError `cannot convert Dyn (string) to number`; records are rebuilt field by field, classes only unwrap their own view). Converters are generated per type (`dynConverter`, `dynSym`), like the console.log formatters.
- Operators, property reads and writes, index, `typeof`, `in`, `instanceof`, `!`, unary +/-, `==`, `===`, `&&`, `||`, `??`, `++`, compound assignments and `for...of` on a Dyn are rewritten into helper calls (`__dynAdd`, `__dynGet`, `__dynSet`, ...). `typeof x === 'number'` and `x instanceof C` narrow a Dyn variable (reads of the narrowed variable are the checked conversion). Object literals where an `any` is expected, and literals with computed keys, are dynamic objects (`__dynObjOf`).
- JSON.parse builds a Dyn tree (error message `JSON.parse: invalid JSON`); JSON.stringify and console.log of a Dyn use `__dynJson` and `__fmtDyn`. `typeof` of a typed value is a constant string.
- Uncaught exceptions: the VM prints `panic: Uncaught <Name>: <message>` (the exception's `__errorString()`) on stderr and exits with 101; the conformance runner prints the frozen `[exit 101] ...` line from it.
- `ZN_DUMP_GEN=1` prints the generated Zinc source (formatters, serialisers, Dyn converters) to stderr.
- Not done: method calls on a Dyn (`d.f()`), `?.` on a Dyn, bitwise operators on a Dyn, Map/Set views.

## ZN-022 notes (AOT emitter)

- Architecture (option A, ARCHITECTURE.md updated): `include/zn/ops.h` holds the value semantics of every pure operation (`ZN_ARITH_OPS`, `ZN_DIV_OPS`, `ZN_JUMP_OPS`, `ZN_JUMP_IMM_OPS`, `AddI32K`); the interpreter's dispatch loop and the generated C++ both call them. `src/rt/` is the runtime both engines share (machine, objects, RC, rtCall, `rt::op::*` for the object instructions, `runModule`, `report`, `runProgram`). `Machine::exec` is the only function the engine provides: the interpreter (src/vm/vm.cpp) or the compiled program.
- `src/aot/aot.cpp` (`emitCpp`): one C++ function per ZBC function over the interpreter's register window (`int f(Machine&, Slot* r)`, 0 done, 1 exception in `m.thrown`, 2 trap in `m.error`), labels at jump and handler targets, handler tables as per-call-site `isSubclassRT` checks, the call depth counted in `m.depth`. The module is embedded as ZBC bytes and loaded by the same `Machine::load`, so classes, vtables, strings and globals are identical to the interpreter's.
- `zinc --emit=cpp f.ts` prints the C++; `zinc build f.ts -o out` writes `out.cpp` (kept with ZN_KEEP_CPP=1), compiles it with `$CXX` (default `c++`) against `include`, `src` and the `libzn_*.a` next to the zinc binary, so it works from a build directory only (installation and the zig toolchain are later tasks).
- All 38 programs of tests/golden/run print the same compiled as interpreted. Rough times, interpreter vs AOT: fib 0.05 vs 0.02 s, nbody 0.56 vs 0.14, mandelbrot 0.26 vs 0.02, spectralnorm 1.11 vs 0.27, sort 0.29 vs 0.25 (the registers still live in memory; promoting them to C++ locals is a later optimisation, ZN-024/026).
- Also added for binarytrees: narrowing of `local.field` (`node.left === null`, assignments to the property; depth one, a symbol per property in `pathSyms`).
- Tests: T0 `tests/t0/aot.sh` (golden `tests/golden/aot/fib.cpp`, syntax check), T0 `tests/t0/rt.sh` + `tests/unit/ops_test.cpp`, T1 `tests/t1/aot.sh` (fib, nbody, binarytrees, sort and five run goldens built and compared).

## ZN-024 notes (benchmarks)

- `tools/bench-m4` runs the 11 kernels (new: `tests/bench/kernels/dynsum.ts`, the Dyn kernel; `corpus/bench/dynsum.out`) as interpreter, AOT, QuickJS (types stripped with Node) and the old native build (`tests/bench/kernels/build/<k>-macos/cmake/app`), checks every output, takes the median of 11 runs and writes `bench/m4.json` and the markdown report. Exit code 1 while a threshold is missed.
- Missed (measured): interpreter vs QuickJS on fib 4.46x, mandelbrot 2.78x, spectralnorm 3.78x (need 5x); AOT vs native on nbody 3.65x (need 3x); dynsum 12x slower than QuickJS (JSON.parse is Zinc code in the interpreter). Acceptance for them moved to ZN-026 (passes: inlining, fused ops, register locals in AOT) and ZN-025 (native JSON.parse, inline caches).

## ZN-025 notes (Dyn performance, strict profile) and the library policy

- Policy (user, 2026-10-06): prefer proven libraries over our own code everywhere; ARCHITECTURE.md rule added; vendored libraries live in `third_party/` (README lists them). First one: mimalloc (v2.1.7) serves global new/delete and the runtime's objects (`src/rt/alloc.cpp`, off under ZN_SANITIZE so ASan keeps its checks; `zinc build` links `libzn_mimalloc.a`). Number to string now uses `std::to_chars`. Candidates seen on this machine for later: yyjson/simdjson (not needed now: parsing was never the bottleneck, object construction is), double-conversion, utf8 libraries, PCRE2/re2 for RegExp.
- JSON.parse: `Rt::JsonParse` (runtime.h letter `r` = result class of the second argument) builds DynNum/DynStr/DynBool/DynArr/DynObj objects directly; `Machine::resolveDyn` finds the classes by name. `Rt::DynGetFast` and `Rt::DynAddFast` are fast paths the prelude tries first (0 means: take the Zinc slow path). `total += d` on a number is `__dynAddNum`.
- Strict profile: `// zinc-profile: strict` in the first 400 bytes of the entry file, or `--strict` on the command line (`Ast::strict`); `any` and JSON.parse give Z1006; `unknown` stays allowed.
- Benchmarks were rerun on a loaded machine (see the caveat in docs/reports/zinc-next-m4-benchmarks.md); rerun on an idle one before trusting thresholds. dynsum is within about 10 percent of QuickJS; its threshold moved to ZN-026.

## ZN-026 notes (in progress)
- `src/ir/opt.cpp` (`optimize`, before `insertRc`; `ZN_NO_OPT=1` disables): single-target devirtualisation (RefCast when the receiver is wider) and inlining of callees up to 40 instructions that return and do not recurse. Measured gain (min user ms, interpreter): spectralnorm 1070 to 980, fannkuchredux 1320 to 1270; no change on fib, nbody, mandelbrot, sort (little to inline). The "two kernels" gain is small, not decisive.
- `rc.cpp` `lendsForever`: borrowed loads in functions that never lend a ref away get no retain/release (nbody `advance` has none now) but AOT time did not move (100 ms).
- `aot.cpp`: leaf functions keep registers in C++ locals (nbody 130 to 100 ms).
- zbc goldens regenerated (inlining changes the code). T0, T1, T2 green.
- Later in ZN-026: float consts hoisted out of loops, loop counters updated in place (emit.cpp), fused f64 compare-and-jump (JEqF..JNLeF, NaN-correct). AOT thresholds, dynsum, jsonout pass; interpreter still 3.0 to 4.8x QuickJS on fib/mandelbrot/spectralnorm, moved to ZN-041. ZN-026 Done.
- (superseded) Still open: interpreter dispatch cost (fib/nbody/mandelbrot are 3 to 5x QuickJS, need 5x), AOT nbody 3.3x native (needs 3x), dynsum, and an idle-machine run of `tools/bench-m4`.

## ZN-027 notes (Done)
- Host calls are `Rt::HostGfx*` (owner `host`, flag 2) -> `zn::host::Gfx` table (`include/zn/host.h`) installed by `src/host/gfx_host.cpp` (links `../runtime`: zrt, raster, gfx, `targets/null/hal_null.cpp`, `targets/common/hal_posix.cpp`; C++17 flags of the old build, `ZN_HOST_GFX`). The runtime starts lazily on the first `frames()` call.
- `zinc:gfx` is a module written in Zinc (`kGfxModule` in `modules.cpp`) over `__host_*` builtins; the frame loop (`__gfxLoop`) replaces `__runLoop` through `__frameHook`; timers fire in the old runtime's order (`__frameTimers`).
- Run headless like the old tool: `ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=n ZINC_SHOT=out.png ZINC_SHOT_FRAMES=n zinc run prog.ts`. Compare with `tools/pngdiff`. Tests: T0 `host.sh` (frame 20 vs `corpus/ui/clock-20.png`), T1 `ui.sh` (frames 20 and 60 vs `tests/visual`).
- `src/host/baked_resources.cpp` is the old build's resource file trimmed to 6 fonts and no TTF data; other programs need their own (a later task should generate it without Node).
- Next: ZN-028 (JSX lowering).

## ZN-028 notes (Done, scope split)
- `src/frontend/jsx.cpp`: token-based port of `compiler/src/jsx.ts`, run by the module loader on every `.tsx` file before parsing (`lowerJsx`). Solid and React helpers, `@jsxHelpers ./mod` pragma, Show/For, `&&`, `?:`, `.map`, fragments, components. Not ported: `style` attribute, VirtualList, React class components, class-name and hook-rule checks (ZN-044).
- Checker: callbacks with fewer parameters than expected get unused parameters, only in generic call arguments (`padCallbacks`); generic inference takes a lambda's result type when the parameter type mentions unbound type parameters.
- Tests: T0 `jsx.sh` with `tests/golden/jsx/` (a recording stand-in for the helpers). The React model has no golden yet (needs `zinc:ui/react` to resolve).
- Next tasks by ordinal: ZN-044 (compile the zinc:ui stack, tests/visual/ui.tsx frame 1 in the interpreter), ZN-045 (AOT with the host), then ZN-029.
