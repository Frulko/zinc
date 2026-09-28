# The Zinc VM: a typed register interpreter, with JIT tiers where they are allowed (design)

Design study, 2026-09-28. Status: proposal. It builds on `docs/reports/ios-core-runtime.md` (the iOS core, `.zbc`
bundles, OTA, App Store rules), which it does not repeat. The prototype lives in `research/vm-proto/` and is
not part of the build. The sources are listed at the end.

## Summary

- **One bytecode, three engines.**
  - `.zbc` is a typed register bytecode emitted from MIR.
  - **Tier 0** is an interpreter built from musttail handlers. It runs everywhere, including iOS.
  - **Tier 1** is a copy-and-patch baseline JIT whose stencils come from the same handler source. It runs on
    macOS, Linux, Android and the Pi.
  - **Tier 2** is an optimizing JIT for hot typed loops, built on the MIR project's backend.
- **Measured on the prototype** (M1 Pro, four kernels, median wall time):
  - The best interpreter (tail calls, pre-decoded operands, an accumulator pinned in machine registers) is
    **6.6–10.7× faster than QuickJS** and **2.0–5.3× faster than Hermes** (Hermes 0.12 bytecode, `-O`).
  - It is **2.8–15× slower than Zinc native**, with a geomean around 6×. The 15× case (spectralnorm) falls to
    about 9× once a MIR inlining pass is modeled.
- **What the prototype taught:**
  - Typing removes tag checks. The **accumulator** is the next biggest win: 20–28% on float kernels.
  - Switch dispatch costs 1.5–1.8× more than threaded dispatch.
  - Super-instructions and `preserve_none` barely register.
  - On a latency-bound float loop, a naive template JIT that keeps slots in memory is **no faster than the
    interpreter**. The same JIT with typed slots pinned to machine registers runs at **1.3× native**.
  - So the JIT's value comes from register allocation, which typed bytecode makes almost free.

## 1. Bytecode

### Register machine, not stack

The literature points the same way.

- **Lua 5.0** moved from a stack VM to a register VM with three-address, 32-bit instructions. Each statement of
  their example compiles to one instruction instead of three or four. The paper measures a loop at 44% of Lua
  4.0's time, and fib at 72%.
- **Hermes** is register-based with 8-bit register operands ("no function ever uses more than 256 registers")
  and `Long` variants for spills and far jumps.
- **V8 Ignition** is a register machine plus an implicit accumulator.

The counterexamples are stack machines for a reason:
- Dart's kernel bytecode interpreter (the `DART_DYNAMIC_MODULES` path) is stack-based because it maps
  straight from Kernel AST.
- Wasm interpreters such as Wizard and JSC's IPInt interpret stack code **in place**, to avoid a translation
  pass, and pay for it with side tables.

Zinc has an SSA MIR with a CFG, so a register allocator comes for free: registers are MIR values after
coalescing. Register code also maps 1:1 onto a JIT's virtual registers. **Register**, then.

### Typed operations

Sema already decides the machine type of every MIR value (`i32`, `u32`, `f64`, `f32`, fixed point, `bool`,
`String`, `Ref<T>`, `Array<T>`, `Fn`, `Dyn`). Opcodes therefore carry the type:
- `ADD_I32`, `ADD_F64`, `LT_I32_JMP`;
- `AGET_F64` / `ASET_REF` with bounds checks;
- `GETF_F64 dst, obj, #offset`, a field at a fixed C++ offset;
- `CALL`, `CALL_AOT #thunk`, `CALLV` (vtable slot), `CALLF` (closure);
- `DYN_*`, which only appears in gradual code.

Consequences:
- There is no tag check or boxing anywhere in typed code. A register is the raw C++ word, as
  `ios-core-runtime.md` requires for shared values.
- The loader's **verifier** is a type checker over registers, like the JVM's split verifier. It checks
  operand types per op, branch targets and frame sizes.
- Fixed point gets its own ops (`MUL_FX16`), so the result is bit-identical to `zrt::Fx<F>`.

### Encoding

