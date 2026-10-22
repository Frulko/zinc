# Onboarding docs audit (2026-10-22)

Scope: what a newcomer reads (root README, `docs/guide/`, UI docs, templates, examples, the site). Read only; nothing built.
Checked against `build/zinc help`, `help run|build|test|init|compat` and the template sources.

## Summary

- The guide is split in two. Chapter 01 (getting started), 03 (partly), 09-12 are Zinc Next. Chapters 02, 04, 05, 06 and the guide index
  (`docs/guide/README.md`) are still the prototype's text. The site's "Docs" nav entry lands on that stale index.
- No page helps choose a kind of program. No short syntax page. No API reference for `zinc:ui`, `zinc:fs`, `zinc:sys`, plugins in one place.
- The site publishes docs as raw rendered Markdown, English only, no i18n, 159 internal reports in the sidebar, and not the pages that
  matter most for UI (nuxt-ui, react-native, templates, diagnostics).

## (a) Stale or wrong, with the fix

### Guide index: `docs/guide/README.md` (the site's Docs landing page)
- :3-4 "native C++17 (no JavaScript engine on the device)": the engine has an interpreter, AOT to C++ and QuickJS/JSC/V8/Hermes. Say so, link `12-js-engines.md`.
- :5 links `../reports/STATUS.md`, which is "Prototype status - increment 3 (2026-09-28)". Drop the link.
- :13-15 `pnpm install`, `alias zinc="node $PWD/compiler/bin/zinc.mjs"`, "checks cmake, a C++17 compiler, SDL3, docker, emscripten": all prototype. Replace with the install of 01 (`brew install frulko/zinc/zinc`, `zinc doctor`).
- :25 "the sim oracle", :32 numbering has two items "12.". The list says "view/text/image/scroll" for chapter 3 (:20 area): use `View`, `Text`, `Image`, `ScrollView`.
- :38-45 the "one-minute tour": `zinc init ... --template game | cli | server | iot | remarkable`, `zinc run --target sim` ("on Node (the oracle)"), "conformance: every target prints the same bytes as sim", `zinc export --target macos`. `--target sim` and Node are gone. Use `zinc new game`, `zinc run`, `zinc dev`, `zinc test --runner aot`, `zinc build --target aarch64-linux`.
- Also says "Every code sample was compiled": true for 01 and 03, not for 04-06.

### Chapter 01 `01-getting-started.md`
- :285-305 "Targets and profiles" table: `linux` via docker `zinc/sdk-linux`, `rpi1` docker, `wasm` emscripten, `sim` = Node.js. `zinc build` now cross builds with the pinned zig, no Docker (`help build`: `--target aarch64-linux|armhf-linux|armv7-linux|x86_64-linux|aarch64-macos|x86_64-macos|x86_64-windows|esp32`). Rewrite with the target names the README and `zinc help build` use; keep profile names (`--profile`) separate from build targets. Remove the `sim` row.
- :310 `zinc run ... [--interp|--native] [--profile P]`: add `--engine`, `--simulate <device>` (in `help run`).
- Rest of the chapter is current (install, templates, errors) and the best page in the docs.

### Chapter 02 `02-language.md`
- :3 "compiles ... to C++17", :4 "on the sim oracle", :52 "bit-identically with the sim oracle": say "interpreter, AOT C++ and QuickJS give the same output"; drop sim.
- :13, :91-95 cite ADR 0006/0007 (prototype); the rules were kept in Zinc Next but the references point to `docs/decisions/` of the prototype. Check each claim (e.g. regex Z1008, `finally` in async Z9034) against `zinc explain` before keeping.
- :18-19 link `lib/zinc.d.ts`, `lib/modules.d.ts`: these exist, but `lib/ui.d.ts` is one line ("declared when the UI layer lands", `lib/ui.d.ts:1`) and `zinc:ui`, `zinc:ui/solid`, `zinc:ui/kit` have no `.d.ts`. `modules.d.ts` has only 14 modules (sys, fs, storage, net, osc, mqtt, telemetry, gpio, wifi, espnow, events, native, assets, os).
- :134 links `reports/STATUS.md` (prototype).
- Not a stale claim but wrong tone for a newcomer: it is 135 lines of prototype internals (RC, arenas, TLSF), with no "what you cannot write" list of the first 10 things people try.

