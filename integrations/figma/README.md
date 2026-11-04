# Zinc Live

Draw in Figma Desktop and preview in one persistent native Zinc window. Design
updates replace the preview tree, without restarting the app or recompiling it.
The companion shows connection status, an applied revision, viewport dimensions,
prototype screens and playback controls. It opens in the background.

## Start

```sh
tools/figma-live --zinc /path/to/build/zinc
```

Import `integrations/figma/manifest.json` in Figma's development plugins and run
**Zinc Live**. Paste the companion's connection link under **Connexion au Mac**.
Select a Frame or component instance and press **Voir en direct**. The preview
stays pinned when you select a child. Pause stops design transfer; the companion's
separate playback button pauses animation. **Créer un écran d’essai** explicitly
adds three prototype screens, a reusable button component, color variables and
text styles to the current Figma page. It never changes existing screens.

For a Finder-launchable development app:

```sh
tools/figma-live --make-app --zinc /path/to/build/zinc
open -g 'build/Zinc Live.app'
```

This local launcher needs this checkout, Python 3 and the engine at the supplied
path. It is not a signed, standalone distribution. Its log is
`~/Library/Logs/ZincLive.log`. Closing the native window stops its bridge. A second
launch reuses the running bridge and prints its link, avoiding port conflicts.
Terminal Ctrl-C also closes the window. Generated projects remain at the printed
path; edits made by hand are preserved rather than overwritten.

## Export a standalone project

Press **Exporter le projet…** in the companion and choose a destination folder in
macOS's folder picker. The export captures the displayed revision. Edits received
while the picker is open keep refreshing the viewer and belong to the next export.
Cancellation writes nothing. A completed project appears as a new child directory;
existing names receive `-2`, `-3`, etc. Previous exports and manual edits are never
merged or overwritten. The complete project is published after its files are written.

```text
zinc.json
src/main.tsx                 # normal Zinc/Solid entry
src/connectors.ts           # application action handlers; yours to edit
src/generated/design.tsx    # named TSX components with visual hierarchy and styles
src/generated/document.ts   # native prototype/motion/binding metadata
src/generated/scene.ts      # shared native behavior and resource runtime
src/generated/model.ts      # typed document model
assets/                     # referenced fonts, SVG, PNG and vector Lottie only
actions.json                # stable action keys and corresponding Figma layers
design-map.json             # Figma IDs, paths and exported function names
design-system.json          # component, palette and typography definitions
design.zui.json
fonts.json
README.md
```

Run with a Zinc checkout/version containing `ui.registerFont`:

```sh
zinc run /path/to/export --interp
```

During development with an engine binary built from another checkout, point
`ZINC_ROOT` at this checkout so it uses the matching standard library. The export
contains no live connection secret or absolute session asset paths and runs without
Figma or its bridge. Font/media licenses still govern redistribution.

`design.tsx` contains real native View/Text JSX, named after the Figma layers.
Asset leaves use the shared native SVG/image/Lottie renderer. Prototype and motion
metadata stay in the document and are attached to the generated native nodes.
Figma instances currently have separate named visual functions, rather than one
prop-driven reusable function per shared Figma component.

In `src/connectors.ts`, return `true` when the app handles an action, or `false`
to retain the exported prototype action:

```ts
export function onAction(key: string, action: Action): boolean {
  if (key === 'ButtonExplorer.click.0') {
    console.log('Connect this button to your application');
    return true;
  }
  return false;
}
```

The concrete keys are in `actions.json`. `createDesign(handler)` is also exported
for an application that wants to own the Scene and its lifecycle. The normal
`<Design />` entry wires `connectors.ts` and disposes the scene on unmount.

## Native design data

- **Typography:** Text remains native Text by default, including icon-font glyphs.
  The bridge resolves exact family/style names against the Mac's installed fonts
  (or bundled Inter files), copies the TrueType file into project assets, and
  registers the face for both native measurement and drawing. Missing fonts retain
  text with an explicit Inter fallback warning. Install missing fonts and restart
  the companion. Optional installed fontTools extracts collection faces and static
  variable instances. Zinc's current runtime does not accept CFF outlines, and
  supports eight externally loaded font files per process. Further load failures
  are reported. Mixed styles within one text layer currently use its first style
  with a warning. **Contours SVG** is an explicit opt-in, never an automatic choice
  for unfamiliar font families. Font licensing still governs redistribution of
  generated font assets.