- **Instructions:**
  - 32-bit words: 8-bit opcode, then `A B C` (8 bits each) or `A Bx` (8 + 16).
  - A `WIDE` prefix gives 16/32-bit operands, like Hermes's `Long` forms.
  - Jumps carry a 16-bit signed offset, or a following word.
  - Constants live in a per-function pool. `f64` constants use `K`-operand variants (`ADDK_F64`, `DIVK_F64`,
    `KDIV_F64`, as in Lua 5.4), so no `LOADK` is spent in inner code.
- **At load**, each function is **pre-decoded** into 16-byte `{handler*, a, b, c, flags, imm32}` records. That
  memory is plain data, so this is legal on iOS.
- **The accumulator.** The prototype adds one operand value, `ACC`, which is legal in the typed-value positions
  of each op:
  - Pre-decoding picks a handler specialization per combination of accumulator operands, e.g.
    `MUL_F64<acc=A|B>` becomes `fmul d0, d0, d1`.
  - MIR's single-use expression temporaries (a value defined and consumed by the next op) are the ones assigned
    to `ACC`.
  - This is V8 Ignition's accumulator and wasm3's `r0`/`fp0`, but typed. There are two accumulators, one integer
    and one float, which never need to be distinguished at run time.

### Super-instructions

Candidates:
- compare-and-branch (`LT_I32_JMP`);
- `FORLOOP` (increment, compare, branch);
- `GETF`+arith (`ADDF_F64 dst, obj, #off`);
- `AGET`+arith;
- `CALL_AOT` with its error check (`CHECK` folded in, RT-05).

In the prototype, `FORLOOP` versus its two-op expansion made no measurable difference (±3%, noise): out-of-order
cores overlap a cheap extra dispatch. Super-instructions should come from profiles of the conformance suite
(counting op pairs) rather than intuition. The ones that pay remove memory traffic: `GETF`+arith, and array
access with its bounds check folded.

### Inline caches for Dyn

Typed objects need no cache: `GETF` uses the C++ field offset from `abi.ts`'s class descriptors.

Caches only matter for `Dyn` (decision 0014). Today `DynObj` is a hashed `Map<String, Dyn>` and there are no
per-site caches (DYN-04 was deferred). The VM version:
- **Hidden classes for `DynObj`.** Add a `Shape*` (an interned, transition-linked key list) and store values in a
  slot vector. Insertion order is preserved by construction, so JSON output stays identical.
- **Per-site cache.** `DYN_GET dst, obj, #key, #ic` indexes a per-function IC array: `{Shape*, slot}` in the
  monomorphic case, 4 entries in the polymorphic one, then megamorphic. This is Hermes's `GetById … cacheIdx`,
  and Luau's scheme where the compiler predicts a hash slot and the VM corrects it at run time.
- **Typed objects seen through Dyn.** The cache keys on the class id and caches the field offset plus a type
  tag. That replaces today's virtual `zrt_get`/`zrt_set` string compare.
- **`Map<K,V>` and records**, when typed, are not Dyn and need no IC.

The native emitter can use the same `Shape` and IC layout later; it is a runtime change that is not VM-specific.

### Quickening without a JIT

Rewriting pre-decoded records at run time is plain data mutation and is allowed on iOS:
- The `DYN_ADD` handler rewrites itself to `DYN_ADD_NUM` after seeing two numbers, falling back on a miss.
- `DYN_GET` rewrites to `DYN_GET_MONO` with the shape and slot inlined in the record.
- `CALLV` rewrites to a direct `CALL` when a site stays monomorphic. It is guarded by a class-id compare.

CPython 3.11's specializing interpreter follows this pattern. Typed code rarely needs it: Sema already
specialized it.

## 2. Dispatch: measured

The prototype (`research/vm-proto/vm.cpp`) is about 500 lines. It has 34 typed ops, whose semantics are written
once as macros and expanded into each strategy. Four kernels from `tests/bench/kernels` are hand-assembled the
way MIR would lower them (same algorithms, sizes and float evaluation order). Every engine prints byte-identical
output, and `run.mjs` asserts it.

