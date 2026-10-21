# A bundler for the QuickJS engine (2026-10-16)

The owner asked for a pipeline that prepares JS, TS and TSX for QuickJS the way Vite, Rspack, esbuild or Rollup prepare them for a browser,
with a linter in the loop: one optimised JavaScript file, Zinc's bindings and standard library reachable from inside it. Before this work
`zinc run --engine quickjs` refused TSX ("JSX needs the typed engine") and 31 of the 90 programs of `tests/examples.lst` ran on it.
User guide: [guide/11-quickjs-bundle.md](../guide/11-quickjs-bundle.md). Earlier study of the same stages:
[research-2026-09-30/toolbelt-build-pipeline.md](research-2026-09-30/toolbelt-build-pipeline.md) (esbuild 76 ms on a 195 KB UI bundle, parse
time insensitive to minification, bytecode as the startup lever).

## 1. What the vendored QuickJS-ng does (v0.17.0, `third_party/quickjs-ng`, read in the source)

| Area | In this build |
|---|---|
| Syntax | ES2023 and most of ES2024-26: class fields, `#private`, `#x in o`, static blocks, `?.`, `??=`, top-level await, hashbang, `using` / `await using`, dynamic `import()` with attributes, tail calls. No decorators (the strip stage removes Zinc's `@weak` / `@pooled`). |
| RegExp | `v`, `d`, lookbehind, Unicode properties, duplicate named groups, modifiers `(?i:)`, `RegExp.escape` |
| Builtins | Proxy, Reflect, BigInt, WeakRef, FinalizationRegistry, AggregateError, `cause`, `Array.fromAsync`, `groupBy`, `Promise.withResolvers` / `try`, change-by-copy arrays, resizable ArrayBuffer, Float16Array, `Math.sumPrecise`, iterator helpers, Set methods, `Error.captureStackTrace` / `prepareStackTrace` |
| Missing | `Intl` (Zinc adds `Intl.Segmenter` only), `Temporal`, `WebAssembly`, `Atomics.waitAsync`; `structuredClone`, TextEncoder/Decoder, AbortController come from Zinc (`src/qjs/webenv.cpp`, `prelude.cpp`) |
| Modules | ESM through the host's loader; `import.meta` empty unless the host fills it (Zinc now sets `url`); JSON modules are the host's job (not done) |
| Debug | Stack traces with line and column; no source maps (Zinc maps them, below); no async stack traces |
| Bytecode | `JS_WriteObject` / `JS_ReadObject` of a module (qjsc's way); `BC_VERSION` 28 with a checksum: same build only; `STRIP_SOURCE` / `STRIP_DEBUG` |
| Limits | 1 MiB stack by default (Zinc gives the thread's, 8 MiB at most), memory limit off, refcount + cycle collector, interrupt handler |
| Speed traits | No inline caches (shape lookup per access), ropes above 512 chars (`+=` is cheap), fast arrays, atoms for keys: a minifier's identifier renaming does not speed it up, it shrinks the file |

## 2. The options, scored (RULES.md section 4: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1)

Constraints: one `zinc` binary for teachers, makers and artists; no Node on their machine; offline; a fast first run; deterministic output;
macOS, Linux and Windows hosts; callable from `zinc run/dev/build/pack`. And one that no tool meets: Zinc's JSX is not React's `jsx()` call,
it is a compile-time lowering to zinc:ui helpers (fine-grained Solid effects or the React model, `src/frontend/jsx.cpp`), with the
`className` and capitalised-component rules (Z0006, Z0007). So the transform stage is ours in every option; the question is the linker.

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **(a) esbuild 0.28.2 as a pinned tool + our transform** | 5 | 5 | 4 | 4 | 4 | 5 | 4 | **63** |
| (d) Bun 1.4 `bun build` | 4 | 5 | 2 | 3 | 4 | 4 | 4 | 53 |
| (e) our own linker on the engine's frontend | 3 | 4 | 5 | 2 | 5 | 5 | 1 | 51 |
| (f) oxc / Rolldown | 3 | 5 | 3 | 2 | 5 | 4 | 1 | 49 |
| (b) SWC / Rspack | 2 | 5 | 3 | 2 | 4 | 3 | 1 | 43 |
| (c) Rollup / Vite | 1 | 3 | 1 | 3 | 4 | 4 | 3 | 35 |
| (g) Babel | 1 | 1 | 1 | 3 | 5 | 4 | 2 | 30 |

- (a) A static Go binary per platform (npm `@esbuild/<platform>`: darwin-arm64/x64, linux-x64/arm64, win32-x64; 4 MB tarball, 10.6 MB
  binary), MIT; bundles ESM and CommonJS, tree-shakes, `--define`, minifies, writes source maps; `--external:zinc:native`. Pre-1.0: pinned
  exactly. Supply: one maintainer and the npm registry, so the tarball's SHA-256 is pinned and checked before unpacking (its SHA-1 matched
  the registry's `dist.shasum`).
- (d) 30-38 MB zips (90 MB unpacked), fewer controls (no `--alias`), a JavaScript runtime inside a tool we only use to link.
- (e) The Zinc parser accepts the Zinc subset only: npm packages (CommonJS, sloppy JavaScript) do not parse; scope hoisting, renaming,
  tree shaking, a minifier and source maps would be thousands of lines that esbuild already proves. Kept for what it does well: the transform.
- (f) Fast and MIT, but transform, minify and Rolldown ship as Node addons (NAPI) only; linking the Rust crates means Cargo in our build.
- (b) No bundler: `spack` is deprecated, and the standalone `swc` binary of its GitHub releases (22 to 31 MB a platform) only transforms
  (zinc pins it since 2026-10-21 for the ES5 lowering of `--engine mquickjs`); Rspack needs Node.
- (c), (g) Need Node.

**Decision: (a), in a pipeline whose transform stage is the engine's own**, and whose run path needs no tool at all:

```
collect (QuickJS's own loader walks the graph) -> transform (src/qjs/strip.cpp: RN imports, StyleSheet, JSX lowering, web global imports,
type strip; cached by content) -> lint (Z0005-Z0007 from the transform, Q0001) -> link (esbuild) -> emit (optional QuickJS bytecode)
```

The linter: ESLint needs Node; oxlint (5-6 MB binary) runs its built-in rules only without Node (its JS plugins are alpha and need Node);
Biome is 58-79 MB. The rules that matter for this target are ours and run inside the pipeline: the JSX rules come from the transform
(the same Z0006 / Z0007 as the typed engines), and `quickjsLint` reports the globals QuickJS-ng lacks (Q0001). `zinc check --engine quickjs`
runs them without linking.

## 3. What exists (commands and flags)

- `zinc run <entry|dir> --engine quickjs` (and `.js`, `.mjs`, `.qbc` entries, zinc.json `"engine": "quickjs"`): each module through the
  transform stage, cached in `~/.zinc/cache/qjs` by content (source, name, UI preset and layout, engine build). Resolution as the typed
  loader's: relative files, `zinc:` std, generated (`zinc:telemetry`, `zinc:system/permissions`, `zinc:system/app`) and plugin modules,
  plugin `modules` aliases (`three/addons/...`, `zinc:3d/gltf`), `tsconfig.json` paths, the compat packages (inferno, pocketjs),
  `importmap.json`, `node_modules` (package.json `exports` with sub-paths and `*` patterns, `module`, `main`; for a program run unbundled: ES-module packages only). `zinc bundle` leaves a package name to esbuild, the one resolver of every link (2026-10-17: it used to rewrite names the loader had resolved, which ignored `exports` conditions and the `browser` field), and lints the linked text for what QuickJS-ng lacks (Q0001, "in the bundled packages"). Class components (Inferno) lower as on the typed engine.
  The web globals a file reads are imported from zinc:web as the typed loader does. `__ZINC_ENGINE__`, `__ZINC_TARGET__`,
  `__ZINC_PROFILE__`, `__ZINC_CAPS__` are globals.
- `zinc bundle [entry|dir] [-o out.js] [--minify] [--sourcemap] [--bytecode] [--check] [--watch]` (`--target quickjs` accepted): default
  output `dist/<entry>.js` beside zinc.json. esbuild flags: `--bundle --format=esm --platform=neutral --target=es2023
  --main-fields=module,main --external:zinc:native`, the defines above plus `process.env.NODE_ENV`, `--minify --keep-names`,
  `--sourcemap --sources-content=false`, `NODE_PATH` for packages. Staged modules point at each other by absolute path; packages are read
  where they are. The map's sources are rewritten to the user's files; the first line names the entry (`zinc run` bakes the fonts from it).
  A content hash of the staged modules and the command skips esbuild when nothing changed. `--bytecode`: `JS_WriteObject` with
  `STRIP_SOURCE` (lines kept for traces). `--watch` polls the graph's files.
- `zinc check --engine quickjs [entry|dir]` = `zinc bundle --check`: exit 1 on any diagnostic.
- `zinc toolchain esbuild` fetches and verifies the pin; `zinc doctor` lists it ("QuickJS bundles"); `ZINC_ESBUILD` names your own;
  `ZINC_MIRRORS` / `ZINC_OFFLINE` apply as for zig. Offline without it: `zinc bundle` says so and points to `--engine quickjs`.
- Stack traces of a bundle (`.js` or `.qbc`) are mapped through `<bundle>.js.map` when it is there.

Why `--keep-names` and the entry line: the first minified rn-showcase drew a different frame. Bisected: identifier and whitespace
minification each changed it, because the resource baker scans the program's text for the font sizes to bake; reading the original files
(through the entry line) made all five demos identical. `--keep-names` costs 6% (338 KB against 318 KB for hero) and keeps
`Function.name` for the libraries that read it.

The std lib inside the bundle or left to the host: inside. Only `zinc:native` (the plugins' binding table) and the `__host_*` globals (the
runtime table) cross to the host, so there is one binding table and esbuild tree-shakes zinc:ui per app. The host-loaded variant is what
`--engine quickjs` does (each std module loaded by the host from lib/std): 221 ms against 212 ms for the bundle on hero (section 5), so the
single file costs nothing at start and is the only form that can be shipped alone.

## 4. Demos

Headless, deterministic, last frame hashed against the interpreter's (`tests/t1/qjs_demos.sh`):

| Demo | Frames | `--engine quickjs` | `zinc bundle --minify` | bytecode |
|---|---|---|---|---|
| hero | 20 | same | same | same |
| rn-showcase | 20 | same | same | - |
| nuxt-ui | 20 | same | same | same |
| breakout | 20 | same | same | - |
| webcam (fake camera) | 40 | same | same | - |

webcam at frame 20: the HUD reads camera frame #9 on QuickJS and #8 on the interpreter; the camera module polls with `setInterval` and
QuickJS's virtual clock fires it one tick earlier; from frame 40 they agree. An engine timing difference, not the bundler's.

All 90 programs of `tests/examples.lst`, 3 frames headless on QuickJS (exit 0): **31 before, 65 after**, none lost. The 25 left stop on
engine gaps, not on the bundle:

| Cause | Programs |
|---|---|
| Native callbacks and promises are not wired on QuickJS (`src/qjs/native_js.cpp`) | scrollphat/badge, camera/bench, camera/cli, camera/remote, museum-table/editor, pinball3d-editor, process/cli, remote/viewer, scripting/bench, scripting/breakout-mods, scripting/playground, system/desktop, webgl-cube, webgl-studio, webview/hybrid |
| The IMU plugin's spec has a type the QuickJS thunk cannot carry | boards/s3-matrix/dice, level, text-scroller, tilt-sand |
| Host rows or prelude functions missing on QuickJS: `__host_oscClose`, `__host_glCreate`, `__addEvHandler` (host events) | chataigne, gl-cube, modules-showcase, service/sensor-hub |
| Native code of the engine's own C test module (`Sensor`) / a plugin library that does not load here | native-module, video/mapper |

## 5. Numbers (Mac arm64, load average 15 to 45 from other agents' builds: relative, not absolute)

| | hero (84 modules) | nuxt-ui (28 modules) |
|---|---|---|
| bundle, unminified / minified / `.qbc` | 604 KB / 338 KB / 570 KB | 439 KB / 253 KB / 404 KB |
| `zinc bundle` wall time (esbuild warm) | 250-490 ms | 150 ms |
| QuickJS stage to the end of frame 1, best of 5: modules (cached) / bundle / minified / bytecode | 221 / 212 / 212 / 183 ms | 66 / 48 / 47 / 28 ms |
| same, modules with a cold transform cache | 294 ms | - |

Reading: the transform cache makes the unbundled run start within 5% of a bundle (hero), so `zinc run --engine quickjs` stays bundle-free
and offline; minifying changes the size, not the start (as measured in September); bytecode is the startup lever (-14% hero, -42% nuxt-ui,
where the first frame weighs less). Bytecode is larger than minified source (line tables) and tied to the engine build.

## 6. Tests

- `tests/t0/qjs_bundle.sh` (under a second): three JSX goldens of the typed engine printed identically on QuickJS; `check --engine
  quickjs` (Z0006, Z0007, Q0001 with its position, an object key not reported, a clean program passes); `import.meta.url`, a web global,
  an ESM package of node_modules; with the pinned esbuild in ZINC_HOME (never downloaded by the test): zinc:native kept external,
  `__ZINC_ENGINE__` folded, unused functions dropped, the entry line, a CommonJS package with a relative `require`, `--minify` smaller,
  `.qbc` output, minified and bytecode traces mapped to `util.ts:4`.
- `tests/t1/qjs_demos.sh` (18 s): the table of section 4.
- Mappings in `tests/affected.json`.

## 7. Not proven here

- The esbuild download and the bundle on Linux and Windows (pins written for darwin-arm64/x64, linux-x64/arm64, win32-x64; only
  darwin-arm64 was downloaded and run). The Windows host reports `x86_64-windows` now and `NODE_PATH` takes `;` there: neither was run.
- `--watch` was run by hand only (a save rebuilt a one-file program in 42 ms), not by a test; `zinc dev` on QuickJS restarts on save and gets the transform cache.
- Dynamic `import()` is not followed by the linker; JSON modules are not loaded; `import.meta.resolve` is not set.
- The QuickJS lint (Q0001) is a token scan: a name inside a regular expression literal can be reported.