### Chapter 03 `03-ui-apps.md`
- :27-31 "Host tags: `view`, `text`, `button`, `image`, `scroll`, `canvas`, `input`, `textarea`, plus PascalCase aliases ... for PocketJS compatibility. Text lives only inside `text`." Lowercase tags are refused by the engine (Z0007). Rewrite: `View, Text, Button, Image, ScrollView, Canvas, Input, TextArea`.
- :37 "Attributes: `class` (Tailwind-like tokens)": must be `className` (Z0006).
- :1-6 "software rasterizer", "ADR 0008": the renderer is now a GPU renderer with a software fallback (README says so).
- :40-65 introduces Solid and React but not the kit, Nuxt UI or React Native presets; no "which one" (see gap 1).

### Chapter 04 `04-headless-services.md`
- :12 `zinc run examples/service/sensor-hub  # sim (Node)` and :13 `--target macos  # native`: drop sim; plain `zinc run`.
- :90 comment "docker stop" is fine. :166 "ESP-IDF firmware (built in docker)": check against `zinc flash` / the esp32 path in `docs/boards.md:82,238` which also say "in docker espressif/idf:v6.0".
- :84, :124, :153 use profile `rpi1` as a build target name; `zinc export --target rpi1` and `linux` need re-checking against `zinc help export`.

### Chapter 05 `05-plugins.md`
- :52, :55 "native plugin (spec + C++ per target + sim)", :63 `<name>.sim.ts` "Zinc implementation for the sim oracle", :90 `native/sensor.sim.ts`, :144 "`sim` always allowed for modules", :152 `targets.sim.nodeFlags`, :175, :177 "checks it against native output byte-for-byte ... in QEMU": the Node sim is gone. Check what `templates/plugin` ships today (`example/`, `native/`) and rewrite this section from it; `docs/plugins.md` (the plugin reference) may already be current and should be the single source.
- :150 "system packages added to the SDK image (apk on rpi1, apt on linux)": Docker SDK images are gone (zig cross toolchain).
- :111 `import { createNode } from 'zinc:ui'`: verify the export exists.

### Chapter 06 `06-testing.md` (the most stale page)
- :3-24, :59-60, :90-91 "The sim oracle", `zinc run app --target sim`, `zinc test --target rpi1` under QEMU, "on Node, fast". Today: `zinc test [--runner interp|aot|quickjs|jsc|v8|hermes|esp32-qemu|devicesim] [--profile P] [dir]` (`help test`). The "oracle" is now the frozen prototype corpus (`corpus/`, `tests/conformance`) and `tools/diff-matrix`, which is maintainer material.
- :67-81 `zinc compat --engines zinc-sim,node`: the real flags are `--engines next,next-qjs,...` and it needs Node (`help compat`).
- :112 `sim/zinc.mjs`, :159 "always false on the sim", :168 `zinc capture ... --target rpi1 # docker/QEMU`, :197 `zinc test --pixels --target rpi1`, :149 "docker/QEMU targets", :230 link `reports/PERF.md` (prototype numbers).
- Fix: rewrite around `zinc test --runner`, `*.test.ts`, goldens, `ZINC_DETERMINISTIC`, `zinc capture`, `zinc run --simulate`; move compat and cross-target proof to a maintainer page.

### Chapters 07-12
- `07-distribution.md` (544 lines) and `08-security.md` were not found to use sim/pnpm; they still list `rpi1`, `linux-rpi1` style names (07:165, 07:334, 08:169) that need a pass against `zinc help export`.
- `10-lint-migrate.md:34,51,64,65` correctly documents the banned `class` and lowercase tags (keep; it is the only place that teaches the rule).
- `12-js-engines.md:74` ("Typed Zinc needs none of them ... no JavaScript engine inside") is right and is the sentence the other pages should copy.

