# Python and Lua on Zinc: the static front end

2026-11-04. **First version of the study, kept as the design of one route.** The owner then asked for real programs with `pip` and LuaRocks modules, which this route cannot give; the current answer is [00-study.md](00-study.md). What follows stays valid for what that study calls the static route: the targets with no CPython, and later the fast path. Its section 1 argues against a VM because it assumed no packages; read it with that in mind.

Companions: [01-prior-art.md](01-prior-art.md) (other projects, demand, sourced), [02-api-surface.md](02-api-surface.md) (what a program must reach, counted), [spike/](spike/) (the code that produced the numbers below).

Tags: **[measured]** run here today on the development Mac, **[code]** read in this tree, **[estimate]** my judgement, not a measure. Prior-art facts keep the tags of `01-prior-art.md`.

## 1. The answer

**Make Python and Lua two more front ends of the compiler, not two more runtimes.** A `.py` or `.lua` file is lowered to the same plain code a `.tsx` file becomes, before the parser, exactly where the JSX lowering already sits. The checker, the IR, the interpreter, the AOT, Fast Refresh, the plugins and every target then work with no further change.

This was tried, not only argued. A throwaway transpiler of 318 lines for Python and 371 for Lua ran these on the real engine, with no engine change:

| Proof | Result [measured] |
|---|---|
| A `zinc:gfx` game with classes (Python) or records (Lua) | runs, frame captured |
| A `zinc:ui` screen with `create_signal`, reactive text and the kit's `Button` | runs; 25 ticks show "Count: 25", so the signal reaches the text |
| fib, mandelbrot, n-body | **same printed output as CPython and as PUC Lua, to the last digit** of the n-body float |
| The kernels' `.py` and `.lua` files | also run unchanged on CPython and on Lua 5.5 and LuaJIT (the game and the screen import `zinc`, so they run on Zinc only) |
| AOT speed | 13x to 143x CPython 3.9, 3x to 27x Lua 5.5, level with LuaJIT |

Three things this gives that no other route does:

1. **All of Zinc from day one.** 15,855 lines of `lib/std` and 81 plugins are TypeScript. On this route they are simply imported; on a VM route each needs a binding.
2. **Every target.** No interpreter to port: an ESP32, a PS1 or an old phone runs the same bytecode or C++. It adds nothing to the binary.
3. **Mixed projects.** A Python file imports a TypeScript module and the reverse, since both become the same tree. Nobody has to choose once and for all.

And the price, stated plainly: **this is not all of Python, and it never will be.** No `pip`, no numpy, no C extensions, no `eval`, no monkey-patching. MakeCode took the same route and users meet an unfinished-looking Python ([01](01-prior-art.md) §3). So the product is named for what it is, "Python for Zinc", with one hard rule: **a program either behaves as in CPython or is refused with a clear message, never silently differs.** Today's engine does not yet meet that rule; §6 lists what must change.

Recommendation: Python first (71.8% of learners use it against 31.9% for TypeScript, 15% for Lua, Stack Overflow 2025), Lua on the same machinery right after, a real Lua VM as an optional plugin later for scripting and live coding. Nothing here has to wait for the cross-platform pass, but it is a large new front: §9 lists what only the owner can decide.

## 2. Why the engine allows it

```
 today                                                         added
 .tsx ─ lowerJsx ─┐                                  .py  ─ lowerPython ─┐
 .ts ─────────────┤                                  .lua ─ lowerLua ────┤
                  ▼                                                      ▼  (plain TSX text and a source map)
        parse ─ check ─ desugar ─ typed SSA IR ─ ZBC ─ interpreter / AOT C++
                  └─ strip ─ QuickJS, JSC, V8, Hermes
```

- **The hook exists** [code]. `loadFile` in `src/frontend/modules.cpp:2270` already rewrites source text before parsing: React Native imports, `requireNative`, workers, StyleSheets, JSX. `lowerJsx` returns the new text and a `SrcPiece` map back to the source, and the diagnostics and `#line` already go through it. A new language is one more branch there, plus `entryOf` (`project.cpp:660`) and the resolver (`resolve.cpp:100`).
- **The UI needs no compiler help** [code]. JSX lowers to plain calls returning `i32` handles, and reactivity is a closure library (`solid.ts`, 367 lines). Better still, a language can lower to JSX and let `lowerJsx` do the rest, including the validation of `className`. The spike does this: `View(...)` in Python and `View { ... }` in Lua both become `<View>`.
- **The signatures are simple** [measured, 02 §3]. Functions over scalars and strings, option objects, callbacks, classes, promises. Generics and unions are rare, real overloads absent.

