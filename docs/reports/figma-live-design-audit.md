# Figma live design audit (2026-10-18)

Read-only audit. Question: design in Figma, Zinc plays it live (refresh while designing and at export), better when the file is well organised. Prototype = specification (`compiler/`, `sim/`); Zinc Next = `next/`.

## 1. Exists and works

**Figma plugin (export, one-shot).** `integrations/figma/` (code.js 160 lines, ui.html 103, build.mjs, README.md 16).
- Outputs: ZIP (`zinc-ui-package/1`), readable TSX, "Send to Zinc", "Preview in Zinc" (docs/figma-ui.md:37-41; ui.html:54-55).
- Pairing: `zinc ui serve` prints `http://localhost:7331/#<48-hex token>`; the plugin POSTs a zip to `/import` or `/preview` with a Bearer token (ui.html:49-53, 90-94; compiler/src/ui-tools.ts:84-111). Loopback only, one build at a time (ui-tools.ts:104).
- Document contract `zinc-ui/1`: validator + TSX generator in `compiler/src/ui-document.ts` (191 lines), packer `ui-package.ts`, style mapping `ui-style.ts`. Data only, no expressions; limits 10,000 nodes, 64 depth, 512 assets, 32 MiB (docs/figma-ui.md:88-125).
- Annotation contract: plugin data key `zinc-ui-v1` on a node (code.js:3-5, 147-152). Fields: `component`, `contract{inputs,events}`, `text{input}`, `onClick[]` (navigate/back/emit), `type:input` + `onInput`, `instanceInputs/instanceEvents`, `style` override (docs/figma-ui.md:56-86).
- Figma to style mapping actually implemented (code.js:113-135): Auto Layout H/V to `flexDirection`, `gap`, per-side padding, `justifyContent/alignItems` (MIN/CENTER/MAX/SPACE_BETWEEN); wrap to `flexWrap` (one gap, warning); HUG to no size, FILL to `flexGrow:1` on the main axis or `100%` on the cross axis; non-auto-layout parents to `position:absolute` with left/top; `clipsContent` to `overflow:hidden`; overflow scrolling to `overflow:auto`. Also: solid fill to `backgroundColor`/`color` (code.js:56-59), opacity, uniform `borderRadius`, one opaque solid stroke (code.js:61-70), text size, align, bold, line height, letter spacing (code.js:72-84), prototype ON_CLICK with NAVIGATE/BACK to `onClick` (code.js:88-100).
- Named components: an annotated Figma component becomes a generated component, defined once, instances get `inputs`/`events` (code.js:26-43).
- Worked example: `examples/ui/figma-storyboard/` (`design.zui.json`, generated `src/design.tsx`, hand-written `src/main.tsx`); listed OK in the examples gate (`tests/examples.lst`: `ui/figma-storyboard/src/main.tsx | OK`; ZN-151 Done, ZN-155 Done).
- The generated code is plain `zinc:ui` + `zinc:ui/solid` with `StyleSheet.create` (design.tsx:1-10), so it runs unchanged on Zinc Next (interpreter, AOT, QuickJS).

**Zinc Next entry point to the plugin tools.** `zinc ui check|code|import|pack|serve` exists in the Next CLI (next/src/cli_core.cpp:119) but only shells out to Node and `compiler/bin/zinc.mjs ui` of a checkout (cli_core.cpp:1842-1845, `nodeTool` needs Node, 1830-1832).

**Style system (target of the mapping).**
- One flat node model for class tokens, `.css`, `style={{}}`, `StyleSheet.create`, array layers (docs/reports/ui-style-system.md:9, sec. 2.1; lib/std/ui.ts). Style reference tables generated from the property table (docs/ui.md:821-926); ZN-279 "Docs and Figma mapping generated from the property table" is Done, giving the Figma-property to token table (docs/figma-ui.md:160-186).
- Colours accept CSS names, hex, rgb, hsl, `var(--x)`, Tailwind names with alpha (docs/ui.md:271). Scheme variables `bg-[var(--pfTint)]` follow `setScheme` and accent without a render (docs/ui.md:579-580). OS dark/light: `setScheme('auto')` (docs/ui.md:392).
- Kit themes: `LIGHT`/`DARK` roles after shadcn variables, `setTheme` is a signal (docs/ui-kit.md:141-152; lib/std/kit/theme.ts). Variants as props: Button `default|secondary|outline|ghost|destructive`, sizes (docs/ui-kit.md:63).
- Layout engines: `classic` (default) or Yoga 3.2.1 (`"ui":{"layout":"rn"}` / `preset: react-native`, docs/ui.md:657-664; docs/react-native.md:3). Yoga is the engine that matches Figma auto layout (flex) best.
- State variants `hover: focus: active: disabled:` on paint properties, transitions, gradients, breakpoints (docs/ui.md:198-250; ui-style-system.md sec 2.1).
- JSX rules: `className`, capitalised components only (AGENTS.md). Note: the generator emits StyleSheet objects, not class strings.

