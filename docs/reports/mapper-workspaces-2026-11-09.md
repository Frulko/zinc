# Mapper workspaces

The connected editor now opens in Composition: library, read-only output geometry, clip/layer inspector and cue grid. Mapping and Zones share the selected layer but omit the library and cue grid; their optional inspector only shows layer properties. Switching workspace does not change playback. Players and Project/exports host the existing device and delivery panels without the composition chrome. Settings retains calibration, room, audio, scenes, history and preferences.

Mapping tools show mesh presets only in mesh mode and corner linking only in corner mode. Both editing workspaces offer zone selection, a test-pattern toggle, phone access and optional properties. Empty mapping directs the user to create a layer in Composition. The output plan explicitly describes geometry: it is not a live video preview.

The structure follows the input/output separation in [Resolume Advanced Output](https://www.resolume.com/support/en/advanced-output) and [Output Transformation](https://www.resolume.com/support/en/output-transformation), reusing the mapper's existing canvases, protocol and point editor rather than adding a second editing model.

## Proof

- `zinc check` of the editor, 52 files, passed using the shared binary and the clean standard library at `/tmp/zinc-mapper-exports`.
- Web export passed. Headless browser at 1440×1000 with a two-layer HTTP fixture: Composition, Mapping and Zones captured; no browser errors after completing fixture layer fields.
- Read-only composition ignored an arrow edit. Delete while Mapping sent no cue mutation. A selected mapping corner moved from 64 to 65 px and sent `/layer/0/corner` with x `0.05078125` on a 1280-pixel output.
- Add mask displayed the mask and sent `/layer/0/mask/0` with its four corners.
- Fixture servers and the isolated browser session were explicitly closed.

No physical projector, native connected runtime, full keyboard traversal or real video preview was verified. The coordinator subsequently removed automatic playback on one-file import; the library hint now describes import only.

## Proposed tests

- Connected desktop workflow: import, assign and launch a cue, switch Mapping/Zones and return; verify playback unchanged and project delivery, about 2 minutes, memory unmeasured.
- Full keyboard traversal at 1280×800 and 1920×1080: focus, zone/cue selection and point editing; about 2 minutes, memory unmeasured.

## Precision canvas pass

Mapping and Zones now provide pointer-anchored wheel zoom, middle-button or Space-drag pan, a persistent Pan tool, fit (`0`), a numeric pixel step with arrow controls, and next/previous point (`N` / `Shift+N`). Tab is left to the standard focus traversal. `F` maximizes the canvas, preserving the current editing mode and viewport; Escape or the visible return button restores the workspace. Zoom and pan affect only the editor view. Pan mode ignores geometry drag and nudges; this is a navigation tool, not a project-wide geometry lock. Existing corner links, meshes and masks continue through the same point model. Project/exports now includes the coordinator's authoring exports panel.

These choices follow [Resolume modifiers](https://resolume.com/index.php/support/en/modifiers) and [keyboard shortcuts](https://resolume.com/support/en/shortcuts). The viewport has its own clipping container so zoomed geometry cannot paint over its controls.

### Feature proof

- Editor check passed (55 files); web export passed with the shared binary and clean standard library. No engine build or suite was run.
- At 1440×1000, wheel zoom from 100% to 177% retained the corner under pointer (158,294). A middle-button drag by (120,70) moved that corner to (278,364). Neither action sent a geometry command.
- ArrowRight at that zoom moved the selected corner from output x=64 to x=65 and sent only `/layer/0/corner` with normalized x=0.05078125. N selected the next corner; Shift+N returned to the previous corner.
- F hid workspace chrome; Escape restored it; 0 restored the fitted view. Tab followed by ArrowRight sent no further geometry command, proving focus left the canvas.
- Browser key and wheel injections used explicit DOM event coordinates and key names: the automation CLI emitted wheel coordinates (0,0) and repeated/misnamed shortcut events. Events were spaced by 300 ms so the engine processed deferred focus navigation between them. No app workaround was added.
- Captures: `/tmp/mapper-canvas-zoom.png`, `/tmp/mapper-canvas-pan.png`, `/tmp/mapper-canvas-nudge-zoomed.png`, `/tmp/mapper-canvas-next.png`, `/tmp/mapper-canvas-max-zoomed.png`, `/tmp/mapper-canvas-fit.png`, `/tmp/mapper-canvas-tab.png`.
- Browser reported no errors. The fixture process and isolated browser session were closed explicitly.

The fixture is synthetic and does not validate a projector, native gesture delivery, physical trackpad pinch, numeric field entry or full keyboard traversal of every workspace. View navigation and editing use the existing engine input API. Proposed follow-up proof: connected native Mapping/Zones at 1280×800, wheel/Space/middle pan, numeric step and mask/mesh drag, about 2 minutes; memory unmeasured.