Lowering to text rather than building tree nodes is deliberate: the tree has one layout per TypeScript form and a text output keeps a new language from depending on it. What text cannot do (a choice that depends on a type) goes through a few intrinsics the checker resolves (§6).

## 3. The routes compared

Scored as `RULES.md` §4 says (1 to 5; fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1). The scores are my judgement [estimate]; the arguments are the part to challenge.

| Route | Fit | Perf | Size | Maint. | Lic. | Port. | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. Front end onto the shared pipeline** | 4 | 5 | 5 | 3 | 5 | 5 | 3 | **61** |
| E. `zinc:lua` plugin: real Lua, inside a TypeScript app | 2 | 3 | 4 | 4 | 5 | 4 | 4 | 49 |
| B. A VM as a full engine (PUC Lua, PocketPy, MicroPython) | 3 | 2 | 3 | 2 | 5 | 4 | 2 | 41 |
| C. Transpile to JavaScript, run on QuickJS | 2 | 2 | 3 | 3 | 4 | 3 | 4 | 39 |
| D. CPython beside Zinc, driving its UI (the Flet model) | 2 | 2 | 1 | 3 | 4 | 1 | 3 | 32 |

- **A** loses a point on fit only because it is a subset. It is the only route where the existing library, plugins and targets come free.
- **B is the obvious idea and the expensive one.** A VM gives the real language, and PUC Lua is only 266 KB [measured, Homebrew arm64 dylib]. But the UI is TypeScript, so a VM must reach about 1,362 exports of `lib/std` and 81 plugins across a boundary, or rewrite them per language. It has no AOT, so it gives up what makes Zinc fast, and each VM brings its own GC beside the reference counts. It also breaks the design's goal of one semantic source. The boundary is not free either: `zinc:script` costs 1.0 us per call on the Mac and 62 to 95 us on the Nexus 7 today (`script-boundary-optimisation.md`).
- **E is B's good part**: real Lua inside an app, for mods, live coding and user scripts, on the model of `zinc:script`. It complements A and does not replace it, since an app's UI stays out of its reach unless the host exposes it.
- **C** combines the weaknesses: no AOT, no ESP32, and Python's semantics imitated in JavaScript. And route A already reaches QuickJS, because its output is TSX.
- **D** is the only way to real numpy and `pip`, on a desktop or a Pi, with no export to a single binary. If data and AI users become the target, it is a separate product decision, not a step of this one.

## 4. What the spike measured

Best of 3, whole process, on the M1 Pro with a **load average of 12 to 18 from other trees**. So the ratios are indicative, and by the rule of `AGENTS.md` these are not numbers for the performance log. Rerun with `spike/bench.sh <work dir>` on a quiet machine before quoting them outside this study.

| ms | CPython 3.9.6 | Lua 5.5.0 | LuaJIT 2.1 | QuickJS (from .py) | Zinc interp (.py / .lua) | Zinc AOT (.py / .lua) |
|---|---|---|---|---|---|---|
| fib(32) | 520 | 174 | 45 | 249 | 82 / 78 | 41 / 60 |
| mandelbrot 400² | 1194 | 366 | 54 | 680 | 188 / 191 | 53 / 53 |
| n-body 600k steps | 9313 | 1782 | 100 | 2460 | 773 / 792 | 65 / 67 |

- AOT against CPython: **12.7x, 22.5x, 143x**. The interpreter alone: 6.3x, 6.4x, 12x. This CPython is old (the one macOS ships); a current one is faster, by a margin I did not measure.
- Against Lua 5.5: AOT 2.9x, 6.9x, 26.6x; interpreter about 2x. LuaJIT stays in the AOT's range (45, 54 and 100 ms against 41 to 60, 53 and 65 to 67), but LuaJIT has no JIT on iOS or consoles ([01](01-prior-art.md) §1).
- Binary of the Python fib: 254 KB, with no interpreter inside [measured].
- **The dynamic path is not a fallback.** The same fib with no annotations, through `any`, takes 638 ms in AOT and 1597 ms interpreted: **15x and 19x slower than typed, and slower than CPython itself**. This is the most important number here: unannotated code cannot simply be sent to `any`. It has to be inferred (§6).

