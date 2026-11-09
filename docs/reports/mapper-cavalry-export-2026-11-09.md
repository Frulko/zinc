# Native Cavalry project export

Mapper now exports native `.cv` scenes rather than requiring a JavaScript Editor script. The browser's authoring action downloads a geometry-only scene. Native delivery also creates a full project directory with copied image/video assets and relative references. A new CLI `examples/video/mapper/cavalry` is the same path used by the native delivery button.

## Reuse and scope

- Native file copy, unique output directories and cleanup follow Mapper's existing assembly path using `zinc:fs`.
- The existing Delivery lifecycle owns choice/running/completion/failure; `DeliveryKind` distinguishes assembly, bake and Cavalry without another set of state flags.
- Geometry measurement reuses `footprint` and `mediaSize`, including saved physical surface dimensions. One shared pure scene generator serves browser and native export.
- The folder layout uses Cavalry's documented `projectDescription.json`, `Scenes/path-to-project` and `@assets` paths. All output goes to a new directory, never over an existing project.
- Native scene graph schema comes from Cavalry's own saved scene structure, installed node definitions and official image/video examples. No runtime or sample media is vendored. Authored scene contents and credentials are not copied into the exporter.

## Behavior and boundaries

One flat composition per zone, named and sized from the mapping, with selected duration/fps. Zone/mask contours are editable shapes with `guideLayer=2`, so they do not render. The saved mapping's image/video is connected to each zone's Footage Shape; other supported media are in the Assets library. Media start at zero at native size; scale/fit is adjusted in Cavalry. Supported files and missing references are validated before a destination is created. Case-insensitive filename collisions are rejected before copying. Failed copy removes its own incomplete folder; copying checks source file size/mtime and the mapping is reread before publication.

This is an authoring project, not a conversion of playback behavior. Mask outlines do not clip; curves, feather, crop, colour correction, generated/live sources, audio, cue sequences and warp are not converted. The full original mapping is included as a reference. Stop the Mapper when exporting its local folder. The column field applies only to bake, explicitly stated in the UI. A geometry-only download needs no media files and does not contain broken asset references.

## Proof

- `zinc check` passed for the export CLI (4 files) and editor (59 files); web export succeeded (125 modules).
- Real Zinc interpreter CLI copied a PNG byte-for-byte into a new project, wrote native `.cv`, and produced relative project pointers. Missing referenced media failed and created no output.
- Official Cavalry Web Player 2.6 runtime loaded the actual CLI-produced scene: 1040×520 composition with a saved 2:1 physical surface, 30 fps, last frame 299, guide flag 2, correct shader-to-asset connection. Loading the copied PNG reported its actual 64×48 resolution via `getAttributeViaStringify`. The same runtime emits `maskApplyMode` diagnostics on official/native sample files as well.
- A small Delivery fixture proved selected paths/timing become the actual CLI arguments, completion displays the `.cv` path, and destination cancellation returns to Idle.
- A scene from the user's stopped trial project was written to `/Users/mowmow/Lab/mapper-exports/mapper-cavalry-AnnPYK/Scenes/Mapper.cv`.
- Desktop control was denied by the computer-use tool and its browser host was unavailable. No alternate UI control was attempted. No visual render or desktop open/save round trip is claimed.

## Sources

- [Project layout and relative paths](https://cavalry.studio/docs/user-interface/menus/window-menu/assets-window/project-settings/)
- [Native scene format](https://cavalry.studio/docs/user-interface/menus/file-menu/)
- [Official Web Player and sample scenes](https://cavalry.studio/docs/web-player/)
- [Web Player attribute and asset APIs](https://cavalry.studio/docs/web-player/api/)

## Proposed tests

- Open exported `Scenes/Mapper.cv` in desktop Cavalry, inspect all compositions, save/reopen and render without guides; 5 minutes, one Cavalry process.
- Move an exported project folder, open it and verify image/video links and video playback; 5 minutes.
- Native editor click-through for project selection, external media folder, unsupported media error and retry; 3 minutes.
