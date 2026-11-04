# Figma Live restart (2026-10-23)

Owner request: a simple live creation experience, persistent native Mac companion,
viewport and pairing controls, true typography/vector icons, Figma design-system
data, Auto Layout, prototype, motion and Lottie. Implementation and exact limits:
[integrations/figma/README.md](../../integrations/figma/README.md).

## Implementation

The read-only live plugin exports a pinned screen and reachable prototype screens.
An explicit demo action creates native Figma variables, text styles, a button
component and its instances, and prototype screens. The Python bridge validates
incoming data and atomically generates an ordinary Zinc project. The companion
mounts once, polls revisions, preloads media, replaces its preview subtree and
acknowledges display. Invalid updates preserve the previous tree. Generated
projects use the same scene runtime. SVG and Lottie use the existing native plugins;
there is no browser renderer or second layout engine.

The former Inter-only text export silently outlined custom fonts. Text now stays
native by default. The Mac resolves installed font family/style names and copies
actual TrueType files; collections/variable instances use optional installed
fontTools. `ui.registerFont(name, file)` joins the existing runtime font loader to
native UI measurement and drawing. No C++ engine changes or build were needed.
The companion supplies ZINC_ROOT so an external engine binary reads this checkout's
standard library. Font failure is visible, never an implicit screenshot conversion.
Shared styles, palette modes and component declarations are exported once with
per-node bindings and instance properties. Runtime mode switching and reusable
prop-driven component code generation remain outside this implementation.

## Evidence

- `figma_live`: actual plugin/panel scripts under fixtures; custom Georgia Italic
  stays Text, copies a TrueType file, and its native node's font ID equals the
  runtime font loader's ID at 24 px. Palette modes, text style, component declaration
  and instance properties survive validation and source export.
- Native Scene tests cover Auto Layout/FILL under viewport changes, actual SVG,
  PNG and vector Lottie loading, motion seek/pause, click navigation/back and
  viewport preservation. HTTP tests cover pairing, invalid input, hand-edited files,
  same-PID refresh and actual scene-dump text changes, plus applied acknowledgement.
- Existing `ui_font`, `ui_style`, `ui_textlayout` checks pass against this tree's
  standard library using the main tree engine read-only.
- Actual Figma Desktop test created a three-screen design with three palette
  variables, five text styles and one native component definition. The companion
  displayed revision 1, acknowledged it, and reported real Inter TrueType loading. The final live sample is 390 × 640,
  with four SVG icons across its three screens; no image nodes replace its text.
  Figma remains frontmost while the native viewer is visible.
  Public API dynamic-page access requires setTextStyleIdAsync; corrected after the
  real app exposed that difference from a fixture.
- Existing real-app checks caught Figma's sandbox relay using a null message source,
  preserved whitespace, and the previous false refresh signal (source changed but
  mounted tree stayed stale). Regressions cover relay handling and rendered pixels'
  actual text, rather than relying only on compiler logs.

The Finder development launcher depends on this checkout, Python and the selected
engine. It is not a signed, standalone package. No cross-target, phone/player,
publication or push was performed. The owner authorized leaving the visible local
viewer and bridge open for interactive editing, with ZINC_BACKGROUND=1.

## Standalone exporter

The companion's Export button requests a snapshot of its displayed revision. The
bridge prepares the full file map before opening the native macOS folder picker
in a worker thread, so Figma heartbeats and design updates remain responsive.
The HTTP endpoint accepts a revision only, never a destination path or command.
Cancellation writes nothing. Export stages inside the selected parent, reserves a
fresh project name atomically, then publishes the completed directory. Existing
exports and their manual edits are preserved; referenced assets only are copied.
Closing the companion cancels the picker subprocess too.

Generated TSX owns native View/Text hierarchy, classes, sizes and literal text.
Named functions attach their native prototype/motion behavior through Scene.bind;
media leaves retain the existing SVG/image/Lottie implementation. Stable action
keys reach an editable connectors.ts; handled actions suppress the Figma fallback.
The document retains bindings and motion, rather than duplicating that runtime in
JSX. Instance functions remain separate; shared prop-driven code generation and
merging manual changes on re-export are not implemented.

`figma_live` now also executes a fully exported app and asserts native typography,
Auto Layout, motion, navigation and connector interception through exported TSX.
It checks path portability, collision suffixes, preserved manual edits, cancellation,
frozen snapshots and live heartbeat service while the picker is open. Solid inserts
transparent fragments around named components; the runtime test follows those
fragments before checking the native text's font ID. An export of the live design
was also generated and run headlessly; the real companion reported a completed
revision-30 export at the user-selected Desktop/test-figma/zinc-accueil directory,
which was run independently with the matching standard library. No cross-target run.

## Maison and native semantic bindings (2026-10-23)

The worked Figma file is https://www.figma.com/design/9cmBj0SLj0e5RhpkFF7OqZ.
It contains native variables, Manrope text styles, library control instances,
editable layout and SVG icons, photo content, three overview breakpoints, three device-list breakpoints and a connection storyboard. Source scripts and a replayable plugin snapshot
are under `app/maison/design/`; the standalone snapshot is in its assets directory.

The chosen bridge is an explicit registry of real main component keys, with typed
properties, inputs and events. It replaces visual representations with the
existing Zinc kit Slider/Switch, native scroll behavior and Solid virtual row
scopes. Unknown components retain their visual tree. The local compiled controller
owns data, business actions, associations, subscriptions and cleanup; Figma carries
no executable expressions. `action:`/`outlet:` names provide stable intent, while
component property definitions remain native Figma properties.

The Home Assistant client covers auth, subscribe_entities compact deltas, entity
removal, service results/timeouts, ping and reconnect. Entity objects retain
identity during attribute changes. Device row text updates in place; structural
changes invalidate rows even when collection length stays constant. Authentication
credentials stay in memory, outside Figma, snapshots and exports. The app starts
in a clearly labelled demo mode. Weather and the energy graph remain illustrative.
Device-role associations are not persisted, and unsupported entity domains remain
read-only. No real Home Assistant server was used to validate transport or devices.

Photos behind text become separate image children, with cover/contain fitting;
JPEG input is validated with Pillow before the native decoder receives it. Complex
image fill transforms remain a limit. Icons are grouped into vector assets and
deduplicated. Extracted fonts include available OFL notices. The full selected
application can be exported using a trusted local `figma-export.json`; design
input cannot choose source files. Large TSX exports apply numeric properties
inside component functions because literal JSX styles hoist hundreds of sheets
into the VM initialization function and exhaust its 256-register budget.

`maison` proves native keyboard/switch events, 1,000 stable control updates,
100,000 virtual rows with fewer than 20 realized rows, sticky chat follow/hold/resume,
protocol deltas, actual overview/device-list bounds at 390/834/1280, unchanged row handles
for attribute-only changes, same-count entity replacement, Connectors UI/code/event
logging, JPEG rejection and a complete standalone real-storyboard export.
`figma_live` proves persistent-process design refresh and export/cleanup behavior;
`solid_cleanup` and `solid_props` pass. These are structural/behavioral checks,
not latency or GPU benchmarks. Physical HA, other targets and custom native widget
skins matching arbitrary Figma geometry were not verified.