### Other docs
- `docs/ui-kit.md:54, :127`: the prop is documented as `class`, and the kit prop table lists `class`. Components must take `className` (AGENTS.md rule). Same in `docs/nuxt-ui.md:43` ("`ui` overrides as `class` props") and `docs/plugins/lottie.md:29` (`<Lottie>` props `class`). Check the real prop names, then fix the doc (or the code).
- `docs/prototype.md:1-12` is kept as history; it is linked from the root README and the site footer. Fine, but it opens with the claims above and the site footer shows it as "The prototype" with no "historical" label: mark it at the top.
- `docs/engines.md:1-4` "(experimental) ... current implementation is an initial executable slice, not that complete product": old.
- `docs/dev-mode.md:142,153,172` mention the `class` attribute of the inspector tree (DevTools shows DOM `class`): acceptable as DevTools wire format, add a one-line note.
- `docs/boards.md:82,238,319` "in docker espressif/idf", "same bytes as the sim oracle".
- `docs/targets/capabilities.md` and `01-getting-started.md:303` still carry the `sim` profile name. `zinc run --profile sim` is still listed by `help run`, so the profile exists; the Node target does not. Say what it is now or remove it.
- `README.md`: counts disagree: "52 plugins" (:34), "36 modules" + "9 display drivers" (:107-110, parsed by `site/src/data/site.ts:40-41` through the exact string `<b>36 modules</b>`), AGENTS.md "33 plugins", `plugins/` has 58 directories, `docs/plugins/` 43 pages. Pick one number, or none.
- `README.md:11` "Architecture" is the first link, before Quick start: a newcomer wants Quick start first.
- `AGENTS.md` repo map names `lib/std/zinc.d.ts`; the file is `lib/zinc.d.ts`.
- Internal links: a scripted check of README, guide, ui*, nuxt-ui, react-native, plugins, targets and examples/GUIDELINES found only these broken: `docs/plugins/script.md:231,232` (`runtime/include/zinc_vm.h`, `runtime/vm/embedded.cpp` do not exist) and, from `docs/guide/01-getting-started.md:240`, `plugins/canvas2d.md` and `plugins/svg.md` (should be `../plugins/...`). `site/check-links.mjs` exists but covers the built site only.

### The site (`site/`)
- Nav "Docs" = `docs/guide/readme/` (`site/src/layouts/Base.astro:11`): the stale index above. The Get started page (`get-started.astro`) is current and its last button also goes there.
- `site/src/content.config.ts` globs `../docs` for `guide/*.md, plugins/*.md, targets/*.md, reports/*.md, decisions/*.md` and `{ui-kit,ui,plugins,boards,studio,dev-mode,licenses}.md`. Not published: `nuxt-ui.md`, `react-native.md`, `templates.md`, `diagnostics.md`, `zapp.md`, `desktop-integration.md`, `engines.md`, `figma-ui.md`, `zpk.md`. Links to them from published pages are rewritten by `rehypeDocLinks` (`astro.config.mjs`) to GitHub blob URLs, so a reader leaves the site. `docs/guide/03-ui-apps.md:361`, `07-distribution.md:24,143` and README link to them.
- Sidebar (`site/src/pages/docs/[...slug].astro` `groups`): Guide, Reference (`ui, ui-kit, plugins, boards, studio, dev-mode`), Plugins, Targets, Reports (all 159 files, internal), Decisions. A newcomer sees "Reports" and "Decisions" at the same level as the Guide. Page titles are derived from file names (`nice()`), so "Ui apps" is patched by a `fix` table, and there is no ordering other than file name.
- `site/src/pages/embedded.astro` and `philosophy.astro:5` repeat "no JavaScript engine or browser inside" without the QuickJS/mquickjs nuance (true for AOT only). `index.astro:6` same. Acceptable, but say "typed Zinc compiles to native with no engine; JavaScript runs on QuickJS".
- The site build reads `../README.md` for the plugin tables (`site/src/data/site.ts:29-41`): renaming the README `<summary>` breaks the site silently.

## (b) Gaps, ranked by impact on a first-time user