Not proven by the spike: real clicks (the reactive proof uses the tick callback), the other targets, source maps (errors point at the generated text), anything beyond the constructs of the samples. In the deterministic capture the `Button` drew dark instead of blue; I did not look into why.

Captures: `spike/shots/`.

## 5. What the languages would look like

### Python

```python
from zinc.ui.solid import render, create_signal, View, Text
from zinc.ui.kit import Button

count, set_count = create_signal(0)

def App():
    return View(
        Text(f"Count: {count()}", class_name="text-4xl font-bold text-white"),
        Button(label="Add one", on_click=lambda: set_count(count() + 1)),
        class_name="w-full h-full items-center justify-center gap-4",
    )

render(App, 0x111827, None)
```

This is the spike's sample, minus one line. It is valid Python that pyright can check against generated stubs, and it shows the choices: `import` from `zinc.x`, snake_case mapped to the engine's camelCase mechanically, keyword arguments mapped to props, capitalised engine components mapped to elements.

| Python | Maps to | State |
|---|---|---|
| functions, defaults, lambdas, closures, `global`, `nonlocal` | functions and closures | direct |
| `class`, `__init__`, inheritance, fields from `self.x = ...` | classes, field types inferred | direct, the spike does it |
| `list`, `dict`, `set`, `tuple`, `for`, `range`, `enumerate`, `zip` | arrays, `Map`, `Set`, tuples, loops | direct |
| generators, `async`/`await` | `function*`, `async` (both work [measured]) | direct |
| `try`/`except`/`finally`, `raise` | `try`/`catch` plus `instanceof` | direct for raised errors; engine traps are not catchable (§6) |
| comprehensions, slices, negative indices, f-strings with formats, `in`, `*args`, keyword arguments, decorators, `with`, `@dataclass`, `Enum` | generated code or small prelude functions | lowering work |
| `if items:`, `len(x)`, `==` on values, `print(1.0)` printing `1.0` | depend on the type | need intrinsics (§6) |
| `int` | `i64`, stopping with a clear error on overflow | needs checked arithmetic (§6) |
| `str` indexed by code point | engine strings count UTF-16 units: `"😀"` has length 2 [measured] | **divergence to settle** (§9) |
| unannotated parameters | inferred from the call sites (§6) | needs the checker |
| `import numpy`, `eval`, `exec`, `getattr` on a computed name, metaclasses, adding attributes at run time | **refused**, with a message saying so and what to do | by decision |

Unlike a VM, this route gives the code real speed and reach. Unlike CPython, it refuses things. A beginner's program with classes, lists and a game loop fits; a script copied from Stack Overflow using `requests` and `pandas` does not, and must be told so on its first line.

### Lua

```lua
local render, create_signal, View, Text = require("zinc.ui.solid")
local Button = require("zinc.ui.kit")

local count, set_count = create_signal(0)

function App()
  return View { class_name = "w-full h-full items-center justify-center gap-4",
    Text { class_name = "text-4xl font-bold text-white", "Count: " .. count() },
    Button { label = "Add one", on_click = function() set_count(count() + 1) end },
  }
end

render(App, 0x111827, nil)
```

Lua's table-call syntax makes it the nicest of the three languages for UI trees.

**Types come from LuaLS comments** (`---@param x number`, `---@class`). This is the decision the spike supports best: unlike Luau or Teal syntax, the file stays valid Lua, so `lua` itself can be the test oracle, and lua-language-server, the editor tool Lua people already use, gives editing support for free. I recommend it over Luau syntax, though Luau's users are numerous: the spike proved the comments suffice, and a later Luau syntax would be a small addition.

