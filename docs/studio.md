# ZincStudio — building Zinc apps with boxes and links

ZincStudio (`apps/studio`) is a node-based editor for Zinc apps, modelled on Aldebaran's Choregraphe: you place boxes
(Delay, Show Text, HTTP Get, GPIO Write...), link their outputs to other boxes' inputs, and the studio writes the
Zinc program, builds it and runs it — in the simulator, in a window, live inside the studio, or on a Raspberry Pi.
It is itself a Zinc app (zinc:ui, zinc:process, zinc:remote, zinc:webview, zinc:svg, zinc:video, zinc:lottie).
Architecture and how to add boxes: [apps/studio/README.md](../apps/studio/README.md).

```sh
node compiler/bin/zinc.mjs run apps/studio                          # opens the last project, else samples/hello-flow
node compiler/bin/zinc.mjs run apps/studio -- ~/apps/door.zproj     # opens a project
```

Requirements: macOS with SDL3 (the studio window, the Docs web view), Node.js (the zinc CLI), FFmpeg for image and
video previews; docker for the Pi (QEMU) target. Start it from the zinc checkout or set `ZINC_HOME`.

## The window

| Area | |
| --- | --- |
| Toolbar | project files (New, Open, Save), undo / redo, the run target, Run / Stop, Devices, Docs |
| Project (top left) | the project folder: `project.json`, the generated `build/src/main.ts`, the assets; type a file path below to import it into `assets/` |
| Box library (bottom left) | boxes by category with a search field; drag one onto the diagram or double-click it. Greyed boxes need a plugin that the selected target does not have |
| Flow diagram (centre) | the behavior. The start bar on the left fires `onStart` when the program starts; linking an output to the end bar on the right (`onStopped`) ends the behavior |
| Script / Generated code / Docs (centre tabs) | a Script box's code; the program the studio generates; the documentation |
| Log (bottom) | build output and the app's console, coloured by level, with level toggles and a filter |
| Robot view (top right) | the running app's screen, live; the mouse and keys work inside it |
| Inspector (bottom right) | what is selected: a box's name and parameters, a link, an asset's preview, or the project settings |

## Editing a diagram

- **Boxes**: drag from the library, or double-click a library entry. Drag a card to move it (all selected cards move
  together); Shift+click adds or removes a card from the selection; Shift+drag on the background selects a rectangle.
- **Links**: press on an output port (right side of a card) and release on an input port (left side). Round ports
  are signals (an event), square ports are values: amber for numbers, green for text. A value output may trigger a
  signal input; a signal cannot feed a value input. Dragging a linked input picks its link up (drop it elsewhere or
  on the background to delete it). Click a link to select it.
- **View**: drag the background to pan, wheel or pinch to zoom, the toolbar above the diagram zooms and fits.
- **Delete** removes the selection, **Cmd+D** duplicates it (with the links between the copies), **Cmd+Z** /
  **Shift+Cmd+Z** undo and redo every change, including parameter edits (typing in one field is one step).
- **Parameters** are edited in the Inspector and checked as you type (numbers, ranges); assets are picked from the
  project's `assets/` list. An invalid or out-of-range number falls back to the box default in the generated code.
- **Script box**: select it and open the Script tab (or double-click the card). The code runs when `onStart` fires;
  call `onDone()` to continue the flow. It is Zinc TypeScript; list the modules it uses in its `modules` parameter
  (`zinc:net zinc:gpio`: imported as `net`, `gpio`).

## Running

Pick a target in the toolbar (it is saved in the project) and press **Run** (Cmd+R). The studio saves, writes
`build/zinc.json` and `build/src/main.ts`, then:

| Target | What happens |
| --- | --- |
| Simulator | `zinc build --target sim`, then Node runs it: logs only. A program with a screen runs 60 headless frames and exits (timers do not fire in that loop): use it for headless behaviors |
| macOS window | a native build in its own window next to the studio |
| Preview | a native build with the `remote` display: no window, the Robot view shows it and forwards the mouse and keys (port 7711 on 127.0.0.1) |
| Pi (QEMU) | `zinc run --target rpi1`: the ARMv6 binary runs under QEMU in docker, logs only |
| Device | `zinc deploy --target rpi1 --device user@host`: export, copy over ssh, start |

**Stop** (Cmd+.) kills the build or the app. The app's console arrives in the Log with its level (the studio sets
`ZINC_LOG_FORMAT=json`); `ZINC_ASSETS` points at the project's `assets/` for boxes that read files (Play Video).

## Devices

The Devices dialog lists the Zinc apps that announce a remote display (`--display remote`, LAN discovery): click
**View** to watch and drive one in the Robot view. To preview an app running on a Pi, start it there with the remote
display bound to the network (`ZINC_DISPLAY=remote`-built binary, `ZINC_REMOTE_BIND=0.0.0.0`; no authentication:
trusted networks only, see [remote](plugins/remote.md)). Below, add ssh devices (`user`, `host`) and choose one for
the Device target.

## Assets

Files in `<project>/assets/` are embedded in the generated app. Import one by typing its path in the Project panel
(it is copied with `cp`, never through a shell). Select an asset to preview it in the Inspector: SVG (zinc:svg),
Lottie JSON (zinc:lottie), PNG / JPEG / video frames (zinc:video, FFmpeg). Boxes reference assets by file name.

## Docs

The Docs tab (or the book icon) opens a web view (`zinc:webview`, macOS) with this guide, the studio README and the
Zinc docs. The page talks to the studio through the Tauri-like bridge: `zinc.invoke('listDocs')`,
`zinc.invoke('readDoc', path)` (only listed files) and `zinc.invoke('openExample', name)`, which opens a sample
project in the studio.

## Project format

```
hello-flow.zproj/
  project.json        name, target, screen size, device, boxes (id, type, title, x, y, params, script), links
  assets/             images, Lottie files, videos, fonts
  build/zinc.json     generated
  build/src/main.ts   generated: one section per box, comments naming the boxes
```

A project is code: box scripts and parameters become the generated program, which runs on your machine or device
when you press Run. Open projects you trust, as you would a repository.

`project.json` keeps one box and one link per line. Links name the diagram bars `@start` (output `onStart`) and
`@end` (input `onStopped`). The generated program is event-driven and readable: `b3_in_onStart()` runs box b3 for
its `onStart` input, `b3_out_onDone()` calls every input linked to its `onDone` output.

## Command line

```sh
apps/studio/src/build/macos/cmake/app --generate my.zproj       # writes build/ and prints warnings (no window)
apps/studio/src/build/macos/cmake/app --all-boxes /tmp/all.zproj  # a project using every box (template check)
sh apps/studio/test.sh                                           # the studio's headless checks
```

Settings live in `zinc:storage` (recent projects, ssh devices): `./zinc.storage`, or the file named by `ZINC_STORAGE`.
