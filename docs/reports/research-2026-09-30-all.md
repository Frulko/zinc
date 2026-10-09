# Engines, AOT/JIT, WebGL, Studio: research synthesis (2026-09-30)

Status: research only. Nothing here is implemented. Speedups and effort figures are estimates unless marked measured.
Details, sources and verified/inferred tags are in the five reports next to this file.

| Report | Question |
|---|---|
| [zinc-vm-aot.md](zinc-vm-aot.md) | Real AOT for the Zinc VM, interpreter/JIT quick wins |
| [quickjs-jit-aot.md](quickjs-jit-aot.md) | JIT tier and AOT mode for QuickJS |
| [mquickjs.md](mquickjs.md) | Adding mquickjs as an engine |
| [threejs-webgl.md](threejs-webgl.md) | Full Three.js / WebGL2 |
| [docker-free-studio.md](docker-free-studio.md) | No Docker, Arduino-like desktop app, browser mode |

## Conclusions

1. **Zinc VM AOT: ZBC4 -> C++ -> clang -O2** (`--emit-aot` in the runner, interpreter as fallback and oracle).
   Scalar prototype (measured): fib(32) 130 ms interp / 66 JIT / 31 AOT / 10 native; mandelbrot 350 / 80 / 21.8 / 22.
   Upper bound for numeric code only. Do the compiler/interpreter quick wins first (no register allocation or copy
   coalescing in `emit-bc.ts`; 32-byte `Ins`; heavy `CALL`; `std::find` per field access). Unify the recursion
   limit (JIT 1024 vs interpreter 16383). ~17-24 weeks for P0-P4 including iOS/OTA mixed mode.
2. **QuickJS: port `qjsc -A` (ivankra/quickjs-aot) onto quickjs-ng 0.17** (what Zinc vendors).
   Measured here: `-A` gives 1.4x fib, 2.2x mandelbrot, 1.14x objects vs its own interpreter; tail dispatch alone
   was neutral. First do the cheap wins: precompiled bytecode (the runner re-parses source at each start),
   `-O3`/LTO/PGO, and fix `Math.fround` emission for f32 (measured 2x on a loop). A real JIT (60-100 days, high
   risk, not iOS-legal) only after profiling a real Zinc UI app, which has not been done.
3. **mquickjs is a different language (strict ES5), not a lighter QuickJS.** Worth it for ESP32-class targets,
   not for Pi, rM or iOS. MVP 12-15 days, parity 32-45 days. Cheaper first step: an `engine: 'mquickjs'` option
   for `zinc:script` (~6-8 days). Not suitable for upstream Three.js.
4. **Three.js / WebGL2:** Zinc has no WebGL today. Needs a native WebGL2 core over GLES3 (ANGLE on macOS), QuickJS
   bindings generated from one IDL, a browser-host JS bundle, and `zinc:webgl`. `WebGLRenderer` needs 142 WebGL
   methods (r186.1). Three under QuickJS is ~14-30x slower than V8 on JS-side work (mock GL, order of magnitude),
   so QuickJS speed is the bottleneck, not the GL crossing. ~25-35 weeks. three-native is WebGL1-only and is
   reference reading, not a base.
5. **Docker-free:** `zig c++` cross-compiled `runtime/zrt.cpp` for aarch64/armhf/x86_64 linux, windows and aarch64
   macOS in ~1 s each (full link and SDL3 not tested). So linux/rpi/rmpp can drop Docker via `zig c++` + pinned
   sysroots. ESP-IDF stays a managed SDK; PS1/PS2 on mac/Windows and Apple targets off-Mac still need Docker/VM/Mac.
6. **Studio + browser:** Tauri shell over the Node CLI, `zinc toolchain install`, and bytecode upload to a
   pre-flashed VM core as the Arduino-like learner path. Browser tiers: A (compile to ZBC4 + Wasm VM, no install),
   B (Web Serial upload), C (cloud compile). ~30-40 person-weeks for Studio + Tier A, +12-20 for Tier B.
   "ZincStudio" already names the macOS box editor in `docs/studio.md`: pick another product name.

## Suggested order

1. Cheap wins (days): QuickJS bytecode precompile + fround fix + `-O3`/LTO; VM compiler quick wins; recursion-limit parity.
2. Profile a real Zinc UI app under `--engine quickjs` to decide JIT vs AOT vs typed AOT.
3. Zinc VM AOT (P1-P2) and QuickJS AOT on ng, in parallel with a 2-day mquickjs spike.
4. `zinc toolchain` (zig c++ first) and universal VM cores, which unlock Studio and browser Tier A/B.
5. WebGL2 core last: largest effort and it depends on QuickJS speed.

## Caveats

- No Zinc app was run under any AOT prototype; the VM AOT prototype is scalar-only.
- Interpreter/JIT numbers come from binaries built 2026-09-29, before the current dirty edits.
- Web-sourced claims (weval, LuaAOT, longbridge/quickjs-jit, gkurt) were not reproduced.
- Estimates are one strong developer, unvalidated.

## Addendum: JS engines, editor, Studio as a Zinc app, Carnet (same day)

| Report | Question |
|---|---|
| [js-engines.md](js-engines.md) | JavaScriptCore / V8 / LibJS as engines |
| [code-editor-lsp.md](code-editor-lsp.md) | Real code editor: multi-cursor, tree-sitter, LSP |
| [studio-as-zinc-app.md](studio-as-zinc-app.md) | IDE as a Zinc app instead of Tauri |
| [notion-block-editor-zinc.md](notion-block-editor-zinc.md) | Zinc-native version of Carnet (notion-block-editor) |

7. **JS engines:** extract a `zinc-js-engine` interface from `runtime/vm/quickjs.cpp`; support QuickJS-ng (baseline,
   iOS, Pi 3B+, rM) and JavaScriptCore on macOS (JSCOnly for aarch64 Linux experimental); V8 only if Windows needs it;
   LibJS not viable now. Measured (single runs, JS-side only): Three r186 mock GL 500 cubes 13.2 ms/frame QuickJS-ng,
   0.54 JSC, 0.81 V8; no-JIT JSC/V8 still ~2x faster than QuickJS. This revises item 4: JSC removes the QuickJS speed
   bottleneck on macOS. Highest-value independent change: ABI v5 with borrowed typed-array views (4-6 days).
8. **Code editor:** today it is the engine `<textarea>` in code mode plus an extension API (single caret, whole-string
   undo snapshots, commit-only IME, no shaping). Plan: rope + range-set selection + ChangeSet transactions written in Zinc
   TS (`zinc:editor`), tree-sitter as a vendored native plugin, LSP client in Zinc TS over `zinc:process`, `zinc lsp`
   reusing `frontend.ts`. M1-M6 ~32-44 engineer-weeks. Several ABI gaps (non-blocking write, byte-safe I/O, PTY) unverified.
9. **Studio as a Zinc app: yes** (macOS/Linux first). `apps/studio` and `examples/zed-editor` already cover much of it;
   v0 ~8-10 pw, credible cross-platform IDE ~40-60 pw. Gates: Windows, accessibility, editor quality. Keep the Node CLI
   as a JSON-RPC child; self-hosting the compiler in QuickJS is optional and late. Rename to avoid the "ZincStudio" clash.
10. **Carnet (notion-block-editor):** its model is already headless and DOM-free (~3.5k lines, MIT, already ported to
    Swift and Rust/GPUI). Recommended: compile the core with Zinc, rewrite the view in Zinc JSX on a text engine shared
    with the code editor. Do not run its browser bundle on QuickJS. MVP ~20-28 weeks solo. Needs rich-text spans,
    shaping/segmentation, text geometry, IME preedit, rich clipboard first.

Shared critical path for 8, 9, 10: a native text engine (spans, shaping, segmentation, geometry, IME preedit).
Caveats: effort numbers are unvalidated; JSCOnly, V8 and LibJS were not built; `zinc check` was not run on Carnet's core.

## Addendum 2: platform management, tool belt, OS integration (same day)

| Report | Question |
|---|---|
| [platform-files-and-conditionals.md](platform-files-and-conditionals.md) | `foo.esp32.ts`, `Platform.select`, compile-time pruning |
| [toolbelt-build-pipeline.md](toolbelt-build-pipeline.md) | Metro/PocketJS-like pipeline, lint, ES5 lowering |
| [os-integration-widgets.md](os-integration-widgets.md) | Tray, menus, dialogs, notifications, widgets |

11. **Platform management:** `platformVariant()` (`frontend.ts:197-208`) and `zinc:platform` already exist, but constants are
    NOT compile-time today (verified: both branches type-checked and emitted; `docs/targets/capabilities.md` is wrong).
    Recommended: prune untaken branches in the frontend `getSourceFile` hook before TS type-check (whitespace blanking keeps
    positions), closed tag chain board > chip > target > family > native > default, `Platform.{is,has,select,...}`,
    `--portable` bytecode mode, `zinc check --all-targets`, `@requires` capability lint. ~28-38 days.
12. **Tool belt:** no Metro-style pipeline exists (`bundleJs` is a file copy). PocketJS = Babel + `Bun.build` IIFE with `define`,
    no ES5 lowering. Measured: minify cuts bytes 45% but QuickJS parse time barely changes (8.8 vs 8.1 ms), so
    bytecode precompile matters more than minify. ES5 lowering by generic tools fails on mquickjs (12/30 SWC, 9/30 Babel,
    14/30 TS semantic cases); mquickjs needs lowering inside `emit-js.ts` for Zinc code plus SWC + fix-up + polyfills for
    foreign JS. Suggested: esbuild (bundle/define), oxlint + Zinc rules, oxc-parser, tsgo as fast gate. M0-M5 ~25-34 days.
13. **OS integration:** none exists; SDL3 3.4 headers expose tray/menus/dialogs/drop/clipboard mime/theme/power/displays but
    not notifications, global shortcuts, deep links, keychain, native macOS menu. Proposed `zinc:desktop/*` (not `zinc:os`,
    taken) with capability names, `.sim.ts` twins, `zinc.json` permission manifest. Items 1-9 ~14-17 weeks (mac/Linux).
    OS widgets cannot be authored from Zinc; honest option is a data/layout descriptor rendered by generated native shells.


---

<!-- source: zinc-vm-aot.md -->

# Zinc VM: a real AOT mode, plus interpreter/JIT upgrades (research report)

Date 2026-09-30. Read-only on `/Users/mowmow/Lab/zinc` (dirty tree; nothing modified, nothing committed).
Everything I ran lives in the scratchpad (`aotproto/`). Tags: **[V]** verified by reading code or by a measurement I
ran; **[D]** stated by the repo's own docs (not re-measured); **[W]** from web sources; **[I]** my inference or estimate.

Paths are relative to `/Users/mowmow/Lab/zinc`. Line refs are to the working tree as it was today (the files are dirty).

---

## 0. Executive summary

1. **Recommended AOT: ZBC4 -> C++ generated by the VM runner itself (`zinc-vm --emit-aot app.zbc`), compiled by clang -O2 and
   linked into the core, with every non-trivial op delegated to the *same* single-sourced `step<O,T>` semantics.** Scalar
   ops become C locals and clang does register allocation, inlining and loop optimisation. This is options (b) +
   Futamura-by-templates (f). It is the only option that (1) keeps the interpreter as the semantic oracle by
   construction, (2) is legal on iOS (native code is in the signed binary; downloaded bytecode is only ever interpreted),
   (3) works on x86-64/armv7/aarch64 unchanged, and (4) gets near-native scalar speed.
2. **Measured evidence that this is worth it [V]** (my throwaway generator turns the *real* `fib` and `mandelbrot` `.zbc`
   files into C, faithful to the VM's frame/poll/depth protocol; outputs verified 2178309 and 6095446; 9 runs, median,
   spawn-to-exit, load ~6, ran 3 times, stable):

   | Kernel | native | interpreter | JIT (`--jit`) | **AOT prototype (clang -O2 from ZBC4)** |
   |---|---|---|---|---|
   | fib(32) | 10 ms | 130 ms | 66 ms | **31 ms** (4.2x interp, 2.1x JIT, 3x native) |
   | mandelbrot | 22 ms | 350 ms | 80 ms | **21.8 ms** (16x interp, 3.7x JIT, ~1.0x native) |

   The prototype is scalar-only (no refs/heap/GC/exceptions), so it is an upper bound for the numeric part, not a claim
   for whole applications. It does keep the VM's real call protocol (16-byte frame push, params through the frame, poll counter, depth check).
3. **The current interpreter/JIT are far from the design report's prototype [V]:** design report: tail-acc 43/78 ms
   (fib/mandelbrot); integrated interpreter: 130/350 ms (3-4.5x slower). The causes are visible in the code (section 4): 32-byte `Ins`,
   heavy `CALL` handler, no register allocation or copy coalescing in `emit-bc.ts`, constants re-loaded from memory,
   every field/array access re-validates layout and type. **Do the cheap wins first (Phase 0), they benefit every tier and the AOT input.**
4. **Two semantic divergences already exist between tiers [V]:** the JIT limits recursion to 1024 frames
   (`runtime/vm/jit.h:21`), the interpreter to 16383 (`runtime/vm/main.cpp:422`). A "no compromise" AOT must first
   define one limit and give every tier the same. Native recursion also needs a big C stack (iOS threads default to
   512 KB-1 MB [I]), so the VM must run on its own large-stack thread.
5. **Rejected as the primary path:** offline emission with the existing AArch64 JIT emitter (a: aarch64-only, a helper
   round trip per call, absolute addresses everywhere), MIR->C++ reuse of `emit-cpp` (c: `emit-cpp` is AST->C++ with RC and
   `zrt::Ref`, not MIR-driven; a second semantic implementation), Wasm intermediates (e: the semantics that matter
   are in the heap/GC/ABI, not the ISA). LLVM IR/QBE/MIR-project (d) are refinements of (b), not alternatives, and are worth
   revisiting only for precise GC (statepoints) or when clang is unavailable on the build host.
6. **Effort:** Phase 0 quick wins 2-3 weeks; refactor to single-sourced semantics 3-4 weeks; AOT emitter + parity 5-7 weeks;
   performance/GC precision 3-4 weeks; OTA mixed mode + iOS packaging 4-6 weeks. About 4-5 months for one experienced
   engineer end to end; a usable release-mode AOT (without OTA mixed mode) at about 2.5-3 months. [I]

---

## 1. What the VM actually is (verified reading)

### 1.1 Data model

- **Register file / frames.** `union Reg {double f; int32_t i; uint32_t u; Heap* h;}` (`runtime/vm/main.cpp:29`). One flat
  `stack` of `Reg` (1M registers default, `:95`). A callee frame starts at `fp + caller.types.size()` (`:423`), so
  every SSA value of a function has its own slot (no reuse). `Frame{ip, fp, dst, fn}` records live in `frames[16384]`
  (`:83`, `:188`).
- **Instructions.** On disk 16 bytes (`compiler/src/emit-bc.ts:503-506`); in memory `struct Ins{Handler h; a,b,c; op,t; catchPc}` = **32 bytes** [V: compiled
  `sizeof`] (`:81`), not the 16 bytes the design doc assumes (`docs/reports/zinc-vm.md:75-77`). Handlers are `handle<O,T>` specialised on opcode x type,
  chained by `[[clang::musttail]] return ip->h(...)` (`:838-848`).
- **Semantics live in one template.** `step<O,T>(vm, ip&, fp&)` (`:378-836`) is used by the interpreter *and* by the JIT
  helpers (`jit.h:12-33`, `step<O,T>` at `:31`). This is the key asset for AOT.
- **Heap.** Non-moving, malloc-per-object, singly linked, mark/sweep (`:43-60`, `:107-148`). `Heap` is a fat struct
  (unique_ptr trace, ~7 Heap* links, flags, `zrt::String`, `std::vector<Reg> slots`, `unique_ptr<Collection>`) - every object is
  two mallocs. Budget enforced via `heapBytes`, `reserveHeap` (`:149-152`); string creation = one `Heap` per string (`:162`).
- **GC roots.** Constants, globals, every live frame's *ref slots* (`fns[id].refs`, `:112-113`), result/exception, callback roots, function
  values, tasks/jobs/timers/rejections. The `frames[]` array is **the** stack map source: `for j<depth: frame(frames[j].fn, frames[j].fp)`.
  Ref slots are zeroed on every call (`:426`) so the scan is safe; dead refs stay live until overwritten (documented, `docs/engines.md:146-147`).
- **Exceptions.** `GuestThrow` C++ exception thrown by `step`; each `handle<>` wraps `step` in `try/catch` and calls
  `routeException` (`:362-369`, `:841`) which walks `frames[]` using the per-instruction `catchPc`. JIT: helpers catch and return
  status 0/1(fatal, message in `vm->jitError`)/2(guest throw)/3(suspended) (`jit.h:33`, `:141-153`).
- **Async/generators.** `AWAIT`/`YIELD` copy the whole frame (`std::copy(fp, fp+task->slots.size(), ...)`) into the heap task with the resume pc
  (`:223-233`, `:513-517`); resume = `execute(vm, fn, fp, pc)` (`:1067-1083`); the JIT has a checked pc->label table for async/gen functions (`jit.h:146-153`).
- **Limits/polling.** `poll()` every 4096 ticks on CALL/JMP/BR/THROW, checks `interrupted` and `deadline` (`:242-247`);
  JIT polls at backward edges with `jitBudget` (`jit.h:160-165`) and in call helpers.
- **Bundle/verifier.** `load()` (`:863-1029`) verifies every operand type and register, branch targets, call signatures,
  exports; converts branch targets to relative offsets. Guest bytes never contain pointers (`:837` comment). Debug map is a
  sidecar `.debug` (`:1031-1053`), fingerprinted by FNV-1a of the bundle.
- **Embedding.** `runtime/vm/embedded.cpp` includes `main.cpp` (one implementation of validation/GC/dispatch/JIT, `:1-3`).

### 1.2 The compiler side (`compiler/src/emit-bc.ts`)

- Every MIR value gets its own register (`:127-132`); every call/closure/method call **copies all args into fresh
  registers** with `mov` (`:311-313`, `:283-285`, etc.); phi edges emit 2 movs per phi (temp then destination) plus a `jump`
  (`:156-165`); **constants are not deduplicated** (`constants.push` per use, `:180`) and are re-loaded from memory each
  time by `K`.
- **All reference-typed registers are the single tag `VM_REF=7`** (`:13`): objects, arrays, closures, promises, generators, maps, dyn. Field access is therefore
  resolved dynamically per object: `vm->field(reg,key,type)` does `object()` checks + `std::find` over `layout.keys` + type compare on **every** `FIELDGET/FIELDSET`
  (`main.cpp:172-181`). Field ids are assigned in first-use order (`emit-bc.ts:85-86`), so **ZBC4 carries no field names**, only numeric keys (`:498`).
- MIR (`compiler/src/mir.ts`) is an "inspection stage, not the input of the C++ emitter" (`mir.ts:3-5`); missing passes: inlining, devirtualisation,
  ranges, bounds, escape, RC optimisation (`:5`). `emit-cpp.ts` is direct AST->C++ (decision 0004), with `zrt::Ref` RC, `AsyncFrame`/`GenFrame` state machines
  (`emit-cpp.ts:115`, `:519`) and `zrt::g_err` status-code exceptions (`:3`, `:733-745`).
- Bytecode shape evidence [V, dumped from the built `.zbc`]: `fib` = 16 instrs for a 5-line function (3 `K`, 2 `MOV`, 2 `JMP`, 2 `CALL`); `mandelbrot` main = 107 instrs / 79 registers with 24 `MOV`,
  19 `K`, 16 `JMP`, 7 `LOAD` + 5 `STORE` of globals.

### 1.3 The JIT (`runtime/vm/jit.h`)

- Direct AArch64 word emission (`emit(0x...)`), macOS `MAP_JIT` + `pthread_jit_write_protect_np`, Linux mprotect (`:58-85`).
  Inlines only int/f64 arith/compare/branch/K/MOV/LOAD/STORE; **everything else, including every CALL/RET,
  goes through `jitHelper<O,T>` = the same `step`** (`:12-33`, `:195`).
- **Pinning.** Only *leaf* functions pin slots: up to 8 int regs (x21-x28) and 8 f64 regs (d8-d15) chosen by static loop-depth weight (`:91-121`);
  non-leaf functions pin nothing. Before every helper, `sync(false)` stores *all* pinned slots to the frame, after it `sync(true)` reloads them all (`:131`, `:154-159`). Refs are never pinned, so GC sees
  everything in the frame. Prologue/epilogue always save 5 x-pairs + 4 d-pairs (`:133-135`).
- **Relocation/absolute address problems for offline use [V]:** helper function addresses `imm(16,(uintptr_t)fn)` (`:155`), `const Ins*` of the instruction
  passed to the helper (`:155`), address of `vm.jitBudget` (`:161`), addresses of `vm.constants[b]` / `vm.globals[b]` (`:173`), and `vm->jit[target]` indirect
  call inside the helper (`:28`). All are 4-instruction `movz/movk` immediates: none is position-independent.
- **Call cost [V by arithmetic]:** fib(32) = 7.05M calls; JIT 66 ms = 9.4 ns/call (~30 cycles), interpreter 130 ms = 18 ns, native 1.4 ns, my AOT prototype 4.4 ns.

---

## 2. Native vs VM-AOT: what actually differs (option c, explained)

| Aspect | `native` engine (emit-cpp) | VM interpreter/JIT | VM-AOT (recommended) |
|---|---|---|---|
| Source of truth | TS AST -> C++ (decision 0004) | MIR -> ZBC4 -> `step<O,T>` | ZBC4 -> C++ calling the same `step` semantics |
| Object layout | C++ classes, `zrt::Ref<T>` field offsets | `Heap{ std::vector<Reg> slots }` + `Layout{keys,types}` looked up at run time | same as VM (must, to interoperate with interpreter and GC) |
| Memory | RAII refcount; deterministic destruction (decision 0001; weak refs, `using`) | traced non-moving mark/sweep with a heap budget; conservative frame slots | same as VM. Not RC-exact; see 7.4 |
| Dyn | `zrt::Dyn` NaN-boxed | boxed `Heap{dynamic}` | same as VM |
| Async/generators | C++ frame objects, `switch(state)` (`emit-cpp.ts:519`) | heap task with frame copy + pc | same as VM (frame copy + resume pc) |
| Exceptions | `zrt::g_err` status checks | C++ `GuestThrow` (interp) / status codes (JIT) | status codes, no C++ EH across generated frames |
| Limits | none in native | heap budget, deadline, interrupt, register-stack and 16383-frame caps | must be identical to the interpreter |
| Verifier / sandbox | n/a | full verifier at load; guest cannot supply pointers | AOT code is a trusted build artefact; bundle bytes are still verified and only bind to it by hash |
| Hot reload | dylib reload (dev) | process restart today (`docs/engines.md:202-204`) | not used in dev; AOT is a release mode |
| Native ABI | direct C++ calls | `ZincValue` marshalling (`NATIVE` op, `main.cpp:440-512`) | same as VM |
| Bytecode as data | none | yes: OTA/patch/fallback possible | yes: interpreter fallback is the OTA story |

Option (c) (feed MIR straight to C++ with the VM heap ABI) means a **second implementation of the VM's semantics** (field key lookups,
dyn boxing, promise/generator protocol, collection ops, heap accounting) in the emitter. Every difference shows up as a parity bug against the
interpreter; and OTA fallback then needs MIR->bytecode equivalence proofs. It has the highest ceiling (static knowledge of layouts, no dynamic
`field()`), but that ceiling is reachable inside (b) with inline caches and, later, static layout typing in the bytecode. Verdict: no.

---

## 3. AOT options, evaluated

Scores: fidelity F, iOS legality I, OTA fallback O, build time B, code size S, speedup P (vs current interpreter unless noted).

### (a) AArch64/x86-64 machine code offline from ZBC4 with the existing JIT emitter into `.o`/`.S`
- **F: high** (same helpers/`step`, already in the 4-mode matrix). **I: legal** (object linked into app). **O:** fine (fallback interpreter).
- **Effort:** every absolute address in `jit.h` (section 1.3) must become a relocation or a `VM`-relative offset (x19 already holds `VM*`); write a Mach-O/ELF object writer
  or emit `.S` text with `.word`; the emitter is aarch64-only, so **no x86-64 Linux/Simulator-on-Intel/armv7 (Raspberry Pi 3B+ in 32-bit)**; a second emitter would be a second
  bug surface. [V: `jit.h:4` only `__aarch64__`.]
- **P: modest.** Today's JIT is 2-4x over the interpreter (66 vs 130 ms fib; 80 vs 350 mandelbrot), limited by helper-per-call and 8+8 pinned leaf-only registers. Fixing that
  is exactly re-implementing a register allocator and inliner by hand. **Verdict:** keep the JIT for desktop tier-up (improve it, section 4.3), do not build AOT on it.

### (b) ZBC4 -> C/C++ with clang -O2 as the backend  **(chosen)**
- Each ZBC function becomes one C function `int fnN(VM*, Reg* fp, uint32_t entry_pc)`; each register of a scalar type becomes a C local; ref registers stay in `fp[]` (precise roots, section 5);
  labels + `goto` for control flow; direct calls between AOT functions; helper calls (out-of-line `noinline noexcept` wrappers around `step`) for everything with heap/GC/throw/suspend semantics.
- **F:** exact if scalar ops are single-sourced (7.1) and slow ops literally call the same code. **I:** legal; native code ships in the signed binary. **O:** see section 6. **B:** clang -O2 on generated C: my prototype for `mandelbrot`
  (107 instrs) compiles in well under a second [I: not timed precisely]; large apps need per-unit TU splitting, `-O1`/`-Os` for cold functions and a content-hash cache (risk R2).
  **S:** [I] 20-60 bytes of AArch64 per bytecode instruction for scalar-dense code (an inlined helper call is ~5 instrs); the 16-byte-per-instruction bytecode stays in the bundle for fallback/debug, so the AOT build is roughly 2-4x the bytecode size.
- **P:** measured 4.2x (fib) to 16x (mandelbrot) over the current interpreter on scalar kernels (section 0).

### (c) MIR -> C++ reusing emit-cpp with the VM ABI: rejected (section 2). `emit-cpp.ts` is AST-driven; MIR is not its input.

### (d) Other backends from MIR/ZBC
| Backend | Notes | Verdict |
|---|---|---|
| **LLVM IR** | Best code; gives real precise GC via `gc "statepoint-example"`, `musttail`/`tailcc`, `preserve_none` [W: LLVM 19, x64/arm64 only], intrinsics for overflow; but you already have clang, and C is debuggable with `-g`. | **Phase 5 option** if shadow-stack cost or C-stack limits bite |
| Cranelift | Rust dependency; `cranelift-object` can emit objects; ~14% slower than LLVM per the design doc [D]; a cargo build in a C++ pipeline | no |
| QBE | ~12 KLOC C, arm64_apple/amd64/riscv, no inliner/loop opts, ~70% of -O2 [I, from memory] | only if clang cannot be required at build time |
| **MIR project (vnmakarov)** | C API, ~557 KB, ~109x faster to compile than GCC -O2, ~92% of GCC -O2 speed, binary MIR files, aarch64/x86-64 incl. macOS [W: github.com/vnmakarov/mir]. It is a JIT-first design: I could not confirm relocatable object emission [W, unverified]; a JIT use case is barred on iOS | Tier-2 JIT on desktop only (design doc V7) |
| asmjit | assembler only; you write the allocator | no |
| **Copy-and-patch** | Compile speed 2 orders of magnitude over LLVM -O0, code 14% faster than -O0 [W: arXiv 2011.13127]; CPython 3.13 JIT "about as fast as the specializing interpreter", +10-20% memory, 3-60 s of build [W: PEP 744]. The design doc's own prototype: stencil JIT with slots in memory = **82 vs 78 ms** (no gain), only register pinning helps (36 ms) [D]. Offline it reduces to (a) | no |

### (e) Wasm as intermediate
- **wasm2c / w2c2 / WAMR AOT / wasmtime AOT:** turns the problem into "port the VM's heap, GC and ABI to linear memory": objects are structs in linear memory with a hand-written collector, and roots
  must live on a shadow stack (wasm cannot scan its own stack) - i.e. the same design as (b) plus an ISA layer, plus lost source-level traces and a marshalling boundary to native `zrt`/UI. wasm2c output compiled by clang is near-native for numeric code, but everything the VM does
  differently (dyn boxing, promises, generators, `ZincValue` ABI) still has to be written in wasm or imported.
- **Interpreters:** wasm3 is 16-20x slower than native on fib(40) and ~11.8x on CoreMark, wasmtime about 4x faster than wasm3 (older 2019-20 numbers) [W: wasm3 `docs/Performance.md`, dated by the doc itself]. Our interpreter already sits in that class (13-16x native), so
  Wasm-interpreted on iOS would not help. Wasmtime's Pulley portable interpreter and WAMR's AOT `.aot` files are native code or JIT-adjacent; a downloaded `.aot` is executable code (illegal on iOS OTA).
- **Wasm GC backend:** would hand allocation/GC to a host engine (V8, wasmtime), giving struct/array typing for free and exceptions/tail-calls as instructions. But there is no wasm host on iOS without JIT except interpreters, engines
  must be embedded, native interop is via imports (marshalling), and Zinc's non-trivial semantics (promise/generator protocol, budgets, deadline polling, debug traces) would still be reimplemented. It is a whole-runtime replacement, not an AOT mode. Verdict: only as an isolation tier for untrusted plugins (already the position of `ios-core-runtime.md`).

### (f) Futamura projection / specialising the handlers per function  **(the technique inside (b))**
- **ivankra/quickjs-aot:** `qjsc -A` "unrolls the interpreter main loop" over a static const bytecode array so clang folds operands; +36% (v8-v7) and +43% (v8-v9) geomean, "-B" baseline half that [W]. **LuaAOT** (Gualandi/Ierusalimschy):
  a partial evaluation of the reference interpreter, <500 new lines; "reduced running time 20% to 60%", up to 2x on numeric code, "not as fast as LuaJIT or Pallene" [W]. **weval:** Futamura on wasm snapshots with `update_context` on pc; 2.19x with weval alone, 2.77x geomean with intrinsics, up to 4.39x on SpiderMonkey PBL; AOT-only, cannot register-promote interpreter-visible state such as GC-visible values [W: cfallin.org 2024/08/28].
- **Why Zinc should beat those numbers:** in dynamic VMs the per-op work (tag checks, ICs, refcounts) is untouched by removing dispatch. In a *typed* VM the ops are 1-2 machine instructions, so dispatch, frame loads/stores and calls are the cost. The design doc's own JIT experiment shows
  2.2x for register pinning on mandelbrot [D] and my prototype shows 16x over the *integrated* interpreter.
- **How to do it in C++ here:** the VM already has `step<O,T>` specialised on opcode and type; make operands `constexpr` template args (or an `Ops{a,b,c}` struct passed by value that folds after inlining). Generated code then literally is the interpreter body with constants folded (the Futamura projection), while the hot scalar ops are also emitted as plain C expressions from the same header of inline functions (7.1).

---

## 4. Quick performance wins for the current interpreter/JIT (before any AOT)

Ranked by (impact x confidence) / effort. Attribution of the 3-4.5x gap to prototype numbers is **[I]**; I did not profile (see 8).

### 4.1 Compiler (`compiler/src/emit-bc.ts`, benefits all tiers and the AOT input)
1. **Copy coalescing and arg windows:** compute call arguments directly into the outgoing window; drop the temp-then-dest phi copies when the interval does not conflict. mandelbrot: 24 of 107 instrs are `MOV`, 16 are `JMP` [V]. (`:156-165`, `:283-313`)
2. **Constant handling:** dedupe constants (`:180` pushes a new pool entry per use), and add K-forms or immediates; hoist loop-invariant constants; emit scalar `K` as `mov`/`fmov` in JIT/AOT. 19 `K` in mandelbrot [V].
3. **Slot allocation (linear scan on MIR intervals):** shrink frames from 79 registers to a few dozen; less ref zeroing per call (`main.cpp:426`), smaller async save/restore copies (`:227`, `:516`), better cache behaviour, tighter GC scan.
4. **Compare-and-branch fusion (`LT`+`BR`) and jump threading;** the prototype found `FORLOOP` fusion within noise for the interpreter [D], but the JIT/AOT get it for free (no bool materialisation).
5. **MIR inlining of small leaf functions:** -42% on spectralnorm in the prototype [D]; also needed for AOT since clang cannot inline across the VM's call protocol unless calls are direct C calls (they will be).
6. Ranges (`number` -> `i32` loop counters) and bounds-check hoisting: listed as missing in `mir.ts:5`.

### 4.2 Interpreter (`runtime/vm/main.cpp`)
1. **`CALL` fast path** (`:416-429`): each call does `vm->fns[target]`, `vm->fns[vm->fn].types.size()`, a range check against the stack, a loop over `fn.refs` and a loop over `fn.params` with vector indexing, plus `poll()`. Precompute per-callee `{frameSize, refs*, params*}` in a POD table and embed `next = fp + frameSize` in the `Ins`. Expected 1.5-2x on call-heavy code. [I]
2. **Inline caches for objects/arrays** (`:172-181`, `:632-652`): cache `{layoutId -> slot}` per instruction (32-byte `Ins` has 4 spare bytes; or shrink `Ins` to 16 bytes as designed and use a side table), quicken `FIELDGET` to `FIELDGET_CACHED` by rewriting `ip->h` (data mutation only, legal on iOS as the design doc states). Removes `std::find` + 5 checks per access. Array `std::vector<Reg>` -> raw pointer+length for `INDEXGET/SET`.
3. **Integer div/mod through doubles** (`:402-405`): replace with integer ops preserving results (`INT_MIN / -1` and `% -1` need explicit cases, since C++ is UB there while the double path wraps).
4. **Accumulator registers** carried as handler arguments: -20/-22/-27% on the prototype's float kernels [D]; needs new bytecode forms.
5. **Drop `try/catch` from hot handlers** by making throwing paths `noinline` cold functions returning status (as JIT helpers already do) [I: EH is table-based, cost is mostly code-shape].
6. **Heap:** flatten `Heap` (slots inline or one `malloc`), size-class free lists, avoid `h->bytes()` recomputation per allocation (`:159-160`), avoid one `Heap` per string temporary.
7. `preserve_none` and super-instructions: the prototype found them within noise [D] - skip.

### 4.3 JIT (`runtime/vm/jit.h`)
1. **Direct calls:** static targets (`CALL`, known `gen/async` flags) can be emitted inline: bump `fp` by an immediate, store params from registers, push the `Frame`, `bl` the callee's entry. The current path is a C++ helper round trip with try/catch (`:12-33`), ~9.4 ns per call [V by arithmetic]. Expected 3-5x on fib. [I]
2. **Operand-level sync instead of full sync:** `sync(false)`/`sync(true)` store/reload *all* pinned slots around every helper (`:131`, `:154-159`). A per-opcode table of which operands a helper reads/writes turns that into 1-3 memory ops; pinned callee-saved registers can then live across calls, so **non-leaf functions can be pinned too** (today `leaf` gate at `:92`).
3. **Save only used callee-saved registers** in prologue/epilogue (`:133-135`, `:202-204`).
4. **Scalar `K` as immediates** (no address materialisation + load, `:172-180`).
5. **Poll:** replace the load/decrement/store counter through an absolute address (`:161`) by a check of one byte flag set from a watchdog or by `ldr` relative to x19.
6. **Fix the 1024 recursion cap (`:21`) to match the interpreter** (semantic divergence, see 7.3).
7. x86-64 JIT is not planned; AOT-through-clang is the cross-architecture story.

### 4.4 GC frame precision
Conservative "all ref slots of every live frame, zeroed on entry" (`:112-113`, `:426`) costs zeroing and retains dead values. Per-call-site liveness bitmaps (stack maps) at safepoints (allocation, call, await) remove the zeroing and reduce retention. It changes *when* objects die, which is unobservable today (no finalizers/weak refs in the VM); keep an exact-equal heap-accounting oracle (7.5). [I]

Expected combined effect of 4.1-4.3: interpreter 2-3x (toward the prototype's 43/78 ms), JIT 2-4x on call-heavy code. [I]

---

## 5. Recommended architecture: "ZBC -> C++ AOT, single-sourced semantics"

### 5.1 Pipeline
```
TS -> HIR -> MIR -> emit-bc.ts -> app.zbc (+ app.zbc.debug)       [unchanged; improved in Phase 0]
                                       |
                   zinc-vm --emit-aot app.zbc -o aot/          [new mode of the C++ runner: reuses load()+verifier and the opcode table]
                                       |
                    aot/unit_*.cpp  (one TU per module/unit, clang -O2 -ffp-contract=off)
                                       |
              link into the core with libzinc-vm (interpreter stays linked for fallback)
```
Generator in C++ (inside `runtime/vm`) so it shares the verifier, `Fn`/`Layout` structs and the opcode metadata; `emit-bc.ts` keeps its own OPS list ("Kept in the same order as runtime/vm/main.cpp", `emit-bc.ts:10`)
and should not become a second semantics table. Build hookup: `zinc build --engine zinc-vm --vm-tier=aot`; the CLI already drives CMake for cores (`docs/precompiled-core.md`).

### 5.2 Generated function shape
```cpp
// int status: 0 ok, 1 fatal (message in vm->jitError), 2 guest throw (vm->exception set), 3 suspended
int aot_f17(VM* vm, Reg* fp, uint32_t pc) {          // pc!=0 only for async/gen resume
  if (async_or_gen) switch (pc) { case 0: break; case 23: goto R23; ... default: return fatal(); }
  int32_t r5 = fp[5].i; double r9;                    // scalar regs -> C locals (params loaded from fp)
  ...
  L12: r9 = f64_mul(r7, r8);                         // single-sourced scalar semantics (7.1)
  L13: if (poll_tick(vm)) return poll_slow(vm);      // same tick accounting as interpreter
  L14: { st = aot_f21(vm, next_fp, 0); if (st) { if (handler) goto H14; return st; } r10 = vm->result.i; }
  L15: st = slow<STRING,ZINC_STRING>(vm, fp, /*a,b,c*/ 9, 8, 0x1101, code_ptr(17,15)); ...
```
- **Scalar registers** in C locals; before a `slow<>` op that reads scalar operands from `fp[]`, store just those operands, after it reload just the scalar result (operand-level sync, the fix in 4.3-2).
- **Ref registers** live in `fp[]` (the VM stack). This is the shadow stack: exact roots via the existing `frames[]` + `fns[].refs` scan, unchanged GC. Conservative C-stack scanning is *not* recommended: non-moving heap, but object storage is a separate `std::vector` allocation, so interior pointers would need a second registry [I].
- **Frame protocol** identical to the interpreter: `vm->frames[vm->depth++]={call_site_ip,fp,dst,fn}`, `vm->fn=callee`, depth check at the same limit and message. Needed for GC roots, `captureTrace` (`:320-336`) and `execute()` re-entry.
- **Exceptions:** callee status 2 -> `goto` the same-function catch label (scalar locals survive, as the catch target is in the same C function) or return 2. No C++ EH across generated code; `slow<>` wrappers are `noexcept` and convert `GuestThrow`/`std::exception` to status, exactly like `jitHelper` (`jit.h:33`).
- **Async/generators:** keep all slots in `fp[]` for such functions (no local promotion) at first; a resume switch on `pc` as in the JIT (`jit.h:146-153`); spill-at-suspend promotion can come later.
- **Timeout/interrupt polling:** `++vm->ticks&4095` on the same instruction classes as the interpreter (JMP/BR/CALL/THROW), so tick counts are equal.
- **Source traces:** `captureTrace` needs `const Ins*` inside `fns[f].code`; AOT passes `&code[pc]` to slow paths only (no cost on fast paths). `.debug` sidecar unchanged.
- **Fast scalar entry (optional, Phase 3):** for scalar-only signatures without refs, a `int32_t f_fast(VM*, int32_t)` C-ABI entry avoids the frame round trip; the frame push remains needed only for traces. My prototype (31 ms fib) leaves this on the table (3x native -> ~1.5x). [I]

### 5.3 Single-sourcing the semantics (the "no compromise" enabler)
1. Split `main.cpp` into `vm_core.h` (Reg/Heap/VM/step) + `vm_interp.cpp` + `vm_load.cpp`. Change `step<O,T>(vm, ip, fp)` to `step<O,T>(vm, Ops{a,b,c}, ip_for_diagnostics, fp)` so that AOT passes compile-time constants and the interpreter passes runtime ones.
2. Move scalar semantics (`typedNumber`, `uint32()`, `value()`, integer/float arith, compare, shifts, CONV, `NEG`, `BITNOT`, `SQRT..TRUNC`) into `inline` functions `sem::add<T>()...` used by *both* `step` and the generator's C. A unit test compares every (op, type) pair over random and edge inputs between the interpreter handler and the generated C function (incl. NaN, -0, INT_MIN, f32 rounding). Floating point must be compiled `-ffp-contract=off -fno-fast-math`, or the generated code can fuse `a*b+c` differently from separate handlers (my prototype uses `-ffp-contract=off`).
3. An X-macro **opcode metadata table** (operand roles read/write/scalar/ref, can-throw, can-GC, can-suspend, can-reenter) drives: the verifier, the JIT's operand-level sync, the AOT emitter and the GC-stress instrumentation. Today the same knowledge is spread over `step`, `load()` verification (`:931-1027`) and `jit.h` (`:105-113`).
4. Slow ops are non-template out-of-line functions per (op, type) (already instantiated by `handler()`/`jitHelperFor()`), so generated TUs stay small and compile fast.

### 5.4 Runtime prerequisites
- **One recursion limit** in all tiers (16383 is the interpreter's; JIT's 1024 at `jit.h:21`, async/gen/callback cap 1024 at `main.cpp:1097`, `:1176`, `:1200` - decide and unify).
- **Large C stack:** AOT recursion uses the C stack. Run `execute()` on a dedicated thread with an explicit stack (e.g. 64 MB reserve), or check `__builtin_frame_address` against a limit and raise the *same* VM error at the same logical depth (a smaller-stack platform must not fail earlier than the interpreter would). [I: iOS secondary thread default 512 KB is from memory of Apple docs, not re-verified]
- **Interop:** `invokeCallback`/`runTask`/`generatorStep` call `execute()`; `execute()` gains `if (fn has aot) status = aot[fn](...)` beside the JIT branch (`:1070-1076`).

---

## 6. iOS legality and the OTA story

- **Rule [W + D]:** App Store guideline 2.5.2 forbids downloading code that changes features; DPLA 3.3.1(B) allows code "interpreted and run by an interpreter engine embedded in Your Application" within the reviewed purpose (`docs/reports/ios-core-runtime.md:26-31`). Native code compiled ahead of time into the shipped, signed binary is fine; downloaded dylibs/machine code/wasm AOT artifacts are not (`:47-51`). JIT (`MAP_JIT`) is not available to third parties on iOS (`:41`). Hence: `--vm-tier=jit` is desktop/Android/Pi only; AOT is a *build-time* compile of bytecode that the developer ships.
- **Binding rule (recommended):** the loader binds `vm.aot[fn]` only when a content hash of the function's canonical form equals the hash recorded in the AOT object. Otherwise `vm.aot[fn]==nullptr` and the interpreter runs the (verified) bytecode. Downloaded bytecode can therefore only (a) select code that was already in the reviewed binary, byte-identical, or (b) be interpreted. This is exactly decision 2 of `ios-core-runtime.md:14`.
- **Granularity problem [V from code]:** ZBC4 links the whole program into one function table, one layout table, one constant pool, one global table (`emit-bc.ts:54-55`, deduped layouts `:112-115`, first-use field ids `:85-86`). Any OTA edit shifts indices; a whole-bundle hash would make *every* OTA edit fall back to the interpreter for the whole app.
- **Fix, staged:**
  1. *Phase A (release builds, no OTA):* whole-bundle hash. AOT unit = whole program. Ship this first.
  2. *Phase B (mixed mode):* ZBC5 adds a symbol section (field names, function names/module id, layout structural descriptors) and a per-module **canonical hash** (bodies with local indices replaced by symbolic ids). AOT unit = module: direct calls and inlining inside a unit, **indirect through a loader-filled table** across units (`vm->got.fn[k]`, layout and constant remap tables). An OTA edit to one module makes only that module interpreted; the rest stay native. Cross-unit direct calls (Merkle hash over callees) are *not* recommended: a changed leaf would demote all transitive callers.
  3. Signed manifest (Ed25519) covers bytecode + AOT hash list; capabilities cannot grow via OTA (`ios-core-runtime.md:96-99`).
- **Cost of the fallback:** modified modules run at interpreter speed (10-16x slower on scalar loops today, closer to 4-8x after Phase 0). The UI/runtime services stay native, so app-level impact is smaller (`ios-core-runtime.md:16-22`).
- **Android:** same rule in practice (bytecode interpreted OK, downloaded native code not) [W: OTA policy posts]; AOT is arch-neutral because clang targets any of them.

---

## 7. What "no compromise" means (proposed definition) and how each item is enforced

Reference oracle = **the interpreter (Tier 0) on the same verified bundle**, itself parity-checked with native/QuickJS by the existing matrix.

1. **Bit-identical observable behaviour:** stdout bytes, exit status, error text, uncaught-error stack (function name + file:line:col from `.debug`), pixel captures, event/timer/microtask ordering, `ZINC_VM_STATS` counters.
2. **Identical limits:** recursion depth (16383) and messages, register stack, heap budget failure at the same allocation, timeout/interrupt (same tick classes; timing non-determinism excluded).
3. **Identical resource semantics:** heap accounting (`heapBytes`, `peakHeapBytes`, `collections`) equal at exit. AOT performs the same allocations in the same order, so equality is a strong oracle. GC triggers are a pure function of `heapBytes`.
4. **Documented, not solved, gap vs native:** destruction timing (RC vs tracing GC, `docs/engines.md:154-155`) and custom Error subclasses/stack info (`:190-191`). AOT inherits VM semantics; closing this is the separate RC-pass project in `zinc-vm.md` section 5.
5. **Safety:** AOT code is only entered for functions whose hash matches; interpreter verifier always runs on the loaded bundle; AOT code contains no guest-supplied pointers, indexes are compile-time constants from verified bytecode; all dynamic checks the interpreter performs (null/object/layout/type/bounds/closure signature) are kept (fast-path guards + slow fallback), never dropped because "the verifier already checked" (the verifier cannot check them: refs are untyped `VM_REF`).
6. **No FP divergence:** `-ffp-contract=off`, no fast-math, same helper for `fmod`/`trunc`; FMA fusion is the classic AOT-vs-interpreter mismatch.
7. **No un-tiered semantics:** every new op lands first in the interpreter `step`, and AOT/JIT delegate to it until an explicit, tested fast path exists.

### 7.x Fidelity per option (summary)
| Concern | (a) JIT emitter offline | **(b/f) ZBC->C++** | (c) MIR->C++ | (d) LLVM/QBE/MIR | (e) Wasm |
|---|---|---|---|---|---|
| Exceptions as status codes | same as JIT | yes, by construction | reimplement | reimplement | wasm EH or status codes |
| Async/generator frame save | JIT has it (`jit.h:146-153`) | same design | reimplement | reimplement | reimplement (or stack switching) |
| GC roots | frame slots | frame slots (`fp[]`) | needs stack maps | LLVM statepoints possible | shadow stack |
| Timeout/interrupt polling | yes | yes, same tick classes | reimplement | reimplement | reimplement |
| Debug/source traces | `Ins*` to helper | `&code[pc]` on slow path | new mapping | new mapping | new mapping |
| iOS legal | yes | yes | yes | yes | interpreter only |
| OTA fallback | needs hashes | needs hashes | needs MIR-equivalence | needs hashes | n/a |
| x86-64/armv7 | no | yes | yes | yes | yes |

---

## 8. Measurements (what I ran, what I did not)

- **Ran (safe, read-only):** the *already built* binaries under `tests/bench/kernels/build/*` (gitignored `build/`; built 2026-09-29, so they predate today's dirty runtime edits and are
  stale relative to the working tree) for native, VM `--jit` and interpreter, plus my scalar ZBC4->C prototype in the scratchpad. Results agree with `docs/engines.md`'s table (fib 128/67 ms, mandelbrot 349/80 ms): three consecutive runs
  gave fib native 9.8-10.8, VM 130-133, JIT 66-68, AOT proto 30.8-31.4; mandelbrot 22.2-22.5, 348-354, 80-82, 21.8 ms. One noisier run (load 6) inflated native fib to 24.6 ms; ignore it.
- **Not run:** `node tests/engines/run.mjs --bench-only` because it rebuilds via `zinc build` into `tests/engines/build/` and rewrites `benchmark.json` inside a dirty tree. I did not build the current dirty `runtime/vm/main.cpp`. **No profile** (`sample`/Instruments) of the interpreter; the attribution in section 4 is reading-based **[I]**.
- **Prototype scope:** `aotproto/gen.mjs` reads `app.zbc`, emits C for K/MOV/LOAD/STORE/arith/compare/CONV/JMP/BR/CALL/RET/PRINT/NEWLINE only. Types: I32/U32/F64 (no F32, no refs, no throw, no GC, no polling slow path - `vm_poll` returns 0).
  It keeps: `Frame` push/pop (16 bytes), args stored in the callee frame, depth check at 16383, `++ticks&4095` on JMP/BR/CALL, result via `vm->result`. It removes: ref zeroing, GC, exceptions, `vm->fn` maintenance, `catchPc`.
  Expect fib to grow by some 10-30% once `vm->fn` maintenance and exception plumbing are added. [I]
- **Per-kernel expectations for a full AOT** [I, calibrated by the above and by `zinc-vm.md` section 3 mixes]:

| Kernel | interp now | AOT (est.) | Basis |
|---|---|---|---|
| fib | 130 | 30-40 (15-20 with fast scalar entry) | measured proto 31 |
| mandelbrot | 350 | 22-30 | measured proto 21.8 |
| nbody / spectralnorm (objects, arrays, calls) | ~9x native in design proto | 2.5-4x native (with field ICs, coalescing, inlining) | `Heap` indirection + guards remain |
| binarytrees / mapset / strings / jsonout | 1.3-2x native | 1.1-1.5x native | runtime-bound |

Comparable systems: QuickJS-AOT +36-43% geomean [W], LuaAOT +20-60% (2x numeric) [W], weval 2.2-2.8x (4.4x max) [W], CPython copy-and-patch ~parity [W], Static Hermes typed AOT emits C for typed code (no JIT) [W: web summaries, not verified in primary docs].
A typed VM has larger headroom than these because per-op work is tiny, which is what the prototype shows.

---

## 9. Roadmap, effort, risks, tests

### 9.1 Phases (one experienced engineer, weeks)
| Phase | Content | Effort | Exit criterion |
|---|---|---|---|
| **P0 Quick wins** | 4.1 (1-3), 4.2 (1-3), 4.3 (1,2,4,6), unify recursion limit | 2-3 | interp fib/mandelbrot <=70/180 ms, JIT <=25/60 ms; 4-mode matrix green |
| **P1 Refactor** | header split, `Ops` operands, `sem::` scalar functions, opcode metadata table, GC-stress switch (`ZINC_VM_GC_STRESS=1`: collect at every allocation), heap-stat equality test | 3-4 | no behaviour change; per-(op,type) micro-tests |
| **P2 AOT emitter** | `--emit-aot`, unit TUs, status codes, frame protocol, async/gen resume, catch edges, whole-bundle hash binding, big-stack thread, CLI `--vm-tier=aot`, ASan/UBSan build | 5-7 | five-mode matrix (native, VM, JIT, AOT, QuickJS) green on `tests/engines` + graphics captures |
| **P3 Perf** | field/array ICs in fast paths, operand-level sync, fast scalar entry, precise stack maps, per-function `-O1/-O2/-Os`, ThinLTO, profile-guided (interpreter counters -> "hot list") | 3-4 | nbody/spectralnorm <=4x native; compile time budget met |
| **P4 Mixed mode / OTA / iOS** | ZBC5 symbol section + canonical hashes, per-module units + GOT, signed manifest, iOS static link + thread stack, App Review notes | 4-6 | OTA edit of module M only interprets M; parity test in mixed mode |
| **P5 optional** | LLVM IR backend (statepoints, `tailcc`), MIR-level super-instructions, x86-64 JIT | 6-10 | only if needed |

Total P0-P4: about 17-24 weeks. [I]; the design doc's comparable V6+V7 (Tier 1 c&p + Tier 2 MIR) is 14-18 weeks for desktop-only gains and does nothing for iOS.

### 9.2 Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | AOT/interpreter semantic drift | single-sourced `sem::`/`step`, five-mode matrix, per-op micro-tests, heap-stat equality, GC-stress |
| R2 | Build time/size of generated C++ on big apps (UI demos) | per-module TUs, out-of-line slow ops, parallel compile, hash-keyed object cache, `-O1` cold; measure early on the largest UI demo |
| R3 | FMA / fast-math divergence | `-ffp-contract=off`, no fast-math, micro-tests with NaN/-0/f32 |
| R4 | GC root bugs (values in registers across an allocation) | refs only in `fp[]`; GC-stress in CI; ASan; a generator assertion that every `can-GC` op sees no live ref local |
| R5 | C-stack overflow before logical limit | dedicated big-stack thread; frame-address guard raising the identical VM error |
| R6 | OTA demotion cliff (interpreter 4-16x slower) | per-module units (not per-app), profile-guided module selection (`zinc promote`), keep P0 gains |
| R7 | Layout/field ids unstable across builds | ZBC5 symbol section + canonical hashes; until then whole-bundle only |
| R8 | Interpreter and AOT diverge on stack traces | tests/engines/debug-map.mjs extended to AOT; `Ins*` passed on slow paths |
| R9 | Apple review of "downloaded bytecode chooses native code" | hash-equality binding + no capability growth; document as data-selects-signed-code; ship per-customer shells before a public container (`ios-core-runtime.md:14`) |
| R10 | musttail/`preserve_none` toolchain support | AOT does not use musttail; fallback interpreter already has a non-clang loop (`main.cpp:844-847`) |

### 9.3 Test plan (reuse the four-mode parity matrix)
1. Add `zinc-vm-aot` to `engines` in `tests/engines/run.mjs:10-11` (`--vm-tier=aot`). The existing ~62 fixtures (`:29`), graphics capture matrix (`:41`), `core-cli`, and limit tests (`array-limits`, `string-*-limits`, heap-64KB loop `:183-188`) run in five modes.
2. **Heap-stat equality:** `ZINC_VM_STATS` JSON must be equal in interpreter, JIT and AOT (`collections`, `heapBytes`, `peakHeapBytes`).
3. **GC-stress mode** for interpreter/JIT/AOT on every fixture; ASan/UBSan AOT builds (`--debug`).
4. **Mixed mode:** for each fixture, AOT a random subset of functions (or modules) and interpret the rest; check exceptions, async resume and generators cross the boundary in both directions.
5. **Limits:** recursion at 16382/16383/16384 (same result and message in all tiers), timeout and interrupt on an AOT loop (`:174-182` analogue), callback re-entrancy (`callback-bench`).
6. **Stack traces:** identical `guestDiagnostic` text (uncaught guest exception with `.debug`) across tiers.
7. **Numeric micro-tests:** every (op,type) over edge inputs, interpreter vs generated C.
8. **Bench:** extend `--bench` list with nbody, spectralnorm, binarytrees, mapset, sort (they exist in `tests/bench/kernels`), and add an AOT column. Continue to keep raw samples.
9. **Verifier fuzz** stays interpreter-side (`run.mjs:119-147`); add a test that mutated bytecode never binds AOT code (hash mismatch -> interpreter).

---

## 10. Sources

Repository (all read):
- `runtime/vm/main.cpp` (interpreter, GC, loader/verifier, async/generators, callbacks), `runtime/vm/jit.h`, `runtime/vm/abi.h`, `runtime/vm/embedded.cpp`
- `compiler/src/emit-bc.ts`, `compiler/src/mir.ts`, `compiler/src/hir.ts` (skimmed), `compiler/src/emit-cpp.ts` (structure and async/error handling)
- `docs/engines.md`, `docs/engine-progress.md`, `docs/precompiled-core.md`, `docs/reports/zinc-vm.md`, `docs/reports/PERF.md`, `docs/reports/ios-core-runtime.md`, `tests/engines/run.mjs`

Web (WebSearch/WebFetch, summaries by a small model; treat numbers as [W], not independently reproduced):
- ivankra/quickjs-aot: https://github.com/ivankra/quickjs-aot
- weval (Fallin): https://cfallin.org/blog/2024/08/28/weval/ , paper https://cfallin.org/pubs/pldi2025_weval.pdf
- LuaAOT: https://github.com/hugomg/lua-aot-5.4 , paper https://dl.acm.org/doi/10.1145/3475061.3475077
- Copy-and-patch: https://arxiv.org/abs/2011.13127 ; CPython PEP 744: https://peps.python.org/pep-0744/
- wasm3 performance: https://github.com/wasm3/wasm3/blob/main/docs/Performance.md
- MIR project: https://github.com/vnmakarov/mir
- musttail / preserve_none: https://blog.reverberate.org/2025/02/10/tail-call-updates.html , https://discourse.llvm.org/t/rfc-exposing-ghccc-calling-convention-as-preserve-none-to-clang/74233
- Static Hermes overview (secondary): https://medium.com/@elves.silva.vieira/javascript-achieves-breakthrough-performance-with-static-hermes-6286b0ac8ef7
- OTA/App Store 2.5.2: https://saagarjha.com/blog/2020/11/08/fixing-section-2-5-2/ , https://www.otakit.app/blog/app-store-compliant-ota-updates
- Wasm runtime perf context: https://00f.net/2023/01/04/webassembly-benchmark-2023/

Scratchpad artefacts (not in the repo): `aotproto/gen.mjs` (ZBC4 -> C, scalar subset), `aotproto/rt.h`, `aotproto/main.c`, `aotproto/bench.mjs`, `dump.mjs` (bytecode histogram).


---

<!-- source: quickjs-jit-aot.md -->

# QuickJS JIT tier and real AOT mode for Zinc: research and roadmap

Date: 2026-09-30. Host: Apple M1 Pro (arm64), macOS 24.6, Apple clang 21, load average 5-7 during timings. The Zinc tree was dirty and was not modified. Clones live in the scratchpad: `quickjs-aot/`, `quickjit/`, `quickjs/` (quickjs-ng master).

Legend: **[V]** verified here by running or reading code. **[W]** from a web source, not reproduced. **[I]** my inference.

Paths below are relative to `/Users/mowmow/Lab/zinc` unless prefixed `SP/` (the scratchpad).

---

## 0. Verdict

1. Zinc embeds **quickjs-ng 0.17.0** (amalgam), not Bellard's tree [V]. `plugins/script/vendor/quickjs/quickjs.h:1458-1461` gives `QJS_VERSION_MAJOR 0 / MINOR 17`. `docs/licenses.md:17` says the same. The build is plain `-O2` on the amalgam (`compiler/src/engines.ts:54-55`).
2. Zinc's QuickJS runner **parses ES source at every start**. `runtime/vm/quickjs.cpp:226` calls `JS_Eval(... JS_EVAL_TYPE_MODULE|JS_EVAL_FLAG_COMPILE_ONLY)` on the source text. `compiler/src/engines.ts:130-170` (`bundleJs`) copies `.mjs` files. There is no bytecode path, no `JS_WriteObject` and no AOT. Phase 0 is therefore real and cheap.
3. The only existing AOT that keeps full QuickJS semantics is **ivankra/quickjs-aot** (MIT, Futamura projection). I built it and reproduced the effect: **`qjsc -A` is 1.4x on fib and 2.2x on mandelbrot** against its own tail-dispatch interpreter, and only **1.14x on an object/alloc kernel**. It is based on Bellard's 2025-09-13 tree, not quickjs-ng.
4. **Against quickjs-ng 0.17 the AOT advantage on object code disappears.** ng's interpreter is already about 20-25% faster than that Bellard base on mandelbrot and objects [V]. quickjs-aot on the object kernel was 0.71 s against 0.61 s for stock ng. Any AOT for Zinc must therefore be ported onto ng, or ng's improvements ported to it.
5. **Tail-call dispatch alone buys about 0-6% on this M1 Pro with clang 21 [V].** The published "+25%" (Mac M4, Debian VM) is not reproduced here. Do not budget it as a headline win.
6. The biggest realistic gains, in order of certainty:
   - (a) **Emitter hygiene.** `Math.fround` for f32 costs about 2x on a float loop [V, Section 4.3]. Zero engine work.
   - (b) **Bytecode precompile plus PGO/LTO build.** Startup and about 10-20% [I].
   - (c) **AOT `-A` ported to ng.** 1.5-2.2x on numeric loops, 1.1-1.2x on object code.
   - (d) **Interpreter inline caches for get/put field.** Published +22% Octane geomean on a QuickJS fork [W]. Stock ng 0.17 has none [V].
   - (e) **A baseline JIT.** Expensive, and it does not fix refcounting or the tag/16-byte JSValue costs. The evidence for it on QuickJS is a single MIT third-party project whose own docs contradict each other on wins.
   - (f) **Typed specialization from Zinc types.** The only route to Zinc-VM-class numbers (5-10x over the interpreter on numeric kernels) [I, anchored on `docs/reports/zinc-vm.md:228-241`].
7. iOS: Phases 0, 1 and the IC work are legal there. Phases 2 and 3 as a runtime JIT are not (`docs/reports/ios-core-runtime.md:40`). Phase 3 can still be emitted as AOT.

---

## 1. Zinc's current QuickJS integration [V, read]

| Item | Fact | Ref |
|---|---|---|
| Engine | quickjs-ng 0.17.0 amalgam, MIT | `plugins/script/vendor/quickjs/quickjs.h:1458`, `docs/licenses.md:17` |
| Two consumers | (1) engine runner `runtime/vm/quickjs.cpp` (dev/test tool, `--engine quickjs`). (2) `zinc:script` plugin `plugins/script/native/quickjs.host.cpp` (sandboxed scripting, 667 lines). | |
| Runner setup | `JS_NewRuntime`, 512 MiB memory limit, 1 MiB stack, interrupt handler for the 60 s deadline, custom module loader | `runtime/vm/quickjs.cpp:262-269` |
| Module loading | Reads source text and compiles it with COMPILE_ONLY. Native modules resolve through the `ZincModule` ABI. | `runtime/vm/quickjs.cpp:217-231` |
| Script plugin | Same pattern, compile-from-source with memory, stack and interrupt limits | `plugins/script/native/quickjs.host.cpp:430, 473-483, 525` |
| Build | CMake, `add_library(qjs STATIC quickjs-amalgam.c)` at `-O2` (debug `-O0 -g`) | `compiler/src/engines.ts:54-55` |
| JS emit | TS transformer output as ES modules. `|0` for i32, `Math.fround` for f32, `$z.idiv` for integer division. Types are erased. | `compiler/src/emit-js.ts:1-2, 40, 340` |
| Docs status | "JIT: QuickJS interpreter". Only macOS arm64 exercised. | `docs/engines.md` (table row "JIT") |
| Parity harness | `tests/engines/run.mjs`. Modes: `native`, `zinc-vm`, `zinc-vm-jit` (arm64 only), `quickjs`. Byte-exact stdout, plus `--bench` with 1 warmup + 7 interleaved runs. | `tests/engines/run.mjs:9-11` |
| Numbers (M1 Pro) | fib 322 ms, mandelbrot 716 ms, 100k native calls 10.8 ms (QuickJS), against VM-JIT 67/80/5.1 and native 9.6/22/3.0 | `docs/engines.md`, `docs/reports/engine-abi-2026-09-29.json` |
| Wider numbers | Zinc native vs QuickJS (whole-process wall time): nbody 80x, spectralnorm 79x, mandelbrot 33x, fib 16x, sort 5.4x, strings 2.1x, jsonout 2.2x. Geomean 13.1x. | `docs/reports/PERF.md` |
| Zinc VM design claim | tail-acc interpreter is 6.6-10.7x faster than QuickJS, Tier 1 is copy-and-patch, Tier 2 uses MIR | `docs/reports/zinc-vm.md:17-22, 148-160, 228-241, 247-306` |

Two observations that shape the whole plan:

- **The kernels in PERF.md are numeric.** Zinc UI apps (`examples/hero`, `remarkable/notes`) are closure, object, string and array heavy. Numeric AOT wins will not translate 1:1. I did not profile a real Zinc UI app under QuickJS; that is the first thing to do (Section 6, Phase 0).
- **The QuickJS engine's job in Zinc is parity and dev tooling** (`docs/engines.md` intro), not shipping performance. Investment in it competes with the Zinc VM's own Tier 1/Tier 2 plan (`docs/reports/zinc-vm.md:247+`), which already targets the same use cases with typed semantics. A QuickJS JIT is justified mainly where arbitrary untyped JS must run (`zinc:script`, npm code in the "Zinc Core for iOS" bridge, `docs/reports/ios-core-runtime.md:59`).

---

## 2. Existing work

### 2.1 ivankra/quickjs-aot (`SP/quickjs-aot`, cloned at `cee72b9`, "QuickJS-AOT 20251209") [V]

- **License:** MIT (Bellard's QuickJS license file).
- **Base:** Bellard QuickJS, `VERSION` 2025-09-13. It is **not** quickjs-ng.
- **Mechanism (first Futamura projection):**
  1. The interpreter is first rewritten to **tail-call dispatch**. Every opcode is a separate `js_OP_xxx()` function ending in `__attribute__((musttail)) return js_tail_dispatch_table[*pc](...)`. Uses `preserve_none` when available (`quickjs.c:53-61`).
  2. `aot-parse.py` (90 lines) parses the *preprocessed* `quickjs.c`, extracts each `js_OP_*` body into `aot-table.h` (`Makefile:346-349`), and rewrites the local labels.
  3. `qjsc -A` (`qjsc.c:371-400`) calls `aot_compile()` (`quickjs.c:59798-59945`). For each function it emits one C function with a labeled block per bytecode offset (`pcN:`), the opcode body pasted in, operands constant-folded against a `static const uint8_t aotN_bytecode[]`, and a computed-goto `pc_table` for generator/async re-entry (`quickjs.c:59888-59889`).
  4. `-B` emits a label at every opcode. It is a proxy for a template JIT: it stops the C compiler optimizing across opcodes.
- **Integration and safety model.** This is the key design point for "no compromise":
  - The AOT function has the *same signature* as an interpreter handler and is entered from `JS_CallInternal` (`quickjs.c:17584-17585`) with the **same `JSStackFrame`, `sp`, `arg_buf/var_buf`**. Refcounting, the cycle collector's frame scan, exception unwinding, generators, `cur_pc`/backtraces and interrupts all use the interpreter's own code because the handler bodies are the interpreter's.
  - Serialized bytecode carries an `aot_id` (`quickjs.c:37498, 38433`). On load, `memcmp` against the compiled-in bytecode decides whether to bind `aot_funcs[id]` (`quickjs.c:38537-38546`). A mismatch silently falls back to the interpreter (it prints to stderr). The bytecode stays authoritative, so `Function.prototype.toString`, line numbers and the debugger keep working.
  - Prototype quality: prints "aot enabled" to stderr, no versioning of the handler table, needs a Python step and `clang` (`musttail` + `preserve_none`).
- **Author's numbers [W, README]** (Mac M4, Debian 13 VM, median of 20): geomean v8-v7 base 2582, tail 2800 (+8%), `-A` 3518 (+36% over base). v8-v9 base 5425, tail 6146, `-A` 7784. Per benchmark: Crypto +78% (tail vs base), NavierStokes +52%, Mandreel +68% (`-A` over base +103%); Richards +25%, DeltaBlue +25%. `-B` gives about half the `-A` gain.
- **Author's own future idea:** JIT by compiling hot functions to `.so` and `dlopen`, blocked by QuickJS's many `static` functions.

**My reproduction [V]**, min of 7 wall-clock runs, `-O2`, same machine, one shared build of the runtime library:

| Kernel | Bellard base (computed goto, built from same source with tail path disabled) | quickjs-aot tail interp | quickjs-aot `qjsc -A` | quickjs-ng 0.17.0 (`cmake Release`) |
|---|---:|---:|---:|---:|
| fib(32) | 0.152-0.155 s | 0.151-0.153 s | **0.108-0.110 s** | 0.173 s |
| mandelbrot 400x400, 200 iter, 13.16M iters | 0.982-0.993 s | 0.927-0.942 s | **0.428-0.432 s** | 0.803 s |
| objects (3M `new V().add`, 300k object array, 3M field reads) | 0.809-0.822 s | 0.808-0.825 s | **0.699-0.724 s** | **0.610 s** |
| `tests/microbench.js` total (library-heavy) | 6262 ms (interp) | | 5862 ms (-6%) | |

Sources: `SP/quickjs-aot/bench/{fib,mandel,objs}.js`, `t2.sh`, `t3.sh`. Checksums matched across all binaries.

Reading it honestly:
- `-A` is real and reproducible: **1.4x / 2.2x / 1.14x over its own tail interpreter**.
- **Tail dispatch itself was neutral on this CPU/compiler** (fib +1%, mandel -6%, objs 0%). The author's +25% is not reproduced on M1 Pro / clang 21. Consistent with the wider finding that clang's computed-goto code is already good on arm64. See also Reverberate's follow-up on tail-call interpreters and a compiler regression that inflated CPython's early numbers [W: blog.reverberate.org/2025/02/10/tail-call-updates.html].
- **The quickjs-aot base is older than ng.** Stock ng 0.17 beats the Bellard base on mandelbrot (0.80 vs 0.98) and objects (0.61 vs 0.82), and is slower on fib (0.173 vs 0.152). Result: `-A` on Bellard base **loses to plain ng on the object kernel** and wins about 1.9x on mandelbrot, 1.6x on fib. Porting `-A` to ng is a precondition.
- Size [V]: `microbench.js` (1584 lines) generates a **2.3 MB `.c`** file. Embedded-binary size 1.46 MB with `-A` vs 1.23 MB for plain `qjsc` bytecode-in-binary (both include the engine). Code growth is roughly 20% on this input; the C is large because each opcode body is inlined per instance.
- Compile time of the emitted C was not measured cleanly (my `time` output was swallowed by warnings). The cost is dominated by clang on a multi-MB file: [I] tens of seconds for a large app at `-O2`.

### 2.2 bnoordhuis/quickjit (`SP/quickjit`, HEAD `d5a3e72`) [V]

- QuickJS fork, JIT = bytecode -> C -> **embedded tcc** (`libtcc.c`, `tccgen.c` ... in the tree). README: "same license as QuickJS. tcc is LGPL".
- **Backend files present: `x86_64-gen.c`, `x86_64-link.c`, `i386-asm.c`. There is no `arm64-gen.c`.** So no Apple Silicon, no Pi, no rMPP. Not an option for Zinc's targets.
- Unfinished ("support put_arg opcode" is the last commit) and hand-translates each opcode (as quickjs-aot's README notes). LGPL in a statically linked app is a problem for Zinc's licensing (`docs/licenses.md` is MIT-only for engines). It also needs a compiler at runtime, which is why it cannot reach iOS.

### 2.3 longbridge/quickjs-jit [W: github.com/longbridge/quickjs-jit, PRs #21 and #30]

- MIT. "A high level binding" (Rust, rquickjs-compatible) of **QuickJS-NG with JIT patches**. ABI is tightly coupled to a patch version.
- Design from PR #30: Tier 1 baseline emitting machine code directly (x86-64 primary), Tier 2 lowering to **Cranelift** IR. Inline refcount DUP/FREE in generated code, closures, exception regions, direct native-to-native calls, later polymorphic property ICs (up to 4 shapes), guard elimination, bounds-check elimination. Frame materialization on deopt or exception.
- Claims: 28 of 35 x86-64 Linux scenarios significantly faster than the QuickJS interpreter, 5 tied, 2 slower. A fibonacci scenario "26.97x faster than QuickJS", still 0.72x of Bun's speed. But an earlier doc-PR (#21) reported only "8 faster, 1 tied, 13 slower", so the project is fast-moving and the numbers are self-reported and not reproduced. macOS aarch64 marked untested.
- **Value to Zinc:** reference architecture, an existence proof of a QuickJS-ng JIT with refcounting and exceptions handled, and a codebase to read. Adopting it as a dependency is risky (patch-version ABI lock, x86-64 first, Rust-centric packaging, moving target).

### 2.4 quickjs-ng and Bellard [V + W]

- ng 0.17.0 has **opcode fusion** (`quickjs.c:18941` region comment; docs `diff.md:43`) and a faster allocator, but **no inline caches in the code I inspected**: `OP_get_field` does `find_own_property` + prototype walk on every execution (`quickjs-amalgam.c:31580-31627`, `find_own_property1` at `:17685-17700` is a hash-chain walk). ng's docs page lists "polymorphic inline caching" [W: quickjs-ng.github.io/quickjs/diff/]. I found no such code in the vendored 0.17.0 amalgam or in the ng master clone (`SP/quickjs`, HEAD `2f0aa72`); treat the doc line as unverified or as unreleased.
- ng dispatch: computed goto on non-MSVC/Emscripten (`quickjs-amalgam.c:9222-9233`). No tail-call dispatch.
- ng serialization: `JS_WriteObject/JS_ReadObject` and `qjsc` exist (`quickjs.h:1267-1287`), i.e. Phase 0's precompile is supported API. No heap snapshot facility in QuickJS/ng.
- **gkurt/quickjs PR #9 [W]:** 15 optimizations, **+22.1% Octane geomean** (RayTrace +51%, Crypto +49%, Gameboy +60%, zlib +41%), driven by callgrind. Property caches enlarged, dictionary-mode shapes, dense-array revert, a 256-entry per-context global-variable cache with self-validation, `OP_to_int32`, fast `apply`. Semantics preserved by self-validating cache entries and cache invalidation on descriptor conversion. Peak memory +1.6%. This is the best public evidence for what interpreter-level work gives on QuickJS.
- Bellard's **MicroQuickJS** is a different language subset; see `SP/mquickjs.md` from the earlier assessment. Not relevant to a JIT/AOT for full ES.

### 2.5 weval, LuaAOT, Deegen, copy-and-patch [W]

- **weval** (bytecodealliance): partial evaluator over **WebAssembly** snapshots; the interpreter needs about 100-200 lines of intrinsics (context updates on pc change, specialization requests, virtual locals/stack ops). Results: SpiderMonkey PBL + weval **2.17-2.19x over the same interpreter** (PLDI'25, geomean 2.77x vs the generic interpreter including the PBL gain; up to 4.39x), PUC-Lua 1.84x [W: cfallin.org/blog/2024/08/28/weval/, arxiv.org/abs/2411.10559]. It is Wasm-only, so it applies to QuickJS only if QuickJS is run as Wasm. Not native arm64. Conceptually identical to quickjs-aot's `-A`; the gains are also consistent (about 2x on numeric).
- **LuaAOT** (Gualandi and Ierusalimschy, SBLP 2021): about 500 lines, run-time reduction 20-60%, biggest on Mandelbrot (about 60%), smallest on K-Nucleotide (20%). Gain comes from removing decode/dispatch, so it depends on instruction mix [W: inf.puc-rio.br/~roberto/docs/paper-aot-preprint.pdf]. This matches quickjs-aot: 2.2x (54% less time) on mandelbrot, 1.14x on object code.
- **Copy-and-patch** (Xu and Kjolstad, OOPSLA'21) and **CPython 3.13 JIT**: stencils are compiled by LLVM from C templates with relocation holes, then memcpy'd and patched at run time. Code quality approaches LLVM -O0/-O1 quality with compile times orders of magnitude lower [W]. CPython's 3.13 result was modest (single-digit % on pyperformance) because its bytecode is not typed [W, tonybaloney.github.io/posts/python-gets-a-jit.html], which is the point: a stencil JIT removes dispatch, not the semantics cost of generic operations. Requires clang at build time only. This is the design already sketched for Zinc VM Tier 1 (`docs/reports/zinc-vm.md:247-282`).
- **Deegen** (LuaJIT Remake, arXiv 2411.11469): generates an interpreter and baseline JIT from one description; x86-64 focused in the paper. Too invasive for QuickJS.
- **Static Hermes / Hermes** [W]: typed AOT, 2-5x faster than Hermes interpreter on typed code; even the Hermes team says untyped AOT is not a win over a high-tier JIT. **Porffor**: AOT JS to Wasm/C, incomplete ES coverage, so it violates "no compromise". **Kiesel, Boa**: not investigated in depth (I did not read their code; I list them only as further interpreters without a JIT).

---

## 3. Why QuickJS is slow (and what each technique can fix)

All code refs are the vendored amalgam `plugins/script/vendor/quickjs/quickjs-amalgam.c` unless noted.

### 3.1 The real costs [V read, I estimate]

1. **JSValue is a 16-byte {union, int64 tag} struct on 64-bit** (`quickjs.h:315-335`; NaN-boxing only on 32-bit, `quickjs.h:173-175, 251`). Every operand-stack slot, argument and local is 16 bytes, so twice the memory traffic of a NaN-boxed engine. The tag is checked on every arithmetic op (`OP_add`, `:32138-32165`: int+int with overflow to double, double+double, mixed, else slow path).
2. **Reference counting on every stack move.** `js_dup(pr->u.value)` on every property read and `JS_FreeValue(sp[-1])` after (`OP_get_field`, `:31580-31627`). Every `get_loc`/`put_loc` of a heap value is a dup/free pair. A cycle collector (`gc_decref`) runs on top.
3. **Property lookup is hash chain by atom per access with prototype walk**: `find_own_property` into a per-shape hash table, then `p->shape->proto` on miss. No inline caches at the bytecode site. Method calls do it twice (own property miss then prototype hit). Exotic objects (arrays, typed arrays) take a slow path (`:31607-31612`).
4. **Calls are heavy.** `JS_CallInternal` sets up a `JSStackFrame`, allocates arg/var buffers, checks stack depth and links the frame list. Recursion cost dominates fib.
5. **Dispatch and decode.** Variable-length opcode encoding (`SHORT_OPCODES`), decode of operands on every execution, indirect branch per opcode. This is what tail dispatch and AOT remove; it is a smaller share on modern cores than people expect (my tail-vs-goto result).
6. **No type feedback.** Nothing records "this add always sees int32" or "this site always sees shape S".

### 3.2 What each technique realistically gives

| Technique | Removes | Does NOT remove | Evidence | Expected gain over ng 0.17 |
|---|---|---|---|---|
| Tail-call dispatch | Some dispatch overhead and register spills of the big `switch`/`goto` function | Everything else | [V] 0-6% on M1 Pro / clang 21; [W] +8-25% claimed elsewhere | 0-8% on arm64/clang 21; more with GCC/x86 |
| Bytecode precompile (`JS_WriteObject`) | Lex/parse/compile at startup | Steady state | [I]; no measurement of Zinc apps yet | Startup only (proportional to bundle size); nil steady state |
| PGO + LTO + `-O3` on the amalgam | Bad inlining/layout | | [I] typical interpreter PGO 10-20% | 10-20% |
| Emitter hygiene (avoid `Math.fround` calls etc.) | JS-level overhead Zinc adds | | [V] Section 4.3: 2x on a float loop | 1.2-2x on f32 code |
| `qjsc -A` style AOT | Decode, dispatch, operand loads, some stack traffic; constant folding across opcodes | Refcounting, tag checks, property hashing, call setup | [V] 1.4x fib, 2.2x mandelbrot, 1.14x objects; LuaAOT 1.25-2.5x; weval 1.8-2.2x | 1.5-2.2x numeric, 1.1-1.2x object/closure, about 1.0x string/regexp/library-bound |
| Copy-and-patch baseline JIT | Same as `-A` but at run time, works for `eval`/OTA code | Same | `-B` mode gives about half of `-A` [W]; CPython small wins [W] | About the same as `-A`, minus a bit; no better without ICs |
| Inline caches for get/put field, calls | Hash lookup + proto walk | Refcount, tags | gkurt fork +22% Octane geomean, up to +50% on property-heavy [W] | 10-25% object code (2x on tight property loops) |
| Int/double specialization in a tracing/method JIT | Tag checks, boxing, overflow branches for provably-int loops | Refcount on heap values | quickjs-jit claims 20x+ on fib-like scenarios [W, unreproduced] | 3-10x on numeric kernels, ~1x on object/string code |
| Zinc-typed AOT (Phase 3) | Tag checks, boxing, IC lookups for known classes | Unknown/`any` code | Zinc VM typed estimates 4-11x vs QuickJS [zinc-vm.md:228-241, prototype-derived] | 4-10x numeric, 1.5-3x object code with known shapes [I] |

**Hard ceiling of any bytecode-level speedup that keeps QuickJS's object model:** refcounting and 16-byte values remain. Even quickjs-jit, with inline refcounts and Cranelift, describes itself as slower than Bun on all 35 scenarios [W]. Do not promise V8-class results.

### 3.3 What "no compromise" must mean here

Concrete acceptance rules; each is testable:

1. **Semantics.** Every ES behaviour QuickJS-ng 0.17 produces (including error messages, `Error.stack` line numbers, property enumeration order, getters/setters, Proxy, generators, async, TDZ, `eval`, `with`) is unchanged. Gate: quickjs-ng `tests/` and test262 as run by `SP/quickjs/run-test262.c`, with results equal to the interpreter, plus `tests/engines/run.mjs` byte-exact parity in all four modes.
2. **Bytecode stays authoritative.** Generated code is a specialization of the same handlers keyed by a bytecode hash (as quickjs-aot's `memcmp`, `quickjs.c:38537-38546`). If the hash, engine version or ABI does not match, run the interpreter. No silent divergence.
3. **Deopt/fallback.** For JIT and typed paths: every fast path has a guard and a slow path that is the interpreter handler. Frame state must be exactly reconstructible at every guard, exception and call.
4. **Refcount/GC safety.** At every point where QuickJS can run the cycle collector or call out (any `JS_Call`, allocation, property get on exotic/getter, `JS_FreeValue` with finalizers), the operand stack `sp[]`, `arg_buf` and `var_buf` in the `JSStackFrame` must hold owned values exactly as the interpreter would. AOT via handler pasting gets this for free. A register-allocating JIT must spill before every such point. Reference counts must balance on every exit path, including exceptions.
5. **Exceptions.** Throw goes to the same catch/finally offsets, with `sf->cur_pc = pc` set before anything that can throw (as `OP_get_field` does, `:31615`). Host errors (memory limit, interrupt) produce the same uncatchable behaviour Zinc relies on (`runtime/vm/quickjs.cpp:267`).
6. **Limits.** The interrupt counter and stack-depth checks (`js_poll_interrupts`, `JS_INTERRUPT_COUNTER_INIT 10000`, `:9733, :19534`) must fire on back-edges and calls in compiled code. Zinc's 60 s deadline and `zinc:script` time limits depend on this.
7. **Generators/async** resume into compiled code at any yield/await point (quickjs-aot does it with a per-function `pc_table`, `quickjs.c:59888-59889`).
8. **Reproducible builds.** Output is deterministic and content-addressed; the engine version is part of the fingerprint (`engine.json` already carries a fingerprint, `compiler/src/engines.ts` around `fingerprint: hash(...)`).

---

## 4. Additional measurements I ran

### 4.1 Setup
All on `SP/quickjs-aot/bench/`, M1 Pro, Apple clang 21, `-O2`, load average 5-7 (noisy; I report min of 5-7 runs and only trust differences above about 10%).

### 4.2 Table
See Section 2.1.

### 4.3 What Zinc's emitter costs QuickJS (ng 0.17.0, 10M iterations, `SP/quickjs-aot/bench/fr.js`) [V]

| Loop | ms |
|---|---:|
| `x = x*1.0000001 + 0.5` (plain f64) | 164 |
| `x = Math.fround(x*1.0000001 + 0.5)` (what Zinc emits for f32) | **327** |
| `s += o.a+o.b+o.c+o.d` (4 property reads) | 308 |
| method call `a.f(s)` | 410 |

`Math.fround` is a native C function call through the generic call path, about 16 ns each; it doubles the float loop. `compiler/src/emit-js.ts:40, 185, 202` inserts it after every f32 op. Options that need no engine change: (i) keep f32 math in f64 and `fround` only at stores/escapes when the frontend can prove no observable difference (needs care to keep bit-exact parity with native f32; the parity tests will catch violations), (ii) a QuickJS-specific `OP_fround` opcode (Phase 1 extension: a few lines in ng), (iii) `Float32Array` store/load round trip is worse.

---

## 5. Constraints specific to Zinc targets

- **iOS:** no JIT for third parties (`docs/reports/ios-core-runtime.md:40`). AOT must be *linked at build time* and shipped in the signed app. OTA-updated JS keeps the interpreter. `dlopen` of downloaded code is out.
- **Targets in tree:** macOS, Linux, `rpi1`, `rmpp` (`plugins/script/plugin.json:8-13`). The Pi 3B+ (aarch64) and rMPP (aarch64 Linux) can run arm64 JIT; `rpi1` is ARMv6 32-bit and can only run the interpreter [I]. `musttail`+`preserve_none` need clang >= 19 on x86-64/AArch64 [W: reverberate blog]; on 32-bit ARM or GCC there must be a fallback (quickjs-aot's `#else DIRECT_DISPATCH` branch, `quickjs.c:63-65`).
- **Hardened runtime on macOS:** JIT needs `MAP_JIT` + the JIT entitlement when signed; already handled by Zinc VM Tier 1 (`runtime/vm/jit.h:65-80`, `docs/engines.md` JIT section). Reuse that executable-memory code.
- **Existing Zinc JIT code is not reusable as a QuickJS JIT:** `runtime/vm/jit.h` compiles Zinc's typed 16-byte-instruction bytecode with typed unboxed registers (`jit.h:1-40`, helper `jitHelper<O,T>`); QuickJS bytecode is a stack machine with boxed tagged values. What is reusable: `MAP_JIT` handling, icache flush, the helper-call/status-code protocol ("no C++ exception through JIT frames"), the poll-on-back-edge idea, and test scaffolding.

---

## 6. Roadmap

Effort is engineer-days for one experienced person working in the tree, including tests, not calendar time. Speedups are vs current stock ng 0.17 `-O2` unless stated.

### Phase 0: cheap wins and the measurement harness (4-7 days)

Contents:
1. **Profile a real Zinc UI app under `--engine quickjs`** (hero, notes): cycle count per opcode class, `perf`/Instruments. Decide priorities from data. Add `examples/*`-derived kernels to `tests/engines/run.mjs --bench` (object, closure, string, array). (1-2 d)
2. **Bytecode precompile** in `buildEngine` (`compiler/src/engines.ts:34`): compile the bundle to bytecode at build time (a small host tool linking the vendored amalgam using `JS_WriteObject`; keep the `.mjs` next to it for debug/source maps), and change `loader` (`runtime/vm/quickjs.cpp:226`) to `JS_ReadObject` + `JS_ResolveModule`/`js_module_set_import_meta` handling, falling back to source when the fingerprint (engine version + flags) mismatches. Bytecode is version-specific and unverified, so treat it as trusted build output only, never from `zinc:script` input. (2 d)
3. **Build flags:** `-O3`, LTO, `-fno-semantic-interposition`, and a PGO profile from the bench kernels (`compiler/src/engines.ts:54-55`). (1 d; expect 10-20% [I])
4. **Emitter hygiene** for f32 (`emit-js.ts:40, 185, 202`); measure with the parity matrix. (1-2 d; up to 2x on f32 loops [V])
5. **Optional: port tail-call dispatch to ng** only as the prerequisite for Phase 1 (item is in Phase 1's cost, not here). Do not ship it as a standalone speedup.

Expected: startup improvement proportional to the bundle; steady state +10-25% from PGO/LTO/emitter. Risk: low. Test plan: `node tests/engines/run.mjs` full matrix (all four modes agree byte-exact) and `--bench` before/after; add a test that a stale bytecode fingerprint falls back to source. License: no change (MIT).

### Phase 1: real AOT mode, `zinc build --engine quickjs --aot` (20-30 days)

Goal: the `qjsc -A` mechanism on **quickjs-ng 0.17** (not the Bellard base), iOS-safe (static, no run-time code generation).

Work items:
1. **Port tail-call dispatch to ng's interpreter** (ng has diverged: opcode fusion, different `CASE` macros). This is the prerequisite because `aot-parse.py` extracts `js_OP_*` bodies from the tail-dispatch form. Alternative to avoid diverging from ng: keep the interpreter unchanged and add a *generation-time* extraction (like `aot-parse.py` but from the computed-goto form). More fragile; prefer the tail form on Clang and keep the goto path for GCC/MSVC. (6-9 d)
2. **Port AOT emission** (`aot_compile`, `aot_emit_table`, bytecode `aot_id` serialization, load-time `memcmp` binding) to ng and clean up: drop the stderr prints, add a **hash of (engine version, handler table, bytecode)** so a mismatched interpreter falls back, add `JS_ATOM` remapping check (bytecode atom indices are per-runtime tables; quickjs-aot relies on the deserialized bytecode being the same as compiled-in, which `memcmp` validates only after load). (5-8 d)
3. **Zinc integration:** a `zinc-qjsc` build tool (from the vendored amalgam + a small generator) invoked by `buildEngine` when `--aot` is passed; generated `.c` compiled with clang into the runner via the CMake in `engines.ts:41-70`; `engine.json` fingerprint includes the AOT table hash; `zinc export` ships the binary only. Add `--aot` to `zinc run/build/export/capture`. (4-6 d)
4. **Hardening:** run ng's tests and test262 on the AOT build; async generators, class fields, module top-level await, `eval`/`new Function` (these are not AOT'd and must interpret), stack-overflow and interrupt parity, backtrace line numbers. Compile-time budget: large apps produce multi-MB C (2.3 MB for 1.6k JS lines [V]); add a function-level filter (skip cold startup functions) and a size cap. (5-7 d)

Expected speedup [V/W]: numeric loops **1.5-2.2x** (fib 1.6x, mandelbrot 1.9x vs stock ng [V]; because ng is already faster than the Bellard base on the object case, the port gets about 1.1-1.2x there [V/I]); v8-v7 geomean +25-36% over the interpreter [W]. String/regexp/JSON-bound code about 1.0x [V microbench -6% total]. Binary +~20% [V].

Risks: (a) ng 0.17's handler bodies use more `goto`s and macros than Bellard's; the Python extractor breaks on them. (b) compile time and code size on real apps. (c) `musttail`+`preserve_none` availability (clang >= 19; need CI on Linux/Pi; `rpi1` gets interpreter only). (d) Maintenance: every ng bump regenerates the table (add a CI job that rebuilds and diffs). (e) The `-A` win is per-function; `zinc:script` code loaded at runtime cannot use it, only the build-time-known app.

Test plan: full `tests/engines/run.mjs` with `--engine quickjs --aot` as a fifth mode ("quickjs-aot") so every fixture is byte-compared with native/VM/JIT/QuickJS; the quickjs-ng test suite and test262 under the AOT build (must equal interpreter pass/fail set); `--bench` including new object/closure kernels; a "mismatch falls back" test.

Licensing: quickjs-aot (MIT), quickjs-ng (MIT), Bellard QuickJS (MIT). Generated C inherits the MIT notice of the engine code it embeds; ship the notice as `docs/licenses.md` already does for the engine.

### Phase 1b: interpreter inline caches for get/put field (10-15 days, independent, do in parallel)

- Per-site cache `{shape*, slot index, proto holder?}` in a side table in `JSFunctionBytecode` (operand is a u32 atom, `OP_get_field` at `:31580`), consulted before `find_own_property`. Follow gkurt's self-validating and descriptor-conversion invalidation approach [W]. Must hold a shape reference (or epoch) to avoid ABA on freed/reused shapes; invalidate when a shape is mutated in place (dictionary mode); do not cache exotic or accessor properties.
- Expected 10-25% on property-heavy code [W: +22% Octane geomean, RayTrace +51%]; quantify on Zinc UI kernels.
- Risk: moderate (shape lifetime, `Object.defineProperty`, Proxy, TypedArray receivers). Test: quickjs-ng + test262 + parity matrix + a fuzz test mutating prototypes between calls.
- Note it composes with Phase 1: AOT bodies can constant-fold the cache-slot address.

### Phase 2: baseline JIT with ICs on macOS/Linux/Pi/rMPP (60-100 days, high risk; recommend gating on Phase 0-1 data)

Design options:
- **2A. Copy-and-patch from the tail-dispatch handlers (recommended if a JIT is needed).** Compile each `js_OP_xxx` as a stencil with clang, extract with relocations (Xu and Kjolstad; CPython's `Tools/jit`), emit sequences by memcpy + patch immediates (operands, `pc`, jump targets, cache slots). Same source, so AArch64 and x86-64 come from one handler set, matching the stencil approach already planned for the Zinc VM (`docs/reports/zinc-vm.md:249-282`). Because the interpreter frame is the JIT frame, GC/exception/generator semantics are inherited (like AOT). Add stencils with **ICs and int fast paths** for get/put field, `get_array_el`, `call`, `add/sub/lt` with int32 specialization. Gain over Phase 1 arises only from the specialization, not from JIT itself, since `-A` already removes dispatch. So its real advantage over Phase 1 is **coverage of code unknown at build time** (`zinc:script`, OTA JS).
- **2B. Register-allocating method JIT** (like quickjs-jit's Tier 1 + Cranelift Tier 2) with frame materialization on deopt. Much larger; refcount elision and spill at every safepoint are subtle. Only pursue if 2A + ICs is insufficient. Adopting or forking `longbridge/quickjs-jit` (MIT) is a possibility for reading and borrowing, not for direct adoption (patch-version ABI lock, x86-64 first, macOS aarch64 untested [W]).
- **Reject: bytecode->C->tcc (quickjit)**: x86-64 only [V], LGPL [V], needs a compiler at run time, no arm64.

Work for 2A: stencil generator (15-20 d), arm64 emitter/patcher (10-15 d), x86-64 (10-15 d), executable memory manager reusing `runtime/vm/jit.h:65-80` (3 d), tier-up counters + code cache invalidation on `JS_FreeRuntime` (5 d), ICs (Phase 1b), hardening (15-20 d).

Expected speedup: on top of Phase 1b, another 1.3-2x on numeric loops if int-specialized stencils are added, otherwise about Phase 1 level [I; weval/LuaAOT/`-B` evidence [W] says the dispatch-removal share is about 1.2-2x and the rest needs typing].

Risks: highest of all phases: GC safety at safepoints, generator/async frames, debugger/stack traces, W^X on macOS (`MAP_JIT`, entitlement) and iOS impossibility (interpreter/AOT only there), Linux SELinux/W^X policies on some distros, maintenance against every ng bump. Test: Phase 1 matrix plus a JIT-forced mode (threshold 1) that JITs everything, plus test262 under forced JIT, plus ASan/UBSan (`--debug` path exists in `engines.ts:44`).

Licensing: MIT engine + Zinc code; stencil approach needs clang at build time only. I did not investigate patents on copy-and-patch; CPython (PSF) ships it, and the paper is public, but check before shipping.

### Phase 3: typed specialization using Zinc type info (35-60 days; largest upside on numeric code, works as AOT so it is iOS-safe)

What Zinc knows and QuickJS cannot: `Sema` has `numberKind`, `ZT` types (i32/u32/f32/f64/bool, classes with known layouts) (`compiler/src/sema.ts`, used in `emit-js.ts:9, 99-100, 195-202`), which `emit-js` currently erases. Emit type facts as a **side channel** next to the JS (per function: parameter/local/return kinds, class layouts), and let the AOT generator (Phase 1) consume them:

1. **Numeric locals:** unboxed `int32_t`/`double` C locals for provably-typed slots. Entry guards on argument tags (int32 or number) with jump to the generic AOT'd body on mismatch (deopt = "run the generic version from the function start", legal because the typed version has no side effects before its guards, or from a safepoint map otherwise). `|0` and `fround` emitted by Zinc become native truncate/`(float)` operations.
2. **Known classes:** guard `shape == S` once per function entry or loop preheader, then direct slot loads and stores; deopt if a prototype or shape changes (shape epoch counter).
3. **Refcounts:** keep a plain boxed slot for anything that escapes; unboxed ints/doubles need no refcounting, which is where the largest savings on numeric code come from.
4. **Soundness:** TypeScript types are not sound. Only Zinc's checked subset, where the emitter already inserts runtime coercions (`|0`, `Math.fround`, `$z.idiv`), can be trusted, and every entry guard revalidates at run time. `any`, casts through `unknown` and native ABI boundaries stay generic. This is exactly what "no compromise" requires: the typed body is a *proven* specialization of the emitted JS, not a different language.

Expected speedup [I, anchored on zinc-vm.md:228-241 and PERF.md]: nbody/spectralnorm-class kernels 5-10x over the interpreter (the Zinc VM's est. 8-9x is with typed registers and MIR inlining; a C-compiled typed body with a boxed calling convention should be in the same range), fib/mandelbrot 3-6x; object/string/UI code 1.2-2x. Honest caveat: this converges on the Zinc VM design already in the tree; the incremental value of doing it inside QuickJS is that arbitrary untyped JS and `zinc:script` still run on the same engine and the parity story stays "same JS on QuickJS".

Risks: overflow semantics for i32 (must match `|0`), f32 rounding parity (byte-exact outputs), deopt correctness, effort for class-layout guards. Test: engine parity matrix plus a differential fuzz of typed vs generic on random typed programs.

---

## 7. Recommended order and what not to do

1. **Phase 0 now** (including profiling a real UI app). It gives evidence and low-risk wins.
2. **Phase 1b (ICs) and Phase 1 (AOT) next**, on ng. Prefer ICs first if the profile shows property access dominates UI apps.
3. **Phase 3 typed AOT** only if numeric-heavy Zinc apps must run on QuickJS at speed; otherwise steer such apps to `zinc-vm --jit` or native (they already have those).
4. **Phase 2 JIT last, and only if** OTA/`zinc:script` code performance justifies 60-100 days plus perpetual ng-bump maintenance.
5. **Do not:** adopt tcc/quickjit (x86-64 only, LGPL); adopt Porffor (incomplete semantics); count on tail dispatch alone; promise V8-class performance (refcounting and 16-byte values remain).

## 8. Gaps and unverified items

- I did **not** run quickjs-aot with a Zinc-emitted app or profile a Zinc UI app under QuickJS. All Zinc-app expectations are inference.
- Compile time of `qjsc -A` output was not captured cleanly.
- quickjs-aot's published numbers (Mac M4) and quickjs-jit's numbers are **not reproduced**; only the three kernels above were.
- I did not read Kiesel, Boa, Deegen or Static Hermes source; those rows are from web summaries.
- ng's docs claim polymorphic inline caches; I found none in 0.17.0 or the clone (grep for cache/IC structures, and reading `OP_get_field`). Re-check a newer ng before building ICs, to avoid duplicating upstream work.
- `preserve_none`/`musttail` support on the Pi and rMPP toolchains is inferred from LLVM support for AArch64, not tested there.
- Patent/licensing review for copy-and-patch not done.

## Sources

- quickjs-aot: https://github.com/ivankra/quickjs-aot (README, `qjsc.c`, `quickjs.c`, `aot-parse.py`); tail branch https://github.com/ivankra/quickjs/tree/tail
- quickjit: https://github.com/bnoordhuis/quickjit
- quickjs-ng: https://github.com/quickjs-ng/quickjs ; differences page https://quickjs-ng.github.io/quickjs/diff/
- longbridge/quickjs-jit: https://github.com/longbridge/quickjs-jit (PR #21, PR #30)
- gkurt/quickjs PR #9: https://github.com/gkurt/quickjs/pull/9
- weval: https://github.com/bytecodealliance/weval ; https://cfallin.org/blog/2024/08/28/weval/ ; https://arxiv.org/abs/2411.10559
- LuaAOT: https://www.inf.puc-rio.br/~roberto/docs/paper-aot-preprint.pdf ; https://github.com/hugomg/lua-aot-5.4
- Copy-and-patch: https://fredrikbk.com/publications/copy-and-patch.pdf ; CPython JIT https://tonybaloney.github.io/posts/python-gets-a-jit.html ; PEP 774 https://peps.python.org/pep-0774/
- Tail-call interpreters: https://blog.reverberate.org/2021/04/21/musttail-efficient-interpreters.html ; https://blog.reverberate.org/2025/02/10/tail-call-updates.html
- Deegen: https://arxiv.org/pdf/2411.11469
- Static Hermes / Porffor: https://github.com/facebook/hermes/discussions/1137 ; https://github.com/CanadaHonk/porffor


---

<!-- source: mquickjs.md -->

# mquickjs as a fourth Zinc engine: assessment and design

Date: 2026-09-30. Host: Apple M1 Pro, macOS 24.6, Apple clang. mquickjs checkout: `bellard/mquickjs` HEAD `6d4d7eb` (2026-09-26; 477 commits), cloned to `scratchpad/mquickjs`. Zinc tree was dirty and was not modified.

Legend: **[V]** verified by running or reading code here, **[W]** from web sources, **[I]** inferred.

## 0. Verdict

Feasible, but it is not "QuickJS with a smaller footprint". It is a different language (ES5 plus a few extensions, stricter mode). Zinc's current JS path (`emit-js.ts` output as ES2022 modules, run through `sim/zinc.mjs`) cannot run on it. The work is a downlevel + bundle pipeline, an ES5 rewrite of the sim shim, a Promise/timer polyfill, and a new C adapter that respects a moving GC. Estimated 12-15 days for an MVP that runs the scalar/native fixtures, and 35-50 days for four-mode parity including UI demos. The payoff is real for ESP32-class targets. For Pi 3B+, rM Paper Pro and iOS, QuickJS is the better engine (Section 6).

## 1. mquickjs facts

### 1.1 Language subset

Sources: [README.md](../scratchpad/mquickjs/README.md) lines 67-190, and my probes with `./mqjs` [V].

The README describes ES5 in a mandatory "stricter mode": strict-only, no holes in arrays (`a[10]=x` past the end is a TypeError [V "invalid array subscript"]), only global eval, no value boxing, `for-in` covers own properties only, and Date is only `Date.now()`. Extensions: `for-of` over **arrays only**, typed arrays, `**`, some Math functions, regexp `s`/`y`/`u` flags, `codePointAt`, `replaceAll`, `trimStart`/`trimEnd`, `globalThis`.

Probe results (each one-liner run in `mqjs`). "no" means `SyntaxError` or `ReferenceError`:

| Feature | Result | Evidence |
|---|---|---|
| `let` / `const` | no | SyntaxError [V] |
| Arrow functions | no | SyntaxError [V] |
| `class` (all forms) | no | SyntaxError [V] |
| Template literals | no | SyntaxError [V] |
| Spread / rest / default params | no | SyntaxError [V] |
| Destructuring | no | SyntaxError [V] |
| `?.` and `??` | no | SyntaxError [V] |
| Shorthand and computed object keys | no | SyntaxError [V] |
| Generators, `async`/`await` | no | SyntaxError [V] |
| Promise, Map, Set, Symbol, WeakMap, Reflect | absent | ReferenceError or undefined [V] |
| Proxy | absent | `typeof Proxy` = undefined [V] |
| BigInt literal | no | SyntaxError [V] |
| Module syntax (`import`/`export`) | no [I], not probed | README: no modules; `JS_Eval` takes a global script only |
| Getters/setters in object literals, `Object.defineProperty` accessors | yes | [V] |
| `var`, function closures, `arguments`, labels, `try`/`catch`, `instanceof` | yes | [V] |
| JSON, RegExp, typed arrays (incl. Float32Array), `**`, `toFixed`, `toString(16)` | yes | [V] |
| `setTimeout`, `clearTimeout`, `performance.now`, `print`, `gc`, `load` | yes, in the example stdlib | `mqjs_stdlib.c:320-389` [V] |
| `Date` constructor | yes (`new Date()` works) but `Date.now()` returns a number, and `new Date().getTime` is missing | [V] `not a function` |

Missing standard-library members the emitted code commonly needs (all [V] via `typeof` loop over the example stdlib):
- Array: `includes`, `find`, `findIndex`, `flat`, `flatMap`, `fill`, `at`, `Array.from`, `Array.of`.
- String: `padStart`, `includes`, `startsWith`, `at`, `localeCompare`.
- Object: `entries`, `values`, `assign`, `freeze`, `fromEntries`, `getOwnPropertyNames`.
- Number and Math: `Number.isInteger`, `Math.hypot`.
- Globals: `encodeURIComponent`, `structuredClone`, `TextEncoder`, `queueMicrotask`, `DataView`.
- Present: `slice`, `splice`, `indexOf`, `sort`, `reduce`, `map`, `filter`, `some`, `every`, `push`/`pop`/`shift`/`unshift`, `concat`, `reverse`, `Object.keys/create/defineProperty/getPrototypeOf`, `Math.fround/imul/trunc/sign/log2`.

The stdlib is a compile-time C table (Section 1.3), so Zinc can add native members, or polyfill in JS at the cost of RAM.

Error subclassing is broken for ES5 patterns. Both `Error.call(this,m)` with `E.prototype=Object.create(Error.prototype)`, and just `this.message=m` on such an object, threw `TypeError: not a function` [V]. Zinc's `class ScriptError extends Error` pattern (`plugins/script/index.ts:37`) needs a custom Error construction path [I].

Other behaviors [V]: strings are WTF-8 (`"héllo€".length`=6, `"😀".length`=2, so UTF-16 semantics are preserved). Deep recursion of 20000 frames works. Runaway recursion throws `InternalError` (catchable), not a crash.

### 1.2 Memory model

- No `malloc`. `JS_NewContext(mem_buf, size, &js_stdlib)` (`mquickjs.h:263`) allocates everything inside the given buffer. `JS_FreeContext` only runs finalizers.
- Tracing, compacting GC. **Any allocation can move objects.** C code must not hold `JSValue` across API calls except through `JSGCRef` (`JS_PushGCRef`/`JS_PopGCRef`, LIFO stack, `mquickjs.h:143-152`) or `JS_AddGCRef`/`JS_DeleteGCRef` (context roots, non-LIFO). No `JS_FreeValue`. `DEBUG_GC` forces a move on every allocation (good for testing the adapter).
- Value = one CPU word (32-bit on 32-bit CPUs; on 64-bit, "short floats" with small exponent are inline, others boxed) (`mquickjs.h:44-51`, README 296-330). 31-bit ints. Objects >= 3 words.
- Retaining JS values from native objects: known gap in issue #80. The fix, commit `6d4d7eb`, added `JS_NewObjectClassUser(ctx, class_id, n_values)` plus `JS_SetUserValue`/`JS_GetUserValue`, which are GC-traced slots inside the object [V, `mquickjs.h:216,289`]. This is how a resource wrapper can hold a callback closure without a root cycle.
- Finalizers (`JSCFinalizer(ctx, opaque)`) cannot call into JS (`mquickjs.h:220`).
- `JS_StackCheck`/`JS_PushArg`/`JS_Call(ctx, argc|flags)` is the call sequence (`example.c:250-253`, `mqjs.c:215-221`). Errors longjmp only inside the parser (`mquickjs.c:7655,11762`); C callbacks report failure by returning `JS_EXCEPTION`. C++ exceptions must never unwind through the engine, the same rule Zinc's `quickjs.cpp:200-202` already follows.

Numbers [V, `mqjs --memory-limit`]: hello world runs in a 10 KB buffer; `tests/mandelbrot.js` runs in 64 KB. My alloc-heavy `objs.js` (string growth) used 775 KB of a 1 MB heap at exit.

### 1.3 C API and stdlib generation

- `mquickjs_build.c` is a host tool that compiles a C description (`mqjs_stdlib.c`) into `mqjs_stdlib.h`: `JSSTDLibraryDef` with ROM-able property tables, a C function table, a finalizer table, and the class count. Function identity is a table index (`JS_CFUNCTION_*`), fixed at build time.
- Consequence for Zinc: per-export `JS_NewCFunctionData` (used by `quickjs.cpp:212`) does not exist. The equivalent is `JS_NewCFunctionParams(ctx, JS_CFUNCTION_zn_call, JS_NewInt32(id))` (`example.c:241`), one fixed stdlib entry with the export id as a param, created at runtime [V that the API exists, I for the design]. Therefore the stdlib table is generated once per Zinc runner, not per app.
- Bytecode: `mqjs -o out.bin src.js`, `mqjs -b out.bin`, `-m32` for 32-bit output on a 64-bit host, `--no-column`. `JS_RelocateBytecode`, `JS_LoadBytecode`, `JS_Run` (`mquickjs.h:342-372`). Bytecode is unverified; trusted sources only (README 273-275). Version is checked (`JS_BYTECODE_MAGIC` and a version field), but there is no compatibility promise. Measured [V]: `fib.js` gives 736 B (64-bit) and 452 B (`-m32`).
- Interrupt: `JS_SetInterruptHandler(ctx, fn(ctx, opaque))`, polled every 10000 ops (`mquickjs.c:187,5096`); non-zero raises `InternalError: interrupted`. Regexps are also interruptible [W].
- Memory limit is simply the size of the buffer.
- License: MIT (Fabrice Bellard, Charlie Gordon). Compatible with the vendored QuickJS licensing [V].
- Build: plain `make` (gcc/clang, C99-ish; `-D_GNU_SOURCE`); CMake wrapping is trivial: `mquickjs.c`, `cutils.c`, `dtoa.c`, `libm.c` plus a generated stdlib header. I built it on macOS arm64 without changes [V]; `mqjs` is 271 KB (`-Os -g`, includes readline). Options for ARM32 (`-mthumb`), softfloat, X86_32 and Win32 in the Makefile [V].
- Portability: built for both 32- and 64-bit words (`JSW` 4 or 8). Own libm and soft-float; ROM about 100 KB Thumb-2 per Bellard [W/README].

### 1.4 Performance

Bellard's claim: "speed comparable to QuickJS" (README:9-10); ships `make microbench` and an Octane target with a strict-mode-patched Octane in a tarball (I did not download it). Nobody I found published reliable Octane numbers; one blog post has only placeholders (X/Y/Z) and I discount it [W].

My own micro-measurements, ES5 code so both engines run identical source. Zinc's vendored QuickJS-ng 0.17 built at `-O2` through a 20-line runner; mqjs at `-Os` (default) and `-O2`. Single machine, 2 runs each, wall clock in ms, no statistics: treat as ordering only [V].

| Kernel | QuickJS-ng -O2 | mqjs -Os | mqjs -O2 |
|---|---|---|---|
| fib(32), recursive calls | 282 / 279 | 216 / 217 | 195 / 221 |
| mandelbrot 300x300x100, doubles | 377 / 386 | 426 / 424 | 443 |
| object alloc + string concat + property churn | 50 / 48 | 65 / 63 | 53 |

Reading: mqjs is faster on call-heavy code (~20-25%), slower on float-heavy code (~10-15%, boxed doubles) and allocation-heavy code. This matches "comparable".

Zinc's own baselines (`docs/engines.md:226-243`): QuickJS fib 322-341 ms, mandelbrot 715-745 ms (different, larger kernels, spawn-to-exit). So mquickjs would sit close to the QuickJS column and far from the VM/JIT column.

### 1.5 Ecosystem [W unless noted]

- ESP32: `conoro/mquickjs` (ESP32 fork), `makgordon/esp-mquickjs` (ESP-IDF component, [registry](https://components.espressif.com/components/makgordon/esp-mquickjs/versions/0.1.0-beta/readme?language=en)), `99percentpeople/esp32qjs` (ESP-IDF framework for trusted JS on mquickjs), an [Adafruit write-up](https://blog.adafruit.com/2026/01/05/vibe-coding-an-esp32-version-of-micro-quickjs/) (page returned 403, title only).
- Bindings: [mitchellh/zig-mquickjs](https://github.com/mitchellh/zig-mquickjs) (Zig; pinned to one Zig release; stdlib ROM compile step needed), [mquickjs-kmp](https://github.com/HarlonWang/mquickjs-kmp) (Kotlin), Simon Willison's [Python/Node/Deno/Pyodide/WASM bindings](https://simonwillison.net/2025/Dec/23/microquickjs/) (WASM was harder because of setjmp/longjmp; 303 KB wasm).
- Users: [mattneel/three-native](https://github.com/mattneel/three-native) README states mquickjs as the JS engine ("10KB RAM, 100KB ROM ... JS is not the hot path; GPU calls are. Can swap to V8/JSC later"). A search-engine summary claimed it was on QuickJS-NG; I trust the README fetch, but this is a mild conflict [W].
- Repo state: 6.2k stars, 245 forks, 4 open issues, 15 PRs (fetch of GitHub Issues page). Open issues: no version tags (#18, #69), PIC bytecode (#53), `catch` variable already exists SyntaxError (#40); #80 (retained values) was addressed by `6d4d7eb`. There are no releases or tags, so pin by commit [W].
- Lobsters discussion: the fixed static buffer is seen as a weakness for multi-VM designs; no-hole arrays praised. No independent benchmark data.

## 2. Zinc's current QuickJS integration

Files read: `runtime/vm/quickjs.cpp` (333 lines), `runtime/vm/abi.h`, `runtime/include/zinc_abi.h` (94), `compiler/src/{emit-js,engines,abi}.ts`, `docs/engines.md`, `docs/engine-progress.md`, `tests/engines/run.mjs`, `plugins/script/**`.

### 2.1 Pipeline today

1. `buildEngine` (`engines.ts:14`) calls `emitAbi` (`engines.ts:19`, `abi.ts:25`) to produce `zinc_abi_generated.h` (per-export C adapters over `zinc_abi.h`) plus `core.abi.json`.
2. For `quickjs`: `emitJs(..., abi.imports)` (`engines.ts:33`; `emit-js.ts:13`) uses `program.emit` with a TS transformer (`emit-js.ts:22-363`), then `bundleJs` (`engines.ts:130`) copies the module graph as `.mjs` files with rewritten relative specifiers; no concatenation, the QuickJS module loader (`quickjs.cpp:217-230`) reads them from disk.
3. `run.mjs` for the engine (`emit-js.ts:388-389`) uses **top-level `await runMain(() => import(entry))`** and imports `sim/zinc.mjs` (766 lines across `sim/*.mjs`).
4. CMake is generated in `engines.ts:44-64`; the QuickJS target adds `plugins/script/vendor/quickjs/quickjs-amalgam.c` as a static library (`engines.ts:54-56`). The runner is `runtime/vm/quickjs.cpp` for quickjs, `main.cpp` for the VM (`engines.ts:47`).
5. CLI: `--engine` validated at `cli.ts:62`, help text `cli.ts:991`, engine name in build directory `cli.ts:234`, dispatch at `cli.ts:470-479`, hardcoded host-only rule `engines.ts:16` and `cli.ts:127-128`. Type `Engine` is `engines.ts:12`. Exports: `exportEngine` (`engines.ts:163`), which special-cases `quickjs` at `:171-177`.
6. Tests: `tests/engines/run.mjs:10` builds the engine list (`native`, `zinc-vm`, `zinc-vm-jit` on arm64, `quickjs`); `flags()` at `:11`; ~62 fixture programs are compared byte-for-byte across modes (`:29`), plus graphics capture, dynamic-library loading, invalid resource/unknown-module/timeout checks (`:206-224`).

### 2.2 What the emitted JS uses that mquickjs lacks

The TS program is created with `ts.ScriptTarget.ES2022` (`frontend.ts:60, 86`), so emit-js output is modern JS. Everything in the left column is emitted as-is:

| Emitted construct | mquickjs | Needs |
|---|---|---|
| ES module `import`/`export`, `import()` (`emit-js.ts:144-163`, bundler `engines.ts:143-145`) | no | Bundle to one script; CommonJS-style registry or scope-hoisting |
| top-level `await` in `run.mjs` (`emit-js.ts:388-389`) | no | Emit a different entry: `runMain(function(){ return require(...) })` |
| classes, `extends`, `super`, static fields, accessors | no | Downlevel; **`super.getter` breaks in TS's ES5 output** [V, I got `NaN`], `extends Error` broken |
| arrow, `let`/`const`, template, spread, destructuring, `?.`, `??`, default params | no | Downlevel (TS handles all) |
| generators, `async`/`await`, `for await` | no | TS `__generator`/`__awaiter` helpers plus a Promise polyfill; the `__values` helper needs `Symbol.iterator` [V: "Symbol.iterator is not defined"] |
| `Map`, `Set` (emit-js treats them specially: `Array.from(x.keys())`, `emit-js.ts:187-190`) | no | Polyfill with insertion-ordered arrays plus hashing for arbitrary keys |
| `Promise`, `queueMicrotask` (`quickjs.cpp:291`, `engines.md:38`) | no | Pure-JS Promise polyfill; drain from the C event loop |
| `Symbol` (`sim/zinc.mjs:81,262`: `Symbol.iterator`, `Symbol.dispose`) | no | Shim removal; downlevel iteration helpers replaced with array-only fast paths |
| BigInt in `sim/zinc.mjs:139-169` (fixed-point profiles `fx12/fx16`) | no | Rewrite fx math with double arithmetic or 2x32-bit splits; only matters for fx profiles |
| `Object.assign`, `.includes`, `.padStart`, `Array.from`, `.at`, `.startsWith`, `.flat`, ... | no | Small JS polyfill file, or add to the C stdlib table |
| `new Proxy` (in `tests/engines/run.mjs:96` used only as invalid-resource probe) | n/a | Test needs adjusting |
| Sparse arrays / out-of-range writes | TypeError | Zinc typed arrays already wrap `$z.set`; plain JS inputs may differ; matches native's bounds errors anyway |
| `Math.random`/`Date.now` overrides (`emit-js.ts:179-181`) | `Date.now` only | Provided by runner bootstrap |
| `console.*` (`$z.c_*`) | `print` only | Bootstrap maps console to `print` |

The 32-bit `|0`, `>>>0`, `Math.imul`, `Math.fround` narrowing that `emit-js.ts:32-45` produces is all ES5-safe (`Math.fround` and `imul` are present) [V].

### 2.3 Downlevel options

TypeScript is used as `@typescript/typescript6` 6.0.x by the frontend (`frontend.ts:3`, `package.json:8`); `typescript` 7.0.2 is only a devDependency.

- **Verified:** `ts.transpileModule(src, {target: ES5, module: CommonJS, downlevelIteration: true, ignoreDeprecations: '6.0'})` works in TS 6.0.3 here (scratchpad `bench/es5.cjs`, `bench/s1.js`). TS 6 deprecates `target: ES5` (needs `ignoreDeprecations`), and it is removed in TS 7 [I from the 6.0 deprecation message, not verified against release notes]. That makes ES5 emit a dependency on staying on `@typescript/typescript6`.
- **Recommended:** emit-js stays untouched (still ES2022 output, still the single semantic transformer). A new pass takes each emitted `.js` file and does `ts.transpileModule` to ES5 CommonJS, then wraps each in a module function and concatenates into one `bundle.js`, with a ~30-line `__zn_require` registry and the `zinc:*` builtin modules pre-registered. This adds the pass in `engines.ts` (a `bundleEs5` next to `bundleJs`), about 150 lines.
- **Alternative:** a hand lowering in emit-js. Higher risk. Rejected.
- Verified pitfall (scratchpad `bench/s1.js`): `class B extends A` with `super.y` on a getter gave `NaN` in TS's ES5 output. It needs either a Zinc-specific rewrite or a lint error. `extends Error` needs a helper.
- `sim/zinc.mjs` (~90 lines of helpers such as `idiv/imod/dto/get/set/c_log/dynfn`) must be re-authored as ES5 `sim/zinc.es5.js`, without `Symbol`, `BigInt`, `class` fields, `async` timers, `node:*`. About 1 day for the integer/float profile; more for fx.

## 3. ABI mapping onto the mquickjs C API

`ZincValue`/`ZincExport`/`ZincHost` (`zinc_abi.h`) are engine-neutral. The generated adapters (`abi.ts`) only touch `ZincValue`. So the adapter work is confined to a new runner `runtime/vm/mquickjs.cpp` (about the same 330 lines as `quickjs.cpp`, plus changes); `abi.ts` needs no change [I].

| Concern | QuickJS (`quickjs.cpp`) | mquickjs equivalent |
|---|---|---|
| Per-export function | `JS_NewCFunctionData(nativeCall, id)` `:212` | `JS_NewCFunctionParams(ctx, JS_CFUNCTION_zn_call, JS_NewInt32(id))`; `JSCFunction(ctx, JSValue* this, argc, JSValue* argv)` signature. `argv` is a pointer into the VM stack, which can move, so re-read via `argv[i]` after any allocating call [I] |
| Scalars in/out | `JS_ToInt32/Uint32/Float64`, `JS_NewInt32/Float64` | `JS_ToInt32/Uint32/ToNumber`, `JS_NewInt32/Float64`; **integers are 31-bit inline; larger ints become doubles or heap floats**, which is fine but `JS_NewUint32` may allocate |
| Strings | `JS_ToCStringLen` + `JS_FreeCString` `:164-165` | `JS_ToCStringLen(ctx, &n, val, &buf)` with a stack `JSCStringBuf`; no free; copy immediately into a `std::string` because the pointer dies on the next allocation [I] |
| `NUMBERS` / `BYTES` args | `JS_IsArray`, `JS_GetPropertyUint32` loops `:136-158` | Same loop; `JS_GetPropertyUint32`. Typed arrays exist, so `u8[]` could be zero-copy through a typed array API. I did not find a public accessor for the typed-array data pointer in `mquickjs.h` [I: needs check] |
| `RECORD` / `BYTES` results | `JS_NewObject`, `JS_DefinePropertyValueStr` `:174-190` | `JS_NewObject` + `JS_SetPropertyStr` (no `DefineProperty`; all properties are writable/enumerable/configurable); every allocation can move `obj`, so keep it in a `JSGCRef` [I] |
| Resources (opaque handle) | class + `JS_SetOpaque` + finalizer + weak cache map `resourceObjects` `:32,46-65` | `JS_NewObjectClassUser(ctx, JS_CLASS_ZN_RESOURCE, 0)` + `JS_SetOpaque` + entry in the finalizer table. **No identity cache**: a C++ `map<handle, JSValue>` would hold stale pointers after compaction and a strong `JS_AddGCRef` would leak. Options: JS-side `WeakMap` (absent) or accept that `identity true` in `tests/engines/resources.ts` (`run.mjs:92`) fails until a weak table is built (e.g. keep handle-to-object in a JS array with lazy sweeping) |
| Callbacks retained by native (`ZINC_CALLBACK`) | `JS_DupValue` in `GuestCallback` `:66-69,118` | The closure must live in GC-visible storage. Use a fixed-size JS array in a global (`__zn_cb[id]`) with a C++ free list of ids, or `JS_AddGCRef` with a non-LIFO list (`JS_DeleteGCRef` on release). **Do not use `JS_PushGCRef` (LIFO)**. Reentrancy: callback invoke = `JS_StackCheck`, `JS_PushArg` x N, `JS_Call` (`mqjs.c:215-221`) [V pattern] |
| Callback arg/result conversion | `values.args` vector of `JSValue` `:72-86` | Same but each `JS_New*` can trigger GC; for strings, create last or push each arg immediately with `JS_PushArg` |
| Exceptions | `JS_Throw`, `JS_GetException`, `JS_GetPropertyStr(e,"message")` | `JS_Throw`, `JS_GetException`; helpers `JS_ThrowTypeError`, etc. exist. Stack text: `e.stack` exists in mqjs output [V] |
| Timeout | `JS_SetInterruptHandler(rt, fn, opaque)` `:267` | `JS_SetInterruptHandler(ctx, fn)`, uses `JS_SetContextOpaque` for the deadline. Coarser (10000-op counter), fine [V] |
| Memory limit | `JS_SetMemoryLimit(rt, 512 MiB)` `:266` | Size of the buffer passed to `JS_NewContext` (new flag `ZINC_MQJS_HEAP`, mirror of `ZINC_VM_HEAP_BYTES`) |
| Stack limit | `JS_SetMaxStackSize` | None needed; the VM does not use the C stack [README:19]. Depth limited by heap |
| Promise jobs | `JS_ExecutePendingJob` `:106,300` | Not applicable: no native Promise. The polyfill's microtask queue is a JS array drained by a C call to `__zn_run_jobs()` at the same points (`quickjs.cpp:104-109,300`) |
| Module loader | `JS_SetModuleLoaderFunc` + `JS_NewCModule` `:204-230` | None. Bundle registers `zinc:*` and `zinc:native/*` as pre-populated modules in the JS registry (built at startup from the ABI table via `JS_NewCFunctionParams`) |
| Process env and timers | `service()` magic-indexed C fns `:231-249`, JS bootstrap `:282-293` | Timers as stdlib C functions (`setTimeout` is already there), or host timers reimplemented as in `quickjs.cpp`; bootstrap in ES5 |
| Sandbox (`zinc:script` plugin) | separate integration `plugins/script/native/quickjs.host.cpp` (667 lines) | Unchanged; a future `engine: 'mquickjs'` for `new Script()` is a separate, smaller project, and the natural first use for mquickjs (Section 6) |

Not verified: I did not compile the adapter.

## 4. Design: `--engine mquickjs`

### 4.1 CLI and build

- `compiler/src/cli.ts:62` add `'mquickjs'` to the accepted list; `:991` and `:1061` help; `:113` `--native-library` accepts it; `:470` unchanged (already `!== 'native'`).
- `engines.ts:12`: `type Engine = 'native'|'zinc-vm'|'quickjs'|'mquickjs'`. Build directory falls out of `cli.ts:234` as `mquickjs-<name>-<target>`.
- Vendor mquickjs at `plugins/script/vendor/mquickjs/` (or `runtime/vendor/mquickjs/`): `mquickjs.c`, `mquickjs.h`, `mquickjs_priv.h`, `mquickjs_opcode.h`, `cutils.[ch]`, `dtoa.[ch]`, `libm.[ch]`, `list.h`, `softfp_template*.h`, `mquickjs_build.[ch]`, LICENSE; pin commit `6d4d7eb`. About 600 KB of source.
- Generated stdlib: CMake builds the host tool `mquickjs_build` from `zinc_stdlib.c` (a trimmed copy of `mqjs_stdlib.c` with Zinc additions: `__zn_call` param function, `print`, host timers, performance/Date shims, extra Array/String/Object natives) and emits `zinc_stdlib.h`. Two-stage CMake (`add_executable` host tool, `add_custom_command`). About 1 day of CMake in `engines.ts:44-64`, which currently hardcodes text templates.
- Runner: `runtime/vm/mquickjs.cpp` selected at `engines.ts:47` (`engine === 'mquickjs' ? 'mquickjs.cpp'`); flags `-O2 -fno-strict-aliasing`? (not checked).
- Native link: `add_library(mqjs STATIC ...)` mirroring `engines.ts:54-56`.

### 4.2 Program pipeline

```
sema -> emitJs (unchanged, ES2022 modules, nativeImports map)
     -> bundleEs5: per-module ts.transpileModule(ES5, CommonJS, downlevelIteration, ignoreDeprecations)
                   + registry runtime + sim/zinc.es5.js + polyfills.js (Promise, Map, Set, Array/String/Object gaps)
                   + entry: runMain(function(){ __zn_require(entry) })
     -> bundle.js (one strict ES5 script)
     -> (optional) mqjs-compile: JS_Parse + JS_PrepareBytecode -> app.mqbc  (`-m32` when target word size is 32)
```
Reuse of `emit-js`'s `nativeImports` mapping is intact: the bundler resolves `zinc:native/X` to registry names the runner pre-populates.

Entry differs from `emit-js.ts:388-389` (top-level await); add an `emit-js` option or write the entry in the bundler.

### 4.3 Precompiled bytecode

`mquickjs.cpp` accepts `program.js` or `program.mqbc` (`JS_IsBytecode`, `JS_RelocateBytecode`, `JS_LoadBytecode`, `JS_Run`). The compile step is done with the same runner (`--compile out.mqbc`) so the version matches; store the mquickjs commit and word size in `engine.json` (as `engines.ts:77` does for the core). Bytecode is not verified, so treat it like the VM's `--core` scripts: trusted only, hash-checked; document this next to `docs/engines.md:57-59`.

### 4.4 Flags and limits

- `ZINC_MQJS_HEAP_BYTES` (default 8 MiB desktop; the runner mallocs the buffer once); `--mq-heap=<n>[k|m]` CLI option maps to it.
- `ZINC_EXECUTION_TIMEOUT_MS` reused via `zinc::deadline()` and `JS_SetInterruptHandler`.
- `ZINC_MQJS_STATS=1` prints `JS_DumpMemory` JSON-ish, parallel to `ZINC_VM_STATS`.
- A `--gc-stress` debug flag builds with `-DDEBUG_GC` (README:251), which runs the whole fixture set under move-every-allocation.

### 4.5 Test matrix changes (`tests/engines/run.mjs`)

- `:10` add `mquickjs` to the list; `:11` flags; `command()` `:20-27` already generic via `engine.json` entry.
- Introduce a per-fixture `skip[engine]` allowlist with reasons, so parity gaps are explicit rather than silent.
- `:206-224` (QuickJS-only import probes) need an mquickjs variant; module syntax tests would use ES5 `require`-style snippets or be skipped.
- Add `--gc-stress` runs of the bytes/records/callbacks/resources fixtures.

### 4.6 Parity gaps versus the current four-mode matrix

Predicted, not run.

1. `resources.ts` object identity (`"identity true"`): no WeakMap. Needs a design decision (Section 3).
2. Promise/async ordering fixtures (`async`, `async-control`, `promise-order`, `suspend-order`, `promise-timers`, `promise-chains`, `promise-all`): depends on a polyfill matching native microtask order exactly; tractable, but 7+ fixtures.
3. Generators family (`generator-*`, 7 fixtures): TS `__generator` works without Symbols if `__values` is patched; `for-of` over user iterators is not possible natively, so the ES5 output must use array paths.
4. `classes`, `accessors`, `bind`, `instanceof`, `static-fields`, `generic-inheritance`: `super` accessors and custom Errors need work (Section 2.3).
5. `collections`, `map-undefined`: Map/Set polyfill semantics (ordering under mutation, `undefined` keys, NaN keys).
6. `strings`, `string-*`, `replace-all`, `stdlib-path`, `string-format`: UTF-16 semantics verified [V]; case conversion only ASCII (`toLowerCase/UpperCase`), regexp case folding ASCII only (README:161-168). Unicode fixtures will diverge. Missing `localeCompare`, `padStart`, `includes`.
7. `native-library`, dynamic-lib tests (`run.mjs:71-111`): should pass, engine-neutral.
8. `bytes`, `records`: fine after copy loops; watch for compaction bugs (use `--gc-stress`).
9. `events`, `services`, `graphics`: depend on host loop plus timers (`quickjs.cpp:298-321` logic ported).
10. `Proxy` probe (`run.mjs:96`) and `import()` probes (`:209`): irrelevant/skip.
11. Typed `number` fx profiles (`sim/zinc.mjs:139-169`) use BigInt: rewrite or skip fx profile for mquickjs.
12. Error stacks and messages: text differs (like `docs/plugins/script.md:118-120`).
13. Runtime limits: `heap-limit` style test differs (buffer exhaustion throws `InternalError: out of memory`; message text must be normalised) [I].
14. `zinc:script` inside the app (nested Script instances): not applicable; nested contexts would need a second buffer.
15. Timing kernels: fib/mandelbrot would run (ES5 code path is trivial); the `100000 native calls` and callback kernels exercise the ABI adapter heavily.

## 5. Effort (working days; one developer; assumes the spike works as tested)

| Milestone | Deliverable | Days |
|---|---|---|
| M0 spike | Vendored engine, CMake with generated stdlib, `mquickjs.cpp` runs a hand-written ES5 script with `print` and timeout | 2 |
| M1 bundler | `bundleEs5`, ES5 `sim/zinc.es5.js`, polyfills (Array/String/Object gaps), entry without TLA; scalar + math + string fixtures pass | 6-8 |
| M2 ABI adapter | scalars, strings, bytes, numbers, records, resources, callbacks, exceptions, GC-safe conversions; `native.ts`, `bytes`, `records`, `callbacks`, `resources` fixtures; `DEBUG_GC` run | 5-6 |
| M3 async and event loop | Promise, microtask drain, timers, `queueMicrotask`, rejection tracking, generators/async via TS helpers; Map/Set polyfill | 5-7 |
| M4 matrix parity | fifth mode in `run.mjs`, allowlist, fix fixtures until agreement, `zinc test`/`dev`/`capture`/`export` engine plumbing (`cli.ts:754,798,844`, `engines.ts:163`) | 6-10 |
| M5 graphics/UI demos | Frame loop, `zinc:gfx` adapters, UI library (`lib/std/ui.ts`, `react.ts`, `solid.ts`) compiled to ES5; pixel-compare with native (`engine-forms-pixels`) | 5-8 |
| M6 bytecode and export | `.mqbc` compile/run, `-m32`, engine.json fingerprints, `--mq-heap`, `ZINC_MQJS_STATS` | 3-4 |
| M7 embedded targets | Freestanding runner for ESP32 / rpi1 (needs `zrt` HAL there; I did not inspect target HALs) | 5-8 |
| **MVP (M0-M2)** | native ABI works on ES5 fixtures | **12-15** |
| **Host parity (M0-M6)** | | **32-45** |
| With targets (M7) | | **37-53** |

The largest uncertainty is M5: whether the UI framework code (`lib/std/react.ts`, `solid.ts`, `ui.ts`, `kit/*`) survives ES5 downlevel plus the 31-bit-int/boxed-double performance profile. I did not test it. The `examples/hero` tree, `docs/engines.md:274-276` reports QuickJS building only 16/58 demos even today, so mquickjs would start behind that.

## 6. Where mquickjs helps and hurts, per target

| Target | mquickjs versus QuickJS | Notes |
|---|---|---|
| **ESP32** (~320-520 KB SRAM, often 2-8 MB PSRAM) | **Better; the only viable one** | 10 KB minimum RAM, ~100 KB ROM, bytecode run from flash, no `malloc`, no C-stack recursion, soft-float capable. Full QuickJS (about 210 KB code, malloc heavy, refcount) is a poor fit. Existing ESP-IDF components [W] show it works. The Zinc VM (typed register bytecode, own heap) is the other candidate here. Caveat: ES5 and stricter-mode constraints apply to app code; the Zinc UI framework may not fit in internal RAM. |
| **Raspberry Pi 3B+** (1 GB RAM, Cortex-A53, armv7/aarch64) | Neutral to slightly worse | RAM is not the constraint. mqjs about 20% faster on call-heavy code, about 10% slower on float code in my M1 measurements [V, other arch not measured]. Loses ES modules, async, classes, all natively. Bytecode `-m32` if the userland is 32-bit. The Zinc VM JIT is aarch64-only (`engines.md:41`); QuickJS is the straightforward choice, mquickjs is an option for a low-RAM Pi Zero (`rpi1` target exists in `plugins/script/plugin.json`). |
| **reMarkable Paper Pro** (i.MX 8M Mini class, aarch64, 2 GB) | Worse | Same as Pi; nothing to gain in RAM or speed; UI redraw speed dominated by the framebuffer path. |
| **iOS** | Slightly attractive, otherwise neutral | JIT is forbidden for third-party apps (Zinc VM JIT excluded); both engines are interpreters, and both are allowed by the App Store when scripts ship in the bundle (I did not check policy). mquickjs's benefits: small binary (about 270 KB with readline; less without), deterministic memory buffer, easy relocation of precompiled bytecode. Costs: ES5 authoring for scripts; a 31-bit integer model that boxes larger numbers. |
| **Desktop (macOS/Linux)** | Slightly better startup and RAM, similar speed | Useful as a differential-testing engine: a third semantics reference that stresses GC-moving bugs (`DEBUG_GC`). |

Other observations:
- mquickjs's compacting GC and no-`malloc` model actually gives Zinc a stricter memory budget test than QuickJS: heap-limit fixtures become deterministic.
- Strict-mode restrictions are a subset of JS, which is aligned with Zinc's typed-array semantics (no holes, `pop` on empty gives `undefined` still, needs `?? default` from emit-js:167-172).
- The runtime has a single context per buffer and no threads; the `zinc:script` plugin's "many Script instances with independent limits" is achievable with one buffer each but at a fixed cost per instance.
- Maintenance risk: no releases or tags; single-author; pin by commit. TS ES5 deprecation adds a second pin.

## 7. Recommendation

1. Do M0 (2 days) as a spike, in a branch, to prove the vendoring, generated stdlib and one `JS_NewCFunctionParams`-based native call.
2. Decide the first product use case before investing beyond M2. If it is "run Zinc apps on ESP32-class hardware", M1-M2 plus M7 is the right path and mquickjs is the only candidate besides the Zinc VM. If it is "a fourth desktop engine for parity", the value is mostly differential testing, and the 35+ day parity cost is hard to justify.
3. The `zinc:script` embedding (`ScriptEngine` interface at `plugins/script/index.ts:56`) is a much smaller first integration (an `engine: 'mquickjs'` option: sandboxed ES5, fixed memory budget, interrupt). It also avoids the entire downlevel/bundle problem because scripts are ES5 authored. Estimated 6-8 days [I].
4. Do not attempt `--engine mquickjs` for Pi/rM/iOS UI apps unless memory or binary-size numbers show a need.

## Reproduction

Everything under `scratchpad/`: `mquickjs/` (built, `mqjs` binary), `mq_o2/` (-O2 build), `bench/{fib,mandel,objs}.js`, `bench/qmain.c` (QuickJS-ng runner), `bench/es5.cjs` (TS 6 ES5 transpile), `bench/s1.js` (downlevel test). Commands: `./qjs_ng fib.js` versus `../mquickjs/mqjs fib.js`; `mqjs --memory-limit 10k -e 'print(1)'`; `mqjs -o x.bin x.js; mqjs -m32 -o x32.bin x.js; mqjs -b x.bin`.

## Sources

- https://github.com/bellard/mquickjs (README, `mquickjs.h`, `mquickjs.c`, `example.c`, `mqjs.c`, `mqjs_stdlib.c`, issue #80, commit 6d4d7eb)
- https://simonwillison.net/2025/Dec/23/microquickjs/
- https://lobste.rs/s/60fjs1/mquickjs_micro_quickjs_javascript
- https://github.com/mitchellh/zig-mquickjs
- https://components.espressif.com/components/makgordon/esp-mquickjs/versions/0.1.0-beta/readme?language=en
- https://github.com/conoro/mquickjs, https://github.com/99percentpeople/esp32qjs
- https://blog.adafruit.com/2026/01/05/vibe-coding-an-esp32-version-of-micro-quickjs/ (403 on fetch, title only)
- https://github.com/mattneel/three-native
- https://github.com/HarlonWang/mquickjs-kmp
- https://www.phoronix.com/news/Micro-QuickJS
- https://tisankan.dev/embedded-javascript-engine/ (discounted: placeholder benchmark values)


---

<!-- source: threejs-webgl.md -->

# Running the complete Three.js + WebGL/WebGL2 API on the Zinc toolchain

Research only. Repo /Users/mowmow/Lab/zinc was read, not modified (working tree dirty; I read the working-tree files).
Date 2026-09-30. "V" = verified by reading code/docs or running something. "I" = inferred / recalled, not verified.

## 0. Executive summary

1. **Nothing WebGL-shaped exists in Zinc today (V).** `grep -i webgl` hits only reports/docs. The GL code (`plugins/display-gl`, 1075 lines in 4 files) is an internal 2D compositor in a GLSL ES 1.00 dialect (`zgl.h:2-3`, `display_gl.cpp:43-47`), on **GL 3.2 core (macOS, SDL3, `sdl.cpp:17-20`)** and **GLES 2.0 (Linux/Pi, EGL+GBM+KMS, `kms.cpp:193` `EGL_CONTEXT_CLIENT_VERSION, 2`)**. Three.js >= r163 needs WebGL2 (GLES 3.0), so **neither existing context is enough**.
2. **Zinc has no ArrayBuffer/typed arrays in the language (V, `docs/guide/09-web-apis.md:87`)** and the native ABI only moves *copied, read-only* byte/number snapshots (`docs/engines.md:93-95`, `zinc_abi.h:25-28`). Upstream Three.js is dynamic JS that lives on typed arrays (three r186 src: 84 Float32Array, 47 Uint32Array, 38 Uint16Array, 33 Uint8Array, 33 ArrayBuffer refs, V by grep). So the only credible host for **upstream** Three.js is a real JS engine. That is **QuickJS(-ng)**, already vendored (`plugins/script/vendor/quickjs`, v0.17.0) and already a Zinc engine (`--engine quickjs`, `runtime/vm/quickjs.cpp`).
3. **zinc-vm cannot run upstream Three.js**, honestly: it is a typed-language VM (`docs/engines.md:29-41`), Dyn shapes/ICs are still a plan (`docs/reports/zinc-vm.md:105-121, 421` "V4"), `zinc:script` is "still unavailable" in the VM (`engines.md:39`), and there are no typed arrays. What zinc-vm (and native) *can* do: run a **typed Zinc program that owns a QuickJS instance** (the `zinc:script` plugin pattern, ~1 MB) and/or call a typed WebGL2 API, once the ABI gets shared mutable buffers.
4. **Best architecture (recommendation):** one native "WebGL2 context" library (C++, ~224 methods, ~550 constants, ~25 extensions) on a **GLES3-native backend** (system GLES 3.x on Linux/Pi 4/5, **ANGLE** on macOS), bound *directly* to QuickJS-ng through its C API (zero-copy typed arrays, no Zinc ABI in the hot path), plus a small JS "browser host" bundle (canvas, Image, fetch, events, rAF, TextDecoder, URL/Blob, WebAssembly, Worker). Do **not** copy three-native's design (sokol_gfx + textual GLSL rewriting); it fights the WebGL state machine.
5. **Measured today (V, this machine, M-series Mac; scripts in scratchpad):** with a *mock* GL (no-op Proxy, so JS-side cost only), Three r186 `renderer.render()` for 500 MeshStandardMaterial cubes costs **0.81 ms in node/V8 vs 11.4 ms in QuickJS (14x)**, and 1000 cubes 1.9 vs 25.7 ms. A scene-graph-only benchmark (1000 animated objects, updateMatrixWorld + frustum cull) is **0.19 ms vs 5.7 ms (30x)**. GL calls per frame: ~6 per draw (about 2100 calls for 351 draws). **The JS<->native crossing is not the bottleneck; Three.js's own JS running on an interpreter is.** Expect a budget of a few hundred draw calls at 60 fps on desktop, far fewer on a Pi. A JIT engine (JSC/V8) or Three's own batching (InstancedMesh/BatchedMesh, static matrices) is the lever, not a fancier command buffer.
6. **Effort (one strong dev):** ~25-35 person-weeks to "Three r18x WebGLRenderer runs glTF/PBR/shadows/post-processing at real perf in QuickJS on macOS + Linux/Pi4-5 through native and quickjs engines"; +8-12 weeks for Khronos WebGL2 conformance-grade; +4-6 for a WebGL1/GLES2 (Pi 1-3, Three <= r162) profile. zinc-vm parity for *typed* WebGL use adds ~4-6 (ABI buffers).

## 1. What already exists in the repo (all V unless marked)

### 1.1 GL / canvas / audio surface

| Area | State | Ref |
|---|---|---|
| WebGL / WebGL2 context | none | `grep -ri webgl` = docs only |
| Internal GL | `display-gl` display driver: SDL3+GL 3.2 core on macOS, EGL/GBM/KMS + GLES 2 on rpi1 & linux | `plugins/display-gl/plugin.json`, `src/{display_gl,gl_renderer,kms,sdl}.cpp` |
| GL API used | ~60 calls: glTexImage2D/SubImage2D, glDrawElements/Arrays, VAO, FBO (glFramebufferTexture2D), glReadPixels, glCopyTexSubImage2D, glBlendFuncSeparate, scissor, no instancing/UBO/MRT/3D textures/queries/sync | grep of `gl[A-Z]*` over plugin sources |
| Shader dialect | GLSL ES 1.00 uber shader; `zgl_program` prepends `#version 150` + macros on mac or `#version 100` + precision on GLES | `display_gl.cpp:41-48`, `zgl.h:2-3,15` |
| Context sharing | `zgl_layers(w,h)` hook lets GPU plugins (`zinc:mapping`) draw under the UI in the *same* context; single context, no share-group | `zgl.h:11-12` |
| 2D GPU renderer | replays the retained command list (`CLEAR RECT BORDER SHADOW LINE TEXT IMAGE POLY CLIP UNCLIP`) into a texture; LINE/POLY not done; validated on Pi 3B+ (VC4, GLES 2.0, Mesa 25.0.7) | `docs/reports/gpu-renderer-design.md` (§2, §4, "Phase 1 validation", "Phase 1b") |
| Canvas 2D | `zinc:canvas` = CanvasRenderingContext2D in Zinc over the software rasterizer (typed Zinc API, not a JS global) | `docs/plugins/canvas2d.md` |
| 3D | `zinc:3d` software rasterizer; `three` plugin = *Zinc rewrite of a Three subset* on top (not upstream) | `docs/plugins/three.md:1-5` |
| Audio | none implemented (pinball has recipes only); design report says JUCE-like engine as plugin, miniaudio candidate | creative-runtime report §4 |
| Wasm | `zinc:wasm` = wasm3 interpreter, `WebAssembly` global for Zinc programs | `docs/plugins/wasm.md` |
| Web APIs | `zinc:web` (WinterTC: TextEncoder/Decoder, URL, Blob, Event, AbortController, crypto...) and `fetch` in *typed Zinc* with bytes as `u8[]` | `lib/std/web.ts:1-8`, `docs/guide/09-web-apis.md:87` |
| Existing plan | Creative report already concludes: two profiles (WebGL1/GLES2 for VC4, WebGL2/GLES3 elsewhere), ANGLE candidate on desktop, real Three.js in QuickJS to be tested, keep current `three` plugin as software path, "WebGL2 needs Khronos tests, not a triangle" | `docs/reports/creative-runtime-webgl-audio-2026-09-29.md` §2, §6, §7 (and creative-studio-compatibility-demo report §1) |

Backend summary: the current GL backend is **desktop GL 3.2 core (mac) / GLES 2 (Pi, Linux)**, i.e. one GLES2 and one GL3.2 code path, no GLES3. Pi 4/5 (Mesa V3D, GLES 3.1 conformant, I from Mesa docs/Phoronix) would run GLES3 through the *same* KMS code with `EGL_CONTEXT_CLIENT_VERSION 3`; Pi 1-3 (VC4) are GLES 2.0 only (V for Pi 3B+: `docs/plugins/display-gl.md` capability table; reports also say ANGLE is not a hardware upgrade for VC4).

Measured VC4 facts useful for a WebGL layer (V, `display-gl.md`): 2048 max texture, 16 units, NPOT ok, VAO/uint32 indices via extensions, **no** `GL_OES_standard_derivatives`, **no** `EXT_shader_texture_lod`, MSAA 4x on window configs only; tile-based GPU (mid-frame FBO switches cost a flush); one unexplained VC4 GPU hang on partially changing screens; DRM master needed (console only).

### 1.2 Engines (docs/engines.md, runtime/vm/quickjs.cpp, plugins/script)

- Three modes: native (AOT C++), zinc-vm (typed bytecode, Tier-0 interpreter + AArch64 baseline JIT), quickjs (application runner) — `engines.md:29-41`.
- QuickJS runner: registers modules through the shared C ABI, ES-module loader from the filesystem, bootstrap installs `process`, `performance.now`, `setTimeout/Interval/Immediate`, `queueMicrotask`, `console` only — `quickjs.cpp:143-177`. No window/document/canvas/fetch/Image/TextDecoder/URL/WebAssembly/rAF today.
- Emitted JS target is **ES2022** (`compiler/src/emit-js.ts:367,377`); QuickJS-ng handles it natively, so no ES5 down-levelling.
- Speed (V, `engines.md:226-243`, M1 Pro): fib native 10 ms / VM 130 / VM-JIT 62 / QuickJS 341; mandelbrot 22 / 385 / 85 / 745. 100k scalar native calls: 3.0 / 6.4 / 5.1 / 10.8 ms (spawn-to-exit; so per-call ABI cost is **under ~100 ns** in every mode). These are typed numeric kernels, not UI.
- Native ABI (`zinc_abi.h`): types VOID BOOL I32 U32 F32 F64 STRING RESOURCE CALLBACK BYTES RECORD NUMBERS ARRAY. Bytes/numbers are **borrowed for the call or copied snapshots**; "mutable user specs remain rejected" (`engines.md:93-95`). Callbacks take scalars only (`engines.md:107`). No shared mutable buffers, no async completion.
- `zinc:script` (QuickJS-ng 0.17.0 vendored, ~1 MB overhead, macos/linux/rpi1/rmpp; sim uses node:vm) sandboxes JS with typed `expose()` host fns; values cross as **Dyn copies** (`docs/plugins/script.md`, `plugins/script/native/quickjs.host.cpp`, 667 lines: no quickjs-libc, memory + interrupt limits). Right pattern for *embedding*, wrong for GL (no zero-copy typed arrays, Dyn conversion per call). It has no timers/fetch.
- mquickjs (Bellard's MicroQuickJS) is **not** in the repo (grep). QuickJS-ng is.

### 1.3 Gaps for "complete WebGL + Three.js"

1. GLES3/WebGL2-capable context (ES 3.00 shaders, UBOs, VAOs, instancing, MRT, 3D/array textures, transform feedback, sync, queries, sRGB/half-float/RGB9E5 formats, renderbuffer multisample, blitFramebuffer).
2. WebGL semantics layer (validation, getError, object lifetime, default drawing buffer, context loss, limits, extensions).
3. Shared mutable typed-array bridge (QuickJS: available via its C API; Zinc ABI: missing).
4. Browser host (canvas/DOM stubs, Image decode, fetch, events, rAF, TextDecoder, URL/Blob, Worker, WebAssembly).
5. Compositing a GL surface with the Zinc UI without CPU readback (needs an "external texture" command kind or a shared-context pass in display-gl).
6. Audio (Three's `AudioContext` use is only in `src/audio`, optional).
7. A test suite: Khronos WebGL2 conformance (not runnable without a DOM-ish harness).

## 2. Reference project: mattneel/three-native (read via gh api)

Repo facts (V): MIT, 18 stars, last push 2026-01-21, ~30 commits, Zig 0.15 + **mquickjs** (vendored) + **sokol-zig** (sokol_gfx/app/audio/fetch). Three.js is a git submodule. Sources: [README](https://github.com/mattneel/three-native), [KICKSTART.md](https://github.com/mattneel/three-native/blob/main/KICKSTART.md), [docs/design/src](https://github.com/mattneel/three-native/tree/main/docs/design/src), [src/shim](https://github.com/mattneel/three-native/tree/main/src/shim).

Architecture (V, docs/design/src/{architecture,shim,runtime}.md): Zig host -> one mquickjs runtime/context -> browser shim (WebGL, canvas, rAF, Image, fetch, input events) -> sokol_gfx backend (Metal/D3D11/GL). Single-threaded frame loop (poll events, dispatch, one rAF tick, translate GL to sokol, present). JS wrapper objects hold small numeric handles; host owns fixed-size handle tables (buffers 4096, textures 2048, programs 1024, FBOs 512, ...; shaders 128, max 64 KB source: `webgl_shader.zig`). `fetch` is local-file only, images PNG/JPEG decode.

Shim (V): `webgl.zig` 21 KB, `webgl_program.zig` 86 KB, `webgl_draw.zig` 47 KB, `webgl_texture.zig` 31 KB, `webgl_state.zig` 17 KB, `gl_uniforms.zig` 7 KB, `image_loader.zig` 7 KB, `runtime/js.zig` 179 KB (bindings). WebGL state is **re-assembled into sokol pipelines at draw time**; the GLSL is **rewritten line by line** (`webgl_program.zig:~1380-1470`): drops `#version`/`precision`, replaces `texture2D->texture`, `attribute->in`, `varying->out/in`, `gl_FragColor->fragColor`, prepends `#version 330`, extracts loose uniforms, re-declares them, filters unused ones. sokol needs `SG_MAX_UNIFORMBLOCK_MEMBERS` patched to 64 for Three's shaders (README).

Build (V, `build-three-es5.mjs`): esbuild (es2017 IIFE) -> Babel preset-env targets IE11 -> a hand-written `es5-shim.js` (Symbol stub, Object.assign, getOwnPropertyDescriptor(s)...) -> string patches (e.g. `generateDefines` null guard, no-op `_classCallCheck`, ASCII-escape). mquickjs is ES5-strict: no holes in arrays, arrays-only `for..of`, no boxing, no direct eval, only `Date.now()`, ASCII-only case mapping (README of deps/mquickjs, V); typed arrays and `globalThis` are supported. Three uses WeakMap heavily in `renderers/webgl/*` (V, grep) — mquickjs's README does not list Map/Set/WeakMap (I: so more shims).

Coverage (V/I): `webgl-api-coverage.csv` has 315 rows (unique `gl.*` identifiers found in the Three checkout; methods and constants). Counts: webgl1 methods 31 implemented / 33 partial / 41 missing; webgl2 methods 31 missing (0 implemented); constants ~71 of 121 (webgl1) done/partial, 57 of 58 webgl2 missing. Partial notes are telling: "always NO_ERROR", "LINK_STATUS only", "COMPILE_STATUS only", "returns empty list", "always null", "sampler units tracked only". **The CSV is stale vs the git log** (bindTexture/createTexture marked missing while the commit log says textured cube and fetch() work), so treat it as a lower bound. Roadmap state (V): M0-M1 done, M2 partly, M3 "Three loads" mostly unchecked in the roadmap doc while commits show "M3: input events", "M4: fetch() API", textured-cube and interactive-cube examples exist. No glTF/PBR/shadows evidence. No WebGL2 (`#version 300 es` not handled anywhere in src/shim: grep = 0 hits), so it is effectively a **WebGL1 shim, i.e. Three <= r162** (I: submodule commit not pinned in what I read).

What it proves: a small team can get Three's scene setup and a cube through a hand-written shim in mquickjs in weeks. What it does not: WebGL2, conformance, performance numbers (its perf doc is "napkin math" placeholders: 2-5k GL calls, 200-500 draws/frame budget; no measurements).

Takeaways for Zinc: (a) their surface list (canvas, rAF, performance.now, Image/createImageBitmap, fetch, FileReader, URL.createObjectURL, events, TextDecoder) matches my grep of Three (section 6); (b) the sokol layer is the wrong abstraction for WebGL (PSO-based, forces GLSL rewriting, fixed caps) — GLES3 passthrough is simpler and more faithful; (c) mquickjs+ES5 is a tax we should not pay.

## 3. Other approaches (web; sources inline)

| Approach | What it is | Fit / lesson |
|---|---|---|
| [headless-gl](https://github.com/stackgl/headless-gl) | Node addon, **WebGL 1.0.3** on ANGLE; WebGL2 "experimental"; few extensions (ANGLE_instanced_arrays, OES_texture_float, OES_vertex_array_object, standard_derivatives, WEBGL_draw_buffers, EXT_blend_minmax, anisotropic, shader_texture_lod); no Image/video | Proves ANGLE-as-WebGL-backend works; too old for Three >= r163 |
| node-canvas-webgl | glue of headless-gl + node-canvas (I, not fetched) | Same limits |
| [expo-gl](https://github.com/expo/expo/tree/main/packages/expo-gl) / react-native-webgl | JSI-bound **WebGL2** over GLES on iOS/Android. V: `EXGLNativeContext.h` has a **JS-thread batch queue -> GL-thread** design (`addToNextBatch`, `addBlockingToNextBatch`, `addFutureToNextBatch`, `endNextBatch`, `flush`), `EXWebGLMethods.def` ~138 method entries, `EXTypedArrayApi.cpp`, stb_image decode. Three via expo-three; known friction: asset paths, simulators, version skew | **Closest prior art for our design** (JS-side command batches + futures for objects) |
| [Ejecta](https://github.com/phoboslab/Ejecta) | iOS canvas+WebGL+audio on JavaScriptCore; uses system JSC so slow typed-array access; Three needs the canvas handed in | Old lesson: engine typed-array performance matters |
| [Babylon Native](https://github.com/BabylonJS/BabylonNative) | **Not a WebGL layer**: a native `NativeEngine` implements Babylon's own `Engine` API over **bgfx**; WebGL GLSL is transpiled at runtime; N-API subset to target V8/JSC/Chakra (see [NativeEngine.md](https://github.com/BabylonJS/BabylonNative/blob/master/Documentation/NativeEngine.md)) | Shows the alternative: replace the renderer's device layer instead of WebGL. For Three the equivalent is Three's own WebGPURenderer backend abstraction, not this |
| Deno WebGPU / [docs](https://docs.deno.com/runtime/desktop/webgpu/) | Native WebGPU (wgpu) with headless capture and native window; community demos run Three's WebGPURenderer | Separate contract from WebGL; viable for WebGPURenderer only |
| Dawn / wgpu-native | WebGPU implementations; **do not** implement WebGL (creative report §2 also says wgpu is not a WebGL implementation) | Use only if the goal shifts to WebGPU |
| [ANGLE](https://github.com/google/angle) | GLES 2/3 (3.1/3.2 on some) over Vulkan, **Metal (ES 3.0 complete)**, D3D11, desktop GL; also ships the WebGL-strict shader translator (GLSL out 130-450, HLSL, MSL, SPIR-V). BSD-3 | Best backend for macOS; on Linux/Pi4-5 native GLES3 is simpler. Build is gn/depot_tools, big; ANGLE cannot add GLES3 to VC4 |
| sokol / bgfx | Thin PSO-style cross-API layers | Fight WebGL's immediate state machine; unnecessary if GLES3 is native |
| Three r186 **WebGPURenderer** (+TSL) | Default backend WebGPU, **automatic WebGL2 fallback backend** (`src/renderers/webgl-fallback/` exists in r186, V); TSL compiles to WGSL or GLSL; WebGLRenderer "still maintained, no big new features" ([manual](https://threejs.org/manual/en/webgpurenderer.html), search summaries) | A **complete** WebGL2 also gets us WebGPURenderer-in-fallback-mode. It needs ~15 extra methods (below) |
| Three WebGL1 removal | WebGL1 unsupported since r163 ([docs](https://threejs.org/docs/pages/WebGLRenderer.html), [forum](https://discourse.threejs.org/t/r163-workaround-to-keep-supporting-webgl-1/63547)) | Pi 1-3 (VC4) => Three <= r162 or a Zinc-side renderer |

Shader translation options (`GLSL ES 3.00 -> platform`):
- **Passthrough (recommended)**: WebGL2 GLSL is GLES3 GLSL; on GLES3 drivers and ANGLE no translation by us.
- ANGLE translator standalone: WebGL-spec validation (`SH_WEBGL2_SPEC`), error logs, limits; can also emit GLSL 330/410 for desktop core on macOS if we refuse ANGLE's GL layer.
- glslang (ES 3.00 -> SPIR-V, Vulkan semantics: loose uniforms need UBO/push mapping) + [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross) (SPIR-V -> GLSL/MSL/HLSL): heavy-ish pipeline, needed only for a non-GL backend.
- [naga](https://github.com/gfx-rs/naga) GLSL frontend: faster but subset; discussions mention WebGL2-specific tweaks (I). Rust dependency. Not recommended.

## 4. Size of the WebGL2 surface and what Three actually calls

Full surface (V, computed from `lib.dom.d.ts` TypeScript 6.0.3 in the repo's node_modules): WebGL1 context = **136 unique methods**, WebGL2 adds **88** (=> **224 unique methods**), ~**550 constants** (297 + 256 in the interface bodies), plus ~25-30 extensions and ~35 object types (Buffer, Texture, Program, Shader, Framebuffer, Renderbuffer, VAO, Query, Sampler, Sync, TransformFeedback, UniformLocation, ActiveInfo, ShaderPrecisionFormat, ...).

Three.js r186.1 (`npm i three`, V) `WebGLRenderer` path (`src/renderers/webgl/*.js` + `WebGLRenderer.js`): **142 distinct gl methods**, ~200 distinct constants. Extraction by regex, so a few items are noise (canvas, rAF, drawImage). WebGPURenderer's WebGL2 backend (`webgl-fallback/`) adds: beginQuery, endQuery, createQuery, deleteQuery, getQueryParameter, beginTransformFeedback, endTransformFeedback, createTransformFeedback, bindTransformFeedback, transformFeedbackVaryings, clearBufferfv, clearBufferfi, clientWaitSync, getSupportedExtensions.

### 4.1 Methods Three's WebGLRenderer calls (checklist; V by grep)

```
activeTexture attachShader bindAttribLocation bindBuffer bindBufferBase bindFramebuffer bindRenderbuffer
bindTexture bindVertexArray blendColor blendEquation blendEquationSeparate blendFunc blendFuncSeparate
blitFramebuffer bufferData bufferSubData clear clearBufferiv clearBufferuiv clearColor clearDepth
clearStencil colorMask compileShader compressedTexImage2D compressedTexImage3D compressedTexSubImage2D
compressedTexSubImage3D copyTexSubImage2D copyTexSubImage3D createBuffer createFramebuffer createProgram
createRenderbuffer createShader createTexture createVertexArray cullFace deleteBuffer deleteFramebuffer
deleteProgram deleteRenderbuffer deleteShader deleteSync deleteTexture deleteVertexArray depthFunc depthMask
detachShader disable disableVertexAttribArray drawArrays drawArraysInstanced drawBuffers drawElements
drawElementsInstanced enable enableVertexAttribArray fenceSync finish flush framebufferRenderbuffer
framebufferTexture2D framebufferTextureLayer frontFace generateMipmap getActiveAttrib getActiveUniform
getAttribLocation getBufferSubData getContextAttributes getError getExtension getParameter getProgramInfoLog
getProgramParameter getShaderInfoLog getShaderParameter getShaderPrecisionFormat getShaderSource
getUniformBlockIndex getUniformLocation invalidateFramebuffer lineWidth linkProgram pixelStorei polygonOffset
readBuffer readPixels renderbufferStorage renderbufferStorageMultisample scissor shaderSource stencilFunc
stencilMask stencilOp texElementImage2D texImage2D texImage3D texParameterf texParameteri texStorage2D
texStorage3D texSubImage2D texSubImage3D uniform1f uniform1fv uniform1i uniform1iv uniform1ui uniform1uiv
uniform2f uniform2fv uniform2i uniform2iv uniform2ui uniform2uiv uniform3f uniform3fv uniform3i uniform3iv
uniform3ui uniform3uiv uniform4f uniform4fv uniform4i uniform4iv uniform4ui uniform4uiv uniformBlockBinding
uniformMatrix2fv uniformMatrix3fv uniformMatrix4fv useProgram vertexAttrib1fv vertexAttrib2fv vertexAttrib3fv
vertexAttrib4fv vertexAttribDivisor vertexAttribIPointer vertexAttribPointer viewport
```

Notes: `texElementImage2D` is a new *optional* path (`WebGLTextures.js:1259`, guarded by `'texElementImage2D' in _gl`). `getBufferSubData` (async readback), `fenceSync/deleteSync`, `blitFramebuffer`, `renderbufferStorageMultisample`, `texStorage2D/3D`, `framebufferTextureLayer`, `readBuffer`, `drawBuffers`, `invalidateFramebuffer`, `clearBufferiv/uiv`, `uniformBlockBinding`/`getUniformBlockIndex`/`bindBufferBase` (UBOs), `drawArrays/ElementsInstanced`, `vertexAttribDivisor`, `vertexAttribIPointer` are the WebGL2-only items Three requires; all are plain GLES 3.0.

### 4.2 Extensions Three probes (V)

Requested at init in `WebGLExtensions.js`: EXT_color_buffer_float, WEBGL_clip_cull_distance, OES_texture_float_linear, EXT_color_buffer_half_float, WEBGL_multisampled_render_to_texture, WEBGL_render_shared_exponent. Queried elsewhere: EXT_texture_filter_anisotropic, WEBGL_compressed_texture_{s3tc,s3tc_srgb,etc,astc,pvrtc}, EXT_texture_compression_{bptc,rgtc}, EXT_texture_norm16, KHR_parallel_shader_compile, WEBGL_multi_draw, WEBGL_lose_context, EXT_clip_control, OVR_multiview2 (8 mentions), EXT_disjoint_timer_query(_webgl2), WEBGL_debug_shaders. All optional: returning `null` for unsupported ones is legal and Three degrades. A first milestone set: EXT_color_buffer_float, EXT_color_buffer_half_float, OES_texture_float_linear, EXT_texture_filter_anisotropic, KHR_parallel_shader_compile, WEBGL_lose_context, WEBGL_multi_draw; BC/ETC/ASTC follow GPU support (Apple: BC no, ASTC yes; VC4/V3D: ETC2 yes).

Shader side (V, `renderers/shaders`, `WebGLProgram.js`): Three emits `#version 300 es` and uses gl_FragColor via macro to a `layout(location=0) out`, gl_Position, gl_FragCoord, gl_FragDepth, gl_PointSize, gl_PointCoord, gl_InstanceID, gl_VertexID, gl_DrawID (multi-draw), gl_FrontFacing, ANGLE-specific hints. No compute, no geometry/tessellation: plain GLES 3.0.

### 4.3 Context/host surfaces Three touches (V by grep of src and examples/jsm, files matched)

| API | src | examples/jsm | Note |
|---|---|---|---|
| canvas.getContext('webgl2'), OffscreenCanvas | 8 (OffscreenCanvas) | 4 | Three checks `self`, `HTMLCanvasElement`, `ImageBitmap` |
| document.createElement (canvas/img) | 1 | 67 | |
| createImageBitmap / ImageBitmapLoader | 1 | 2 | glTF textures go this way in browsers |
| fetch | 2 | 9 | FileLoader |
| TextDecoder | 1 | 25 | GLTF/OBJ/etc |
| URL.createObjectURL | 1 | 14 | GLTFLoader for embedded images |
| getContext('2d') | 2 | 25 | CanvasTexture, font/text, PMREM helpers |
| new Worker / Blob workers | 0 | 17 | DRACOLoader, KTX2Loader, Basis |
| WebAssembly | 0 | 14 | draco, basis_transcoder, meshopt, zstddec, mikktspace |
| pointer events / setPointerCapture | 0 | 20 | OrbitControls and friends |
| AudioContext / AudioListener | 7 | 0 | `src/audio`, optional |
| WeakMap, Float16Array, DataView | many | | need engine support (QuickJS-ng ok) |

Bundle (V, esbuild 0.2x, minified, target es2020): full `import * as THREE` **743 KB (190 KB gzip)**; tree-shaken small scene (WebGLRenderer, Scene, Mesh, BoxGeometry, MeshStandardMaterial, DirectionalLight, PerspectiveCamera) **521 KB**. esbuild cannot target ES5 at all (errors on let/const), Babel would be needed as in three-native.

## 5. Design

### 5.1 Layering

```
 App (upstream Three.js r18x ESM, user JS, or typed Zinc)
 -------------------------------------------------------------------------
 L4 Zinc integration      zinc:webgl plugin (typed API for Zinc programs), quickjs/native/vm registration,
                          zinc.json "renderer/webgl": "webgl2" | "webgl1" | "off", capability check at startup
 L3 Browser host (JS)     window/document/canvas/Image/createImageBitmap/OffscreenCanvas/fetch/URL/Blob/
                          TextDecoder/rAF/perf/events/Worker/WebAssembly; small (~2-3k lines JS) + native helpers
 L2 Engine glue           QuickJS-ng C-API binding generated from one IDL table (like compiler/src/abi.ts does
                          for Zinc specs); zero-copy typed arrays; object handles = small ints in JS wrappers
 L1 WebGL2 core (C++)     ~224 methods, object tables + generations, state mirror, validation, getError queue,
                          limits/caps clamps, extension table, drawing buffer + context loss; engine-agnostic
 L0 GLES3 backend         Linux/Pi4-5: system GLES 3.x over EGL/GBM (kms.cpp, ctx version 3);
                          macOS: ANGLE (Metal) via EGL; optional Windows: ANGLE(D3D11);
                          Pi 1-3: GLES2 => WebGL1 profile only (Three <= r162)
 Present                  display-gl extended: WebGL canvas = FBO texture composited in the present pass
                          (existing key-colour/texture pass, display_gl.cpp) or an EXTERNAL_TEXTURE cmd kind
```

Why passthrough on GLES3: WebGL2 ~ GLES 3.0 with extra rules. The L1 layer only *validates and forwards*; no PSO reconstruction, no GLSL rewriting, uniforms/UBOs/samplers map 1:1. WebGL semantics that need real code: (a) default framebuffer emulation (render to an RGBA8 + depth/stencil FBO, MSAA renderbuffer when `antialias`, resolve at composite; `preserveDrawingBuffer`/`premultipliedAlpha`), (b) strict GLSL validation (ANGLE translator in WebGL spec mode; browsers do this), (c) error semantics (INVALID_ENUM/VALUE/OPERATION, no undefined behaviour reaching the driver, e.g. buffer bounds on draw), (d) uninitialised resource zeroing, (e) context loss/restore, (f) limits (clamp MAX_* to spec-friendly values), (g) readPixels/format rules, (h) `getUniformLocation` array names, `getActiveUniform` info, (i) sRGB/colorspace unpack flags, (j) `UNPACK_FLIP_Y_WEBGL`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, `UNPACK_COLORSPACE_CONVERSION_WEBGL` done on the CPU for image sources.

Context sharing with existing display-gl: use a **separate EGL/GL share-group context** for WebGL rather than the single `display-gl` context, else the 2D uber renderer and WebGL trample each other's state (gl_renderer.cpp assumes ownership). On tile-based VC4/V3D, extra FBO passes cost (design report §11). Compositing: the WebGL drawing buffer texture goes to the present pass (already a texture pass with key colour and `zgl_layers` underneath, `display_gl.cpp`), or a new GPU-texture command kind inside the retained frame list (the report's `IMAGE` kind with `dyn` images and a version counter is the seam; `gpu-renderer-design.md` §2). CPU renderer / sim: show a placeholder or a readback (explicit cost).

### 5.2 Which engine hosts the JS

| Engine | Verdict | Reasoning |
|---|---|---|
| **QuickJS-ng 0.17 (vendored)** | **Primary.** | Full ES2023, typed arrays/WeakMap/Map/Float16Array, ESM, bytecode (qjsc) precompile, C API with ArrayBuffer pointers (zero-copy), already builds for macos/linux/rpi1(armv6 NaN-boxed)/rmpp, already an engine mode. Interpreter only: **~14-30x slower than V8 on Three's own code (measured above)**. |
| mquickjs | **No** for Three. | ES5 strict subset, no Symbol/Map/Set/WeakMap (I), arrays only for-of, moving GC makes retained JSValue bindings awkward (README: "address of objects can move"), forces Babel+shims as three-native shows. Its 10 KB RAM story is irrelevant when a GPU and 4 MB+ heap are required. |
| zinc-vm / JIT | **Not for upstream Three.** | Typed; no ArrayBuffer/typed arrays; Dyn/IC is planned V4 (`zinc-vm.md:421`); `zinc:script` unavailable in VM (`engines.md:39`); JIT is AArch64 baseline and still numerical/typed. It can host a *typed Zinc* program that calls WebGL (needs ABI buffers) or embeds QuickJS (needs `zinc:script` to be ported to the VM, listed as remaining work). Compiling Three to typed Zinc is a non-goal: generics unresolved, mixins, `any`-heavy; the existing Zinc `three` rewrite already shows the maintenance cost. |
| Native engine | Zinc app + embedded QuickJS through a `zinc:webgl-host`-style plugin (same as zinc:script's model, ~1 MB) | Native code stays fast for everything except Three's JS. |
| Faster JS (option, I) | JavaScriptCore (system on macOS/iOS; JIT policy applies), V8 (20-30 MB), Hermes (bytecode, no JIT) | Keep L2 engine-agnostic (Babylon Native's N-API-subset approach) only if the QuickJS budget proves insufficient. On Linux aarch64/Pi, QuickJS is the only realistic small option. |

Verified interpreter gap (numbers on this M-series Mac; qjs = Homebrew QuickJS 2026-06-04; Zinc vendors quickjs-ng 0.17.0, expected similar (I)). Scripts: `mock-render-bench.mjs`, `scenegraph-bench.mjs` in the scratchpad dir.

| Test (three r186.1, esbuild bundle) | node (V8) | QuickJS | ratio |
|---|---|---|---|
| updateMatrixWorld + frustum test, 1000 animated Objects | 0.19 ms/frame | 5.67 ms | 30x |
| `WebGLRenderer.render`, 100 lit PBR cubes, mock GL | 0.18 ms | 1.49 ms | 8x |
| 500 cubes (351 draws, 2119 GL calls) | 0.81 ms | 11.4 ms | 14x |
| 1000 cubes (851 draws, 5119 GL calls) | 1.88 ms | 25.7 ms | 14x |

Caveats: GL is a JS Proxy stub (its cost is included on both engines and is probably heavier under qjs, so real binding numbers should be a bit lower); no textures, shadows, real uniform locations, or post-processing; only ~10 uniform uploads per draw here; a single machine; frustum culling dropped ~30% of cubes. Order-of-magnitude only. Extrapolation to a Pi 4 (A72) at ~3-4x slower than M1 (I): ~35-45 ms for 500 cubes => 20-30 fps; Pi 3B+ worse. This is why the perf plan attacks Three's JS (below), not crossing cost.

### 5.3 JS <-> native crossing and command buffer

Facts: ~6 GL calls per draw in Three (enable/disable culling, 2-3 matrix uniforms, drawElements; more with textures, shadows, morphs); 2-5k calls/frame at a few hundred draws. QuickJS C-function call from JS costs on the order of 50-200 ns (I: from `bridge-bench` ~100k calls in 5-11 ms including process time, `engines.md:242`). 5000 calls = 0.25-1 ms. So:

- **Phase 1: direct calls** into L1 on the JS thread; GL executed synchronously. Typed arrays passed by pointer (JS_GetArrayBuffer): zero copy for bufferData/uniform*fv/texImage2D. Simplest, sync semantics (getError, readPixels, getUniformLocation, compile status) trivially correct. Also identical semantics for Zinc typed callers.
- **Phase 2 (only if measured):** a **command stream** for render-thread offload (design report phase 3 wants a render thread anyway, `gpu-renderer-design.md` §6). expo-gl's batch queue is the template (V). JS wrappers own handle ids allocated JS-side (create* returns immediately; no round trip), state mirror JS-side so that redundant calls are dropped (Three's own `WebGLState` already deduplicates); commands encoded into a preallocated Int32Array/Float32Array ring (opcode + args), data uploads copied into a byte arena (bufferSubData/texSubImage are the only bulk copies, memcpy speed); flush at `endFrame`/rAF end and before any *sync-return* call (getError/readPixels/getParameter of dynamic state/getBufferSubData/clientWaitSync/getShaderParameter(COMPILE_STATUS) unless KHR_parallel_shader_compile semantic used, getProgramParameter(LINK_STATUS)). Shader compile/link stays sync unless parallel-compile is exposed (Three probes it).
- Do not do Zinc-ABI marshalling per GL call: ABI has no mutable buffers and scalars-only callbacks; add an ABI type for **borrowed mutable buffer + length** if typed Zinc code (native/vm) must call WebGL, or expose L1 through the plugin's own C++ with typed arrays living in native memory.

### 5.4 ES5 vs ES2020

- QuickJS-ng: ship **ESM/IIFE ES2020-2022**, minified + tree-shaken (521-743 KB, 190 KB gzip), optionally precompiled to bytecode with qjsc (skip parse/compile on start; I: parse of 700 KB is on the order of 100+ ms on a Pi 3, needs measuring). Zinc's own emitter is already ES2022 (`emit-js.ts:367`).
- ES5 (mquickjs-style) requires Babel preset-env + shims + hand patches as `three-native/build-three-es5.mjs` shows, larger/slower output (helpers for classes, spread, generators), no WeakMap/Symbol, engine strictness bugs. Decision: no ES5 target. Keep Three unmodified.
- Keep an option to pre-bundle user code + Three once at build time (`zinc build`) so devices never ship Node/esbuild.

### 5.5 Browser host layer (what to build, ordered by need)

1. Must (M1-M3): `window`/`self`/`globalThis`, `devicePixelRatio`, `innerWidth/Height`, `requestAnimationFrame` bound to the HAL frame callback, `performance.now`, `document.createElement('canvas'|'img')`, `HTMLCanvasElement.getContext('webgl2'|'2d')` (2D via existing `zinc:canvas` or a small native 2D surface with `drawImage/getImageData`, because Three's CanvasTexture/PMREM/font code uses it), `Image` + `createImageBitmap` (decode PNG/JPEG/WebP through a native decoder, stb_image is what expo-gl and sokol use), `fetch` (file/asset root + HTTP(S) via existing `lib/std/fetch.ts` runtime), `TextDecoder/TextEncoder`, `URL/Blob/createObjectURL`, event targets (mouse/pointer/keyboard/wheel/resize from the HAL, pointer capture no-op), `console`, timers (exist).
2. Should (M4): `OffscreenCanvas`, `ImageBitmap` upload path (skip CPU round trip), `WebAssembly` global for QuickJS (`zinc:wasm` wasm3 exists: interpreter, so Draco/Basis/meshopt decode is slow but works; I), `Worker` (a second QuickJS runtime on a thread + structured clone of ArrayBuffers; DRACOLoader/KTX2Loader need it; or run decoders inline by patching the loader to call the wasm on the main runtime), `FileReader`, `AbortController` (`zinc:web` has it typed).
3. Later: `AudioContext` (Zinc audio plugin, Three Audio is optional), `HTMLVideoElement` (`zinc:video` exists), Gamepad, pointer lock, WebXR (out of scope).
Reuse: `lib/std/web.ts` and `fetch.ts` are typed Zinc, not JS globals for QuickJS; the JS-visible versions must be small JS/C++ bindings over the same native helpers (utf8, sockets/HTTP, hashing) rather than a second implementation.

### 5.6 Performance plan (targets are engineering guesses, to be measured)

1. Pin the workload (Three's `webgl_*` examples subset) and profile split: JS scene update / renderer JS / L2 crossing / L1 validation / driver / GPU. Zinc has stage profiling infra to extend (`engines.md` PocketJS lessons 3-4).
2. Cut Three's JS cost: static scenes (`matrixAutoUpdate=false`, `matrixWorldAutoUpdate`), `InstancedMesh`/`BatchedMesh`, merged geometry, fewer materials/programs, frustum culling off for known-visible, reuse render lists, no per-frame allocation (matters for QuickJS RC/GC). This is documentation + presets, not engine work.
3. L1: skip driver calls already in the right state; UBO/uniform caches; lazy validation with hot-path fast checks; precomputed caps.
4. Command stream + render thread (section 5.3 phase 2) only if the crossing shows >15% of frame time; otherwise skip.
5. Startup: bytecode-precompiled bundle, lazy shader compile with a program-binary cache (`glGetProgramBinary` GLES3, not on VC4) and `KHR_parallel_shader_compile`.
6. If QuickJS still misses budgets: swap engine behind L2 (JSC on macOS first), keeping L1 unchanged.
7. Report per-engine in the existing benchmark protocol (raw samples, p50/p99, RSS, bundle size), as `engines.md` already prescribes.

### 5.7 Engine modes: what "runs Three.js" means per mode

| Mode | Upstream Three (JS) | Typed Zinc calling WebGL2 |
|---|---|---|
| `--engine quickjs` | Yes: QuickJS runner registers `webgl` natively (C API) + host bundle; ES module loader loads Three | via emitted JS + same native module |
| native | Yes via embedded QuickJS plugin (`zinc:script`-like, ~1 MB); Zinc app owns window/HAL, feeds rAF | Direct C++ calls (fastest) |
| zinc-vm / JIT | Only by embedding QuickJS (needs `zinc:script` port to VM: listed as remaining work) | Needs ABI type for mutable buffers; then supported |
| sim / esp32 / ps1 / ps2 / wasm | No (no GLES3) | wasm: browser's WebGL2 natively; others: software `zinc:3d` / existing `three` rewrite |

## 6. Coverage checklist (what "complete" decomposes into)

- [ ] Context: getContext attributes (alpha, depth, stencil, antialias, premultipliedAlpha, preserveDrawingBuffer, powerPreference, failIfMajorPerformanceCaveat, desynchronized, xrCompatible), `drawingBuffer{Width,Height,ColorSpace}`, `unpackColorSpace`, `isContextLost`, `WEBGL_lose_context`, `contextlost/contextrestored` events, `getContextAttributes`.
- [ ] State: enable/disable, blend*, depth*, stencil*, cull/front face, scissor, viewport, polygonOffset, colorMask, sampleCoverage, lineWidth, pixelStorei (incl. UNPACK_* extras), hint, clear*, all with `getParameter` for every pname (Three reads ~30 of ~120).
- [ ] Objects: buffer, VAO, texture (2D, cube, 3D, 2D_ARRAY), sampler, framebuffer/renderbuffer (MRT, multisample, blit), program/shader (`getActiveUniform/Attrib`, UBOs, `getUniformBlockIndex`, `transformFeedbackVaryings`), query, sync, transform feedback.
- [ ] Data paths: `bufferData/SubData/getBufferSubData/copyBufferSubData` (ArrayBufferView + offset/length overloads), `texImage2D/3D` (ImageBitmap, HTMLImageElement, HTMLCanvasElement, OffscreenCanvas, VideoFrame, ImageData, ArrayBufferView, PBO offset), `compressedTex*`, `texStorage*`, `readPixels` (+PBO), `uniform*` incl. `*ui`, `uniformMatrix*`, `vertexAttrib*`, `vertexAttribIPointer`.
- [ ] Drawing: `drawArrays/Elements(+Instanced, RangeElements)`, `WEBGL_multi_draw`, `gl_DrawID`, `OVR_multiview2`.
- [ ] Shaders: ES 3.00 and ES 1.00 (WebGL1 profile) pass-through with WebGL-strict validation, `getShaderPrecisionFormat`, `getShaderInfoLog`, `getShaderSource`, `WEBGL_debug_shaders`, `KHR_parallel_shader_compile`.
- [ ] Extensions (mandatory-for-Three first): EXT_color_buffer_float, EXT_color_buffer_half_float, OES_texture_float_linear, EXT_texture_filter_anisotropic, KHR_parallel_shader_compile, WEBGL_multi_draw, WEBGL_lose_context; then compressed textures (s3tc/etc/astc/bptc/rgtc/pvrtc as the GPU supports), EXT_disjoint_timer_query_webgl2, EXT_texture_norm16, WEBGL_clip_cull_distance, EXT_clip_control, WEBGL_render_shared_exponent, WEBGL_multisampled_render_to_texture, OVR_multiview2.
- [ ] Conformance: pin a Khronos [WebGL conformance2](https://github.com/KhronosGroup/WebGL/tree/main/sdk/tests) revision; run in QuickJS with a tiny DOM harness; publish pass/fail/skipped matrix (the creative report requires this, §2, §6.2).
- [ ] Three targets: `webgl_geometries`, `webgl_materials_*` (PBR, transmission), `webgl_shadowmap*`, `webgl_loader_gltf` (+ Draco/KTX2/meshopt), `webgl_postprocessing_*`, `webgl_instancing_*`, `webgl_multiple_render_targets`, `webgl_buffergeometry_*`, `webgpu_*` with WebGL2 fallback (TSL). Compare pixels against a reference browser (`scripts/pixel-diff.mjs` exists, tolerance-based).

## 7. Milestones and effort (one experienced dev; estimates, not measurements)

| # | Milestone | Weeks | Exit criterion |
|---|---|---|---|
| M0 | Spike: QuickJS runner + native GLES3 (ANGLE-Metal on macOS) triangle through hand-written `gl.*`; keep the mock-GL harness in CI | 1-2 | shader, VBO, draw in a window; decide ANGLE vs GL 4.1 on mac |
| M1 | L1 core + L2 binding generator (IDL table -> QuickJS C glue), 60-70 methods, error queue, object tables, default drawing buffer, present via display-gl pass | 4-5 | Three BoxGeometry + MeshBasic + textured cube run |
| M2 | Full method/constant set Three uses (142+15) with validation, UBO/MRT/3D tex/instancing/sync/queries, extension table, ANGLE translator for WebGL validation | 6-8 | Three PBR + shadows + instancing + post-processing examples |
| M3 | Browser host bundle (section 5.5 items 1 and 2), image decode, fetch, events, rAF, 2D canvas | 3-4 | glTF (+textures) + OrbitControls interactive |
| M4 | Linux/Pi 4-5: `kms.cpp` GLES3 context (`EGL_CONTEXT_CLIENT_VERSION 3`), cap detection, hardware run, Pi-specific quirks | 2-3 | Three demo on Pi 4/5 (Pi 3 = WebGL1 profile, next) |
| M5 | Zinc integration: `zinc:webgl` plugin + `zinc.json` option, `--engine` matrix, canvas-in-UI compositing (EXTERNAL_TEXTURE cmd or share-group texture), ABI buffer type, docs | 4-6 | hero-style UI with a live 3D panel, no readback, native + quickjs; VM only for typed API |
| M6 | Performance pass (profiling stages, precompiled bytecode, optional command stream + render thread, Three presets) | 3-4 | published per-engine numbers |
| M7 | Conformance push: Khronos WebGL2 suite subset, Worker, WebAssembly binding, Draco/KTX2/meshopt, WebGPURenderer-on-WebGL2 fallback | 8-12 | matrix published, documented gaps |
| M8 | WebGL1/GLES2 profile for Pi 1-3 (Three <= r162 or Zinc renderer variants), sim/wasm decisions | 4-6 | light-profile demo on Pi 3B+ |

Total M0-M6 ~ 23-32 weeks (the "Three works well on modern targets" number quoted in the summary as 25-35 with slack); M7 to conformance-grade +8-12; M8 optional +4-6. Parallelisable: M3 (host) with M2 (L1); M4 with M3.

## 8. Risks and open questions

1. **Interpreter speed** (measured 14-30x behind V8 on Three's code). Mitigation: Three presets, batching, engine swap seam. Might cap Pi 3 to "small scenes". This is the biggest risk to "real performance".
2. **macOS backend choice**: SDL3 GL 3.2 core (`sdl.cpp:17-20`) cannot run ES 3.00 shaders unmodified; Apple GL tops at 4.1 and is deprecated. ANGLE brings a large build (gn/depot_tools), BSD-3 license and a binary in tens of MB range (I: not measured); alternatives are ANGLE's translator + GL 4.1 (drift risk) or a Metal backend (huge). Decide in M0. SDL3 can load an ES/EGL driver (I: hint-based), to verify.
3. **VC4 (Pi 1-3) = WebGL1 only.** Three >= r163 impossible; light profile needs older Three or Zinc-side renderer (already documented in the creative report). Pi 3B+ also had an unexplained VC4 GPU hang (`gpu-renderer-design.md` phase 1b).
4. **Tile-based GPUs**: Three's frequent FBO switches (shadow maps, post-processing) cost flushes on VC4/V3D; MSAA render-to-texture unavailable on VC4.
5. **Conformance vs "Three works"**: the coverage list Three uses is 142 of 224 methods; the remaining ~80 exist for other libraries. "Complete WebGL2" is a separate, larger goal (M7).
6. **Zinc ABI**: no shared mutable buffers, scalar-only callbacks, no async completion (`engines.md:103-108, 292`). Typed-Zinc users of WebGL depend on that work; upstream-JS users do not.
7. **Threading**: ABI callbacks only on the engine thread (creative report §1); command-stream/render-thread needs care with the single-thread engine assumptions and the existing 3-slot plan.
8. **Security**: WebGL content is web-like untrusted input; `zinc:script` has memory/time limits and no I/O by design, the app runners do not (`engines.md:57-59`). A WebGL host must keep the same trust model (asset root, no arbitrary file reads, buffer-bounds validation before the driver).
9. **Maintenance**: Three r186 is moving (new `texElementImage2D` path, WebGPU-first roadmap; WebGLRenderer "maintained, no big new features"). Pin a version, publish the matrix.
10. **Unverified here**: quickjs-ng vs Homebrew qjs speed parity; Pi timings; ANGLE-on-SDL3 path; expo-gl performance; three-native's actual Three revision and current working state; Mesa V3D GLES level on a real Pi 4/5 in this stack; how many Khronos WebGL2 tests need a browser-only feature.

## 9. Key file references

- Repo: `docs/reports/gpu-renderer-design.md`, `docs/reports/render-perf-options.md`, `docs/plugins/display-gl.md`, `plugins/display-gl/{plugin.json,zgl.h,src/*.cpp}`, `runtime/vm/quickjs.cpp`, `docs/engines.md`, `runtime/include/zinc_abi.h`, `compiler/src/emit-js.ts:367`, `plugins/script/`, `docs/plugins/{script,three,canvas2d,wasm}.md`, `lib/std/{web,fetch}.ts`, `docs/guide/09-web-apis.md`, `docs/reports/creative-runtime-webgl-audio-2026-09-29.md`, `docs/reports/creative-studio-compatibility-demo-2026-09-29.md`.
- Scratchpad (not in repo): `mock-render-bench.mjs`, `scenegraph-bench.mjs` (benchmarks), `thr/` (three@0.186.1 install, `gl-idents.txt`), `tn/` (three-native docs and shim files pulled with gh api).
- External: [three-native](https://github.com/mattneel/three-native), [mquickjs README as vendored](https://github.com/mattneel/three-native/tree/main/deps/mquickjs), [expo-gl common/](https://github.com/expo/expo/tree/main/packages/expo-gl/common), [ANGLE](https://github.com/google/angle), [headless-gl](https://github.com/stackgl/headless-gl), [Babylon Native](https://github.com/BabylonJS/BabylonNative), [Three WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [Three WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer.html), [Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html), [Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html), [WebGL2 spec](https://registry.khronos.org/webgl/specs/latest/2.0/), [Khronos tests](https://github.com/KhronosGroup/WebGL/tree/main/sdk/tests), [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross), [naga](https://github.com/gfx-rs/naga).


---

<!-- source: docker-free-studio.md -->

# Zinc without Docker, a desktop "Studio" and a browser mode: findings and roadmap

Date 2026-09-30. Read-only study of `/Users/mowmow/Lab/zinc` (dirty tree, nothing modified) plus web research.
Legend: **[V]** verified by reading the repo or running something locally, **[W]** from a web source (linked), **[I]** my inference / judgement, unverified.

---------------------------------------------------------------------------------------------------------------------

## 0. Executive summary

1. **Docker is used for every non-host target, and only there.** Host builds (macos, and linux-on-Linux) use the host's `cmake` + `c++` + SDL3. Cross builds spawn `docker run` from `compiler/src/cli.ts` (table `DOCKER`, l.541-557; `dockerBuild` l.563; ESP-IDF l.605-680). Nothing in the compiler *needs* Docker conceptually: Docker is a way to pin a compiler + sysroot and, for rpi1/ps1/esp32, an emulator. [V]
2. **The C++ the compiler emits and the runtime cross-compile cleanly with `zig c++` already installed on this Mac** (zig 0.15.2): `runtime/zrt.cpp` compiled OK for aarch64-linux-gnu.2.36, arm-linux-gnueabihf.2.31, arm-linux-musleabihf, x86_64-windows-gnu, x86_64-linux-musl, aarch64-macos, in about 1 s each; `gfx/raster/ttf/host.cpp` and `hal_posix.cpp` also OK on aarch64 and armhf. [V] Failures: wasm32-wasi (setjmp needs EH, irrelevant, wasm target uses Emscripten) and `hal_posix.cpp` on Windows (`SIGBUS` undeclared: no Windows HAL exists). [V] Not tested: a full link, SDL3, libcurl, FFmpeg, the ESP32, PS1, PS2 targets.
3. **Realistic Docker replacement per target:** linux/rpi(arm64/armhf)/rmpp/Windows/macos hosts: `zig c++` + a downloaded, pinned sysroot for the few plugins needing system libs (SDL3, libcurl, FFmpeg, libgpiod) => Zinc-owned "toolchain manager". ESP32: Espressif's prebuilt `xtensa-esp-elf` / `riscv32-esp-elf` + ESP-IDF itself (git + Python + `idf_tools.py`), no Docker but a ~1.5-2 GB heavy SDK. PS1: PSn00bSDK release zip is already a prebuilt x86_64 Linux GCC (Docker only supplies the OS), so it is a download but **x86_64 Linux hosts only** (Windows/Mac need a VM/emulation or a rebuilt toolchain). PS2: ps2dev toolchain needs building or a Docker/WSL image. Emscripten: emsdk download.
4. **Biggest strategic finding: the "no toolchain" path is half built.** `--engine zinc-vm` + `--core` (`docs/precompiled-core.md`) already compile an app to ZBC4 bytecode in ~100s of ms with no C++ compiler, running on a precompiled core. Generalizing this to *"pre-flashed Zinc VM firmware per board + bytecode upload"* is the Arduino/MicroPython/Espruino-style loop and would remove the heavy SDK from the everyday path on ESP32 and Pi. It costs 3-10x on compute (`docs/reports/zinc-vm.md`), is not yet portable (VM is host macOS/Linux only today, `docs/engines.md`), and needs a "universal core" that the docs explicitly list as *separate, unstarted work*.
5. **Browser mode is feasible in tiers, and the compiler front end is nearly browser-ready** ([I]: 10k LOC TS on the pure-JS `@typescript/typescript6`, `node:fs`/`path` used in a handful of places, a `virtual` file map already exists in `frontend.ts:145`), but the **current sim has no renderer** (`sim/gfx.mjs` is all no-ops), so a preview needs the C++ rasterizer compiled to Wasm (an Emscripten `wasm` target with `targets/wasm/hal_web.cpp` canvas HAL exists).
6. **Shell recommendation:** Tauri 2 (or Electron if the Node engine is kept unbundled) around the *existing Node CLI as engine*, with a Rust/JS "toolchain manager" that downloads pinned, sha256+minisign-verified archives into a content-addressed cache. Ship the same UI as a PWA for browser mode.

---------------------------------------------------------------------------------------------------------------------

## 1. What is in the repo today (verified)

### 1.1 Where Docker is used

| Target | Selector in cli.ts | Image (docker/) | What is inside | Run/test mode | Host prereqs |
|---|---|---|---|---|---|
| macos | none (host) | none | host `cmake`, `c++`, optional `ninja`, SDL3 via pkg-config/CMake (`cli.ts:307-337`, `doctor` l.928-940) | native | Xcode CLT, `brew install sdl3` |
| linux | `DOCKER.linux` (l.543), **skipped when host is Linux** (l.511) | `sdk-linux`: debian trixie-slim, cmake, ninja, g++, libcurl-dev (`docker/sdk-linux/Dockerfile`) | native GCC for Pi 64-bit OS when Docker host is arm64 (`docs/reports/raspberry-pi.md`); x86_64 under emulation on Intel | headless null-HAL in container | Docker |
| rpi1 | `DOCKER.rpi1` (l.545) | `sdk-rpi1`: `--platform linux/arm/v6` alpine 3.20: g++, cmake, curl-dev, libgpiod-dev | native ARMv6 build under **QEMU user mode** via binfmt, `QEMU_CPU=arm1176`; exports statically linked (musl) so it runs on Raspberry Pi OS (cli.ts:565-570) | QEMU | Docker + binfmt |
| rmpp | `DOCKER.rmpp` (l.554) | `sdk-rmpp`: `--platform linux/arm64` debian bookworm: g++ cmake ninja | static aarch64 binary, `-mcpu=cortex-a53 -static` (avoids glibc mismatch 2.35/2.39; no libcurl so no `zinc:net`) | container run headless | Docker |
| ps1 | `DOCKER.ps1` (l.549) | `sdk-psx`: `--platform linux/amd64` ubuntu 26.04 + **PSn00bSDK v0.24 zip** (sha256 pinned) + **PCSX-Redux** dev build AppImage (sha256 pinned, needs glibc 2.43) | `mipsel-none-elf` GCC 12.3 (prebuilt in zip), `mkpsxiso`; PCSX-Redux headless with OpenBIOS | emulator (interpreter, because the dynarec broke under Docker x86 emulation) | Docker (x86_64 emulation on Apple Silicon) |
| ps2 | `DOCKER.ps2` (l.556) | `sdk-ps2`: `ps2dev/ps2dev:latest@sha256:...` (alpine) + cmake | EE GCC 15 `mips64r5900el-ps2-elf`, ps2sdk, gsKit | **build only** (PCSX2 + user BIOS, not redistributable) | Docker |
| esp32 | `espBuild` l.618+, image `IDF_IMAGE` l.605 = `espressif/idf:v6.0@sha256:...` | (upstream image) | ESP-IDF 6.0, Xtensa/RISC-V GCC, `idf.py`, Espressif **QEMU** for `zinc run` | QEMU (esp32/esp32s3) | Docker; **flashing runs on host** via `esptool` because Docker Desktop cannot pass USB (`flash.ts:1-5`) |
| wasm | `wasmBuild` l.699 | none | host `emcc`/`emcmake` (brew `emscripten`, `emEnv()` l.688 hunts for Python and LLVM paths) | `compiler/bin/serve.mjs` | emsdk |
| sim | none | none | Node, JS emit + `sim/*.mjs` | Node | Node >= 23.6 |
| unused | - | `sdk-mips` (mipsel Linux GCC + qemu-user): "now unused" per ADR 0012 | - | - | - |

Other facts:
- `docker/versions.lock` is referenced in `docker/sdk-ps2/Dockerfile` but **does not exist** in the tree listing (`ls docker` shows only the six dirs). [V]
- Docker also runs the *tests* (conformance byte-compare against the sim oracle, `zinc test --target rpi1|ps1|esp32`), so replacing Docker for **builds** does not remove emulators (QEMU user for armv6, PCSX-Redux, Espressif QEMU) from the *test* story. [V/I]
- Plugin system packages (`packages` in plugin.json: apk/apt) are installed by building a derived Docker image per package set (`cli.ts:571-583`). That is the one place where Docker acts as a *package manager*; a Docker-free design needs a sysroot store instead (section 4.2). [V]
- `docs/decisions/0009-cross-targets.md`, `0012-playstation-sdk-emulator.md`, `docs/security/third-party.md` justify digests/sha256 pinning (existing supply-chain posture to reuse). [V]
- Host prereqs today: Node >= 23.6 (type stripping; `compiler/bin/zinc.mjs`), CMake, a C++17 compiler, SDL3, optional Ninja, Docker; esptool + Python for flashing; `emcc` for wasm; FFmpeg for studio previews. `zinc doctor` (cli.ts:928) checks node, cmake, c++, ninja, SDL3, docker only. [V]
- **No Windows target exists**: `HOSTS = ['macos','linux','rpi1','sim','rmpp']` (`native.ts:15`), README mentions "Windows" only as UI windows. A Windows *host* can run the sim (Node) and, via Docker/WSL, cross targets; native Windows apps and a Windows HAL are new work (`hal_posix.cpp:48` needs `SIGBUS`, plus SDL3 HAL is cross-platform so it is likely the small part). [V/I]
- Local machine: `zig 0.15.2` at /opt/homebrew/bin/zig, Docker 29.4 (OrbStack), Node 24.14, Bun present. [V]

### 1.2 Pipeline shape (what a toolchain manager must feed)

`zinc build` = TS front end (`frontend.ts`, TS 6 JS API) -> sema/HIR/MIR -> one of: `emit-cpp.ts` (2088 lines) => `zinc_main.cpp` + generated `CMakeLists.txt` (cli.ts `cmakeLists`, l.~250-340) + runtime sources (`runtime/*.cpp`, `runtime/mod/*.cpp`) + plugin sources; `emit-js.ts` => `run.mjs` for the Node sim; `emit-bc.ts` => `app.zbc` for the VM (`engines.ts`). The build system contract is **CMake + Ninja/Make + a C++17 compiler** for hosted targets, **CMake via emcmake** for wasm, **idf.py** for esp32, and a **CMake toolchain file** for ps1/ps2 (`targets/ps1/ps1.cmake`, `targets/ps2/ps2.cmake`, HALs `targets/*/hal_*.cpp`). So a Docker replacement must supply: compiler(+sysroot) and CMake/Ninja (or replace CMake by direct `zig c++` invocation, section 4.3). [V]

### 1.3 Existing "studio", "sim", web and wasm pieces

- `apps/studio` (docs/studio.md): **ZincStudio, a Choregraphe-style node/box editor**, itself a Zinc app on `zinc:ui` + SDL3 (macOS only, "Requirements: macOS with SDL3 ..., Node.js, FFmpeg; docker for the Pi (QEMU) target"). It generates `main.ts`, runs targets sim / macOS window / remote-display preview (port 7711) / Pi QEMU / ssh device (`zinc deploy --device`). It has a Devices dialog listing apps announcing a remote display and manual ssh devices. It is **not** an IDE/board manager and not cross-platform. **Name collision:** the product proposed here should not be called "ZincStudio" unless the node editor is folded in as one view. [V]
- `zinc:webview` (macOS) hosts a "Tauri-like bridge" (`zinc.invoke(...)`) for the docs page. [V] (`docs/studio.md`, Docs section)
- `site/` = Astro 7 static docs/marketing site (pages: index, features, limitations, performance, showcase, targets, docs). **No playground, no wasm compile UI.** [V]
- `sim/` = 766 lines JS: the Node "oracle" runtime for `--target sim`; `sim/gfx.mjs` is a **headless no-op** (comment line 1: "headless (draw calls are no-ops)"); only text metrics come from baked `resources.json`. Nine sim modules import `node:` (fs, os, net, mqtt, osc, telemetry, sys, storage, assets), `sim/zinc.mjs` uses `process.*` (stdout, exit, `getActiveResourcesInfo`). So the sim is **not** a display preview and not browser-portable as is, but is small. [V]
- `targets/wasm/hal_web.cpp` (133 lines) + `shell.html`: an Emscripten canvas-2D HAL with keyboard/mouse/text/clipboard/RAF; the whole app (zrt + rasterizer + generated C++) compiles to `app.wasm`; `zinc dev --target wasm` reloads by page reload (`docs/dev-mode.md`). This is the existing in-browser *runtime*, but it needs `emcc` at build time (no compiler in the browser). [V]
- `plugins/wasm` = wasm3 0.5.0 interpreter linked into apps (running Wasm *inside* Zinc, opposite direction). [V]
- **VM/engines:** `runtime/vm/main.cpp` (1283 lines; uses `<thread>`, `<fstream>`, `<atomic>`; `[[clang::musttail]]` dispatch with "a bounded loop elsewhere", l.377/843) + `jit.h` (AArch64 macOS/Linux only) + QuickJS runner. "Host targets: Host macOS/Linux" only (`docs/engines.md`). ZBC4 = 16-byte instructions, verifier bounds file sizes/counts and types (`docs/engines.md`, "VM and JIT"). Prototype numbers: 6.6-10.7x faster than QuickJS, 2-5x than Hermes, 2.8-15x slower than native (`docs/reports/zinc-vm.md` summary, measured on the *prototype*, the integrated backend "not described" by those numbers). [V]
- `docs/precompiled-core.md`: `--core <dir>` runs script builds with **no CMake**; "a script must use a subset of its native exports with matching ABI descriptors; graphics config, number profile, baked fonts/images, target, arch, debug must match"; "Core directories currently depend on their recorded source/library paths; this is a local development workflow, not a portable core package. **Universal cores and external asset packs are separate work.**" [V] This sentence is the technical gate for "bytecode upload to a preflashed firmware".
- `docs/reports/ios-core-runtime.md`: the "Zinc Core for iOS" design (AOT core + `.zbc` OTA, Apple 2.5.2/DPLA 3.3.1(B)); the same architecture as what section 6 proposes for ESP32/Pi/browser. [V]
- Flash/monitor today: `compiler/src/flash.ts` (70 lines): host `esptool`/`python3 -m esptool` write `merged-binary.bin` at 0x0, 460800 baud; port discovery by regex on `/dev/cu.usbmodem*|ttyACM*|ttyUSB*` (**Unix only**); monitor is `stty raw` + read (**Unix only**). `zinc deploy` = `export` + generated `deploy.sh` over ssh (`cli.ts:1110-1125`; rmpp default `root@10.11.99.1`). [V]
- Boards: `boards/*.json` presets (waveshare-esp32-s3-matrix, esp32-2432s022, pimoroni-scroll-phat) merged into zinc.json (`docs/boards.md`); 3 boards, no index/registry, no USB VID/PID matching. [V]
- Pi rig (memory note + `docs/reports/raspberry-pi.md`): Pi 3B+ aarch64 trixie; recommended target is **`linux` (arm64, Debian trixie, glibc, dynamic FFmpeg)** not `rpi1`; deploy = `zinc export --target linux` + scp + detached start; must stop lightdm; fbdev display plugin. [V]

---------------------------------------------------------------------------------------------------------------------

## 2. Toolchain research (web)

### 2.1 zig cc / zig c++ as a hermetic cross compiler

- **glibc targeting**: Zig ships tiny text files with glibc symbol versioning (27 KB gz) and can target any listed glibc version per arch (`-target aarch64-linux-gnu.2.36`), generating stub `.so` and letting the target's loader resolve; default for cross was 2.17 in 2020 [W: Kelley, https://andrewkelley.me/post/zig-cc-powerful-drop-in-replacement-gcc-clang.html]. Zig builds musl/glibc-subset/mingw-w64 from bundled source on demand and caches the result [W same]. Overview says headers for 97 libcs in ~50 MiB [W: https://ziglang.org/learn/overview/]. 0.16.0 (2026-04-13, current stable per https://ziglang.org/download/) bundles LLVM 21, musl 1.2.5, glibc 2.43, Linux 6.19 headers, macOS 26.4 headers, and adds maccatalyst targets "free" because the vendored `libSystem.tbd` covers them [W: https://ziglang.org/download/0.16.0/release-notes.html]. Also: libc++ (LLVM 19 headers in 0.15+) is bundled [W: search result on Zig 0.15+; unverified detail]. **Locally installed zig is 0.15.2, one minor behind.** [V]
- **Downloads & verification**: tarballs 41-98 MiB for all hosts (Windows x86_64/aarch64, macOS x86_64/aarch64, many Linux), every download **minisign-signed**, public key published, JSON index for tooling, community mirrors [W: https://ziglang.org/download/]. This makes Zig itself an ideal first pinned package.
- **Windows**: mingw-w64 headers/import-lib generation bundled; MSVC ABI needs a Windows SDK found at build time [W: Kelley; issue #20781 in search]. Recommend `x86_64-windows-gnu`.
- **macOS**: Zig vendors `libSystem.tbd` + headers so pure-libc C/C++ links without an SDK; **frameworks (Cocoa/Metal/CoreFoundation, needed by SDL3-static or any Apple UI) require a real SDK via `-isysroot`/`SDKROOT`** [W: results for issues #10485, wails discussion #4267, macroquad zigbuild-osx article, https://ziglang.org/download/0.16.0/release-notes.html]. Some `zig cc` macOS cross segfault reports exist (https://codeberg.org/ziglang/zig/issues/31189) [W, single search snippet]. **Apple's license**: Xcode and Apple SDKs Agreement says you agree "not to install, use or run the Apple SDKs on any non-Apple-branded computer" [W: https://www.apple.com/legal/sla/docs/xcode.pdf; https://developer.apple.com/forums/thread/114179]. So redistributing/downloading the SDK from Zinc to Linux/Windows hosts to build macOS/iOS apps is **not legally clean**; building macOS apps on a Mac only. Note Zinc's macOS target uses SDL3 (a framework-light build) but `macBundle`, ObjC/Metal HALs and VideoToolbox plugin need the SDK. [I]
- **Zinc-specific verified probe** (this Mac, zig 0.15.2, `zig c++ -std=c++17 -O2 -fno-exceptions -fno-rtti -Iruntime -Iruntime/include -c runtime/zrt.cpp`): all six triples above compile. Not compiled: full app link, SDL3, plugins, ESP32/PS. [V]
- Caveats [I]: `zig c++` uses its own libc++ (LLVM) not libstdc++: ABI-incompatible with prebuilt libstdc++ system libs (FFmpeg C API is fine, C++ system libs are not); mixed with CMake works via `CMAKE_C_COMPILER="zig cc -target ..."` wrappers (cargo-zigbuild, https://crates.io/crates/cargo-zigbuild, is the precedent); `-march=armv6kz+fp -mfloat-abi=hard` for Pi 1 should map to `-target arm-linux-gnueabihf -mcpu=arm1176jzf_s`; must test.
- Licensing: Zig MIT; bundled musl MIT, glibc LGPL (dynamic linking stubs only), mingw-w64 ZPL/public domain, LLVM Apache-2.0 w/ exceptions [I, standard knowledge].

### 2.2 Other prebuilt cross toolchains

| Option | Hosts | Targets | Notes / source |
|---|---|---|---|
| llvm-mingw (mstorsjo) | Linux x86_64/aarch64 (tar.xz), Windows native (zip) | i686, x86_64, armv7, arm64 Windows, libc++ | https://github.com/mstorsjo/llvm-mingw. Alternative to zig for Windows targets; **no macOS host** listed [W] |
| Bootlin toolchains | **Linux x86_64 only** [I from long-standing behaviour; page lists 43 arch variants incl. aarch64, armv6-eabihf, armv7-eabihf; glibc/musl; GCC 16.2, glibc 2.44 bleeding-edge] | Linux userland | https://toolchains.bootlin.com/, https://bootlin.com/blog/bootlin-toolchains-2026-08-released/. Good for reproducible Linux CI, no Mac/Windows host |
| Arm GNU Toolchain | x86_64/aarch64 Linux, macOS, Windows-mingw, per Arm [I] (page moved to https://gitlab.arm.com/tooling/gnu-toolchains-for-arm, could not verify list) | aarch64-none-linux-gnu, arm-none-linux-gnueabihf, arm-none-eabi | Official, GPL with runtime exception; fixed glibc, needs sysroot for third-party libs |
| xPack / crosstool-NG / Buildroot | xPack: all hosts (I); ct-ng/Buildroot: build-from-source on Linux | anything | Heavier; useful for the PS2 (ps2dev is ct-ng-like) where nothing prebuilt exists |
| Espressif crosstool-NG | Linux amd64/arm64/armhf/armel/i686, macOS x86/arm64, Windows x64/arm64 [W tools.json] | xtensa-esp-elf, riscv32-esp-elf; latest release esp-16.1.0_20260609 (GCC 16.1) [W: https://github.com/espressif/crosstool-NG/releases/] | Per-host archives with sha256+size in `tools.json` [W: https://github.com/espressif/esp-idf/blob/master/tools/tools.json] |
| Emscripten emsdk | all hosts | wasm | ships its own LLVM/Node/Python; ~1 GB unpacked [I] |
| Nix / Bazel / Docker | Nix: Linux+macOS; Bazel: `toolchains_llvm`, `hermetic_cc_toolchain` (zig)[I] | anything | The reproducibility gold standard; Nix needs an install and is not Windows-native; Bazel is heavy. Docker gives the same via images. **Not** suitable as a user-facing dependency; useful as an internal CI cross-check [I] |

### 2.3 Espressif toolchain and package managers

- ESP-IDF's `tools.json` describes 15 tools (xtensa-esp-elf, riscv32-esp-elf, esp-clang, openocd-esp32, cmake, ninja, ccache, dfu-util, esp-rom-elfs, qemu, ...), each with per-host `{url, sha256, size}` for linux-amd64/arm64/armhf/armel/i686, macos, macos-arm64, win32/win64/win-arm64 [W: tools.json]. `install.sh`/`idf_tools.py` implements install by that manifest, i.e. **the design Zinc should copy** (and can literally call). But ESP-IDF v6 *itself* (git clone + submodules, Python venv, component manager) is the heavy part; no way to build ESP-IDF projects with GCC alone. Docker today hides ~2+ GB. [I on size]
- Component Manager: `idf_component.yml` dependencies resolved during cmake from components.espressif.com or git (https://docs.espressif.com/projects/idf-component-manager/); Zinc already writes `idf_component.yml` from plugins (`cli.ts:~650`). Needs network at first build. [V/W]
- **Espressif LLVM/Clang fork with Xtensa** (`esp-clang` in tools.json; esp-rs/espup installs an LLVM fork + Xtensa Rust + GCC as linker [W: https://github.com/esp-rs/espup]): Xtensa (ESP32/S2/S3) is **not** in mainline LLVM; RISC-V ESP32-C3/C6/H2/P4 are, so `zig c++` can target RISC-V ESP32 chips only as freestanding, and would still need ESP-IDF's libs/headers. **Zig cannot replace ESP-IDF; even a "zig for RISC-V ESP32" build needs IDF.** [I]
- PlatformIO: Python core with SCons build, unified package manager (`pio pkg`), platforms/frameworks/toolchains are versioned registry packages cached in `~/.platformio`, works on Win/mac/Linux/ARM [W: https://docs.platformio.org/en/latest/core/index.html, limited detail; SCons/`~/.platformio` layout from general knowledge, [I]]. Pattern: platform.json + packages with semver + registry; offline after first install.
- Arduino: `arduino-cli` (Go) + **package_index.json** spec: `platforms[]` with `url, archiveFileName, checksum (SHA-256:...), size, toolsDependencies`, `tools[]` with per-`host` (`aarch64-apple-darwin`, `x86_64-mingw32`, ...) systems [W: https://docs.arduino.cc/arduino-cli/package_index_json-specification]. **Arduino IDE 2** = Electron + Theia front end, `arduino-cli` daemon (gRPC) as backend for compile/upload, AGPLv3 [W: https://github.com/arduino/arduino-ide]. Boards Manager = third-party index URLs, i.e. an open ecosystem for boards.

### 2.4 Pi sysroot options

1. Rsync of `/lib /usr/include /usr/lib` from a real Pi (+ symlink fix): exact, but needs the device [W: search results incl. abhiTronix wiki, deardevices.com, earthly blog].
2. Debian multiarch/`debootstrap --foreign` sysroot per suite (bookworm/trixie) built once **on Linux** (needs root/qemu-user for --second-stage; `mmdebstrap --variant=custom` or a pure `apt-get download` + `dpkg -x` avoids root) and published as a Zinc-owned, sha256-pinned tarball (e.g. `sysroot-debian-trixie-arm64-{sdl3,curl,ffmpeg,gpiod}.tar.zst`, ~50-300 MB) [I]. This is the Docker-free equivalent of `sdk-linux` + the plugin `packages` derived images.
3. Static musl (as done for `rmpp`/`rpi1` exports): no sysroot, works with `zig c++ -target aarch64-linux-musl`; **no dynamic libs** (FFmpeg, libcurl static builds required) [V for rmpp design; I for zig].
4. Raspberry Pi OS sysroot images: use the official image + `losetup`/mount: Linux-only, heavy [I].
- Recommendation: option 3 as default for "simple" apps, option 2 for plugin-heavy ones, glibc floor `2.36` (bookworm) so binaries run on bookworm and trixie and reMarkable 3.20+ (glibc 2.39 there; 3.14-3.18 have 2.35 so static remains right for rmpp). [I]

---------------------------------------------------------------------------------------------------------------------

## 3. Shell, distribution, update, supply chain (web + judgement)

- **Tauri 2**: ~3-10 MB shell vs Electron 85-200 MB [W: rustify.rs / pkgpulse results]; bundles: AppImage/deb/rpm (Linux), DMG (macOS, needs signing + notarization for non-App-Store), MSI/NSIS (Windows) [W: https://v2.tauri.app/distribute/]. **Updater plugin verifies Minisign/Ed25519 signatures** with a configured pubkey [W: https://v2.tauri.app/plugin/updater/]. Sidecars: only self-contained binaries via `bundle.externalBin`, Node must be packaged first [W: https://v2.tauri.app/develop/sidecar/, https://v2.tauri.app/learn/sidecar-nodejs/]. Uses the OS WebView: **WebKitGTK on Linux is the weak spot** (WebSerial/WebUSB not there; irrelevant because the desktop shell uses native serial through Rust) [I].
- **Electron**: bundles Chromium+Node (WebSerial/WebUSB available in renderer; Node native in main). Arduino IDE 2 and Wokwi-free tools chose it; +100-150 MB. Reuses Node CLI *as is* with zero sidecar engineering [I].
- **Neutralino**: tiny, weaker updater/signing ecosystem [I].
- **Engine packaging**: (a) require/ship Node: Node SEA can embed a script and cross-generate for other platforms but binaries are ~100 MB [W: https://nodejs.org/api/single-executable-applications.html, dev.to results]; (b) `bun build --compile` cross-targets linux/macos/windows x64/arm64, ~50-100 MB [W: https://bun.com/docs/bundler/executables]; note the repo runs TS via Node type stripping and needs TS 6 JS API (`@typescript/typescript6`); the pnpm devDependency `typescript@7.0.2` (native Go port) is present too [V package.json] and its JS API story differs (frontend.ts states "a swap to the TS 7.1 API touches this file only", l.1-2). [V]
- **Toolchain download design** (all [I], modelled on cited practice: idf `tools.json`, Arduino package_index, Zig minisign JSON, Cargo/`rustup`):
  - `toolchains.lock` in each project or Zinc release: `{id, version, host, url[], sha256, size, minisign sig, license}`; **content-addressed cache** `~/.zinc/store/sha256-<hash>/` (immutable, hardlink/reflink into versioned symlinks); verify sha256 then unpack (tar.xz/zst/zip) into a temp dir and atomic rename; never execute before verification.
  - Signed *index* (minisign over the manifest, Zinc's key pinned in the app; the Tauri updater key can be reused or a separate one) so a compromised mirror cannot swap URLs; vendor sha256 remains the leaf check.
  - **Offline mode**: `zinc toolchain fetch --all-for <project>` / `--bundle offline.tar` for classrooms; `ZINC_OFFLINE=1` fails with the list of missing hashes; mirror support (`ZINC_TOOLCHAIN_MIRROR`).
  - Mirroring upstream binaries into a Zinc-controlled release bucket avoids link rot (Docker layers currently pin some URLs like the `distrib.app` PCSX-Redux build, `docker/sdk-psx/Dockerfile`), but check redistribution licenses (GPL toolchains: must offer sources).

---------------------------------------------------------------------------------------------------------------------

## 4. Design (i): hermetic toolchain manager replacing Docker

### 4.1 CLI surface

```
zinc toolchain list [--installed]             # from signed index + toolchains.lock
zinc toolchain install <target|tool> [--host <triple>] [--offline-bundle f]
zinc toolchain doctor                          # what is missing, per target, with sizes
zinc toolchain gc | which <tool> | env <target> # print PATH/env for use in a shell
zinc build --target rpi1   # transparently ensures toolchain (prompt with size), then builds
```
Keep Docker as a *fallback backend* (`--toolchain docker`) during migration; add a `Toolchain` interface in `cli.ts` (`prepare(target) -> {cc, cxx, sysroot, cmakeToolchainFile, runWrapper}`) and turn `DOCKER` entries into two implementations. Today `run` output is `['docker', ...args]` (exe as argv, cli.ts:590), which the interface must keep. [I, based on `Built.exe` usage]

### 4.2 Matrix: what replaces Docker, per target x host

Host columns: **mac-arm** (Apple Silicon), **mac-x64**, **lin-x64**, **lin-arm64**, **win-x64**. Cell = replacement; "**H**" = heavy SDK; "**X**" = blocked/needs VM.

| Target | mac-arm / mac-x64 | lin-x64 / lin-arm64 | win-x64 | Toolchain artifacts | Test/emulation replacement |
|---|---|---|---|---|---|
| macos (app) | host clang + SDK (Xcode CLT), `brew sdl3` or vendored SDL3 static | X (Apple SDK license) | X | none for us: user's Xcode CLT | native |
| linux x64/arm64 (Debian glibc) | zig c++ `-target {x86_64,aarch64}-linux-gnu.2.36` + Zinc sysroot tarball (SDL3? libcurl, FFmpeg headers/libs) | zig c++ or host gcc; native build on Linux hosts already works | zig c++ same as mac | zig (45-98 MB) + sysroot 50-300 MB | run on Linux natively; on Mac/Win: no emulator, deploy to device or use `qemu-user` sidecar (see below) |
| rpi1 (ARMv6 hf) | zig c++ `-target arm-linux-gnueabihf.2.31 -mcpu=arm1176jzf_s` (or musl static, matches today's static export) | same | same | zig + sysroot armhf | `qemu-arm` user-mode binary from a pinned download **only on Linux** (macOS/Windows have no qemu-user); use the device instead, or QEMU *system* mode w/ a Raspberry Pi OS image (heavy) |
| rmpp | zig c++ `-target aarch64-linux-musl -mcpu=cortex_a53 -static` (mirrors today's static recipe) | same | same | zig only | on-device (ssh) or Linux qemu-aarch64 |
| esp32 (Xtensa/RISC-V) | **H**: ESP-IDF 6.0 clone + `idf_tools.py install` (Espressif prebuilt gcc/cmake/ninja/openocd/qemu for all hosts) + Python 3.9+ venv | same | ESP-IDF supports Windows (installer, `idf-exe`) | ~1.5-2 GB [I] | Espressif QEMU from tools.json (`qemu-xtensa`, `qemu-riscv32`; hosts per tools.json) |
| ps1 | PSn00bSDK v0.24 zip is x86_64 **Linux** binaries [V from Dockerfile: `PSn00bSDK-0.24-Linux.zip`] => **X** on mac (needs Docker/UTM/Rosetta VM) unless PSn00bSDK ships Windows/macOS builds (Windows zip exists upstream [I], macOS no) | lin-x64: direct download, PCSX-Redux AppImage (glibc 2.43 needed => recent distro or `--appimage-extract` + bundled libs) [V from Dockerfile comment] | PSn00bSDK-0.24-Win32 exists upstream [I, unverified] | psn00bsdk (~200 MB), pcsx-redux | PCSX-Redux (Win/Linux native; macOS build unclear [I]) |
| ps2 | X: ps2dev toolchain has no official prebuilt for mac/win outside its Docker image; ps2dev "ps2toolchain" is built from source (long) or run from `ps2dev/ps2dev` image [V Dockerfile], Windows via WSL/Docker | lin-x64 only, build from source | X (WSL) | 1-2 GB | PCSX2 + user BIOS (cannot be bundled; legal) |
| wasm | emsdk (download, ~1 GB) or **clang wasm32-wasi via zig** (limited: EH/setjmp, no canvas glue, so Emscripten stays) | same | same | emsdk | browser |
| sim | Node | Node | Node | none | n/a |

**What would still need Docker/VM/heavy SDK even after this work** [I, honest list]: (1) ps1/ps2 on macOS/Windows and ps2 anywhere except via prebuilt-source builds; (2) ESP32 (ESP-IDF is a 2 GB SDK, not eliminable, only *managed*); (3) Apple targets from non-Mac hosts (license) and any iOS build (Xcode); (4) QEMU-based *conformance tests* for armv6/ESP32 on Mac/Windows (no qemu-user there); (5) the pcsx-redux headless runner on macOS; (6) exact-glibc reproducibility for release artifacts (keep the Docker/Nix image as the CI oracle that reproduces the zig build).

### 4.3 Removing CMake from the loop (optional)
For non-ESP hosted targets the generated `CMakeLists.txt` is ~90 lines; the compile is a flat list of `.cpp` + link flags. Because zig caches per-object, `zig c++ *.cpp -o app` is enough and removes CMake+Ninja as prerequisites (saves ~100 MB and a Python/CMake install on Windows). Risk: plugins with `pkg_check_modules`, `find_package(SDL3)`. Keep CMake as the compat path, ship a pinned `cmake`+`ninja` (Kitware releases, and both are already in idf tools.json) in the manager. [I]

---------------------------------------------------------------------------------------------------------------------

## 5. Design (ii): "Zinc Studio" desktop app

### 5.1 Reference architectures

| | Arduino IDE 2 | PlatformIO IDE | Thonny | Espruino Web IDE | MakeCode | Wokwi |
|---|---|---|---|---|---|---|
| Shell | Electron + Theia [W] | VS Code extension + Python Core [W] | Tk (Python) [I] | web app / Chrome app [W] | web app (PWA) [W] | web + VS Code ext [W] |
| Backend | arduino-cli daemon gRPC [W] | PlatformIO Core CLI (SCons) [W] | in-proc Python | JS lib EspruinoTools [W] | in-browser compiler [W] | server-side sim/compile [I] |
| Board/toolchain mgmt | Boards Manager index JSON + tool archives [W] | registry packages `pio pkg` [W] | none (MicroPython image flasher) [I] | firmware download | none (cloud/in-browser) | n/a |
| Upload | avrdude/esptool per board recipes | per-platform uploader | REPL/serial file copy | Web Serial/Bluetooth transfer of JS text [W] | WebUSB/hex download [W] | n/a (sim) |
| Install size | ~300+ MB [I] | VS Code + ~100s MB per toolchain | ~30 MB [I] | 0 | 0 | 0 |

### 5.2 Proposal
- **Shell**: Tauri 2 (small, signed updater, native serial via Rust `serialport`, mDNS via `mdns-sd`) hosting the web UI (which is also the browser-mode UI, section 6). Fallback Electron if WebKitGTK/WebView2 quirks bite. Editor: Monaco with the Zinc TS language service (the compiler already exposes `zinc check --json` LSP-style diagnostics, `cli.ts` help text l.~975; TS 6 language service can run in a worker). [I]
- **Engine**: keep the Node CLI as the engine, exposed as a **long-lived daemon over JSON-RPC/stdio** (like arduino-cli's gRPC) so the compiler stays warm (the dev-mode doc notes compile-in-process keeps it warm, `docs/dev-mode.md` Hot reload). Package the engine either as (a) a private Node runtime + the TS sources (~50 MB, simplest, keeps `import.meta` layout for `ZINC_ROOT`), or (b) `bun build --compile`/Node SEA (~50-100 MB but must solve `ZINC_ROOT`-relative reads of `runtime/`, `lib/`, `plugins/`: ship them as a resource dir, `frontend.ts:14`). Recommended: (a) for v1. [I]
- **Panels**: Project & examples browser (from `examples/`, `boards/`); **Board manager** (index JSON of boards + presets + toolchain requirements, Arduino-style, third-party indexes allowed); **Device manager** (USB VID/PID matcher for ESP32 boards - Espressif 0x303A, CP210x 0x10C4:0xEA60, CH340 0x1A86:0x7523/0x55D4; ssh/mDNS `_zinc._tcp` for Pi/rmpp, reuse the existing remote-display announcement in `plugins/display-remote`); **Build/Flash/Monitor** panels (structured JSON progress from the CLI; today it only prints text, `--json` exists for check); **Simulator preview** (native SDL window embedded via remote display port 7711, exactly what `apps/studio` "Preview" does, or the web preview from section 6); **Toolchain panel** (progress, sizes, verify, offline bundle).
- **Flashing/discovery details [I with cited tools]**: ESP32: bundle `esptool` (PyInstaller-frozen or Rust `espflash` 3.x; esp-rs) instead of "pip install esptool" (`flash.ts:31-38` today); native USB-Serial/JTAG boards (0x303A:0x1001) enter download mode by DTR/RTS or 1200-baud touch. Pi Zero/CM (RP1/BCM `rpiboot`), RP2040 `picotool`/UF2 drag-drop, STM `dfu-util` (also in idf tools.json [W]), OpenOCD (esp fork in tools.json [W]). Pi/rmpp: ssh + `rsync`/scp (native `ssh` exists on Win10+/mac/Linux; or a Rust `russh`), start detached and stream logs (pi-test-rig rules: detach, ConnectTimeout, never leave ssh attached). OTA for ESP32: `esp_https_ota` or a Zinc OTA endpoint (only meaningful once Wi-Fi bring-up exists: `cli.ts:~640` says "no esp_wifi station bring-up yet"). [V for the note]
- **Signing/notarization**: macOS Developer ID + notarytool (Tauri docs [W]); Windows Authenticode/EV or Azure Trusted Signing to avoid SmartScreen [I]; Linux AppImage + deb/rpm/flatpak. Auto-update via Tauri updater with minisign key stored in CI secrets/HSM [W].
- **Size budget** [I]: shell 5-15 MB (Tauri) + engine 50 MB + Zig 45-98 MB on first target install + sysroots 50-300 MB + optional ESP-IDF 2 GB + emsdk 1 GB. **Installer < 100 MB, everything else lazily fetched.**

---------------------------------------------------------------------------------------------------------------------

## 6. Design (iii): browser mode

### 6.1 What can run in a browser today (facts)

- **Wasm clang/lld exists**: binji/wasm-clang (clang+lld as wasm/WASI, in-memory FS, demo at binji.github.io/wasm-clang), Wasmer's Clang-in-browser (Wasmer JS SDK 0.8), browsercc, `llvm-wasm` (wasi-sdk 33 / clang 22.1, updated 2026-08-10) [W: https://github.com/binji/wasm-clang, https://wasmer.io/posts/clang-in-browser, https://github.com/LuvHakii/llvm-wasm]. Zig also runs in browsers via zigtools/playground [W: https://github.com/zigtools/playground]. Cost: tens of MB of wasm (clang is ~30-60 MB unpacked [I]), several seconds per TU, C++ compile of a 50k-LOC runtime **on every build is impractical** unless the runtime is precompiled to `.o`/archive and only `zinc_main.cpp` is compiled (then link with wasm-ld, like the hot-reload path where only `zinc_main.cpp` recompiles, `docs/dev-mode.md`). Emscripten's own libc/sysroot (SDL/GL glue) does not run in-browser; a wasi-sdk build would need its own HAL. **Verdict: possible for a research demo, not the product path.** [I]
- **WebContainers**: Node in the browser, but cannot execute native binaries, only WASM/JS; native addons off [W: https://blog.stackblitz.com/posts/bringing-sharp-to-wasm-and-webcontainers/, WebContainers troubleshooting]. No C++ toolchain, so irrelevant for `emit-cpp`, useful only for running the Node CLI unchanged (proprietary licence, COOP/COEP needed) [I].
- **The Zinc compiler in the browser** [grep-verified surface, feasibility inferred]: it uses `@typescript/typescript6` (pure JS TS 6.0.2, works in browsers as the TS Playground shows [I]); Node-only touch points: `frontend.ts` (`node:fs`, `path`, `fileURLToPath`, `ts.createCompilerHost` l.133 and `ts.sys.readFile` l.145/150, `process.cwd()` l.162/182, `ZINC_ROOT` via `import.meta.url`), `plugins.ts` (plugin discovery reads the dir tree), `jsx.ts`, `capabilities.ts`, `emit-js.ts` (writes files + imports `sim/zinc.mjs` by path), `hir/sema/infer/emit-bc` only import `node:path` (pure, polyfillable). `emit-bc.ts` returns bytes (`engines.ts` writes `app.zbc` from `emitBytecode(...)`). Work: implement a virtual `CompilerHost` (a `virtual` map already exists in `frontend.ts:145`), embed `lib/` (1.6 MB) + `lib/std` + plugin `index.ts` as a virtual FS, replace `import.meta.url` root, `esbuild`-bundle with `.ts` extension imports. `emit-cpp` also runs there (pure string generation, only ~3 `node:` imports) so the browser can *show* C++ or send it to a server. **Not run-tested** (I only grepped; the task asked to grep). Bundle size estimate 3-4 MB gz (TS lib + compiler) [I]. Compile speed of TS in browser: seconds for cold start, sub-second incremental [I].
- **Running the emitted JS in the browser**: `emit-js` output targets `sim/zinc.mjs` + node modules. Sim gfx is a no-op, so there is **no pixel preview**; a browser backend needs a canvas renderer or the C++ rasterizer in wasm (below). Non-gfx sim modules (`fs/net/os/...`) are Node-specific but tiny (766 LOC total). [V]
- **zinc-vm in Wasm**: `runtime/vm/main.cpp` is portable-ish C++17 (`std::thread`, `std::fstream`, `[[clang::musttail]]` with a loop fallback); Emscripten supports these (pthreads need COOP/COEP+SAB; can be built single-threaded if timers/fs threads are guarded, [I]); wasm has tail calls (`-mtail-call`) in Chrome/Firefox/Safari, musttail compiles under `-mtail-call` [I: unverified]. Graphics: `gfx.cpp`/`raster.cpp`/`ttf.cpp` + `hal_web.cpp` already exist and compile to canvas via Emscripten in the `wasm` target [V]. The verifier and ZBC4 bundle (bounded, "guest bytes cannot supply code or object pointers", `docs/engines.md`) makes browser-side bytecode loading a good security fit [V]. **This is the natural Tier A**: ship *one* prebuilt "web core" `zinc-vm.wasm` (universal core with rasterizer + all wasm-capable modules, i.e. exactly the "universal core" item the docs mark unstarted) + JS glue; the in-browser compiler emits ZBC4 and hands it to the core. JIT irrelevant. Cost: 3-10x slower than native compute; `zinc:ui` frame cost +5-25% (ios-core doc estimates) [V doc claims].
- **Web Serial/WebUSB flashing**: esptool-js (Apache-2.0, Chrome/Edge 89+, can flash prebuilt bins at offsets; does not create images from ELF) [W: https://github.com/espressif/esptool-js]; used by MicroPython/CircuitPython web installers and ESP Web Tools [W: adafruit/Adafruit_WebSerial_ESPTool, micropython discussion #13222]. Espruino Web IDE sends JS to the device by Web Serial/Bluetooth [W: https://www.espruino.com/Web+IDE]. MakeCode micro:bit flashes hex via WebUSB, compiles in the browser to ARM Thumb machine code, offline after first load [W: https://makecode.microbit.org/device/usb/webusb, MSR blog https://www.microsoft.com/en-us/research/blog/rocket-fast-embedded-typescript-for-makecode-arcade/; PXT also has a bytecode VM for platforms that forbid codegen, ~5x slower]. Wokwi simulates ESP32 in the browser and via VS Code with your own ELF [W: https://docs.wokwi.com/].
- **Availability**: Web Serial: Chrome/Edge 89+, Opera 76+, Chrome Android 154+, **Firefox desktop 151+ (since 2026-05, behind a site-permission add-on prompt)**, **no Safari/iOS** [W: https://caniuse.com/web-serial, https://hacks.mozilla.org/2026/05/web-serial-support-in-firefox/ (search result), MDN]. Secure context + user gesture; usable in dedicated workers [W: MDN]. WebUSB: Chromium only [I].
- **COOP/COEP**: SharedArrayBuffer (needed for threaded Emscripten builds, Wasmer, some WebContainers) requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp|credentialless`; on static hosts without header control, `coi-serviceworker` emulates them but must be same-origin, not from a CDN, and reloads the page once [W: https://web.dev/articles/coop-coep, https://github.com/gzuidhof/coi-serviceworker]. The Astro site can set headers on Netlify/Cloudflare; **design the VM core single-threaded to avoid needing SAB** [I].
- **Storage/offline**: OPFS + IndexedDB for projects, Service Worker + Cache API for the compiler/core wasm (MakeCode is the precedent for fully offline after first load [W]); `File System Access API` (Chromium) for opening real folders [I].

### 6.2 Tiers

**Tier A: no-install simulator** (weeks). Browser compiler (TS + HIR + `emit-bc`) -> ZBC4 -> `zinc-vm.wasm` web core with canvas HAL -> live preview, hot reload by re-loading bytecode (no page reload; better than today's wasm target which reloads the page). Also deterministic replay (`ZINC_RECORD/REPLAY` concepts) for shareable sessions and a docs "run this snippet" widget on `site/`. Needs: browser-ported compiler, universal wasm core (Emscripten build of `runtime/vm/main.cpp` with the gfx modules; a `zinc:*` subset per `capabilities.json` "wasm" profile: no net/fs/threads), `zinc.storage` mapping to IndexedDB. Limitation: modules not in the core (user `.spec.ts` native modules, plugins with C++ such as sqlite/three/video) are unavailable in Tier A (native C++ cannot be compiled in-browser); pure-Zinc plugins fine.

**Tier B: compile in the browser to ZBC4, then upload bytecode to a device running the Zinc VM firmware** (the Arduino-like key insight; months). Flow: user picks "ESP32-S3 Matrix" -> Studio flashes once a **board core firmware** (prebuilt by CI per board preset from `boards/*.json`: display drivers, IMU plugin, pools/heap already in the preset) with esptool-js/esptool -> subsequent "Upload" only sends `app.zbc` (KB, not a 1.6 MB image) over serial (framed protocol, CRC, to a `zbc` flash partition, or RAM for "Run" like MicroPython raw REPL) or OTA/ssh to Pi (`scp app.zbc` + `zinc-core` service). Benefits: no toolchain at all for daily use (removes ESP-IDF, Docker, sysroots from the *student* path), 1-2 s upload, works from a Chromebook. Costs/risks: (1) VM is host-only today: needs a bare-metal/ESP-IDF port of `runtime/vm/main.cpp` (uses `<thread>`, `<fstream>`, `std::deque/map`; ESP32 heap default 160 KiB, no PSRAM on CYD board, `docs/boards.md`), an ESP-IDF build of the *core* is still needed but by CI; (2) VM is 3-10x slower than native and ESP32 has no JIT (fine); (3) every native module a script may call must be linked into the core ("script must use a subset of its native exports", `docs/precompiled-core.md`), so a board core = superset of plugins for that board (size!); (4) ABI/versioning: ZBC4 is "experimental", bundles "must be rebuilt" on change (`docs/engines.md`), so define a stable `ZBC` + core ABI version handshake with a semver'd core; (5) memory: ZBC4 16-byte instrs are wasteful for 4 MB flash boards (the design doc's compact 32-bit encoding is not implemented) [V]. Also fits Pi 1-5, rmpp (ship core as an AppLoad app), and even PS1/PS2 (bytecode in the disc image) [I]. **Recommendation: make Tier B the default path for education, keep full native firmware (`zinc build --target esp32`) for "production" and performance.**

**Tier C: cloud compile service** (weeks after toolchains are Docker-free; infra + ops). API: POST project -> containerized `zinc build` with the *same pinned toolchains* -> returns firmware `.bin` (esp32), ELF, or wasm. Needed for: native builds from the browser (esp32 full firmware, rpi/linux arm binaries, PS1). Arduino Cloud, PlatformIO, Wokwi-style. Must sandbox (untrusted C++ via native `.spec` modules and plugin `sources` = arbitrary code; gVisor/Firecracker, no network, cpu/mem limits), and rate-limit; the browser then flashes the returned image with esptool-js. Data privacy: source leaves the machine (opt-in). Costs: ESP-IDF build ~1-3 min cold on a small instance [I]. Reuse the existing conformance corpus to smoke-test. **This is where Docker legitimately remains (server side).**

**Tier A+ (optional)**: in-browser C++ compile of only the app TU with wasm clang against a prebuilt runtime archive to build `wasm` apps (Tier A of native fidelity). Research-grade, skip in v1.

---------------------------------------------------------------------------------------------------------------------

## 7. Roadmap, effort and risks

Effort in **person-weeks (pw)** for one engineer familiar with the codebase; [I] = estimates, not measured.

| Phase | Deliverable | Effort | Depends | Key risks |
|---|---|---|---|---|
| P0 | Spike: `zinc build --target linux/rmpp/rpi1` with `zig c++` + generated CMake (or direct command), compare binaries/behaviour with Docker builds (run hero on the Pi 3B+; conformance under qemu on Linux) | 2-3 pw | zig 0.15/0.16 installed | libc++ vs libstdc++ ABI for plugin libs; armv6 flags; SDL3/curl/FFmpeg sysroot; zig macOS segfault class of bugs |
| P1 | `zinc toolchain` manager: signed index, cache, sha256/minisign verify, offline bundles, `doctor`, Docker as fallback backend; zig + cmake + ninja + Espressif tools.json driven installer for esp32 (IDF clone pinned, Python venv) | 4-6 pw | P0 | ESP-IDF v6 install fragility on Windows; disk size; mirror licence (GPL source offers) |
| P2 | Debian sysroot builder (CI, Linux) publishing `sysroot-*` tarballs for plugin `pkg/packages`; replaces derived Docker images; static musl paths for rmpp/rpi1 | 3-4 pw | P1 | correct pkg-config relocation, FFmpeg/libcurl licences, size |
| P3 | Windows host support: sim + `zig` Windows targets, `hal_posix` Windows port (SIGBUS etc.), SDL3 HAL; `flash.ts` Windows port enumeration (`COMx`) & monitor (no `stty`) | 4-6 pw | P1 | CRLF/paths in generated CMake (`cli.ts` uses POSIX paths and `sh -c`), `deploy.sh` is a shell script (needs Node/PowerShell port) |
| P4 | ESP32 without Docker (IDF via `idf_tools.py`), bundled `esptool`/`espflash`, native serial monitor, USB VID/PID discovery, Espressif QEMU download | 3-4 pw | P1 | IDF pinned git tags, Python dependency; Windows path length; PSRAM/oct boards untested |
| P5 | Zinc Studio v0 (Tauri 2 + Monaco + engine daemon; project/examples, build/run/flash/monitor, ssh device, sim preview via remote display), signed installers + updater | 8-12 pw | P1, P4 (P3 for Windows) | Apple notarization/Windows signing logistics (certificate procurement, ~$100-600/y [I]), engine packaging (`ZINC_ROOT`), WebKitGTK quirks |
| P6 | Browser compiler port (virtual host, bundle), CI job that runs conformance in Node *with the browser bundle* | 3-4 pw | none (parallel) | TS 6 bundle size/perf; plugin discovery; `import.meta.url`/`process` dependencies not yet found by grep |
| P7 | Universal web core (Emscripten VM+gfx+canvas HAL) + Tier A playground on `site/` (Monaco, OPFS, service worker/PWA, share links) | 5-7 pw | P6 | VM single-thread build, musttail on wasm, module subset, audio/net absence; ZBC4 stability |
| P8 | Board cores + bytecode upload protocol + ESP-IDF VM port (Tier B), esptool-js/WebSerial flash + upload in browser and Studio; Pi core service | 12-20 pw | P6, P7, universal core ABI | VM RAM/flash footprint on ESP32; slow compute; core = superset of plugins; version skew; needs on-device test rigs (only a Pi 3B+ and two ESP32 boards known) |
| P9 | Cloud compile (Tier C) | 4-6 pw + ops | P1-P2 | sandboxing, abuse, cost, privacy |
| P10 | PS1/PS2 story: document Docker/WSL as the supported route on non-Linux hosts; package PSn00bSDK for Linux/Win; PS2 stays Docker or Linux-source-build | 2 pw | P1 | SDK licences (PSn00bSDK MPL-2.0 with Nintendo/Sony patents? [I unverified]; PsyQ excluded by spec rule 10), no BIOS redistribution |

Suggested order: P0 -> P1 -> P2 -> P4 -> P5 (Linux/mac first) in parallel with P6 -> P7 (public wow: "try Zinc in your browser") -> P3 -> P8 -> P9. Total to "Studio + Docker-free + Tier A" is ~30-40 pw; Tier B adds another ~12-20 pw and is the highest-risk/highest-value item. [I]

### Security and supply chain
- Everything downloaded is pinned by sha256 *and* the index is signed (minisign) with an offline root key; reproducible provenance table in `docs/security/third-party.md` extended per toolchain (already done for Docker digests). Consider Sigstore/SLSA attestations on Zinc-built sysroot tarballs.
- Untrusted-project risk: projects contain `.spec.ts` native modules, plugin `sources`, `sdkconfig`, `idf_component.yml` git deps => building a downloaded project is arbitrary code execution (same as any repo; `docs/studio.md` already says "Open projects you trust"). Studio needs a trust prompt (VS Code Workspace Trust model) [I].
- Browser: run compiler in a Worker, CSP, VM core sandbox = wasm; bytecode verifier is the trust boundary (`docs/engines.md`). WebSerial only from user gesture; never auto-flash.
- Code signing: Apple Developer ID + notarization; Windows Authenticode; Tauri update signatures; pin the updater public key; the toolchain-index key must be different from the app key.
- ESP32 flash contains Wi-Fi credentials when `targets.esp32.wifi` is used (cli.ts ~ l.650) => keep out of committed zinc.json/`ZINC_WIFI_PASSWORD` (already supported) and out of cloud builds.

---------------------------------------------------------------------------------------------------------------------

## 8. Comparison

| | **Zinc (proposed)** | Arduino IDE 2 / Cloud | PlatformIO | MakeCode | Wokwi | Espruino / Thonny |
|---|---|---|---|---|---|---|
| Language | TypeScript/TSX (typed subset), React/Solid UI | C++ | C/C++ (+ many frameworks) | Blocks, Static TS/Python | your firmware (C++/Rust/MicroPython) | JS / MicroPython |
| Install | Desktop (Tauri) + browser PWA | Electron 300+ MB; Cloud = browser + agent | VS Code + Python + GBs | none (PWA) | none (browser) / VS Code | none (Web IDE) / small |
| Toolchain mgmt | signed index + content-addressed cache (`zinc toolchain`) | Boards Manager index [W] | registry packages [W] | none (in-browser compiler [W]) | server-side [I] | firmware download |
| Compile | native via zig/IDF, or **bytecode in browser** | arduino-cli local / cloud | SCons local | in-browser TS->ARM Thumb [W] | (uses your build) | on-device interpreter |
| Upload | esptool/espflash, ssh, WebSerial+esptool-js, bytecode | avrdude/esptool per recipe | per-platform | WebUSB hex [W] | n/a (sim) | Web Serial/BLE text [W] |
| Simulator | Node sim (headless), native window, Wasm web core (Tier A) | limited | none built-in | in-browser simulator [I] | full MCU+peripherals sim [W] | none |
| Targets | ESP32, Pi, rmpp, PS1/2, wasm, host | AVR/ARM/ESP... | 1000+ boards | micro:bit, Arcade... | ESP32/AVR/STM32... | Espruino boards/MicroPython |
| Weak point | Toolchain size for ESP-IDF; VM perf; Windows host missing; only 3 boards | C++ barrier | complexity | limited language, locked ecosystem | not a build system | slow, JS/Python only |

---------------------------------------------------------------------------------------------------------------------

## 9. Verified locally (commands run)

- `which zig docker node bun` -> zig 0.15.2 (Homebrew), Docker 29.4.0 (context OrbStack), Node v24.14.0, bun present.
- `zig c++ -target <T> -std=c++17 -O2 -fno-exceptions -fno-rtti -Iruntime -Iruntime/include -c runtime/zrt.cpp` for T in aarch64-linux-gnu.2.36, arm-linux-gnueabihf.2.31, arm-linux-musleabihf, x86_64-windows-gnu, x86_64-linux-musl, aarch64-macos: **all OK** (~0-1 s each); wasm32-wasi: fails (`setjmp` needs EH, expected). Outputs written only to the session scratchpad `zt/`.
- Same flags for `runtime/{gfx,raster,ttf,host}.cpp` and `targets/common/hal_posix.cpp`: OK on aarch64-linux-gnu.2.36 and arm-linux-gnueabihf.2.31; on x86_64-windows-gnu all OK except `hal_posix.cpp` (`SIGBUS` undeclared).
- Greps for node-only APIs across `compiler/src` (node: import counts per file, `ts.sys`, `createCompilerHost`, `process.`) and `sim/*.mjs`. **Not run:** the compiler in a browser-like environment, a full zig link of an app, SDL3/FFmpeg under zig, any Wasm build of the VM, any ESP32/PS build.
- Not verified (web): Bootlin host restriction, ARM GNU host list, PSn00bSDK Windows zips, PCSX-Redux macOS availability, Espressif archive sizes, wasm `-mtail-call` with musttail, all effort numbers.

## 10. Sources (web)

- Zig: https://ziglang.org/download/ , https://ziglang.org/download/0.16.0/release-notes.html , https://ziglang.org/learn/overview/ , https://andrewkelley.me/post/zig-cc-powerful-drop-in-replacement-gcc-clang.html , https://github.com/ziglang/zig/issues/10485 , https://codeberg.org/ziglang/zig/issues/31189 , https://crates.io/crates/cargo-zigbuild
- Apple license: https://www.apple.com/legal/sla/docs/xcode.pdf , https://developer.apple.com/forums/thread/114179
- Toolchains: https://github.com/mstorsjo/llvm-mingw , https://toolchains.bootlin.com/ , https://bootlin.com/blog/bootlin-toolchains-2026-08-released/ , https://gitlab.arm.com/tooling/gnu-toolchains-for-arm , https://github.com/espressif/crosstool-NG/releases/ , https://github.com/espressif/esp-idf/blob/master/tools/tools.json , https://docs.espressif.com/projects/idf-component-manager/ , https://github.com/esp-rs/espup
- Arduino/PlatformIO: https://docs.arduino.cc/arduino-cli/package_index_json-specification , https://github.com/arduino/arduino-ide , https://docs.platformio.org/en/latest/core/index.html
- Shell/distribution: https://v2.tauri.app/distribute/ , https://v2.tauri.app/plugin/updater/ , https://v2.tauri.app/develop/sidecar/ , https://v2.tauri.app/learn/sidecar-nodejs/ , https://nodejs.org/api/single-executable-applications.html , https://bun.com/docs/bundler/executables
- Browser: https://github.com/binji/wasm-clang , https://wasmer.io/posts/clang-in-browser , https://github.com/LuvHakii/llvm-wasm , https://github.com/zigtools/playground , https://blog.stackblitz.com/posts/bringing-sharp-to-wasm-and-webcontainers/ , https://github.com/espressif/esptool-js , https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API , https://caniuse.com/web-serial , https://hacks.mozilla.org/2026/05/web-serial-support-in-firefox/ , https://web.dev/articles/coop-coep , https://github.com/gzuidhof/coi-serviceworker , https://www.espruino.com/Web+IDE , https://makecode.microbit.org/device/usb/webusb , https://www.microsoft.com/en-us/research/blog/rocket-fast-embedded-typescript-for-makecode-arcade/ , https://docs.wokwi.com/ , https://github.com/adafruit/Adafruit_WebSerial_ESPTool
- Pi sysroot: https://github.com/abhiTronix/raspberry-pi-cross-compilers/wiki/Cross-Compiler-CMake-Usage-Guide-with-rsynced-Raspberry-Pi-32-bit-OS , https://deardevices.com/2019/12/25/raspberry-pi-sysroot/ , https://earthly.dev/blog/cross-compiling-raspberry-pi/

## 11. Repo file references (main)

`compiler/src/cli.ts` (DOCKER l.541-557, dockerArgs l.559, dockerBuild l.563, IDF_IMAGE l.605, espBuild l.618, emEnv l.688, wasmBuild l.699, doctor l.928, deploy/flash l.1110-1131), `compiler/src/flash.ts`, `compiler/src/frontend.ts` (l.1-14, 133-150), `compiler/src/native.ts:15`, `compiler/src/engines.ts`, `compiler/src/emit-bc.ts`, `compiler/src/emit-js.ts:387`, `docker/*/Dockerfile`, `targets/capabilities.json`, `targets/wasm/hal_web.cpp`, `targets/common/hal_posix.cpp:48`, `runtime/vm/main.cpp:377,843`, `sim/gfx.mjs:1`, `docs/precompiled-core.md`, `docs/engines.md`, `docs/studio.md`, `docs/boards.md`, `docs/dev-mode.md`, `docs/reports/{raspberry-pi,zinc-vm,ios-core-runtime}.md`, `docs/targets/{remarkable-paper-pro,playstation}.md`, `docs/decisions/0012-playstation-sdk-emulator.md`, `apps/studio/README.md`, memory `pi-test-rig.md`.


---

<!-- source: js-engines.md -->

# Other JS engines for Zinc: JavaScriptCore, V8, LibJS (and the rest)

Status: research only, nothing implemented. Date 2026-09-30. Tags: **[V]** verified here (read code or ran it), **[W]** from a web source (linked), **[I]** inference or estimate. Effort figures are one strong developer, unvalidated.
Prior context: [README.md](README.md), [quickjs-jit-aot.md](quickjs-jit-aot.md), [threejs-webgl.md](threejs-webgl.md).

## 0. Verdict

1. **Build a small `zinc-js-engine` C++ interface, then support exactly two engines: QuickJS-ng (default, everywhere, the only one that works on iOS/ESP32-adjacent/rpi1) and JavaScriptCore (macOS/iOS system framework, plus JSCOnly on Linux arm64/x64 as an experiment).** V8 is the third, opt-in, desktop/server-only engine and only if JSC-on-Linux fails. LibJS is not viable today.
2. **The speed gap is real and JSC closes it.** Measured here (M-series Mac, same kernels as the earlier reports): Three r186 mock-GL render of 500 cubes is 13.2 ms in quickjs-ng, **0.54 ms in JSC (JIT)**, 0.81 ms in V8/node, **6.8 ms in JSC with JIT off**, 5.8 ms in V8 `--jitless`. Even the no-JIT modes of JSC and V8 are ~2x faster than QuickJS on Three's code. That matters for iOS, where no engine gets a JIT.
3. **iOS: JIT is not available to any in-process engine, JSC included.** In-process `JSContext` runs without JIT [W: Apple DTS reply, [forums 746159](https://developer.apple.com/forums/thread/746159)]; WKWebView has JIT but is out of process; BrowserEngineKit's JIT protection is EU browsers only. So on iOS the choice is between interpreters: JSC LLInt (free, system-provided, 0 bytes), QuickJS (+AOT from the earlier report), or V8 jitless (~+20 MB [I]).
4. **The current ABI cannot do zero-copy.** `zinc_abi.h` v4 says BYTES are readonly snapshots and adapters copy. WebGL/Three needs typed-array views onto native memory. That needs an ABI v5 addition (section 4), independent of the engine choice.

## 1. Measurements run for this report [V]

Machine: Apple M-series Mac, macOS 24.6, node v24.14 (V8 13.6.233.17-node.41), quickjs-ng build in the scratchpad (`bench/qjs_ng`, 1.09 MB), Apple `jsc` at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`. Kernels: `scratchpad/bench/{fib,mandel,objs}.js` (fib(32); 300x300 mandelbrot; 200k `new P` plus string/object churn). Single run each, warm machine, differences under about 15% are noise.

| Kernel (ms) | quickjs-ng | JSC (JIT) | JSC `useJIT=0` | V8 (node) | V8 `--jitless` |
|---|---|---|---|---|---|
| fib(32) | 270 | 19 | 170 | 23 | 216 |
| mandelbrot | 380 | 18 | 148 | 14 | 225 |
| objects/strings | 49 | 13 | 29 | 8 | 18 |

Three r186 (esbuild bundle, mock GL Proxy, `scratchpad/thr/r.js`), ms per frame:

| Scene | quickjs-ng | JSC (JIT) | JSC no JIT | V8 (node) | V8 `--jitless` |
|---|---|---|---|---|---|
| 500 cubes, 351 draws, 2119 GL calls | 13.17 | 0.54 | 6.76 | 0.81 | 5.81 |
| 1000 cubes, 851 draws, 5119 GL calls | 28.99 | 1.09 | 16.07 | 2.20 | 13.47 |

Process footprint for `print(1)`: JSC 7.2 MB RSS, node 44.8 MB, quickjs-ng 2.1 MB; wall startup: JSC and QuickJS under 10 ms, node ~30 ms [V]. JSC on macOS costs 0 bytes of app size (system framework) [V: `du` reports 0B because it is in the dyld shared cache]. node is 119 MB, bun (JSC based, also with its own runtime) 61 MB [V, file sizes].
Caveats: `jsc` shell has no Zinc bindings; the mock GL crossing is a JS function, so native-crossing cost per engine is not measured; the JSC-no-JIT run still uses LLInt with its own assembly fast paths, so it is stronger than a naive interpreter; V8 `--jitless` on node still has embedded builtins compiled natively.

Published numbers [W]: V8 jitless is about 40% slower on Speedometer 2.0, 80% on Web Tooling, 6% on a real YouTube app, heap -1.7% ([v8.dev/blog/jitless](https://v8.dev/blog/jitless)). LibJS moved Speedometer 3 from 4.11 to 4.22 in one April 2026 optimisation ([newsletter](https://ladybird.org/newsletter/2026-04-30/)), i.e. it is far behind V8/JSC. Hermes reports vs QuickJS only as charts, no numbers extractable ([Static Hermes report](https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md)). weval on SpiderMonkey/Octane: 2.17x geomean vs its interpreter ([Fallin, PLDI 2025](https://cfallin.org/pubs/pldi2025_weval.pdf)).

## 2. Comparison matrix

| | QuickJS-ng (baseline) | JavaScriptCore | V8 | LibJS (Ladybird) |
|---|---|---|---|---|
| Licence | MIT | LGPL-2 / BSD-2 (WebKit JSC is BSD-2 with LGPL parts in WTF/JSC sources [I: check per-file]) | BSD-3 | BSD-2 [W] |
| Size added | ~1 MB [V] | 0 on Apple (system). JSCOnly `libJavaScriptCore` + ICU: order 15-30 MB with JIT, less stripped/no wasm [I, not built] | ~20-30 MB monolith; +ICU data [W: user brief, v8-builder README] | Unknown; plus Rust runtime and AK/LibGC, order of a few MB [I] |
| Build | one C amalgam, CMake [V] | Apple: none. JSCOnly: WebKit tree, CMake, Ruby/Perl/Python, ICU, ~1 h+ builds, several GB RAM [W: [trac JSCOnly](https://trac.webkit.org/wiki/JSCOnly)] | depot_tools/gn/ninja, huge checkout; `v8-cmake` community and `rusty_v8` prebuilt static libs [W] | CMake, **Rust now mandatory** [W: April 2026 newsletter], mimalloc, no stable library packaging [I] |
| C/C++ embedding API | Good C API, `JSValue` refcounted, opaque | **C API** (`JSObjectRef`, `JSValueProtect`) stable, small, with `JSTypedArray.h` incl. `JSObjectMakeTypedArrayWithBytesNoCopy`, `JSObjectMakeArrayBufferWithBytesNoCopy`, `JSObjectGetTypedArrayBytesPtr` [V: local SDK header]. ObjC `JSContext` on Apple | C++ only, unstable across versions, handles/scopes/isolates/contexts, heavy | C++ classes (VM, Realm, Value), no stable API, not designed to be embedded outside Ladybird [I] |
| ES level | ES2023+ | ES2025 (full) | ES2025 (full) | 97.8% test262 [W] |
| JIT tiers | none (interp; AOT prototype) | LLInt, Baseline, DFG, FTL (+ BBQ/OMG for wasm). `JSC_useJIT=0` = LLInt only [V] | Ignition, Sparkplug, Maglev, TurboFan; `--jitless` = Ignition only [W] | none by design: "not convinced" of JIT complexity; hand-written asm bytecode interpreter [W] |
| iOS | yes (interpreter, AOT possible) | Framework: yes, **no JIT in-process** [W]. WKWebView has JIT (out-of-process) | Only jitless (`v8_enable_lite_mode`), builds for iOS [W: [v8.dev/docs/cross-compile-ios](https://v8.dev/docs/cross-compile-ios)] | Not practical [I] |
| Android | yes | Not shipped by Android; JSCOnly builds exist (React Native used jsc-android in the past [I]) | Yes (Chromium/Node), big | Not practical [I] |
| Linux arm64 (Pi 4/5, rMPP) | yes [V, already builds] | JSCOnly supports ARM64 and ARMv7 with JIT [W: trac JSCOnly]; not built here | Yes, arm64 supported; Pi 3B+ 1 GB RAM is tight [I] | Builds in principle, immature [I] |
| Pi 3B+ (aarch64 userland) | yes | possible but heavy, untested | poor fit (RAM, size) | no |
| ESP32 | no (mquickjs/Duktape only, see report) | no | no | no |
| Windows | yes | JSCOnly Windows port exists but rarely used [I]; Bun ships JSC on Windows [I] | Yes, first-class | Not a focus |
| Wasm in engine | none | yes (BBQ/OMG, JIT-less IPInt) | yes (Liftoff/TurboFan; jitless disables wasm [W]) | no |
| ArrayBuffer zero-copy | `JS_NewArrayBuffer(..., free_func)` and `JS_GetArrayBuffer` [V: earlier report] | `...NoCopy` with deallocator callback and `GetTypedArrayBytesPtr` [V header]. Bytes must not move: JSC never moves ArrayBuffer backing stores | `ArrayBuffer::NewBackingStore` with custom deleter; external memory OK | ByteBuffer is AK-owned; native pointer exposure would need patches [I] |
| GC / handles | refcount, deterministic; `JS_DupValue/FreeValue` | Conservative stack scanning: C++ locals are safe, only heap-stored `JSValueRef` need `JSValueProtect` | Precise, moving; `Local<>`/`Global<>` handle scopes; embedder heap tracing (cppgc) for wrappers | GC (LibGC, conservative, mark-sweep) [W] |
| Startup / RSS | 2 MB, ~ms [V] | 7 MB, ~ms [V] | 45 MB (node); bare isolate 10-20 MB w/ snapshot [I]; snapshots give fast start [W] | unknown |
| Perf vs QuickJS (Three, mine) | 1x | **24x** (JIT), 2x (no JIT) [V] | 16x (JIT), 2.3x (jitless) [V] | slower than V8; QuickJS-comparable or slower [I] |
| Interrupt / timeout | `JS_SetInterruptHandler` (Zinc uses it) | `JSContextGroupSetExecutionTimeLimit` (private-ish on some builds, in `JSContextRefPrivate.h`; check) [I] | `Isolate::TerminateExecution` from another thread | no |
| Memory limit | `JS_SetMemoryLimit` (Zinc: 512 MiB) | none in public API; `JSC_maxHeapSize`-style options in JSCOnly, process-level otherwise [I] | `ResourceConstraints`, near-heap-limit callback | no |
| Maturity/activity | active (ng) | very active (Apple) | very active | active but browser-coupled, mid-rewrite to Rust (Feb 2026) [W] |

Other engines, briefly:

| Engine | Verdict | Notes |
|---|---|---|
| Hermes / Static Hermes | Skip | Bytecode-precompiled, no full ES (no `with`, limited Proxy history [I]), C++ JSI API not C, Intl optional. Faster than QuickJS on startup, JIT only in the experimental v2 ("hv32+jit", [W]). Useful precedent for iOS OTA bytecode. Build via CMake is OK. Would be a serious QuickJS alternative only for RN-style apps |
| Boa (Rust) | Skip | 94.12% test262 (v0.21) [W], slow, Rust FFI, no zero-copy story |
| Kiesel (Zig) | Skip | Learning project, Zig [W] |
| Duktape / mujs | Skip except tiny | ES5, 187 kB / 78 kB RAM Duktape [W]; mquickjs already the tiny plan |
| SpiderMonkey/mozjs | Skip | Excellent JIT, but Mozilla build (Rust, python, mozbuild), 20+ MB, C++ JSAPI; only worth it via weval/StarlingMonkey |
| QuickJS in Wasm / wasmtime + weval | Interesting, not now | Isolation and iOS-legal only via wasm interpreter (no AOT artifacts on iOS per `ios-core-runtime.md`); weval gives ~2.2x on SpiderMonkey PBL [W]; QuickJS-in-Wasm is slower than native QuickJS. Zero-copy is available (linear memory) but everything is inside Wasm's memory model, which suits a Wasm-hosted WebGL less than native GLES |

## 3. What each engine means for Zinc's QuickJS runner [V read of `runtime/vm/quickjs.cpp`]

The runner (333 lines) does the following engine-specific work, which is what a `zinc-js-engine` interface has to cover:

| Concern | QuickJS today | JSC | V8 |
|---|---|---|---|
| Module registry: `zinc:*` native modules with `JS_NewCModule`, `JS_NewCFunctionData` per export id | native module with synthetic exports | **No C API for ES modules** (`JSScript` / `JSModuleLoader` exist in the ObjC API only, macOS 10.15+; on JSCOnly, use `jsc`'s internal `moduleLoader` hooks). Simplest: bundle to one script and expose modules as a global `__zincModules` object | `Module::CreateSyntheticModule` plus `InstantiateModule` (clean) |
| emit-js output is ES2022 modules | evaluated as `JS_EVAL_TYPE_MODULE`, loader resolves files | Needs either ObjC `JSContext evaluateJSScript` with `JSScriptTypeModule` (Apple only) or a transform "ESM to script" in the compiler (esbuild-style; `zinc bundle`). Zinc's emitter already emits one module tree so a one-file IIFE mode is cheap | full modules |
| Native call: convert args (string, i32, f64, callback, resource) then `Modules::call` | per-arg `JS_ToInt32` etc. | `JSValueToNumber`, `JSStringCopyUTF8CString`; fine | `Local<Value>` -> `Int32Value`, `String::Utf8Value`; fine |
| Resources: JS object wrapping `ZincHandle` with finalizer that calls `resource_release`; cache `handle -> JSValue` weak | class with finalizer, non-owning map | `JSClassCreate` with `finalize`; **weak map from handle to object must not hold strong refs** (`JSObjectMake` + private data; use `WeakRef`-style via JS side map or recreate wrappers) | `Global<>` with `SetWeak` callback; cppgc |
| Guest callbacks `ZincCallback` holding `JSValue fn` and re-entering | `JS_DupValue`, `JS_Call` | `JSValueProtect`/`Unprotect`, `JSObjectCallAsFunction`; exceptions via `JSValueRef*` out-parameters (no longjmp) | `Global<Function>`, `Function::Call` with `TryCatch` |
| Microtasks: `JS_ExecutePendingJob` loop, pumped by the runner and in native callbacks | explicit | **JSC runs the microtask queue automatically at the end of each outermost API call** (`JSObjectCallAsFunction`/`JSEvaluateScript`). There is no public "run one job" in the C API. Order-of-effects compared to QuickJS may differ, breaking byte-exact parity tests in `tests/engines/run.mjs` in rare cases [I] | `MicrotasksPolicy::kExplicit` + `PerformCheckpoint()` (best control) |
| Timers/event loop: runner owns the loop (`h.timers`, `poll_host`) | Zinc-owned; bootstrapped `setTimeout` in JS | engine-neutral, reuse as is | same |
| Rejection tracker | `JS_SetHostPromiseRejectionTracker` | no C API; ObjC `JSContext` exposes none either. `unhandledrejection` must be emulated by wrapping `Promise` or polling, or use internal API in JSCOnly [I] | `SetPromiseRejectCallback` |
| Timeouts: `JS_SetInterruptHandler` deadline | poll callback | `JSContextGroupSetExecutionTimeLimit` with `shouldTerminateCallback` [I: SPI in `JSContextRefPrivate.h`, present in Apple SDK headers of the JSC framework? check `grep TimeLimit` returned only a doc mention of the context group, so it is likely SPI; verify] | `TerminateExecution` from a watchdog thread |
| Memory limit: `JS_SetMemoryLimit(512 MiB)` | built-in | none; rely on `setrlimit`/Zinc's own resource accounting; or JSC options in JSCOnly | `ResourceConstraints` |

Conclusion: the ABI side (`zinc_abi.h`) is engine-neutral and reusable unchanged, since no engine value crosses it [V]. What must be abstracted is a "JS host" trait of about 15 operations (section 5), not the ABI.

## 4. Zero-copy and the ABI (crucial for WebGL/Three.js)

`zinc_abi.h` v4 comment: "BYTES are readonly value snapshots: adapters copy inputs and outputs; no alias identity or native mutation is exposed", and NUMBERS are read-only `double[]` arguments only [V]. In `quickjs.cpp` a `u8[]`/`number[]` argument is rebuilt by walking a JS **Array** element by element and pushing into a `std::vector` (lines about 140-165) [V]. That is O(n) with per-element `JS_GetPropertyUint32`, a typed array would not even be accepted (`JS_IsArray`). So today even `bufferData` with a `Float32Array` is impossible.

Needed (engine-neutral) ABI v5 addition, prototype:

- `ZINC_TYPED_VIEW` argument type: `{ void* data; uint32_t byte_length; uint8_t elem_kind; uint8_t writable; }`, borrowed for the duration of `invoke`; same borrowing rule as strings. All three engines can give a pointer to an `ArrayBuffer` backing store:
  - QuickJS: `JS_GetArrayBuffer` / `JS_GetTypedArrayBuffer` [V: earlier report].
  - JSC: `JSObjectGetTypedArrayBytesPtr` + `JSObjectGetTypedArrayByteOffset/Length` (JSTypedArray.h) [V].
  - V8: `ArrayBufferView::Buffer()->GetBackingStore()->Data()` plus `ByteOffset()`.
- `ZINC_NATIVE_BUFFER` result: native-owned memory exposed as an ArrayBuffer without copy (`JS_NewArrayBuffer` with free func; JSC `JSObjectMakeArrayBufferWithBytesNoCopy` with `JSTypedArrayBytesDeallocator`; V8 `ArrayBuffer::NewBackingStore(data, len, deleter)`). Needed for `mapBufferRange`/readPixels-style APIs and for shared `Float32Array` staging arenas.
- Rule: native code must not retain the pointer after `invoke` returns (GC and detach), matching the current "borrowed for the duration of invoke" contract.

Effort: 4-6 days for ABI, `abi.ts` and the QuickJS adapter plus tests; +2-3 days per further engine. This is the highest-value change in this whole report and it helps QuickJS as well.

## 5. Proposed abstraction: `zinc-js-engine`

Keep it a compile-time (template or link-time) interface, not a virtual hierarchy per value; runner main loop (timers, `poll_host`, deadline, exit code, `zinc::RunnerHost`, module registry, resources) is engine-neutral and extracted once from `quickjs.cpp` (about 120 of the 333 lines).

```
struct JsEngine {                      // one implementation per engine, chosen at build time
  bool init(const Limits&);            // memory, stack size
  bool defineHostObject(name, table);  // __zincHost: write, timer, now, exit, env ...
  bool registerNativeModule(name, const ZincModule*);   // synthetic module or global fallback
  bool evalMain(path, source);         // ESM main (or IIFE bundle on JSC without modules)
  int  runMicrotasks();                // >0 progress, 0 none, <0 exception
  bool call(Fn, args...);              // for timers and ZincCallback
  ZincHandle makeCallback(Fn);         // ref-hold; released via resource_release
  void  setInterrupt(deadline);
  void  reportError(ex);               // uniform stderr format so tests stay byte-exact
  void  setRejectionHook(cb);
};
```

Marshalling code (args to `ZincValue`, results back) is generated per engine from the same descriptor table (`ZincExport`), so the ~120 lines of conversion in `nativeCall` get one implementation per engine but no logic change. New files: `runtime/vm/jsengine.h`, `runtime/vm/js_quickjs.cpp` (moved code), `js_jsc.cpp`, later `js_v8.cpp`. CLI: `--engine quickjs|jsc|v8` reuses the existing `engines.ts` per-engine build directories and `engine.json` fingerprint. Parity harness `tests/engines/run.mjs` adds modes `jsc` and `v8` (byte-exact stdout vs native/VM/QuickJS), which is the correctness gate.

Module loader: keep emit-js as ES2022 modules for QuickJS/V8; for JSC add a `--js-format iife` bundler step (one-file, `zinc:*` imports rewritten to `__zincModules["zinc:x"]`), which also removes file I/O from the runner and suits iOS bundles. Event loop: unchanged (Zinc-owned). Timeouts: interrupt/terminate per table in section 3. Memory limit: enforced in Zinc's ABI allocations (already 64 MiB composite cap) plus process rlimit for JSC.

## 6. Fit for Three.js / WebGL per platform

| Platform | Practical engine | Rationale |
|---|---|---|
| macOS (dev, Studio) | **JSC (system, JIT)** | 0 bytes, 24x faster than QuickJS on Three [V]. Hardened-runtime apps need `com.apple.security.cs.allow-jit` for JIT [I]; the `zinc` CLI is unsandboxed so fine |
| iOS | **QuickJS(+AOT) or JSC-in-process, both no JIT** | JSC LLInt is 2x QuickJS on Three [V] and free, but Apple's rule forbids any JIT [W], and JSC C API pieces (rejection tracker, modules) are missing. Zinc VM stays chosen path for app logic; Three is the exception, which is why JSC no-JIT is the pragmatic engine there. Precompiled bytecode is not available in JSC's public API [I], so JS ships as source (App Review has accepted JSC-hosted JS: Scriptable, per `ios-core-runtime.md`) |
| Linux x64 desktop / Windows | **V8 or JSCOnly** | V8 is the least risky for Windows; JSCOnly is smaller but Windows port is niche [I]. Choose after a spike |
| Pi 4/5 (aarch64) | **JSCOnly (JIT, arm64)** as experiment; QuickJS as baseline | Pi 4 Cortex-A72 is ~3-5x slower than M1 [I], so QuickJS Three would be 40-100 ms/frame for 500 cubes: unusable. JSC with JIT should be ~2-5 ms [I]. V8 arm64 works but 1-2 GB RAM boards suffer |
| Pi 3B+ (1 GB, aarch64 userland) | JSC no-JIT or QuickJS, small scenes only | V8 no; JSCOnly build must be cross-compiled (zig/sysroot), ~[I] 20 MB RSS baseline |
| rM Paper Pro (arm64 Linux, e-ink) | QuickJS | UI is low-frame-rate; Three not a target |
| Android | QuickJS (or V8 if NDK build is accepted) | no system JSC; skip until asked |
| ESP32 | mquickjs / Zinc VM | out of scope of this report |

Cost model to remember: the earlier report found the crossing is not the bottleneck and this report confirms that Three's own JS is. So a JIT engine on desktop/Pi-class targets is the lever; on iOS the lever is Three's own batching (InstancedMesh/BatchedMesh) plus JSC LLInt.

## 7. Phased plan (one developer)

| Phase | Work | Effort | Exit gate |
|---|---|---|---|
| 0 | Extract engine-neutral runner from `quickjs.cpp` into `jsengine.h` + QuickJS impl; no behaviour change | 4-6 d | `tests/engines/run.mjs` unchanged pass |
| 1 | ABI v5: typed-array view/native buffer + tests (all 3 sides) | 4-6 d | zero-copy round-trip test on QuickJS |
| 2 | `js_jsc.cpp` on Apple (C API + ObjC `JSScript` modules or IIFE bundle), `--engine jsc`, parity matrix, bench harness with the kernels above | 10-15 d | byte-exact parity; Three mock bench under Zinc <= 1 ms/500 cubes |
| 3 | JSCOnly cross-build for aarch64 Linux (Pi 4/5), zig/sysroot recipe, CI artefact caching (build once, ship prebuilt static lib in `zinc toolchain`) | 15-25 d | runs Phase 2 tests on a Pi 4; RSS/size measured |
| 4 | Windows/Linux x64: try JSCOnly first (reuse Phase 3 recipe); only if it fails, `js_v8.cpp` on prebuilt static libs (rusty_v8/`v8-cmake`) | 10 d (JSCOnly) / 20-30 d (V8) | same tests |
| 5 | Optional: precompiled-bytecode/snapshot for V8, embed Three preset, docs | 5-10 d | n/a |

Total for JSC macOS + Pi: about 35-55 days, V8 as extra: +20-30 days. LibJS: no phase; revisit in 12+ months.

## 8. Risks

- **JSC portability (highest):** JSCOnly is real and builds on ARM64/ARMv7 [W], but WebKit build time, size and toolchain (ICU, Ruby/Perl/Python, compilers new enough) are uncertain for cross-builds to Pi; JIT on ARMv6 (rpi1) is impossible, so rpi1 stays QuickJS. Not built in this session.
- **JSC API gaps:** no C-level modules, microtask control, rejection tracker or supported execution time limit; each needs a workaround and may cause parity differences from QuickJS.
- **iOS policy:** rules can change; today, in-process JSC has no JIT [W] and BrowserEngineKit JIT is EU-browser only. JSC as an *only* engine for iOS Zinc apps would need a fallback to QuickJS.
- **V8:** 20-30 MB, `gn`/depot_tools or third-party prebuilts (rusty_v8 static libs are large and versioned per Rust crate), C++ API churn every release; not viable on Pi 3B+, on iOS only as jitless.
- **LibJS:** `test262` 97.8% is good, but no JIT by design, no stable embedding API, C++/Rust mix with Rust mandatory since April 2026, tightly coupled to Ladybird build, slower than V8/JSC (Speedometer 3 about 4.2 [W] vs. browsers in the 20-40 range [I]). Only useful as a curiosity.
- **Parity drift:** microtask timing, error message text, property enumeration order, float formatting differences between engines can break byte-exact tests; add a normalisation layer only where the ECMAScript spec allows variation.
- **Licences:** JSC is LGPL/BSD mixed [I: verify per-file]; dynamic linking on Apple is fine, static linking on Linux needs a license review against `docs/licenses.md` (MIT-only for engines).

## 9. AOT-friendly for iOS (what remains)

- Zinc VM (typed bytecode, tail-call threaded interpreter) and Zinc->C++ AOT stay the primary iOS path; both are engine-free.
- QuickJS: precompiled bytecode (`JS_WriteObject`) and `qjsc -A` AOT ported to ng are iOS-legal because they are linked at build time [V: earlier report]; JSC and V8 give no such AOT (JSC bytecode cache is private; V8 code cache needs a matching build and jitless still interprets).
- JSC in-process (LLInt) is legal on iOS and is the fastest no-JIT engine tested here [V], but ships JS as source; V8 jitless is legal, larger.
- Rule from `docs/reports/ios-core-runtime.md`: no downloaded dylibs/machine code/wasm AOT artefacts; OTA is interpreted bytecode or source only.

## 10. Not verified

Not built: JSCOnly, V8 monolith, LibJS, Hermes, mozjs, quickjs-in-wasm+weval. All sizes for those are estimates. `JSContextGroupSetExecutionTimeLimit` availability on public headers was only partially checked (grep found the context-group API but not the time-limit declaration in public headers). BrowserEngineKit details come from an Apple DTS forum reply, not the App Store guidelines text; re-read App Review Guideline 2.5.2 and the JIT entitlement docs before committing to a strategy. LibJS embedding conclusions are inferred from the newsletter and repository structure, not from building it. The Three mock bench measures JS-side cost only.

## Sources

- Apple DTS thread: https://developer.apple.com/forums/thread/746159
- V8 jitless: https://v8.dev/blog/jitless ; V8 iOS cross-compile: https://v8.dev/docs/cross-compile-ios
- Ladybird April 2026 newsletter (LibJS 97.8% test262, Rust mandatory, no-JIT stance): https://ladybird.org/newsletter/2026-04-30/ ; results: https://ladybirdbrowser.github.io/libjs-website/test262/
- JSCOnly: https://trac.webkit.org/wiki/JSCOnly ; https://github.com/WebKit/webkit/blob/main/Source/cmake/OptionsJSCOnly.cmake ; cross-build https://trac.webkit.org/wiki/JSCOnly/CrossBuildAndRemoteTestJSCLinux
- Hermes: https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md
- Boa: https://github.com/boa-dev/boa ; https://lobste.rs/s/upi3xa/boa_release_v0_21_new_release_boa
- Kiesel: https://kiesel.dev/ ; Duktape/mujs sizes: https://www.x-cmd.com/install/duktape/
- weval: https://cfallin.org/blog/2024/08/28/weval/ ; https://cfallin.org/pubs/pldi2025_weval.pdf
- Local: `runtime/include/zinc_abi.h`, `runtime/vm/quickjs.cpp`, `docs/reports/ios-core-runtime.md`, macOS SDK `JavaScriptCore.framework/Headers/JSTypedArray.h`; bench inputs in the session scratchpad (`bench/`, `thr/r.js`).


---

<!-- source: code-editor-lsp.md -->

# From a textarea to a real code editor: editing core, tree-sitter, LSP, Zinc language server (2026-09-30)

Status: research only, nothing here is implemented. Tags: **[verified]** read in this repo, **[web]** fetched or searched
during this study (sources at the end), **[bg]** background knowledge not re-checked online, **[inferred]** my
reasoning or estimate. Effort figures are estimates in engineer-weeks (ew) for one person who knows the codebase.
Repo state: the working tree was dirty (many modified files); line numbers below are from the tree as read.

## 1. What exists today

### 1.1 The editor is the engine's `<textarea>`, not a component

There is no separate editor widget. A "code editor" is a `<textarea>` in code mode plus a small extension API.
[verified]

- `lib/std/ui.ts:17-18`: `INPUT`/`TEXTAREA` node tags. `ui.ts:233`: `n.ed = new Edit(tag === TEXTAREA)`.
- `codeMode()` (`ui.ts:1151`): a multi-line field with `lineNumbers` or a mono font. In code mode Tab inserts 2 spaces
  and Enter keeps indentation (`ui.ts:1426`, `docs/ui.md:28`).
- Extensions for editors (`ui.ts:1556-1640`, `docs/ui.md:49-63`): `setMarks` (line/fill/box/squiggle/gutter marks),
  `setEditColors`, `setHighlightAt(h, f(line, start))`, `editView`, `scrollEditTo`, `editRowOf`, `repaint`.
- `examples/zed-editor` (2.5k lines of Zinc, `examples/zed-editor/README.md`) is a Zed-style app on top of it:
  project tree, tabs with preview semantics, find bar, palette/finder, minimap, terminal panel via `zinc:process`,
  `zinc check --json` diagnostics as squiggles. "One textarea per buffer" (README, "What it shows").
  Scenes and a scroll benchmark are scripted through the input test hooks (`ZINC_DEMO=...`).
- Conformance test: `tests/conformance/code_editor.tsx` drives the extension API headlessly and records `.out` files
  per resolution and number profile. [verified]

### 1.2 Text model

`class Edit` (`ui.ts:80-108`): the whole document is **one string** `value`; `caret`/`anchor` are UTF-16 offsets;
undo/redo are **whole-string snapshots** in `string[]` stacks capped at 100 (`ui.ts:1318-1324` `snapshot()`); an edit
is `value.slice(0,a) + s + value.slice(b)` (`ui.ts:1333`). One selection only. Typing coalesces into one undo step
(`e.typing`). There is no tree/branching undo. [verified]

Zinc strings are UTF-8, so indexing a non-ASCII string costs O(offset); `docs/ui.md:66-68` says fields work "line by
line" and code walking the value should `split('\n')`. Consequences [verified/inferred]:

- Every edit is O(document size): string rebuild, then `ensureRows` (`ui.ts:1153-1181`) re-splits the whole value and
  re-wraps every line whenever `value` or width changed (`rowsFor === value` check at `ui.ts:1153`).
- `rowOf` is a linear scan over rows (`ui.ts:1185-1188`); `offAtX` and `xIn` measure per character by calling
  `textWidth` on 1-char slices (`ui.ts:1190-1201`); hit-testing and caret x are O(row length) text measurements.
- zed-editor keeps its own second copy of the text: `Doc` (`examples/zed-editor/src/app/document.ts:29-61`) re-splits
  into `lines`/`starts` after each edit and re-tokenizes from line 0 (`ponytail:` comment at line 52). Measured by the
  authors: keystroke in a 5006-line file 4-5 ms; 5000-line scroll at 111-119 fps (README "Scenes and measurements").
  That is fine for thousands of lines and hopeless for tens of MB.

### 1.3 Input, IME, clipboard, layout, rendering

- Keys/typed text arrive in order from the HAL (`docs/ui.md:260-271`). Movement/deletion handling is in `ui.ts:1379-1430`
  (word/line/char, goal column `goalX`). Pointer: click, word/line selection, drag select (`ui.ts:1941`).
- **IME**: `startTextInput(x,y,w,h)` follows the focused field so the OS candidate window is placed next to it
  (`ui.ts:2178-2182`, `runtime/gfx.cpp:912-913`, `targets/macos/hal_sdl.cpp:415`). Only committed text works:
  `docs/ui.md:270` "Not done yet: IME composition preview ... multiple carets, word-wise drag selection after a double
  click". No preedit string, no marked-text range, no `TEXT_EDITING` handling. [verified]
- **Clipboard**: `hal_clipboard_get/set` (weak default process-local; SDL3 HAL implements it, `hal_sdl.cpp:430-437`),
  `clipboardText`/`setClipboardText` exposed by `zinc:gfx`. Text only. [verified]
- **Bidi / shaping**: none. `runtime/ttf.cpp` (332 lines) is a from-scratch TrueType rasterizer: `cmap` lookup
  (format 4/12, `ttf.cpp:62`), `glyf` outlines, `hmtx` advances; no GSUB/GPOS/kern tables found (grep "kern|GPOS" empty),
  glyph cache per (font, size), fixed table of 32 fonts (`ttf.cpp:228`). `textWidth` (`gfx.cpp:796`) sums advances.
  Consequently: no ligatures, no combining marks positioning, no Arabic/Indic shaping, no bidi reordering, no color
  emoji, no font fallback chain. [verified for what is present, inferred for "no fallback" from absence of any code]
- **Rendering**: software rasterizer in bands, on the CPU (`runtime/raster.cpp`); an optional GPU/GLES path is designed
  and Phase 1 implemented (`docs/reports/gpu-renderer-design.md`). The editor paints only visible rows: `paintEdit`
  slices the visible rows once per frame (`docs/ui.md:66-68`). Wheel/trackpad physics are engine-level.
- **Accessibility**: nothing for text fields (no AccessKit or platform tree found). [inferred from grep: no matches]

### 1.4 What zed-editor already covers (so it is not on the roadmap)

Tabs and preview tabs, find in file (plain text, not regex; `src/app/search.ts`, 74 lines), fuzzy finder and palette,
bracket matching marks, indent guides, soft wrap, zoom, minimap (canvas, token-coloured), lexical highlighting for
TS/TSX/JSON/Markdown/CSS with carried per-line state (`src/app/syntax.ts`, 234 lines), file tree, terminal **output
only** (no stdin/PTY), diagnostics from `zinc check --json` on the *saved* file (`src/app/tools.ts:70-79`). Its own
"Limits" section: one caret, no split panes, no go-to-definition, tokens recomputed from line 0, no unsaved-buffer
prompt on window close. [verified]

### 1.5 Platform facilities the roadmap can lean on

- **Process spawn already exists**: `zinc:process` (`plugins/process/`, `docs/plugins/process.md`): `spawn(cmd, args,
  {cwd, env})`, `onStdout(line)`, `onStderr`, `onData(chunk, isStderr)` raw chunks with UTF-8 never split, `write(s)`,
  `closeStdin()`, `kill`, exit code, up to 32 children, `posix_spawnp` with three pipes and a `zrt::Poller` on the
  event loop; targets macos/linux/rpi1. Callbacks are only delivered from the event loop. [verified] Gaps for LSP:
  `write` **blocks** when the child stops reading and the 64 KiB pipe is full (`docs/plugins/process.md:54-55`);
  no PTY; string-only I/O (no binary-safe `Content-Length` counting: LSP counts **bytes**, JS/Zinc string lengths
  are UTF-16/UTF-8-ambiguous, see 5.2).
- **TCP/Unix sockets/WebSocket** exist: `zinc:socket` (`docs/plugins/socket.md`), non-blocking, poller-driven, requires
  `net` + `process`. So LSP over TCP is possible today. [verified]
- Plugin system: `plugins/<name>/plugin.json`; `kind: module` = Zinc `index.ts` + optional native C++
  (`native/<name>.spec.ts`, `<name>.<target>.cpp`, `.sim.ts`), vendored `.c` sources compile into a separate static lib
  (`docs/plugins.md` "plugin.json", `sources`/`pkg`/`libs`); availability per target (Z5003). [verified] That is
  exactly the shape a vendored tree-sitter needs.
- Engines: the same app should run native / Zinc VM / QuickJS, with sim on node; "full UI pending" for VM and QuickJS
  (`docs/engines.md`). Any editor core in `lib/std` written in Zinc TS inherits all engines; a native-only core does
  not. [verified/inferred]
- Testing: deterministic headless replay (virtual clock, recorded `HalInput` tapes with keys/text/pointer,
  `ZINC_RECORD`/`ZINC_REPLAY`, `docs/guide/06-testing.md:103-132`), `.out` conformance per resolution and number
  profile, pixel tests (`zinc test --pixels`), test hooks (`ui.pointerAt`, typed text injection at `ui.ts:2323`).
  Tapes do not carry IME composition (no such HAL field) or pen samples. [verified]

### 1.6 The compiler frontend (for section 6)

- `compiler/src/frontend.ts:128 loadProgram(entry, extra, virtual)` builds a real `ts.Program` with a custom
  `CompilerHost`, **virtual files supported** (`virtual` map, lines 131-136) and module path mapping for `zinc:*`
  (`STD_MODULES`, line 32+, plus plugin modules). It exposes `program`, `checker`, `sources`, `tsDiagnostics`.
  The type system is TypeScript's own checker (`package.json`: `@typescript/typescript6` 6.0.2 dependency, `typescript` 7.0.2 dev).
- `Sema` (`compiler/src/sema.ts`, 1244 lines) and HIR (`hir.ts`, 1028) are lowerings **on top of** the TS checker; their
  locations are per-node `{file, line, column}` (`hir.ts:173 location()`), not ranges. `ZincError` carries one `Diag`
  and `guard()` (`cli.ts:225-230`) aborts on the **first** Zinc error (Z-codes); `zinc check` prints `[]` on success
  (`cli.ts:1102-1108`). So today: TS diagnostics as a list, Zinc-specific diagnostics one at a time, no ranges
  (start only), no incremental program. [verified]

## 2. Lessons from real editors [web unless marked]

| Editor | Text model | Lessons for Zinc |
|---|---|---|
| **Zed** | Rope as a B+ "SumTree" with per-node summaries (length, lines, UTF-16 length) giving O(log n) seek in any dimension, ref-counted immutable nodes so background threads take snapshots; buffer is CRDT-based (`text::Buffer`), `language::Buffer` adds syntax tree + diagnostics, `MultiBuffer` composes excerpts; `SyntaxMap` supports injections; `lsp` crate is the client | Summaries are the trick: keep utf8/utf16/line counters in every node so LSP position conversion is cheap. Snapshots enable background parse/highlight. CRDT is only needed for collaboration: skip. |
| **Xi** | Rope + CRDT + separate frontend/core/plugin processes, JSON IPC | Retrospective: async is a complexity multiplier; process separation made scrolling take months; CRDT overreach; plugin interface too coupled to highlighting; no platform toolkit rendered text fast enough. **Keep the core in-process with the UI**, keep LSP/tree-sitter async but behind narrow snapshot-based interfaces. |
| **VS Code / Monaco** | Was `ModelLine[]` (40-60 B/line, 35 MB file = 600 MB); since 1.21 a **piece tree**: piece table + red-black tree + cached line breaks; the team tried C++ and dropped it because JS/native boundary crossings cost more than they saved | A piece table wins for open speed and memory on huge files; but per-call boundary cost dominates when an API is chatty. Zinc compiles TS to C++ AOT (no boundary) on native, but the VM/QuickJS engines have one: keep hot loops inside one module. |
| **CodeMirror 6** | Immutable state; **transactions** (changes + selection + effects) are the only way to change state; selections are a sorted set of ranges with a primary one; viewport-only rendering with height map; extensions via facets | Best model to copy for API: `State`, `Transaction`, `ChangeSet` (mappable), `Selection` ranges auto-merged. Old and new state coexist, which makes undo, async results (LSP responses mapped through later changes) and headless tests trivial. |
| **Helix** | Ropey rope; `Selection` of `Range{anchor, head}` as the core primitive; OT-like `Transaction` invertible for undo, selections and marks mapped across a transaction; undo tree; tree-sitter highlighting (the stock `tree-sitter-highlight` is not incremental, so they built `tree-house`); built-in LSP | Same model as CM6. Highlighting must reuse the old tree with `ts_tree_edit`; do not call stock high-level highlighter per frame. |
| **Kakoune** | Multiple selections are the engine; every command applies to every selection; oriented inclusive ranges | Design the command layer as "for each range" from day one. Multi-cursor is not a feature layered on later; retrofitting is where editors hurt. |
| **Lapce** | Rope (xi-rope lineage), tree-sitter, wgpu render, `lapce-proxy` process to talk to LSP/FS locally or remotely | The proxy split exists for remote dev; for a local-first Zinc editor, spawn servers directly. |
| **Neovim** [bg] | Line-array buffer (memline/B-tree blocks), extmarks for decorations, tree-sitter + LSP built in, semantic tokens as highlight overlay | Extmarks (ranges that follow edits) are the general decoration primitive. `setMarks` today takes absolute offsets and is replaced wholesale on every change; it needs anchors that move with edits. |
| **Ropey / crop** [bg] | Rust rope crates; ropey tracks chars and line breaks (UTF-8 storage, chunk ~ 1 KiB leaves) | Leaf chunk size ~1 KiB, counters for bytes/chars/utf16/lines. Implementable in ~600 lines of Zinc. |

Text-shaping [bg]: CoreText (macOS), HarfBuzz+FreeType (Linux, portable, MIT-licensed HarfBuzz), Pango on top of HarfBuzz.
AccessKit [web]: Rust with C bindings, adapters for Windows UIA, macOS NSAccessibility, Linux AT-SPI, Android; supports
single and multi-line text edit controls. Only relevant later (see 4.6).

Tree-sitter [web]: MIT, runtime is pure C and dependency-free, designed to be embedded, incremental parsing
(`ts_parser_parse` with the old edited tree), robust to syntax errors, "fast enough to parse on every keystroke".
Grammars are C (`parser.c` [+ `scanner.c`]) files generated per language [bg]; each grammar is 100 KB to several MB of
C source; queries (`highlights.scm`) are s-expression files [bg].

LSP 3.17 [web]: JSON-RPC 2.0 with `Content-Length` header (bytes, UTF-8); `initialize` handshake gates all other
requests; incremental `textDocument/didChange`; positions are UTF-16 code units by default and 3.17 adds
`positionEncoding` negotiation (UTF-8, UTF-16 mandatory, UTF-32); semantic tokens, inlay hints, workspace folders as
capabilities. Servers: typescript-language-server and pyright need `--stdio`, **rust-analyzer must not get `--stdio`**
(exits with code 2), clangd takes no flag [web, one issue-tracker source; confirm before hard-coding].

## 3. Design for Zinc

### 3.1 Where does the editor live? Native vs Zinc TS

Recommendation [inferred]: **write the editing core in Zinc TypeScript** as a new std module (`lib/std/editor/` exposing
`zinc:editor`), not in C++.

- Zinc compiles to C++ AOT, so on the native engine there is no boundary and the code is compiled; VM and QuickJS
  engines run the same source. A C++ core would fork the engines (VS Code's lesson on boundary cost applies to the VM and
  QuickJS engines) and would need `.sim.ts` twins for the node sim (ADR 0010 module rule, `docs/plugins.md`).
- Native is needed only where Zinc cannot: **tree-sitter** (vendored C), **text shaping** (later), process/socket I/O
  (already there), OS IME/clipboard (already in HAL, needs preedit fields).
- Performance risk: PERF.md says Zinc is ~13x QuickJS geomean but string/Map-heavy kernels benefit least (2.1x on strings,
  `docs/reports/PERF.md:101-119`). The core therefore must **not** be string-slice based: use typed arrays/chunks and
  integer offsets, never concatenate the document.

The existing `<textarea>` stays as the small-form field. The new component is a distinct node kind or a canvas-backed
widget. Two options:

- (A) New engine node `EDITOR` painted by new `paintEditor` in `ui.ts`, reusing scroll physics, focus, key routing,
  IME hook and marks painting. Pro: input/IME/scroll/focus for free. Con: `ui.ts` is already 2843 lines.
- (B) A widget drawn with `gfx` inside a `<canvas onDraw>` plus key/pointer handlers in a std module. Pro: isolated,
  no ui.ts growth. Con: must re-implement focus/IME/clipboard glue and scroll physics.

Recommend (A) with the model in `lib/std/editor/*` and only the painter/input glue in `ui.ts` (or a sibling
`lib/std/ui-editor.ts` imported by `ui.ts`). [inferred]

### 3.2 Data model: piece table vs rope

Choose a **B-tree rope with summaries** (Zed/Ropey style), not a plain piece table [inferred, informed by 2 above]:

- Leaves ~1 KiB UTF-8 chunks; node summary = {bytes, utf16, lines, maxLineUtf16?}. Conversions offset <-> (line, col) <->
  utf16 are O(log n). This one structure serves editor coordinates, LSP UTF-16 positions, and tree-sitter byte offsets
  (tree-sitter wants byte offset + (row, column-in-bytes) in `TSInputEdit`).
- Snapshots are cheap (persistent nodes): tree-sitter reparse, LSP `didChange` diffing, search and highlighting can run on
  a snapshot, and undo restores by structure sharing (no more 100 full-string snapshots).
- Piece table (VS Code) is comparable for editing but its line/offset queries need the RB-tree anyway; the rope gives
  the same complexity with simpler snapshots. Gap buffer is best for a single caret and worst for multi-cursor and
  snapshots, so rejected.
- Since Zinc strings are UTF-8 with O(offset) non-ASCII indexing (`docs/ui.md:66`), the rope must operate on **bytes**
  with explicit counters and never call `charCodeAt` on a big string. Needs byte-level string API in zinc (check
  `zinc:web`/string ABI; an `Uint8Array` chunk with a utf8 decoder is fine). [inferred]
- ~1500 lines of Zinc; 2-3 ew including property/fuzz tests against a naive string model (fuzz infra exists:
  `tests/fuzz`).

### 3.3 Selection model, transactions, undo

Copy CodeMirror 6 + Helix [web]:

- `Range {anchor, head, goalColumn}`; `Selection` = sorted, non-overlapping array + `primary` index; normalize merges
  overlapping ranges (same as CM6 and Kakoune). All commands are `(state, range) -> change`, applied to every range. [inferred]
- `ChangeSet` = sequence of retain/insert/delete over the old document, composable, invertible, and able to **map**
  positions (selections, marks, diagnostics, LSP ranges, tree-sitter edits). One `Transaction` = ChangeSet + new selection
  + metadata (user event, "typing" coalescing key, `addToHistory`).
- Undo: **history tree** (Vim/Helix style) rather than linear stacks. Store inverted ChangeSets + selection before/after;
  linear undo/redo is a walk; "earlier/later" and branch navigation are cheap extras. Group by time (~500 ms) and event kind
  like CM6. A tree costs little more than two stacks.
- Marks/decorations: `RangeSet` of anchored ranges mapped through ChangeSets (extmark-like). The current
  `setMarks(h, flat i32[])` is replaced by `setDecorations(layer, rangeSet)`, layers for search, diagnostics, brackets,
  semantic tokens, LSP document highlights, inline hints.
- Code folding = a decoration kind that hides line ranges (fold ranges from tree-sitter `folds.scm` or indentation);
  handled in the layout layer (3.4). Bracket matching = tree-sitter node pairs when a tree exists, else the current scan.
  Comment toggle, auto-indent, snippets (`$1`, `${1:placeholder}`, mirrored tabstops as multi-selection sets),
  and find/replace are all transaction producers.
- Find/replace with **regex**: Zinc has no regex engine documented. Check `zinc:web` (`docs/guide/09-web-apis.md`) before
  choosing; otherwise embed a small non-backtracking regex (RE2-style Pike VM ~600 lines) run chunkwise over the rope,
  or vendor `tiny-regex`/`SLRE`-class C (needs UTF-8 and lookaround limits documented). [inferred; regex support not verified in this repo]

### 3.4 View model, layout and rendering

Today `ensureRows` re-lays out everything on any change (`ui.ts:1153`). Replace with:

- A **height map / line-layout cache** keyed by line index and mapped through ChangeSets: wrapped-row count per
  line, x-advance cache per line (or per chunk), invalidated only for touched lines and on width change. Row lookup by
  binary search over a Fenwick/sum tree instead of `rowOf` linear scan (`ui.ts:1185`). Folded ranges are 0-height entries.
- **Display map pipeline** (Zed): buffer coords -> fold map -> tab map -> wrap map -> inlay map -> display rows.
  Inlay hints and folds are just transforms in this chain. Start with fold + wrap only. [web/inferred]
- Only visible rows are shaped and painted (as now). Keep the per-frame slicing but slice rope leaves, not a string.
- Glyph cost: `textWidth` per character is the bottleneck for hit testing. Add a per-font monospace fast path
  (advance = constant; detect from `hmtx`) so column<->x is arithmetic; keep the measured path for proportional fonts.
  This alone covers >95% of code editing use. [inferred]
- Minimap: keep the lazy canvas but feed it line token summaries from the tree-sitter highlight cache instead of re-lexing.
- Split panes: view state (scroll, selection set, folds) is per *view*, document state (rope, history, tree, diagnostics)
  is per *buffer*; two views on one buffer share one history. Tabs/panes are plain Zinc UI (already demonstrated by
  zed-editor `Tabs.tsx`, `workspace.ts`), so a pane tree component is app-level (1-2 ew), not engine work.
- Minimal display of large files: rope + line index means opening 100 MB is a read into chunks plus a newline scan;
  render never touches non-visible text. Memory ~1x file size. Mark **read-only huge-file mode** (no tree-sitter above a
  size limit, e.g. 5 MB, as Helix/Zed do [bg]).

### 3.5 IME/composition, bidi, shaping, clipboard, a11y

- **IME**: needs HAL work. SDL3 delivers `SDL_EVENT_TEXT_EDITING` (preedit text + selection start/length) [bg]; add
  `HalInput.preedit` and `hal_text_input` rect updates per caret move (already partly there, `hal_sdl.cpp:415`). The
  editor holds a "composition range" not committed to the rope, drawn underlined; commit replaces it via one transaction.
  On the wasm HAL: `compositionstart/update/end` on a hidden textarea [bg]. Tapes must gain a preedit field to stay replayable
  (`docs/guide/06-testing.md:132` lists gaps). ~1.5-2 ew.
- **Shaping and bidi**: the rasterizer has no GSUB/GPOS/bidi (see 1.3). Options ranked: (1) monospace Latin/code
  editing only, document the limit (MVP); (2) add kerning-free **fallback fonts + grapheme clustering + double-width CJK**
  (`wcwidth`-style tables, ~1 ew); (3) vendor HarfBuzz (MIT, C++, ~1.5 MB source; add to a `zinc:text` plugin, `sources`)
  plus a UBA implementation (`fribidi` is LGPL, so prefer ICU-less small implementation or SheenBidi, Apache-2.0 [bg]) for
  real bidi/Indic/Arabic; needs the rasterizer to draw by glyph id instead of codepoint (`ttf.cpp:236 slot(cp)`). 6-10 ew and
  is the biggest single unknown; do not put it on the critical path for a *code* editor.
- **Clipboard**: text works; add multi-cursor clipboard (one entry per cursor pasted round-robin, VS Code/Helix behaviour),
  line-wise cut/copy when selection empty, and `paste-and-indent`. Rich types unnecessary. 0.5 ew.
- **Accessibility**: AccessKit C API [web] would give AT-SPI/UIA/NSAccessibility; needs a semantic tree from `ui.ts` nodes,
  which does not exist. Post-1.0 milestone; state as a known gap.

## 4. Syntax highlighting

### 4.1 Recommendation: tree-sitter as a vendored native plugin `zinc:treesitter`, lexer fallback stays

- `plugins/treesitter/plugin.json` `kind: module`, `sources: ["vendor/lib/src/lib.c", ...]` (tree-sitter's runtime
  compiles as one C file, `lib/src/lib.c` [bg]) plus per-language grammar folders compiled only if imported/configured
  (`plugins.treesitter.languages: ["typescript","json","css","cpp","rust","markdown"]` via plugin `options`, which C++ sees
  as `ZP_TREESITTER_*` defines, `docs/plugins.md` table). C sources go in the separate C static library (documented for `.c`).
- Native spec (`native/treesitter.spec.ts` + `treesitter.<target>.cpp`): `createParser(lang)`, `parse(handle, chunks)`,
  `edit(handle, startByte, oldEndByte, newEndByte, points...)`, `reparse(handle)`, `query(handle, name, byteRange)` returning a
  flat `i32[]` of `[captureId, startByte, endByte]` for a byte range (visible rows only) so the boundary is crossed once per
  frame; tree lifetime as an opaque resource (spec ABI supports resources, `docs/engines.md`).
- Fit with existing constraints: MIT license (compatible; add to `docs/licenses.md`); C only, no allocator surprises (tree-sitter
  lets you override `ts_set_allocator`; hook to `zrt` heap); no exceptions/RTTI issue since C. Excluded targets: esp32/ps1/ps2
  (like `zinc:socket` `requires`), sim via **web-tree-sitter (wasm)** or node `tree-sitter` in a `.sim.ts` twin. [inferred]
- Highlighting pipeline: on transaction, translate ChangeSet to `TSInputEdit`s, `ts_tree_edit`, schedule reparse (timer, ~1-5 ms
  budgets; parse with `TSParseOptions` progress callback for cancellation [bg]), then run the highlight query over the visible
  byte range plus margin; cache capture runs per line, invalidate through `ts_tree_get_changed_ranges`. Injections
  (markdown fences, TSX-in-HTML, CSS-in-JS) as in Zed `SyntaxMap` [web]; do in a second pass.
- Same tree drives: fold ranges, bracket matching, indent (`indents.scm`), "select parent node", comment markers by language
  config, sticky scroll, outline.
- Grammar distribution: each `parser.c` is large; committing generated parsers for ~8 languages adds tens of MB to the repo
  [bg, estimate]; alternative: build them lazily on `zinc plugins` install into a cache. Zinc grammar itself: TypeScript grammar
  covers `.ts/.tsx` (Zinc source is TypeScript), so no new grammar for the Zinc language. [inferred]

### 4.2 Alternatives

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Keep and extend the hand-written incremental lexer (`syntax.ts`, per-line state) | Already works, ~0 native code, incremental by construction if restarted from edited line with cached states | Lexical only: no folds, brackets by structure, scopes, indent queries; every new language = hand-work | Keep as fallback and for huge files; fix "recompute from line 0" (`document.ts:52`) by keeping `states[]` and re-lexing from the edited line until state converges |
| TextMate grammars (Oniguruma regex, `.tmLanguage.json`) | Huge grammar ecosystem (VS Code themes/grammars) | Needs Oniguruma (C, BSD) + scope engine; line-by-line, not incremental past line state; no tree | Only if VS Code theme compatibility is required; skip |
| Semantic tokens (LSP) | Correct by type info | Latency, needs a server; overlay only | Add as overlay layer after LSP (5.4) |
| Tree-sitter | Incremental, error tolerant, queries for folds/indents/brackets, many grammars | Native dep, grammar size, query tuning | **Chosen** |

Effort: plugin + TS/JSON/CSS/C++/Rust/Markdown highlighting, folds, brackets: 4-6 ew. Injections + indent queries: +2 ew.

## 5. LSP client

### 5.1 Placement: `zinc:lsp` as pure Zinc TS on top of `zinc:process` and `zinc:socket`

No new native code is required for stdio transport [verified from 1.5], only hardening (5.5). Layers:

1. **Transport**: `StdioTransport(cmd, args, {cwd, env})` using `proc.spawn` + `onData`; `TcpTransport(host, port)` using
   `zinc:socket connect`. Interface `{send(bytes), onBytes(cb), close()}`.
2. **Framing**: parse `Content-Length: N\r\n\r\n` + N **bytes**. `onData` delivers chunks of UTF-8 without splitting sequences
   (`docs/plugins/process.md:30`) but as strings, so length must be computed in UTF-8 bytes (`String.bytes()` exists in the
   runtime, `gfx.cpp:796` uses `s.bytes()`; expose it or add a byte-level API). Robust rule: keep an accumulation buffer of
   bytes, never trust `string.length`. Add `p.onBytes(cb: (Uint8Array)=>void)` to `zinc:process` if strings prove lossy.
3. **JSON-RPC**: request ids, pending map `id -> Promise`, notifications, server-to-client requests (`workspace/configuration`,
   `client/registerCapability`, `window/workDoneProgress/create`, `workspace/applyEdit`) with mandatory replies, `$/cancelRequest`,
   `$/progress`. Requires a JSON parser/serializer: `JSON.parse/stringify` availability in Zinc for dynamic shapes must be
   confirmed (`docs/guide/09-web-apis.md`; `DYN` types exist in `hir.ts:30`). [inferred; not verified]
4. **Session**: capability negotiation, `initialize`/`initialized`, `shutdown`/`exit`, restart with backoff, one server per
   (language, workspace root), multi-root via `workspaceFolders` and `didChangeWorkspaceFolders`.
5. **Document sync**: ChangeSet -> `contentChanges` incremental ranges (needs the rope's utf16 line/col summaries), version
   counters, debounce for diagnostics-relevant flushes; request `positionEncoding: utf-8` when the server supports it (clangd,
   rust-analyzer do [bg]) and fall back to utf-16.
6. **Feature adapters** (each maps a response into editor concepts):

| Capability | Editor surface | Notes |
|---|---|---|
| publishDiagnostics / pull diagnostics | squiggle layer, gutter, problems panel | anchor ranges, remap through later ChangeSets |
| completion (+resolve, trigger chars, snippets) | popup component, snippet transaction | `insertTextFormat=2`, `additionalTextEdits` |
| hover, signatureHelp | tooltip overlay (`overlays.tsx` in kit) | Markdown subset renderer needed |
| definition / typeDefinition / references / rename (prepareRename, WorkspaceEdit) | goto (opens tab), references panel, multi-file edit transaction | WorkspaceEdit across unopened files needs an edit-on-disk path with undo |
| formatting, rangeFormatting, onTypeFormatting | transaction from TextEdit[] | apply as a single undo step, mapped selections |
| codeAction | lightbulb menu | commands executed via `workspace/executeCommand` |
| semanticTokens (full/delta/range) | highlight overlay above tree-sitter | legend decoding, delta apply |
| inlayHint | display-map inlay transform | needs layout support (3.4) |
| documentHighlight, documentSymbol, foldingRange, selectionRange | occurrences layer, outline, fold source | |
| workspace symbols, file watching | palette, `didChangeWatchedFiles` | needs an fs watcher; today `zinc:fs` has none [unverified] |

### 5.2 Spawning servers

- typescript-language-server: `npx typescript-language-server --stdio` (or a resolved `node_modules/.bin`), TS needs a
  `tsserver.path` (`initializationOptions`); clangd: `clangd` (uses `compile_commands.json`; Zinc's build dir may need to
  emit one for Zinc C++ output), rust-analyzer: `rust-analyzer` with **no** args; pyright `pyright-langserver --stdio` [web].
- Server table in a JSON config (`languages.json`): `{id, extensions, command, args, rootMarkers, initializationOptions}`.
- Environment: the app runs sandbox-free on host targets (`docs/guide/08-security.md` threat model: process plugin is
  program-trusted). Editor should spawn servers with `cwd` = workspace root, stderr routed to an output panel.
- Requirement: `PATH` resolution of `node`/`npx` for GUI-launched apps on macOS, where PATH is minimal; add an
  explicit login-shell `PATH` probe (`sh -lc 'echo $PATH'`). [bg/inferred]

### 5.3 Async I/O integration with the event loop

Events are delivered from the loop by `zrt::Poller` (`docs/plugins/process.md`; `docs/plugins.md` "Core services") so LSP
callbacks run on the UI thread between frames. Rules: parse large JSON responses (completion lists, semantic tokens can be
MBs) in slices or on a worker if Zinc offers threads (not documented; else chunk with `queueMicrotask`/timers so a 5 MB reply
does not drop frames); cap message size; never block the frame on a response, use debounced requests with cancellation
(generation counters, as `zed-editor/src/app/tools.ts` already does for `check`). [verified pattern]

### 5.4 ABI additions and hardening needed (list)

1. `zinc:process`: non-blocking `write` with a queue and a `onDrain`/writable event (today it blocks at 64 KiB,
   `docs/plugins/process.md:54`); LSP `didOpen` of a large file can exceed 64 KiB while the server is busy (deadlock with a
   server that writes while we write, a classic).
2. Binary-safe I/O: `onBytes`/`writeBytes` (or expose UTF-8 byte length and byte slicing).
3. Optional PTY for the terminal panel: `spawnPty(cmd, args, {cols, rows})` with `openpty`/`forkpty`, resize (`TIOCSWINSZ`),
   plus a VT100/xterm parser (the panel today only strips SGR, `tools.ts:parseAnsi`). 3-4 ew (parser is the bulk; no PTY code
   found: `grep -rn "pty|forkpty|openpty" runtime plugins` empty).
4. Process exit/`kill(SIGTERM)` semantics and process group kill (language servers spawn children; `kill` must reach them).
5. A file watcher (FSEvents/inotify) for `didChangeWatchedFiles`, and a `zinc:fs` recursive glob/ignore-aware walk for workspace
   symbols. [inferred; unverified whether `zinc:fs` has these]
6. Environment/`PATH` inheritance as above.
7. `String.bytes()`/`byteAt`/`sliceBytes` in the string API used by the rope and by framing.

### 5.5 Effort

MVP client (stdio, framing, sync, diagnostics, hover, definition, completion popup, formatting): **4-5 ew**; the rest
(references, rename, code actions, signature help, semantic tokens, inlay hints, folding/selection ranges, workspace folders,
progress UI): **+5-6 ew**; ABI hardening: **+1.5 ew**. Test with a scripted fake server (Zinc program that speaks LSP on
stdio) plus a real `typescript-language-server` in CI-optional tests.

## 6. A Zinc language server (`zinc lsp`)

### 6.1 Feasibility

Because Zinc source is TypeScript and Zinc's semantic model is the **TS checker plus Zinc lowering** (1.6), the cheapest
correct design is layered [inferred]:

1. **Base layer = the TypeScript language service** (not tsserver as a process): construct `ts.createLanguageService`
   with a `LanguageServiceHost` reusing the options and module resolution from `frontend.ts` (`STD_MODULES`, plugin `paths`,
   `PLATFORM_FILE` virtual file, `webGlobals`, `platformVariant`, `frontend.ts:128-208`). That yields hover with inferred
   types, definitions (including through `zinc:*` modules to `lib/std/*.ts` and `plugins/*/index.ts`), references, rename,
   completion, signature help, quick info, organize imports, semantic classification, inlay hints, for free and incrementally.
   This is more capable than building a checker from `sema.ts`; the frontend exports only the whole-program `loadProgram`
   today, so refactor it to expose the compiler options/host builder (small, ~0.5 ew).
2. **Zinc overlay diagnostics**: run `Sema` (Z-codes: unsupported types/ops for the selected profile, integer/float
   profile warnings, `Z5003/Z5004/Z5005` plugin/target availability) on demand for the entry graph and merge with TS
   diagnostics. Needs: (a) `Sema` collecting **all** `ZincError`s instead of throwing on the first (`guard`, `cli.ts:225`;
   HIR already converts errors inside statements/expressions to `opaque` nodes with the code text, `hir.ts:177,329`, so
   partial recovery exists) (b) diagnostics with ranges (`SourceLocation` has only start; `hir.location()` uses `getStart`;
   add `end`). (c) Per-target profile choice: `zinc.json` `targets` / initializationOptions `target`, `profile`, `noFloat`.
3. **Zinc-specific intelligence**: hover shows the *lowered* type (numeric kind: `f64`/`i32`/`fx12`, from `NumKind` `sema.ts`/`hir.ts:6`,
   `infer.ts` `zinc infer --write` proposes numeric annotations); code actions "apply inferred numeric types"; go-to-definition
   through **declaration identities** (used by the VM linker, `docs/engines.md` "Declaration identities") for re-exports and
   aliases; virtual JSX/CSS class diagnostics (`css.ts`, `styles.ts`, `ui-style.ts`: unknown utility classes such as
   `w-[300]`), plugin-aware completion of `zinc:*` module imports, `zinc.json` schema validation.
4. **Transport**: implement in Node (the compiler is Node TS: `compiler/bin/zinc.mjs`), using `vscode-languageserver` (MIT) or a
   200-line hand-rolled JSON-RPC over stdio; entry `zinc lsp --stdio` added next to `cmd === 'ui'` in `cli.ts:1073`.
   Incremental document sync with the language service host `getScriptSnapshot` on unsaved buffers (virtual files).
5. Performance: TS language service holds one program per project; Zinc's std `ui.ts` is 2843 lines and the kit is large, so the
   first check is seconds, later ones incremental. `@typescript/typescript6` is what the compiler uses (`package.json`);
   the dev dependency is TS 7 (native port). Pick one version and keep the LS on the same one the compiler uses so hover
   and diagnostics agree with `zinc check`. [verified from package.json / inferred for the risk]

Alternative: forward to `typescript-language-server` and add only the overlay (Z-code diagnostics + hover addendum) as a
second server (LSP allows several servers per language; the editor merges). Simpler and immediately usable in the
editor, but loses Zinc target awareness in module resolution. Suggested as **step 0** of the LSP milestone: it proves the
client with a real server while `zinc lsp` is written.

### 6.2 Effort

`zinc lsp` with TS language service base + target-aware diagnostics (first error only): **2-3 ew**; collect-all Sema
diagnostics with ranges: **+2 ew**; Zinc-specific hover/actions/CSS-class intelligence: **+2 ew**. Written in Node, works in
VS Code and Zed too, which is a distribution win independent of the Zinc editor.

## 7. DAP and terminal

- **Terminal panel**: exists for output (`Terminal.tsx`, 47 lines). A real terminal needs PTY + VT parser + cell grid renderer
  (fixed-width cell canvas, scrollback ring, selection, bracketed paste, alt screen). 4-6 ew total. Recommend deferring behind
  LSP: run tasks still work with today's panel.
- **DAP** [bg]: JSON-RPC-like protocol with the same `Content-Length` framing, so the LSP transport/framing layer is reused
  as is; adapters (`codelldb`, `lldb-dap`, `node --inspect` bridges). UI needs breakpoints gutter (a `MARK_GUTTER` kind exists,
  `ui.ts:1558`), variables/callstack panels. Zinc VM/QuickJS engines have no debug protocol; the native engine could be debugged
  through lldb/dap. 4-6 ew after the LSP is stable; low priority. Do not design it now beyond keeping the transport generic.

## 8. Test strategy

Assets that already exist [verified]: headless deterministic replay with virtual clock, `.out` goldens per resolution/number
profile, pixel tests, test hooks for pointer/keys/typed text, conformance for `code_editor.tsx`, fuzz directory, and the
engines matrix (`tests/engines/run.mjs`) to check the same app on native/VM/QuickJS.

Add:
1. **Model tests without UI**: rope vs naive string differential fuzz (random edits, offsets, utf16 counts, non-ASCII),
   ChangeSet compose/invert/map properties, undo tree walk = original, multi-range command results (`tests/editor/*.ts`).
   Run on sim + native + VM to catch engine drift.
2. **Scripted key tapes** for behaviours: multi-cursor typing, paste round-robin, auto-indent, comment toggle, snippet tabstops,
   fold/unfold, find/replace, undo-redo across cursors; assert on `getValue`/`selections` dumps in `.out`.
3. **Pixel tests** for caret/selection/gutter/squiggle rendering at 1x and 2x (existing `--pixels`).
4. **IME**: extend `HalInput` with preedit so tapes can replay composition; until then unit-test the composition state machine.
5. **LSP**: a fake server (Zinc or node) with recorded transcripts (request/response fixtures) to verify framing, id
   correlation, cancellation, position mapping through concurrent edits; contract tests against real `typescript-language-server`
   opt-in; golden tests for `zinc lsp` responses (hover/definition/diagnostics JSON) run in `zinc test`.
6. **Perf gates**: extend `ZINC_DEMO=scroll` to a 100 MB file, 10k-line files, and multi-cursor (1000 cursors) typing; record in
   `docs/reports` next to existing engine JSON reports; budgets: keystroke <= 2 ms at 100k lines, open 100 MB <= 1 s, scroll >= display rate.
7. **Tree-sitter**: golden highlight dumps per language for fixtures; incremental vs full reparse equivalence fuzz.

## 9. Roadmap and estimates [inferred]

| # | Milestone | Content | Effort |
|---|---|---|---|
| M1 | Editing core (MVP) | rope + summaries, Selection/ChangeSet/Transaction, undo tree, single view, layout cache (mono fast path), keep lexer highlighting, clipboard, tabs/panes reuse from zed-editor; new `EDITOR` node in ui.ts; migration of zed-editor to it | 7-9 ew |
| M2 | Multi-cursor and editing commands | multi-selection commands, add-cursor-above/below/next-occurrence, column select, comment toggle, auto-indent/auto-close/surround, snippets, find/replace with regex, folding (indent-based), sticky selection UX | 4-5 ew |
| M3 | Tree-sitter | `zinc:treesitter` plugin, incremental parse, highlight/fold/bracket/indent queries, 6 languages, sim twin | 5-7 ew |
| M4 | LSP client | see 5.5; stdio first, typescript-language-server, then clangd/rust-analyzer | 9-12 ew (incl. ABI hardening) |
| M5 | Zinc LSP | see 6.2 | 4-7 ew |
| M6 | IME + polish | preedit in HAL and editor, minimap on tree tokens, huge-file mode, split panes polish, a11y decision | 3-4 ew |
| M7 | Terminal (PTY) / DAP | 4-6 ew each | optional |
| M8 | Shaping/bidi | HarfBuzz plugin + bidi + fallback fonts | 6-10 ew, optional |

Total for a solid, LSP-capable code editor (M1-M5 + M6): about **32-44 ew**, roughly 8-10 months for one engineer, 4-5 months
for two after M1. Milestones M2 and M3 can run in parallel after M1; M4 needs M1's utf16 position mapping; M5 is independent of
the editor (Node only) and can start on day one as a standalone tool for VS Code/Zed, which de-risks the demand side.

### Minimal "real editor" bar (my proposal)

Not a real editor until all of these hold: multiple cursors/selections and every command applies to all; undo tree with
selection restore; open and scroll a 50 MB file without stalls; regex find/replace; auto-indent, comment toggle, bracket
match/auto-close; incremental structural highlighting; at least one language server giving diagnostics, completion,
hover and go-to-definition; keyboard-only operation; correct IME commit and composition display; unsaved-changes safety.
Everything else (bidi shaping, DAP, PTY terminal, a11y tree, minimap) is v2.

## 10. Risks

1. **Zinc string/UTF-8 cost model**: any accidental `charCodeAt` on large strings is O(n) (`docs/ui.md:66`). Mitigation: byte-oriented
   rope API, lint rule/test that fails when the core imports string index helpers on documents.
2. **Text shaping absence** (`ttf.cpp`) limits i18n; monospace Latin/CJK-width is fine for code, but users editing Arabic/Hebrew
   comments will see wrong output. Document; plan M8.
3. **Native plugin size and portability**: grammar C sources are large; build times on `rpi1`; excluded targets need graceful
   errors (Z5003).
4. **Engine parity**: VM/QuickJS UI is "pending" (`docs/engines.md`), so the editor only targets the native engine + sim at
   first; running the core-model tests on all engines keeps the door open.
5. **`zinc:process` write blocking** can freeze the UI during large `didOpen` to a busy server; must be fixed before LSP ships.
6. **LSP position encoding mismatches** (UTF-16 vs bytes) are the number one source of bugs; keep utf16/byte/line summaries in
   the rope and fuzz conversions.
7. **Scope creep in a `ui.ts` of 2.8k lines**: keep the new editor in separate files (`lib/std/editor/*`) and a narrow glue API.
8. **Zinc LSP** depends on Sema recovery (first-error-only today) and on TS version alignment (`@typescript/typescript6` vs TS 7).
9. **Terminal/DAP** are large, separable projects; do not let them block editing/LSP.
10. **Unverified in this study**: whether Zinc has a regex engine, `JSON.parse` into dynamic values with acceptable speed,
    threads/workers, an fs watcher, byte-level string APIs. Each needs a 1-day spike before M1/M4 estimates are firm.

## Sources

Repo files (all under `/Users/mowmow/Lab/zinc`): `lib/std/ui.ts`, `docs/ui.md`, `examples/zed-editor/README.md` and `src/**`,
`tests/conformance/code_editor.tsx`, `runtime/ttf.cpp`, `runtime/gfx.cpp`, `targets/macos/hal_sdl.cpp`, `docs/plugins.md`,
`docs/plugins/process.md`, `docs/plugins/socket.md`, `docs/engines.md`, `docs/guide/06-testing.md`, `docs/reports/PERF.md`,
`docs/reports/gpu-renderer-design.md`, `compiler/src/{frontend,sema,hir,cli}.ts`, `package.json`.

Web (fetched or searched 2026-09-30):
- Zed Decoded: rope and SumTree: https://zed.dev/blog/zed-decoded-rope-sumtree
- Zed architecture summaries: https://deepwiki.com/zed-industries/zed/4.3-buffer-architecture , https://deepwiki.com/zed-industries/zed/13.2-crdt-and-buffer-synchronization
- VS Code text buffer reimplementation (piece tree): https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation
- CodeMirror 6 system guide: https://codemirror.net/docs/guide/
- xi-editor retrospective: https://raphlinus.github.io/xi/2020/06/27/xi-retrospective.html
- Xi rope science / CRDT: https://xi-editor.io/docs/rope_science_08.html
- Helix architecture: https://github.com/helix-editor/helix/blob/master/docs/architecture.md ; tree-house: https://github.com/helix-editor/tree-house
- Kakoune/Helix selection model: https://phaazon.net/blog/more-hindsight-vim-helix-kakoune
- Lapce architecture: https://docs.lapce.dev/development/architecture
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- LSP 3.17 specification: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- Server flags (rust-analyzer vs --stdio): https://github.com/hyperion2144/dsh-hashline-edittool/issues/135 (single issue source, confirm)
- AccessKit: https://accesskit.dev/how-it-works/ , https://crates.io/crates/accesskit


---

<!-- source: studio-as-zinc-app.md -->

# Should the desktop IDE ("Studio") itself be a Zinc app? Coherence, gaps, plan

Date 2026-09-30. Read-only study of `/Users/mowmow/Lab/zinc` (dirty tree, nothing modified). Follows
[README.md](README.md) and [docker-free-studio.md](docker-free-studio.md), which proposed a Tauri 2 shell around the Node CLI.
Legend: **[V]** verified by reading the repo (file:line), **[W]** web / general knowledge of a third-party API, **[I]** my inference or estimate. Effort in person-weeks (pw), one engineer who knows the codebase, unvalidated.
Parallel studies cover the editor component and JS engines; this report only takes their questions as interfaces.

---------------------------------------------------------------------------------------------------------------------

## 0. Verdict

**Yes, it is coherent, and it is already half-done: build the IDE as a Zinc app (dogfooding), and drop Tauri.** [I, based on the [V] findings below]

1. Two Zinc apps of this exact shape exist today: `apps/studio` (2.9k LOC, `zinc:ui` + `zinc:process` + `zinc:remote` + `zinc:webview`, drives `compiler/bin/zinc.mjs`, streams build logs, previews a running app through the remote display, deploys over ssh; `docs/studio.md:6-7`, `apps/studio/src/runner.ts:1-8`) and `examples/zed-editor` (2.6k LOC: project tree, tabs, textarea-based editor with highlighting, fuzzy finder, command palette, `zinc check --json` diagnostics, terminal panel via `zinc:process`; `examples/zed-editor/README.md:1-8`). [V]
2. What the Tauri plan would give and Zinc does not is mostly the *web stack* (Monaco, an HTML docs renderer, WebSerial in the browser). What Zinc gives and Tauri does not: one runtime and one language for app, examples and IDE, ~1 MB-class binaries (hello 53-70 KiB, `docs/reports/qt-comparison.md:34`), pixel-identical rendering with golden tests, `zinc dev` hot reload of the IDE itself (`docs/dev-mode.md:8-9`), and the strongest possible proof of the platform. [V]
3. **But not for all phases and not for the browser tier.** Zinc has no Windows target, no accessibility, no IME preedit, no PTY, no serial, single window only. The honest position: **Studio v0 as a Zinc app now (macOS + Linux), Windows/a11y are the gating risks for a wide "Arduino IDE replacement" audience.** A web/PWA tier (browser mode, Tier A/B from the previous report) is a separate product surface that Zinc-native cannot serve, except by shipping the same UI as a Zinc `wasm` target (`targets/wasm/hal_web.cpp`, exists [V]) which is a research item.
4. **Self-hosting the compiler inside the app (v2) is not worth it as a goal by itself.** Keep the compiler as a child process (Node today; a bundled runtime, or later a native TS 7 `tsgo`-style binary) behind JSON-RPC. Running the TS 6 JS compiler inside QuickJS is possible in principle but is 10-30x slower and needs a virtual host; do it only if "no Node install" becomes a hard requirement and only after the QuickJS bytecode/AOT work. [I]
5. **Name:** `ZincStudio` is the box editor (`docs/studio.md:1`, `apps/studio/README.md:1`). Recommendation: keep `apps/studio` as "ZincStudio Flow" (or fold it in as a view) and call the IDE something else ("Zinc IDE", "Zinc Bench"...). [I]

When: v0 in 8-10 pw from today because both codebases exist; the platform work that makes it good (multi-window, dialogs, PTY, serial, a11y, Windows) is 30-55 pw and is *worth doing anyway* for every desktop Zinc app.

---------------------------------------------------------------------------------------------------------------------

## 1. What a Zinc app can do on the desktop today (verified inventory)

| Area | State | Evidence |
|---|---|---|
| Windowing | One SDL3 window (`static SDL_Window* win`, `SDL_CreateWindowAndRenderer` once, resizable, HIGH_PIXEL_DENSITY), fullscreen toggle (F11), kiosk, aspect-ratio lock. **No multi-window**, no menus, no dialogs, no drag-and-drop of files, no tray, no window-state persistence API. | `targets/macos/hal_sdl.cpp:11,110-117,292`; grep for `SDL_EVENT_DROP`, `ShowOpen`, `Tray`, `Menu` in that file: none [V] |
| DPI | Pixel density is read and coordinates are mapped (`SDL_GetWindowPixelDensity`, `RenderCoordinatesFromWindow`); HiDPI Retina benchmarks in zed-editor (2560x1600, 111-119 fps). | `hal_sdl.cpp:33-47,134`; `examples/zed-editor/README.md:94-104` [V] |
| Input | Keys with modifiers, typed text, mouse buttons, wheel with resampled precise scrolling, touch, cursors (10 shapes), clipboard (text only), text-input area for the IME candidate window. | `hal_sdl.cpp:180-260,415-458`; `docs/ui.md:259-269` [V] |
| IME | Committed text works, **composition preview (preedit) not done**. | `docs/ui.md:269` [V] |
| Text | Own TTF parser, Latin-centric: no kerning, bidi, font fallback, IME preedit. | `docs/reports/qt-comparison.md:26` [V] |
| Accessibility | **None** (Qt report calls it "a blocker for iOS / the EU"; an `a11y` node record is a P1 plan item, L effort). | `docs/reports/qt-comparison.md:27,85-87` [V] |
| Filesystem | `zinc:fs`: read/write text+bytes, list, `readDir`, stat/lstat, mkdir -p, rename, copy, realpath, mkdtemp, symlinks, chmod, **`watch(path, cb)`** (fs events on the event loop). Synchronous, POSIX (`<sys/stat.h>`, `<unistd.h>`). | `lib/modules.d.ts:47-93`, `runtime/mod/fs.cpp:13-14` [V] |
| Config / persistence | `zinc:storage` (key/value in `./zinc.storage` or `ZINC_STORAGE`), `zinc:os` (`homedir`, `tmpdir`, `hostname`, cpus, network interfaces). No per-OS config-dir convention. | `lib/modules.d.ts:96-101,214-242`, `docs/studio.md:108-109` [V] |
| Child processes | `zinc:process`: `posix_spawnp` + 3 pipes, line/chunk streaming, stdin write, kill, exit code, cwd/env, 32 concurrent. **Pipes only: no PTY, no terminal size, no job control.** No Windows (posix_spawn). | `docs/plugins/process.md:1-70` [V]; grep `openpty|forkpty|posix_openpt` over `plugins runtime targets`: no hit [V] |
| Networking | `zinc:net` (`fetch`, `serve`), `zinc:socket` (TCP/Unix/UDP/DNS, **WebSocket client+server RFC 6455**), `zinc:mqtt`, `zinc:osc`. LAN discovery is Zinc's own UDP multicast beacon (`ZINC1...` on 239.255.90.1:7701), **not mDNS/Bonjour**. sha256 is pure-Zinc in `lib/std/web.ts:1386`; no Ed25519/minisign seen. | `docs/plugins/socket.md:3-23`, `docs/plugins/remote.md:81`, `lib/std/web.ts:1349-1386` [V] |
| Serial / USB | **Nothing native.** Flash = host `esptool` spawned (`flash.ts`), monitor = `stty raw` + read, port discovery by regex on `/dev/cu.usbmodem*|ttyACM*|ttyUSB*`, Unix only. A Zinc app can only spawn `zinc flash` / `zinc monitor`. | `docs/boards.md:86-97`, `docker-free-studio.md` §1.3 [V] |
| Embedded web view | `zinc:webview`: **macOS only** (WKWebView over the SDL window, `zinc://` assets, `invoke`/`postMessage` bridge); Linux WebKitGTK, Windows WebView2, wasm marked "not supported yet". | `docs/plugins/webview.md:5-12` [V] |
| Embedded JS | `zinc:script`: QuickJS-ng v0.17.0 sandbox (no files/network/timers unless host exposes), ~1 MB added, macOS/Linux/rpi/rmpp. | `docs/plugins/script.md:1-30` [V] |
| Code editor | Engine textarea + code-editor extensions (`setMarks`, `setEditColors`, `setHighlightAt` per-line state, `editView`, `scrollEditTo`); zed-editor adds tabs, minimap, find, diagnostics. **One caret, no split panes, no go-to-definition** (highlighting is lexical), no LSP client. A 5006-line file: 4-5 ms per keystroke. | `docs/ui.md:51-60,269`, `examples/zed-editor/README.md:80-113` [V] |
| Terminal | Output panel with ANSI colours through `zinc:process`; no input, no PTY, no VT emulator. | `examples/zed-editor/README.md:110-112` [V] |
| Tabs, palette, tree, overlays | Kit `Tabs`, `Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, toast, focus scopes and layers; zed-editor has its own file tree (lazy, keyboard nav), finder, palette, resizable panel. No docking / general split pane component. | `docs/ui-kit.md:85-98`, `docs/ui.md:137-175`, `examples/zed-editor/README.md:60-70` [V] |
| Hot reload / dev | `zinc dev`: host (window, heap) stays, program `.so` reloaded, ~0.5-1.2 s save-to-frame, red box, CDP inspector. macOS and Linux hosts. State is **not** preserved (full reload, not Fast Refresh). | `docs/dev-mode.md:8-42,54-56` [V] |
| Targets for the app itself | `macos`, `linux` (window on hosts; for Linux the guide shows docker `zinc/sdk-linux` and fbdev/GL plugins, and zed-editor says "macOS and Linux (SDL3 window)"). **No Windows target/HAL** (`HOSTS = macos, linux, rpi1, sim, rmpp`, `native.ts:15`; `hal_posix.cpp` `SIGBUS`). | `docker-free-studio.md` §1.1, `docs/guide/01-getting-started.md:97-98`, zed README:19 [V] |
| Distribution | macOS `.app` bundle + `.icns` + ad-hoc/Developer-ID `codesign` with hardened runtime (notarization is manual `xcrun notarytool`); Linux `.desktop` + icon + systemd unit; export = single executable with embedded assets. **No DMG, no MSI/NSIS, no AppImage/deb, no updater.** | `docs/guide/07-distribution.md:39-98`, `compiler/src/tools.ts:185-198,299` [V] |
| Notifications | None (no OS notifications; kit has in-app toast). Could spawn `osascript` / `notify-send`. | grep: none [V/I] |

Existing Studio-like code (assets to reuse, not just references):

- `apps/studio/src/runner.ts` already calls `node zinc.mjs plugins`, build, run, deploy through `zinc:process` and streams logs with levels (`ZINC_LOG_FORMAT=json`). `src/devices.ts` does `zinc:remote` discovery + ssh device list. `docs.ts` + `zinc:webview` renders docs. [V]
- `examples/zed-editor/src/app/tools.ts` (159 lines) does `zinc check --json` diagnostics and the `zinc run` terminal. [V]
- `examples/hero` is the UI-kit showcase (10 screens, router, prefs, commands, overlays) proving the kit scales to app-size UI; `docs/ui-kit.md` lists Card, Dialog, Tabs, Switch, Slider, Progress, Alert... [V]

---------------------------------------------------------------------------------------------------------------------

## 2. Comparison with alternatives

| | Zinc app (proposed) | Tauri 2 (prior report) | Electron | Zed / GPUI | Lapce / Floem | Sublime | Flutter desktop | Qt |
|---|---|---|---|---|---|---|---|---|
| Language of UI | TS/TSX typed subset, Solid or React model | web (any) + Rust | web + Node | Rust | Rust | C++ (closed) | Dart | C++/QML |
| Editor component | own, textarea-based, limited (one caret) | Monaco/CodeMirror, free | Monaco, free | GPUI editor (built in) | Floem editor, Lapce | built in | package `re_editor` etc. | QScintilla / KTextEditor |
| Terminal | none (needs PTY + VT) | xterm.js + Rust pty crate | xterm.js + node-pty | built in | built in | plugin | packages | QTermWidget |
| Webview/docs render | macOS only | native (WebKitGTK is weak) | Chromium | none / own markdown | own | none | webview plugin | QtWebEngine (heavy) |
| Multi-window / menus / dialogs | no / no / no | yes | yes | yes | partial | yes | yes (multi-window experimental) | yes |
| A11y / IME | none / commit only | webview does it | Chromium does it | partial [W, unverified] | poor [W, unverified] | native | good | best |
| Windows | **no** | yes | yes | yes (2025+ [W, unverified]) | yes | yes | yes | yes |
| Size | ~1-5 MB [I from qt-comparison numbers] | 5-15 MB + engine | 100-200 MB | ~50-100 MB [I] | ~30-60 MB [I] | ~20 MB | ~20 MB | 10s of MB |
| Dogfooding value | max | none | none | n/a | n/a | n/a | n/a | n/a |
| Hot reload | `zinc dev` | web HMR | web HMR | no | no | no | best (stateful) | qmlscene |

Verdict of the comparison [I]: Zinc loses on the boring OS-integration checklist (a11y, IME, menus, multi-window, Windows, terminal) and on editor depth; it wins on size, determinism, and coherence. Zed/GPUI and Lapce/Floem are the closest philosophy (GPU-drawn native editor) and both had to build the same missing pieces; that is the price list for the gap table below.

**Dogfooding buys**: one runtime and one language (any Studio feature is a reusable kit component for users), tiny binary and instant startup (3.8 ms hello), uniform pixels across mac/linux (goldens, replay tapes catch IDE regressions), `zinc dev` hot reload of the IDE, and every platform bug the IDE hits gets fixed for every app. Studio is the best possible "real app" for the never-done profiling step (README.md caveat 2: "profile a real Zinc UI app").
**Dogfooding costs**: a11y (legal risk in EU for a product, `qt-comparison.md:85`), IME preedit and non-Latin text (Chinese/Japanese comments in source), no native menu bar, no Windows (the Arduino audience is heavily Windows and Chromebook), self-built terminal and richer editor, no webview outside macOS (docs/markdown), and a single-window HAL.

### 2.1 Hybrid: Zinc UI + Node CLI as engine, vs compiler inside the Zinc JS engine

Node-only surface of the compiler (`compiler/src`, 10,273 lines, 27 files): [V]

- `node:fs` + `node:path` imports in `abi, capabilities, emit-cpp, frontend, jsx, plugins, resources, emit-js, native, tools, cli, engines` (`grep -c "from 'node:'"`); `node:zlib` in `resources.ts:6`; `node:url` in `frontend.ts:6`; `hir, sema, infer, emit-bc` import only `node:path` (polyfillable). [V]
- **Process side effects concentrated in `cli.ts`** (107 `process.`/`readFileSync`... hits), `tools.ts` (28, includes `spawnSync('codesign')`, `tools.ts:197`), `engines.ts` (29), `emit-js.ts` (11), `resources.ts` (7): this is the driver layer (cmake, docker, esptool, codesign), not the compiler core. [V]
- `frontend.ts:133-150` builds a `ts.createCompilerHost` over `ts.sys` and already has a `virtual` file map (`:145`); `ZINC_ROOT` via `import.meta.url` (`:14`). `emit-bc.ts` returns bytes; `emit-cpp.ts` returns strings. [V, from prior report; unchanged]
- TS 6 is the `@typescript/typescript6` JS package (`node_modules/@typescript/typescript6/lib/typescript.js` is a shim `require("@typescript/old")`); the dev dependency `typescript@7.0.2` is the native (Go) port and `frontend.ts:1-2` says a switch to the TS 7.1 API touches that file only. [V]

So the **compiler core is portable JS** (`frontend/jsx/sema/hir/infer/emit-*`) behind ~10 file-touching functions; a Node-free host needs: a virtual FS (embed `lib/`, plugins index), `zlib` (only `resources.ts`, font/image baking), and replacing `process`. **But** three showstoppers for "run it in the Zinc app's own QuickJS": (a) it is not Zinc-subset TS (it uses the full TS compiler API, regexes, dynamic objects) so Zinc cannot AOT-compile it; it must run on a JS engine; (b) the TS JS library is ~10 MB of JS and the compile of a UI app takes ~400 ms warm in V8 (`docs/dev-mode.md:47`); the prior report measured QuickJS about 14-30x slower than V8 on Three.js's JS-side work (`README.md` conclusion 4) so a UI app compile would be ~6-12 s, plus a multi-hundred-ms cold load unless the bytecode is precompiled (the runner still re-parses source at each start, `README.md` conclusion 2) [I]; (c) `zinc:script` is a sandbox with a 16 MiB default memory limit, no files, no timers (`docs/plugins/script.md:5-8,50`), so the host would have to expose a whole file API and raise limits. Then C++/CMake/docker/esptool still have to be spawned anyway, so Node is *not* eliminated from any native build path: it only disappears from the ZBC4/sim path.

| Option | Cost | Buys | When |
|---|---|---|---|
| A. Node CLI child process, JSON-RPC over stdio (keep warm daemon) | v0: 0 for spawn-per-command (already in `apps/studio`), 2-3 pw for a `zinc serve` daemon with structured progress | works today, gets TS 7 later, no perf loss, isolates crashes | v0, v1 |
| B. Bundled engine (Node SEA / `bun build --compile` / private Node, 50-100 MB) instead of "user installs Node >= 23.6" | 2-3 pw + `ZINC_ROOT` layout | no Node prerequisite | before public release |
| C. Compiler in QuickJS inside Studio | 8-12 pw + QuickJS perf work (bytecode precompile, AOT) + raising sandbox limits | Node-free ZBC4/sim loop, same code as browser tier A | only if browser-Tier-A port (P6 in prior report) is done anyway; then Studio gets it nearly free [I] |
| D. TS 7 native `tsgo` sidecar + a Zinc-side checker | unknown, depends on TS 7.1 JS API story | fastest type check/LSP | watch, not plan |

Recommendation: **A then B; C only as a by-product of the browser port.** [I]

### 2.2 Bootstrap / self-hosting story

Studio is *built by* the Zinc compiler (`zinc build apps/ide`) and *drives* the same compiler as a child process: this is normal dogfooding, not self-hosting. True self-hosting (the compiler compiled by itself) is out of scope: the compiler needs the full TS API and Node. What is real: (1) a released Studio bundles the compiler + runtime sources + Node/engine, and builds user apps by spawning it; (2) Studio can rebuild itself with `zinc dev` (edit Studio in Studio, hot reload keeps the window: `docs/dev-mode.md:31-40`); (3) CI builds Studio with a pinned previous Zinc release so a compiler regression cannot brick the release pipeline [I]. Chicken-and-egg risk: a compiler bug that breaks Studio's own build also blocks the tool used to fix it; mitigation is that the CLI stays usable without Studio (it always is) and Studio is built by the pinned release. [I]

---------------------------------------------------------------------------------------------------------------------

## 3. Gap list (ranked)

Ranked by "blocks a credible v1 IDE" first, then by reuse value for all Zinc apps. Effort: pw. Numbers are [I]; SDL3 API availability [W] from general knowledge of SDL 3.2 (`SDL_ShowOpenFileDialog`, `SDL_ShowOpenFolderDialog`, `SDL_ShowSaveFileDialog`, `SDL_CreateTray`, `SDL_EVENT_DROP_FILE`, `SDL_EVENT_TEXT_EDITING`) that should be confirmed against the vendored SDL3 version before scheduling.

| # | Feature | Today | Work | pw |
|---|---|---|---|---|
| 1 | **Native file/folder dialogs, drag-and-drop files, message box** | none | `hal_dialog_*`, `hal_drop_*` weak hooks + `zinc:gfx`/`zinc:ui` API, SDL3 dialog + drop events (async, delivered on event loop); fallback: in-app file picker built from `zinc:fs` (zed-editor tree) | 1.5 |
| 2 | **Editor v1 depth** (multi-caret, split editors, incremental tokenizer or tree-sitter, folding, go-to-def hooks, IME preedit, bracket/auto-close, large files) | one caret, lexical per-line | belongs to the parallel editor study; must land in `zinc:ui` engine (textarea extensions) not just the app | 8-14 |
| 3 | **LSP client** (JSON-RPC Content-Length framing over `zinc:process` stdio; diagnostics, hover, completion, definition, rename) against the TS language service | only `zinc check --json` on save | `lib/std` JSON-RPC + a `zinc lsp` stdio server wrapping the TS language service (the compiler already exposes LSP-shaped diagnostics `cli.ts:947` and a `zinc-ts-plugin` at `lib/editor/zinc-ts-plugin`) | 4-6 |
| 4 | **`zinc:serial`** (enumerate, open, set baud, read/write, DTR/RTS, VID/PID; native USB-JTAG reset) + bundled esptool/espflash driver | spawn esptool, `stty` monitor, regex ports | termios (mac/linux), Win32 COMM later; IOKit/udev/SetupAPI for VID/PID. v0 can shell out to `zinc flash/monitor` | 3-4 |
| 5 | **PTY + terminal emulator** (`zinc:process` PTY mode with winsize/resize; VT100/xterm parser, cell grid, scrollback, selection, colours, cursor keys, paste) | pipes + ANSI colour output only | `forkpty` / ConPTY; VT parser + grid component in Zinc | 6-9 (PTY 2-3, emulator 4-6). Optional in v0-v1: keep a read-only log + a "run command" input |
| 6 | **Multi-window** (tear-off, detached preview, dialogs as windows) | HAL has one static window and one renderer | HAL multiplexing + per-window surface/input in `gfx`/`ui` singletons: invasive | 4-6. Not required v1 (use in-app panes and the separate preview app window that already works via `macos`/`remote` targets) |
| 7 | **Windows host** (runtime + HAL + `zinc:fs/process/socket/os`, CMake/zig generation, path/CRLF/`deploy.sh`, `flash.ts` `COMx`) | none | prior report P3 puts host support at 4-6 pw for sim + toolchain; the *runtime* itself (`fs.cpp` POSIX, `posix_spawn`, `dlopen` dev mode, `SIGBUS` handlers, sockets) plus SDL3 HAL and an MSVC/mingw/zig path is larger | 10-14 |
| 8 | **Accessibility bridge** (`a11y` node record; NSAccessibility, then UIA, AT-SPI; `ui.a11yDump()` goldens) | none | `qt-comparison.md:85-87` calls it L; realistic for a full IDE (text editor role, tree, tabs, lists) | 10-16 (macOS first 5-6) |
| 9 | **Menus** (native macOS menu bar; other OS in-app) | none; kit `DropdownMenu` exists | ObjC menu bridge (precedent: `plugins/webview/src/webview.mm`) + palette already covers commands; ship an in-app menu bar first | 0.5 (in-app) / 2 (macOS native) |
| 10 | **Markdown/docs viewer** (headings, code, tables, images, links) or webview beyond macOS | webview macOS only | a `Markdown` kit component (2-3 pw) is enough for docs and README; WebKitGTK/WebView2 backends are 3+3 pw and reintroduce the platform matrix | 2.5 |
| 11 | **Split panes / dock / resizable panels / persistent layout** | panel resize in zed-editor only, kit `Tabs` | kit `SplitPane`, dock model (tabs draggable between groups), layout in `zinc:storage` | 2-3 |
| 12 | **Settings, keymaps, themes** (JSON user settings, keybinding editor, per-OS config dir, theme switching incl. OS dark mode) | `zinc:storage` + zed themes | `lib/std` config dir helper, keymap layer (kit-v2 plans keymaps, `docs/reports/kit-v2-plan.md`) | 2 |
| 13 | **Auto-update + signature verification** (Ed25519/minisign in Zinc or native, download, atomic replace, restart) | none; only sha256 in `web.ts:1386` | `zinc:crypto` Ed25519 verify (small C impl), updater service in Zinc, per-OS replace/relaunch | 2-3 |
| 14 | **Packaging/signing per OS** (DMG, notarize automation, MSI/NSIS + Authenticode, AppImage/deb) | mac `.app` + codesign only; notarize manual | scripts + CI, no runtime change | 3-4 (mac 1, linux 1, windows 2 after #7) |
| 15 | **Non-Latin text/IME preedit/bidi/font fallback** | Latin-centric | HarfBuzz-class shaping is far out (Qt report); minimal: preedit + CJK fallback font | 3-4 (minimal) |
| 16 | **OS notifications, tray, open-in-Finder/URL handlers, single-instance** | none | spawn `osascript`/`notify-send` (0.5), SDL tray (0.5), single-instance socket (0.5) | 1.5 |
| 17 | **mDNS / DNS-SD discovery** of Pi and rmpp (rather than Zinc's own multicast beacon), ssh integration (agent, known-hosts) | UDP beacon only; ssh via spawn | small mDNS client in `zinc:socket` | 1.5-2 |
| 18 | **Async/large-file I/O and background jobs** (fs is synchronous; project indexing, search-in-files) | sync fs on the event loop | worker threads exist (`threads: true`) but no worker API for user code; `zinc:process` `rg` is the cheap answer | 1-3 |
| 19 | **State-preserving hot reload** (Fast-Refresh-like) for IDE dev | full reload | optional | 3-5 |

Windows (#7) and a11y (#8) are the two items that decide whether Studio can be the *public* default IDE; #1, #3, #4 and #11 decide whether it is a *good* IDE; #5 and #6 are polish.

---------------------------------------------------------------------------------------------------------------------

## 4. Phased plan

Phases share code with the prior report's toolchain manager (P1) and with the engine/AOT items; only Studio-specific work is counted.

**Phase 0: spike, 1 pw.** Fork `examples/zed-editor` + `apps/studio` panes into one app skeleton `apps/ide` (not in this report's scope to create). Decide name. Run `zinc dev` on it. Measure with the real app: this is also the first profile of a real Zinc UI app under `--engine quickjs` (README.md order item 2).

**Studio v0: "Zinc app that shells out to the Node CLI and shows the sim preview", 8-10 pw (macOS + Linux).**
- Project open/recent (dialog #1 fallback = in-app picker), tree, tabs, existing editor, diagnostics via `zinc check --json` (all reuse zed-editor).
- Build / Run / Stop / Deploy / Monitor panels via `zinc:process` (reuse `apps/studio/src/runner.ts`); structured progress (`--json`) added to the CLI (+1 pw).
- Preview: reuse the remote-display preview (`zinc:remote`, port 7711) for native, and Node sim for headless logs (`apps/studio` Robot view; note the sim has *no renderer*, `docker-free-studio.md` §1.3, so pixel preview = native build with remote display).
- Toolchain panel and `zinc doctor` UI on top of the future `zinc toolchain` (prior report P1).
- Flash/monitor by spawning `zinc flash/monitor` (no #4 yet); docs via `Markdown` component (#10).
- Packaging: macOS signed `.app` + DMG, Linux AppImage/deb; **no Windows**.
- Exit criterion: open an example, edit, build, preview, deploy to the Pi 3B+, flash an ESP32-S3 Matrix, all without leaving the app.

**v1: editor + LSP + serial + PTY, +18-26 pw** (parallel study on editor and JS engines feeds #2 and the engine choice).
- #2 editor depth, #3 LSP, #11 panes/dock, #12 settings/keymaps, #4 `zinc:serial` (+ esptool/espflash bundled), #5 terminal (PTY first, VT emulator second), #13 auto-update, #14 packaging with notarize CI.
- Board/device manager UI (USB VID/PID, ssh/mDNS #17), project templates from `boards/*.json`.
- **Windows decision gate**: start #7 in parallel (10-14 pw); Studio for Windows ships when the runtime port and packaging pass conformance.
- a11y macOS bridge (#8) in the same window if a public/EU release is planned.

**v2: self-hosted compiler (optional), +8-12 pw.** Only after the browser port of the compiler front end (prior report P6) exists: run frontend + emit-bc/emit-js in QuickJS inside Studio for the Node-free ZBC4/sim loop; native builds still spawn the toolchain. Also state-preserving hot reload (#19) and multi-window (#6) here. Precondition: QuickJS bytecode precompile and AOT work landed (`quickjs-jit-aot.md`), otherwise the compile latency is a UX regression. [I]

Total to a credible cross-platform IDE: roughly 40-60 pw including Windows and a11y; **8-10 pw to the macOS/Linux v0** that already reads as an Arduino-IDE-like tool. Compare with the prior Tauri plan (Studio v0 8-12 pw, `docker-free-studio.md` §7 P5): same v0 cost, but the Zinc plan's v1 investments are reusable by every Zinc app while Tauri's are not, and its size stays an order of magnitude smaller. [I]

### Packaging, signing, updates per OS

| OS | Package | Signing | Update | Status |
|---|---|---|---|---|
| macOS (arm64, x64) | `.app` (exists) + DMG | Developer ID + hardened runtime (exists via `ZINC_SIGN_IDENTITY`, `docs/guide/07-distribution.md:83-98`) + `notarytool` + staple (manual today; script it) | Zinc-side updater (#13); or Sparkle-like manual | partially done [V] |
| Linux (x64, arm64) | AppImage (+ deb/rpm/flatpak later) | detached minisign signature | same updater (AppImage self-replace) | `.desktop` + export exist; no AppImage [V]; needs an SDL3 dependency policy (bundle SDL3 or static) [I] |
| Windows (x64) | MSI or NSIS installer | Authenticode / Azure Trusted Signing (certificate procurement, [I] ~100-600 USD/yr) | same updater | blocked by #7 |
| Toolchains/engine | content-addressed cache, minisign index | see prior report §3 | `zinc toolchain` | not started |

Note the Apple SDK licence point from the prior report still applies: build macOS Studio on macOS CI.

---------------------------------------------------------------------------------------------------------------------

## 5. Risks

1. **Windows** (#7): a Studio without Windows is a hard sell for education (Arduino audience). Mitigation: keep the browser Tier A/B (prior report) as the Windows/Chromebook path, or run Tauri/Electron *only* for that audience later; do not block macOS/Linux v0 on it. High.
2. **Accessibility / EU regulation** (#8): `qt-comparison.md:27` itself flags it as a blocker; an IDE for blind or motor-impaired users is unusable. Mitigation: macOS bridge early, publish as "not accessible yet" for v0. High for a public product, low for an internal/dev-tool release.
3. **Editor quality**: users compare it to VS Code/Zed; one caret, lexical highlighting, no LSP is not enough. The parallel editor study must be the critical path. High.
4. **Text/IME**: no preedit and Latin-centric shaping will hurt CJK users at once. Medium.
5. **Node prerequisite / engine packaging**: v0 requires Node >= 23.6, CMake, a C++ compiler (`docker-free-studio.md` §1.1); a "download and run" story needs option B and the toolchain manager. Medium.
6. **Perf of the compiler in-app (v2)**: QuickJS 10-30x slower than V8 [I]. Medium; gated by measurement.
7. **Platform churn while dogfooding**: the tree is dirty (large uncommitted UI/gfx/compiler changes, `git status`), the UI ABI moves; Studio breakage tracks it. Mitigation: pixel goldens + `apps/studio/test.sh`-style headless checks, `ZINC_DEMO` scenes as in zed-editor. Low-medium.
8. **Single-window HAL** (#6): dialogs, floating preview, detachable panels are compromised; in-app layers cover most cases. Low-medium.
9. **Supply-chain / untrusted projects**: same as the prior report: building a downloaded project runs arbitrary code (`docs/studio.md:106-107`); add a Workspace-Trust prompt; `zinc:process` warns to never build command lines from untrusted input (`docs/plugins/process.md:56-70`). Medium.
10. **Scope**: the Studio can become a second product competing with the platform for the same engineer-weeks. Mitigation: only build platform features that also serve non-IDE apps, and time-box v0.

## 6. What I did not verify

- Did not run `apps/studio` or `zed-editor` (binaries exist under their `build/`), nor build on Linux; whether the Linux SDL3 HAL path is in daily use is [I] from README statements.
- SDL3 API availability and the vendored SDL3 version [W/I].
- QuickJS speed for the TS compiler and the exact size of `typescript.js` (the shim points to `@typescript/old`; the real file was not measured); effort figures are estimates.
- Zed/GPUI, Lapce, Sublime, Flutter, Qt columns are from general knowledge, not re-researched in this session [W/I, unverified].

## 7. Repo references

`apps/studio/{README.md,src/runner.ts,src/devices.ts,src/docs.ts}`, `docs/studio.md`, `examples/zed-editor/README.md`, `examples/zed-editor/src/app/tools.ts`, `examples/hero/`, `docs/ui.md` (:51-60, :259-269), `docs/ui-kit.md`, `docs/dev-mode.md`, `docs/plugins/{process,webview,socket,script,remote}.md`, `docs/guide/07-distribution.md`, `docs/boards.md:86-97`, `docs/reports/qt-comparison.md`, `targets/macos/hal_sdl.cpp`, `targets/capabilities.json`, `runtime/mod/fs.cpp`, `lib/modules.d.ts`, `lib/std/web.ts:1349-1386`, `compiler/src/{frontend,cli,tools,flash,resources,engines}.ts`, `compiler/src/tools.ts:185-198`, `package.json`.


---

<!-- source: notion-block-editor-zinc.md -->

# A Zinc-native Notion-style block editor: assessment, options, plan (2026-09-30)

Status: research only, nothing implemented. Tags: **[verified]** read in the code/docs or measured here, **[web]** from a
fetched/searched source (URL at the end), **[inferred]** my reasoning, not checked by running anything. Estimates are one
strong developer, unvalidated. Zinc tree was dirty when read; refs are to the working tree of 2026-09-30.
Paths: `NBE` = `/Users/mowmow/Lab/notion-block-editor`, `ZINC` = `/Users/mowmow/Lab/zinc`.

## 0. Bottom line

1. `notion-block-editor` is **Carnet**: an MIT, vanilla-TypeScript (no React/ProseMirror/Lexical/Slate) Notion-class block
   editor whose document model is **already headless and DOM-free**, and already ported twice (Swift, Rust/GPUI) with
   parity tests. That is the best possible starting point for a Zinc port. **[verified]**
2. The hard part is not the model, it is **Zinc's text engine**: a `text` node has one style, there are no inline spans,
   no IME preedit, no rich clipboard, no shaping/bidi/emoji. Those gaps (section 4) are shared with the code-editor
   study and must land first. **[verified]**
3. Recommendation: **option (i), made dual-target**: keep Carnet's headless core as TypeScript, make it compile under
   Zinc (subset lint in CI, kept green in both `tsc` and `zinc check`), and write a new Zinc view + input layer over a
   shared rich-text engine. Do not run the browser bundle on QuickJS (option ii). Option (iii) is (i) with more typing.

## 1. Assessment of the project as it is

### 1.1 What it is [verified]

- `NBE/README.md:1-40`: "Carnet", "a Notion-class block editor written in vanilla TypeScript, with storage you can read
  without it: Markdown files in a folder". Packages published as `@nbe/*`, CLI `nbe`. MIT (`NBE/LICENSE`), author Guillaume
  Dumoulin (same author as Zinc).
- Git: 357 commits, 2026-08-06 to 2026-08-13 (one week, heavy Claude Code assistance, stated openly at `README.md` "How this
  was built"). Current branch `rewrite/v2` (dirty), `main` = v1. 913 tracked files.
- Two generations side by side:
  - **v1** `packages/core` (4.4k lines TS, zero DOM) + `packages/dom` (15.4k) + `react|vue|svelte` mounts (~75 lines each) +
    `blocks-*` plugins + `workspace`, `collab` (Loro), `cli`, `markdown`, `static-renderer`.
  - **v2** `packages/carnet` (25.3k lines TS incl. views, plugins, 5 locales, database block): "a block editor you compose,
    every block is a plugin". `NBE/docs/design/v2-status.md:1-60`: 216 unit + 22 browser tests at that snapshot;
    v1 claims ~1040 unit tests and 6 gating suites (`README.md`, `docs/NEXT.md:1-20`: 1012 unit, Chromium 189/189,
    WebKit 178/178, single-host 184/184, touch, Swift 75).
- Also present: `native/swift` (document + CRDT, 75 tests), `native/gpui` (Rust + GPUI, no webview, ~6.5k lines Rust,
  44 tests, `native/gpui/README.md`), `apps/desktop` (Tauri), `apps/ios` (SwiftUI), `apps/obsidian`, `site` (Astro).
  Parity tests fail a commit if the autoformat tables drift between TS, Swift and Rust (`test/swift-parity.test.ts`,
  `test/gpui-parity.test.ts`).

### 1.2 Data model [verified]

`NBE/packages/carnet/src/model/types.ts`, `ops.ts`, `richtext.ts`, `marks.ts`, `doc.ts`:

- **Flat block map**: `Block { id (UUIDv7), type, version, props: Record<string, unknown>, text?: Run[], children: BlockId[],
  parentId }`. Nesting and columns are in the schema (parent/children), not in the text.
- **Inline text = runs**: `Run { text, marks?: Mark[] }`, `Mark { type, attrs? }`. Offsets are UTF-16 code units.
  Marks: bold, italic, underline, strike, sup, sub, color, background, code, link, mention, comment
  (`marks.ts`); each has a **Peritext-style expansion** (`none|before|after|both`) and comments may stack (`multiple`).
- **Selection is model-level**: `TextSelection {anchor, head: {blockId, offset}}` or `BlockSelection {anchor, head}`
  (`types.ts:23-44`). Cross-block selection is carried by the model and painted with the CSS Custom Highlight API because
  browsers clamp a real `Selection` to one contenteditable host (`docs/ARCHITECTURE.md` D3, measured in Chromium).
- **Seven invertible ops**: `insert_block, delete_block, move_block (parent + after-sibling intent), update_block,
  insert_text, delete_text, format_text` (`ops.ts:6-32`); `applyOp` returns its exact inverse; `canApply` lets history skip
  ops whose anchors vanished. Transactions (`Tx`), coalescing history (154 lines), validation per block, `normalize` to
  fixpoint. This is a ProseMirror-like step system without the position mapping, because ids are stable.
- **Commands** (`commands.ts`, 327 lines), **structure** (lift/indent), **registry** (block plugins define schema, view,
  Markdown and HTML projections in one place, `define.ts` 726 lines).
- Blocks: paragraph, heading, bullet/numbered list, todo, toggle, quote, divider, callout, image, code, columns+column,
  table+row+cell, file, embed, toc, database (table/board/list/gallery views, formulas, relations), page/sub_page.
- **Storage**: Markdown both ways (`markdown/`, 339+96 lines, no regex in the core dirs by grep), HTML, YAML frontmatter,
  vault (`.md` folder, ids round-trip), Notion import, SQLite index in the CLI.
- **Collaboration**: Loro CRDT (`packages/collab`, `carnet/src/collab`), comments anchored to text, presence,
  WebRTC/relay. `BlockStore` is an interface a CRDT can satisfy (`v2-status.md`), so the core is CRDT-shaped, not CRDT-bound.
- **Undo**: op-inverse history, skips foreign-touched steps, coalesces by word, capped.

### 1.3 Size, tests, deps, licence [verified]

| Item | Value |
|---|---|
| Headless core files (model, commands, editor, history, registry, structure, validate, define, markdown, html) | 3,512 lines TS |
| `carnet/src/view/*` (DOM/contenteditable) | ~3.2k lines (`view/*.ts`: caret, selection, input, keymap, render, paint, gestures, scroll, highlight...) |
| `carnet/src/plugins/*`, `ui/*`, `blocks/*` | plugins ~7k, ui primitives ~3.1k, blocks ~6k (much DOM: menus, popovers, drag ghost, tables) |
| Runtime deps | none for `carnet`; `loro-crdt` only for collab; `emojibase-data`, `lucide-static` dev; React/Vue/Svelte only as mounts |
| Licence | MIT (`LICENSE`); `docs/design/licence.md` is the (now resolved) licence discussion |
| Unit tests | 47 files in `packages/carnet/test` plus v1 suites; Playwright e2e ~55 specs in `NBE/e2e` |

### 1.4 What is portable and what is not

Portable (pure logic, no DOM) **[verified by grep of `document.|window.|HTMLElement|Range` over these files: only prose
matches]**: `model/*`, `commands.ts`, `editor.ts`, `history.ts`, `registry.ts`, `structure.ts`, `validate.ts`,
`markdown/*`, `html/*`, `frontmatter`, `vault` (I/O aside), `workspace`, database query engine and formulas, `collab` seam
(`editor.touched(ids)`), the autoformat and keyboard tables. `carnet/headless` is the documented DOM-free entry
(`headless.ts:1-59`).

Not portable (browser-dependent) **[verified]**:
- Per-block `contenteditable="plaintext-only"` leaves, `beforeinput` re-expressed as commands, IME reconciled at
  `compositionend` (`view/render.ts:116-143`, `view/input.ts`, `v2-status.md:17`). All of this **is the browser doing text
  layout, caret, selection, IME, spellcheck, undo of composition, accessibility**. Zinc has none of it to lean on.
- Caret/selection mapping DOM<->model (`view/selection.ts`, `caret.ts`, `caret-move.ts`), Custom Highlight API painting
  (`view/highlight.ts:81,122`).
- `Intl.Segmenter` for grapheme and word boundaries (`model/grapheme.ts:29-31,152-154`); falls back to surrogate-pair
  handling. Zinc/QuickJS have no `Intl` **[inferred: Zinc's stdlib is what `lib/zinc.d.ts` declares; quickjs-ng ships no Intl]**.
- DOM-heavy UI: `ui/*` (overlay, menu, popover, position, tooltip, drag ghost, picker), format bar, gutter, slash menu
  rendering, image resize, table chrome, mermaid/mdx/embed/dropzone blocks, emoji picker (9.9k lines of data).
- Framework mounts are irrelevant: Carnet is vanilla, the React mount is 80 lines and would not run on Zinc's React anyway.

### 1.5 Fitness for the goal

- Good: the author already answered "what is the document if not HTML" three times. The model is small, invertible, tested,
  Markdown-native (matches Zinc's own `docs/*.md` habit), CRDT-ready.
- Risk 1: the project's own D1 evidence says per-block contenteditable is fragile on mobile IME
  (`NBE/docs/research/per-block-contenteditable-evidence.md`: Notion abandoned it in Jan 2021, quoted second-hand from a
  Notion engineer on HN). That is an argument to **stop depending on contenteditable**, i.e. for a native text layer.
- Risk 2: v2 is alpha (`2.0.0-alpha.0`), on a branch, one week old, mostly AI-assisted; APIs will move. Pin a commit.
- Risk 3: working tree of `rewrite/v2` is dirty; do not port from a moving target without a tag.

## 2. What Zinc offers (and lacks) for this

### 2.1 Language and compiler [verified]

- Strict TS subset to C++17 (`docs/guide/02-language.md:1-45`). Supported: classes, generics, unions, closures, `Map`/`Set`,
  `JSON`, async, destructuring, spread. **Rejected: regex (Z1008), `var`, `eval`, dynamic `import()`, `in`, `globalThis`,
  rest params (Z9009), labeled statements (Z9011), `any` in strict profiles** (line 36). Gradual profile has `Dyn` for
  `any/unknown` (line 82+): JSON without a type gives a checked `Dyn` tree; calling through a `Dyn` is Z9042.
- Strings are UTF-8 with UTF-16 indices, so **indexing non-ASCII is O(offset)** (`docs/ui.md:67`; `02-language.md:14`).
  Carnet's `Run` model indexes by UTF-16 offset per block, fine for paragraphs, bad for a 10k-char code block.
- Fit: Carnet's core uses no regex (grep), `Record<string, unknown>` props (needs typed props or `Dyn`), `Intl.Segmenter`
  (must be replaced), module-level registries and closures (supported). Autoformat rules are `{ when: RegExp }` in the
  plugin API (`AGENTS.md` shows `when: /^# /`), so the **plugin surface uses regex** and needs a small matcher DSL for
  Zinc. **[inferred, needs the spike]**

### 2.2 UI runtime [verified]

- `zinc:ui`: flexbox + software rasterizer, host tags `view text button image scroll canvas input textarea`
  (`docs/guide/03-ui-apps.md`, `compiler/src/jsx.ts:9`). Solid model (signals, `Show`, `For`, `_virtual`) and a **React-like
  model** (`lib/std/react.ts`): `useState useReducer useEffect useLayoutEffect useMemo useCallback useRef`, class
  components, keys, hook-order check at build; deps are `number[]` only (`react.ts:110-131`); **no context, no portals
  (layers are `ui.openLayer`), no `memo`/`forwardRef`** (grep of `react.ts`/`solid.ts`: no `createContext|useContext|Portal`).
  A component re-renders wholesale. Real React libraries do not run; only Zinc-written components do.
- Text: `<text>` has one font/size/bold per node; `wrapText` splits on spaces with baked metrics (`lib/std/ui.ts:799-813`);
  `lineHeightOf = size*1.4`. **No inline spans, no per-run style in a paragraph.** `bold` is a boolean (`ui.ts:168`),
  italic only via a separate family file (e.g. `Inter-Italic.ttf` in `examples/zed-editor`).
- Fonts: own TTF rasterizer, `cmap` 4/12, glyf composites, cache per (font,size) (`runtime/ttf.cpp:1-80`). grep finds **no
  kern/GSUB/GPOS/bidi/emoji/fallback** in `ttf.cpp`/`raster.cpp`: Latin-only quality, no Arabic/Indic shaping, no colour emoji.
- Text fields: `input`/`textarea` engine with caret, selection, word/line select, undo (100 steps), IME **committed text
  only** (`docs/ui.md:20-45,269`: "Not done yet: IME composition preview ... multiple carets ..."). Clipboard: text only
  (`hal_clipboard_get/set`, `zinc:gfx clipboardText`, `ui.md:263`).
- Code-editor hooks on the textarea: `setMarks` (fills, boxes, squiggles), `setEditColors`, `setHighlightAt` (colour runs per
  visual line), `editView`, `scrollEditTo`, `editRowOf` (`ui.md:47-64`). These are per-**textarea** and monochrome-font.
  One textarea per buffer is `examples/zed-editor`'s model (`examples/zed-editor/README.md`). A block editor with 500 blocks
  would be 500 textareas each with its own caret/undo/scroll: the wrong shape (see 3).
- Input: pointer capture, gestures (`onTap onLongPress onDrag onPinch`), key contexts and actions (`bindKeys`,
  `keyContext`, GPUI-style), focus scopes, layers with anchored positioning, dismissal stack, scroll physics
  (`ui.md:86-200`). **Good match** for slash menus, popovers, drag-drop, format bar.
- Virtualization: `ui.virtualize(h, count, itemH, render)` is **fixed row height** (`ui.ts:327-331`); variable heights are on
  the kit v2 plan, not done (`docs/reports/kit-v2-plan.md`, item 8) **[verified as planned, not verified as absent beyond grep]**.
- Accessibility: grep of `docs/*.md`, `lib/std/ui.ts` finds none. **No a11y tree.**
- Kit: shadcn-style components (`docs/ui-kit.md`, `lib/std/kit/*`): Button, Card, Tabs, overlays (Tooltip, Popover,
  DropdownMenu, Dialog, toast). `kit-v2-plan.md` lists Command palette, Combobox, Tree, VirtualList v2, Sidebar as planned.
- Testing: deterministic hooks `ui.pointerAt / keyDown / typeText / wheelAt`, `zinc test --pixels` golden frames
  (`ui.md` Tests). Good for porting Carnet's e2e-style specs.

### 2.3 Engines, QuickJS, plugins [verified]

- Four engines from the same source: native C++, Zinc VM (tier 0/1 + JIT on AArch64), QuickJS application runner
  (`docs/engines.md`), and the sim/Node oracle. UI on VM/QuickJS: "full UI pending" (`engines.md` table). So a UI app
  today means the **native** engine; VM/QuickJS parity for UI is not a given.
- `zinc:script` embeds QuickJS-ng in a sandbox with typed host functions (`plugins/script/plugin.json`). It is a
  **language runtime, not a browser**: no DOM, no `Intl` **[inferred]**.
- Plugins (`docs/plugins.md`): modules (Zinc + optional C++), displays (HAL). A rich text/layout engine fits as a native
  module (`native/<name>.spec.ts` + `.host.cpp`) with sim implementation in TS.
- Prior research (`docs/reports/research-2026-09-30/README.md`) covers AOT/JIT/QuickJS speed, WebGL, Docker-free studio.
  Relevant carry-over: QuickJS is ~14-30x slower than V8 on JS-side work for three.js, so a QuickJS-hosted editor bundle
  is a performance and correctness risk before anything else **[verified in that report, estimate there]**.

## 3. How others did rich text without contenteditable

| Project | Approach | Lesson for Zinc | Source |
|---|---|---|---|
| **Flutter super_editor** | `MutableDocument` of nodes + `Editor` that applies requests and reactions to it; rendering by per-node component builders; text input via platform text-input client, own caret/selection painting | Same split as Carnet: document + editor pipeline + component-per-block. Selection and IME are the app's job | [web] super_editor README |
| **AppFlowy editor** | `Document` tree of `Node`s, text stored as **Delta** (rich ops), other blocks as attributes; `Transaction` = list of ops (insert/delete/update + inverses); `BlockComponentBuilder` maps Node -> Widget | Confirms flat/tree nodes + Delta + Transaction + one builder per block. Their Delta = Carnet's `Run[]` | [web] AppFlowy blog, docs |
| **Zed** | Rope on a SumTree, `DisplayMap` layers (folds, inlays, wraps) between buffer and screen, GPUI paints glyphs; CRDT buffer; text coordinate systems (offset/point/display point) | Separate buffer coordinates from display coordinates; measure/wrap in the framework and hit-test with its own layout. For a block editor a rope per block is overkill, but the **coordinate-system discipline** is not | [web] Zed blog posts |
| **Lexical** | Editor state + node classes are separable from the DOM: `@lexical/headless` runs `update()`, transforms, listeners and JSON with **no root element (skips reconciliation and DOM selection)** | Proves the "headless core + swappable reconciler" architecture in the field; Carnet's `carnet/headless` is the same idea | [web] lexical.dev headless |
| **ProseMirror** | Immutable doc + `Step`s + `Transform` with position mapping, view is a separate package (`prosemirror-view`) | The reference for transaction/step design. Carnet trades mapping for stable block ids (op intent is `{parent, after}`), which is simpler and CRDT-friendlier | [inferred from prior knowledge, not fetched] |
| **Slate** | Value = JSON tree, operations are the only mutation, DOM sync is React-DOM specific | Same shape; its DOM sync is the part that always breaks (IME) | [inferred] |
| **BlockNote** | Block JSON is the native, lossless format; `ServerBlockNoteEditor` runs schema/blocks on the server; UI is separate | JSON block document as the interchange, server-side use of the same schema | [web] blocknotejs.org |
| **Notion** | Everything is a block; text is a property with marks; pages, database rows are blocks | The block model itself; Carnet matches it | [web] notion.com blog |
| **Peritext / Loro** | Formatting as spans anchored to character ids with per-mark expansion; Loro implements Peritext+Fugue and exposes `configTextStyle` | Carnet's `MarkExpansion` is exactly this vocabulary. If collab is wanted, use Loro (already wired in `packages/collab`) or Automerge; do **not** invent a rich-text CRDT | [web] inkandswitch.com/peritext, loro.dev |
| **Yjs/Automerge** | General CRDTs; ProseMirror/Lexical bindings map steps to CRDT ops | Bindings live at the transaction boundary: Carnet's `editor.touched(ids)` is that seam | [inferred] |

### Architecture decision

**Headless document + closed invertible op set + transactions/history (Carnet's design) with three swappable layers:**
1. `core` (pure TS, Zinc-subset): model, ops, history, commands, Markdown/HTML projections, autoformat table, block registry.
2. `text engine` (native, shared with the code editor): shaping/wrapping of styled runs, hit testing, caret/selection
   geometry, IME, clipboard, grapheme/word segmentation.
3. `view` (per host): DOM view (today's `packages/carnet/src/view`), Zinc view (new), GPUI/SwiftUI views (existing ports).

Selection, caret and IME state live **in the model layer** (already true for Carnet's `Selection`), and the view only
reports pointer positions -> model points and paints. This is what makes contenteditable unnecessary and is the same
conclusion the native ports reached.

## 4. Options, ranked

### (i) Keep the TS logic, compile it with Zinc, rewrite the view layer in Zinc JSX. **Recommended.**

- What moves: the 3.5k-line headless core plus the block definitions' schema/Markdown halves. What is rewritten: `view/*`,
  `ui/*`, plugin UI (slash menu, gutter, format bar), each block's `view`.
- Work items unique to this option: (a) a **Zinc-subset lint** on the core (no regex, typed props, no `Intl`, no `in`,
  no rest params, no labeled statements); (b) replace `RegExp` in the plugin API (`when`, paste rules) with a small
  literal/prefix matcher; (c) props typing (`Record<string, unknown>` -> per-block typed props class or `Dyn`); (d) grapheme/
  word segmentation as a native module (`zinc:text`), TS fallback for the sim; (e) `Run[]` cost with non-ASCII UTF-8 strings.
- Keeps: the tests (port vitest to `zinc test`), Markdown vault, Loro collab option (Loro has Rust core; QuickJS/Wasm route
  or native binding, out of scope here), parity with the Swift/GPUI ports (add a fourth parity test).
- Effort for the core port alone: 3-5 weeks **[inferred]**; view + text engine dominate (section 6).
- Risk: keeping two targets (browser and Zinc) compiling from one core means Carnet's own evolution must obey the subset.
  Mitigation: subset lint in Carnet CI; one-way sync (Zinc vendors a pinned commit of `core`).

### (iii) Re-implement the core natively in Zinc TS sharing only a headless *contract*

- Same as (i) but as a fresh Zinc-idiomatic model (typed classes, `@value` runs, arena allocation, rope for big text) with a
  parity test against Carnet like Swift/Rust have. Better perf and typing, no Dyn, no regex; cost: forks the logic a
  fourth time and loses the free tests. Choose it only if the spike shows (a)-(c) above are worse than a rewrite, or if a
  rope/`@value` design is needed for performance on rM/Pi. Effort +4-6 weeks over (i) **[inferred]**. Tables and command
  semantics would be locked by the parity tests, as Rust did (`native/gpui/README.md`, "Les trois crates").

### (ii) Run the browser bundle on QuickJS/JSC with a DOM shim. **Reject.**

- The bundle's input, caret, selection, IME and painting are contenteditable + Range + Custom Highlight + CSS layout
  (`view/*`, `ui/position.ts`). A DOM shim would have to implement text layout, Range geometry (`getClientRects`), selection
  and CSS. That is writing a browser. `zinc:webview` (plugin exists in `plugins/webview`) would just embed a real
  engine, which is a valid *product* (Studio Docs tab) but not "Zinc-native".
- QuickJS speed (14-30x slower than V8 on JS-heavy work, research note) and missing `Intl.Segmenter` **[inferred]** make
  it worse. Engine parity for UI is "pending" (`engines.md`).
- Legit narrow use: run `carnet/headless` + `markdown` in `zinc:script` as a **sandboxed plugin runtime** (e.g. Markdown
  import/export tool) where no UI is involved. **[inferred]**

Ranking: (i) > (iii) > (ii). (i) and (iii) share the same UI work; the choice can be deferred to the spike outcome.

## 5. Gaps in Zinc UI to fill first (tied to the code-editor study, assuming one shared text engine)

Ordered by dependency. "CE" = shared with the code editor.

| # | Gap | Today [verified] | Needed for block editor | CE shared? |
|---|---|---|---|---|
| 1 | **Rich-text span layout** | `<text>` = one style; `wrapText` by spaces (`ui.ts:799`) | `RichText` node: `Run[]` with per-span font/weight/italic/colour/underline/strike/code bg/link, wrapping across spans, line boxes with mixed sizes, inline atoms (mentions, emoji) | Partly (code editor needs colour runs per line: `setHighlightAt`) |
| 2 | **Shaping and fallback** | none (`ttf.cpp`) | at least kerning + font fallback + colour emoji; complex scripts later (HarfBuzz as a native module on host targets, none on esp32/ps1) | Yes |
| 3 | **Grapheme/word/line-break segmentation** | none; Zinc has UTF-8 storage | UAX#29 grapheme + word, UAX#14 line breaking (Carnet's `grapheme.ts` needs `Intl.Segmenter`) | Yes |
| 4 | **Text geometry API** | `editRowOf`, `caretOf`, `editView` per textarea | per-run hit test (point -> (blockId, offset)), caret rects, selection rects for any offset range, across blocks | Yes |
| 5 | **Caret and selection across blocks** | one focused textarea has caret; no cross-node selection | Model-owned selection painted by the view (Carnet's D3 solution): selection rect painting per block, caret blink, block selection; must survive virtualization | Partly |
| 6 | **IME** | committed text only; preedit not done (`ui.md:269`) | preedit string + cursor + candidate window placement (`SDL_SetTextInputArea` exists as `hal_text_input`), composition events into the input layer | Yes |
| 7 | **Input host without a textarea** | text input is bound to `input`/`textarea` nodes | a "text sink" node: focus + text/key/IME events routed to JS with no internal buffer, so the model owns the text (this is the key enabler; `zinc:ui` already has `ui.typeText` for tests) | Yes |
| 8 | **Clipboard rich formats** | text only (`hal_clipboard_*`) | write/read `text/plain` + `text/html` (or a custom `application/x-carnet+json`) + image; SDL3 supports multiple mime types **[inferred]**; wasm HAL via async Clipboard API | Partly |
| 9 | **Undo** | textarea undo (100 steps) is internal | none needed: Carnet's op history replaces it, but the text sink must disable the field's own undo | No |
| 10 | **Scroll + virtualization** | `virtualize` fixed row height (`ui.ts:327`) | variable-height virtual list with `scrollToBlock`, stable scroll anchoring on height change (Carnet has `scroll-stability.spec.ts`), 500+ blocks | Partly (long files) |
| 11 | **Drag and drop** | pointer capture, `onDrag`, layers | already sufficient for block drag with ghost and drop indicator (Carnet's gutter drag is ~600 lines of DOM); file drop from OS is a HAL feature (GPUI app does it; Zinc: unknown) **[inferred]** | No |
| 12 | **Overlays** | `openLayer`, `anchor`, dismissal, focus scopes | enough for slash menu, format bar, block menu; **`anchor` to a text range rect** needs gap 4 | No |
| 13 | **Accessibility** | none | a11y tree/announcement of focused block and selection; hard on SDL; state as a known limitation for v1 and design the block tree so it can map (Carnet cites Gutenberg's Navigation/Edit model) | No |
| 14 | **Images, tables, embeds** | `image` node, `canvas` | images fine; tables need grid layout (not implemented: "grid" rejected, `ui.md` styles); embeds via `zinc:webview` on desktop only | No |
| 15 | **Code block highlight** | `tsHighlight`, `setHighlightAt` | reuse `examples/zed-editor/src/app/syntax.ts` tokenizers on `Run` marks; Carnet's `blocks-code` uses CSS Custom Highlight (not portable) | Yes |

Key design decision: **do not build the editor from `textarea` nodes.** One textarea per block gives 500 independent
carets/undo stacks/scroll states and no cross-block selection. Build one **`RichText` block node + a single text sink** and
let the model own selection. The code editor study should land the same `text sink + geometry API` so both editors share it
(a code buffer = one big monospace RichText with a line-number gutter and a rope/line index).

## 6. Phased plan

Effort in person-weeks, one strong developer, **[inferred]**, excludes review latency.

| Phase | Deliverable | Weeks |
|---|---|---|
| P0 spike | Vendor a pinned Carnet commit; run `zinc check` on `model/*`, `commands`, `history`, `markdown`. Produce the Z-code error list, decide (i) vs (iii). Print a doc round-trip (JSON -> Markdown -> JSON) under `zinc test` on native and VM | 1-2 |
| P1 text engine (shared with code editor) | `zinc:text` native module: segmentation (grapheme/word/line), kerning + fallback, `RichText` layout (runs, wrap, hit test, caret/selection rects); sim implementation for `zinc test` | 5-7 |
| P2 input layer | text sink node, IME preedit, key routing to commands (reuse `bindKeys`, port Carnet's keymap/autoformat tables), model-owned selection + caret blink | 3-4 |
| P3 core port | subset lint + fixes, typed props, matcher DSL instead of RegExp, tests ported; parity test vs TS output | 3-5 (parallel with P1/P2) |
| P4 block view MVP | paragraph, heading 1-3, bullet/numbered/todo, quote, divider, callout, code (no highlight first), image; block selection; virtualized column | 4-5 |
| P5 chrome MVP | slash menu, markdown shortcuts, format bar (bold/italic/code/link), block gutter with drag, undo/redo, clipboard (text + markdown + internal JSON) | 3-4 |
| P6 storage | Markdown vault (open folder, `fs` watcher, atomic save), frontmatter, page tree sidebar | 2-3 |
| P7 later | tables (needs grid layout), toggles/columns, database views, comments, search, Loro sync, a11y, Windows/Linux IME validation, e-ink profile | 10-20 |

**MVP definition (end of P6, ~20-28 weeks solo, ~14-18 with a second developer on the text engine):**
a Zinc app on macOS/Linux (native engine) that opens a folder of `.md` files, edits them WYSIWYG with the 10 block types
above and 5 marks (bold, italic, code, strike, link), slash menu, Markdown shortcuts, drag to reorder, cross-block
selection, copy/paste (text, Markdown, internal JSON), undo/redo with coalescing, 500 blocks at 60 fps, IME for CJK
on macOS, saved as Markdown with ids in frontmatter or `.nbe`-compatible sidecars. Explicitly out of MVP: tables,
databases, collaboration, comments, mobile, a11y, complex-script shaping.

Comparison point **[verified]**: Carnet's GPUI port reached most of the text/blocks/drag/vault surface in ~6.5k lines
of Rust but leans on GPUI's text system, IME and platform clipboard; Zinc must build those.

## 7. Relation to Zinc Studio, docs tooling and the reMarkable notes app

- **Studio** (`docs/studio.md`, `apps/studio`): today it embeds the docs with `zinc:webview` (listed in its stack) and has
  a Script box with a code area. A native block editor would replace the webview Docs tab with an editable, Markdown-backed
  pane over the repo's own `docs/*.md`, and give the flow diagram nodes a rich-text description field. Same text engine as
  the Script/Generated-code editor. **[verified for the webview and Docs tab; the replacement is inferred]** The research
  README warns "ZincStudio" already names the box editor: pick another product name.
- **Docs tooling**: Carnet's vault is plain Markdown + YAML frontmatter (`markdown/`, `frontmatter/`), the format Zinc docs
  already use, so `docs/**/*.md` can be opened as a vault with no conversion, and `zinc.json`/guide samples could live in
  code blocks. **[inferred]**
- **reMarkable notes** (`examples/remarkable/notes`): it is an **ink** notebook (`zinc:ink`, strokes saved as JSON/SVG,
  `notebook.ts`, `README.md`), not text. A block editor complements it: typed blocks + ink blocks in one page model
  (a new `ink` block whose payload is the existing `Stroke[]`). E-ink constraints: latency already "unacceptable" for ink
  in FAST mode (`examples/remarkable/notes/README.md`, `docs/reports/rmpp-latency-2026-09-29.md`), no software keyboard
  guaranteed (Type Folio or the kit's virtual keyboard, `lib/std/kit/keyboard.tsx`), partial-refresh needs block-level
  dirty rects. Carnet's block-granular redraw (`v2-status.md`) matches that. Target after MVP, with an e-ink theme.
  **[inferred]**

## 8. Open questions / what I did not verify

- Whether `zinc check` accepts Carnet's core as is: not run (read-only, dirty tree). The spike answers it.
- Whether Zinc's SDL HAL exposes `SDL_EVENT_TEXT_EDITING` (preedit) and multi-mime clipboard: only `hal_text_input` and text
  clipboard are documented; not read in C++.
- Whether the Zinc VM/QuickJS engines can run a UI app (`engines.md` says pending): plan assumes native engine only.
- Performance of Zinc's software rasterizer for full-window rich text at 60 fps; `docs/reports/PERF.md` not consulted.
- Carnet claims in its README (test counts, byte sizes, latency 8.3 ms at 500 blocks, `docs/NEXT.md:1-20`) were read, not re-run.

## Sources

- Carnet/notion-block-editor (local): `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/NEXT.md`, `docs/design/v2-status.md`,
  `docs/research/per-block-contenteditable-evidence.md`, `packages/carnet/src/{model,commands,editor,history,view,headless}`,
  `native/gpui/README.md`.
- Zinc (local): `docs/ui.md`, `docs/ui-kit.md`, `docs/guide/02-language.md`, `docs/guide/03-ui-apps.md`, `docs/engines.md`,
  `docs/plugins.md`, `docs/studio.md`, `docs/reports/kit-v2-plan.md`, `docs/reports/research-2026-09-30/README.md`,
  `lib/std/{ui,react,solid}.ts`, `lib/std/kit/host.ts`, `compiler/src/jsx.ts`, `runtime/ttf.cpp`, `examples/zed-editor`,
  `examples/remarkable/notes`.
- Web: https://www.inkandswitch.com/peritext/ ; https://loro.dev/blog/crdt-richtext ;
  https://lexical.dev/docs/concepts/headless ; https://appflowy.com/blog/how-we-built-a-highly-customizable-rich-text-editor-for-flutter ;
  https://appflowy.com/blog/demystifying-appflowy-editors-codebase ; https://github.com/Flutter-Bounty-Hunters/super_editor ;
  https://zed.dev/blog/zed-decoded-rope-sumtree ; https://zed.dev/blog/zed-decoded-text-coordinate-systems ;
  https://www.blocknotejs.org/docs/features/server-processing ; https://www.notion.com/blog/data-model-behind-notion
  (search-result summaries only; pages were not fetched in full).


---

<!-- source: platform-files-and-conditionals.md -->

# Platform-specific files and compile-time conditionals for Zinc TS (research, 2026-09-30)

Status: research only, nothing implemented. Tags: **[verified]** read in the repo or run here, **[web]** read from a
fetched page (link given), **[known]** from general knowledge, page not fetched, **[inferred]** my reasoning.
The tree is dirty; `frontend.ts` has uncommitted edits, but the platform feature itself is committed
(commit 55c06b2 "platform capabilities ... file.<profile>.ts variants") **[verified]**.

## 0. Summary

Zinc already has half of what is asked, and it is less finished than `docs/targets/capabilities.md` says:

1. **Platform files exist** (`foo.<profile>.ts`, then `foo.<target>.ts`), resolved by a post-resolution hook. No family
   chain, no board/chip tag, no `.native/.web/.desktop`.
2. **`zinc:platform` exists** (constants per capability), but it is **not a compile-time constant**: I ran it and the
   untaken branch is still type-checked, emitted to C++, its strings are in the literal pool, and MIR shows
   `load @TOUCH` (a runtime global assigned in `__init`). The doc line "the other branch is not compiled in" is only
   true if clang can prove it, and it cannot (the global is written at run time).
3. Recommended design: **prune at the source-file level in the frontend** (one pass, before TS type-check), so all
   four engines and every emitter see the same pruned program: dead branch not checked, not emitted, its imports not
   loaded, not linked. Keep the runtime constants as a safe fallback. Add a closed tag chain per target/chip/board,
   `Platform.{OS,target,chip,board,arch,is,has,select,isDev}`, `zinc check --all-targets`, and reuse the existing
   Z5003 module-availability check as the "unguarded platform API" lint (it becomes precise once guarded code is pruned).
4. Effort: about 4-6 engineer-weeks for M0-M4 (no editor); editor overlay adds about 1-2 weeks on top of the LSP work
   already estimated in `code-editor-lsp.md`.

## 1. What exists today

### 1.1 Module resolution and variants (frontend.ts)

| Fact | Ref |
|---|---|
| Only module that imports the TS API (`@typescript/typescript6`); other modules use re-exported `ts` | `compiler/src/frontend.ts:1-13` |
| `zinc:*` std modules are a static map to `lib/std/*.ts`, fed to TS as `paths`; PocketJS/`solid-js`/`react` aliases too | `frontend.ts:30-54` |
| Options: `moduleResolution: Bundler`, `noLib: true`, `strict`, `allowJs/checkJs`, `rewriteRelativeImportExtensions` | `frontend.ts:53-70` |
| Global mutable platform state `{target, profile, source}` set by CLI before `loadProgram` (blocks in-process multi-target checking) | `frontend.ts:121-126` |
| `zinc:platform` is a virtual in-memory file `lib/zinc-platform.gen.ts` mapped via `paths` | `frontend.ts:122-132` |
| Host `getSourceFile` already rewrites sources before parse (css imports, stylesheet, JSX lowering, Web-global auto imports), keeping diagnostic positions | `frontend.ts:142-165`, `webGlobals` `:84-117` |
| Custom `resolveModuleNameLiterals` calls `ts.resolveModuleName`, realpaths, then `platformVariant()` | `frontend.ts:166-167, 188-195` |
| `platformVariant(file)`: tries `<base>.<profile><ext>` then `<base>.<target><ext>`; skips `.d.ts`; only if the file exists on disk (not virtual) | `frontend.ts:197-208` |
| Virtual sources (`zinc build app.js`, `zinc infer`) are supported by `virtual` map | `frontend.ts:119-120, 135-139` |

Consequences **[inferred from the code]**: the variant hook also applies to `zinc:*` std modules and plugin modules
(they go through `resolveModule`), variants are per exact resolved file, `foo.esp32.ts` is not type-checked against
`foo.ts` (no parity check), variants of `.d.ts` are unsupported, and stock `tsserver` does not know about any of it.

### 1.2 Targets, profiles, capabilities

- `PROFILES` (number kind, size, typing, heap) for macos linux sim wasm rpi1 esp32 ps2 ps1 rmpp: `compiler/src/cli.ts:34-45` **[verified]**.
  `--profile` lets one target borrow another's profile (`o.profile = o.target` default): `cli.ts:99-133`.
- Capability table (hardware flags): `targets/capabilities.json` (keys: threads display touch pointer keyboard pen gamepad eink net fs audio gpu gpio process dynlib; values true/false/"plugin"/"optional").
  Compiler adds heap/numbers/fpu/width/height: `compiler/src/capabilities.ts:29-31`. Requirement grammar (`touch|pointer`, `!eink`, `heap>=256K`, `numbers=f64`): `capabilities.ts:41-53`.
- `zinc:platform` source generation: `capabilities.ts:75-90` (`TARGET`, `PROFILE` typed plain `string`; `HEAP_BYTES: i32`; one `boolean` per capability).
  Documented in `docs/targets/capabilities.md:55-70` and `cli.ts:975-977`.
- Requirements are enforced at build time (`zinc.json` `requires`, `plugin.json requires`, `@requires` module comments, `// zinc-test: requires`): `docs/targets/capabilities.md:38-53`, `cli.ts:134-140`.
- Boards: `zinc.json "board": "<id>"` merges `boards/<id>.json` (`all`, `targets.<id>`, `plugins`); `plugins.ts:33-60`, `docs/boards.md:22-30`. A board is data only: it never becomes a source-selection tag and is not visible to code.
- **Module availability table is separate and duplicated**: `MODULE_TARGETS` (`native.ts:18-26`), enforced as error Z5003 after emission for every module in `native.used` (`emit-cpp.ts:222-227`). `native.used` is filled when a call is emitted (`native.ts:93-100`), so today a call in a dead branch still counts **[verified by reading; consistent with the run below]**.
- User native modules pick C++ by `native/<name>.<target>.cpp`, with a `.host.cpp` fallback for macos/linux only, else error Z5002: `native.ts:146-158`. A second, independent "platform file" mechanism with a different fallback rule.
- HAL selection is in CMake generation, per target: wasm/macos/null HAL and `hal_posix.cpp` (`cli.ts:291-300`), esp32 lists `targets/esp32/hal_esp32.cpp` (`cli.ts:629`), ps1/ps2 pass `-DZINC_HAL_FILE` (`cli.ts:550,555`). Files: `targets/{common,esp32,macos,null,ps1,ps2,wasm}/hal_*.cpp`. So the C++ runtime is already selected by target, not by `#if`; only Zinc TS needs a chain.
- Runtime string `sys.platform()` returns `"macos" | "linux" | "rpi1" | "esp32" | ...`: `lib/modules.d.ts:10-11` (a runtime query, not foldable).
- Engines are a separate axis: `--engine native|zinc-vm|quickjs`, and non-native engines "require the host target" (`cli.ts:~127`, `compiler/src/engines.ts:14-16`). So today the engine never differs from the host target for zinc-vm/quickjs.

### 1.3 Const-eval, dead branches, `declare const`

- No compile-time evaluation in sema. `sema.ts` only records const-ness for widening (`sema.ts:696-701`).
- **MIR** (`compiler/src/mir.ts`) has constant folding with **branch pruning** and DCE (`mir.ts:1-5, 241-336`), but it is "an inspection stage, not the input of the C++ emitter" (`mir.ts:3`, ADR `docs/decisions/0013-hir-mir.md`); emit-cpp is direct AST to C++ (ADR 0004). emit-bc does consume MIR (`emit-bc.ts:4`). MIR only folds literals and arithmetic on them, not loads of module globals.
- `hir.ts:187` lowers `if` with no constant handling; `emit-cpp.ts:779-781` prints `if`/`else` verbatim; emit-js is an AST transformer (`emit-js.ts`).
- No `declare const`-based build defines, no `import.meta.env`, no `__DEV__`. Dev mode exists as `o.dev` (`cli.ts:31-33`) but code cannot branch on it at compile time.

### 1.4 Experiment (run here, scratch dir only; repo untouched)

Program: `if (TOUCH) log('touch-branch') else log('no-touch-branch')`, `if (TARGET==='esp32') log('is-esp32')`, and an import of `./helper` with `helper.esp32.ts` next to it.

| Command | Result |
|---|---|
| `zinc build main.ts --target esp32 --emit=cpp` | pulls `helper.esp32.ts` (namespace `m_helper_esp32`, returns "esp32-variant"): variants work **[verified]** |
| same, macos | pulls `helper.ts` **[verified]** |
| esp32/macos `--emit=cpp` | literal pool contains `touch-branch`, `no-touch-branch` **and** `is-esp32` on both targets; globals `bool TOUCH{}` assigned in `__init` (`TOUCH = true`) **[verified]** |
| `--emit=mir` esp32 | `%0 = load @TOUCH : bool; br %0 ? bb1 : bb2`, "branches pruned 0" **[verified]** |
| `--target sim --emit=js` | `zinc-platform.gen.js` and both variants emitted as normal modules **[verified]** |

So: type-check, emit, link and (probably) code size all include the dead branch. Only `platformVariant` selection is compile-time.

### 1.5 Usage today

Only one consumer of `zinc:platform`: `examples/pinball/src/ui/panel.ts:6,214`. No `*.esp32.*`/`*.rmpp.*` TS variants exist in the repo (the `*.<target>.cpp` files in `plugins/*/native/` are the C++ side). Docs: `docs/targets/capabilities.md`, `docs/guide/*` have no platform chapter **[verified via grep]**.

## 2. Prior art (web research)

| System | Mechanism | Relevant lesson |
|---|---|---|
| **React Native / Metro** | `Platform.OS` runtime; `Platform.select({ios, android, native, default})` prefers ios/android, then `native`, then `default`; files `.ios.js/.android.js/.native.js` imported without extension. [RN docs](https://reactnative.dev/docs/platform-specific-code) **[web]**. Metro `resolver.platforms` defaults `['ios','android','windows','web']`; extension precedence is documented in Metro "Module Resolution" [Metro config](https://metrobundler.dev/docs/configuration/) **[web]** | The file convention the user wants. `native` as a *group* tag is the useful idea. In RN, `Platform.OS` is a runtime value; dead-branch removal there comes from Babel/Metro inlining plus Hermes/minifier, not from the type-checker **[known]**. |
| **TypeScript `moduleSuffixes`** | `["\.ios", ".native", ""]` makes `./foo` resolve `./foo.ios.ts`, `./foo.native.ts`, `./foo.ts`; the docs say it is for React Native "where each target platform can use a separate tsconfig.json"; since 4.7 [tsconfig ref](https://www.typescriptlang.org/tsconfig/#moduleSuffixes) **[web]**. `customConditions` adds `exports`/`imports` conditions since 5.0 (same page) **[web]** | Stock `tsserver` can already understand a suffix chain with one tsconfig per target. Zinc can generate those tsconfigs. Zinc still needs its own hook for `zinc:*`/plugin/virtual modules. |
| **esbuild** | `define` substitutes constants and, with tree shaking, removes dead `if` branches; `platform`, `conditions`, `resolveExtensions` [esbuild API](https://esbuild.github.io/api/) **[web]** | Define + DCE is the standard cheap model: replace, then fold. |
| **webpack DefinePlugin** | direct text replacement; `if (!PRODUCTION)` removed by the minifier [webpack](https://webpack.js.org/plugins/define-plugin/) **[web]** | Same; also shows the pitfall that unfolded uses stay as runtime references. |
| **Vite `define`** | statically replaced in build; TS users add `declare const __X__: string` [Vite](https://vite.dev/config/shared-options.html#define) **[web]** | Typing via ambient `declare const` is the accepted pattern (editor sees the type, value is injected). |
| **Rollup replace, Babel inline-environment, Terser** | same family: text/AST replace then dead-code elimination | **[known]** |
| **Dart / Flutter** | `import 'a.dart' if (dart.library.io) 'a_io.dart' if (dart.library.js_interop) 'a_web.dart'`; keys come from the compilation environment, resolved at compile time [dart.dev](https://dart.dev/tools/pub/create-packages) **[web]**. `kIsWeb` is `bool.fromEnvironment('dart.library.js_interop')`, so it is a compile-time constant that enables tree shaking; `defaultTargetPlatform` is runtime and test-overridable [api.flutter.dev](https://api.flutter.dev/flutter/foundation/kIsWeb-constant.html) **[web]** | Two-tier model to copy: compile-time constant for *what is compiled* vs runtime value for *what is running*. Conditional import keyed on **capability** ("library available"), not on OS name. |
| **Rust `cfg`** | `#[cfg(target_os = "macos")]`, `cfg!`, `cfg_select!`; removed code is parsed but **not type-checked**; options are static [Rust reference](https://doc.rust-lang.org/reference/conditional-compilation.html) **[web]** | Exact semantic asked for ("untaken branch is not type-checked"). Cost: bit-rot in inactive code, solved by CI matrix. |
| **Swift `#if os()/arch()/canImport()/targetEnvironment()`** | inactive branches must parse, are not type-checked [Swift book](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/statements/#Compiler-Control-Statements) **[web]** | `canImport` = capability probe; same parse-only rule. |
| **Zig `comptime`, `builtin.target`** | comptime-known `if`/`switch` are statically evaluated and untaken branches are not analysed; namespace-level declarations are lazily analysed [Zig docs](https://ziglang.org/documentation/master/#Compile-Time-Expressions) **[web]** | Best-in-class semantics; needs a real comptime evaluator. Zinc can take the cheap 90%: a whitelisted constant-expression evaluator. |
| **Go** | `//go:build linux && amd64`; filename suffixes `_linux.go`, `_arm64.go`; excluded files are not compiled; `GOOS=x go vet ./...` and gopls `GOFLAGS/-tags` are how people check each variant [go cmd](https://pkg.go.dev/cmd/go#hdr-Build_constraints) **[known; fetch returned only a summary]** | Closed set of known tags in file names avoids ambiguity (`foo_bar.go` is only special if `bar` is a known GOOS/GOARCH). Editor shows only one configuration at a time. |
| **Kotlin Multiplatform expect/actual** | an `expect` declaration must have an `actual` in every target source set, checked by the compiler [Kotlin docs](https://kotlinlang.org/docs/multiplatform-expect-actual.html) **[known; fetch returned empty]** | The exhaustiveness model for platform files: `foo.ts` (or an `.d.ts`) is the contract; each variant must satisfy it. |
| **C/C++ `#if`** | preprocessor, everything text-level, inactive text not parsed | Baseline; for Zinc the C++ output is machine-made so `#if` in the output would only defer, not remove, the type/link problem (see 4.3). |
| **Deno `Deno.build`** | runtime `{target, arch, os, vendor, env}`; docs "discourage" branching on it, meant for logging [Deno.build](https://docs.deno.com/api/deno/~/Deno.build) **[web]** | Runtime OS switches are an anti-pattern; give capability checks instead. |
| **Bun macros** | `import { f } from './f.ts' with { type: 'macro' }`; runs at bundle time, result inlined; args must be static; serialisable results only [Bun](https://bun.sh/docs/bundler/macros) **[web]** | A general comptime hook exists in the TS-adjacent world, but it needs a JS engine at build time and is far more than needed. Not recommended for Zinc now. |
| **TypeScript itself** | No conditional compilation and no `#if`; the intended answer is bundler `define` + per-target tsconfig **[known; I could not locate the canonical issue, so no link]** | Zinc owns its frontend, so it can do better than TS. |
| **PocketJS** (the TS-to-native toolchain Zinc already mirrors, `lib/compat/pocketjs`, `frontend.ts:40-47`) | Repo family `github.com/pocket-nexus/pocketjs` (several mirrors). "MicroTS" compiles Solid TSX / Vue SFC views to Rust through a typed View IR; `pocket.json` declares viewport and required APIs and "a target profile must satisfy that declaration before compilation and packaging proceed"; `pocket check --target psp`; "cores" (net, audio, 3D) are native modules an app takes only if it needs them [pocketjs README](https://github.com/pocket-nexus/pocketjs) **[web]** | PocketJS solves the same problem at the manifest level (declared requirements per target, capability registry, per-target check command) and has no in-source platform branching that I could find. Zinc's `requires` + `zinc:platform` is already ahead in source-level conditionals. `pocket check --target X` is the CLI shape to mirror for `zinc check`. |
| **Expo** | uses Metro platform extensions (+`Platform.select`) and, for web, `.web.js` **[known]**; no additional mechanism found | nothing new |

TypeScript language-service angle **[inferred + web for moduleSuffixes]**:
- One tsconfig per target with `moduleSuffixes` is the supported way for an editor to see one variant set. It works only for relative specifiers; `zinc:*` needs `paths` (already `compilerOptions.paths`).
- `Platform.select` typing: TS can express "either provide `default`, or provide every leaf" with a union of object types; TS also reports `TS2367` ("no overlap") if a *literal-typed* const is compared with another literal, so the generated typing of `TARGET` must be the **union of all targets**, not the single current literal (the value is folded by Zinc, not by the type).
- TS type-checks both branches of `if (false)` and does not grey them out; inactive-code greying needs an LSP hint (`DiagnosticTag.Unnecessary`) from a Zinc overlay.

## 3. Design

### 3.1 File-resolution rules

**Tag chain** (closed, ordered, most specific first). Filenames are never parsed: for each import the resolver *tries* `base.<tag>.<ext>` for each tag in the chain, then `base.<ext>`. That gives Go's "closed set" safety without parsing.

Proposed table (new file `targets/platforms.json`, data not code, replacing the hard-coded `HOSTS` list in `native.ts:18` and `CAPTURE_TARGETS`/`HIDPI_TARGETS` style sets in `cli.ts`):

| target (profile) | chain, most specific first |
|---|---|
| esp32 (chip esp32s3, board waveshare-esp32-s3-matrix) | `board:waveshare-esp32-s3-matrix`, `esp32s3`, `esp32`, `mcu`, `embedded`, `native` |
| rpi1 | `rpi1`, `rpi`, `linux`, `unix`, `embedded-linux`, `native` |
| rmpp | `rmpp`, `remarkable`, `eink`, `linux`, `unix`, `native` |
| linux | `linux`, `desktop`, `unix`, `native` |
| macos | `macos`, `apple`, `desktop`, `unix`, `native` |
| ios / android (reserved, no target yet) | `ios`/`android`, `mobile`, `apple` (ios), `unix`, `native` |
| ps1 / ps2 | `ps1`/`ps2`, `playstation`, `console`, `embedded`, `native` |
| wasm | `web`, `wasm` (no `native`) |
| sim (Node oracle) | resolves as the *profile* it emulates (today `--profile` wins: `platformVariant` tries profile first), then `sim`, `node` |

Rules:
1. **Precedence: board > chip > target/profile > family groups > (native) > default.** Existing behaviour (profile, then target) is a subset, so nothing breaks. When `--profile esp32` on target sim: chain of profile first, then target's.
2. **Tag `.native`**: in RN it means "not web". In Zinc "native" already means the native engine and `zinc:native` modules, so I recommend shipping it as an alias with the RN meaning but documenting it, and preferring `.embedded`/`.desktop`/`.web` in Zinc docs **[inferred]**.
3. **Variant without default** (`foo.esp32.ts` and no `foo.ts`): allowed only if every target in `zinc.json targets` is covered by some tag in its chain; otherwise error at check time ("`./foo` has no variant for macos"). This is the Kotlin `expect/actual` guarantee, without new syntax.
4. **Contract check**: when `foo.ts` exists next to `foo.<tag>.ts`, `zinc check --all-targets` verifies each variant exports a superset of default's public exports with assignable types (one synthetic `const _: typeof import('./foo') = ...` check per pair). Optional `foo.d.ts` may serve as pure contract.
5. Applies uniformly to: relative imports, `zinc:*` std modules (`lib/std/x.ts` -> `x.esp32.ts`), plugin entries, native C++ (`native/<name>.<tag>.cpp` with the *same* chain instead of the ad hoc `.host.cpp` fallback at `native.ts:146-158`), and assets (`icon.esp32.png`) if wanted later.
6. Hosts: implement in `platformVariant` using tag chain; drop the module-global state (`frontend.ts:124`) by passing a `PlatformInfo` object to `loadProgram`.

`zinc.json` (schema today: `name, entry, board, targets.<id>{width,height,display,plugins...}, requires`): add nothing mandatory. Optional `"platforms": { "myfleet": { "extends": "esp32", "tags": ["myfleet"] } }` for user tags, and `board` automatically contributes `board:<id>` (`plugins.ts:33-60` already resolves the board).

### 3.2 Language API: `zinc:platform`

```ts
import { Platform } from 'zinc:platform';       // also the existing flat constants (TOUCH, HEAP_BYTES, ...) keep working

Platform.target     // 'esp32' | 'macos' | 'linux' | 'rpi1' | 'rmpp' | 'ps1' | 'ps2' | 'wasm' | 'sim'  (union type, folded value)
Platform.chip       // 'esp32s3' | 'esp32' | '' ...
Platform.board      // 'waveshare-esp32-s3-matrix' | ''
Platform.OS         // 'macos' | 'linux' | 'ios' | 'android' | 'web' | 'esp-idf' | 'baremetal' ...   (RN name; coarse family)
Platform.arch       // 'x64' | 'arm64' | 'armv6' | 'xtensa' | 'mips' | 'wasm32'
Platform.is('esp32')        // tag in the chain (typed: union of all known tags)
Platform.has('gpu')         // capability (typed: keyof capabilities), same semantics as `requires`: true/plugin/optional count as available
Platform.isDev              // `zinc dev` / --dev  (like __DEV__)
Platform.select({ esp32: 1, desktop: 2, default: 3 })   // first matching key by chain order, else default
```

Typing:
- `select<T>(m: SelectMap<T>): T`, `SelectMap<T> = ({ default: T } & Partial<Record<Tag, T>>) | Record<LeafTarget, T>`: either a `default`, or an exhaustive list of leaf targets (compile error names the missing one). Precedence is chain order, not object key order.
- Values are literal unions (`Platform.OS === 'ios'` is legal everywhere; typed `'macos'|...`).
- Generated `.d.ts` for the editor is the same union in every target; only the emitted/folded value differs. Only the folded value is per-target.

Semantics (the important part):
1. **Folded by the frontend before sema** (see 4.1): `Platform.*` calls, imported flat constants, `!`, `&&`, `||`, `===`/`!==`/`<`/`>=` on literals and on `HEAP_BYTES/SCREEN_*` numbers.
2. **Pruned**: an `if`/ternary/`&&`/`||`/`switch` whose condition folds is replaced by the taken branch. The untaken branch is *blanked* (position-preserving), so it is **not type-checked, not lowered, not emitted, not linked**, and imports used only there are dropped (so the module is not loaded).
3. **Not foldable => still correct**: if the condition cannot be evaluated (`Platform` re-exported, aliased through a function), the generated module still exports real runtime values, so the program runs the same, only bigger. A lint (Z-code warning) flags "platform condition not foldable" only in modules marked `// @zinc-static`.
4. **Two tiers, à la Flutter** (`kIsWeb` vs `defaultTargetPlatform`): `Platform.*` is compile-time; `zinc:sys` `platform()` and a new `Platform.runtime.has('touch')` are runtime queries for bytecode that is meant to be portable (see 4.5).
5. **Engines are not a Platform axis**: all four engines must print the same bytes (tests/engines). `Platform.engine` may exist for diagnostics but is never foldable and never selects files. Feature differences that come from an engine (mquickjs is ES5, `js-engines.md`) are capabilities (`Platform.has('es2020')`) not engine names.

### 3.3 Emission strategies compared

| Option | Untaken branch type-checked? | emitted? | linked (modules, HAL calls)? | Works on all engines? | Cost |
|---|---|---|---|---|---|
| A. Status quo (runtime consts, C++ optimiser) | yes | yes | yes | yes | none; but not folded (measured above) |
| B. `constexpr` consts + `if constexpr`/`#if` in C++ emit | yes | yes (until clang) | **yes, Z5003 and link errors remain**; a call to a missing `zrt::gpio::x` fails to compile | native only; VM/JS still carry it | small |
| C. Fold in MIR (`mir.ts:241-291` already prunes) | yes | no for VM bytecode only | no for VM | VM only; emit-cpp/emit-js do not read MIR | medium, and MIR cannot un-type-check |
| D. **Source-level prune in frontend** (recommended) | **no** | **no** | **no** (imports dropped) | **all** (they only see pruned sources) | small-medium |
| E. Typed-AST prune via TS transformer after check | yes (already checked) | no | partly | all | medium; loses "not type-checked" |

D is the only one that gives the Rust/Swift semantics and it is engine-agnostic. It also matches an existing pattern: `getSourceFile` already rewrites text before parse while "diagnostics keep their positions" (`frontend.ts:148-157`).

### 3.4 Capability lint (guarded vs unguarded platform APIs)

Reuse, do not add a new analysis:
- Move `MODULE_TARGETS` (`native.ts:19-26`) into capability annotations on the declarations (`/** @requires process */` in `lib/modules.d.ts`, mirroring the `@requires` module-comment mechanism already in `capabilities.ts:68-72`).
- After pruning, any *remaining* reference to a symbol whose `@requires` is unmet is an error: "`zinc:process` needs `process` (esp32 has none); guard with `if (Platform.has('process'))`". Because pruned branches are gone, guarded uses pass and unguarded uses fail. Z5003 (`emit-cpp.ts:222-227`) already does this per module after emission; today it would wrongly fire even inside a guard (dead branches are still emitted) **[verified by reading + the experiment]**.
- Optional stricter mode: per-target generated `modules.<target>.d.ts` that simply omits unavailable `declare module` blocks, so the editor shows "Cannot find module 'zinc:gpio'" live.

## 4. Implementation plan

### 4.1 Frontend (where the work goes)

1. `PlatformInfo` object (`target, profile, chip, board, arch, chain[], caps, dev`) built in the CLI (`cli.ts:131-133`) and passed into `loadProgram`; remove the module-level `let platform` (`frontend.ts:124`). Needed anyway for `--all-targets`.
2. Variant resolution: `platformVariant` iterates `info.chain` (`frontend.ts:199-208`). Keep it as the single source of truth; additionally generate `moduleSuffixes` tsconfigs for editors (5.2).
3. **Prune pass** `prunePlatform(file, text, info)` in a new `compiler/src/platform.ts`, called from the host `getSourceFile` next to `webGlobals` (`frontend.ts:157`) and before TS parse of the checked file:
   - parse with `ts.createSourceFile`, find bindings imported from `zinc:platform` (named, aliased, namespace);
   - evaluate condition expressions with a whitelisted evaluator (booleans, string/number literals, the platform bindings, `!`, `&&`, `||`, `===`, `!==`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`); unknown => leave unchanged (runtime fallback);
   - replace a taken `Platform.select({...})` by the chosen property value; for `if`/`?:`/`&&`/`||`/`switch`, keep the taken branch text and replace the untaken text with same-length whitespace/newlines (keeps line/col of diagnostics and source maps);
   - drop import declarations whose bindings all became unreferenced (and only those without side effects); then TS never loads the module. Follow-up: a second iteration if pruning removes the last use of another import.
   The imported `zinc:platform` file itself stays real (runtime fallback).
4. Generated `zinc:platform` (`capabilities.ts:75-90`): emit `export const TOUCH = true;` (literal initialisers, no `: boolean` widening), `Platform` object typed with unions, and the union type aliases from the chain table. This also lets emit-cpp treat literal module consts as `constexpr`/inline (fixes the un-foldable `bool TOUCH{}` global, M0) — helpful beyond platform code.
5. Cache key: `cli.ts:381` builds a cache key from target/zoom/sources; add chain + board. `zinc dev` watch list must include variant files not currently in the program (they are found only by `existsSync`): new variants created while running are missed **[inferred]**.

### 4.2 HIR/MIR/emitters
No change required for correctness (they see pruned sources). MIR's `fold` gains value only for literal `const X = 3` propagation; leave for later. C++ `#if` in emitted code is **not needed** and would not remove type/link problems (option B). Emitting `#define ZINC_TARGET_ESP32` etc. in generated code is still useful for hand-written `native/*.cpp`, cheap (cmake defines already per target).

### 4.3 Interaction with capability manifest, plugins, link size
- Capability manifest: keep `targets/capabilities.json` as the data; add `arch`, `OS`, `chip` and the tag chain in `targets/platforms.json`; `capsFor()` unchanged.
- Plugin selection: `modulePaths()` (`plugins.ts`) maps every plugin module id; a plugin is compiled in only when imported. Pruning removes dead-branch imports, so `if (Platform.has('gpu')) { ... import 'zinc:gpu' ... }`-style code stops pulling the plugin and its `plugin.json requires` check (`docs/targets/capabilities.md:47-48`, "Importing it on an incompatible target is an error") is satisfied by guarded code. Currently that check fires on any import.
- Link size: on esp32 (160 KiB heap profile) the win is real: pruned branches do not enter `native.used` (`emit-cpp.ts:222`) so their `runtime/mod/*.cpp` are not listed (`cli.ts:629` builds the source list from `mods`).

### 4.4 Engines

| Engine | Effect of design D |
|---|---|
| native C++ (emit-cpp) | sees pruned source; nothing to add; HAL chosen by cmake as today |
| zinc-vm bytecode | same; bytecode is specific to the target it was built for |
| quickjs / sim JS (emit-js) | smaller bundle, `zinc-platform.gen.js` still emitted for the runtime fallback |
| future jsc / mquickjs (`js-engines.md`, `mquickjs.md`) | same JS emit; ES5 limits expressed as capabilities not engine names |

### 4.5 One important trade-off: portable bytecode
The Studio/precompiled-core plans (`docs/precompiled-core.md`, studio reports) upload bytecode to a pre-flashed VM core. Folding on `target` bakes the target into the bytecode. Provide `--portable` (or per-file `// @zinc-portable`) that disables target folding and uses runtime queries (`Platform.runtime.has(...)`, backed by `sys.platform()`/HAL flags); the default is static folding. Do not let engine or device differences leak into the *type-checked* surface. **[inferred]**

### 4.6 Tooling

- `zinc check [--target X | --all-targets | --targets esp32,macos]`. Today `check` runs one target (`cli.ts:1102-1107`); it does run emit-cpp so Z diagnostics show. `--all-targets` loops over `zinc.json targets` (fallback: all `PROFILES`), one `loadProgram` each. Optimise with `ts.createProgram(..., oldProgram)` reuse and worker threads; `noLib` and small std keep cost low **[inferred, not measured]**.
- Report per-target diagnostics with the target name, dedupe identical messages across targets, exit non-zero if any fails. CI matrix: `zinc check --all-targets --json`.
- **Dead-everywhere lint**: union of "live" spans across the matrix; a `Platform`-guarded branch dead on *all* targets emits a warning (hidden dead-code bug guard).
- `zinc lsp` (planned in `code-editor-lsp.md`): `initializationOptions.target` and a status-bar target switcher; project is the pruned program for that target; ranges removed by pruning are sent as `Unnecessary` hints (greyed). Interim: `zinc ui tsconfig` / `zinc init` writes `tsconfig.json` + `.zinc/tsconfig.<target>.json` (`moduleSuffixes: [".board..", ".esp32s3", ".esp32", ".mcu", ".embedded", ".native", ""]`, `paths` for `zinc:*`, `lib` typings) so VS Code's tsserver at least resolves the right variant; switching target = switching the extended file. Limitation: no pruning in stock tsserver, so both branches are type-checked there (superset, which is safe).
- Lints: (1) unguarded module/API needing an unmet capability (3.4); (2) unfoldable condition in `@zinc-static` files; (3) variant without default/without contract match; (4) variant name that looks like a tag but is unknown (`foo.esp23.ts`) if `foo.ts` also exists.

## 5. Test plan and migration

Tests (all fit existing runners: `zinc test`, conformance under `tests/conformance`, engines under `tests/engines`, golden `--emit=hir|mir`):
1. `platform_select.ts` conformance: prints for each profile (`zinc test --profile <id>`); expected `.out` per profile as existing `modules_esp32.*.out` do.
2. Prune tests: `--emit=cpp` and `--emit=js` must not contain the untaken literal (string-grep golden); `--emit=mir` for the pruned program has no `cbr` on platform values.
3. Not type-checked: a dead branch containing a type error compiles; the same code on the live target fails.
4. Link tests: esp32 program with `if (Platform.has('process')) { spawn... }` builds with no Z5003; unguarded use fails with Z5003 and a fix hint.
5. Import elision: plugin imported only in dead branch is not in `native.used`/cmake sources.
6. Variants: chain precedence matrix (board/chip/target/family/default); `.d.ts` contract test; missing-variant coverage error.
7. Engine parity: same programs under `--engine native|zinc-vm|quickjs` produce identical output (existing engine harness).
8. `zinc check --all-targets` on every `examples/*` in CI (also finds rot in variants).
9. Fuzz-lite: random condition expressions evaluated by the folder vs `node` evaluation (same semantics of `&&`, `||`, number compare).

Migration:
- `examples/pinball/src/ui/panel.ts:6,214`: `TOUCH ? ... : ...` keeps working (flat constants stay); switch to `Platform.select` optionally.
- Existing behaviour of `platformVariant` (profile then target) is a subset; nothing to migrate. Rename doc claims in `docs/targets/capabilities.md:55-70` once pruning lands.
- `native.ts` `.host.cpp` fallback becomes "chain fallback" (`host` tag = `desktop`/`unix`); keep `.host.cpp` as alias.
- `HOSTS`/`MODULE_TARGETS` (`native.ts:18-26`) -> capability annotations; keep the table as generated output until parity is proven.
- Add a guide chapter (`docs/guide/`, none exists for platforms) and `zinc help targets` text (`cli.ts:975-977`).

## 6. Effort (one strong developer, unvalidated)

| Milestone | Content | Days |
|---|---|---|
| M0 | Literal module consts inlined/`constexpr` in emit-cpp; `TARGET`/`PROFILE` union types; fix doc claim; remove global platform state | 2-3 |
| M1 | `platform.ts` prune pass (evaluator, `select`, `if`/`?:`/`&&`/`||`/`switch`, import elision), `Platform` object + typings, tests 1-3, 5 | 6-8 |
| M2 | `targets/platforms.json` chain, board/chip tags, native C++ chain, `.d.ts` contract + coverage lint, tests 6 | 4-5 |
| M3 | `zinc check --target/--all-targets`, parallelism, dead-everywhere lint, CI job | 4-5 |
| M4 | `@requires` on `lib/modules.d.ts`, replace `MODULE_TARGETS`, guarded/unguarded lint (test 4) | 4-6 |
| M5 | Editor: generated tsconfigs (2 d) + LSP target switcher and `Unnecessary` hints (3-5 d, depends on `zinc lsp`) | 5-7 |
| M6 | `--portable` mode and runtime `Platform.runtime`, docs, migration | 3-4 |
| Total | | about 28-38 days (5.5-7.5 weeks with editor; M0-M4 about 4 weeks) |

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Type-check divergence**: a dead branch is not checked, so it rots | `--all-targets` in CI; dead-everywhere lint; contract check for variants |
| **Combinatorial explosion** (targets x boards x variants) | closed tag set, capabilities in code not in filenames, matrix only over `zinc.json targets`; board tag optional |
| **Hidden dead-code bugs** (pruner blanks something that mattered, e.g. side-effecting condition) | evaluator whitelist rejects any condition with calls/side effects; unknown => unfolded runtime fallback; position-preserving blanking keeps diagnostics stable; fuzz test 9 |
| Pruning removes the last use of an import with side effects | only drop imports without side-effect semantics (named/default/namespace bindings); `import 'x'` never dropped |
| Editor shows a superset (stock tsserver) | documented; `zinc lsp` overlay gives exact view |
| `native` tag ambiguity (RN meaning vs Zinc "native engine/modules") | alias + docs, prefer `embedded`/`desktop`/`web` |
| Portable bytecode vs static folding | explicit `--portable`; default static |
| TS API change (TS 7 native port) | all rewriting lives beside `frontend.ts`, the documented swap point (`frontend.ts:1-2`) |
| Text-rewrite fragility with JSX/CSS lowering already happening in the same hook | run prune after `lowerJsx` on the lowered text (same-length rewrites like the existing ones), test with tsx |

## 8. Open questions
1. Exact meaning of `Platform.OS` for embedded targets (`'esp-idf'`? `'none'`?): needs a decision; RN parity only for future ios/android.
2. Should `Platform.has()` accept `heap>=256K`-style requirement strings (same grammar as `requires`, `capabilities.ts:41-53`)? Recommended yes, cheap.
3. Board-level tags: worth it, or is `board` just a config/const (`Platform.board`)? Recommended tag only if a real board-specific file appears.
4. ios/android targets do not exist yet; reserve names now.

## Sources
React Native platform-specific code https://reactnative.dev/docs/platform-specific-code · Metro configuration https://metrobundler.dev/docs/configuration/ · TSConfig `moduleSuffixes`/`customConditions` https://www.typescriptlang.org/tsconfig/#moduleSuffixes · esbuild API https://esbuild.github.io/api/ · webpack DefinePlugin https://webpack.js.org/plugins/define-plugin/ · Vite `define` https://vite.dev/config/shared-options.html#define · Dart conditional imports https://dart.dev/tools/pub/create-packages · Flutter `kIsWeb` https://api.flutter.dev/flutter/foundation/kIsWeb-constant.html · Rust conditional compilation https://doc.rust-lang.org/reference/conditional-compilation.html · Swift compiler control statements https://docs.swift.org/swift-book/documentation/the-swift-programming-language/statements/ · Zig comptime https://ziglang.org/documentation/master/#Compile-Time-Expressions · Bun macros https://bun.sh/docs/bundler/macros · Deno.build https://docs.deno.com/api/deno/~/Deno.build · Go build constraints https://pkg.go.dev/cmd/go#hdr-Build_constraints · Kotlin expect/actual https://kotlinlang.org/docs/multiplatform-expect-actual.html · PocketJS https://github.com/pocket-nexus/pocketjs


---

<!-- source: toolbelt-build-pipeline.md -->

# A tool belt / build pipeline for Zinc JS and TS (research, 2026-09-30)

Status: research only, nothing implemented in the repo. Tags: **[V]** verified here (repo read or experiment run in the scratchpad),
**[W]** from a web source (linked), **[I]** inference or estimate. Experiments live in
`/private/tmp/claude-501/-Users-mowmow-Lab-zinc/f9000827-946f-4baa-baa4-097cd818e6ea/scratchpad/tb/` (tools in `tools/`, semantic corpus in `tools/sem/`).
Nothing was installed in the repo; the tree was not modified. Prior context (mquickjs is ES5-only, QuickJS bytecode precompile, JSC/V8, browser compiler) is in
[README.md](README.md) and [mquickjs.md](mquickjs.md) and is not redone here.

## 0. Summary

1. Zinc has **no build pipeline in the Metro sense**. `zinc build` is: TypeScript program (TS 6 API) -> Sema -> one emitter per engine. For the JS engines the "bundle" is
   a file copy with import-specifier rewriting (`compiler/src/engines.ts:130`), output is ES2022 modules, no minify, no lowering, no DCE, no cache, no lint, no third-party
   npm JS support in the quickjs path. **[V]**
2. **No tool can lower Zinc's ES2022 output to something mquickjs runs, out of the box.** Measured: SWC, Babel 8 (preset-env ie11) and TypeScript 6 (`target: ES5`) all pass `es-check es5`
   on a real 195 KB Zinc UI bundle, but on a 30-case semantic corpus run under the real `mqjs` they pass 12 / 9 / 14 cases, and fail for mquickjs-specific reasons
   (duplicate catch variable names are a SyntaxError, array holes in TS's `__generator` output, `Object.defineProperty` with unsupported descriptor shapes, missing `Symbol`,
   `WeakMap`, `Object.getOwnPropertyDescriptor`, ...). **[V]** esbuild refuses (`Transforming class syntax ... "es5" is not supported yet`) and oxc has no ES5 target. **[V]**
3. Recommendation: **build a thin Zinc pipeline (`zinc build` stages + hooks), buy the parts that are commodity**: esbuild for bundle/minify/define/tree-shake (76 ms for the
   195 KB UI bundle **[V]**), oxlint for lint with Zinc JS plugin rules, tsgo (`typescript@7` native `tsc`, 5x faster than tsc6 on the compiler project **[V]**) for a fast `--noEmit`
   gate while keeping `@typescript/typescript6` as the program API. For ES5 (mquickjs): **do not use a generic downleveler on Zinc output**; emit an "ES5-strict dialect" from Zinc's own
   TS transformer (`emit-js.ts` already owns the semantics) and use SWC/Babel only for the third-party-JS escape hatch, followed by an mqjs-specific fix-up pass.
4. Startup wins are smaller than folklore for pure parse: QuickJS-ng parses+compiles the whole 195 KB bundle in **8.4-9.0 ms** on an M1 Pro whether minified (108 KB) or not
   **[V]**. Minification is a size/flash/OTA win (-45% bytes), not a parse-time win on QuickJS. The real startup levers are bytecode precompile and lazy module init (Section 6).

## 1. Current pipeline (repo inspection)

| Stage | Where | Facts |
|---|---|---|
| CLI | `compiler/src/cli.ts` (1150 lines); `check` at `:1102`, `dev` at `:1094`, `doctor` at `:928` | Commands: build, check, run, dev, test, export, deploy, flash, capture, infer, init, tsconfig, bench, plugins, ui, compat. `doctor` only probes cmake, c++, ninja, SDL3, docker. **[V]** |
| Frontend | `compiler/src/frontend.ts` | The only importer of `@typescript/typescript6` (`:3`). `compilerOptions` (`:53`): `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict`, `noLib: true`, `allowJs`+`checkJs`, `types: []`. `paths` maps `zinc:*`, `solid-js`, `react`, `inferno`, `@pocketjs/framework/*` to Zinc's own `lib/std` and `lib/compat` (`STD_MODULES` `:30`) plus plugin modules. **[V]** |
| Source rewriting | `frontend.ts:128-180` | In `host.getSourceFile`: `import './x.css'` -> `defineClass` calls (`css.ts`), `lowerStyleSheets`, `lowerJsx` (`jsx.ts`, `.tsx` -> plain calls before type check), `webGlobals()` auto-imports `zinc:web` for `URL`, `fetch`, ... (`:84`). This is already a transform stage, inlined in the TS host. **[V]** |
| Platform resolve | `frontend.ts:188-208` | `resolveModule` then `platformVariant()` swaps `x.ts` for `x.<profile>.ts` / `x.<target>.ts` when the file exists. This is the hook the other study extends. `zinc:platform` is an in-memory module (`setPlatform`, `:121`). **[V]** |
| Third-party npm | `frontend.ts:170` | `sources` excludes anything under `/node_modules/`, so packages get type information (Bundler resolution) but are **never compiled by Zinc's emitters**. The C++ and VM paths cannot consume them. In the quickjs path `bundleJs` copies only relative/absolute imports of emitted files (`engines.ts:130-160`); a bare specifier is left as is and fails at run time. Only `plugins/*` (`three`, `svg`, `lottie`, ...) rewritten in Zinc TS, and `zinc:script` (a QuickJS sandbox with `Script.eval`, `plugins/script/index.ts`) run foreign JS. **[V]** |
| Language subset | `sema.ts:235` and `docs/guide/02-language.md:36` | `Z1xxx` forbidden JS: `var`, `arguments`, `eval`, `with`, regex (`Z1008`), dynamic `import()`, prototype mutation, holey arrays, `globalThis`, `in`. Typed numerics (`i32`, `f32`, ...). `any` is not banned outright: untyped values become `Dyn` (`docs/decisions/0014-dyn.md`), `--no-dyn` turns each into an error (`analyze()` in `cli.ts:175-198`). **[V]** |
| Emitters | `emit-cpp.ts` (2088 lines), `emit-bc.ts` (ZBC4), `emit-js.ts` (396), `abi.ts` | Native and VM come from HIR/MIR. JS: TS `program.emit` with a `before` transformer that adds numeric narrowing (`|0`, `>>>0`, `Math.fround`, `emit-js.ts:32-45`) and checks; two `transpileModule(..., ES2022)` fallbacks (`:367`, `:377`). **[V]** |
| Engine build | `engines.ts:14` `buildEngine` | `engine === 'quickjs'`: `emitJs` + `bundleJs` (copy graph, hashed file names, dead files removed); `zinc-vm`: `emitBytecode` -> `app.zbc` + `.zbc.debug`; CMake to a runner; `engine.json` with sha256 per artifact and a fingerprint; `--core` reuses a precompiled VM core when compiler/runtime/ABI hashes match (`compileScript` `:103`). `exportEngine` `:163`. **[V]** |
| Assets / resources | `resources.ts:332` `collectResources` | Fonts are rasterised from TTF at build time for exactly the characters used in string/JSX literals (i.e. already subsetting), SVG subset -> RGBA, everything baked to `zinc_resources.cpp` or JSON for the sim. **[V]** |
| Dev mode | `docs/dev-mode.md`, `tools.ts:350` `dev()` | `fs.watch` recursive on the project (`:445`) plus watchers on out-of-tree deps; native macOS/Linux hot reload = `app.so` swap at `-O0` (505-540 ms save-to-frame measured in the doc); state is **not** preserved ("like a React Native full reload, not Fast Refresh"); other targets restart or reload the page. **[V]** |
| Plugins | `plugins.ts` | Directory plugins with `plugin.json` (`kind: module | display`, `modules` for extra specifiers like `three/addons/...`, per-target sources/defines/idf/frameworks, `requires` capabilities). Native code build extension, not a compiler hook API. **[V]** |
| Lint / format | none | No `.eslintrc*`, `eslint.config.*`, biome, prettier or oxlint in the repo root; `package.json` has only `@typescript/typescript6` 6.0.2 and dev `typescript` 7.0.2, `@types/node`. `zinc check` = type check + both emitters in memory (`cli.ts:1102`). **[V]** |
| Capability checks | `docs/targets/capabilities.md`, `capabilities.ts` | Modules declare `/** @requires heap>=192K */`; a warning `Z5004` on incompatible targets (`cli.ts:186-190`). This is the seed of an "engine compatibility report". **[V]** |
| Node/TS versions | `node_modules/typescript` = 7.0.2 has **no JS API**, only `tsc` (`lib/getExePath.js`, `tsc.js`) **[V]**; the API stays on `typescript6` (`frontend.ts:1-2` comment "a swap to the TS 7.1 API touches this file only"). |

PocketJS compatibility (`lib/compat/pocketjs`) is API-level only; PocketJS's own tooling is not used (next section).

### 1.1 What PocketJS is and how it prepares code **[W]**

PocketJS ([github.com/pocket-nexus/pocketjs](https://github.com/pocket-nexus/pocketjs), MIT) is "a portable application runtime that turns modern component code into native pixels" (PSP to iOS 2G to desktop):
Solid (also Vue Vapor, Octane) with Tailwind-like classes, running in a pinned QuickJS with a Rust `no_std` UI core (taffy layout) compiled twice (native + WASM). Its build, from
[`tools/build.ts`](https://github.com/pocket-nexus/pocketjs/blob/main/tools/build.ts) and [`docs/DESIGN.md`](https://github.com/pocket-nexus/pocketjs/blob/main/docs/DESIGN.md):

- **Two passes.** Pass 1 transforms every `.tsx/.ts` reachable from the entry with Babel (`babel-preset-solid` `{generate:'universal'}` + `@babel/preset-typescript`, content-hash cached) and collects class strings and text code points from the AST.
  It then compiles Tailwind to `styles.bin`, bakes font atlases (`bake-font.ts`, `font-subset.ts`), SVG and images, and packs `app.pak`. Pass 2 is `Bun.build` (`format: "iife"`, `target: "browser"`, `conditions: ["browser"]`, `minify: false`,
  a plugin serving the cached pass-1 output) with `define` for `__POCKET_TARGET__`, `__POCKET_HOST_ABI__`, `__POCKET_FEATURES__` so target code is dead-code-eliminated. **No ES5 lowering, no minify, no bytecode**; QuickJS is "~ES2023".
- **Lint-on-import**: "the compiler lints on import" APIs unavailable on a target (`createResource`, transitions off-limits on PSP). A build plan (`contracts/`, `verifyPlanHash`) and `pocket check` validate an app against a *target profile*. No ESLint/oxc use found in the files inspected.
- A separate **MicroTS** compiler ("compiles Solid TSX and Vue SFC views to Rust through a shared typed View IR") is their AOT path, analogous to Zinc's native emitter.
- Zinc's `docs/engines.md:208-260` already records the practices worth copying (generated contracts with drift checks, measure stages separately, raw samples).

Take-away for Zinc: PocketJS = "Babel for framework transform + one Bun/esbuild-class bundle with `define` + target-profile validation + asset baking". Zinc's equivalent stages exist in pieces and are worth unifying.

## 2. Tool landscape (web) and what matters for Zinc

| Tool | Facts | Fit for Zinc |
|---|---|---|
| **Metro** [W: [Concepts](https://github.com/facebook/metro/blob/main/docs/Concepts.md), [Configuration](https://github.com/facebook/metro/blob/main/docs/Configuration.md), [Expo metro.config](https://docs.expo.dev/versions/latest/config/metro/)] | Three stages: Resolution (dependency graph, resolver with platform extensions `.ios.js`/`.native.js`), Transformation (Babel, parallel across cores, cached by file content + config), Serialization (custom serializer, one or several bundles). Config: `resolver` (source/asset exts, `resolveRequest`), `transformer` (`getTransformOptions` with `inlineRequires`, minifier, `assetPlugins`), `serializer`. Hermes bytecode step is a post-serializer `hermesc` run; debugId injected before it. Fast Refresh = per-module hot swap through `react-refresh` + module registry. | The **architecture template**: named stages, per-file transform cache, platform extensions, inline requires. Do not adopt Metro itself (Babel-based, RN-shaped, ~slow, no ESM output). |
| **Re.Pack / Rspack** [W: [re-pack.dev](https://re-pack.dev/docs/getting-started/introduction)] | Rspack (Rust webpack-compatible) as a Metro replacement; Module Federation, virtual modules, tree shaking. | Confirms "swap the bundler behind stable stages". Heavy for Zinc. |
| **esbuild** [V: 0.28.2 here] | Bundle, minify, `define`, tree-shaking, plugins (`onResolve`/`onLoad`), 76 ms for the 195 KB bundle. **Cannot lower to ES5** ([issue #297](https://github.com/evanw/esbuild/issues/297); reproduced: 1078 errors on the Zinc bundle: class, `const`/`let`, destructuring, for-of, spread, default/rest args, async). Lowers to ES2015+ only (and not generators/async below their native level). | Bundle + minify + define + the `zinc:*` external plugin. |
| **Rolldown / Vite 8** [W: [Vite 8](https://vite.dev/blog/announcing-vite8)] | Rust bundler, Rollup-compatible plugin API, uses Oxc for parse/resolve/transform/minify. Rolldown 1.0 API locked; Oxc transformer stable, minifier alpha. | Best candidate if Zinc wants a **Rollup-style plugin API** off the shelf; adopt later when the pipeline is stable (the esbuild plugin API is simpler today). |
| **oxc** (parser, transformer, minifier, resolver, oxlint) [V: oxc-transform/minify 0.152, oxlint 1.86] | Transformer lowers ESNext to **ES2015 at the lowest**; "the values that are supported by esbuild's `target` are supported, excluding ES5" ([docs](https://oxc.rs/docs/guide/usage/transformer/lowering)); `target: 'es5'` throws `Invalid target 'es5'` **[V]**. BigInt literals are an error at es2015 **[V]**. Minifier: 107 156 B vs esbuild 108 809 B on the bundle, but 413 ms vs 76 ms (first call, includes init) **[V]**. oxlint: 0.05 s user on 195 KB, 500+ built-in rules, JS plugin API ESLint-v9-compatible, **alpha**, no custom type-aware rules ([blog](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html)). | Parser/linter yes. Not an ES5 lowerer. |
| **SWC** [V: @swc/core, `jsc.target: es5`] | Lowers everything, 48-81 ms on the bundle, **output 313 KB unminified** (inline helpers, vs 195 KB source), 132 KB minified. Correct on 11/12 non-Symbol semantic cases on node; TDZ dropped. | Best speed among true ES5 lowerers. |
| **Babel** (`@babel/preset-env`, `transform-classes`, `regenerator`; hermes-parser [W]) [V: Babel 8.0.6] | Correct on all node semantic cases except TDZ (`tdz` is opt-in), 650-710 ms on the bundle, smallest unminified ES5 (228 KB). Async/generators need regenerator (inlined in Babel 8's helpers). Metro's own transformer. | Most correct and configurable ES5 path; slow but cacheable. |
| **TypeScript `target: ES5`** [W: [TS 6.0 notes](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [PR #63071](https://github.com/microsoft/TypeScript/pull/63071)] | `es5` and `downlevelIteration` are deprecated in 6.0 (silenced by `ignoreDeprecations: "6.0"`), unsupported in 7.0. [V] known-broken output on the corpus: `super.getter`, `extends Error`/`Array` (instance not an instance), computed getters, `arguments` inside arrows lost, symbol `hasInstance`. | Reject as the ES5 path (dead end + wrong). |
| **Closure Compiler** [V: 20260927 native macOS binary; W: [type-based renaming](https://github.com/google/closure-compiler/wiki/Type-Based-Property-Renaming), [limitations](https://developers.google.com/closure/compiler/docs/limitations)] | Only mature toolchain with typed **ADVANCED** optimisation (global renaming, DCE, property flattening, inlining) and ES5 output. Needs its `$jscomp` runtime polyfills (`ReferenceError: $jscomp` when run bare **[V]**), fails hard on `#private` fields, `new.target`, `super.x = v`, TDZ **[V]**. Zinc's typed subset (no eval, no reflection, no prototype surgery) is the "compatible code" ADVANCED wants, but its types are TS, not JSDoc. | Interesting later as an **optional ADVANCED post-pass for pure-Zinc bundles**; not a first step. |
| **Terser / UglifyJS** [V: terser 5.51.2] | 107 330 B with `passes: 2`, 944 ms. | No advantage over esbuild for a 1% size gain. |
| **Prepack** [W: [archived Feb 2022](https://github.com/facebookarchive/prepack)] | Partial evaluator, abandoned. | Skip. |
| **Hermes / Static Hermes** [W: [static_h](https://github.com/facebook/hermes/blob/static_h/doc/blog/README.md)] | AOT bytecode `.hbc` (skips parse; 25-50% TTI claimed by third-party posts), Static Hermes compiles typed JS/TS to native. Not embeddable as a Zinc engine cheaply. Metro runs `hermesc` after serialisation. | Model for the "bytecode step" (Section 6). |
| **`qjsc` / `JS_WriteObject`** [V: `qjsc.c` in the scratch QuickJS tree] | Precompiles to bytecode/C; the runner currently re-parses source each start ([README.md](README.md) item 2). Bytecode is engine-version specific. | Emit stage for quickjs. |
| **Javy + Wizer** [W: [Javy](https://bytecodealliance.org/articles/javy-hosted-project), [Wizer](https://github.com/bytecodealliance/wizer)] | QuickJS in Wasm; Wizer snapshots the initialised heap (0.36 ms cold start claim in a Fermyon-style setup). | Model for **snapshots**: run module init at build time (QuickJS has no heap snapshot, but init-time work can be hoisted at compile time). Relevant to the browser tier only. |
| **Porffor / AssemblyScript** | JS/TS AOT to Wasm/native. | Not needed: Zinc *is* this for its own subset. |
| **tsgo (TS 7)** [V: typescript@7.0.2 in repo; W: [TS 6 -> 7 plan](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx)] | Native `tsc`, **0.35 s vs 1.69 s wall** for `tsc -p compiler --noEmit` (tsc 7.0.2 vs tsc6) **[V]**; JS API not shipped in 7.0. | Use as a fast pre-gate (`zinc check --fast`) and for editor; keep `typescript6` for `createProgram`. |
| **Biome** [V: 2.5.14] | Format+lint in one Rust binary; GritQL custom rules. | Optional formatter only. Zinc does not need to format user code. |
| **ESLint flat config** [V: 10.11] with core `no-restricted-syntax` | Selector-based ban list works with zero plugins: 103 findings on the bundle in 0.7 s incl. startup. [W: [eslint-plugin-es-x](https://github.com/eslint-community/eslint-plugin-es-x)] has one rule per ES feature (`es-x/no-classes`, `restrict-to-es2018` preset) with readable messages. | Ship as the lint config for users who already run ESLint/editors. |
| **es-check** [V: es-check 9.x] | `es-check es5 file.js` acorn-based syntax gate; caught BigInt literals in the ES5 output. | CI gate. Syntax only: does not detect the semantic/mqjs failures found below. |
| **knip** | Dead exports/deps. | Optional in `zinc doctor`. |

## 3. Experiments (all in the scratchpad) **[V]**

Corpus: `examples/ui/forms` copied to `tb/ui`, built with `zinc build --engine quickjs --headless`: 7 emitted `.mjs` (ui.mjs 167 KB, fx_sin.mjs 26 KB, zinc.mjs 17.6 KB, ...) = the real QuickJS payload. Bundled by esbuild with a plugin mapping `zinc:*` to `globalThis.__zmods[...]`.

**E1. Size and QuickJS parse time** (QuickJS-ng 0.17, `new Function(src)` best of 30, M1 Pro):

| Variant | Bytes | Parse+compile |
|---|---|---|
| esbuild bundle, unminified (IIFE) | 194 709 | 8.78 ms |
| esbuild `minifyWhitespace` | 136 178 | 8.50 ms |
| esbuild `minify` | 107 858 | 8.06 ms |
| oxc-minify | 107 156 | 8.25 ms |
| terser passes:2 | 107 330 | 8.21 ms |
| Babel ES5 (ie11), unminified / minified | 228 346 / 129 887 | 10.17 / 9.18 ms |
| SWC ES5 minified | 131 638 | 9.45 ms |
| TS ES5 minified | 124 139 | 9.23 ms |

Reading: parse is roughly 45 ns/byte and is nearly insensitive to minification; ES5-lowered code parses ~10% slower. On a Pi 3B+ (about 10-15x slower cores [I]) the whole UI parse is ~100 ms, which is why bytecode precompile matters more than minify. Minify is a **-45% bytes** win (flash, OTA, storage), and a memory win only for source retention (QuickJS keeps source for `Function.prototype.toString`/line info unless stripped; `JS_EVAL_FLAG_STRIP` [I, not measured]).

**E2. Tool times on the bundle**: esbuild bundle+minify 76 ms; SWC ES5 48-81 ms; oxc-transform es2015 6 ms; TS transpile 325-475 ms; Babel 650-710 ms; oxlint 0.05 s; ESLint 0.7 s.

**E3. ES5 gate**: `es-check es5` passes for SWC, Babel and TS output *after* replacing the bundle's BigInt literals (the Zinc sim shim `sim/zinc.mjs` uses `BigInt` for i64/fixed-point sqrt: 8 literals, `BigInt(...)` calls). The ES5 path therefore needs the shim rewrite already listed in mquickjs.md. **[V]**

**E4. Semantic corpus on real `mqjs`** (30 one-case files: class/extends/super accessor/static/private fields, extends Error/Array, new.target, generators, for-of over array/string/Map/Set, destructuring, spread, template + tagged, `?.`/`??`/logical assignment, TDZ, per-iteration `let`, default params, computed/shorthand, arrow `this`/`arguments`, labels, `**`, async, try/finally in generators, `Symbol.hasInstance`, `super.x = v`). Compared with node running the original:

| Lowerer | Passes in node (ES5 output vs original) | Passes in mqjs | Failure causes in mqjs |
|---|---|---|---|
| SWC 1.x (es5) | 30/31 (TDZ dropped) | **12 / 30** | `TypeError: unsupported additional properties` (`Object.defineProperty` shape), `not a function` (missing `Object.getOwnPropertyDescriptor`/`defineProperties`/...), `catch variable already exists` (1), array hole (1), `Symbol`/`WeakMap`/`Promise` absent |
| Babel 8 preset-env ie11 | 30/31 (TDZ dropped) | **9 / 30** | **13 x `SyntaxError: catch variable already exists`**: mqjs rejects `catch (n)` when `n` is already a local/param in the function, and Babel's `asyncGeneratorStep(e,t,r,n,o,a,c)` helper does exactly that |
| TS 6 ES5 + downlevelIteration | 25/31: wrong for `super.getter` set, `extends Error` (`instanceof E` false), `extends Array`, computed getters, arrow `arguments`, `hasInstance` | **14 / 30** | plus array hole `[0, , 3, 4]` in `__generator` `trys.push` (SyntaxError: unexpected character) |
| Closure 20260927 (ES5, WHITESPACE_ONLY) | fails to lower `#private`, `new.target`, `super.x = v`, TDZ | **7 / 30** | `$jscomp` runtime missing (needs its polyfill inject) |

Facts about mqjs learned **[V]**: rejects duplicate/shadowing catch variable names; rejects array literal holes; direct `eval` is a SyntaxError; missing built-ins: `Symbol, Map, Set, WeakMap, Promise, Proxy, Reflect.construct, Object.{assign,freeze,entries,is,defineProperties,getOwnPropertyDescriptor,getOwnPropertyNames,getOwnPropertySymbols}, Array.{from,prototype.includes,flat,fill}, Number.isInteger, queueMicrotask, Error.captureStackTrace`. Present: `Object.defineProperty` (value and getter forms), `getPrototypeOf`, `setPrototypeOf`, `create`, `keys`, `Function.prototype.bind`, `Math.fround/imul`, `JSON`. (`mqjs` JSON.stringify also omits function-valued props differently than node; two "computed-shorthand" diffs are that, not lowering.)

Conclusion of E4: **generic ES5 lowerers are correct for node but emit helper code that mquickjs rejects**; "ES5" is not one target. mquickjs needs its own target profile with (a) a helper runtime written against its actual API, (b) a post-pass fixing catch-variable and hole patterns, (c) polyfills for the missing built-ins. That is a Zinc-owned stage, not an off-the-shelf preset.

## 4. Design: `zinc build` as named stages

### 4.1 Stage graph

```
resolve -> parse -> typecheck -> analyze(lint + compat) -> transform -> bundle -> optimize -> emit -> package
   |          |         |               |                      |          |          |         |        |
 platform   TS6 API   tsgo gate     zinc-lint rules       lower(engine)  esbuild   define,    per     assets,
 ext hook   + jsx/css                + compat report     ES5-dialect      IIFE/ESM  DCE,min    engine  fonts, engine.json
```

| # | Stage | Input -> output | Concrete tool | Notes |
|---|---|---|---|---|
| 1 | **resolve** | specifier -> file | TS `resolveModuleName` (today) behind a `resolve(spec, importer, ctx)` hook | ctx = `{ target, profile, engine }`. Default chain: `zinc:` std map -> plugin `modules` -> `platformVariant()` (`.<profile>.ts`, `.<target>.ts`, `.<engine>.ts`) -> node_modules with export conditions `["zinc", <engine>, "browser", "import"]`. The `.esp32.ts` study only fills the hook. |
| 2 | **parse** | text -> AST | TS 6 (semantic) ; oxc-parser for third-party JS (fast, no type info needed) | JSX/CSS pre-lowering stays in `frontend.ts` host (already a stage). |
| 3 | **typecheck** | AST -> diags | `tsc` 7 (tsgo) `--noEmit` as a *fast gate* in `zinc check`/CI/editor (0.35 s vs 1.7 s [V]); TS6 program for Sema | Keep single source of truth for diagnostics numbers `TSxxxx`/`Zxxxx`. |
| 4 | **analyze** | Sema + AST -> diags, report | Zinc-owned lint rules (Section 5) + `engine-compat` report (Section 5.3) | Errors here fail the build before C++/cmake. |
| 5 | **transform** | per file, cacheable | (native/VM: HIR, unchanged) ; JS engines: Zinc TS transformer `emit-js.ts` (numeric semantics) then **engine lowering profile**: `es2022` (quickjs, jsc, node), `es5-mqjs` (mquickjs) | Only `es5-mqjs` lowers; see 4.2. |
| 6 | **bundle** | file graph -> 1 file | **esbuild** with a `zinc-native` plugin (`zinc:*` -> runner-provided modules; [V] prototype above), `format: 'esm'` for quickjs/jsc/node (keeps TLA `runMain`, `engines.ts` entry), `'iife'` for mquickjs (no modules, no TLA) | Replaces `bundleJs()` copy (`engines.ts:130`). Module concatenation + tree-shaking come free; honour `"sideEffects"` from package.json. |
| 7 | **optimize** | bundle -> smaller/faster bundle | esbuild `define` (`__ZINC_TARGET__`, `__ZINC_ENGINE__`, `__ZINC_DEV__`, `ZINC_FEATURES.*`) + `minify` (identifiers+whitespace+syntax, **no property mangling**: `mangleProps` is unsafe with `zinc:script`/Dyn/`JSON.parse`/native ABI names), `pure` annotations for known-pure helpers; optional Closure ADVANCED post-pass for pure-Zinc code (later) | Copy PocketJS: target constants become `define`s so per-target branches vanish. Dev: no minify, keep names. |
| 8 | **emit** | -> engine artefact | native: C++ ; zinc-vm: ZBC4 + `.debug` ; quickjs: bundle -> **QuickJS bytecode** (`JS_WriteObject`, version-stamped in `engine.json`) with source fallback ; mquickjs: bytecode via `mqjs -o` for the target word size ; jsc/v8: source (+ code cache where the embedder supports it [I]) | Bytecode is a cache: `(engine version, flags, bundle hash)` key. |
| 9 | **package** | -> dist / firmware | existing `exportEngine`, `collectResources` (fonts subset already), + assets pipeline hooks (images -> textures, i18n tables) | `engine.json` fingerprints already exist (`engines.ts:65`); add stage hashes and the compat report. |

### 4.2 Lowering profiles (which tool, per engine)

| Engine | Profile | Lowering | Why |
|---|---|---|---|
| native (C++) | none (HIR) | n/a | |
| zinc-vm | none (HIR -> ZBC4) | n/a | |
| quickjs (ng 0.17) | `es2022` | none | QuickJS-ng is ~ES2023 **[V]**; PocketJS takes the same stance **[W]** |
| jsc (macOS), v8, node/sim | `es2022` (or `esnext`) | none | |
| mquickjs | `es5-mqjs` | see below | Section 3 E4 |
| browser (wasm tier) | `es2022` | none | |

**`es5-mqjs`, recommended construction (two tracks):**

- **Track A, Zinc-authored code (99% of Zinc apps, must be the first deliverable).** Do the lowering inside `emit-js.ts` while the type-checked TS AST and Sema types are available, instead of after the fact:
  emit classes as prototype functions with plain `=` assignments and getters via the supported `Object.defineProperty(value|get)` forms only, `for-of` over typed arrays only (Zinc knows the iterable kind statically; `docs/guide` forbids holey arrays), no `Symbol`, async/await mapped to explicit continuation functions (the C++ side does this with protothreads, `docs/decisions/0007-async-protothreads.md`), generators to a state machine or a Zinc-specific closure helper, `extends Error` via a helper written for mqjs, closures with per-iteration bindings. Zinc's language (no regex/eval/prototype surgery/`in`) makes this far smaller than a general lowerer. [I] ~4-6 weeks.
- **Track B, third-party JS (Three.js, npm libs).** `esbuild` (bundle) -> **SWC `jsc.target: es5`** (fast, correct, `externalHelpers` to share one helper module) -> `mqjs-fixup` pass (~150 lines on oxc-parser/`estree` walking: rename shadowing catch variables, remove holes, rewrite unsupported `defineProperty` descriptor shapes, replace `BigInt` literals with an error) -> polyfill bundle. Fall back to Babel only if SWC output has a correctness bug. Upstream Three.js is out of reach on mqjs regardless (mquickjs.md: 31-bit ints, no Proxy/Map/typed-array set); this track is for small pure-JS libs.

### 4.3 Hook / plugin API (Rollup-style)

Zinc already has "plugins" (native modules and displays, `plugins.ts`); add **pipeline plugins** in `zinc.json` (`"pipeline": ["./tools/my-stage.mjs"]`), an ESM file exporting:

```ts
export default (opts): ZincPipelinePlugin => ({
  name: 'my-stage',
  // Rollup-style build hooks; all receive ctx = { target, profile, engine, dev, project, cache }
  resolveId(spec, importer, ctx) { /* platform variants, aliases */ },
  load(id, ctx) { /* virtual modules, e.g. zinc:platform */ },
  transform(code, id, ctx) { /* per-file, content-addressed cache key includes plugin version+opts */ },
  analyze(program, sema, ctx) { /* return diagnostics */ },
  renderChunk(code, chunk, ctx) { /* after bundle: define, banner, wrap */ },
  emit(artifacts, ctx) { /* extra artefacts, e.g. bytecode */ },
  package(dist, ctx) { /* assets */ },
})
```

Design rule: hooks are a *subset of Rollup/Vite/Rolldown hooks* (`resolveId/load/transform/renderChunk`) so that esbuild plugins, Rollup plugins and later Rolldown can be reused with a shim; Zinc-only hooks are `analyze`, `emit`, `package`. Implement first as a thin wrapper around esbuild's plugin API (only bundle-level hooks) and Zinc's own stage runner for the rest; move to Rolldown if plugin reuse matters.

### 4.4 Persistent cache (content-addressed)

- Key = `sha256(file bytes + resolved import hashes + stage id + stage version + options subset + compiler hash)`; location `build/.zinc-cache/<stage>/<hash>` (project-local, gitignored) with an optional shared `~/.cache/zinc`.
- Reuse the fingerprints already computed for `--core` (`coreCompiler()`, `engines.ts:87`: hash of compiler+runtime sources).
- Cacheable: per-file transform (esbuild/SWC output), TS `Program` (tsbuildinfo or `--incremental` for the tsgo gate), bytecode, baked fonts/images (`collectResources` currently rebuilds per build; the docs report `baked 18 font sizes ... in 196 ms` [V]), and the compat report.
- Metro/PocketJS both cache per-file transforms by content hash **[W]**.

### 4.5 Dev mode and fast refresh

Current: full reload, state lost on native hot reload (`docs/dev-mode.md`). Path to per-module refresh, **JS engines first** (QuickJS/JSC), because native `.so` swap has no module identity:
(1) bundle in dev as a module registry (`__zn_define(id, factory)`, like Metro's `__d`) instead of a single scope; (2) on save, transform only the changed file (cache hit for the rest), push the new factory over the existing dev socket; (3) `zinc:ui/solid` and `zinc:ui/react` already own the component runtime (`lib/std/solid.ts`, `react.ts`), so a `$refresh` boundary is implementable in Zinc (react-refresh semantics for React, HMR re-run of the component for Solid). [I] 3-4 weeks after the registry bundle exists. For native/VM targets keep full reload; ZBC4 hot patching is a separate topic.

### 4.6 Lint, doctor, compat report

**`zinc lint`** (new command; also runs in stage 4 as warnings-become-errors with `--strict`):

- Shipped config generated by `zinc tsconfig` (already writes `tsconfig.json` and links the tsserver plugin, `tools.ts`): `eslint.config.mjs` and `.oxlintrc.json` referencing `@zinc/lint` (a package inside `lib/editor/`), so editors show target problems live.
- Rules (implemented once as ESLint-API rules; oxlint runs them through JS plugins **[W: alpha]**, ESLint runs them natively; both consume the same file):
  - `zinc/no-unsupported-syntax` with a per-engine table (mquickjs: `class`, arrow?, `let/const` are lowered by Zinc, so not errors; hard errors are `with`, direct `eval`, `Proxy`, `Symbol`, regex features beyond mqjs's, labelled tricks unsupported...). Generate from the same table as the compat report.
  - `zinc/no-unsupported-api` (name-based, type-aware through the Sema: `Promise` on mqjs unless polyfill on, `fetch` w/o `zinc:web/fetch`, node builtins `fs`, `path`, `child_process` forbidden -> point to `zinc:*`).
  - `zinc/no-dyn` (mirrors `--no-dyn`, `Z1017`), `zinc/no-regex` (`Z1008`), `zinc/numeric-narrowing` (i32 arithmetic overflow hints).
  - Baseline off-the-shelf for third-party code: `es-x/*` with `restrict-to-es2015`-style preset per profile, `eslint-plugin-compat` is browser-oriented and not useful.
- Perf: oxlint 0.05 s vs ESLint 0.7 s on the 195 KB bundle **[V]**; recommend oxlint in `zinc lint` (bundled binary via npm optional dep), ESLint config only for editors that already have it.
- Build-vs-buy: buy the linter engine, build ~10 rules (~1 week).

**`zinc doctor`**: extend `cli.ts:928` beyond tool probes: per-target toolchains (zig/cmake/idf/docker), engine binaries and version pins (QuickJS-ng 0.17, mqjs commit), `typescript6` vs `typescript` API state, a cache report, and the compat report for the current project.

**Engine compatibility report (preflight)** `zinc check --report [--engine E --target T]` -> `build/compat.json` + terminal table. Inputs:
1. Import graph from the resolver: every `zinc:*` module -> capability table (`capabilities.ts`, `@requires`, `Z5004` already exists) and per-engine ABI adapter availability (`abi.imports`, `engines.ts:20-24` already errors on missing adapters).
2. Syntax/API usage scan: parser walk (oxc) over app + node_modules JS, matched against `engines/<name>.json` (syntax features, globals available, quirks such as mqjs holes/catch).
3. Budget: bundle bytes vs target `heap`/flash budget (e.g. esp32 `zinc.json` heap), forbidden node builtins, dependency vet (lockfile hash list, license, size budget per package, `sideEffects` missing -> warn).
Output example rows: `mquickjs: Promise: polyfill (+6 KB) | classes: lowered | Symbol.iterator in lib/std/ui.ts:88: ERROR | regex in three/src/...:n: ERROR`.

### 4.7 Polyfill and shim policy

- Zinc owns the semantics of its own `zinc:*` modules, so the *shim per engine is part of the target profile*, not user-installed polyfills: `sim/zinc.mjs` (ES2022 node/QuickJS/JSC), `sim/zinc.es5.js` (mqjs; no `BigInt`/`Symbol`/class fields, see E3), `zinc:web` for Web APIs.
- Language built-ins: `Promise` (+ microtask drain driven by the C loop), `Map`, `Set`, `Object.{assign,entries,freeze,...}`, `Array.{from,includes,fill,flat}`, `Number.isInteger` for mqjs come from **one Zinc-authored ES5 polyfill bundle, tree-shakeable per use** (the compat report lists what got pulled in). Do not use `core-js` (size, feature-detection code paths assume `Symbol`).
- Web APIs for Three.js-class libs: browser-host tier and QuickJS/JSC get `canvas`/`Image`/`fetch`/`requestAnimationFrame` through `zinc:web` + a WebGL binding layer (threejs-webgl.md); on mqjs the answer is "unsupported, error in compat report".
- Rule: polyfills are injected by the bundler stage only when the compat scan finds the global, and they are visible in `zinc build --explain`.

## 5. Buy vs build and concrete choices

| Concern | Choice | Buy/build | Justification |
|---|---|---|---|
| Semantic TS API | `@typescript/typescript6` (keep) | buy | TS 7.0 ships no API **[V]**; single import site `frontend.ts:3` already isolates it |
| Fast type gate | `typescript@7` `tsc --noEmit` | buy | 4.8x faster **[V]**; already a devDependency |
| Bundler/minify/define | esbuild (Rolldown later for plugin reuse) | buy | 76 ms **[V]**; plugin API used successfully for `zinc:*`; Rolldown is Rollup-compatible and uses oxc [W] |
| Parser for third-party JS scans | oxc-parser | buy | fastest, ESTree output |
| Linter engine | oxlint + Zinc JS-plugin rules; ESLint config for editors | buy engine, build ~10 rules | oxlint plugin API alpha [W]: keep ESLint as fallback |
| ES5 for mqjs, Zinc code | Zinc's own emitter (Track A) | **build** | Only way to control mqjs quirks and keep Zinc's numeric semantics (Section 3) |
| ES5 for mqjs, foreign code | SWC (+Babel fallback) + `mqjs-fixup` | buy + build (~150 lines) | SWC 12/30 vs Babel 9/30 vs TS 14/30 raw on mqjs, all needed fix-ups; SWC fastest; TS is a dead end (deprecated) |
| Bytecode | `qjsc`-style `JS_WriteObject` in the runner; `mqjs -o` | build (small) | stage 8 |
| Cache | content-addressed dir | build (~300 lines) | reuse `--core` hashing |
| Asset pipeline | existing `resources.ts` + hooks | build | already ahead of PocketJS for fonts; add texture/i18n hooks |
| Advanced optimisation | Closure ADVANCED (optional, pure-Zinc bundles) | buy, later | needs types/externs work; not before Track A |

## 6. Expected performance wins by engine (evidence tagged)

| Stage | native (C++) | zinc-vm | quickjs-ng | jsc / v8 | mquickjs |
|---|---|---|---|---|---|
| resolve/parse/typecheck | dev-loop win only (tsgo gate 1.7 s -> 0.35 s **[V]**) | same | same | same | same |
| lint / compat report | applies (Zinc subset rules) | applies | applies | applies | **critical** (unblocks) |
| transform / lower | HIR (n/a) | HIR (n/a) | none (ES2023) | none | required (`es5-mqjs`) |
| bundle (single file) | n/a | n/a | fewer files, tree-shaking; 194 KB from 7 modules **[V]** | same | required (no ES modules) |
| define + DCE | build time, per-target constants | same | smaller bundle | same | required for RAM |
| minify | n/a | n/a | -45% bytes, **~0% parse time** (8.06 vs 8.78 ms) **[V]**; helps OTA/flash | same | flash size (ROM-able) [I] |
| bytecode precompile | n/a | already (ZBC4) | **skips ~9 ms parse per 195 KB on M1; ~100 ms on Pi 3B+ [I]**; plus lazy function compile in QuickJS [I] | JSC/V8 code cache [I] | bytecode from flash, no parser at run time [W mquickjs README] |
| lazy/inline requires | n/a | n/a | defer `ui.mjs`(167 KB) init; measurable only with a startup profile (not done) | same | RAM |
| snapshot (Wizer-like) | n/a | n/a | not available on QuickJS; hoist init at compile time [I] | V8 startup snapshot [I, not tested] | n/a |
| throughput | none | none | none for ES2022; **ES5 lowered code parses ~10% slower and is heavier at run time (helpers) [V parse only; run time not measured]** | none | ES5 dialect vs hand-written ES5: unknown |

Honest summary: the pipeline's value is mostly **enabling** (mquickjs, npm libs, lint before a 12 s cmake build, dev loop) and **size**, and secondarily startup via bytecode. It is not a throughput lever for QuickJS/JSC.

## 7. Milestones and effort (one strong developer, unvalidated **[I]**)

| M | Deliverable | Days |
|---|---|---|
| M0 | Stage runner skeleton in `cli.ts`/`engines.ts` (named stages, `--explain`, timings); move `bundleJs` behind stage `bundle`; `zinc-native` esbuild plugin; esbuild ESM/IIFE bundle for quickjs; `define` constants | 5-7 |
| M1 | Content-addressed cache (transform, bytecode, resources) | 4-5 |
| M2 | QuickJS bytecode emit + runner loads bytecode, source fallback, `engine.json` fields | 3-4 (aligns with "cheap wins" in README) |
| M3 | Lint: `@zinc/lint` package, ESLint config + oxlint plugin, 10 rules, `zinc lint`, `zinc tsconfig` writes config | 5-7 |
| M4 | Compat report (`zinc check --report`), engine tables `engines/*.json`, `zinc doctor` upgrade, bundle size budget | 6-8 |
| M5 | tsgo fast gate + incremental (`--incremental`) for `zinc check`/editor | 2-3 |
| M6 | Pipeline plugin API (`zinc.json` `pipeline`), Rollup-compatible subset, docs | 5-6 |
| M7 | Third-party npm in JS engines: export conditions, node_modules bundling, `sideEffects`, node-builtin ban, `three` on JSC/QuickJS via bundling instead of plugin rewrite | 6-10 |
| M8 | mquickjs Track A (`es5-mqjs` emitter profile + `sim/zinc.es5.js` + polyfill bundle) | 20-30 (part of mquickjs.md's 32-45) |
| M9 | mquickjs Track B (SWC + `mqjs-fixup`) | 5-7 |
| M10 | Dev registry bundle + per-module refresh for Solid/React on JS engines | 15-20 |
| M11 | Closure ADVANCED pilot (optional) | 8-12 |

Order: M0, M2, M1 (cheap wins, days), M3-M5 (developer experience, independent), M7 (unblocks Three.js on JSC/QuickJS), then M8/M9 only if the mquickjs decision is taken; M6, M10 later. M0-M5 ~ 25-34 days, no new engine.

## 8. Risks

- **mqjs moving target**: catch-variable/hole/defineProperty restrictions were found by trial; an `engines/mquickjs.json` conformance suite (the 30-case corpus is the seed, kept under `tests/`) must run in CI against the pinned mquickjs commit.
- **Two semantic authorities** if Track B foreign JS and Track A Zinc code interoperate in one bundle (numeric narrowing only applies to Zinc-typed code); keep them in separate bundle scopes.
- **Bytecode versioning**: QuickJS bytecode is not stable across versions; the fingerprint must include engine version and compile flags, and OTA must reject mismatches (`engine.json` already carries fingerprints).
- **esbuild vs Rolldown/oxc churn**: oxc minifier is alpha, oxlint JS plugins alpha **[W]**; wrap them behind the stage interface, pin versions, keep ESLint and esbuild as fallbacks.
- **TS 7 API gap**: if TS 7.x API changes semantics, `frontend.ts` is the only swap point, but Sema depends on checker details; keep `typescript6` pinned.
- **Property mangling / ADVANCED** break `Dyn`, `zinc:script` and ABI names; default off, opt-in per namespace.
- **Source maps**: bundling + minify + lowering multiplies the map chain; the VM has `.zbc.debug` sidecars (`engines.ts:55`) but the quickjs path has none; plan source-map v3 per stage (esbuild/SWC emit them) and a `zinc stack` resolver reading `.map` or `.zbc.debug`.
- **Not measured here**: runtime throughput of ES5-lowered code, bytecode load time, memory of retained source, mqjs run of the full UI bundle (needs the shim rewrite), Pi/ESP32 parse times.

## 9. Sources

- Repo: `compiler/src/{cli,frontend,engines,emit-js,plugins,tools,resources,sema}.ts`, `docs/dev-mode.md`, `docs/engines.md:208-275`, `docs/guide/02-language.md`, `docs/targets/capabilities.md`, [mquickjs.md](mquickjs.md), [README.md](README.md).
- PocketJS: [repo](https://github.com/pocket-nexus/pocketjs), [`tools/build.ts`](https://github.com/pocket-nexus/pocketjs/blob/main/tools/build.ts), [`docs/DESIGN.md`](https://github.com/pocket-nexus/pocketjs/blob/main/docs/DESIGN.md), [`docs/RUNTIMES.md`](https://github.com/pocket-nexus/pocketjs/blob/25081f644a39426f3c63c90aad8cb5f3fcdecdfa/docs/RUNTIMES.md).
- Metro: [Concepts](https://github.com/facebook/metro/blob/main/docs/Concepts.md), [Configuration](https://github.com/facebook/metro/blob/main/docs/Configuration.md), [Expo metro.config](https://docs.expo.dev/versions/latest/config/metro/); Re.Pack: [re-pack.dev](https://re-pack.dev/docs/getting-started/introduction).
- esbuild ES5: [issue #297](https://github.com/evanw/esbuild/issues/297). oxc: [lowering](https://oxc.rs/docs/guide/usage/transformer/lowering), [JS plugins alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html), [Vite 8 / Rolldown](https://vite.dev/blog/announcing-vite8).
- TypeScript: [6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [downlevelIteration deprecation PR](https://github.com/microsoft/TypeScript/pull/63071), [6.0 -> 7.0](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx).
- Closure: [type-based renaming](https://github.com/google/closure-compiler/wiki/Type-Based-Property-Renaming), [limitations](https://developers.google.com/closure/compiler/docs/limitations), [ES5 for-of size](https://github.com/google/closure-compiler/issues/4345).
- Prepack: [archived](https://github.com/facebookarchive/prepack). Hermes: [static_h](https://github.com/facebook/hermes/blob/static_h/doc/blog/README.md). Javy/Wizer: [Javy](https://bytecodealliance.org/articles/javy-hosted-project), [Wizer](https://github.com/bytecodealliance/wizer). ESLint es-x: [eslint-plugin-es-x](https://github.com/eslint-community/eslint-plugin-es-x).
- Not searched, from general knowledge and flagged [I]: V8 startup snapshots, Babel `transform-classes`/regenerator internals, Porffor, AssemblyScript, weval, import-map and lockfile vetting practice.


---

<!-- source: os-integration-widgets.md -->

# OS integration and OS widgets for Zinc apps (Electron/Tauri-style surface)

Date 2026-09-30. Read-only study of `/Users/mowmow/Lab/zinc` (dirty tree, nothing modified). Follows [README.md](README.md) and [studio-as-zinc-app.md](studio-as-zinc-app.md) (not redone; its gap list items 1, 6, 9, 12 are refined here).
Legend: **[V]** verified in repo/headers (file:line), **[W]** from a web source (linked in section 9), **[I]** my inference/estimate. Effort in person-weeks (pw), one engineer who knows the codebase, unvalidated. Cross-reference: a parallel study covers `.esp32.ts` twins and `Platform.has(cap)`; here features are gated by capability names such as `os.tray`.

---------------------------------------------------------------------------------------------------------------------

## 0. Verdict

1. **Most of the classic "desktop shell" checklist is already in the SDL3 that Zinc links; the work is plumbing, not research.** Installed SDL is 3.4.16 (`/opt/homebrew/include/SDL3/SDL_version.h`; it is a Homebrew system lib, **not vendored**) [V]. It has tray+menus, file/folder dialogs, message boxes, drop events, multi-mime clipboard, system theme + change event, power info, display enumeration, window opacity/transparent/utility/always-on-top/modal/parent/popup/hit-test/shape, taskbar progress and flash, `SDL_OpenURL`, `SDL_GetPrefPath` [V]. `hal_sdl.cpp` uses **none** of them: it uses ~45 SDL calls, only `SDL_SetClipboardText/GetClipboardText` (text) and `SDL_SetWindowAlwaysOnTop` (kiosk) from this list (`targets/macos/hal_sdl.cpp:117,434,442`) [V].
2. **What SDL3 does not have** (needs per-OS native code, ObjC++ on macOS first): native application menu bar (macOS `NSMenu` main menu), notifications, global shortcuts, deep links/URL schemes/file associations (this is *packaging + an event*), single-instance, autostart, dock badge/menu, keychain, biometrics, accent colour, updater, crash reporter, and every kind of OS widget.
3. **OS widgets cannot be written in Zinc.** WidgetKit needs a SwiftUI appex, Android needs a Glance/RemoteViews receiver, Windows needs a packaged WinRT/COM provider with Adaptive Cards, Plasma needs a QML plasmoid. What Zinc can honestly do is `zinc:widget`: an app declares a *data + layout descriptor* (a small JSON tree, close to Adaptive Cards), and `zinc export` generates per-OS thin native shells (Swift, Kotlin, C++/WinRT, QML) that render it and deep-link back into the app. The app process supplies data; it never draws the widget. [I from W]
4. **Naming clash:** `zinc:os` already exists (hostname/homedir/cpus/network, `lib/modules.d.ts:214-243`) [V]. Do not overload it; use a `zinc:desktop/*` family (or `zinc:shell`).
5. **Ranked first steps** (section 8): dialogs + drop + clipboard mime (SDL, ~2 pw) -> tray/menu-bar-only (SDL + one macOS hint, ~2 pw) -> theme/power/displays (~1 pw) -> notifications + single-instance + deep links (~4-5 pw) -> multi-window (4-6 pw, invasive). Widgets are last, and only as descriptor shells (macOS+Android first ~8-10 pw).

---------------------------------------------------------------------------------------------------------------------

## 1. What exists today in the repo (verified)

### 1.1 Host and HAL shape

| Item | Fact | Evidence |
|---|---|---|
| Hosts | `runtime/host.cpp` is 69 lines, `runtime/dev_host.cpp` 120 lines: thin shells around the program `.so`; the window lives in the HAL | `wc -l` [V] |
| HAL contract | One `hal_*` C ABI per target: `hal_init`, `hal_poll_input`, `hal_present`, `hal_run`, `hal_window_handle`, `hal_clipboard_get/set` (text only), `hal_set_cursor`, `hal_text_input` | `runtime/include/hal.h:63-74,98-131` [V] |
| Optional-hook pattern | Weak no-op defaults in the runtime for features a HAL may lack (`hal_clipboard_*`, `hal_set_cursor`, `hal_text_input`, `hal_escape*`, `hal_pixel_scale`) | `runtime/gfx.cpp:26,924-936` [V] |
| SDL3 HAL | One `static SDL_Window* win` + renderer, created once with `SDL_INIT_VIDEO` only; resizable, high-DPI; `SDL_AddEventWatch`; quit on `SDL_EVENT_QUIT` unless kiosk | `targets/macos/hal_sdl.cpp:76,110,120,288` [V] |
| Targets | `targets/{macos,common,esp32,null,ps1,ps2,wasm}`; `hal_sdl.cpp` serves macOS and Linux windows; no Windows | `ls targets`; `docs/reports/research-2026-09-30/studio-as-zinc-app.md:§1` [V] |
| Window handle escape hatch | `hal_window_handle()` returns the `SDL_Window*`; `webview.mm` turns it into an `NSWindow*` via `SDL_PROP_WINDOW_COCOA_WINDOW_POINTER` | `hal.h:124`, `targets/macos/hal_sdl.cpp:461`, `plugins/webview/src/webview.mm:109-111` [V] |
| Display plugins | `plugins/display-{fbdev,gl,remote,rmpp,scrollphat,ssd1306,st7789,ws2812}` drive frames through `hal_display`; `host_window` keeps the SDL window | `hal.h:134-145` [V] |

### 1.2 Plugins and modules

- Plugins today: `3d canvas2d device devtools display-* ffi gestures gphoto2 imu-qmi8658 ink lottie map mapping pixelfont process remarkable remote-view script socket sqlite svg three video wasm webview` [V].
- Shape (ADR 0010, `docs/plugins.md:12`): `plugin.json` (`kind: module`, `module: "zinc:x"`, `entry`, `targets`, `sources`, `pkg`, `frameworks`, `libs`, `defines`, `options`, `requires`, `packages`), `index.ts` (typed wrapper), and `native/<name>.spec.ts` (typed native interface, `requireNative<Spec>('Name')`), `native/<name>.<target>.cpp|.host.cpp`, `native/<name>.sim.ts` (headless twin) [V: `docs/plugins.md:30-51`, `plugins/webview/*`, `plugins/process/*`].
- Best precedent for this work: `plugins/webview` = spec (`webview.spec.ts`: handle-based, one `onEvent(cb)` callback), macOS-only ObjC++ (`src/webview.mm`, `"frameworks": ["WebKit","Cocoa"]`, `"pkg":["sdl3"]`, `plugin.json`), and a sim twin with no-op stubs (`native/webview.sim.ts`). A tray/dialog/notification plugin is the same skeleton [V].
- `zinc:process`: `posix_spawnp` + pipes; targets macos/linux/rpi1 only (`plugins/process/plugin.json`) [V]. Can shell out to `osascript`, `notify-send`, `open`, `xdg-open` as a stopgap [I].
- `zinc:webview`: macOS only; its `invoke` command allowlist model ("commands that are not registered reject", `plugins/webview/index.ts:5-6`) is the only existing capability-style gate [V].
- `zinc:script` (QuickJS-ng sandbox): "sees only what the host exposes" (`docs/plugins/script.md:136,282`) [V]. This is the seam for gating OS APIs from user scripts (section 6).
- `lib/std/kit/host.ts`: JSX helpers shared by Solid/React models. **Not an OS-integration layer** despite the name [V]. In-app kit `Dialog`, `Popover`, `DropdownMenu`, toast exist (studio report §1) [V].

### 1.3 Capabilities and packaging

- `targets/capabilities.json` lists hardware booleans per profile (`net, fs, audio, gpu, process, dynlib, pointer, keyboard...`); `requires` in `zinc.json`/`plugin.json` is checked at build time (Z5005), plugin availability via `targets` (Z5003) [V: `docs/plugins.md:39,46`, `targets/capabilities.json:3-12`]. No `os.*` capability exists yet; adding `os.tray` etc. fits the same table (values `true|false|"plugin"|"optional"`).
- No permission model in `zinc.json` (grep of `docs/plugins.md`, `docs/guide/08-security.md` for permissions: only plugin availability and the systemd hardening in `docs/reports/security-audit.md:30`) [V].
- Packaging: `macBundle()` writes `Info.plist` with only CFBundle keys + `NSHighResolutionCapable`, icon `.icns`, ad-hoc or Developer-ID `codesign --options runtime` (`compiler/src/tools.ts:297-322,197-198`); Linux gets a `.desktop` (`tools.ts:209`) and systemd unit. **No entitlements, no `LSUIElement`, no `CFBundleURLTypes`, no `CFBundleDocumentTypes`, no App Group, no MSIX/NSIS/AppImage/Flatpak/DMG** [V].
- OS integrations grep (notifications, tray, menus, dialogs, drop): none in `runtime/`, `targets/`, `plugins/`, `lib/std` [V].

### 1.4 SDL3 header inventory (3.4.16, `/opt/homebrew/include/SDL3`) [V]

| Need | SDL3 API | Notes |
|---|---|---|
| Tray + menus | `SDL_CreateTray(icon,tooltip)`, `SDL_SetTrayIcon/Tooltip`, `SDL_CreateTrayMenu`, `SDL_CreateTraySubmenu`, `SDL_InsertTrayEntryAt` (`SDL_tray.h:121-310`) | 24 functions; entries: label, checkbox, button, submenu, enabled/checked, callbacks [W wiki]. No badge, no rich content. |
| Open/save/folder dialog | `SDL_ShowOpenFileDialog`, `SDL_ShowSaveFileDialog`, `SDL_ShowOpenFolderDialog`, `SDL_ShowFileDialogWithProperties` (`SDL_dialog.h:166,326`) | Async callback, must be pumped by the event loop. Backends (NSOpenPanel / Win32 / xdg-portal or zenity) [I]. |
| Message box | `SDL_ShowMessageBox`, `SDL_ShowSimpleMessageBox` (`SDL_messagebox.h`) | Custom buttons and colour scheme; modal. No colour picker, no text-input prompt. |
| Drag-drop in | `SDL_EVENT_DROP_FILE/TEXT/BEGIN/COMPLETE/POSITION` (`SDL_events.h:232-236`) | Files and text only. No drag-out. |
| Clipboard | `SDL_SetClipboardData(callback,...)`, `SDL_GetClipboardData(mime)`, `SDL_HasClipboardData`, `SDL_GetClipboardMimeTypes`, `SDL_EVENT_CLIPBOARD_UPDATE` (`SDL_clipboard.h`, `SDL_events.h:229`) | Any mime, lazily provided. Rich text/HTML/image = mime plumbing only. |
| Theme | `SDL_GetSystemTheme()`, `SDL_EVENT_SYSTEM_THEME_CHANGED` (`SDL_events.h:119`) | light/dark only; **no accent colour**. |
| Power | `SDL_GetPowerInfo(&secs,&pct)` | Battery state polling; **no suspend/resume/lock/idle events** [I]. |
| Displays | `SDL_GetDisplays`, `SDL_GetDisplayContentScale`, `SDL_GetDisplayForWindow`, `SDL_GetWindowSafeArea`, `SDL_EVENT_DISPLAY_ADDED` | Bounds, scale, refresh, safe area (notch). |
| Windows | flags `ALWAYS_ON_TOP, UTILITY, TOOLTIP, TRANSPARENT, NOT_FOCUSABLE` (`SDL_video.h:213-222`), `SDL_SetWindowParent/Modal/Opacity/HitTest/Shape`, `SDL_CreatePopupWindow`, `SDL_ShowWindowSystemMenu`, `SDL_FlashWindow`, `SDL_SetWindowProgressState/Value` | Frameless = `SDL_WINDOW_BORDERLESS` + hit-test drag regions. **No vibrancy/blur/Mica** (native call needed). |
| Misc | `SDL_OpenURL` (`SDL_misc.h:72`), `SDL_GetPrefPath`, `SDL_HINT_MAC_BACKGROUND_APP` (`SDL_hints.h:2637`), `SDL_HINT_APP_ID` (`SDL_hints.h:184`) | `OpenURL` = "open"; **no reveal-in-file-manager**. Background-app hint = menu-bar-only mode on macOS. |
| Multi-window | Any number of `SDL_Window`s | The blocker is Zinc's singletons (one static `win`+renderer in the HAL, one `gfx`/`ui` surface), not SDL. |

Conclusion: `hal_sdl.cpp` can expose all of the above through weak `hal_desktop_*` hooks (pattern of `gfx.cpp:924-936`) with no new dependency [I]. Version to pin: 3.4.x (tray + progress + safe area exist; 3.2 would lack some) [V header presence, W for earlier versions].

---------------------------------------------------------------------------------------------------------------------

## 2. How other frameworks slice the API surface

### 2.1 Electron [W: electronjs.org docs]

- **Process split**: OS APIs live in the *main* process (`app`, `BrowserWindow`, `Tray`, `Menu`, `dialog`, `Notification`, `globalShortcut`, `powerMonitor`, `safeStorage`, `autoUpdater`, `screen`, `shell`, `nativeTheme`, `protocol`); renderers reach them through IPC or a preload `contextBridge`. Security = "expose named channels" (contextIsolation, sandbox on by default), not per-API permissions. [W]
- Entry points seen in docs: `Tray` ("icons and context menus in the system's notification area"), `app.requestSingleInstanceLock()` (second instance event), `app.setAsDefaultProtocolClient()`, `dialog.showOpenDialog/showMessageBox`, `Notification`, `powerMonitor` (suspend/resume/lock-screen/idle), `safeStorage` (Keychain/DPAPI/libsecret), `autoUpdater` (Squirrel.Mac/Windows; Linux external) [W].
- Not in Electron core: autostart (`app.setLoginItemSettings` yes, macOS/Windows only), widgets (none), Shortcuts/Intents (none), WidgetKit (none; needs a Swift appex bolted on by hand) [W/I].

### 2.2 Tauri 2 [W: v2.tauri.app/plugin, plugins-workspace]

- Core provides windows (`tao`), webview (`wry`), menus (`muda`), tray (`tray-icon`), all as Rust crates; **everything else is an official plugin**: notification, dialog, global-shortcut, deep-link, single-instance, autostart, updater, store, stronghold, os, positioner, window-state, opener (shell open/reveal), clipboard-manager, fs, http, log, process, upload, websocket, sql, biometric (mobile), barcode-scanner (mobile), nfc, haptics [W: search results list autostart, dialog, deep-link, global-shortcut, notification, positioner, single-instance, updater, window-state; remaining names from plugins-workspace listing, [I] partially unverified].
- **Permission model**: each plugin ships a `permissions/` set (`allow-*`, `deny-*` per command, plus scopes such as fs paths), grouped in *capabilities* JSON files that bind permissions to windows/webviews; the runtime rejects unlisted IPC commands [W]. This is the closest analogue for Zinc `zinc.json`.
- Mobile plugins are Kotlin/Swift with a Rust bridge (same plugin, per-OS native code) [W].

### 2.3 Others (all [W] unless noted)

| Framework | OS-integration shape |
|---|---|
| Wails | Go runtime API (`runtime.MenuSetApplicationMenu`, `runtime.OpenFileDialog`, `EventsEmit`); tray only in v3 alpha |
| Neutralino | `Neutralino.os.*` (showOpenDialog, showNotification, setTray), gated by a static `nativeAllowList` in `neutralino.config.json` |
| Flutter | packages, not core: `tray_manager`, `window_manager`, `flutter_local_notifications`, `local_auth`, `flutter_secure_storage`, `home_widget` (widgets = native extension + shared storage) |
| Qt | `QSystemTrayIcon`, `QMenu/QMenuBar` (native macOS menu bar), `QFileDialog`, `QSharedMemory/QLockFile` |
| Slint | minimal: menus (MenuBar element), no tray in core; uses winit |
| Dioxus desktop | tao/wry like Tauri: `use_muda_event_handler`, tray via `tray-icon` |
| Compose Multiplatform Desktop | composables `Tray()`, `MenuBar`, `Window`, `Dialog`; notifications via `TrayState.sendNotification` [W: kotlinlang.org compose-desktop-tray] |
| .NET MAUI | no cross-platform widget API: each platform needs its own native extension (WidgetKit / Glance) and shared storage [W: mobiletechlead.com] |
| Avalonia | `TrayIcon`, `NativeMenu` (native macOS menu bar), `StorageProvider` (dialogs), `Screens`, `PlatformSettings` (theme + accent) [W/I] |

**Pattern across all of them**: (a) a small always-available core (window, menu, tray, dialog) plus (b) opt-in modules per concern, each with a permission/allowlist entry, (c) native code per OS behind one typed API, (d) nothing crosses into OS widgets without a hand-written per-OS extension.

### 2.4 Underlying native libraries and APIs [W unless noted]

| Concern | macOS | Windows | Linux |
|---|---|---|---|
| Tray | `NSStatusItem` (+ `NSMenu`, `LSUIElement`) | `Shell_NotifyIconW` (+ hidden message window) | StatusNotifierItem over D-Bus (libappindicator / libayatana; GNOME needs the AppIndicator extension; Flatpak needs SNI permission) |
| Menu | `NSMenu` main menu + contextual `NSMenu` (`muda` wraps it) | `HMENU` / `TrackPopupMenu` | GTK menus / dbusmenu; no global menu bar convention |
| Notifications | `UNUserNotificationCenter` (needs signed bundle id; auth prompt) | `AppNotification`/toast via WinRT (needs AUMID; unpackaged apps need a Start-menu shortcut with AUMID) | `org.freedesktop.Notifications` (libnotify, `notify-rust`) or portal `org.freedesktop.portal.Notification` |
| File dialogs | `NSOpenPanel/NSSavePanel` | `IFileDialog` | portal `org.freedesktop.portal.FileChooser` (Flatpak-safe), else GTK/zenity |
| Theme | `NSApp.effectiveAppearance`, `NSColor.controlAccentColor` | `UISettings` (accent, colour values) | portal Settings `org.freedesktop.appearance` `color-scheme` / `accent-color` [W: flatpak portal docs] |
| Global shortcut | Carbon `RegisterEventHotKey` (no permission) / CGEventTap (Accessibility permission) | `RegisterHotKey` | X11 `XGrabKey`; Wayland: portal `GlobalShortcuts` (compositor-dependent) |
| Deep link | `CFBundleURLTypes` + `application:openURLs:` (Apple Event) | registry / MSIX `windows.protocol` | `.desktop` `MimeType=x-scheme-handler/...` |
| Keychain | Security.framework (`SecItem*`) | DPAPI / Credential Manager | libsecret (Secret Service D-Bus) or portal Secret |
| Biometric | `LocalAuthentication` (`LAContext`), Touch ID | Windows Hello (`UserConsentVerifier`) | none standard (fprintd/polkit) |
| Login item | `SMAppService` (13+) | `HKCU\...\Run` or MSIX `startupTask` | `~/.config/autostart/*.desktop` or portal Background `RequestBackground` |
| Idle/power | `IOPMAssertion`, `NSWorkspace` notifications | `WM_POWERBROADCAST`, `WTSRegisterSessionNotification` | logind D-Bus (`PrepareForSleep`, `Lock/Unlock`), `org.freedesktop.ScreenSaver` |
| Reveal in file manager | `NSWorkspace activateFileViewerSelectingURLs` | `SHOpenFolderAndSelectItems` | `org.freedesktop.FileManager1.ShowItems` D-Bus |
| Vibrancy/blur | `NSVisualEffectView` | Mica/Acrylic via `DwmSetWindowAttribute` | compositor-specific (KDE blur protocol), mostly none |
| Screenshots | `CGWindowListCreateImage` / ScreenCaptureKit (Screen Recording permission) | `BitBlt` / `Windows.Graphics.Capture` | portal `Screenshot` / `ScreenCast` (Wayland: user consent required) |

---------------------------------------------------------------------------------------------------------------------

## 3. OS widgets: what is technically required

| Platform | Mechanism | Technical requirements | Can a non-native app supply it? |
|---|---|---|---|
| **macOS WidgetKit** (desktop widgets, macOS 14+ also iPhone widgets on desktop) | A **Widget Extension appex** (separate process, own `Info.plist`) inside the `.app`, SwiftUI-only UI with a `TimelineProvider` returning `Timeline` entries + reload policy | Xcode-style target; App Groups capability (`group.*`) for shared data (`UserDefaults(suiteName:)` or shared files); signed with the same team; refresh budgeted by the system. [W: Apple docs, useyourloaf] | The **data** yes (write JSON into the app-group container from any language). The **view and provider** must be Swift/SwiftUI compiled into the appex. The requirement for SwiftUI applies to the widget view only; the host app can be UIKit/anything [W]. Interactive widgets use App Intents (Swift). |
| **iOS/iPadOS** | Same appex; also lock-screen widgets, **Live Activities** (ActivityKit, push-token updates), Control widgets (iOS 18), App Intents/Shortcuts | Same + entitlements; Live Activities need push notifications infra for remote updates | Same answer: data via app group, UI in Swift. Zinc has no iOS HAL yet (`docs/reports/ios-core-runtime.md` proposes one) [V]. |
| **Windows 11 Widgets Board** | Provider = packaged Win32/WinRT app implementing `IWidgetProvider` (CreateWidget, DeleteWidget, OnActionInvoked, OnWidgetContextChanged, Activate, Deactivate); UI = **Adaptive Cards JSON template + data JSON** returned by the provider | **MSIX/APPX manifest** registration with COM server, out-of-proc activation; local dev needs Developer Mode; provider can be C++/WinRT, C#, or a PWA [W: Microsoft Learn widget-providers] | Yes, the most friendly: provider is a normal packaged exe, UI is declarative JSON. A Zinc app could *be* the provider if it can be MSIX-packaged and expose the COM factory. Blocked by no Windows target. |
| **Android App Widgets** | `AppWidgetProvider` (BroadcastReceiver) + `appwidget-provider` XML + `RemoteViews` (a fixed set of view classes); Jetpack Glance is a Compose-style DSL that *compiles to RemoteViews* [W: developer.android.com Glance] | Kotlin/Java receiver declared in the APK manifest; updates via `AppWidgetManager` or WorkManager | UI = RemoteViews limits (no custom drawing, except a `Bitmap` into an `ImageView`). A Zinc NativeActivity app could render a **bitmap** widget (image + tap intents) with a tiny generated Kotlin receiver. |
| **Linux/KDE Plasma** | **Plasmoid**: a KPackage with `metadata.json` (`KPackageStructure: Plasma/Applet`) + QML (`main.qml`), optional C++ plugin [W: develop.kde.org] | Install to `~/.local/share/plasma/plasmoids/<id>/`; Plasma 6 API | Pure QML shell reading a JSON/socket from the app (files, D-Bus, local socket). No Zinc code runs inside. |
| **GNOME** | Panel applets were removed in GNOME 3; only **Shell extensions** (GJS, per-Shell-version, reviewed at extensions.gnome.org) [W]. GNOME 44+ shows "Background Apps" via the portal (status only) [W] | JS extension tied to shell version | Data via D-Bus/file; extension is JS. High maintenance churn: skip. |
| **Linux tray** | StatusNotifierItem D-Bus (AppIndicator on GNOME via extension) | see 2.4 | Zinc can implement (SDL tray on Linux already targets it, [I]). |
| **Desktop/wallpaper widgets** | macOS: WidgetKit desktop widgets; Windows: none (Rainmeter is third-party); Linux: Conky/Plasma; wallpaper engines = own windows | Zinc can do a **borderless, transparent, below/utility window** via SDL flags (`SDL_WINDOW_TRANSPARENT`, `UTILITY`, click-through via hit-test) with no OS help [V flags, I] | Yes, because it is an ordinary Zinc window. |
| **reMarkable / e-ink** | xochitl has no widget/third-party home-screen API; Zinc apps run via AppLoad (`docs/targets/remarkable-paper-pro.md`) [V that AppLoad is referenced]. Only "widget" = an app/full-screen sleep screen or a `zinc:remote` companion [I] | none | n/a. A "widget" on e-ink is a small always-running app tile drawn by the launcher, if AppLoad supports it (unverified). |
| **Menu-bar-only apps** | macOS `LSUIElement=true` in `Info.plist` (no Dock icon, no main menu), or runtime `NSApp.setActivationPolicy(.accessory)`; SDL exposes `SDL_HINT_MAC_BACKGROUND_APP` [V header] | window optional; tray required | Yes, fully within Zinc: SDL tray + hint + optional popover window. |

### 3.1 What a cross-platform `zinc:widget` honestly is [I]

A **descriptor**, not a renderer:

```
Widget = { id, sizes:[small|medium|large|...], refresh:{ every:'15m'|'push' }, template: Card, data: JSON, actions:[{id, deepLink}] }
Card   = tree of: Text, Image(bitmap|symbol), Row, Column, ProgressBar, Chart(sparkline), Button(actionId), Spacer
```

- The app (or a headless "widget mode" of the same binary, launched by the OS shell) produces `{template, data}`; the descriptor subset is the *intersection* of Adaptive Cards, SwiftUI stacks, Glance, QML Row/Column.
- `zinc export` generates: a **SwiftUI appex** (interpreting the JSON with a small generic renderer; Zinc ships that Swift once, not per app), an **Android Glance/RemoteViews receiver** (same), a **Windows provider** (`IWidgetProvider` returning Adaptive Card JSON, nearly 1:1), a **Plasma QML applet** (generic renderer). Data travels through app-group container / `SharedPreferences` / provider push / local file/socket.
- Taps become **deep links** (`myapp://widget/<action>`), handled by `zinc:deeplink`, so widgets depend on that module.
- Cannot be done: arbitrary Zinc drawing inside a widget, per-frame animation, running Zinc TS inside the appex (iOS widget process is memory-capped and JIT-less; the Zinc VM is JIT-free so feasible in principle but out of scope [I]), interactive widgets beyond button->deeplink/intent, Live Activities without a push server, GNOME.
- Cheaper interim for "glanceable" needs: render the widget to a **bitmap** (Zinc already has a software rasterizer) and let a fixed native shell show `Image + tap` per OS. This is `zinc:widget` v0, needs no schema and works on Android RemoteViews, WidgetKit (`Image`), Plasma (`Image`) [I].

---------------------------------------------------------------------------------------------------------------------

## 4. Design: module surface

### 4.1 Principle

- One module per concern (small, individually gated, each with `.sim.ts`), namespaced `zinc:desktop/*` (not `zinc:os`, taken).
- Async results delivered on the event loop (same as `zinc:webview` `onEvent`, SDL dialog callbacks). No blocking modal calls.
- Handle-based specs (integers), typed wrapper in `index.ts`, like `webview.spec.ts` / `webview/index.ts`.
- Each module registers a capability name (`os.tray`, ...) in `targets/capabilities.json` and a permission id (`desktop.tray`) in `zinc.json`.

### 4.2 Modules

| Module | Capability | Content |
|---|---|---|
| `zinc:desktop/dialog` | `os.dialog` | open/save/folder dialogs, message box, (color, prompt as kit fallbacks) |
| `zinc:desktop/tray` | `os.tray` | tray icon, tooltip, menu, click events, `menuBarOnly` |
| `zinc:desktop/menu` | `os.menu` | application menu (macOS native; others in-app kit `MenuBar`), context menus |
| `zinc:desktop/notify` | `os.notify` | notifications with actions and reply |
| `zinc:desktop/window` | `os.window` | multi-window, frameless, always-on-top, transparent, vibrancy, progress, badge, flash, displays |
| `zinc:desktop/shortcut` | `os.shortcut` | global hotkeys |
| `zinc:desktop/app` | `os.app` | single instance, deep links, file associations (open-file events), autostart, dock badge/menu, quit/relaunch, updater hooks |
| `zinc:desktop/system` | `os.system` | theme+accent, power/idle/lock events, displays, open/reveal, clipboard rich (`zinc:gfx` clipboard extended) |
| `zinc:desktop/secret` | `os.secret` | keychain/credential store, biometric gate |
| `zinc:widget` | `os.widget` | widget descriptors (section 3.1) |
| `zinc:desktop/intent` | `os.intent` | Shortcuts/App Intents/App Actions registration (descriptor, later) |

### 4.3 Typed sketches (illustrative, [I])

```ts
// zinc:desktop/dialog  (SDL_ShowOpenFileDialog & friends; sim: scripted answers)
export interface FileFilter { name: string; patterns: string[] }        // ['png','jpg']
export interface OpenOptions { title?: string; defaultPath?: string; filters?: FileFilter[]; multiple?: boolean; folder?: boolean }
/** Resolves to the chosen paths, or [] when cancelled. Delivered on the event loop. */
export function open(o: OpenOptions, done: (paths: string[]) => void): void;
export function save(o: { title?: string; defaultPath?: string; filters?: FileFilter[] }, done: (path: string | null) => void): void;
export interface MessageOptions { title: string; message: string; kind: 'info' | 'warning' | 'error'; buttons: string[]; defaultButton?: i32 }
export function message(o: MessageOptions, done: (button: i32) => void): void;

// zinc:desktop/tray
export interface MenuItem { id: string; label: string; kind?: 'normal' | 'check' | 'separator' | 'submenu'; checked?: boolean; enabled?: boolean; accelerator?: string; items?: MenuItem[] }
export class Tray {
  constructor(o: { icon: string; tooltip?: string; template?: boolean /* macOS monochrome */ });
  setMenu(items: MenuItem[]): void;
  setIcon(icon: string): void; setTooltip(t: string): void; setTitle(t: string): void; // title = macOS menu-bar text
  onClick(cb: (button: 'left' | 'right') => void): void;
  onMenu(cb: (id: string) => void): void;
  close(): void;
}
export function menuBarOnly(on: boolean): void;    // LSUIElement/accessory policy, no dock icon

// zinc:desktop/notify
export interface Notification { title: string; body?: string; icon?: string; actions?: { id: string; label: string }[]; silent?: boolean; id?: string }
export function requestPermission(cb: (granted: boolean) => void): void;
export function show(n: Notification): void;
export function onAction(cb: (notifId: string, action: string) => void): void;

// zinc:desktop/window
export interface WindowOptions { title: string; w: number; h: number; x?: number; y?: number; frameless?: boolean; alwaysOnTop?: boolean;
  transparent?: boolean; vibrancy?: 'none' | 'sidebar' | 'menu' | 'popover' | 'hud'; modalOf?: Window; utility?: boolean; resizable?: boolean; clickThrough?: boolean }
export class Window { readonly id: i32; setProgress(v: number | null): void; setBadge(text: string | null): void; flash(): void; close(): void; onClose(cb: () => void): void; }
export interface Display { id: i32; x: i32; y: i32; w: i32; h: i32; scale: number; refreshHz: number; primary: boolean }
export function displays(): Display[];

// zinc:desktop/app
export function singleInstance(onSecond: (argv: string[], cwd: string) => void): boolean;  // false: another instance owns the lock
export function onOpenUrl(cb: (url: string) => void): void;                                // deep link
export function onOpenFile(cb: (path: string) => void): void;                              // file association / dock drop
export function setAutostart(on: boolean): boolean;

// zinc:desktop/system
export function theme(): { dark: boolean; accent: string | null };
export function onThemeChange(cb: () => void): void;
export function onPower(cb: (e: 'suspend' | 'resume' | 'lock' | 'unlock' | 'idle' | 'active') => void): void;
export function battery(): { percent: i32; seconds: i32; charging: boolean } | null;
export function openExternal(url: string): void;             // SDL_OpenURL
export function reveal(path: string): void;                  // NSWorkspace / SHOpenFolderAndSelectItems / FileManager1
```

Kit layer: `MenuBar`, `ContextMenu`, `FilePicker` in `lib/std/kit` fall back to the in-app implementation when `Platform.has('os.dialog')` is false (wasm, rpi1 without desktop, rmpp).

---------------------------------------------------------------------------------------------------------------------

## 5. Mapping to SDL3 vs per-OS native, inside plugin/HAL

Two layers, matching existing patterns:

1. **HAL hooks** (for things SDL owns and that touch the window/event loop): add weak `hal_desktop_*` functions in `runtime/include/hal.h` with weak defaults in the runtime (`runtime/gfx.cpp:924-936` pattern) and implement in `targets/macos/hal_sdl.cpp`. Covers: drop events (`SDL_EVENT_DROP_*` in the event pump at `hal_sdl.cpp:288` neighbourhood), theme change, clipboard mime, `SDL_OpenURL`, displays, power, window flags. **Multi-window is the exception**: `hal_sdl.cpp` has a single `win`/`ren` (line 110) and gfx/ui are singletons; needs a window table + per-window surface [V single, I plan]. Effort 4-6 pw (matches studio report gap 6).
2. **Plugins** (for native code with dependencies): `plugins/desktop-*/` with `plugin.json` per target, `native/*.spec.ts`, `native/*.macos.cpp|.mm`, `native/*.linux.cpp`, `native/*.win32.cpp`, `native/*.sim.ts`. Windows entries are speculative until a Windows host exists (prior research: none; studio report gap 7).

| Feature | SDL3 (HAL) | Native per OS (plugin) | sim twin |
|---|---|---|---|
| Dialogs | yes, all OS | none needed (color picker: NSColorPanel later) | scripted queue: `sim.dialog.answer([...])` |
| Tray | yes (macOS/Win/Linux SNI) | `NSStatusItem` for template icons, title text, popover; Linux fallback via D-Bus SNI if SDL's backend is weak [I] | records menu; `sim.tray.click(id)` |
| App menu bar | no | macOS ObjC++ `NSMenu` (precedent `webview.mm`); Windows/Linux: in-app kit `MenuBar` | records menu tree |
| Notifications | no | macOS `UNUserNotificationCenter` (needs bundle id, so only from `.app`), Windows `AppNotification`, Linux D-Bus/portal | log array |
| Global shortcuts | no | macOS Carbon hotkeys (no permission), Windows `RegisterHotKey`, Linux X11/portal | `sim.shortcut.fire(...)` |
| Deep link/file open | events partly (`SDL_EVENT_DROP_FILE` for dock open on macOS [I]) | Info.plist keys, `application:openURLs:`, MSIX protocol, `.desktop` MIME | `sim.app.openUrl(...)` |
| Single instance | no | `flock`/named pipe/`CreateMutex` + argv forward via local socket (Zinc has `zinc:socket` Unix domain) | always true |
| Autostart | no | `SMAppService`, registry, `.desktop` | in-memory flag |
| Badge/progress | `SDL_SetWindowProgress*`, `SDL_FlashWindow` | `NSDockTile.badgeLabel`, `ITaskbarList3` overlay | recorded |
| Vibrancy | no | `NSVisualEffectView` / DWM | no-op |
| Keychain | no | Security.framework / DPAPI / libsecret | in-memory map |
| Theme/accent | theme yes | accent: `NSColor.controlAccentColor`, `UISettings`, portal | scripted |
| Power/idle | `SDL_GetPowerInfo` only | `NSWorkspace` notifications, logind, `WM_POWERBROADCAST` | scripted events |
| Widgets | no | per-OS generated shells (section 3.1) | descriptor validator + snapshot render to PNG |
| Updater | no | see section 7.4 | manifest check only |

Testing: same as other plugins: `.sim.ts` run under the node sim (`docs/plugins.md:45` nodeFlags mechanism) so `zinc test` exercises the app logic headlessly; native paths get a small "desktop-smoke" example run under the real host by hand or with the existing replay tapes (studio report cites goldens/replay).

---------------------------------------------------------------------------------------------------------------------

## 6. Capability gating and the security model

Three independent gates, from cheapest to strictest [I, modelled on Tauri capabilities and Neutralino nativeAllowList, W]:

1. **Build-time availability** (exists): `plugin.json` `targets` (Z5003) and `requires` (Z5005) against `targets/capabilities.json`. Add capability names `os.tray`, `os.menu`, `os.dialog`, `os.notify`, `os.window`, `os.shortcut`, `os.app`, `os.system`, `os.secret`, `os.widget`. Values: `true` on macos/linux desktop, `"optional"` where the feature depends on the environment (Linux tray needs SNI, notification needs a daemon, global shortcuts on Wayland), `false` on rpi1/rmpp/esp32/ps*/wasm (wasm may later get `os.dialog`, `os.notify`, `os.system` via browser APIs). Programs write `if (Platform.has('os.tray'))` (parallel study) or declare `requires: ["os.tray"]`.
2. **App permission manifest** in `zinc.json`: `"desktop": { "permissions": ["tray","notify","dialog:open","secret","autostart"] }`. The compiler rejects imports of a `zinc:desktop/*` module not listed (mirrors Tauri "capabilities"), and *derives* the platform metadata from it (below). Least privilege is visible in review, and `zinc export` emits only the needed entitlements/manifest entries. Reasons for a compile-time list rather than runtime prompts: it is auditable and it is exactly what sandbox formats need anyway.
3. **Sandbox/store entitlements** derived from the permission list (section 7): macOS App Sandbox entitlements (`com.apple.security.app-sandbox`, `files.user-selected.read-write` for dialogs, `network.client`, `keychain-access-groups`, `application-groups`), MSIX capabilities (`runFullTrust`, `startupTask`), Flatpak `finish-args` (`--talk-name=org.freedesktop.Notifications`, `--talk-name=org.kde.StatusNotifierWatcher`, `--share=network`), iOS entitlements/`Info.plist` usage strings (`NSFaceIDUsageDescription`, ...). [W: flatpak docs desktop integration, Apple docs; I for the mapping]

**Relation to `zinc:script`** (`docs/plugins/script.md:136,282`): scripts see nothing but host-exposed functions. Rule: **OS APIs are never auto-exposed to a `Script`**. The host app must wrap a specific call (e.g. `notify.show` with a rate limit and title prefix) and register it; user scripts and mods then run with the app's *narrower* set. Same for `zinc:webview`: `invoke` commands already reject unless registered (`plugins/webview/index.ts:5-6`); a page must not reach `desktop/secret` unless the app registers a handler [V/I].

Specific hazards: shell-open must validate scheme (`https`, `mailto`; no `file:`/custom by default); reveal/dialog return paths that then feed `zinc:fs` (no scope enforcement in `zinc:fs` today, [I]); global shortcuts and screenshots are privacy-sensitive (macOS Accessibility/Screen Recording TCC prompts); keychain items should be namespaced by bundle id.

---------------------------------------------------------------------------------------------------------------------

## 7. Build and packaging story

Extend `compiler/src/tools.ts` (`macBundle`, `tools.ts:297-322`), keyed off the `zinc.json` `desktop` block:

### 7.1 macOS
- `Info.plist` additions from config: `LSUIElement` (menu-bar-only), `CFBundleURLTypes` (deep links), `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` (file associations), `NSUserNotificationAlertStyle`, `NSFaceIDUsageDescription`, `LSApplicationCategoryType`, `NSSupportsAutomaticTermination`, background modes; `NSHumanReadableCopyright`. [W/I]
- Entitlements plist passed to `codesign --entitlements` (today codesign has no entitlements: `tools.ts:197`) [V]; hardened runtime is already used with a Developer ID. Notarization stays manual (`xcrun notarytool`); add `zinc export --notarize` [I]. Notifications and `SMAppService` need a real bundle id and signature; the dev `zinc run` already runs inside a bundle (`macBundle` "so the Dock shows the app's name") [V], which makes notifications testable in dev.
- Widgets: add an **appex** to `Contents/PlugIns/`, signed with the app-group entitlement; needs Xcode command-line tools and a real signing identity (ad-hoc appex + app group does not work for shared containers [W/I]).
- DMG (`hdiutil`), Sparkle-style updater (7.4).

### 7.2 Windows (blocked: no Windows host)
- MSIX (needed for `IWidgetProvider`, `startupTask`, notification identity, protocol handlers) plus NSIS/WiX for unpackaged. Code signing with Azure Trusted Signing/EV cert. Cost only after the Windows host exists (4-6 pw for sim+toolchain per prior research, studio report gap 7 [V]).

### 7.3 Linux
- AppImage (needs desktop file + icon + `MimeType=x-scheme-handler/...`), `.deb`, **Flatpak** manifest generated from permission list (`finish-args`), portals used for dialogs/notifications/settings (SDL dialogs already prefer the portal [I]). Tray under Flatpak needs the `org.kde.StatusNotifierWatcher` talk permission. Existing `.desktop` + systemd export (`tools.ts:209`, `security-audit.md:30`) is the kiosk/device flavour and stays.

### 7.4 Auto-update, crash reporting
- **Updater**: keep out of the runtime. `zinc:desktop/app` exposes `checkForUpdate(manifestUrl)` (uses `zinc:net`, sha256 exists per studio report) + `installAndRelaunch(path)`; apply step is per OS: macOS Sparkle (external framework, EdDSA signed appcast) or replace `.app` in place; Windows MSIX/App Installer; Linux AppImageUpdate or package manager. Zinc already has OTA plans for iOS/VM bytecode (README item 1); **bytecode-only updates are the Zinc-specific fast path** (ship `.zbc` to a pre-built core) [V/I].
- **Crash reporting**: `SIGSEGV`/`SIGABRT` handler + `hal_panic` (`hal.h:114`) can write a minidump-like file (backtrace + Zinc call stack from the VM) to `SDL_GetPrefPath`; uploading via `zinc:net` next launch. Crashpad/Breakpad only if symbolicated native minidumps are needed [I]. 2 pw.

---------------------------------------------------------------------------------------------------------------------

## 8. Ranked list, effort and dependencies

Effort is for macOS+Linux via SDL/POSIX unless noted; add 30-60% for a Windows implementation once a Windows host exists (not before: no host).

| # | Item | pw | Depends on | Notes |
|---|---|---|---|---|
| 1 | `dialog` (open/save/folder/message) + **file drop** + **clipboard mime** + `openExternal` + `theme/onThemeChange` + `battery` + `displays` | 2.0 | SDL 3.4 (present); weak `hal_desktop_*` + `os.*` capability names + sim twins | Highest value/effort; unblocks Studio v0 (studio report gap 1). |
| 2 | `tray` + `menuBarOnly` (`SDL_HINT_MAC_BACKGROUND_APP` and `LSUIElement`) | 1.5-2 | 1 | Menu-bar apps: clock/monitor/utility class of apps become possible. Linux SNI availability: test GNOME/KDE. |
| 3 | `zinc.json` `desktop.permissions` + compiler gating + Info.plist/entitlements/.desktop generation | 1.5-2 | 1,2 | Do early, so each later module lands gated. |
| 4 | `notify` (macOS UN + Linux D-Bus) | 1.5 | 3; signed bundle in dev | Windows later. Actions/reply callbacks need event-loop wiring. |
| 5 | `app`: single-instance (Unix socket), deep links (Info.plist + Apple Events; `.desktop` MIME), file open events, autostart (`SMAppService`, `.desktop`) | 2.5 | 3 | Needs ObjC++ app delegate hook; SDL emits dropfile for macOS open-file [I]. |
| 6 | native macOS **app menu bar** (`NSMenu`) + context menus (in-app kit `ContextMenu`, native optional) | 2 (+0.5 kit) | 3 | Kit `MenuBar` fallback first (0.5). |
| 7 | `window`: frameless/transparent/always-on-top/vibrancy/progress/badge for the **single** window | 1.5 | 1 | SDL flags + `NSVisualEffectView` via `hal_window_handle` (precedent `webview.mm:109`). |
| 8 | `secret` (Keychain, libsecret) + biometric (LocalAuthentication) | 2 | 3 | Simple ObjC++/libsecret; biometric mac only. |
| 9 | `shortcut` (Carbon hotkeys, X11; Wayland portal optional) | 1.5 | 3 | Wayland unreliable: `"optional"`. |
| 10 | **Multi-window** | 4-6 | 7; HAL window table, per-window gfx/ui context | Invasive; required for tear-off, prefs windows; can defer by using in-app panes/`utility` popup windows. |
| 11 | Updater + crash reporter + DMG/AppImage/Flatpak export | 4-5 | 3 | Parallelisable. |
| 12 | `widget` v0: bitmap widget + tap deeplink; macOS appex generator + Android receiver | 4-5 | 5 (deeplinks), app-group entitlement, Apple signing; Android/iOS HAL (iOS core study) | v1 descriptor renderers (SwiftUI/Glance/QML) +4-6; Windows provider +3-4 after Windows host. |
| 13 | Shortcuts/App Intents/App Actions, Spotlight/Quick Look, share extensions | 3-4 each | 12 infra (appex generator) | Same appex generator; iOS/macOS only. Descriptor `intent` list. |
| 14 | Windows implementations of 1-9 | 6-8 | Windows host (absent) | Blocked. |
| 15 | Accessibility bridge | 10-16 | own study | Not in scope here, but blocks credible desktop apps (studio report gap 8). |

Total realistic first tranche (items 1-9): **~14-17 pw**, yields most of what Electron/Tauri apps use daily on macOS/Linux.

### 8.1 Coverage table (Electron / Tauri 2 / Zinc today / Zinc after tranche 1-9)

| Feature | Electron | Tauri 2 | Zinc today | Zinc proposed |
|---|---|---|---|---|
| Tray / menu-bar icon | Tray | tray-icon | no | yes (SDL + mac hint) |
| Menu-bar-only app | dock.hide | ActivationPolicy | no | yes |
| Native app menu | Menu | muda | no | mac native, else in-app |
| Context menu | Menu.popup | muda | kit DropdownMenu (in-app) | in-app + optional native |
| Open/save dialog | dialog | plugin-dialog | no | yes (SDL) |
| Message box | dialog | plugin-dialog | no | yes (SDL) |
| Color/font picker | no (web) | no | no | skip (kit) |
| Notifications | Notification | plugin-notification | no | yes |
| Global shortcut | globalShortcut | plugin-global-shortcut | no | yes (mac/x11) |
| Multi-window | BrowserWindow | WebviewWindow | no | yes (item 10) |
| Frameless/transparent/always-on-top | yes | yes | kiosk on-top only | yes |
| Vibrancy/Mica | yes | window-vibrancy crate | no | mac, later Win |
| Drag-drop files in | yes | yes | no | yes |
| Drag-out / rich drag | yes (startDrag) | partial | no | skip |
| Clipboard rich | clipboard | plugin-clipboard-manager | text only (`hal.h:66`) | mime (SDL) |
| Deep links / file assoc | protocol / open-file | plugin-deep-link | no | yes |
| Single instance | requestSingleInstanceLock | plugin-single-instance | no | yes |
| Autostart | setLoginItemSettings | plugin-autostart | no | yes |
| Dock badge/progress | app.dock / setProgressBar | window API | no | yes |
| Jump lists | app.setJumpList (Win) | no | no | skip (until Windows) |
| Power/idle | powerMonitor | no official (community) | no | partial (battery, suspend where cheap) |
| Displays | screen | monitor API | `SDL_GetPrimaryDisplay` internal | yes |
| Screenshots | desktopCapturer | no official | no | skip (or macOS only via `screencapture` spawn) |
| Open/reveal | shell | plugin-opener | no (`zinc:process` + `open`) | yes |
| Keychain | safeStorage | plugin-stronghold / community keyring | no | yes |
| Biometric | no | plugin-biometric (mobile) | no | mac only |
| Theme/accent | nativeTheme | window theme | no | theme yes, accent mac/win |
| Accessibility | Chromium | webview | none | separate study |
| Auto-update | autoUpdater | plugin-updater | no | yes (`zinc:net` + per-OS apply) |
| Crash reporting | crashReporter | community | no | basic |
| OS widgets | none (hand-made native ext.) | none | none | descriptor shells |
| Shortcuts/Intents | none | none | none | later, via appex generator |
| Binary size | 100-200 MB | 5-15 MB + engine | ~1-5 MB | same |

---------------------------------------------------------------------------------------------------------------------

## 9. What to skip, and the honest limits

- **Skip**: GNOME Shell extension shells (per-version breakage), Windows jump lists and taskbar thumbnails before a Windows host exists, native colour/font pickers (kit), screenshot/screencast API (privacy + Wayland portal complexity; spawn `screencapture` if ever needed), drag-out to other apps, Touch Bar, Live Activities (push server), Spotlight/Quick Look plugins until the appex generator exists, biometrics off macOS/iOS, e-ink "widgets" (no platform hook), full `NSAccessibility` (own study).
- **Do not promise**: user-authored code running inside an OS widget process. The widget is a generated shell over a descriptor.
- **Do not overload** `zinc:os`; and **do not auto-expose** any of these to `zinc:script`/`zinc:webview` pages.
- **Unverified**: SDL tray/dialog backend behaviour per OS (only headers read, no run); notification behaviour in unsigned dev builds; whether SDL emits open-file/URL events for macOS `application:openURLs:` (likely needs a small delegate hook, [I]); AppLoad tile/widget possibilities on rMPP; exact Tauri 2 plugin list beyond those confirmed by search; effort numbers.

### Sources (web)
- Tauri plugins: https://v2.tauri.app/plugin/ ; https://github.com/tauri-apps/plugins-workspace
- Electron: https://www.electronjs.org/docs/latest/api/tray ; https://www.electronjs.org/docs/latest/api/app
- SDL3 tray: https://wiki.libsdl.org/SDL3/CategoryTray
- WidgetKit: https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension ; https://useyourloaf.com/blog/widgetkit-for-ios-getting-started/
- .NET MAUI widgets (per-platform native extensions): https://mobiletechlead.com/article/dotnet-maui-10-widgets-ios-android
- Windows widget providers: https://learn.microsoft.com/en-us/windows/apps/develop/widgets/widget-providers ; https://learn.microsoft.com/en-us/windows/apps/develop/widgets/implement-widget-provider-win32
- Android Glance: https://developer.android.com/develop/ui/compose/glance/create-app-widget
- Compose Desktop tray: https://kotlinlang.org/docs/multiplatform/compose-desktop-tray.html
- Portals (FileChooser, Settings, Flatpak integration): https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html ; https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html ; https://docs.flatpak.org/en/latest/desktop-integration.html
- KDE plasmoids: https://develop.kde.org/docs/plasma/widget/ ; GNOME background apps: https://www.phoronix.com/news/GNOME-Monitor-Background-Apps


---

<!-- source: esp32-arduino-style-builds.md -->

# ESP32 builds, Arduino-style: faster, visual, and Docker-free (2026-09-30)

Status: research note, nothing implemented. Sizes and timings are orders of magnitude from memory, not measured.
Arduino details were not re-verified online. Builds in this repo were not timed. Complements
[docker-free-studio.md](docker-free-studio.md) and [studio-as-zinc-app.md](studio-as-zinc-app.md).

## Product constraint

The end goal is one self-contained app (Unity / Godot / Arduino IDE style). Users never install or configure Docker,
ESP-IDF, cmake or other tools by hand. "No configuration" does not mean "nothing downloaded": the app downloads signed
packages on demand, in the background, the first time (Arduino board manager, Godot export templates).

## Current ESP32 flow (verified in `compiler/src/cli.ts:513, 605-675`)

- `espBuild` generates an ESP-IDF project and runs `idf.py build` in the `espressif/idf:v6.0` Docker image (pinned by digest).
- IDF recompiles Zinc's runtime (`zrt`, modules, HAL) together with the user's code at every build.
- A change of chip or of `sdkconfig.defaults` runs `set-target` and deletes the `build` directory.
- Flashing already runs on the host through esptool.

## How Arduino does it (from memory, unverified)

- The IDE is small. ESP32 support is a package (core + toolchain + esptool) downloaded on demand from a JSON board index,
  several hundred MB.
- The ESP-IDF libraries are shipped precompiled as `.a` files per chip with a fixed `sdkconfig`
  (Espressif's `esp32-arduino-lib-builder`). Arduino compiles only the sketch and the Arduino core code, then links
  against these libraries. No full ESP-IDF build, no CMake for the user.
- The core is compiled once and cached. Only the sketch is rebuilt.
- Cost: the `sdkconfig` is effectively fixed; PSRAM, flash size and partitions come from predefined board options.

## Proposed levels for Zinc

1. **Default: bytecode upload to a preflashed VM firmware.**
   - The app bundles prebuilt VM firmware images per chip/board (a few MB) and esptool.
   - First use flashes the firmware once. Each "Upload" compiles TS to `.zbc` and sends it over serial or Wi-Fi.
   - No C++, no toolchain, nothing to download.
   - Blockers: the VM is not ported to ESP32 (flash/RAM footprint unknown) and universal cores are future work
     (`docs/precompiled-core.md`).
2. **Native build from precompiled templates (Arduino/Godot model).**
   - CI builds per board preset (chip, PSRAM, flash size) precompiled IDF + Zinc runtime libraries with a fixed `sdkconfig`.
   - The app downloads only the Espressif compiler (order of 100-200 MB, estimate), compiles the user's code and links.
   - Cost: a matrix of presets instead of free `sdkconfig` tuning.
3. **Managed full ESP-IDF** for users who change components or `sdkconfig`: the app downloads and pins ESP-IDF itself via
   `idf_tools.py`, no Docker. Heavy (1.5-2 GB) but invisible.

## Faster builds

1. Install ESP-IDF on the host, out of Docker (Docker adds filesystem cost on macOS).
2. Precompile the Zinc runtime per (chip, options) as an IDF component or `.a`.
3. Persistent `ccache` and build directory. Do not delete `build` except on chip change. Keep the `sdkconfig` stable
   (the existing fingerprint check is fine).
4. Partial flash: write only the app partition; OTA over Wi-Fi.
5. `-Og`/`-O1` in development plus `zinc dev` bytecode hot reload.

## Visual experience

- Verify / Upload / Serial Monitor buttons.
- Step progress (analyze, runtime (cached), app, link, flash) with times, fed by Ninja's `[n/total]` output.
- Clickable errors mapped back to TS lines via `zinc check --json` instead of generated C++.
- Flash and RAM usage with percentages (`idf.py size`).
- Board and port selector: USB VID/PID detection, boards from `boards/`, integrated serial monitor with a plotter.
- A "ready" indicator while the VM firmware is present.

## What the app needs

- A package manager: signed index, content-addressed cache, progress and resume, offline bundle.
- Bundled in the app: CLI, esptool, VM firmware images. Everything else is downloaded on demand.
- Still not covered: PS1/PS2 off Linux and Apple targets off Mac need a VM or a Mac. Docker may remain an optional
  backend for CI and advanced developers.

## Order

1. Measure real cold/warm ESP32 build times today (not done).
2. Persistent cache and Docker-free IDF: quick win.
3. Precompiled runtime per chip.
4. Port the VM to ESP32 and ship the preflashed firmware plus bytecode upload. Main unknown: does the VM fit in RAM/flash?
5. Precompiled templates for common boards, then managed full ESP-IDF.
6. The visual UI in the Zinc-app Studio.

## To verify before committing

- Real package sizes of `arduino-esp32` and its tools (Espressif's public index).
- How Espressif publishes the precompiled libraries and which `sdkconfig` variants they cover.
- VM footprint on ESP32 (requires the ESP-IDF toolchain; not run).