| Lua | Maps to | State |
|---|---|---|
| `local`, functions, closures, `if`, `while`, numeric `for`, `ipairs` | direct | the spike does it |
| `{1, 2, 3}` / `{x = 1}` | array / record, chosen by the constructor | the spike does it |
| `t[i]`, `#t` | index shifted by one, length; the AOT makes the shift free | the spike does it |
| `t[#t + 1] = v`, `table.insert` | `push` | recognised idioms |
| `Class.__index = Class`, `setmetatable({}, Class)`, `function Class:m()` | a class, by recognising the idiom | lowering work, **not in the spike** |
| multiple returns, varargs | tuples at known arity, rest parameters | lowering work |
| `pairs`, strings, Lua patterns | `Map` iteration; the matcher of `lstrlib.c` vendored (MIT) rather than mapped to regex | lowering work |
| `coroutine` with `yield` inside the function itself | generators | lowering work |
| `yield` across calls | the engine has no stack switching [code] | refused at first; a real engine change |
| a read past the end gives `nil`; `t[10] = v` with holes | engine traps [measured] | **divergence**: refused or checked, to settle |
| `{}` used as anything, tables mixing array and keys, metatable tricks, `load` | **refused** | by decision, or route E |

Lua loses more in this translation than Python does, because its heart is the dynamic table. Those users get real Lua through route E.

## 6. What the engine lacks

Each was probed on the current `build/zinc` [measured]. Under "fill the engine's gaps" these are fixed in the engine, and several of them help TypeScript too. They, more than the parsers, are the real cost.

