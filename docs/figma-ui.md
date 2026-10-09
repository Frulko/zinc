# Figma → Zinc UI

The first implementation exports selected Figma frames into a versioned UI document and compiles the generated code for native or WebAssembly preview. No document
interpreter, ZIP decoder or Figma dependency is added to the target executable.

## Try the working example

From the Zinc checkout, after `pnpm install`:

```sh
node compiler/bin/zinc.mjs run examples/ui/figma-storyboard
node compiler/bin/zinc.mjs run examples/ui/figma-storyboard --target wasm
```

The temperature card emits `targetChanged(22)`, the handwritten caller updates a signal, and both navigation and
Back work. `src/design.tsx` is generated; `src/main.tsx` owns the application behavior. Regenerate only the design:

```sh
node compiler/bin/zinc.mjs ui code examples/ui/figma-storyboard/design.zui.json > examples/ui/figma-storyboard/src/design.tsx
```

## Install the development plugin

```sh
node integrations/figma/build.mjs
node compiler/bin/zinc.mjs ui serve ./build/figma-preview
```

In Figma **Desktop**, choose **Plugins → Development → Import plugin from manifest…** and select
`integrations/figma/manifest.json`. Open **Zinc UI** in a Design file. The manifest uses a stable development ID;
replace it with the ID assigned by Figma when publishing. Node annotations belong to the plugin ID, so preserve
that ID once designers start annotating production documents.

Select the frames to export. The first selected frame is the initial screen and defines the preview dimensions.
For a reusable component, annotate its root with `"component": "TemperatureCard"` and select it alone.

- **Export ZIP** downloads the document and assets. This works without a local compiler.
- **Generate TSX** exposes readable source with Copy and Download actions. Download the ZIP too when there are assets.
- **Send to Zinc** imports into the directory chosen by `zinc ui serve`.
- **Preview in Zinc** imports, builds with Emscripten, and displays the real Zinc canvas in an iframe. Click the
  canvas to interact; output events appear in the preview console.

Paste the pairing URL printed by `zinc ui serve` into **Connect to Zinc**. The plugin manifest and UI use port 7331.
Use `localhost`, not `127.0.0.1`: Figma rejects the numeric loopback address in the manifest's domain list.
The CLI can use another port for non-plugin clients, but changing the plugin port requires updating its manifest
and URL validation. The bridge binds only to loopback and uses a random session token; it cannot run arbitrary
commands or choose filesystem paths from an incoming document. The token is not saved in Figma or the document.
The browser/Figma client may request local-network access. ZIP import is the offline alternative.

Preview requires `emcc` and CMake. A preview build reloads the entire app and resets its UI state. Hardware-specific
modules are not part of this generated UI preview. There is no background sync when the plugin is closed.

The plugin has been checked with a Figma API fixture and in a browser harness. Desktop installation and its network
policy still need a real Figma session; the local browser harness does not prove Figma CSP compatibility.

## Annotate a layer

**Selected layer · inputs & events** has convenience fields for a text binding and a payload-free click event.
The JSON editor exposes the complete v1 metadata. **Save annotations** is the only action that writes to Figma;
exporting does not alter the design. To remove a binding, clear its convenience field and remove its JSON entry.

A root frame/component declares its public contract:

```json
{
  "component": "TemperatureCard",
  "contract": {
    "inputs": { "temperature": { "type": "number", "default": 21 } },
    "events": { "targetChanged": "number" }
  }
}
```

A text layer can use `{"text":{"input":"temperature"}}`. A button layer can use
`{"onClick":[{"type":"emit","event":"targetChanged","value":22}]}`. For text entry use
`{"type":"input","value":{"input":"email"},"onInput":"emailChanged"}` and declare a string input/event.
Bindings are explicit. No code is inferred from layer names and no arbitrary JavaScript is stored in a document.

