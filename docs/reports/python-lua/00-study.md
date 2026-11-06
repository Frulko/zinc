# Real Python and real Lua on Zinc: the study

2026-11-04. The owner's goal: **write a real Python program, with `pip` modules and Zinc modules, and have it run in Zinc; the same for Lua.**

Companions: [01-prior-art.md](01-prior-art.md) (other projects, demand), [02-api-surface.md](02-api-surface.md) (what a program must reach, counted), [03-static-front-end.md](03-static-front-end.md) (first version of this study: the route that compiles Python and Lua with no runtime), [04-real-runtimes-research.md](04-real-runtimes-research.md) (Python and Lua distribution, wheels, precedents), [spike/real/](spike/real/) (the code behind the numbers). French: [00-etude.fr.md](00-etude.fr.md).

Tags: **[measured]** run here today, **[code]** read in this tree, **[estimate]** my judgement. Sourced facts keep the tags of the research files.

## 1. The answer

**It works, and it was run today.** The real CPython and the real Lua go inside the Zinc process. Zinc keeps the window, the frame loop and the UI; the program's language runtime is called from it and calls back into compiled Zinc code through a generated bridge.

| Proof, on the engine as it is [measured] | Result |
|---|---|
| Python 3.12, **numpy 2.5.4 from `pip`** (a C extension), `humanize` from `pip` (pure Python), a metaclass, `eval`, a thread started | all in one process with `zinc:ui` and the kit's `Button` |
| A signal changed from Python, read inside a Zinc effect that calls back into Python and numpy | the text follows: "2,000,000 samples, mean 10.00, std 2.00" |
| numpy computes 2000 particles, Python draws them through `zinc:gfx` | 0.05 ms numpy + 0.79 ms drawing per frame |
| Lua 5.5, a compiled C module and a pure module through plain `require`, metatables, `load`, a coroutine yielding across calls | all with `zinc:ui`, reactive too |
| Interpreter **and** AOT | both run; in AOT, compiled C++ and CPython share one process |
| One call from the language into compiled Zinc | **Python 123 to 130 ns, Lua 95 to 106 ns** (AOT) |

Everything else about Zinc stays: `lib/std` (15,855 lines) and the plugins stay compiled TypeScript, so nothing is rewritten. What a program sees is a generated `zinc` package.

**The honest limits**, because this changes what Zinc promises:

1. **numpy cannot run everywhere.** CPython does not exist on an ESP32, a console or an old tablet; PyPI has no numpy for iOS or Android (§5). A program with C wheels runs where those wheels exist. Lua is much better off: its VM is plain C.
2. **Python weighs.** About 23 to 37 MB for the interpreter (archive, [04] §1) plus the packages (numpy alone is 24 MB on disk [measured]); 51 MB of memory in the spike against 13 MB for Lua [measured]. It is no longer the "no browser, modest machines" story, for the apps that choose it.
3. **Python code stays at Python's speed.** numpy is fast and a pure Python loop is slow, as always. The UI, the layout and the drawing stay compiled.

So there are three things to build, in this order: the **bridge**, the **packages**, the **export**. The static compiler of [03] becomes the second step, for the targets CPython cannot reach.

## 2. How it fits together

```
 your program (real .py or .lua)      pip / LuaRocks modules (numpy, requests, lpeg...)
        │                                  │
        ▼                                  ▼
   CPython or Lua, in the Zinc process  ──────  generated `zinc` package
                                                    │  123 ns a call, callbacks both ways
                                                    ▼
   generated glue (TypeScript) ─ lib/std, kit, plugins ─ IR ─ interpreter or AOT C++
                                                    │
                                                    ▼
                                    Zinc's window, frame loop, layout, renderer
```

