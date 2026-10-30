# Direct code generation: compiling Zinc to machine code without C++ (research, 2026-10-30)

The question (owner, in French: "export direct asm"): should Zinc compile straight to machine code or assembly instead of emitting C++ and running clang or the pinned zig? This report reads what exists, surveys the direct backends with their current versions, measures today's AOT build, scores the options as `RULES.md` §4 asks, and sketches where a backend would plug in. Read-only on the engine: no file other than this one was changed, nothing was built or committed.

Labels: **[M]** measured here, **[R]** read in the repository, **[W]** from a web source (listed at the end), **[E]** estimate or general knowledge not checked today.

## 0. Summary

1. **Where the time goes [M].** For one 48-function unit of hero, clang spends about 10% of its time parsing (`-fsyntax-only`: 0.22-0.27 s CPU), 25-30% at `-O0` (0.59-0.71 s) and 100% at `-O2` (2.2-2.4 s). That is about **47 ms of CPU per Zinc function at -O2**. Hero is 1,690 functions in 36 units, so roughly 80 s of CPU. The C++ frontend is not the cost; LLVM's optimiser and code generator are.
2. **So "C++ → LLVM IR directly" saves little.** At most the 10-25% of parse and Sema time. A real gain needs a different backend: QBE, MIR, Cranelift, copy-and-patch, or one written by hand. Those generate code roughly 10-100x faster than clang -O2 [W][E], which would bring hero's code generation from about 80 CPU-s to about 1-2 s.
3. **A naive backend is slower than the interpreter [M].** nbody compiled from the same C++ at `-O0` runs in 1.81 s CPU, against 0.80 s in the interpreter and 0.03 s at `-O2`. Zinc's AOT C++ relies on clang to inline `zn::ops` (`include/zn/ops.h`) and keep registers in machine registers. A direct backend must do both, so it needs a register allocator. A template emitter without one loses to the interpreter.
4. **Zinc avoids the two hardest backend features [R].** Memory is reference counted: no GC and no stack maps. Exceptions are status codes (a compiled function returns 0, 1 = thrown, 2 = trap; `src/aot/aot.cpp:270-310`): no unwind tables and no landing pads. A direct backend needs only the C calling convention, frame pointers, and (optionally) DWARF line tables.
5. **The direct path does not remove the toolchain by itself.** QBE writes assembly, which needs an assembler. MIR is an in-memory JIT with no object writer. Every backend needs a linker to make an executable that links `libzn_rt.a`, SDL3 and the plugins. Only an **in-process JIT tier** (code generated into the running `zinc` and called through `Func::native`) needs nothing on the machine. That is a JIT, which D13 and D36 rejected for measured reasons, and which iOS, the consoles and a hardened macOS binary without `allow-jit` forbid.
6. **No backend covers Zinc's exotic targets.** Those are armv6 (Pi Zero/1), Xtensa (ESP32), MIPS Allegrex (PSP), ARM11 (3DS), Vita and PS2 (MIPS R5900), and they all go through C/C++ SDKs (`src/tc/consoles.cpp`, ESP-IDF). QBE, MIR and Cranelift are 64-bit only (x86-64, arm64, riscv64, plus ppc64le and s390x for MIR and s390x for Cranelift). Only LLVM and GCC cover all of them. The C++ path therefore stays in every scenario, and a direct backend is always a *second* code path to keep bit-identical with the interpreter and AOT.
7. **Recommendation.** Do not build a direct backend now (scored in §5). The build-time problem has a cheaper fix that is already designed and measured: stable units plus a precompiled library core (`docs/reports/fast-builds-aot-study.md` §3), resources by `.incbin` (§4 there), the interpreter first for development (§5 there), and D184's scans. Together these remove 57-70% of the CPU (the library share) from every build and make an edit cost 1-3 units. If a direct backend is revisited, the input is **ZBC**, the module is a new `src/ncg/` beside `src/aot/`, and the best candidates are **copy-and-patch stencils compiled from `include/zn/ops.h`** (the semantics stay defined once, every clang target, JIT and object output) or **MIR** as an in-process tier on 64-bit desktops.

## 1. What exists [R]

### The pipeline

`ARCHITECTURE.md` fixes the direction `include/zn ← frontend ← ir ← zbc ← rt ← vm`, with `zbc ← aot`. AOT is **not** IR → C++, it is **ZBC → C++**:

- `src/ir/ir.h` is a typed SSA IR with **block parameters instead of phis**, effect sets per instruction, an optional unwind edge on `Call`, and `Throw` as a terminator. It has 8 type kinds (Void, Bool, Num with a numeric kind, Str, Ref, Array, Map, Set) and about 50 ops. Passes: `lower.cpp` (2,964 lines), `opt.cpp` (devirtualisation, inlining of callees of 40 instructions or fewer, DCE, const globals), and `rc.cpp` (`insertRc`, explicit `Retain` and `Release`).
- `src/zbc/emit.cpp` lowers the IR to ZBC: a typed register bytecode of 195 opcodes (`include/zn/opcodes.h`). Registers are 64-bit slots of class I, S (f32) or D (f64). References and windows are special-cased, and the verifier proves every class. `zbc::registerTypes` (`src/zbc/zbc.h:117`) gives each register's class or reference class.
- `src/aot/aot.cpp` (534 lines) turns each verified ZBC function into a C++ function:
  - `int f<i>(Machine&, Slot* window)`, which returns 0, 1 (thrown) or 2 (trap). Typed numeric functions are also emitted as `Slot t<i>(Machine&, Slot a0...)` (ZN-144), and a leaf's registers become C++ locals.
  - Arithmetic is `zn::ops::<Op>(…)` from `include/zn/ops.h`, the single definition of every operation's semantics.
  - Everything else calls `src/rt`: `op::arrGet`, `rtCall`, `nativeCall`, `op::virtualTarget`, `op::newObject`, `ZRETAIN`/`ZRELEASE`.
  - The program is the ZBC module embedded as bytes, plus a table `kNatives[]` of function pointers, handed to `runProgramPacked` (`src/rt/rt.h:334`; `src/rt/program.cpp:61` sets `Func::native`). The program provides `Machine::exec` itself (`aot.cpp:511-516`).
- The interpreter skips functions that have `native` set when it fuses opcodes (`src/vm/vm.cpp:40`). Its `Call` does not dispatch to `native`, so today a program is either all compiled or all interpreted.

### The build (`src/main.cpp`)

- `zinc build` emits the C++ (`main.cpp:964`, `emitCppParts`). Up to 3 units are compiled in parallel with the system `c++`, at `-std=c++20 -O2 -mno-outline -mllvm -aarch64-enable-ldst-opt=false -fno-stack-protector -w -ffp-contract=off` (`main.cpp:1043-1060`; `-ffp-contract=off` keeps rounding bit-identical, D14).
- A precompiled header of `rt/rt.h`, `zn/host.h` and `zn/ops.h` is built per compiler and header content (`main.cpp:849-871`).
- Objects are cached by content in `$ZINC_HOME/cache/aot-obj` (`main.cpp:842, 1070`).
- `zinc build --debug` uses `-O0 -g` with `#line` to the `.ts` lines (ZN-371.06).
- When the machine has no compiler or no engine libraries, the pinned **zig 0.15.2** (`src/tc/tc.cpp:32`, checksum-verified) builds the program. It takes 390 MB unpacked in `~/.zinc/toolchains` [M].
- Cross builds and Windows (D106) and Linux from the Mac (D134) all use zig. The consoles use their own SDKs (pspdev and vitasdk at about 400 MB each [M]), and the ESP32 uses ESP-IDF (`docs/reports/zinc-next-esp32-aot.md`, `esp32-aot-lvgl.md`).

### The decisions that bear on this

- **D13** (JIT): no JIT now; if needed, an sljit baseline from ZBC.
- **D36** (sljit spike, ZN-150): **no-go, measured by the upper bound.**
  - AOT over the interpreter is 1.3x (sort) to 11.9x (spectralnorm), and 2.7x on a UI page. A baseline JIT reaches a third to a half of AOT on numeric code, and "almost nothing on code that is bound by the runtime (strings, sort, allocation, host calls), which is what UI code is".
  - It adds W^X handling, entitlements on macOS, and is impossible on iOS and consoles.
- **D43** (`zinc run` compiles programs that draw and caches the executable; the interpreter is for dev, `--interp` and tests). Its revisit condition: a first-run build past 10 s. The fast-builds study found that music already crosses it.
- **D44 and D110** (QuickJS): the JavaScript side has its own compiler plan, a QuickJS bytecode compiler (ZN-723) with a JIT backend later. Longbridge's QuickJS JIT, built on Cranelift, is noted there: "emitting machine code is not the hard part".
- **D46** (AOT diet): multi-unit builds, string-literal blobs, no stack protector. It took hero's build from 43.8 to 13.9 s on a quiet machine.
- **D68** (what a compiled program links): only what it uses, plus `-dead_strip`.
- **D184** (2026-10-30): quadratic scans removed from check, emit and AOT. The iPod demo's AOT phase went from 13.7 to 1.4 s.
- **`docs/reports/zinc-vm.md` (2026-09-28, prototype era, a proposal superseded by D13 and D36)** already designed exactly this:
  - Tier 1 was copy-and-patch from the interpreter's handler sources. Its mandelbrot prototype ran in 82 ms with slots in memory against 78 ms in the interpreter, but in **36 ms with typed slots pinned to registers**, against 28 ms native.
  - Tier 2 was MIR (Makarov), chosen over Cranelift, sljit, asmjit and LLVM ORC.