An instance of an annotated Figma component is exported as a component instance; its definition is included once.
On that instance, `instanceInputs` maps child input names to literal values or parent input bindings, and
`instanceEvents` maps child event names to parent event names. Unannotated instances are expanded into visual nodes.
Component properties/variants are not automatically interpreted as a public Zinc contract in v1.

An optional `style` annotation adds/overrides the exported style properties. Font families other than Inter currently
produce a visible substitution warning. Supply licensed TTF assets and a `fontFamily` mapping in the exported
project when needed; the plugin does not retrieve font binaries from Figma.

## Document contract: zinc-ui/1

`compiler/src/ui-document.ts` contains the shared TypeScript types, validator and generator used by both the CLI
and plugin. `examples/ui/figma-storyboard/design.zui.json` is a complete document.

| Field | Meaning |
| --- | --- |
| `format` | Exactly `zinc-ui/1`; unknown versions are rejected |
| `name`, `entry` | Document name and exported entry component name |
| `width`, `height` | Preview dimensions, 1–4096 logical pixels |
| `styles` | Named static style objects, using the same properties as TSX |
| `components` | 1–128 named components; component names start with an uppercase letter |
| `assets` | Relative PNG/SVG/TTF paths below `assets/` |

A component declares `inputs`, `events`, and either a `root` node **or** `screens` plus an `initial` screen ID.
Inputs have a primitive type (`string`, `number`, `boolean`) and a matching default. Events carry one primitive
value or `void`. Component instances get independent navigation history and state. Component dependency cycles
are rejected; nesting a multi-screen component inside another component is supported.

A node has a stable `id`, a `type`, optional named `styles` and an inline `style`. Host types are `view`, `text`,
`button`, `image`, `scroll`, `input`, `textarea`. Other types refer to declared components. IDs are unique within a
component, including its screens. A component instance accepts `inputs` and `events`; put layout on its wrapping view.

- `text` and `value` accept a literal or `{ "input": "name" }`. Text-field values must be strings.
- Style bindings must reference numeric inputs. Static enum/color values use literal strings.
- `src` references a declared image asset. `placeholder` is a literal string.
- `onInput` names a declared string event. `onClick` contains an ordered list of actions.
- Actions: `{type:"navigate", target:"screen-id"}`, `{type:"back"}`, `{type:"emit", event:"name", value:...}`.
- A navigation to the current screen is a no-op. Back on an empty stack is a no-op. Leaving a screen disposes its
  Solid subtree; re-entering mounts it again. Navigation is local to the component instance.
- Events call the supplied callback synchronously; absent callbacks are ignored. Inputs compile to getter props,
  so caller signals continue to update nested components. Two-way binding is explicitly input + change event.
- Classes form the base; named styles apply in order, then the inline style. Later properties win.

The format is data, not a scripting language: no expressions, handlers as source strings, network requests or
shell commands. Unknown fields/actions, type mismatches, missing targets/assets, cycles, unsafe paths and excessive
node counts/depth are rejected. The limits are 10,000 nodes, 64 tree levels, 512 assets and 32 MiB of uncompressed
package data. This is a first version of a declarative UI specification, not QML/Slint source compatibility.

## Files, packages and CLI

```sh
node compiler/bin/zinc.mjs ui check design.zui.json
node compiler/bin/zinc.mjs ui code design.zui.json                  # TSX on stdout
node compiler/bin/zinc.mjs ui pack design.zui.json --out design.zui.zip
node compiler/bin/zinc.mjs ui import design.zui.zip --out ./generated-ui
node compiler/bin/zinc.mjs run ./generated-ui
```

For a loose JSON document, assets are read relative to its sibling `assets/` directory. The ZIP contains
`manifest.json` (`format: "zinc-ui-package/1"`, `document: "design.zui.json"`), `design.zui.json` and `assets/*`.
JSON/font/vector entries use DEFLATE where available and smaller; PNGs are stored. Older browser engines without
raw DEFLATE support can still export stored ZIP entries. ZIP64, encryption and multi-disk archives are unsupported.
The importer checks decoded size, CRC, paths and duplicate entries; it never extracts archive paths directly.

