# JavaScript engines: QuickJS, JavaScriptCore, V8, Hermes

A Zinc program written in typed Zinc runs on Zinc's own engines: the interpreter while you work, native code once built (`zinc build`).
A program that wants the JavaScript ecosystem (npm packages, three.js, PixiJS, Phaser, plain `.js`) runs on a JavaScript engine instead,
and Zinc lets you pick which one. The program does not change: the same bundle, the same `zinc:` modules, the same plugins, WebGL and
native modules on all of them.

```sh
zinc run main.js                         # QuickJS-ng, built into zinc
zinc run examples/hero --engine jsc      # JavaScriptCore, the one in macOS
zinc run examples/hero --engine v8       # V8, downloaded the first time
zinc run examples/hero --engine hermes   # Hermes, downloaded the first time (experimental)
```

A project names its engine once in `zinc.json`, and `zinc run`, `zinc dev`, `zinc build` and `zinc export` follow it:

```json
{ "name": "my-app", "engine": "v8" }
```

## How one program runs on four engines

Every engine is bound to Zinc through one interface, **Node-API** (the stable C ABI Node.js, Bun and Deno give native addons). Zinc's
side of each binding is written once over Node-API: the host functions (`zinc:gfx`, `zinc:ui`, files, network...), the web
environment, WebGL, the native modules of plugins with their callbacks and promises, WebAssembly. An engine only brings its
Node-API and a few lines that start it (about a hundred lines of C++ per engine). Calls stay cheap: 50 to 115 ns from JavaScript into
Zinc, depending on the engine (table below).

QuickJS is linked into zinc. The other engines are modules zinc loads when a program asks for them: JavaScriptCore's ships with zinc
(the engine itself is the system's), V8's and Hermes's come as **engine packs** from Zinc's signed index.

## Engine packs: downloaded, checked, kept

The first `zinc run --engine v8` (or `hermes`) downloads the engine's pack, checks its SHA-256 and the index's signatures (TUF, the same
index as plugins) and that it was built for this zinc, then keeps it in `~/.zinc/engines`. WebAssembly on QuickJS comes the same way:
the first program that uses `WebAssembly` downloads the `wasm` pack (WAMR's interpreter, 0.1 MB).

```sh
zinc engine list               # what is installed, and what is beside zinc
zinc engine list --available   # what the index offers
zinc engine install v8         # ahead of time (offline later, a classroom)
zinc engine update             # the newest pack built for this zinc
zinc engine remove hermes
```

`zinc doctor` lists the installed engines; `zinc run` says once a day when a newer pack exists. `ZINC_ENGINE_V8=<path>` (or `_HERMES`,
`_JSC`) runs your own build of a module instead.

## Which one to pick

Measured on an Apple M1 Pro (`docs/reports/zinc-next-perf.md`, 2026-10-21; the machine was shared, take the numbers as orders of magnitude):

| | QuickJS | JavaScriptCore | V8 | Hermes |
|---|---|---|---|---|
| How it runs JavaScript | interpreter | JIT | JIT | bytecode VM, JIT on arm64 |
| Comes from | built into zinc | macOS | pack, 14 MB | pack, 2 MB |
| Call into Zinc | 70 ns | 115 ns | 52 ns | 50 ns |
| fib(30), pure JavaScript | 75 ms | 5 ms | 8 ms | 32 ms |
| hero, CPU for 600 frames | 1.04 s | 0.94 s | 0.53 s | 0.89 s |
| hero, memory | ~50 MB | ~140 MB | ~80 MB | ~70 MB |
| UI scenes of the render suite, per frame | 1.5 to 3.7 ms | 0.6 to 1.3 ms | 0.6 to 0.7 ms | 0.8 to 3.2 ms |
| Debugger (`--inspect`) | | Safari Web Inspector | Chrome DevTools | Chrome DevTools |
| Precompiled at `zinc build` | `.qbc` bytecode | | | `.hbc` bytecode |
| WebAssembly | `wasm` pack | built in | built in | no |
| Platforms today | all of Zinc's | macOS | macOS, Apple silicon | macOS, Apple silicon |

- **QuickJS** (the default for JavaScript): the smallest and the most portable, nothing to download, the least memory. Slower as soon
  as the program computes a lot in JavaScript.
- **V8**: the fastest, close to Zinc's native build on UI work. The choice for heavy JavaScript (three.js scenes, large apps).
- **JavaScriptCore**: fast, nothing to download on a Mac, inspectable in Safari; the most memory.
- **Hermes** (experimental): React Native's engine. Starts fast from its bytecode, small to download, the cheapest calls into Zinc;
  about QuickJS's speed on UI work. Its place is on devices where a JIT is not allowed.

Typed Zinc needs none of them: `zinc build` compiles it to native code, with no JavaScript engine inside.

## Debugging

```sh
zinc run main.js --engine v8 --inspect        # chrome://inspect lists it (port 9229; --inspect=9230 for another)
zinc run main.js --engine hermes --inspect-brk   # Chrome DevTools, paused on the first line
zinc run main.js --engine jsc --inspect       # Safari > Develop > this Mac lists it
```

Breakpoints, stepping, the console and your own files (source maps) work as in a browser. `zinc dev` turns the inspector on for a
project whose `zinc.json` names `v8` or `hermes`.

## Building and exporting

`zinc build` of a project on a JavaScript engine writes the bundle (`build/<name>.js` and its source map). On QuickJS it also writes
`build/<name>.qbc` and on Hermes `build/<name>.hbc`: bytecode that `zinc run` loads without parsing the source (hero starts about
50 ms sooner on QuickJS, about 200 ms on Hermes). A bytecode file older than its bundle, or made by another version of the engine, is
ignored and the source runs. `zinc export --target macos` makes an app that carries the bundle, its bytecode and, for V8 or Hermes,
its engine pack.

## Limits today

- V8 and Hermes packs are built for Apple silicon Macs. Intel Macs, Linux, Windows and the boards get them in Zinc's cross-platform
  pass; until then `--engine v8` there says the engine is not installed and could not be downloaded.
- A value converted out of `any` into an interface (`const p: Patch = JSON.parse(text)`) keeps on these engines the properties its
  type does not declare, as TypeScript does at run time; the Zinc engines keep only the declared fields ([02-language.md](02-language.md), "Dyn").
- Hermes has no WebAssembly and no `import()` of a module at run time.
- Static Hermes (`shermes`, Hermes compiled ahead of time to native code) runs under Zinc as a developer tool (`tools/hermes-unit`), not a
  `zinc` option: [reports/hermes-engine.md](../reports/hermes-engine.md).

Design and measures: [reports/js-engines-jsc-v8.md](../reports/js-engines-jsc-v8.md), [reports/hermes-engine.md](../reports/hermes-engine.md),
the bundler: [11-quickjs-bundle.md](11-quickjs-bundle.md).