1. **No "choose your kind of program" page.** The README and chapter 1 list 13 templates but not how the kinds differ. Today a newcomer must discover, from scattered files: `zinc:gfx` immediate mode (`game`, `game-2d`, `iot-board`; `lib/gfx.d.ts`), `zinc:ui` with Solid or React (`eink`, `remarkable`; `03-ui-apps.md`), the shadcn-style kit `zinc:ui/kit` (`docs/ui-kit.md`, `examples/ui/kit-gallery`; **no template uses it**), Nuxt UI kit `zinc:ui/nuxt` (`desktop-app`, `dashboard`; `docs/nuxt-ui.md`), React Native preset (`docs/react-native.md`; **no template**, examples `rn-tester`, `rn-port`, `rn-showcase`), three.js (`3d`), plain JavaScript on QuickJS/V8 (`examples/js-*`, `12-js-engines.md`), headless services (`cli`, `server`, `service`, `iot`), boards (`iot-board`, `examples/esp32-*`, LVGL on mquickjs in `examples/esp32-widgets`, `docs/boards.md`), AS3-style display tree for old devices (`examples/GUIDELINES.md`, `music-tree`). `examples/GUIDELINES.md:5-13` ("Choose the UI model") is the only text that compares models, and it is written for demo authors.
2. **Chapters 02, 04-06 and the guide index are prototype text** (section (a)). A newcomer following the guide index runs `pnpm install` and `node compiler/bin/zinc.mjs`, which do not exist.
3. **No syntax cheat sheet.** `02-language.md` lists what is supported, a table of code ranges and memory internals. Missing: a one-screen "write this, not that" with `i32/f64`, no `var`/`eval`/regex/`with`, `any` strict vs gradual, JSX rules (`className`, capitalised tags), imports from `zinc:*`, `async`, with the error code and the `zinc explain` command beside each. `docs/diagnostics.md` is generated and complete but is a flat list of 100+ codes, not published on the site.
4. **No API reference.** Types are in `lib/zinc.d.ts` (353 lines), `lib/gfx.d.ts` (223, well commented), `lib/modules.d.ts` (329, 14 modules). `zinc:ui`, `zinc:ui/solid`, `zinc:ui/react`, `zinc:ui/kit`, `zinc:ui/nuxt` and every plugin module have no declaration file; the `lib/ui.d.ts` stub says so. `docs/ui.md` has two generated sections (style keys, class tokens) and is otherwise a feature essay; the 43 plugin pages are hand written, each different. The tsconfig written by `zinc new` points to these four `.d.ts`, so an editor shows no completion for `zinc:ui`. Fix: generate one reference page per module from the `.d.ts` (or `lib/std/*.ts` exports) the way `diagnostics.md` is generated from `include/zn/diagnostics.h`.
5. **No tutorial after "hello".** 01 ends at changing a text. There is no "build a small app" path (a counter, a list, a form, state, navigation, save to disk, ship it). `docs/guide/samples/hello-ui` and `greet-app` exist but nothing walks through them.
6. **Concepts are never explained in one place**: what `zinc run` does (interpret vs AOT vs QuickJS), what a profile and a target are, what `zinc dev` swaps, what a plugin is. The README's Architecture section is the closest, but it is layered for contributors. 01 mixes three of these in one table.
7. **Template READMEs are 9 lines** for `game`, `cli`, `server`, `iot`, `remarkable` ("A Zinc app (game template). zinc run / build / check"). They do not say what file to edit first, the next doc to read, or what the other kinds are. Larger ones (`service` 30, `plugin` 93) are fine.
8. **No examples index.** `examples/` has 82 directories, 56 READMEs and no `examples/README.md`; the root README names about 12. There is no list by kind and difficulty ("start here: `hello`, `bouncing-ball`, `ui`, `hero`").
9. **Site navigation is a flat top bar plus a source-tree sidebar**; the docs landing page is the stale index; no search; no "next page" links; internal reports and decisions are published next to the guide.
10. **The warning banner and the plugin counts** (README:17-22) are good, but the site's Get started does not repeat "only macOS is built and tested today"; Linux is offered first in the install text.

## Diátaxis check and the site's nav

- Tutorial: only 01 (good, tested by `tests/t1/first_run.sh`). Nothing after it.
- How-to: chapters 03-08, 10, 11 and `docs/plugins/*.md` are how-to mixed with reference (03 is half a how-to, half style reference; `ui.md` is reference and design notes).
- Reference: `zinc.json` table (inside 01), `10-lint-migrate`, `docs/diagnostics.md` (generated, unpublished), `ui.md` generated parts, `docs/plugins.md`, `capabilities.md`. `zinc help <cmd>` is the CLI reference and is not on the site (the `cli.astro` page lists 14 one-liners).
- Explanation: README Architecture, `philosophy.astro`, `12-js-engines`, `docs/reports/*` (internal), nothing for a newcomer on "why a subset" or "how it runs".
- Site nav (`Base.astro:11`): Philosophy, Uses, Get started, CLI, Demos, Embedded, Plugins, Docs, About. It is marketing-first and has no Tutorial / Guides / Reference / Explanation split.

## Languages

- Nothing is translated. No `i18n` key in `site/astro.config.mjs`; `<html lang="en">` fixed in `Base.astro:14`. Astro is `^7.3.5` with a content collection `docs` (`glob` loader over `../docs`), so Astro's built-in i18n routing (`i18n: { locales, defaultLocale }`) works. A translated tree would be `docs/fr/...` with a second glob pattern or a `locale` field, plus a language switch in `Base.astro` and per-locale nav strings.
- The doc links are rewritten by a rehype plugin that assumes one root; a second locale needs the plugin to keep links inside the same locale and fall back to English when a page is missing.
- The CLI and its errors are English only; the owner's users (education, makers) suggest French first, but translating before the structure below is settled would double the work on pages that are about to change. Translate the new tutorial and cheat sheet first (small, stable).

