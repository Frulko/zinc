# Bundling for QuickJS: zinc bundle

Zinc runs a program on two kinds of engine: the typed engines (the interpreter and the native build, `zinc run`) and QuickJS-ng, a small
JavaScript engine (`zinc run --engine quickjs`). The QuickJS path is for programs that want the JavaScript ecosystem (npm packages, plain
JavaScript libraries) and for running the same demos on a JavaScript engine. Design, scores and measurements:
[reports/zinc-quickjs-bundler.md](../reports/zinc-quickjs-bundler.md).

## Run a TypeScript or TSX program on QuickJS

```sh
zinc run examples/hero --engine quickjs     # TSX, zinc:ui, plugins: nothing to install
zinc run main.js                            # a .js or .mjs entry picks QuickJS by itself
```

Every module goes through the same source passes as on the typed engines: the JSX is lowered (`className`, capitalised components:
Z0006 and Z0007 refuse the old spellings), `StyleSheet.create` and the React Native imports are rewritten, then the types are stripped
in place, so the lines of a stack trace are the lines you wrote. The result of each module is cached by its content in
`~/.zinc/cache/qjs`: the second run starts as fast as a bundle. Imports resolve as on the typed engines: relative files, the `zinc:`
modules, plugins (and the specifiers their `modules` answer), `tsconfig.json` `paths`, `importmap.json`, and packages of `node_modules`
written as ES modules.

## One file: zinc bundle

```sh
zinc bundle                           # the project here -> dist/main.js
zinc bundle examples/hero -o hero.js --minify --sourcemap --bytecode
zinc run hero.js                      # or hero.qbc: QuickJS bytecode, no parsing at start
zinc bundle --watch                   # again at each save
```

`zinc bundle` walks the program as `--engine quickjs` loads it, transforms each module, and links them into one ES module with
[esbuild](https://esbuild.github.io): unused code is dropped (the parts of `zinc:ui` the app does not use too), CommonJS packages of
`node_modules` are linked (esbuild resolves package names: `exports`, sub-paths, `module`, `main`; a Node built-in or a CommonJS-only need stops the link and names the package), and these names are folded in so per-target branches disappear:

| Name | Value |
|---|---|
| `__ZINC_ENGINE__` | `"quickjs"` |
| `__ZINC_TARGET__`, `__ZINC_PROFILE__` | the platform and the profile (`"macos"`) |
| `__ZINC_CAPS__` | the constants of `zinc:platform` as an object (`{ GPU: true, TIER: 4, ... }`) |
| `process.env.NODE_ENV` | `"production"` with `--minify`, else `"development"` |

`zinc run --engine quickjs` defines the same names as globals, so a program runs the same bundled or not. The native modules of the engine
and of the plugins stay an import the host answers (`zinc:native`); everything else is in the file.

- `--minify` shrinks the file about 2x (names, whitespace and syntax; function names are kept, some libraries read them).
- `--sourcemap` writes `<out>.map`; `zinc run` maps the traces of a bundle (and of its `.qbc`) back to your files.
- `--bytecode` writes `<out>.qbc` beside the bundle. It only runs on the same build of the engine (QuickJS checks its version).
- The bundle's first line names its entry: `zinc run` bakes the fonts and images from those files, as it would unbundled.

esbuild is not in the `zinc` binary: the first `zinc bundle` downloads the pinned version (about 4 MB) into `~/.zinc/toolchains` and checks
its SHA-256 before unpacking it, like the zig of native builds (`zinc toolchain esbuild` does it ahead of time, `zinc doctor` says whether
it is there, `ZINC_ESBUILD` names your own). Offline, `zinc run --engine quickjs` still runs everything; only the single file needs it.

## Check a program for QuickJS

```sh
zinc check --engine quickjs           # or: zinc bundle --check
```

It prints the transform's errors (a JSX spelling, a syntax error, a module that does not resolve) and warns about what QuickJS-ng 0.17
does not have, Q0001: `Temporal`, `Intl` formats (only `Intl.Segmenter` is there), `WebAssembly` (the `wasm` pack adds it: `zinc engine install wasm`), `Atomics.waitAsync`. The exit code is 1
when there is anything to fix.

## What QuickJS does not do here yet

- Callbacks and promises from native plugin code (`Process.onEvent`, `System.onEvent`, `Gphoto2.detect`...): the programs that use them
  stop with a clear message on QuickJS and run on the typed engines.
- A few host modules the typed engine has (`zinc:osc` closing, `zinc:gl`'s `glCreate`), and the dev-mode Fast Refresh: `zinc dev` on QuickJS
  restarts the program at each save.
- Dynamic `import()` is not followed by `zinc bundle` (the module is loaded at run time instead).