- **The hook is the plugin ABI, unchanged** [code]. The spike is two ordinary project plugins (`pyhost`, 77 lines; `luahost`, 64 lines). A program runs as `zinc run .` with no change to `src/`.
- **The glue is generated.** `spike/real/py/src/main.ts` is written by hand for the spike: a table of calls. The product generates it from what `zinc doc` already extracts (`src/doc/api.cpp`), and only for the modules a program imports, so the closed-world compilation stays closed.
- **Reactivity crosses by itself** [measured]. `zinc:ui`'s tracking is one global on one thread. A Zinc effect calls Python, Python reads a signal through the bridge, the read subscribes the effect. Nothing special was needed; re-entrant calls Zinc to Python to Zinc to numpy work on the interpreter and in AOT.
- **The bridge is cheap because it is not JSON.** `zinc:script` costs 1.0 us a call on the Mac today, through JSON text (`script-boundary-optimisation.md`). The spike's table of doubles and strings is about 8x cheaper. Batch calls take it further: `zinc.rects(numpy_array)` crosses once for a whole frame. The batch call is designed here, not measured; that report measured a gain of 3x to 5x for the same idea.

## 3. Why this route

The first version of this study ([03]) chose a compiler front end and ranked a VM low. That ranking assumed no packages. With `pip` as a requirement:

| Route | `pip` / rocks with C code | Zinc modules | Everywhere | Verdict |
|---|---|---|---|---|
| **In-process runtime, generated bridge** | yes | yes, 100 ns a call | where the runtime and wheels exist | **the route** |
| Static compiler ([03]) | no: C extensions need CPython's ABI, and no compiler keeps them (Codon and Mojo call an installed CPython, [04] §6) | yes, free | everywhere | the second step, for reach and speed |
| CPython in a separate process (Flet model) | yes | yes, through a socket: far slower [estimate], two processes | desktop | no: in-process just worked |
| Transpiling to JavaScript | no | yes | wide | no |
| MicroPython or PocketPy | no: not the CPython ABI, so no numpy | yes | wide | not the goal; a possible small profile later |

Lua's choice is simpler: **PUC Lua 5.4 as the default**, a constant to change later. The spike ran 5.5, but some rocks still pin `< 5.5` (luaposix, [04] §5). LuaJIT stays out: 5.1 dialect, no JIT on iOS or consoles.

## 4. What a program looks like

```python
import numpy as np
import requests
from zinc import background
from zinc.ui import render, Signal, View, Text
from zinc.ui.kit import Button

prices = Signal(np.empty(0))

def refresh():
    prices.set(np.array(requests.get(URL).json()["prices"]))

def App():
    return View(
        Text(lambda: f"mean {prices().mean():.2f}", class_name="text-2xl font-bold"),
        Button(label="Refresh", on_click=background(refresh)),
        class_name="w-full h-full items-center justify-center gap-4",
    )

render(App)
```

```lua
local lpeg = require("lpeg")
local zinc = require("zinc")

local count = zinc.signal(0)

zinc.render(function()
  return zinc.View { class_name = "w-full h-full items-center justify-center gap-4",
    zinc.Text { function() return "Count: " .. count() end },
    zinc.Button { label = "Add one", on_click = function() count:set(count() + 1) end },
  }
end)
```

These two show the target API. The spike ran the same shape with fewer names; `background` and a `Signal` holding any Python object do not exist yet (§6), and neither `requests` nor `lpeg` was run.

```sh
zinc new my-app --lang python
zinc add numpy requests        # resolved, locked, kept in the project
zinc run                       # or: zinc dev, zinc build, zinc export
```

No Python or Lua to install: `zinc` fetches the pinned runtime and tools once, checked, as it does for zig and V8.

## 5. Where it can run

Sourced in [04] §1 and §2; only the Mac was run here.

| Target | Python + `pip` | Lua + rocks |
|---|---|---|
| macOS (development Mac) | **run today** | **run today** (a C module I wrote, not a real rock) |
| Windows, Linux x64 and arm64 | python-build-standalone, wheels from PyPI: expected to work | expected to work |
| Pi 2 and later, 32-bit | interpreter yes, but PyPI has no armv7 numpy; piwheels serves only the distro's Python | yes |
| Pi 1 and Zero | system Python with piwheels only | yes |
| Android | official binaries since 3.14; PyPI has no numpy, Chaquopy's channel has | yes; C rocks cross-built |
| iOS | Tier 3; each extension in its own Framework; numpy only on BeeWare's index; no `pip` at run time | yes, compiled in |
| Web | Pyodide: 6.8 MB core, 337 MB full, its own memory: a separate project | yes, plain C in wasm |
| ESP32, consoles, TouchPad, Nexus 7 | **no CPython.** Static route, no C packages | VM yes where memory allows [estimate]; C rocks need a port |