| Gap | Observed | Needed for | Fix |
|---|---|---|---|
| **Inference of unannotated parameters** | `function add(a, b)` is Z0109; a generic `T` refuses `a + b` (Z0107) | ordinary beginner Python and Lua | treat an unannotated parameter as a template checked per call site, on the cloning `check.cpp` already does for generics (Codon's approach, [01](01-prior-art.md) §2). **The hardest item.** |
| **Empty containers** | `const xs = []` is Z0109 | `balls = []` then `append` | infer from the later uses in the function |
| **Silent integer overflow** | `i32` and `i64` wrap with no error | the rule "same as CPython or refused": a wrong factorial is the worst possible beginner experience | checked arithmetic in the IR for code of these languages; in the AOT, the compiler's overflow builtins |
| **Traps not catchable** | out of bounds and division by zero end the program; `try` does not catch them | `except IndexError`, `except ZeroDivisionError` | raised errors for these languages, costing only on the failure path |
| **`any` cannot call methods** | `p.n()` and `a.push(3)` on `any` are Z0105 | duck typing when inference gives up | method dispatch on `Dyn` |
| **`any` loses a new property** | `p.y = 2; console.log(p.y)` on a class instance prints `undefined` | correctness, **in TypeScript today**, where JavaScript prints 2 | worth a look on its own: report or fix it |
| **Type-directed forms** | `if (xs)` is refused, even on `any` (Z0103); `console.log(1.0)` prints `1` | truthiness, `len`, `==`, `print`, `str` | intrinsics (`__truth(x)`, `__len(x)`, `__str(x)`...) the checker resolves by type, the pattern of `__reLit` and `__fmt` |
| **No big integers** | `bigint` does not exist in the typed engine | Python's unlimited `int` | none for now: the overflow error says so. Vendor a library later if people ask |
| **No neutral description of the API** | `zinc doc` has its signature model but no JSON | generating `.pyi` and LuaLS stubs | `zinc doc --json` |

## 7. Tools: mostly free

- **Editors: do not extend `zinc lsp`.** Generate `.pyi` stubs for pyright and `---@meta` files for lua-language-server from `zinc doc --json`; `zinc new` drops them in the project. Completion, hover and type errors then come from the tools these users already have.
- **Tests: the languages bring their oracle.** Like `tools/oracle` for TypeScript, any program a front end accepts must print the same under CPython or `lua`. That is differential testing with no goldens to maintain, and it enforces the hard rule directly. The spike's matching outputs are the first small instance.
- **Errors** are what beginners read, so they matter most. Positions go through `SrcPiece`. Type names and messages need one language-aware layer (`list[int]`, not `number[]`), and the refusals get `zinc explain` entries, with translations as the other diagnostics have. A diagnostic must never show the generated text.
- **`zinc new`:** the copier is already language-neutral (02 §5); a few templates to add, in Python first.
- **Fast Refresh, `zinc build`, `zinc export`, plugins, targets:** nothing, by construction. Worth checking once with a real app, not assuming.
- **Docs:** the cost that never ends. Translate the guide's first steps and generate the API reference; do not double every plugin page.

## 8. The plan

Sizes are **estimates of code**, from the existing front end (`parser.cpp` 1725 lines, `jsx.cpp` 1799, `check.cpp` 5820). I give no calendar: at this project's pace the code is not the limit, the quality of the subset is.

| Phase | What | Size | Done when |
|---|---|---|---|
| **0. Vertical slice** | Python lexer (indentation) and parser in C++, `lowerPython`, the hook, `SrcPiece`, the `game-py` template | ~2,500 lines | `zinc run`, `build` and `export` of the samples, errors pointing at the `.py` |
| **1. A real subset** | intrinsics, checked `int`, catchable errors, comprehensions, slices, f-strings, dataclasses, CPython as oracle in T1 | ~2,000 lines + engine | the corpus below passes under the oracle |
| **2. Inference** | unannotated parameters, empty containers | ~1,500 lines in `check.cpp` [least sure] | beginner programs run with no annotation |
| **3. Finish** | `zinc doc --json`, stubs, templates, guide, `zinc explain` | ~800 lines + docs | a beginner goes from `zinc new` to a running game with pyright working |
| **4. Lua** | parser, `lowerLua`, the class idiom, patterns, `lua` as oracle | ~2,500 lines | same bar; it reuses all of 1, 2 and 3 |
| **5. `zinc:lua` (optional)** | PUC Lua 5.5 vendored, on the `zinc:script` model | ~800 lines | a TypeScript app runs user Lua, sandboxed |

Stop point worth respecting: **after phase 1, port one real program** (`examples/bouncing-ball`, then `breakout`) and give it to someone who writes Python. If they hit walls in the first hour, inference and docs are worth less than repairing that. The corpus: 30 to 50 small programs of the kind a beginner writes, plus the ports.

Not to do: a custom `zinc lsp` for Python; writing `lib/std` again in Python; a bridge to CPython in the same process; three or more languages before these prove themselves. TIC-80's list of languages is what that road looks like, and each stays thin.

## 9. Risks, and what only the owner can decide

| Risk | Reading | Answer |
|---|---|---|
| "It's not real Python" | Certain; MakeCode lives with it | The name, the first-line refusal, the hard rule. Never claim compatibility. |
| A second-class language | Godot: about 84% GDScript against 16% C# [secondary source] | Expect a minority. Keep it cheap by construction: no language-specific runtime, the core untouched except intrinsics. |
| Inference turns out hard | Codon and Shed Skin show it can be done and that it leaves rough edges | Phase 2 stands apart; annotations always work, and Python people already know them. |
| It slows the engine's other work | Real: each language adds a parser, a test tier and docs | Limit to two languages, a stop point after phase 1. |
| The checker fills with language cases | Moderate | Intrinsics only, resolved in one place; `check.cpp` must not learn Python. |

Decisions I would not take alone, since they change what Zinc is:

1. **Go or no go**, and when: the backlog is frozen, so this needs `New-task: owner`. My recommendation: go for phase 0 and 1 of Python, then judge on the port. Phase 0 alone already gives something to show.
2. **Strings:** Python's code points against the engine's UTF-16 units. Options: count code points in `.py` files (right, and slower on `s[i]`), or refuse emoji-dependent indexing at run time. I lean to code points through intrinsics, since an education product should not teach that `len("😀")` is 2.
3. **The promise to users:** accepting "Python for Zinc, no packages" as the public line, knowing that it turns away data and AI users. If those users matter, route D is a separate project.
4. **Lua's dialect:** LuaLS comments (my recommendation) or Luau syntax. It decides who feels at home: Neovim and LÖVE people or Roblox people.

## 10. Sources and limits

- The prior art has gaps of its own, listed in [01](01-prior-art.md) conclusion 10: web tools were flaky, so Teal, Pallene, Mojo, Haxe, Defold and LÖVE facts are unverified, and the Godot share is secondary. No VM size or speed figure there is measured on our targets. Only Lua 5.5's library size and the kernels above are.
- Effort figures and route scores are judgement. The probes, the kernels and the captures are facts of today's tree, on a loaded machine for the timings.
- The transpilers in `spike/` are proofs, not a start: the product is written in C++ inside the frontend, because `zinc` must not need Python to run. Delete them when phase 0 lands.