**Live refresh in Zinc Next.**
- `zinc dev` Fast Refresh on macOS/Linux interpreter: the saved module is swapped into the running process, state of untouched modules kept, Solid components re-rendered in place via proxies; 60-540 ms measured; red box on compile error; Chrome DevTools inspector on 9229 (docs/dev-mode.md:1-70; cli_core.cpp:133; docs/reports/zinc-next-fast-refresh.md; ZN-141, ZN-742 Done). Code in `next/src/dev/` (hot.cpp, hot_swap.cpp, client.cpp, core.cpp).
- Asset hot reload (ZN-450 Done): a save under the assets dir rebuilds and swaps into the running program (`zinc:assets onReload`, cli_core.cpp:133).
- `zinc dev --device <name>` sends what changed to a paired device; `zinc dev --lan` serves to Zinc Go on phones with QR (cli_core.cpp:133; ZN-631 is Review, ZN-516 and ZN-729 Backlog).
- Web: `zinc dev --target web` page reload (docs/dev-mode.md table).
- Debug: `ZN_DUMP_JSX=<name>` prints the lowered JSX of a file (next/src/frontend/modules.cpp:1830).

## 2. Exists but prototype-only (or Node-only)

- The whole Figma pipeline lives in the prototype tree: `compiler/src/ui-*.ts`, run through `node compiler/bin/zinc.mjs ui ...` (docs/figma-ui.md:4-20, 129-135; integrations/figma/README.md:3-5). Zinc Next only delegates to it (cli_core.cpp:1842). No Next-native reader of `zinc-ui/1`, no C++ code mentions `zinc-ui` (grep of next/src: only the CLI table).
- "Preview in Zinc" builds WebAssembly with Emscripten + CMake, reloads the whole app, state lost (docs/figma-ui.md:50-51; ui-tools.ts:110 `buildWasm`). It does not use Next, `zinc dev`, or Fast Refresh. Requires `emcc`.
- Import writes `src/design.tsx`, a hash manifest refuses overwriting hand edits (docs/figma-ui.md:143-145). Subsequent import is a file change, so a `zinc dev` watching that project would Fast Refresh it, but nobody tested or wired that path (inference from dev-mode.md; not found in any doc or test).
- ZincStudio (`apps/studio`, Choregraphe-style flow editor, a Zinc app with `zinc:remote` robot view, apps/studio/README.md:1-40) is unrelated to Figma; it shows the pattern for streaming a running app into an editor (`zinc:remote`).
- Prototype hot reload (app.so swap) in docs/dev-mode.md:75+ is superseded by Fast Refresh for Next.

## 3. Missing (against the goal)

Plugin side (all verified by reading code.js, 160 lines):
- No live mode: no `documentchange`/`selectionchange`-driven send; only `selectionchange` for the annotation panel (code.js:10). Export is a manual click; "no background sync when the plugin is closed" (docs/figma-ui.md:51).
- No Figma variables, styles or modes: no read of `boundVariables`, `getLocalPaintStylesAsync`, `fillStyleId`, `textStyleId`, `figma.variables` (grep code.js: none). Colours are flattened to hex; every export loses token names and light/dark modes.
- Components and variants: only an explicit `component` annotation creates a component; "Component properties/variants are not automatically interpreted" (docs/figma-ui.md:82). Variant sets and component properties are not mapped to props or to kit variants. Unannotated instances are expanded (docs/figma-ui.md:81).
- Naming conventions: none; "No code is inferred from layer names" (docs/figma-ui.md:77). So clean naming gives no gain.
- Rejected or degraded (docs/figma-ui.md:154-158; code.js:48-49, 57, 62, 65, 73-75): gradients and multiple fills, images (only static PNG rasterize, not for interactive subtrees), vectors (same), effects (shadows, blur), rotation, masks, blend modes, mixed radii, mixed text runs, transparent text, justified text, grid auto layout, multiple/translucent strokes, non-Inter fonts substituted with a warning, font weights other than regular/bold (code.js:77-79). Stroke aligned INSIDE only.
- Constraints (pin left/right/centre/scale) are not read; non-auto-layout frames become fixed absolute boxes (code.js:116; docs/figma-ui.md:157).
- Layout fidelity details: min/max width and height, aspect ratio, per-side auto-layout padding in "Hug/Fill" combos, `SPACE_BETWEEN` only; no `layoutAlign STRETCH`, no `itemReverseZIndex`, no counter-axis gap for wrap.
- Prototype interactions: only ON_CLICK navigate/back; transitions instantaneous; no overlays, no hover/press triggers, no Smart Animate, no variant change, no `ON_DRAG`, `AFTER_TIMEOUT` (code.js:91-97).
- Static generator: no use of the style system's `className` tokens, hover/active variants, themes or kit components; output is `StyleSheet.create` objects with hex values (design.tsx:4-10), so the design cannot follow `setTheme`, `var(--x)` or dark mode.
- No push-to-running-app channel on Next: `zinc ui serve` is the only receiver (Node, port 7331, loopback); no `zinc dev` endpoint accepts a design document or a changed file from outside. `zinc device` / `zinc dev --device` carry saved project files, not design documents.
- No reverse path (code to Figma) in the repo; the Figma MCP skills of the owner's tooling (figma-use, figma-generate-design) are outside this repo.
- Backlog: no task about live Figma, Figma variables, variant mapping, or porting `zinc ui` to Next. `grep -il figma` over tasks, later.md, backlog-review json finds only ZN-077, ZN-151, ZN-155, ZN-279 (all Done/closed) and ZN-511 (unrelated mention).