- **Icons:** Figma vector shapes become SVG path assets rendered by Zinc's native
  SVG plugin; they are not PNG screenshots. Shadows, images and unsupported static
  decorations may require PNG assets. Containers containing native text or
  interactive children retain their tree, with unsupported effects reported.
- **Design system:** exports retain component IDs, names, instance properties and
  variants, text styles, paint styles, bound variable IDs, color values and modes.
  `design-system.json` holds shared definitions once; node bindings stay in
  `design.zui.json`. Figma resolves the active mode and instance overrides before
  transfer. Changing them in Figma refreshes Zinc. The viewer renders expanded
  instance trees. Export creates named TSX functions, but does not yet deduplicate
  them into shared prop-driven components or offer independent mode switching.
- **Layout:** native horizontal/vertical Auto Layout, padding, gaps, alignment,
  wrap, HUG/FILL sizing, min/max bounds, clipping and absolute children. Viewport
  controls exercise those rules. Grid currently retains resolved positions with
  a warning. Other Figma constraints and complex text layouts can differ.
- **Prototype:** reachable screens, click, pointer and timeout triggers, navigation,
  back, centered overlays, close and variant destinations. Dissolve, horizontal
  move and a limited Smart Animate are supported; Smart Animate matches direct
  children by name and interpolates position. Full Figma transition/overlay parity
  is not claimed. Unsupported actions are reported.
- **Motion:** one scalar keyframe track per supported numeric property, native
  tween playback, pause, scrub, replay and loop. Motion timelines are read directly
  from the Plugin API. Unsupported tracks are reported. Reduced-motion settings
  stop automatic motion.
- **Lottie:** attach a local vector Lottie JSON (48 KiB maximum) to a selected Frame
  or rectangle in **Typographies & ressources**. Zinc's existing Lottie plugin
  renders it. The public Figma Plugin API has no Lottie export format; this workflow
  does not pretend to export arbitrary Figma timelines as Lottie. External Lottie
  images are rejected.

Generated `src/design.tsx` and the shared scene runtime form a runnable Zinc
project. `design-map.json` maps Figma IDs and layer paths to stable PascalCase code
names; `fonts.json` records font sources. Files and assets are written atomically.
Only actual display acknowledgement produces **Affiché dans Zinc** in the plugin.
An invalid update keeps the last valid screen visible and reports the error.

## Existing player

`tools/figma-live --lan --zinc /path/to/zinc` generates the same project and uses
`zinc dev --lan` for an existing Zinc Go player. This route still uses the existing
player protocol and development refresh behavior; the persistent companion is the
local Mac route. No phone, remote player or other target was verified here.

## Limits and verification

The bridge listens only on loopback, checks Host and a random 192-bit bearer
secret, and accepts data rather than incoming commands or filesystem paths.
Limits: 32 MiB/request, 32 screens, 5,000 nodes, 48 levels, 256 incoming media assets,
8 MiB/asset, 16 million combined PNG pixels, 4,096 px/screen dimension. SVG external
references and executable elements are rejected. Session secrets are kept in a
mode-600 local file and are never written into the Figma document. The local
project retains assets across updates; garbage collection is not implemented.

```sh
ZINC=/path/to/zinc tests/run --only figma_live
```

The test exercises the actual plugin and panel scripts with API fixtures, exact
Georgia Italic resolution and native text font identity, design-system metadata,
Auto Layout/FILL, SVG/PNG/Lottie parsing, motion seek/pause, navigation/back,
viewport preservation, rejected input and hand-edit protection. It reads native
scene dumps before and after an update and verifies the native PID stays the same
and acknowledges the new revision. Test processes are cleaned up.

Exporter checks run the standalone TSX app and its Scene with actual font identity,
Auto Layout, motion and navigation assertions. They cover connector interception,
portable asset paths, fresh-folder collision handling, preservation of manual edits,
export cancellation, a snapshot frozen while the picker is open, and continued
heartbeat service during the picker. The native dump also checks export feedback.

## Native controls and photos

See [the component contract guide](../../docs/figma-ui.md#native-component-contracts) and [Maison](../../app/maison/README.md). JPEG photo validation requires Pillow (`python3 -m pip install Pillow`); missing support produces an actionable error in Live. The Connectors panel shows native controls, text outlets, action keys and emitted events. `--app-project` selects a local compiled controller, whose `figma-export.json` can include its TypeScript sources and credits in standalone exports.