- `docs/reports/zinc-next-native-abi.md`: the native ABI is a C table with signature letters (D1). A direct backend calls plugins through the same `nativeCall`, so nothing changes there.
- `docs/reports/quickjs-aot-jit-and-ffi.md` §4.1 already lists the platform rules for executable memory (MAP_JIT, entitlements, no JIT on iOS or the consoles).

## 2. Today's build time [M]

Machine: M1 Pro, macOS 15, Apple clang 17. The engine binary is the main tree's `build/zinc` (Oct 30 12:33), with no rebuild. `ZINC_HOME` was a scratch directory, the AOT object cache was cleared, and the system `c++` was used (no download). **The load average was 19 to 32 during the runs** because other sessions were building. Wall times are therefore inflated, perhaps 1.5-3x, while CPU (user) times are more reliable. Retake them alone before any decision rests on them.

### Whole builds (`zinc build <x> -o out`, `ZINC_LOG=debug`)

| Program | Functions | Generated C++ | Frontend to ZBC | AOT emit | C++ compile | Link | Total wall |
|---|---|---|---|---|---|---|---|
| `tests/bench/kernels/fib.ts` | 2 | 5 KB | 22 ms | 1 ms | 1.78 s compile and link (one command, no PCH) | | 1.90 s |
| `tests/bench/kernels/nbody.ts` | 4 | 20 KB | 5 ms | 1 ms | 1.49 s compile and link | | 1.51 s |
| `examples/hero` (cold object cache) | 1,690 | 27 MB in 37 units | 1.1 s (+ 11.0 s "read and parse", see below) | 0.51 s | 65.5 s (36 units, 3 at a time, + PCH 1.2 s) | 1.56 s | 81.7 s |

Hero's "read and parse" phase took 11.0 s. That is not code generation: it was probably the plugins' cached native libraries and the heavy load. It is outside this question. D46 measured hero's whole build at 13.9 s on a quiet machine, so today's 81.7 s is mostly load.

For the small programs, almost all of the 1.5-1.9 s is clang starting, parsing `rt.h` and `ops.h` without a PCH (`-O0`, `-O1` and `-O2` all take 0.58-0.69 s CPU to compile) plus the link (0.05 s CPU alone). A direct backend would make both programs build in about 0.1 s, the time of the link.

### One unit of hero (48 functions, `hero.part5.cpp` 881 KB, `hero.part12.cpp` 697 KB; PCH matched to the level)

| clang mode | part5 CPU | part12 CPU | Object `__TEXT` |
|---|---|---|---|
| `-fsyntax-only` (parse and Sema only) | 0.27 s | 0.22 s | none |
| `-O0` | 0.67-0.71 s | 0.59-0.61 s | 557 KB / 476 KB |
| `-O2` with zinc's flags | 2.21-2.45 s | 2.40 s | 138 KB / 148 KB |