So: **a program with no C package reaches everything** through the static route or the Lua VM; **a program with numpy reaches desktop and the Pi first**, phones with work, the small targets never. `zinc check --target x` must say so on its first line, naming the package. It is the same rule `zinc lint` applies to plugins today.

Mobile stays at the end of the cross-platform pass, as `AGENTS.md` says.

## 6. What remains hard

The spike skips these on purpose; they are the real work.

| Problem | Why it matters | Direction |
|---|---|---|
| **A program that blocks.** A real program ends in `asyncio.run(main())` or `while True:`; in the spike its top level must return, or the window never starts | Decides whether "real program" holds | Run the top level on its own thread; Zinc keeps the main thread. Calls to Zinc from another thread are queued (`cb_post` exists) and those needing a value wait a turn. **The first thing to prove after the spike.** |
| **A click that blocks.** `requests.get` in a handler freezes the UI, and a C extension holding the GIL stalls a frame | The most common failure of embedded Python | `zinc.background`, threads, and a warning in `zinc dev` when a handler takes more than a frame. The spike releases the GIL between calls; the thread's result was not checked |
| **asyncio and promises** | 126 `Promise` lines in plugin APIs; `await` must work on them | Step asyncio once per frame (`call_soon(stop)` + `run_forever`, [04] §4); map a Zinc promise to a Python future and to a Lua coroutine |
| **Lifetimes across two collectors** | The spike never frees a handle. A Zinc closure holding a Python object and the reverse make a cycle neither collector sees | Handles are engine resources (`R<k>`, finalizers exist), tied to the UI's owner scopes. No GC-tracked magic at first; Pyodide lives with explicit lifetimes |
| **Values that are not numbers** | The spike's signals hold numbers | The glue instantiates `createSignal<PyRef>`; option objects from keyword arguments and from tables; arrays by the buffer protocol |
| **Errors across languages** | A trace mixing Python and Zinc frames | Zinc errors raise Python exceptions and the reverse, with both stacks. In the spike they are only printed |
| **Security and supply chain** | `pip` runs code at install, and a Python program ignores `zinc.json` permissions | Wheels only by default (`--only-binary`), lockfile with hashes, `zinc export` lists packages and licences, and the docs say a Python app has full access |
| **Export** | Not tried. Relocating python-build-standalone, re-signing every wheel's library on macOS, notarization | Blender's model: resolve for the target, vendor the wheels ([04] §3). `zinc export` does what it does for a V8 pack |
| **Other programs' assumptions** | `pygame`, `tkinter`, Matplotlib's windows want their own main loop and window | Refused or unsupported, stated. Matplotlib to a buffer is fine |

Two engine gaps met by the spike, both real under "fill the engine's gaps":
- A plugin's C table cannot carry a callback, though `include/zn/native.h` describes `c(sig)`: Z5011 says "the C ABI cannot carry yet". The spike had to use the C++ form.
- `runtime/zrt.h` collides with `<new>` as soon as a plugin includes the C++ standard library: the spike has to define `ZRT_HOSTED_CPP`.

## 7. Packages

**Python: Blender's model** ([04] §3), the closest precedent. Resolve for each target at build time with a pinned `uv`, keep the result in the project, never run `pip` on the user's machine.

- `zinc add numpy` writes `zinc.json` and a lock with hashes; packages go in the project, per target. `uv` is 14 to 17 MB, Apache-2.0, on all our desktop and Pi targets.
- Runtime: python-build-standalone, fetched with its checksum (`zinc engine` already does this for V8). Which version: 3.13 or 3.14, the wheels decide.
- The spike's step was one command: `uv pip install --target site numpy humanize` [measured].

