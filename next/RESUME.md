# Zinc Next: resume

Overwritten at the end of every session. Run `next/tools/status` (or `/zn-resume`) for the live state.

## State

- Date: 2026-10-06. Phase: M2.
- Design: `docs/reports/zinc-next-design.md`. Rules: `next/ARCHITECTURE.md`. Tests: `next/TESTING.md`.
- Done: M0, M1, M2 (the `tour` conformance program is byte-identical to the frozen output; ZN-017), ZN-012 classes, ZN-013 generics/tuples/unions, ZN-014 closures, ZN-015 strings/arrays/Map/Set, ZN-016 modules (see the notes below).
- Ready: none; next by ordinal is ZN-018 (explicit RC insertion and elision, milestone M3). Nothing in progress.

## Next

`/loop /zn-start` resumes with ZN-018.

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