`node research/vm-proto/run.mjs --runs 7` measures median wall time from spawn to exit, in ms, on an M1 Pro
running macOS 15.7 with Apple clang 21 `-O2`.

The machine was shared with other jobs (load average ~15), so compare within a row. Absolute times are about
10–20% above PERF.md's quiet run.

An earlier run agrees within about 10%: tail-acc took 40 / 71 / 366 / 646 ms, and tail 40 / 93 / 492 / 862 ms.
A third run at load 20–26 was discarded; even native mandelbrot moved 4× in it.

| Kernel | switch | goto | goto-direct | tail | **tail-acc** | tail-acc, no FORLOOP | tail-acc + inline | Zinc native | QuickJS | Hermes 0.12 (hbc) | Node 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fib | 77 | 46 | 43 | 43 | **43** | 41 | 42 | 12 | 282 | 226 | 85 |
| mandelbrot | 157 | 89 | 98 | 99 | **78** | 75 | 77 | 28 | 836 | 154 | 82 |
| nbody | 636 | 396 | 477 | 463 | **361** | 365 | 359 | 39 | 2730 | 1373 | 350 |
| spectralnorm | 1072 | 769 | 949 | 900 | **656** | 675 | 382 | 44 | 4315 | 2026 | 123 |

The strategies:
- **switch**: `for(;;) switch` over the instruction words.
- **goto**: computed goto, token-threaded (`goto *L[op]`) over 8-byte words.
- **goto-direct**: computed goto, direct-threaded over pre-decoded 16-byte records.
- **tail**: `[[clang::musttail]]` handler chain over pre-decoded records.
- **tail-acc**: tail, plus the int and f64 accumulators as handler arguments, i.e. pinned in `x2`/`d0`.
- **+inline**: spectralnorm's `A(i,j)` inlined, as a MIR inlining pass would do.

A `preserve_none` build of tail-acc measured within 3% of tail-acc.

What the measurements say:
1. **Switch is last everywhere**, 1.4–1.8× slower than the threaded variants. It is kept only as the portable
   fallback (MSVC, old GCC).
2. **Without the accumulator, the threaded variants are within about 10% of each other.** Token threading over
   8-byte words even beats 16-byte pre-decoded records on the float kernels, because the instruction stream is
   smaller.
3. **The accumulator is the big lever:** −20% on mandelbrot, −22% on nbody and −27% on spectralnorm compared
   with `tail`. It is only natural with musttail, where the handler arguments *are* machine registers. Clang
   then compiles `MUL_F64 ACC, ACC, r5` to five instructions: `ldr x4,[x0,#16]!; ldurb w8,[x0,#-7]; ldr d1,[x1,x8,lsl#3]; fmul d0,d0,d1; br x4`.
   With computed goto, one label per specialization would have to be written by hand.
4. **Calls dominate after that.** spectralnorm makes 40 M calls to `A`. Inlining it cuts the time by 42%.
   Frames are the Lua scheme: the callee's window starts at the caller's argument base, so `CALL` does no
   copying. MIR inlining of small leaf functions is worth more to the VM than to native code, where clang
   already inlines.
5. **The residual gap to native** is frame traffic: every operand is a load or store relative to `fp`. On
   nbody, native keeps the whole body pair in registers, and the VM does 3 `GETF` per field update.
6. CPython measured the same thing. Its tail-call interpreter's first "10–15%" win shrank to 1–5% once a clang 19
   computed-goto regression was accounted for. The dispatch technique matters less than what the handlers keep
   in registers.

**Choice:**
- musttail handlers with pre-decoded records and accumulator specializations (clang, and GCC ≥ 15, which has
  `musttail`);
- computed goto on 8-byte words where musttail is unavailable;
- switch as the last resort.

A handler table is data, and the handlers are ordinary signed code, so all three are iOS-legal.

## 3. The no-JIT tier (iOS)

Ingredients, in order of measured or expected weight:
1. **Typed ops, unboxed registers.** An `f64` register is a `double` and an `i32` register is an `int32_t`.
   There are no tag checks or overflow-to-double paths, unlike QuickJS and Hermes. Hermes's `AddN`/`MulN` get
   partway there when its optimizer proves a number, which explains its relatively good mandelbrot.