## (c) Proposed structure (Diátaxis)

New top level on the site: **Learn** (tutorials), **Guides** (how-to), **Reference**, **Concepts**. Sources in `docs/` keep their paths where possible (the site globs them); new pages go in new folders. Mark each page below as keep / rewrite / new.

### Start (tutorial)
| Page | From | Status |
|---|---|---|
| `docs/start/install.md` (install, `zinc doctor`, update) | `01` lines 1-96 | split out, keep text |
| `docs/start/first-app.md` (new, run, `zinc dev`, a first change, a first mistake) | `01` 97-230 | split out, keep |
| `docs/start/choose.md` **"Choose your kind of program"** | new; seed from `examples/GUIDELINES.md:5-13`, `02` of the table in 01, `12-js-engines.md` "which one" | **new** |
| `docs/start/tutorial-app.md` (a small app: state, list, form, navigation, storage, `zinc test`, `zinc build`) on `docs/guide/samples/hello-ui` | new | **new** |
| `docs/start/tutorial-game.md` (a `zinc:gfx` game from the `game` template to `game-2d`) | `templates/game*/README.md`, `07-distribution.md` first half | new, assemble |
| `docs/start/tutorial-device.md` (`iot-board`: simulate, then flash) | `templates/iot-board/README.md`, `docs/boards.md` | assemble |

### Choose your kind of program (the new page; one table, one paragraph each, one template and one example)
| Kind | You write | Template | Example | Read next |
|---|---|---|---|---|
| Drawing and games (immediate mode) | `zinc:gfx` `onFrame`, `rect`, `drawText` | `game`, `game-2d` | `examples/breakout`, `platformer` | gfx reference, `03` Fonts/assets |
| App UI, Solid style | JSX + `zinc:ui/solid` signals, `className` | `eink`, `remarkable` (add a `solid-app`) | `examples/ui`, `hero` | UI guide |
| App UI, React style | JSX + `zinc:ui/react` hooks | **none: add** | `examples/rn-showcase` | UI guide |
| Ready components, shadcn style | `zinc:ui/kit` | **none: add** | `examples/ui/kit-gallery` | `ui-kit.md` |
| Ready components, Nuxt UI | `zinc:ui/nuxt` | `desktop-app`, `dashboard` | `examples/nuxt-ui` | `nuxt-ui.md` |
| React Native code | `"ui": {"preset": "react-native"}` | **none: add** | `rn-port`, `rn-tester` | `react-native.md` |
| 3D | three.js API or `zinc:3d` | `3d` | `examples/three`, `gl-cube` | `plugins/three.md` |
| Plain JavaScript / npm | `.js`, `--engine quickjs|v8|jsc|hermes` | **none: add (`js`)** | `examples/js-three`, `js-phaser` | `12-js-engines` |
| Services and CLI (no window) | `zinc:net`, `zinc:sys` | `cli`, `server`, `service` | `examples/service/sensor-hub` | headless guide |
| Boards and microcontrollers | `zinc:gpio`, displays, LVGL | `iot`, `iot-board` | `examples/esp32-*`, `boards/` | `boards.md` |
| Old devices (TouchPad, Nexus 7) | display tree on `zinc:gfx` | none | `examples/music-tree` | `examples/GUIDELINES.md` |

New templates are optional but each removes a "which file do I start from" question. The page lists what exists today and flags the three missing ones.

### Guides (how-to)
Keep as is where current, rewrite where marked in (a): `guides/language-in-practice` (from 02, shortened), `guides/ui-apps` (03 rewritten around capitalised tags and `className`, with links to kit, Nuxt, RN), `guides/services` (04), `guides/plugins` (05, rewritten from `docs/plugins.md` and `templates/plugin`), `guides/testing` (06, rewritten around `zinc test --runner`), `guides/ship` (07), `guides/security` (08), `guides/web-apis` (09), `guides/lint-migrate` (10), `guides/javascript-engines` (11+12 merged), `guides/boards` (`docs/boards.md`), per-target pages (`docs/targets/*`), `guides/desktop-integration`, `guides/zapp` (publish the currently unpublished files).