Import produces `src/design.tsx`, a preview `src/main.tsx`, `zinc.json`, assets and the original document. A hash
manifest records owned generated files. Subsequent imports refuse to overwrite edits or pre-existing foreign files.
Keep business code in a separate caller and import the generated component; manual Copy TSX is a separate workflow.
Only changed files are written. The current bridge sends the whole package per explicit export, with one build at
a time. Asset deduplication/delta sync and binary encodings are deferred until transfer measurements justify them.

## Supported Figma subset

Frames, groups, rectangles, uniform text, solid fills/strokes, uniform corner radius, horizontal/vertical Auto Layout,
explicit positions, named reusable components, click navigation and Back. Selected destination frames must be included.

Static vectors, images and complex effects can be rasterized to PNG **only with the fallback checkbox enabled**.
An interactive or bound subtree cannot be flattened this way. Unsupported triggers, overlays, variant changes,
Smart Animate, variable expressions, grid layout and mixed text/radii are rejected or explicitly diagnosed.
Navigation transitions currently become instantaneous with a warning. Non-Auto-Layout designs preserve positions;
they do not become automatically responsive. Insets, text shaping and fonts can differ from Figma.

## Figma property to style key

The style system (`docs/ui.md`, "Style reference") has a key or class token for each of these Figma properties; the plugin maps the first column to the second.

| Figma property | Class token / style key |
|---|---|
| Auto Layout gap, counter-axis gap | `gap-N`, `gap-x-N`, `gap-y-N` (`gap`) |
| Padding (per side) | `p-N`, `pt-N`, `pr-N`, `pb-N`, `pl-N` |
| Min / max width and height | `min-w-N`, `max-w-N`, `min-h-N`, `max-h-N` |
| Layout grow, align self, wrap | `grow`, `self-*`, `flex-wrap`, `content-*` |
| Fixed / fill / hug sizing | `w-N`, `w-full`, `w-1/2`, `size-N` |
| Aspect ratio lock | `aspect-square`, `aspect-[4/3]` |
| Corner radius (uniform / per corner) | `rounded-*`, `rounded-tl-*`, `rounded-br-*` |
| Stroke weight (per side) | `border-N`, `border-t-N` |
| Stroke dash pattern | `border-dashed`, `border-dotted` |
| Stroke colour (per side) | `border-<colour>`, `border-t-<colour>` |
| Fill with opacity | `bg-<colour>/50`, `bg-[rgba(...)]` |
| Layer opacity | `opacity-N` |
| Drop shadow (text) | `text-shadow-sm`, `text-shadow-md`, `text-shadow-lg` |
| Font family / weight / italic | `font-[Family]`, `font-thin` .. `font-black`, `italic` |
| Text case, decoration | `uppercase`, `lowercase`, `capitalize`, `underline`, `line-through` |
| Letter spacing, word spacing | `tracking-*`, `word-N` |
| Text truncation, max lines | `truncate`, `line-clamp-N` |
| Text align (incl. justified) | `text-left`, `text-center`, `text-right`, `text-justify` |
| Layer order | `z-N` |
| Clip content | `overflow-hidden` |
| Selection / focus ring | `selection:bg-*`, `ring-N`, `ring-<colour>`, `outline-*` |

## Checks

```sh
pnpm typecheck
node tests/ui/check.mjs
node compiler/bin/zinc.mjs run tests/ui/styles.tsx --target sim
node compiler/bin/zinc.mjs run tests/ui/styles-react.tsx --target sim
node compiler/bin/zinc.mjs run tests/ui/styles.tsx --target macos
node compiler/bin/zinc.mjs build examples/ui/figma-storyboard --target wasm
node integrations/figma/build.mjs
```

See [object styles and caching](ui.md#object-styles-and-stylesheet) for the style API and its performance contract.