2. **Accumulator specializations and K-operand forms** (above).
3. **RC elision from MIR** (the pass decision 0001 was waiting for).
   - Registers are **borrowed** unless MIR says **owned**: parameters, locals that are never stored, loop
     variables.
   - Owned registers get explicit `RETAIN`/`RELEASE` ops placed where the C++ destructor would run (§5).
   - The prototype runs borrowed and drops only its one owned temporary (`DROP_ARR`).
   - Native Zinc today counts through RAII `Ref<T>` copies. That is where binarytrees and sort spend their
     time, and where the VM can come close to native.
4. **AOT runtime calls with the shared representation.** Strings, `Map`, `Set`, sort, JSON, formatting, the
   kit and the UI are compiled into the core. `CALL_AOT` passes registers as-is through `abi.ts` thunks, so a
   VM string *is* a `StrObj*`. Runtime-bound kernels therefore run near native speed.
5. **Cheap closures.**
   - A VM closure is a `FnObj<Sig>` subclass (`VmFn<Sig>`, one per signature in the ABI table) holding a
     function pointer and captured values. Mutated captures are cells, as in HIR today.
   - Inside the VM, `CALLF` checks `vtbl == VmFn` and enters the callee's pre-decoded code directly, without a
     C++ `call()`.
   - Luau-style caching can reuse non-capturing closures.
6. **MIR passes the VM needs more than native does:**
   - inlining of small leaves (the measured −42%);
   - range analysis (`number` → `i32` loop counters, LNG-04 already in Sema);
   - bounds-check hoisting.

**Per-kernel estimate** against PERF.md's quiet-machine numbers:
- Measured kernels are scaled by the tail-acc/native ratio in the table above. For spectralnorm, the inlined
  ratio is used.
- The others are estimated from where their time goes.
- The Hermes column is Hermes 0.12 measured here, or a guess (~) from the op mix.
- Node includes about 45 ms of startup.

| Kernel | Zinc native | **Zinc VM (est.)** | QuickJS | Hermes | Node | VM vs QuickJS | Basis |
|---|---|---|---|---|---|---|---|
| fib | 14.7 | **~55** | 240 | 226 | 69 | 4.4× faster | measured 3.7× native |
| mandelbrot | 21.1 | **~60** | 694 | 154 | 73 | 11× faster | measured 2.8× |
| nbody | 33.8 | **~310** | 2716 | 1373 | 355 | 8.8× faster | measured 9.2× |
| spectralnorm | 54.3 | **~470** | 4306 | 2026 | 114 | 9× faster | measured 8.7× with inlining |
| fannkuchredux | 370 | ~2 600 | 7741 | ~3 500 | 274 | ~3× faster | int array loop, like nbody (~7×) |
| sort | 156 | ~450 | 835 | ~900 | 667 | ~1.9× faster | native sort; comparator re-enters the VM, 20 M × ~15 ns |
| binarytrees | 13.3 | ~30 | 109 | ~120 | 57 | ~3.5× faster | zrt alloc + RC calls; ~2× native |
| mapset | 10.0 | ~16 | 101 | ~110 | 68 | ~6× faster | `Map`/`Set` in AOT; ~1.6× |
| strings | 27.4 | ~35 | 57 | ~70 | 83 | ~1.6× faster | StrBuilder in AOT; ~1.3× |
| jsonout | 2.1 | ~3 | 4.7 | ~6 | 50 | ~1.5× faster | JSON in AOT |

Geomean: about **3.2× slower than Zinc native, 4× faster than QuickJS, and about 3× faster than Hermes 0.12**.

That is "Hermes class or better" with margin. The caveat is that Hermes has improved since 0.12 (2022), and
Static Hermes adds typed compilation. On the compute kernels the VM is at parity with Node, including Node's
startup. Without the startup Node is well ahead: 2–5× on nbody and spectralnorm.

## 4. JIT tiers (macOS, Linux, Android, Raspberry Pi)

### Tier 1: copy-and-patch baseline