## 4. Backlog ids (figma, design, hot reload, live, dev server, tokens)

| ZN | Topic | Status |
|---|---|---|
| ZN-151 | Examples UI cluster incl. figma-storyboard | Done |
| ZN-155 | Parity gate, 63 examples | Done |
| ZN-077 | JSX/style lowering (figma-storyboard OK) | Done |
| ZN-279 | Docs and Figma mapping generated from the property table | Done |
| ZN-141 | `zinc dev` hot reload, red box, DevTools | Done |
| ZN-742 | `zinc dev` Fast Refresh in the VM | Done |
| ZN-450 | Asset hot reload in `zinc dev` | Done |
| ZN-631 | Dev client iOS/Android, `zinc dev --lan` | Review |
| ZN-516 | Deploy and dev loop over USB gadget/ssh | Backlog |
| ZN-729 | Zinc agent / `zinc device` | Backlog |
| ZN-356 / ZN-357 | RN-style and Nuxt-UI-style showcases | Done |
| ST-22 (ui-style-system.md:290 area; theme variables, dark mode) | placeholder, tasks not created in that report | check later review |
| later.md:115, 209 | ZN-443 map hot reload, ZN-742 re-install baked fonts live instead of restarting | open lines |

## 5. Summary (10 lines)

1. A working Figma plugin exists, but it is a one-shot exporter (ZIP/TSX/send/preview), not live.
2. It is prototype-tree code (`compiler/src/ui-*.ts`, Node); Zinc Next only shells out to it (`cli_core.cpp:1842`).
3. The `zinc-ui/1` document is a clean, validated, data-only contract: a good seam to keep.
4. Mapping covers auto layout to flex, padding, gap, fill/HUG, solid fills, one stroke, uniform radius, plain text, click navigation.
5. Variables, Figma styles, modes, variants, component properties, constraints, gradients, images, vectors, effects: unsupported or rasterized.
6. Layer naming is explicitly not used; annotations (JSON in plugin data) are the only organisation signal.
7. The target style system is rich (tokens, `var()`, dark mode, kit variants, Yoga) but the generator uses none of it.
8. Zinc Next has real Fast Refresh (swap in the running process, state kept, 60-540 ms) and DevTools, LAN and device push.
9. The live path (Figma to running app) is missing: preview uses an Emscripten rebuild that loses state.
10. No backlog task covers it; the backlog is frozen, so a new task needs `New-task: owner` (AGENTS.md).

## 6. Five biggest gaps

1. **No live channel.** Plugin has no change listener and the receiver is Node `zinc ui serve`; `zinc dev` cannot take a design document. Preview = wasm rebuild, state lost.
2. **Tokens are lost.** No read of Figma variables/styles/modes; no mapping to `var(--x)`, `setTheme`, `setScheme` or Tailwind tokens, so dark mode and design-system edits do not propagate.
3. **Components/variants not interpreted.** Variant sets and component properties do not become props or kit variants; only hand-annotated components work. Well-organised files gain nothing.
4. **Fidelity holes.** Constraints, gradients, images, vectors, effects, fonts/weights, mixed text, min/max, prototype triggers other than click, transitions.
5. **Pipeline is prototype-only.** Generator and server live in Node/TS; Zinc Next has no native `zinc-ui/1` reader, no `zinc ui` without a checkout and Node, and no test of design-to-dev loop on Next.

## 7. Reuse points

- `zinc-ui/1` document, validator, TSX generator, ZIP importer with ownership hashes (`compiler/src/ui-document.ts`, `ui-package.ts`, `ui-tools.ts`) and the pairing/Bearer-token design (ui-tools.ts:84-111).
- Plugin sandbox code (`code.js`) as the base: node walker, layout mapping (113-135), component definition (26-43), annotation panel.
- Fast Refresh: the generated `src/design.tsx` is a normal Solid module, so rewriting it under `zinc dev` should refresh in place; the cheap first step is a receiver that writes the file into a project that `zinc dev` watches (to be proven, untested).
- Style system: class tokens, `var()`/scheme variables, `ui-style.ts` mapping, ZN-279 mapping table, `isKnownClass` as the checker of generated tokens.
- Kit (`lib/std/kit`) variants and `Theme` roles as targets for Figma variants and variables; Yoga `rn` layout for flex fidelity.
- `zinc dev --device/--lan` and asset hot reload (`zinc:assets onReload`) to push to phones and boards, `ZN_DUMP_JSX` for debugging the generated output.
- `examples/ui/figma-storyboard` as the end-to-end fixture.