**Lua: LuaRocks** (MIT, 5.5 since 3.13.0). A pure rock is a file. A C rock is compiled by the machine that builds the app: LuaRocks takes `CC`, so the pinned `zig cc` is the natural compiler and cross-compiling comes with it. Not verified.

**I could not test LuaRocks itself:** the permission system refused downloading and building it here. The spike proves the mechanism with a C module of mine compiled as LuaRocks compiles one (`-bundle -undefined dynamic_lookup`) and loaded by `require`, not with a real rock. On Linux the host must also export the `lua_*` symbols.

## 8. The plan

Sizes are **estimates**. Python and Lua share everything above the two small hosts, so they are built together.

| Phase | What | Size | Done when |
|---|---|---|---|
| **0. Blocking and threads** | Prove the top-level thread model on the spike: `asyncio.run`, `while True`, a blocking click, with a window | a few hundred lines, thrown away | a real program unchanged keeps a live UI. **If this fails, the design changes.** |
| **1. The bridge** | `zinc doc --json`, generator (glue, `zinc` for Python and Lua, `.pyi` and LuaLS stubs), both hosts vendored behind one interface, `zinc run main.py`, errors, lifetimes | ~3,000 lines | `bouncing-ball` and one UI template written in each language; pyright and lua-language-server complete the API |
| **2. Packages** | `zinc add`, lock, pinned `uv`, runtime pack, LuaRocks with `zig cc` | ~800 lines | numpy, requests, pillow, pandas, rich; lpeg, cjson, penlight, luasocket from a clean machine |
| **3. Async** | promises, asyncio, coroutines | ~500 lines | `await` on `fetch` and on a plugin promise |
| **4. Export** | macOS `.app` signed with its wheels; Linux; then the cross-platform pass | ~800 lines | an app with numpy runs on a Mac with no Python |
| **5. Reach and speed** | The static route of [03] for targets with no CPython, and `@zinc.compile` on hot functions | ~6,000 lines | a package-free `.py` runs on the ESP32 |

Tests: a program with no window runs under plain `python` and `lua` and must print the same, the oracle idea of `tools/oracle`. Package smoke tests are T2, off the normal runs.

## 9. What only the owner can decide

1. **Licences.** `RULES.md` §3 accepts MIT, BSD, Apache-2.0, zlib, ISC, public domain. **CPython is PSF, python-build-standalone MPL-2.0: neither is on the list.** Lua is MIT. I recommend allowing them for a pack downloaded on demand, not linked into `zinc`, as V8 is. That needs your word.
2. **What Zinc says about weight.** A Python app is 50 MB or more. Accept it as the price of `pip`, with Lua and TypeScript as the light options? The docs should say so plainly.
3. **The first language.** Both share the bridge. Python is the demand (71.8% of learners, against 15% for Lua, Stack Overflow 2025); Lua is the easy one. I recommend building both on the bridge at once, because Lua keeps the bridge honest on memory.
4. **The backlog.** It is frozen; this needs `New-task: owner`. Phase 0 can start without any task as a spike.
5. **LuaRocks test.** Let it be downloaded and built in a scratch directory, to replace my stand-in with real rocks:
   `curl -LO https://luarocks.org/releases/luarocks-3.13.0.tar.gz`, then `./configure --prefix=<dir> --lua-version=5.5 --with-lua=/opt/homebrew`, `make install`, `luarocks --tree spike/real/lua/rocks install lua-cjson penlight`.

## 10. Limits of this study

- Everything was run **headless on one Mac, under a load average of 12 to 18**, three runs at most. Timings are orders of magnitude; they do not go in the performance log. First runs were slower (0.61 s for Python, 0.31 s for Lua, against 0.11 s and 0.03 s once cached).
- Not proven: a real window with real clicks, a blocking program (§6), any other machine, an exported app (the spike links Homebrew's Python, so the 6.5 MB binary has no Python inside), pandas or other large packages, long runs and leaks.
- In the research, bundler sizes, Pyodide's numpy size, `zig cc` as `CC` and most Lua precedents were not found ([04], end). Godot's language split is a secondary source.
- Sizes, plans and the verdict on the separate-process route are my judgement.