Copy-and-patch (Xu and Kjolstad, OOPSLA 2021):
- Clang compiles C++ **stencils** with holes (relocations standing for operands, constants and continuation
  addresses).
- At run time, the JIT memcpys stencils and patches the holes.
- The paper reports code generation 2 orders of magnitude faster than LLVM -O0, with better code.

Two production data points:
- **CPython 3.13 (PEP 744)** builds stencils with LLVM at build time (3–60 s of build) and runs "about as fast"
  as its specializing interpreter, with 10–20% more memory.
- **Deegen** generates both the interpreter and a baseline JIT from one semantic description. Its baseline is
  360% faster than PUC Lua, and 33% slower than LuaJIT's optimizing JIT.

For Zinc the stencils come *from the same `BODY_*` handler source* compiled a second time, with operands as
`extern` symbols (holes) and the musttail continuation as a hole that becomes a fall-through. The new code is
limited to an object-file extractor (a build-time Node script reading Mach-O/ELF relocations) and a
patcher of about 1 KLOC.

**Prototype result** (mandelbrot, arm64, `MAP_JIT`; 42 bytecodes compiled in 8–10 µs):

| mandelbrot (ms) | Interpreter, tail-acc | Template JIT, slots in memory (464 B) | Template JIT, typed slots pinned to registers (220 B) | Zinc native |
|---|---|---|---|---|
| median | 78 | 82 | **36** | 28 |

- A naive stencil JIT that loads and stores every operand from the frame gains **nothing** on this loop. The
  loop-carried dependency through `x`/`y` pays store-to-load forwarding either way, and the interpreter's
  dispatch hides behind that latency.
- **Pinning typed slots to registers** is what pays: 2.2× over the interpreter, 1.3× of native.
  - Typed bytecode makes it trivial. Every slot has one static type, so `f64` slots map to `d16..d31` and `i32`
    slots to spare `x` registers, with no guards and no allocator.
  - A JS baseline JIT such as Sparkplug cannot do this; it keeps the interpreter's frame layout, and gains
    5–15% on Speedometer.
- So Tier 1 should be copy-and-patch **with a static slot-to-register map for the hottest typed slots of a
  function**, spilled around calls. The spills are stencil variants, much like the accumulator variants.

### Tier 2: optimizing

The input is the MIR (SSA, CFG, types), not the bytecode, so all of Sema's knowledge is kept. It covers typed
hot loops and Dyn code with shape guards.

| Backend | Size | Compile speed | Code quality | Platforms | Fit |
|---|---|---|---|---|---|
| **MIR (Makarov)** | 23 K LOC, ~557 KB | ~100× faster than GCC -O2 | ~91% of GCC -O2 | x86-64, aarch64 (Linux/macOS), ppc64le, s390x, riscv64 | **chosen**: C API, MIT, has lazy BB versioning |
| Cranelift | a large Rust dependency | ~10× faster than LLVM | ~14% slower than LLVM | x86-64, aarch64, s390x, riscv64 | Rust-only API; a C shim and cargo in a C++ build |
| sljit | small | very fast (no optimizer) | template-level | many ISAs, 32-bit ARM included | an alternative for Tier 1 on armv7 |
| asmjit | ~500 KB | assembler only | depends on our allocator | x86, x64, AArch64 only | would mean writing a backend |
| LLVM ORC | tens of MB of LLVM libraries | slow | best | everywhere | too big for a device runtime; fine for `zinc dev` on desktop |

MIR's C API (`MIR_new_func`, `MIR_gen`) takes a low-level typed IR that Zinc MIR lowers into almost 1:1. Its
aarch64 and x86-64 backends cover macOS, Linux, Android and the Pi 4/5. The Pi Zero / armv6 stays on Tier 0
(or sljit).

### Tier-up, OSR, deopt

- **Counters.** Each function has an entry counter, and each loop has a back-edge counter in the `FORLOOP` /
  `JMP` back-edge handlers (the Ignition / Sparkplug pattern).
  - Tier 1 compiles at about 100 calls or 1 000 iterations, since it is cheap.
  - Tier 2 compiles at about 10 000, on a background thread.