### Reference
| Page | From | Status |
|---|---|---|
| `reference/syntax.md` **one-page cheat sheet** | new; content in the next section | **new** |
| `reference/diagnostics.md` | `docs/diagnostics.md` (generated) | publish; add a category intro and link from the cheat sheet |
| `reference/cli.md` | generate from `zinc help <cmd>` (the command table in `src/cli_core.cpp`) | **new, generated** |
| `reference/zinc-json.md` | table in `01:246-283` | split out |
| `reference/modules/<name>.md` (`gfx`, `ui`, `ui-solid`, `ui-react`, `ui-kit`, `ui-nuxt`, `fs`, `sys`, `net`, `storage`, ...) | `lib/gfx.d.ts`, `lib/modules.d.ts`, `lib/std/*.ts` | **new, generated** from declarations (needs `.d.ts` for the ui modules, which also fixes editor completion) |
| `reference/plugins/*.md` | `docs/plugins/*.md` (43) with an index table generated from the plugin.json files | keep; add the index (the README table moves here) |
| `reference/ui-styles.md` | generated parts of `docs/ui.md` (:877-985) | split out |
| `reference/targets.md`, `reference/capabilities.md` | `docs/targets/capabilities.md`, README cross-build table | merge |

### Concepts (explanation)
`concepts/how-zinc-runs.md` (interpreter, AOT, engines, profiles vs targets: from README Architecture and 12-js-engines, without ADR names), `concepts/why-a-subset.md` (from `02` and `diagnostics-vs-tsc.md`), `concepts/ui-model.md` (retained tree, Solid/React, layout engines, from `ui.md` and `docs/reports/ui-rendering-architecture.md`), `concepts/plugins.md`, `concepts/memory.md` (the 02 memory section), `concepts/philosophy.md` (site philosophy page).

### Site navigation
Top bar: Start, Guides, Reference, Concepts, Demos, Plugins, Blog or Changelog (`CHANGELOG.md`). Docs landing page = a four-box Diátaxis index plus "Choose your kind of program". Move Reports and Decisions to a "For contributors" section (or leave them out of the site and link GitHub). Order pages with a `order` field in the frontmatter instead of file names and the `fix` table in `[...slug].astro`. Add previous/next links.

### The one-page syntax cheat sheet (`reference/syntax.md`): outline
Sections, each a short code block plus the diagnostic code and `zinc explain <code>`:
1. File and imports: `.ts`/`.tsx`, `import { x } from 'zinc:gfx'`, relative imports, `zinc plugins` lists modules (Z0119 when missing).
2. Types and numbers: `number` is `f64` on desktop; `i32 u8 f32 ...` where it matters; `string`, arrays, `Map`, `Set`, objects, interfaces, generics, enums (numeric only), unions.
3. What works: classes, closures, destructuring, spread, `?.`, `??`, `async/await`, generators, `try/catch`, template strings, modules.
4. What does not, and what to write instead (table: `var` Z1001 -> `let`; `eval` Z1003; `with`; `arguments` -> rest parameters; regex Z1008 -> string methods or a plugin; dynamic `import()` Z1009; prototype changes; `any` in strict profiles Z1006 -> a type; calling through `Dyn` Z9042; `finally` in async Z9034). Fill from `zinc explain`.
5. JSX: capitalised components, `className`, `onClick`, `style={{}}`, children; errors Z0006, Z0007; `zinc migrate` fixes old spelling.
6. Reactivity at a glance: Solid `createSignal` / React `useState` side by side.
7. Memory in three lines: reference counted, cycles leak, `@weak`.
8. Where the rules differ by profile (gradual on desktop, strict on `esp32`).
Keep it under about 150 lines; everything else links out.

## Suggested order of work (smallest first)

1. Fix the guide index and the site Docs entry (one file, ~40 lines) so nobody lands on `pnpm install`.
2. Rewrite 06 and the sim passages of 02, 04, 05 and the 01 targets table; fix `class`/lowercase in 03, `ui-kit.md`, `nuxt-ui.md`, `lottie.md`.
3. Write "Choose your kind of program" and the syntax cheat sheet.
4. Publish the unpublished docs (`nuxt-ui`, `react-native`, `templates`, `diagnostics`, `zapp`) and regroup the sidebar.
5. Generate the module and CLI reference; add `.d.ts` for the ui modules.
6. Add the tutorial app, three templates (`solid-app` or `react-app`, `kit-app`, `rn-app`) and an examples index.
7. i18n of the new Start pages.
