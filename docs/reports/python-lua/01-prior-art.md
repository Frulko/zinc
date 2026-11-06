# Python and Lua for Zinc: prior art

Research date: 2026-11-04. Method: web search and page fetches. Tags used throughout:
**[V]** verified on the cited page this session; **[S]** secondary source only; **[U]** from background knowledge, NOT verified this session (re-check before relying on it).
Several searches returned thin results (no Lua share in the SO summaries, no Defold/Love2D numbers, no godot-python status, no Teal/Pallene/Ravi/TSTL/Mojo pages fetched). Where so, it is said. Every size/speed figure not cited here is deliberately absent: measure them on our own targets (task for the next step).

## 1. Embeddable interpreters

### Lua family

| Engine | Licence | Release / activity | Notes |
|---|---|---|---|
| PUC Lua 5.5 | MIT [U]; lua.org says "all files distributed under this license" [V] | 5.5.0 released 2025-12-22; 5.5.1 dated 2026-08-03 [V: https://lua.org/work]. 5.4.8 was 2025-06-04 [S: lua.org/versions.html cache] | Pure ANSI C, reference VM, C API stack-based, incremental/generational GC, coroutines built in, 5.3+ integer/float subtypes. Builds with any C compiler incl. `zig cc` [U, but trivially expected: ~30 .c files, no deps]. Runs on ESP32/wasm/iOS (no JIT used) [U]. |
| LuaJIT 2.1 | MIT [U] | Rolling 2.1 branch; distro packages updated in 2026 (an upstream tag 2.1-20260824 is mentioned, [S] Debian/Ubuntu trackers via search) | Lua 5.1 semantics plus FFI. ARM64 JIT exists but 2016 Linaro notes said only interpreted on ARM64 at the time [S: collaborate.linaro.org]; current state not confirmed. Defold devs say they use LuaJIT's *interpreter only* on iOS and consoles because JIT is disallowed, and it is still faster than stock 5.1 [S: forum.defold.com/t/know-your-engine-limitations/9742]. Hand-written assembly interpreter: porting to a new CPU is a big job, so no ESP32 (Xtensa/RISC-V) [U]. Stuck at 5.1: a dialect risk. |
| Luau (Roblox) | MIT [U]; luau.org page does not state it [V] | Weekly releases: 0.741 (2 Oct) to 0.745 (30 Oct) of 2026 [V: https://github.com/luau-lang/luau/releases]. 0.745 adds native codegen auto-promotion of hot functions | Gradual type system, sandboxed by default, optional native codegen on x64 and arm64, C API is an extension of Lua's with better coroutine/yield support; compatible with Lua 5.1 plus selected later features, not a superset of 5.4 [V: https://luau.org/]. Interesting for Zinc: types and sandbox already exist, closest to "typed Lua". C++17 codebase, ~hundreds of files, built with CMake [U]. |

Lua verdict: PUC Lua is the cheap, safe vendor (C89-ish, tiny, runs everywhere); Luau is the best fit if types and sandboxing matter; LuaJIT is a speed option only where a JIT is allowed, and is a 5.1 dialect.

### Python family

| Engine | Licence | Release / activity | Notes |
|---|---|---|---|
| CPython (embedded) | PSF [U] | 3.14 line current; Pyodide 314.0.7 tracks it [V: pyodide.org downloading page] | iOS (arm64-apple-ios) and Android (aarch64-linux-android) are PEP 11 **Tier 3**; Emscripten Tier 3; WASI Tier 2 from 3.13 (table in PEP 11) [V: https://peps.python.org/pep-0011/]. 3.14 docs: Android has no subprocess, iOS no subprocess/multiprocessing/IPC [S via search of docs.python.org/3.14]. Free-threading: not covered by the pages fetched, unverified. Full stdlib: tens of MB, not for ESP32/handhelds. Refcount plus cycle GC. Needs generated config and many modules; build with zig is possible (people do) but heavy [U]. |
| MicroPython | MIT [V: github.com/micropython/micropython] | v1.28.0 on 2026-04-06; 1.29 previews May 2026 [S: micropython.org/download via search] | "Entire Python 3.4 syntax" plus async/await and some later features, subset of types/modules. Targets from **256 KiB flash and 16 KiB RAM**; 512 KiB/128 KiB for a fuller experience [V]. Ports: esp32, rp2, stm32, unix, windows, (tier 1), webassembly (tier 2) [V]. Mark-sweep GC, C API is "mp_*" internal (embedding via the `embed` port, tier 2) [V]. The default answer for ESP32. |
| CircuitPython | MIT [U] | Adafruit fork of MicroPython [U] | Same core, Adafruit hardware API; no separate embedding story [U]. |
| PocketPy (pkpy) | MIT [V: github.com/pocketpy/pocketpy] | Active; no release listed on the page [V] | Single header/source pair or CMake, C11, "should work on any platform with a C11 compiler"; tested on Win/Linux/macOS/Android/iOS 64-bit, Emscripten 32-bit, Raspberry Pi OS, Luckfox. Has match/case, decorators, generators, type annotations, f-strings, exceptions. Explicitly "an alternative to Lua for game scripting". C API (`py_initialize`, `py_exec`, ...). GC not documented on the page. The closest Python equivalent of Lua in footprint and embedding. Size/speed numbers not on the page: measure. |
| RustPython | MIT [U] | Not fetched | Rust, pulls a Rust toolchain into a C++20 repo; poor fit [U]. |
| Pyodide | MPL-2.0 [U] | 314.0.7 [V] | Web only: full distribution "200+ megabytes", needs wasm MIME + CORS headers [V]. It is CPython compiled to wasm; irrelevant for non-web targets. |
| GraalPy | UPL [U] | 25.1.x in 2026; Python 3.12, 3.13 planned for 2026 [S: mvnrepository, GraalVM blog via search] | JVM only; not embeddable in a C++ engine. Skip. |
| IronPython | Apache-2 [U] | 3.4.2 latest; Python 3.4 base plus f-strings [S: github.com/IronLanguages/ironpython3 releases] | The .NET dynamic-language story ended at Python 3.4-level compat: a warning about what a "second language on someone else's runtime" costs. |

Python verdict: for MCU/handhelds, MicroPython or PocketPy; CPython only on desktop/mobile where its size is acceptable and only if ecosystem (numpy) is the point. None gives us the typed AOT path by itself.

## 2. Ahead-of-time compilers from typed subsets

| Tool | What it accepts / how it works | Cost to users | Source |
|---|---|---|---|
| Codon (Python) | Python-syntax, statically typed compiler to native, claims 10-100x over CPython; native multithreading with no GIL; reimplemented NumPy. **Not a drop-in replacement**: "aspects of Python unsuited to static compilation are unsupported"; Python interop needs `CODON_PYTHON` pointing at a CPython library. Adds non-Python syntax (`@par`, `@gpu.kernel`). Licence is now Apache-2.0 (no BSL text in LICENSE on develop). | Loses the real ecosystem: only what Codon reimplements, others via a CPython bridge. | [V] https://github.com/exaloop/codon, LICENSE. The "Differences with Python" doc page could not be fetched (404/redirect): the exact list (e.g. 64-bit ints, dict/str semantics) is **unverified here**. |
| mypyc | Compiles type-annotated modules to C extensions; mypy itself compiled since 2019 with "4x" boost. Self-described **alpha**; roadmap lists better compatibility, compile speed, usability. Output is a CPython extension: needs CPython at run time. | Keeps ecosystem, gains little vs a real compiler, no standalone binary. | [V] https://github.com/mypyc/mypyc |
| Shed Skin | Implicitly-typed Python 3 to C++; no nested functions, no varargs, ~25 stdlib modules, "do not expect a program to compile without changes". Reported 1-100x vs CPython 3.14. | Very strict, small ecosystem. | [S] https://github.com/shedskin/shedskin, PyPI 0.9.x |
| SPy (A. Cuni) | A Python *variant* designed to be statically compilable while keeping useful dynamic parts; interpreter plus compiler ("redshift" step), C backend targeting native, WASI, Emscripten. Early stage, docs "very scarce", editable install from git only. | Research project; shows the idea is live but not product-ready. | [V] https://github.com/antocuni/spy (fork page) |
| Nuitka, Cython, Pythran | Nuitka compiles whole programs, keeps full semantics, still needs the CPython runtime; Cython adds C types; Pythran targets numeric subsets. | Not verified this session. | [U]; search returned nothing usable |
| Mojo | Python-syntax superset aimed at ML/GPU. | Status (licence, open-sourcing, stability) not verified. | [U] |
| Lua: Teal, Pallene, Ravi | Teal: typed Lua dialect that transpiles to plain Lua. Pallene: typed subset compiled to C, interoperates with Lua tables. Ravi: Lua 5.3 with optional static types and JIT. | Not fetched; all small communities. | [U] |
| Luau | Gradual types plus optional native codegen (x64, arm64) inside the VM. | Staying in Lua semantics; types are checker-only, codegen is a VM feature. | [V] luau.org, releases page |
| TypeScriptToLua | TS to Lua transpiler, the reverse of what we study; widely used with LÖVE/Defold/WoW [U]. Evidence that people pick TS-type-safety over writing Lua when they can. | | [U] |

Pattern: every strict-subset compiler either (a) breaks compatibility openly (Codon, Shed Skin) or (b) stays a CPython extension generator (mypyc, Cython). Nobody gets "same Python, native, ecosystem intact". The one product that is a typed-subset front end for end users is MakeCode (below).

## 3. Multi-language front ends: what happened

Verified items first.

- **MakeCode (very relevant) [V: https://makecode.com/language, https://support.microbit.org/support/solutions/articles/19000111744]**: Blocks, **Static TypeScript** (a subset of TS 2.6.1: no `var`, modules, `eval`, async, prototype inheritance; nominal class typing) and **Static Python**. Blocks and Static Python are both **converted to Static TypeScript before compilation**; TS goes to ARM Thumb machine code on microcontrollers and to CPS JavaScript in browsers/simulators. Static Python supports lists, dicts, functions, loops, conditionals, lambdas, string/list methods but, per the page, **classes, `try`, imports, comprehensions, format strings, `*args` are not supported**, and "may be experimental" in some editors. micro:bit support states it is "static TypeScript with Python syntax", shares TS limitations and is not MicroPython; the separate micro:bit Python Editor runs real MicroPython with a different API and code does not carry over. So: one IR (TS), three surfaces, and Python is the weakest and most incompatible one. No usage-share data found. This is the direct precedent for "Python front end onto a typed TS subset": cheap to build, and users see an unfinished Python. Internals of the Python-to-TS converter were not documented in anything I reached.
- **TIC-80**: one fantasy console, many languages. Sources list Lua, MoonScript, JavaScript, Wren, Fennel, Squirrel, Janet, Ruby, Python (and wasm), lists differ by source; each language is a separate embedded runtime [S: Wikipedia mirror, GitHub mirrors; official page returned 404]. Evidence it can be done as separate embedded VMs; no per-language usage numbers found. PICO-8 is Lua only [U].
- **Godot**: GDScript about 84% vs C# 16% of scripting choice in the 2025 community poll (~9,600 respondents) [S only: ziva.sh, gtstu.com; official results not checked]. VisualScript was removed in 4.0 because it did not become a good low-code tool [V: gamefromscratch.com]. godot-python/GDExtension status: not verified. Lesson: users strongly prefer the engine's native language; extra languages are minority options.
- **Pyxel** (Python retro engine, MIT): 2.8.4 on 2026-03-16, ~17-18k GitHub stars [S: ecosyste.ms, lib.rs]. Shows demand for Python in fantasy-console style, but Pyxel is *the* Python engine, not a second language.
- **IronPython** [S]: 3.4.2 on Python 3.4 baseline plus f-strings; the DLR approach left Python compat years behind CPython.
- **GraalPy** [S]: alive (25.1.x 2026), tied to JVM.

Not researched this session (no sourced facts available, background only [U]): Haxe (many targets, one language: its own niche, not a "second language" story); Kotlin Multiplatform (one language, many targets); NativeScript (JS/TS plus Angular/Vue, never added Python); Defold and LÖVE (Lua-first engines; Defold supports TS via TSTL as community add-on); Solar2D (Lua only); Kivy, BeeWare/Toga, Flet, Textual (Python-first toolkits, none added a second language); Pygame-CE (Python-only). Arduino/micro:bit: MicroPython is an alternative environment next to C++/MakeCode.

Honest reading: the successful multi-language products either started from one language and treated the others as bridges (Godot: GDScript first, C# second; MakeCode: TS core, Blocks and Python as views) or were designed as a platform of many VMs from day one (TIC-80). I found no case of a "second language" that matched the primary in quality unless it was funded as a first-class product.

## 4. Demand

[V] Stack Overflow Developer Survey 2025, all respondents / professionals / learning to code (https://survey.stackoverflow.co/2025/technology/):

| Language | All | Pro | Learning to code |
|---|---|---|---|
| JavaScript | 66% | 68.8% | 62.8% |
| Python | 57.9% | 54.8% | **71.8%** |
| TypeScript | 43.6% | 48.8% | 31.9% |
| C++ | 23.5% | 21.8% | 44.6% |
| Lua | 9.2% | 8.6% | **15%** |

So among learners Python beats JS by about 9 points and TypeScript is at 32%; Lua is small overall but higher among learners (and game-focused). That is the best hard data for "education: Python". 2026 survey figures were not checked. Not found: classroom-adoption data, micro:bit language shares, Roblox/Love2D/Defold user counts (Roblox is Luau-only by design [U]). Makers: MicroPython/CircuitPython are widespread on RP2040/ESP32 boards (releases above show ESP32-C5, P4 support), but no share figure was retrieved.

## 5. Semantics that resist static compilation

Python (all [U] language knowledge, not source-dependent):
- Dynamic attributes and `__dict__`: any object can gain fields; static layouts (structs) break. Codon and Shed Skin reject this.
- Metaclasses, `__getattr__`, `__setattr__`, monkey-patching, `type()` at run time.
- Arbitrary-precision `int` by default: a typed backend picks i64 and silently diverges (Codon-style); exact semantics need a bigint path on every add/mul.
- Duck typing plus no declared types: needs inference or annotations; annotations are not enforced by CPython, so a compiler that trusts them changes behaviour.
- Exceptions as general control flow (StopIteration, `with`, `finally`), tracebacks.
- Decorators (arbitrary functions run at definition time), generators/coroutines, `async`, closures with `nonlocal`.
- GIL expectations: code relies on atomic list/dict ops; a GIL-less or single-threaded engine changes what is safe. Free-threaded CPython status not verified.
- `eval`/`exec`, `import` at run time, the C-extension ecosystem (numpy, Pillow...) which no embedded subset can load; MicroPython and PocketPy have their own small libs.
- Strings: Unicode code points, `str` vs `bytes`; indexing semantics differ from JS UTF-16 strings (Zinc side to be checked).

Lua:
- 1-based tables; `#t` with holes is undefined; arrays and maps are one structure.
- `nil` cannot be stored in a table (assignment deletes the key), so "absent" and "null" merge; arrays with nils have unreliable length.
- Metatables (`__index`, `__newindex`, `__call`, `__gc`...) give OOP, inheritance and operator overloading with no class declaration: static typing needs a class convention on top (Teal/Luau do this).
- Multiple returns and varargs (`...`, `select`, `table.unpack`) do not map to single-return typed functions.
- Coroutines are first-class and stackful (yield across calls): needs real stack switching or CPS in an AOT/IR path.
- 5.3+ integer and float subtypes (`1 == 1.0`, `//`, wrap-around integers), 5.1/LuaJIT/Luau have only doubles (Luau: no integer type): the dialect choice changes numeric semantics.
- Dialect fragmentation: 5.1 (LuaJIT, Luau-derived), 5.4, 5.5; `goto`, `<const>`, `<close>`, new global declarations in 5.5 [U].
- Globals by default, `_ENV` tricks, `load`/`require` at run time.

## What this means (10 conclusions)

1. **Two different problems.** A *VM front end* (embed an interpreter beside QuickJS) is cheap and proven; a *typed AOT front end* (Python/Lua into the Zinc IR) is research-grade. Evidence: Codon, mypyc, Shed Skin, SPy all break compatibility or stay alpha/early (sections 2, 5).
2. **Lua is the low-risk first language.** PUC Lua 5.5 is MIT, active (5.5.1 on 2026-08-03), tiny C, runs where we run [V on dates, U on footprint]. Luau is the typed, sandboxed alternative with a live release cadence (weekly in Oct 2026) and arm64 native codegen [V].
3. **LuaJIT is not a good fit for a no-JIT, multi-target engine**: Lua 5.1 only, interpreter-only on iOS/consoles per Defold [S], hand-written per-CPU assembly [U].
4. **For Python, the real choices are MicroPython and PocketPy, not CPython.** MicroPython: MIT, v1.28 2026-04-06, 256 KiB flash/16 KiB RAM floor, esp32/wasm/unix ports [V]. PocketPy: MIT, C11, tested on iOS/Android/Emscripten/Pi [V], pitched as a Lua alternative for game scripting. CPython is Tier 3 on iOS/Android and Pyodide is 200+ MB [V]: only for desktop where ecosystem matters.
5. **No ecosystem promise.** Any embedded or compiled Python loses numpy and C extensions (Codon reimplements numpy; mypyc requires CPython) [V]. Zinc should sell "Python syntax on Zinc APIs", never "your Python packages".
6. **A Python-syntax front end onto a typed IR already shipped once, and users see its gaps.** MakeCode Static Python lacks classes, try, comprehensions, f-strings, imports and is flagged experimental, while the micro:bit's MicroPython editor is a different, incompatible product [V]. Expect the same if Zinc maps Python onto its IR: an honest, documented subset beats a silent one.
7. **Demand for Python is real among learners, Lua's is smaller but concentrated.** SO 2025: 71.8% of those learning to code use Python vs 31.9% TypeScript; Lua 15% of learners vs 9.2% overall [V]. For education and makers the case for Python is strong; for games/artists Lua (PICO-8, TIC-80, LÖVE, Defold, Roblox) is the cultural default [U on the latter engines].
8. **Users prefer the host's native language; extras stay a minority.** Godot GDScript ~84% vs C# ~16% [S, unverified against official data]. Plan on a minority audience for any non-primary language and don't let it drive core design.
9. **Multiple languages on one console works as separate embedded VMs** (TIC-80 lists up to ~9 [S]) and as views over one IR (MakeCode [V]). Both patterns cost one adapter per language; the failure mode is shallow second-class support (VisualScript removal [V], IronPython stuck at 3.4 [S]).
10. **Gaps in this research to close before deciding**: footprint/speed measurements on our targets (none cited here), the Codon differences list, free-threaded CPython status, Teal/Pallene/Mojo/TSTL/Haxe/NativeScript/Defold/LÖVE/Kivy facts, MakeCode Python converter internals, 2026 SO survey. All marked [U] or absent above.