- **OSR.** At a loop header the frame layout *is* the bytecode register file, and Tier 1 keeps it for
  spilled slots. Entry reloads the pinned slots from the frame.
- **Deopt.**
  - Typed code has nothing to guard. Guards appear only for Dyn shape checks, quickened `CALLV` targets and
    speculative `i32` ranges.
  - Each guard carries a deopt map from machine registers to bytecode registers. Deopt writes the registers
    back and resumes the interpreter at the guard's bytecode.
  - RC stays exact because ownership is a MIR property, the same in every tier (§5).

### W^X

- **macOS arm64.**
  - `mmap(MAP_JIT)`, then `pthread_jit_write_protect_np(0)` → write → `(1)` → `sys_icache_invalidate`.
  - The toggle is per thread, so the Tier 2 background thread writes while other threads keep executing.
  - A hardened-runtime app needs the `com.apple.security.cs.allow-jit` entitlement.
  - The prototype exercises exactly this sequence.
- **Linux, Android.**
  - Use a dual mapping: one `memfd_create` file mapped RW at one address and RX at another, so no page is ever
    W+X. This is the approach PEP 744 requires ("at no point is the data both writable and executable").
  - Fall back to `mprotect` flips when memfd is unavailable.
  - Flush with `__builtin___clear_cache`.
- **iOS.** Not applicable: Tier 0 only.

## 5. Memory and RC: identical destruction order

The sim oracle compares bytes. Output depends on destruction order: weak references observe it (MEM-13),
`using`/`finally` run at scope exit, and future finalizers would too. So the VM must release at the **same
points** as native. The rule:

- The C++ emitter's RAII semantics become explicit MIR facts:
  - a temporary dies at the end of its full-expression;
  - a local dies at the end of its scope, in reverse declaration order;
  - a parameter dies at return;
  - a moved value (return, last use into a store) is not released.
- A single RC pass on MIR, shared by `emit-bc.ts` and later `emit-cpp.ts`, computes **owned vs borrowed**
  registers and emits `RETAIN`/`RELEASE`. It may elide a pair only when no observable event (a call, a
  release of another object, a store) lies between them.
- While native still uses `Ref<T>` RAII, the pass runs in "C++ order" mode and differential tests hold it
  honest.
- On the exception path (RT-05), the `CHECK` op jumps to a per-scope landing block that releases the owned
  registers in the same order as the C++ scope guards.
- The accumulator never holds an owned reference. Accumulator ops are typed scalars only, so RC never crosses a
  register-cached value.

## 6. Interop

- **VM → AOT.** `CALL_AOT #thunk, base, n`. The thunk is generated by `abi.ts` per exported signature: it reads
  typed registers and calls the C++ function. Pointers are passed as borrowed and results come back owned.
  There is no marshalling, because the register holds the C++ word.
- **Classes.** `abi.ts` class descriptors give field offsets, so `GETF`/`SETF` are direct. A VM class extending
  a native one (a React component) is a `VmSub_<Base>` whose virtual overrides trampoline into VM methods.
- **UI engine → VM callbacks.** The UI holds `Fn<Sig>` = `Ref<FnObj<Sig>>`. A VM closure *is* a
  `VmFn<Sig> : FnObj<Sig>`, and its `call()` pushes a VM frame on the current thread's VM stack and runs the
  interpreter until `RET`. Re-entry must be cheap (~15 ns), since sort comparators and layout callbacks
  re-enter per element. It needs:
  - no allocation per call;
  - the register file preallocated;
  - a `csp` sentinel so that `RET` into native returns from the handler chain.
- **Errors (RT-05).**
  - `THROW` sets `zrt::g_err` exactly as native does.
  - After a `CALL_AOT`, and after any VM call to a `throws` function, a folded `CHECK` tests `g_err` and jumps
    to the landing block, or returns if the frame has no handler.
  - Crossing into native is invisible: native checks `g_err` after the call as it always has.
  - Panics (bounds, null, division by zero) call the same `zrt::panic` with the same text, and add the
    bytecode location for the red box.
