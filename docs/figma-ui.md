# Figma → Zinc Live

[Zinc Live](../integrations/figma/README.md) connects Figma Desktop to a persistent
native Mac companion. The window refreshes its design tree without relaunching,
shows connection and display status, and provides viewport, prototype and motion
controls.

```sh
tools/figma-live --zinc /path/to/build/zinc
# Optional Finder launcher:
tools/figma-live --make-app --zinc /path/to/build/zinc
open -g 'build/Zinc Live.app'
```

Import `integrations/figma/manifest.json` as a development plugin. Paste the
companion's link into **Connexion au Mac**, select a Frame and press **Voir en
direct**. The selection stays pinned. **Créer un écran d’essai** creates native
Figma variables, text styles, component instances and linked prototype screens.

Text uses real TrueType font files where available; vectors use native SVG.
Unsupported fonts retain native text with a reported fallback. Component properties,
style definitions and variable bindings/modes are preserved in the generated
project's `design-system.json` and `design.zui.json`. The current renderer expands
instances and uses the resolved Figma mode. See the README for exact supported
layout, interaction, motion and Lottie behavior and current limitations.

**Exporter le projet…** opens the macOS destination picker and writes a standalone
project with named TSX components, `src/connectors.ts`, prototype/motion metadata
and an `assets/` directory. Each export gets a fresh folder; previous code edits
are preserved. `actions.json` lists the connector keys; return true from a handler
to replace a prototype action. See the README for the exact project structure.

`--lan` uses the existing Zinc Go development route. The generated source project
remains on disk after closing the companion; local hand edits are protected.

The former `zinc-ui/1` exporter and `zinc ui serve` belonged to the deleted Node
prototype and remain historical under `prototype-final`.

## Native component contracts

A drawing alone does not identify a control reliably. The bridge matches the
instance's real Figma **main component key** against the local, trusted
`integrations/figma/components.json` registry. Variant instances use the component
set key. Unregistered components retain their visual tree.

| Figma component properties | Zinc runtime | Application code |
|---|---|---|
| Slider: Min, Max, Step, Value, Outlet, Action | Existing kit Slider | `scene.controls.setValue(outlet, value)`; numeric `BindingEvent` |
| Switch: Checked, Outlet, Action | Existing kit Switch | controlled value 0/1; change event |
| ActivityFeed: StickToBottom, Outlet | Native scrolling container | append rows; following pauses when the user scrolls up |
| DeviceList: Items, ItemHeight | Native virtualized list | register a count accessor and row renderer for Items |
| Text named `outlet:temperature` | Native Text | `scene.setText('temperature', value)` |
| Layer named `action:lights.toggle` | Click target | `scene.onBinding`, event.key = `lights.toggle` |

Component properties are validated data, never executable expressions. Numeric
ranges must be finite, Slider steps positive, and bindings bounded strings. Figma
specifies initial state, geometry and intent; TypeScript supplies live values,
collections and business logic. The native controls use the Zinc kit theme;
arbitrary drawn slider tracks are not converted into new widget implementations.
Code Connect can document a similar component/property mapping, but does not run
these bindings or provide live data ([official guide](https://developers.figma.com/docs/code-connect/react/)).

`scene.controls.registerList('messages', count, renderRow)` uses the existing
virtualizer and disposes reactive row scopes when they leave the viewport.
Retain item identity in your data model and update visible rows for attribute-only
changes; replacing the collection/count rebuilds its visible rows. A chat uses
ScrollView with StickToBottom instead of pinning its scroll offset on every update.

Photos are separate local image assets. An image fill behind text is extracted as
an image child, preserving the caption as native Text. Cover and contain sizing
are supported; custom Figma crop transforms and multiple blended image fills are
not reproduced exactly. JPEG validation needs Python Pillow. Font files carry
available local OFL notices into the export.

Use `--app-project app/maison/live` to compile the Maison controller into Live.
Its Connectors panel lists actual outlets/actions, runnable binding examples and
recent events. The selected local app may declare `figma-export.json` beside its
manifest to include its own TypeScript controller/client and credit files in an
export. Figma cannot select files or supply executable application code.

[Maison](../app/maison/README.md) is a complete worked example with demo devices,
a Home Assistant client and tablet/portrait/phone overview storyboards.
