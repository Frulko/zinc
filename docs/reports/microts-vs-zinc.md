# MicroTS against Zinc Next: what to take

Date: 2026-10-12. Research only; nothing was built or run. MicroTS side: a shallow clone of PocketJS at commit 8a08f203
(2026-10-10), read as untrusted data; paths marked `PJ/` are in it, all others in this repository. Unchecked claims say "not verified".
Not repeated: `docs/engines.md` ("Measurements and PocketJS findings") and `docs/reports/hardware/pocketjs-pocket3d.md`, which predate MicroTS.

## 1. What MicroTS is

An ahead-of-time compiler from Solid TSX or Vue SFC views, plus an optional typed TypeScript "model" subset, to Rust. The generated
Rust links the `microts` crate (a `no_std` + `alloc` crate over PocketJS's retained UI core), so the app runs with no JavaScript
engine (`PJ/microts/README.md:3-8`, `PJ/engine/crates/microts/src/lib.rs:23`). The same sources also run as ordinary JavaScript on
QuickJS or in a browser. Status "in development" (`PJ/microts/README.md:11`). The compiler is TypeScript run by Bun
(`PJ/microts/compiler/`, about 11,000 lines in 47 files).

Three modes (`PJ/site/content/docs/typescript-support.md:24-28`): ordinary guest app (no admission); `app.model: "rust"` (view is
compiled, the model is a handwritten Rust trait implementation); `app.model: "compiled"` (the model `.ts` is compiled too). In
compiled mode a rejected body never falls back to a guest interpreter or to handwritten Rust (`microts-model.md:35-41`).

### Supported subset (compiled model, from `typescript-support.md`)

| Area | Admitted | Rejected |
|---|---|---|
| Types (59-92) | `boolean`, `string`, `i8..u64`, `usize`, `f32`, `f64`, arrays, interfaces, string-literal unions and enums, discriminated object unions, optionals, tuples, newtypes, `Px/Deg/Ms/Color`, `Cap<T, N>` | `any`, `unknown`, `null`, `bigint`, classes, function values, `Map`, `Set`, `Record`, mapped and index-signature types |
| Numbers (110-146) | Untyped `1` infers `i32`, `1.0` infers `f64`; `idiv`/`imod` explicit; float to int by `trunc/floor/ceil/round`; 8/16/32-bit wrap, `f32` rounding | `number` under `--strict`; a cast is not a conversion |
| Expressions (155-179) | arithmetic, comparisons, ternary, `??`, template strings, struct/array literals; collection functions `len/map/filter/find/some/copy/equals` as free functions | truthiness in conditions, `xs.map(...)`, `.length`, `Math.*`, spread, `!`, `satisfies` |
| Statements (294-315, 400-413) | `if`, `for`, `for-of`, `switch`, `while`, `do`, `break`, `continue`, in-place array operations, early `return` | `try/catch`, `throw`, `for-in`, labels, generators, classes, namespaces, dynamic `import()` |
| Functions (250-292) | named functions, fixed typed parameters, recursion (dev depth guard `app.recursionLimit` 256, omitted in release), inline arrows only at known sites | optional/rest/destructured parameters, generic model functions, closures stored or returned |
| Reactive state (337-360) | `createSignal`, memo, effect, `on`, `batch`, `untrack`; Vue `ref/computed/watch` | an effect whose subscriptions depend on control flow (needs `on([...])`); cycles |
| Async (362-391) | `async` becomes a state machine; awaitables `frames`, `after`, `until`, `join`, `all`, `any`, `net.get`, `animate` | native promises, `.then`, `fetch`, timers |

### Admission

The checker-based front end refuses anything outside the table, with no fallback. Each failure is
`file:line:column: message` (`PJ/microts/compiler/aot-ir.ts` `AotCompileError`). `fail()` throws on the first problem
(`PJ/microts/compiler/aot-types.ts:13`), so one error is reported per run (single-error behavior: not verified beyond that line).
A second layer, `--board <name>`, checks the input the program demands (buttons, axes, motion level, touch), inferred from the view,
against a board profile: codes VB102 to VB106 (`PJ/microts/compiler/aot-admission.ts:23-45`). The negative corpus pins message text
and position per fixture (`PJ/tests/aot-model-differential.test.ts:14-20`).

### Two IRs

- View IR format 1 (`PJ/microts/compiler/aot-ir.ts`): serializable, language-neutral. Components, element nodes with style ids and
  memoized bindings, `if`/`for`(keyed)/`component`/`slot` nodes, typed expressions with source locations. Both the Solid and the Vue
  Vapor front ends produce it (`aot-solid-frontend.ts`, `aot-frontend.ts`, vendored Vapor shape in `vendor/vue-vapor-ir.ts`).
  Version-checked by every consumer; a View IR file alone regenerates the view (`microts-model.md:55-60`).
- Model IR format 1 (`PJ/microts/compiler/aot-model-ir.ts`): modules (root, factory, pure, state) with signals, fields, memos,
  effects, functions and tasks. Every expression and statement carries a `Ledger` of reads, writes, subscriptions and external
  effects (`aot-model-ir.ts:4-11`, built in `aot-model-ledger.ts`); the ledgers fix a static reaction `schedule` (line 58) and make
  a dependency cycle a compile error. `aot-model-tasks.ts` lowers each `async` function to numbered task states.

### Generated Rust

| Topic | What is generated |
|---|---|
| Ownership | Read/prop form borrows (`&str`, `&[T]`), owned form owns (`String`, `Vec<T>`) (`typescript-support.md:59-75`, `PJ/microts/compiler/aot-codegen.ts:105-106`). A non-primitive signal read is an immutable view; mutation needs `copy(...)`; values kept across `await` become owned snapshots (`typescript-support.md:332-335`). |
| Integers | Operators lower to `wrapping_add/sub/mul/neg` (`aot-codegen.ts:228,245`); generated crates build with `overflow-checks = false` (`microts.md`, Cargo snippet). Division and remainder go through `idiv/imod` (zero divisor gives 0). |
| Strings | `String` normally; `Cap<string, N>` becomes `heapless::String<N>`, `Cap<T[], N>` becomes `heapless::Vec<T, N>`. Capacity is UTF-8 bytes or element count; overflow traps in development and truncates at a character boundary in release (`typescript-support.md:105-108`). `Cap` does not make the app allocation-free (same lines). |
| Views | Nodes created with `ui.create_node/insert_before`. Each dynamic binding is a field `Option<T>` holding the previous value; every update re-evaluates the expression and applies it only if `!=` (`aot-codegen.ts:649-653`). |
| Frame | `frame(input)` resumes ready tasks, dispatches input, runs reactions, then updates the view if a handler ran or the model changed (`aot-app-codegen.ts:109`; order in `microts-model.md:109-114`). |
| Host | A `Host` trait with `model_ready` and `model_command`; tasks emit commands into a `&mut Vec<Cmd>` sink; each wait has a `RequestId` so late deliveries cannot resume another call or mount (`microts-model.md:130-155`). |

### Views and Solid signals
Signals declared in the `.ts` model become typed getters/setters on a generated view-model trait (`microts.md`, "Follow one binding").
JSX is not run: `<Show>`, `<Switch>`, keyed `<For by=...>`, slots and context are compiled to mount/unmount/reconcile code. A
view-local `createMemo` is inlined at each read (`microts-solid.md`, table). So the view has no subscription graph at all: it is a
compiled "recompute every binding of the component, patch what changed" pass, triggered by invalidation. Compile-time layout is a
further step: a `layout-baked` subtree has its rects solved at build time and stored as constants or small formulas
(`PJ/microts/compiler/aot-layout-plan.ts:1-22`, `microts-reference.md:255-295`).

### Testing

- 34 `aot*` test files in `PJ/tests/`. Fixtures under `tests/fixtures/aot-model/{core,negative}` hold a hand-written `expected.json`
  and an input tape; each case is run through the reference interpreter, the generated Rust, and the transformed JS guest (twice, the
  second as replay) and the per-frame state, trace, work counts and host commands must match
  (`aot-model-differential.test.ts:22-40`; `model-harness.ts:35-103`).
- Seeded generative fuzzer `PJ/microts/compiler/model-fuzz.ts` (`bun run test:fuzz`): typed grammar, 12 probe families, 4 fixed seeds,
  integer boundary values, coverage tags, 7 invalid-program probes with fixed diagnostics, failure reduction (`model-fuzz.ts:1,19-25`).
  `model-view-fuzz.ts` does the same for views. Documented as "a local command" (`microts-boundaries.md:204`), not a CI gate.
- Metamorphic test (`aot-model-metamorphic.test.ts`): rewrites the IR (shadowing, copying views) and expects identical behavior.
- Capacity test (`aot-model-capacity.test.ts`): overflow traps in dev, truncates in release, in all three executors.
- Allocation tests: a counting global allocator proves zero allocations in selected bounded fixtures
  (`aot-model-codegen.test.ts:164-167`); the Solid lab runs under a 24 MiB cap (`aot-model-resources.test.ts:7`).
- Stated limits (`typescript-support.md:420-434`): optional chains, `>>>`/`~`, a middle `switch default`, arrays of optionals and tuple
  expressions pass the front end but fail later; `i64/u64` lose precision in the JS guest. ESP32 is compile and link only
  (`microts-boundaries.md:202-204`).

## 2. Zinc Next, same axes

| Axis | Zinc Next |
|---|---|
| Pipeline | Strict TypeScript, C++20 frontend, typed SSA IR, then ZBC (interpreter) or C++ (AOT) or a QuickJS engine (`docs/reports/zinc-next-design.md:63-69`, `next/ARCHITECTURE.md`). No JS engine needed on the main path. |
| Subset | Much larger than MicroTS's model: classes, generics, unions, tuples, destructuring, closures, async, generators, JSX (design 5.1; D102 in `docs/reports/zinc-next-decisions.md`). Outside it: `var`, `eval`, regex literals, `with`, holey arrays, `any` in strict profiles. |
| Numbers | Machine types are real source types: `i8..u64`, `f32`, `f64`, `fx12`, `fx16` (`next/src/frontend/check.cpp:31-39`; `lib/zinc.d.ts:4-6`); `number` is `f64`; `i32` wraps; profiles lower numbers in one pass (design 5.2, line 99); fixed-point is bit-identical (`next/include/zn/ops.h:34-60`). |
| Admission | Registry of 40 `Z` codes, each with title, why, fix, example and one fixture, enforced by `tests/t0/diagnostics.sh`; `zinc explain Zxxxx`; nearest-name hints; several errors per run (`next/include/zn/diagnostics.h:1-5`, `next/src/frontend/diagnostics.cpp:30-35`). Target admission is a declared `requires` list checked against `targets/capabilities.json` (`docs/targets/capabilities.md`, "Requirements"). |
| IR | One typed SSA IR (`next/src/ir`), with reference counting inserted as explicit ops (`next/src/ir/rc.cpp:1-13`) so destruction order is a property of the IR. No separate model/view IR. |
| Ownership | Reference-counted heap objects; borrowed parameters and lent loads elide most retains (D50, D51); `Arena.frame()` scopes (`lib/zinc.d.ts:288`). Strings: UTF-8 storage, UTF-16 indices (`docs/guide/02-language.md:15`). |
| Semantics | Pure ops defined once in `next/include/zn/ops.h`, called by the interpreter and by the C++ the AOT writes (`ops.h:1-4`); limits (recursion) defined once in `next/include/zn/limits.h`. |
| Views | JSX is rewritten at token level to calls on a Solid runtime written in Zinc (`next/src/frontend/jsx.cpp:1-5`, `lib/std/solid.ts`); layout, styling and painting run in `lib/std/ui.ts` (5,729 lines) at run time. Tailwind-style classes are resolved to style records at compile time (`jsx.cpp`, class tables). |
| Reactivity | A runtime signal graph: `Computation` objects, subscriptions, ownership (`lib/std/solid.ts:109-121`); an effect that reads no signal is dropped right after its first run (same lines). |
| Tests | Corpus differential `next/tools/diff-matrix` (interpreter, AOT, frozen output) over fixed programs; five libFuzzer targets for parse, check through ZBC verifier, native ABI, ZPK (crash/hang only, `docs/reports/zinc-next-fuzzing.md`); `layout-fuzz` against headless Chrome; T0/T1/T2 tiers. A Csmith-style generator is only an idea (`docs/reports/zinc-vm.md:387-389`); no generator exists in `next/tools` (not verified beyond a directory listing). |
| Boards | Per-profile `heap` and `numbers` (esp32 160K f32, ps1 256K fx12); `allocations()` of zinc:sys checks at run time that a frame does not allocate (`alloc_stats.h:1-2`). No compile-time memory bound. |

## 3. Things worth taking, ranked

Ranking weighs value for Zinc's users (education, makers, artists; modest machines, boards) against size.

### 3.1 Generative differential fuzzing of the three engines (M)

MicroTS: a seeded typed-grammar generator emits a program plus an input tape; the result is run by a reference interpreter and by
each backend and compared frame by frame; invalid-program probes check the exact diagnostic; failures are reduced
(`PJ/microts/compiler/model-fuzz.ts`, `model-harness.ts`, `aot-model-metamorphic.test.ts`).
Zinc today: fixed-corpus `diff-matrix` plus crash-only libFuzzer. The goal "interpreter, AOT and `--engine quickjs` match byte for
byte" (`next/RULES.md` line 8) is only proven on programs somebody wrote. Why: wrap-around, `f32` rounding, string indices, RC order and
fixed point are where three engines drift, and nobody sees it until a demo breaks.
Take: a small generator over the strict profile (integers of every width, `f32`, strings, arrays, closures), outputs hashed and
compared across interpreter, AOT, QuickJS; a fixed seed set in T1, a long run in T2; plus a metamorphic pass (rename, inline,
reorder independent statements). This is `zinc-vm.md:387` made real. Size M.

### 3.2 Program-inferred demands checked against a board (S to M)

MicroTS infers which buttons, axes, touch and motion a program uses and refuses a board that lacks them, with a code and a reason
(`PJ/microts/compiler/aot-admission.ts:23-45`; `--board`, `--boards` in `microts-reference.md:389-395`).
Zinc: `requires` in `zinc.json` or `plugin.json` is declared by hand; a module's `@requires` is checked on import
(`docs/targets/capabilities.md`). Whether the compiler infers the need from `onPointer*`, `touch`, `keyboard` or `gamepad` use in
JSX and `zinc:ui` is not verified in `next/src/frontend/capabilities.cpp`; the file reads declared strings only. Why: a maker
who builds for a button-only panel gets "this app needs a pointer" at build time, not a dead screen. Take: derive demands from
the lowered JSX attributes (`jsx.cpp` `kPointerAttrs`) and the imported modules, report them through the existing capability
check and a Z code with a fix. Size S to M.

### 3.3 Numeric-kind parity in the QuickJS path (M)

MicroTS rewrites arithmetic in the JS output so `i8/i16/i32` wrap and `f32` rounds as in Rust (`PJ/microts/compiler/aot-numeric-semantics.ts:34-45`
and `aot-model-js.ts`), then tests it against Rust.
Zinc: the QuickJS engine "blanks the type syntax in place" and runs plain JS numbers (`next/src/qjs/strip.h:2-4`); the stripper
works from the parser, with no type information, and a grep of `next/src/qjs` for `imul`/wrap found nothing. So an `i32` overflow,
a `u8` wrap or an `f32` sum probably differs between `--engine quickjs` and the typed engines (not verified by running). The
product rule is one result per program. Take: use checker types to emit `Math.imul`, `|0`, `>>>0`, `Math.fround` at typed sites
when the program declares machine types (programs using only `number` pay nothing). Needs the checker's types in the stripper,
hence M, not S.

### 3.4 Capacity-bounded strings and arrays for boards (M, then L)

MicroTS: `Cap<string, N>`, `Cap<T[], N>` carry a bound in the type; overflow traps in development, truncates in release; bounded
fixtures are proven allocation-free after mount (`typescript-support.md:105-108`, `aot-model-capacity.test.ts`).
Zinc: `T[]` and `string` are growable heap objects; a profile has only a total heap number and a runtime allocation counter. Why:
on a 160 KiB ESP32 the real failure is a heap that fragments or runs out after hours; a bound makes it a design-time fact for
students and makers. Take in two steps: (a) a branded type `Cap<T, N>` checked by the frontend, with a trap on overflow in all
engines (same semantics everywhere, so no dev/release split: Zinc's rule is identical behavior, design 5.5); (b) later, inline
storage in the AOT output. (a) is M and already useful as documentation plus a guard; (b) is L. Do not copy the "truncate in
release" rule: it contradicts D14's byte-identical principle.

### 3.5 An engine-neutral input and service tape (S to M)

MicroTS: a JSON tape of frames (buttons, axes, service deliveries, virtual clock, targets) drives any executor and every frame's
state and commands are compared (`microts-model.md:62-67`, `PJ/microts/compiler/aot-model-tape.ts`).
Zinc: scripted pointer events exist in tests (`next/tests/t2/input_aot.sh:2`) and `ZINC_FRAMES`/`ZINC_DETERMINISTIC`, but no tape
format shared by interpreter, AOT and QuickJS (not verified beyond that). Why: it makes a UI regression test a file a student can
record, and it feeds 3.1. Size S to M.

### 3.6 Compile-time lowering of view reactivity (L, opt-in)

MicroTS: no signal graph; each binding is a previous-value slot and a per-component update pass (`aot-codegen.ts:649-653`).
Zinc: every non-literal JSX binding is an effect with a `Computation` object, source and cleanup lists (`solid.ts:109-121`).
Value: on 160 KiB devices and e-ink panels, no per-binding heap objects and a deterministic update order are real gains; the
cost is O(bindings) work per update instead of O(changed). Fit with Zinc is partial: Zinc's Solid runtime is full (dynamic
dependencies, nested roots, user effects), and MicroTS gets its simplicity by refusing control-flow-dependent subscriptions
(`typescript-support.md:349-352`). Take only as an opt-in lowering for small profiles on views with literal structure. Size L.
Not before measuring Computation cost on the esp32 profile.

### 3.7 Unit newtypes (S, low priority)

MicroTS has `Px`, `Deg`, `Ms` and branded ids as distinct numeric types (`typescript-support.md:74-75,137-140`). Zinc has none in
`lib/zinc.d.ts` or `lib/std/ui.ts` (grep found no such types). For learners, mixing pixels and milliseconds becomes a compile
error; needs the checker to accept `T & {__brand}` (not verified). Size S.

### 3.8 Compile-time baked layout (L, later)

`layout-baked` subtrees: rects solved at build time, with a full-tree oracle (`aot-layout-plan.ts:1-22`). Good for fixed-viewport
panels, useless for resizable windows; Zinc's layout runs in `lib/std/ui.ts`. Park until a board shows layout as the cost.

### 3.9 Not worth taking

- The model/view contract split (view-model trait, basename `.ts`/`.d.ts`): it exists because the view crosses into Rust while the
  model may stay handwritten; Zinc compiles one program, so it would only add files.
- Static reaction schedule and ledgers (`aot-model-ledger.ts`): they require refusing programs Zinc wants to run.
- Generated host contracts with drift checks: already adopted (`docs/engines.md:251`, `next/include/zn`, `tools/abi-check`);
  MicroTS byte-compares generated Rust with the committed file (`PJ/contracts/spec/gen-rust.ts:1-7`), equivalent to `abi-check`.
- Dev/release differences (trap vs truncate, recursion guard omitted): Zinc defines limits once for all tiers.

## 4. Where Zinc is ahead, or chose differently

| Point | Zinc | MicroTS | Record |
|---|---|---|---|
| Language breadth | classes, generics, closures, async, generators, try/catch | none of these in a model (`typescript-support.md:225,311`) | design 5.1; D102 |
| One definition of semantics | `zn::ops` shared by interpreter and AOT; RC ops in the IR | three executors (reference interpreter, JS lowering, Rust) kept in line by tests; known gaps (`typescript-support.md:420-434`) | design 5.5; `ops.h:1-4` |
| Numeric exactness | bit-identical across engines, no fast-math, fixed point profiles | JS guest loses i64/u64 precision | D14; `ops.h:34-60` |
| Diagnostics | 40 coded entries, explain, fixtures, several errors per run | first failure thrown as a located message | `diagnostics.h:1-5` |
| `@ts-ignore` | refused: types are compiled into the code | not found in the docs read (not verified) | D20, D88 |
| Zero-JS app | `zinc run` compiles drawing programs to native code (D43); interpreter stays for fast start | no engine, but Rust/Cargo toolchain and a host per target | D43; design 5.7 |
| Toolchain | C++20, pinned `zig c++`; no JIT (AOT is the upper bound) | Bun + Cargo + per-target host | design line 69; D13, D36 |
| UI breadth | GPU and software renderers, kit, 3D, assets pipeline | retained core with a small draw list (older report) | D49, D58, D95 |
| Reactivity | full Solid semantics with dynamic dependencies | refuses control-flow-dependent effects | `solid.ts` |

Zinc's rule (RULES §1) is that an accepted program runs on every engine or is a Z-coded error; MicroTS documents several
"accepted by the front end, fails later" cases (`typescript-support.md:420-434`).

## 5. Licence

`PJ/LICENSE` is the MIT licence, copyright 2026 Yifeng "Evan" Wang, for the repository. `microts/` and `engine/crates/microts/` have no
licence file of their own, and `engine/Cargo.toml:40` says `license = "MIT"`. The Pocket3D licence (`LicenseRef-Pocket3D-1.0`,
named in `PJ/package.json:4`) covers `pocket3d/`, `devices/` and `engine/pocket3d/` (`PJ/pocket3d/LICENSE`, `PJ/devices/LICENSE`),
not MicroTS. MIT would allow copying with the notice kept, but the Zinc rule stands: ideas only, no copied code. Every item in
section 3 is an idea (a test method, a type, a diagnostic) to be written fresh in C++/Zinc against Zinc's own IR. The
vendored `vue-vapor-ir.ts` is a type shape of Vue's compiler, a separate upstream licence, irrelevant to Zinc.

## 6. Not determined
- Whether a Zinc test covers `i32`/`u8`/`f32` overflow under `--engine quickjs` (3.3 reads `strip.h`, no run).
- Whether Zinc's compiler infers input demands anywhere (3.2): only `capabilities.cpp` and the docs were read.
- MicroTS test results, zero allocations and the ESP32 link are the documentation's claims, not confirmed.
- How many errors MicroTS reports per run (only `fail()` was read).