- **Async and generators.** `SUSPEND`/`RESUME` save the pre-decoded `ip` and the register window into the heap
  frame (decision 0007), and the microtask queue is shared.

## 7. Testing

- **`zinc test --target vm`** runs every conformance program under Tier 0. The runner's existing byte-exact
  comparison makes sim, native and the VM mutual oracles.
- **Tier-forcing flags.**
  - `--vm-tier=0|1|2` pins a tier.
  - `--vm-tier=stress` compiles every function at its first call and deopts at every guard's first execution.
  - Every conformance program runs in each mode in CI (macOS arm64, Linux x86-64).
- **Mixed mode.** For each program, AOT a random subset of modules and interpret the rest, to exercise the ABI
  thunks both ways.
- **Differential fuzzing.**
  - A generator of well-typed Zinc programs (in the Csmith style, over the strict profile plus Dyn) runs under
    sim, native and each VM tier, comparing output bytes and live-object counts (`zrt::live_objects`).
  - Bytecode-level fuzzing of the **verifier**: mutated `.zbc` files must be rejected or run safely. This
    matters because OTA bundles are untrusted input.
- **The dispatch prototype's check** (every strategy prints the QuickJS checksum) becomes a unit test of the
  handler macros.

## 8. Size budget (arm64, -Os)

| Component | Estimate | Basis |
|---|---|---|
| Tier 0 handlers | 25–40 KB | prototype: 34 ops = 1.7 KB unspecialized (~50 B/op). ~250 ops × ~2 useful ACC variants |
| Loader, verifier, pre-decoder, IC runtime, frames, VmFn, deopt entry | 30–50 KB | |
| ABI thunks and descriptors | 50–300 KB | depends on the exported API surface (the kit is large) |
| **Tier 0 total over zrt** | **~100–400 KB** | Luau's core loop is ~16 KB on x64 |
| Tier 1 stencils and patcher | +40–80 KB | stencils ≈ handler size again, plus relocation tables |
| Tier 2 (MIR generator) | +~560 KB | MIR README |

For comparison:
- QuickJS: the `qjs` binary is 724 KB, and a `qjsc` hello world is 776 KB (PERF.md). Bellard quotes 367 KiB of
  x86 code.
- Hermes: the 0.12 `hermes` CLI (compiler included) is 7.8 MB universal. The runtime-only library is smaller,
  but still multi-MB with ICU and the JS builtins.

Zinc's builtins are the existing AOT zrt, which native apps already carry, so the VM adds only the engine.

## 9. Phased plan (one experienced engineer)

| Phase | Content | Effort | Reuses |
|---|---|---|---|
| V0 | Make MIR total: try/catch error edges, async/generator resume edges, cells, closures. Add the RC pass (owned/borrowed, C++ order) | 5–7 wk | hir.ts, mir.ts (SSA, folding, DCE) |
| V1 | `emit-bc.ts`: register allocation by coalescing, typed ops, K forms, ACC assignment. `.zbc` format and verifier | 5–6 wk | MIR, Sema types, `dynShape` plans |
| V2 | Tier 0 interpreter: musttail + goto + switch from one handler source; `CALL_AOT`, `VmFn`, `g_err`, panics; `--target vm` on the whole conformance suite | 6–8 wk | zrt, sim oracle, `zinc test` |
| V3 | `abi.ts` thunks and class descriptors; mixed mode (the same work the iOS core needs) | 4–5 wk | emit-cpp.ts's naming and layout |
| V4 | Dyn shapes and ICs, quickening | 3–4 wk | zrt_dyn.h |
| V5 | MIR inlining, ranges, bounds hoisting; super-instructions from profiles | 3–4 wk | MIR passes (benefit native too) |
| V6 | Tier 1 copy-and-patch with pinned typed slots; OSR; W^X on macOS and Linux | 6–8 wk | handler sources as stencils |
| V7 | Tier 2 on MIR (Makarov): lowering, background compile, deopt maps, Dyn guards | 8–10 wk | Zinc MIR |
| V8 | Fuzzers, tier-stress CI, the size diet | ongoing, 3 wk to set up | conformance suite |