- Parse and Sema are about 10% of an `-O2` unit. Going from C++ to the LLVM API directly would remove that and little else.
- `-O0` is 3.5x faster than `-O2`, but its code is 3.2-4x larger. A naive direct backend sits in this class.
- At `-O2`, hero's 36 units are 36 × 2.3 ≈ **83 s of CPU**: about 47 ms per Zinc function. At `-O0`, about 23 s.
- A direct backend generating code 50-100x faster than clang -O2 [W: MIR's README measures 109x against GCC -O2 on sieve; E for the others] would need **about 1-2 s of CPU for hero**. That is the same order as the ZBC emit (0.35 s) and the AOT C++ emit (0.51 s) already measured.

### Code speed of the levels, as a proxy for a naive backend (nbody, CPU of 3 runs)

| Engine | nbody CPU |
|---|---|
| Interpreter (`zinc run --interp`, compile included) | 0.79-0.83 s |
| AOT C++ at `-O0` | 1.81-1.82 s |
| AOT C++ at `-O1` | 0.03 s |
| AOT C++ at `-O2` | 0.03 s |

`-O1` already gets everything, because inlining `zn::ops` and allocating registers is all the code needs. `-O0` is 60x slower than `-O2` and 2.2x slower than the interpreter. A direct backend must therefore inline the arithmetic, comparison, branch and field operations and allocate registers. QBE, MIR and Cranelift do. A template emitter does so only with registers pinned the way `zinc-vm.md`'s prototype did, and a TinyCC-class compiler does not.

## 3. The backends [W][E]

| | QBE | Cranelift | MIR (Makarov) | LLVM (C API or `.ll` text) | libgccjit | TinyCC | Copy-and-patch (stencils from `ops.h`) | Hand-written per arch |
|---|---|---|---|---|---|---|---|---|
| Version (2026-10) | 1.3 (2026-06-01: Windows ABI, PIC) | ships with Wasmtime (v50 in Oct 2026) | git, no tagged release after 0.1.2; README benchmarks | 22.x | GCC 15/16 | 0.9.27 + git snapshots (2025-06) | technique (Xu and Kjolstad 2021; CPython 3.13-3.15 JIT) | Go, Zig, Jai, V do it |
| Input | SSA text (IL), C ABI | SSA with block params (as Zinc IR), Rust API | typed low-level IR, C API; C2MIR compiles C | SSA, C API or text | GCC trees through C API | C source | our own op sequence | our own IR |
| Output | assembly text: needs `as` and a linker | object files (`cranelift-object`) or in-memory JIT | in-memory code only (JIT); a lazy-BB interpreter as well | objects, assembly, ORC JIT | objects, assembly, in-memory | ELF/PE objects, in-memory; Mach-O on the mob branch (unverified) | in-memory, or an object we write | whatever we write |
| Compile speed | fast; no measured figure found, roughly MIR's class [E] | rustc_codegen_cranelift: whole Zed build 5-12% faster than LLVM debug; per crate up to 30% (2026 goal) [W] | about 109x faster than GCC -O2 on sieve (249 µs vs 27 ms) [W] | as clang minus parsing (§2: about -10%); `-O0` about 3.5x faster than `-O2` [M] | as GCC | about 10x faster than GCC -O0 [E] | about 100x faster than LLVM -O0 (paper) [W] | Zig's x86 backend: about 5x faster than LLVM debug builds [W] |
| Code quality vs -O2 | goal "70% of industrial compilers" [W] | about 0.85-0.9 of LLVM (zinc-vm.md: "~14% slower") [E] | 0.91 geomean of GCC -O2 on 15 C benchmarks [W] | 1.0 | 1.0 | `-O0` class: slower than our interpreter here (§2) | interpreter speed with slots in memory; 1.3x native with pinned registers (zinc-vm prototype) [R] | from `-O0` to Go's level, depending on years of work |
| arm64 macOS and Linux | yes | yes | yes | yes | Linux yes; macOS through a GCC port | yes (Linux; macOS on mob) | any clang target | if written |
| x86-64 | yes (SysV, Apple, Windows in 1.3) | yes | yes | yes | yes | yes | yes | if written |
| armv6 and armv7 (Pi Zero/1/2) | no | no (32-bit only through the Pulley interpreter) | no (no 32-bit) | yes | yes | yes (arm 32) | yes | if written |
| Xtensa (ESP32), riscv32 (C3/C6) | no; rv64 only | no | no; rv64 only | Xtensa experimental upstream, full in Espressif's fork; riscv32 yes | yes (one build per target) | riscv64 only | yes, with esp-clang | if written |
| MIPS (PSP Allegrex, PS2 R5900), ARM11 (3DS) | no | no | no | MIPS and armv6k yes, but the SDKs ship GCC | yes (one build per target) | no MIPS | in principle yes; console SDKs are GCC | if written |
| wasm | no | no (it *consumes* wasm) | no | yes | no | no | no | if written |
| Licence | MIT | Apache-2.0 WITH LLVM-exception | MIT | Apache-2.0 WITH LLVM-exception | **GPLv3+**: a tool linking it is GPL | **LGPL-2.1** | ours (stencils built by clang, which the engine build already needs) | ours |
| Size to vendor | small C codebase ("10% of the code" of LLVM) [W], a few hundred KB [E] | many Rust crates, several MB of binary, and **cargo in a CMake C++ build** | 23.4K lines generator + 11.3K interpreter, 557 KB + 240 KB [W] | libLLVM about 64 MB compressed, 182 MB installed (Alpine 22) [W] | 80-150 MB per target [W, informal] | about 300 KB [E] | an extractor (about 1K lines) + a patcher (about 1K lines) + the stencil blobs | per arch about 6-10K lines (encoder, regalloc, object writer, DWARF) [E] |
| DWARF | experimental `dbgfile`/`dbgloc` line directives (1.2) | source locations; rustc_cg_clif emits line tables [W] | none | full | full | stabs and DWARF line info | none, unless we write it | ours to write |
| GC and stack maps | none | user stack maps (Wasmtime GC) | none | statepoints | none | none | n/a | n/a |
| Unwinding | frame pointers | unwind info emitted (Wasmtime) | none | full | full | partial | none | ours |
| Maintenance | one author, 12 years, stable | Bytecode Alliance, very active (3 CVEs fixed in Oct 2026) | one author, active | huge, stable | GCC | low activity | ours | ours, permanently |

For Zinc, GC, stack maps and unwinding are "not needed" (§0 point 4), so those rows do not separate the options. The rows that do separate them are the targets, the output kind (object vs JIT only), the licence, and the cost of carrying the backend.

### How other languages do the hybrid [W][E]

- **Zig**: the self-hosted x86-64 backend has been the Debug default since 0.15. It builds about 5x faster than LLVM, passes 1984 of 2008 behaviour tests (LLVM: 1977), and the Zig team builds its compiler with it in seconds instead of 1-2 minutes. aarch64 is 84% and "not currently usable". LLVM serves release builds and every other target, and a C backend serves the exotic ones.
  - Zig owns its own linker for Mach-O, ELF and COFF, which is what makes "no toolchain" true for it.
  - It took about 5 years with a full-time team to get one architecture to parity [E].
- **Go**: its own SSA backend, assembler and linker for amd64, arm64, arm (v5-7), 386, mips, ppc64, riscv64, s390x, loong64 and wasm. No LLVM at all; gccgo exists for the rest. Code quality is somewhat below GCC -O2 [E]. It is the strongest example of "no toolchain", and also of what it costs: a compiler team for 15 years.
- **Swift**: LLVM only, at `-Onone` for debug. There is no fast backend; its debug-build speed comes from incremental, per-file compilation [E].
- **Roc**: `gen_dev` emits machine code for arm64 and x86-64 straight from its mono IR for development builds; LLVM serves release builds and a wasm backend serves the web [W]. Its dev backend never covered 32-bit [W].
- **Jai**: its own x64 backend for fast debug builds, LLVM for release [E].
- **V**: emits C (tcc for dev, clang or gcc for release), with an experimental native x64 backend [E]. This is the closest to Zinc today, with tcc in the role of the fast path.
- **Hare**: QBE only, and as a consequence only amd64, arm64 and riscv64 [E].

The pattern: **a fast backend for the developer's own machine (64-bit desktop), and a mature backend for release and every other target.** The fast backend always covers only one or two architectures, the language keeps both paths forever, and the languages that own their backend (Go, Zig) have compiler teams.

## 4. What the direct path would buy, and what it costs

**What it would buy:**

- **Build time.** Hero's code generation would take about 1-2 s of CPU instead of about 80 (§2). That is the largest single gain on offer. But compare it with the planned fixes:
  - Stable units plus a precompiled core: only the edited file's units are compiled, about 1-3 s of CPU (fast-builds §3, measured on music).
  - Interpreter first: `zinc run` starts in 0.1-1.1 s (fast-builds §5).
  - The direct backend wins the **cold first build** of an app and the build on a slow board. The others win the edit loop at a fraction of the cost.
- **No toolchain.** This is only partly true:
  - A JIT tier in `zinc run` needs nothing.
  - An executable still needs a linker: Apple `ld` comes with the Xcode command-line tools; elsewhere, zig's lld (390 MB unpacked), or our own linker as Zig wrote.
  - One workaround is a prebuilt runner (`libzn_rt` + host, shipped with zinc) that loads a code blob at start, like `.zapp`. But that is loading executable code at run time: a JIT under another name, refused by iOS, the consoles and macOS's hardened runtime without an entitlement.
- **A JIT for dev mode.** D36 already measured the ceiling. A JIT at AOT quality would give the AOT's 1.3-11.9x, and a baseline 1.5-3x on numeric code and about 1x on UI code. `zinc dev` (the Fast Refresh path, ZN-742) runs the interpreter, and UI time is mostly in the native host.
- **Smaller binaries.** No. The engine runtime and host dominate (hero: a 10.3 MB executable for 1,690 functions, whose `-O2` code is about 36 × 140 KB ≈ 5 MB). A non-LLVM backend makes code 1.2-2x larger than `-O2` (`-O0`: 3.2-4x, §2). `-dead_strip` and the shared runtime are where size is won (D46, D68).

**What it costs:**

- **A second code generator to keep bit-identical** with the interpreter and the C++ AOT, on every one of the 195 opcodes and about 300 runtime rows. The C++ path cannot go away: the consoles, ESP-IDF, armv6 and wasm need it (§3), and so does `zinc build --debug` with lldb.
- **The semantics of `include/zn/ops.h` would be written twice.** ARCHITECTURE.md requires them to be defined once. QBE, MIR, Cranelift and a hand-written backend all re-encode them. Examples: f64 → i32 conversion, remainder signs, shifts of 32 or more, fixed point, `Math.round`, NaN comparisons. Copy-and-patch and the LLVM route are the exceptions, because their code comes from compiling `ops.h` itself.
- **Executable memory** for any JIT tier: MAP_JIT and `com.apple.security.cs.allow-jit` on a signed `zinc` (`tools/sign-macos`), and W^X on Linux. Already listed in `quickjs-aot-jit-and-ffi.md` §4.1.
- **Supply risk.** MIR and QBE each have one author. Cranelift brings a Rust toolchain into a CMake build. LLVM is 60+ MB. libgccjit is GPL. TinyCC is LGPL and produces `-O0`-class code.

## 5. Options scored (RULES.md §4)

Criteria (1-5): fit with the goal x3, performance x3 (code speed and build speed together), size/footprint x2, maintainability x2, licence and supply risk x2, portability x1, effort x1 (5 = least).

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **(a) C++ only, plus the fast-builds plan**: stable units, precompiled library core, `.incbin` resources, interpreter first, D184 | 4 | 4 | 5 | 5 | 5 | 5 | 4 | **63** |
| (b) Copy-and-patch from `ops.h` stencils, ZBC input, JIT and object output, pinned typed registers; C++ for release | 3 | 3 | 4 | 3 | 5 | 3 | 2 | 47 |
| (c) MIR as an in-process native tier on 64-bit desktops (`zinc run`, `zinc dev`); C++ for builds | 3 | 4 | 4 | 2 | 4 | 2 | 2 | 45 |
| (d) LLVM C API (or `.ll` text) instead of C++ | 2 | 5 | 1 | 3 | 4 | 5 | 2 | 44 |
| (e) QBE for dev builds (assembly text → `cc`), C++ for release | 2 | 3 | 4 | 3 | 5 | 2 | 3 | 44 |
| (f) Hand-written arm64 and x86-64 backends with our own object writer (Go, Zig) | 3 | 3 | 5 | 1 | 5 | 3 | 1 | 44 |
| (g) Cranelift through a Rust staticlib | 3 | 4 | 2 | 2 | 4 | 2 | 2 | 41 |
| (h) TinyCC on a C (not C++) emitter | 2 | 1 | 4 | 3 | 3 | 3 | 2 | 34 |
| (i) libgccjit | 1 | 4 | 1 | 3 | 1 | 4 | 2 | 31 |

Notes on the scores:

- **(a)**:
  - Perf 4: code speed stays 5, but the build is still clang -O2 on the units that change, about 2.3 s CPU per 48 functions.
  - Fit 4: the first-ever build of a large app stays slow on a weak machine.
  - Every target and the debugger keep working, and nothing new is vendored.
- **(b)**:
  - It keeps `ops.h` as the one definition (stencils are compiled from it by the clang that already builds zinc) and covers every clang target, including armv6 and riscv32. It gives both a dev JIT and a no-clang object path.
  - Code is interpreter-class unless typed registers are pinned (zinc-vm: 36 ms against native's 28). Stencils must be rebuilt per target and engine version in CI.
  - D36's ceiling applies to the JIT use.
- **(c)**:
  - The best code quality of the light backends (0.91 of GCC -O2) and a C API that takes ZBC's typed registers almost 1:1.
  - But it is 64-bit only, has one author, needs JIT entitlements, and re-encodes the semantics.
- **(d)**: removes only the parse (about 10%, §2) at the cost of shipping LLVM.
- **(e)**: still needs an assembler and a linker, so the toolchain stays; it covers 3 architectures.
- **(f)**: Go and Zig show it takes a compiler team for years; it is permanently Zinc's.
- **(g)**: good engineering, but Rust in the build and 64-bit only.
- **(h)**: `-O0`-class code is slower than the interpreter (§2), and the AOT emits C++20, not C.
- **(i)**: GPL in the tool.

**Choice: (a).** It is the cheapest way to fast builds on modest machines, and the only option that keeps every target, `zinc build --debug` and one definition of the semantics. Most of it is already designed and measured; its pieces are the fast-builds study's (a), (b), §4 and §5.

**Revisit when** either of these holds. In both cases score (b) against (c) again, with the stencil spike as the measurement.

- With the fast-builds plan done, the first build of a demo app is still above 10 s on the reference low-end machine (a Pi 4 or a 4-core laptop), or a user path must produce native code with no compiler installed.
- An app must run new native-speed code on a device where the interpreter is too slow and a JIT is allowed (D36's own condition).

## 6. If a backend is built: where it plugs in

**Input: ZBC, not the IR.** The backend would consume the verified `zbc::Module` at the same point as `aot::emitCppParts` (`src/main.cpp:964`), for these reasons:

- The ABI of compiled code is defined on ZBC. That covers the window entry `int f(Machine&, Slot*)` with status codes 0/1/2, the typed entries (ZN-144), the exception handlers (`aot.cpp`'s `handlersAt`), the windows of `Rt` and `CallNative`, and the class layouts with `fieldRef`.
- The program loader already takes a table of function pointers (`runProgramPacked`, `src/rt/program.cpp:61`).
- ZBC's I/S/D classes are machine types, and `zbc::registerTypes` gives the reference classes, so lowering is per opcode.
- Its 195 opcodes are already lowered and verified. The IR (block parameters, which map 1:1 to Cranelift's and MIR's SSA) would be the better input for an optimising backend. But it would repeat `src/zbc/emit.cpp`'s decisions (964 lines) and create a third semantics.

**Module.** A new `src/ncg/` ("native code generation"), with its public header `src/ncg/ncg.h`, a sibling of `src/aot/`: `zbc ← ncg`, never `vm` or `aot`. The work, with size estimates [E]:

1. **Shared ZBC analyses.** Move `typedFunctions` and the leaf, label and handler collection from `src/aot/aot.cpp` (anonymous namespace) into `src/zbc` so both emitters use them. About 150 lines moved.
2. **Out-of-line operations.** An `extern "C"` table of the non-trivial `zn::ops` and `op::` entries, generated by the X-macros of `include/zn/ops.h` and `opcodes.h` into `libzn_rt` (`src/rt/ops_abi.cpp`). The semantics stay defined once: a backend calls these, and inlines only operations that are one machine instruction with the same semantics (integer add/sub/mul/and/or/xor, f64 add/sub/mul/div, compares, moves, branches, field loads and stores, the retain fast path). About 200-300 lines.
3. **A conformance test of every inlined operation** against `zn::ops`, over edge values (NaN, -0, ±Inf, INT_MIN / -1, shifts of 32 and 64, f64 → int out of range) on every backend. This is a T0 test. About 300 lines.
4. **The lowering**, one ZBC opcode to the backend's IR or stencil:
   - About 1,500-2,000 lines. `aot.cpp` is 534 lines only because C++ macros and clang do the expansion; a direct backend spells out the refcount fast paths, the trap and unwind blocks, and the window copies.
   - Plus a backend adapter: MIR C API about 300 lines. Copy-and-patch needs a stencil extractor run at engine build time (Mach-O and ELF relocations; about 1,000 lines, in CMake through a host tool) and a patcher (about 800 lines).
5. **A generic program main in `libzn_rt`** (`src/rt/aot_main.cpp`). It reads the symbols `zn_module`, `zn_module_size`, `zn_natives` and `zn_natives_count`, which replaces the main written into every generated C++ program (`aot.cpp:505-530`). The C++ path benefits too: it is the "main unit of 0.2 s" of fast-builds §4. About 150 lines.
6. **Output:**
   - JIT tier: the functions go into executable memory and their pointers into `Func::native`. The interpreter's `Call` must dispatch to `native` when it is set (one branch in `src/vm/vm.cpp`), which allows hot functions only.
   - Object output: a Mach-O and ELF writer (about 1,000 lines), linked with the same `libzn_rt.a` and libraries as today.
7. **Tests.** `tools/diff-matrix` gets a fourth engine column; there is one T0 test for the module and one T1 smoke run on hero (a few frames, one hash).

**Total.** About 3-4K lines of Zinc code, plus the vendored backend (MIR about 35K lines including its interpreter; nothing for copy-and-patch), for arm64 and x86-64 macOS and Linux only. Every other target stays on C++.

**The spike that would settle (b) against (c)**, about one session, behind the revisit condition:

- Copy-and-patch only the typed functions (ZN-144: numbers in and out, no references) of `tests/bench/kernels` with pinned registers.
- Compare code speed with `-O2` and with the interpreter (`bench/m4.json`), and code generation time with clang.
- If the stencil code reaches at least half of `-O2` on nbody, spectralnorm and mandelbrot, (b) wins. Otherwise (c) or nothing.

## 7. Candidate `backlog/later.md` lines (not added; for the coordinator)

Under "Engine and tools":

- `direct-codegen: retake §2 of docs/reports/direct-codegen-research-2026-10-30.md alone (load 19-32 during the run): hero unit CPU at -fsyntax-only, -O0, -O2, and nbody at -O0/-O2 vs the interpreter; the numbers decide whether a direct backend is ever worth scoring again.`
- `aot: a generic program main in libzn_rt (zn_module, zn_natives symbols) instead of the main written into every generated C++; it shrinks the main unit and is the entry a direct backend or a JIT tier would reuse (direct-codegen §6.5, fast-builds §4).`
- `aot: move typedFunctions and the leaf, label and handler analyses of src/aot/aot.cpp into src/zbc, so a second emitter can share them (direct-codegen §6.1).`
- `vm: Call dispatches to Func::native when set, so compiled and interpreted functions can mix in one machine (a prerequisite of any native tier; today a program is all one or the other).`
- `direct-codegen: spike copy-and-patch stencils compiled from include/zn/ops.h for the typed functions of tests/bench/kernels, with pinned registers; gate at half of -O2 on nbody, spectralnorm, mandelbrot; only when D43's revisit condition holds after the fast-builds plan (direct-codegen §5).`
- `ops: a T0 conformance test of every zn::ops operation over edge values (NaN, -0, Inf, INT_MIN/-1, shifts >= 32, f64 to int out of range), engine against a reference table; useful today for the interpreter and AOT, required before any second code generator.`

## 8. Sources

Repository [R]:

- `ARCHITECTURE.md`; `RULES.md` §4
- `src/ir/ir.h`; `src/zbc/zbc.h`; `include/zn/opcodes.h`; `include/zn/ops.h`
- `src/aot/aot.h`, `src/aot/aot.cpp`; `src/main.cpp` (842-1117, 2894-3010); `src/tc/tc.cpp:32`; `src/rt/rt.h:334`; `src/rt/program.cpp:61`; `src/vm/vm.cpp:40`
- `docs/reports/fast-builds-aot-study.md`; `docs/reports/quickjs-aot-jit-and-ffi.md`; `docs/reports/zinc-next-esp32-aot.md`; `docs/reports/esp32-aot-lvgl.md`; `docs/reports/zinc-next-native-abi.md`; `docs/reports/zinc-vm.md`
- `docs/reports/zinc-next-decisions.md` (D13, D14, D36, D43, D44, D46, D68, D106, D110, D134, D184); `third_party/README.md` (WAMR 2.4.5)

Measurements [M]: run with commands of this form:

- `ZINC_HOME=<scratch> ZN_KEEP_CPP=1 ZINC_LOG=debug /usr/bin/time build/zinc build <x> -o <out>`
- `c++ <zinc's flags> -include-pch <pch> {-fsyntax-only | -O0 | -O2} -c hero.part{5,12}.cpp`
- nbody and fib relinked at `-O0`, `-O1` and `-O2` against `build/libzn_*.a`

The generated C++ and objects stayed in the session scratchpad, outside the repository.

Web [W]:

- QBE: https://c9x.me/compile/ and https://c9x.me/compile/releases.html (1.3, 2026-06-01; 1.2 debug directives)
- MIR: https://github.com/vnmakarov/mir (targets, 23.4K LOC, 557 KB, 0.91 geomean vs GCC -O2, 249 µs vs 27.1 ms on sieve); https://github.com/vnmakarov/mir/releases
- Cranelift: https://cranelift.dev/
- rustc_codegen_cranelift goals: https://rust-lang.github.io/rust-project-goals/2026/improve-cg_clif-performance.html and https://rust-lang.github.io/rust-project-goals/2025h2/production-ready-cranelift.html
- Cranelift 32-bit support (Pulley): https://bytecodealliance.github.io/zulip-archive/stream/217126-wasmtime/topic/Cranelift.20support.20on.20.60riscv32imac-unknown-none-elf.60.html
- Cranelift CVEs (October 2026): https://corgea.com/research/cve-2026-115893-115889-115892-wasmtime-cranelift-sandbox-escape/
- Zig 0.15.1 release notes (x86 backend default in Debug, 5x, behaviour tests; aarch64 at 84%): https://ziglang.org/download/0.15.1/release-notes.html
- Zig's x86 backend as the Debug default: https://ziggit.dev/t/self-hosted-x86-backend-is-now-default-in-debug-mode/10447
- Roc dev backend: https://git.joshthomas.dev/language-servers/roc/src/branch/main/crates/compiler/gen_dev
- libgccjit licence and size: https://tamnd.github.io/brain/research/assembly/backends/05_libgccjit/ (informal); https://packages.fedoraproject.org/pkgs/gcc/libgccjit/
- TinyCC: https://pkgs.alpinelinux.org/package/edge/community/x86/tcc
- LLVM 22 size: https://pkgs.alpinelinux.org/package/edge/main/x86_64/llvm22-libs; https://llvmlite.readthedocs.io/en/latest/user-guide/llvm22.html
- Copy-and-patch and the CPython JIT: https://peps.python.org/pep-0774/; https://sources.debian.org/src/python3.14/3.14.3-4/InternalDocs/jit.md; https://simonwillison.net/2026/Mar/17/ken-jin/