V0 to V3 are about 5–6 months. That matches the "P1: VM, byte-exact" line in `ios-core-runtime.md` and delivers
the iOS tier. V4 to V5 bring Dyn and the performance targets. V6 and V7 (about 4 months) are optional, for
desktop, Android and the Pi.

**Risks:**

| Risk | Mitigation |
|---|---|
| RC order drift between VM and native | One RC pass for both emitters; live-object counts in differential tests |
| Frame traffic keeps nbody-like code at ~9× native | Tier 1 pinning off iOS; on iOS, GETF+arith super-instructions and `zinc promote` (AOT the hot module) |
| Compiler-specific dispatch (musttail) | Computed-goto and switch builds from the same macros, tested in CI |
| Re-entry cost for callbacks (sort, UI) | Preallocated VM stack, no allocation per call, measured in V2 |
| MIR-project maintenance (one author) | Tier 2 is optional; the Tier 1 stencils need nothing external |
| Verifier bugs become sandbox escapes | Bytecode fuzzing; no raw-pointer ops in bundles |

## Appendix: prototype

- `research/vm-proto/vm.cpp` has the ops, the five dispatch strategies, the `jit` / `jit-pin` experiment and
  the kernels.
- `research/vm-proto/run.mjs` builds everything, runs each engine, checks outputs and prints the tables. With
  `HERMES`/`HERMESC` set to the `hermes-engine-cli@0.12.0` npm binaries, it also runs Hermes. That version has
  no `class`, so nbody's single class is rewritten into a constructor function for Hermes only.
- The code is research only. It is not wired into the build and changes no compiler or runtime behaviour.

## Sources (read for this report)

- Lua 5.0 implementation, register VM and benchmarks: https://www.lua.org/doc/jucs05.pdf
- Hermes design and bytecode list (register VM, `Reg8`/`Long` forms, `AddN`, `GetById` cache index):
  https://github.com/facebook/hermes/blob/main/doc/Design.md,
  https://github.com/facebook/hermes/blob/main/include/hermes/BCGen/HBC/BytecodeList.def
- QuickJS (sizes, bench): https://bellard.org/quickjs/
- Luau performance (IC with predicted slots, fastcalls, ~16 KB core loop, optional JIT):
  https://luau.org/performance
- wasm3 interpreter (M3 tail-call threading, `r0`/`fp0` register caching, 4–15× native):
  https://github.com/wasm3/wasm3/blob/main/docs/Interpreter.md
- musttail interpreters: https://blog.reverberate.org/2021/04/21/musttail-efficient-interpreters.html. CPython
  3.14 tail-call interpreter and its correction: https://docs.python.org/3/whatsnew/3.14.html,
  https://blog.nelhage.com/post/cpython-tail-call/. GCC 15 `musttail`: https://gcc.gnu.org/gcc-15/changes.html
- V8 Ignition and Sparkplug: https://v8.dev/blog/ignition-interpreter, https://v8.dev/blog/sparkplug
- Copy-and-patch: https://arxiv.org/abs/2011.13127. Deegen: https://arxiv.org/abs/2411.11469,
  https://sillycross.github.io/2022/11/22/2022-11-22/. PEP 744: https://peps.python.org/pep-0744/
- Dart VM and the `DART_DYNAMIC_MODULES` KBC interpreter: https://mrale.ph/dartvm/,
  https://github.com/dart-lang/sdk/blob/main/runtime/vm/interpreter.h,
  https://github.com/dart-lang/sdk/blob/main/runtime/vm/constants_kbc.h
- In-place Wasm interpretation (Wizard): https://arxiv.org/abs/2205.01183
- MIR project: https://github.com/vnmakarov/mir. Cranelift: https://cranelift.dev. sljit:
  https://github.com/zherczeg/sljit. asmjit: https://asmjit.com
- Apple JIT porting guide (MAP_JIT, `pthread_jit_write_protect_np`, `sys_icache_invalidate`):
  https://developer.apple.com/documentation/apple-silicon/porting-just-in-time-compilers-to-apple-silicon. The
  page renders in JS only; the API sequence was verified by compiling and running the prototype against the
  macOS SDK.
