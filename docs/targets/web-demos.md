# The demos on the web target, in a real-input Chrome

Measured with `tools/web-real-test` (docs/targets/web.md, "Tests"): Chrome 155 with trusted mouse and key events (a move, a press, a release 90 ms later), a device pixel ratio of 2
(`--force-device-scale-factor=2`) at 1280 x 800, then Tab, arrows and typing, a wheel, a window resize, focus lost and regained. A run passes when the page produced no console error, warning,
exception or failed request, the frames kept running, the canvas followed the window at the device ratio, and (when the demo is interactive) a click or key changed the picture.
`web-real-test --matrix <zinc> <dirs...>` prints the table below (add `--matrix-dev` for `zinc dev --target web`).

Not covered here, because a script cannot judge it: how the page looks next to the desktop render (looked at on screenshots only), a headful window on a Retina screen, Firefox and Safari,
and the owner's own machine. The runs are headless Chrome (`--headless=new`) with software GL.

Result after the fixes of this pass. "ok": no problem, frames running, input heard. Ratio 1 was run for the hero demo only (canvas and DOM); every other row is ratio 2.

| Demo | canvas | dom | `zinc dev` (canvas, dom) | Notes |
|---|---|---|---|---|
| examples/hero | ok | ok | ok | |
| examples/breakout | ok | ok | ok | DOM: blank page and handler errors before (no `zinc:ui` tree) |
| examples/nuxt-ui | ok | ok | ok, ok | |
| examples/rn-showcase | ok | ok | ok, ok | a resize blanked the screen of the tab on show (fixed) |
| examples/rn-port | ok | ok | | |
| examples/three/cubes | ok | ok | ok, ok | DOM: blank page before |
| examples/three/gltf-viewer | ok | ok | | |
| examples/gl-cube | ok | ok | ok, ok | DOM: blank page before |
| examples/webcam | ok | ok | | the fake camera of Chrome |
| examples/webrtc-call | ok | ok | | |
| examples/webrtc-chat | ok | ok | | |
| examples/music | runs | runs | | the app itself reports `UDP 7777` and `zinc:link` as unavailable in a page; the radio logos of other sites are refused by their CORS rules (browser messages, not ours) |
| examples/video/looper | ok | ok | | black picture without media files |
| examples/video/bounce, quad | by design | by design | | take video files on the command line: "no video files" (the program ends there) |
| examples/maps/explorer | runs | runs | | needs a `tiles/` folder or `ZINC_MAP_ONLINE=1`; says so |
| examples/maps/svg-gallery | ok | ok | | |
| examples/pinball | ok | ok | | |
| examples/platformer | **fails** | **fails** | | "the atlas game has no animation hero_idle": the export does not run the asset build (atlases, tilemaps), see later.md |
| examples/zed-editor | refused | refused | | `requires fs`: the export says so (Z-code, `--force` builds anyway) |
| templates 3d, dashboard, desktop-app, game (after `zinc new`) | ok | ok | | a template folder itself holds `{{id}}` placeholders: create it with `zinc new` first |

## What this pass found and fixed

| Symptom | Cause | Fix |
|---|---|---|
| a screen went blank after a window resize (canvas and DOM) | a tab left behind still listened to the window size; its queued update ran on an unmounted component and detached the children of a node handle that belonged to another screen by then | `lib/std/react.ts`: an unmounted instance ignores updates (shared with the desktop) |
| every typed letter appeared twice in a canvas text field | the keydown pushed the text and the focused `<textarea>` pushed it again from its `input` event | `targets/web/runtime.js`: keydown does not add text while the field's textarea has the focus |
| DOM mode: blank white page for a program that only draws (`zinc:gfx`, three.js) and `Cannot read properties of null (reading 'domOutside')` on every click | no `zinc:ui` tree means no elements; the DOM host's handlers ran with no tree | the first draw without a tree mounts a window-sized canvas with the canvas mode's input (`enterRaw`); the DOM handlers wait for a tree |
| the AudioContext never started in DOM mode | the autoplay unlock listened on the canvas only | the page's first pointer, key or touch unlocks audio in both modes; a waiter that comes late runs at once |
| `/favicon.ico` 404 in every console | no icon link | an empty icon (`data:,`) when the app has none |
| a program that calls `exit()` went on running after it and threw | `exit` only set a flag | `exit` stops the program where it stands (a `ZnExit` nobody reports) |
| an error thrown every frame filled the console (60 a second) and the overlay flickered | `showError` had no memory | the same message within a second is counted, not repeated; the overlay of an exported page shows the first stack lines |
| `music` stopped at start in a page: `plugin Webos.available is not available` | the webos plugin had no browser backend | a backend that answers false: the page is never on webOS |
| double-clicking `index.html` (a `file:` address) left the splash for ever with CORS errors | browsers refuse ES modules from `file:` | the splash says to run `serve.py` |

What an uncaught exception shows: `zinc dev` puts the overlay over the page with the stack (its modules are served one by one, so the frames name the source files); an export shows a red
bar with the message and the first stack lines, and `--sourcemap` writes the map for the browser's own tools. Repeats are counted, not printed.

## Not reproduced

The owner's report (few demos work, many errors on focus events) was not reproduced as such: no focus-event exception came out of the blur, focus and visibility sequences above. The most likely
cause of "the app does not react after a while" is the resize bug (a real window resizes at load, with the scroll bars and the DevTools); it logged one `TypeError` and left the screen blank, which can read as "nothing reacts". The canvas pointer path itself (pointerdown, pointerup, click at ratio 2) worked in the trusted-input runs.

## `zinc dev`, every example (2026-10-30)

All 129 examples under `zinc dev --target web --render dom`, one at a time (`tools/web-real-test --dev`; three at once made the slow starters time out). The dev bridge
(docs/targets/web.md, "The dev bridge") gives the page this machine's files, processes, sockets, servers, host events and cross-origin fetch, so a demo that runs under
`zinc run` should run here. What still fails, and why:

| Demos | Path | Why |
|---|---|---|
| 3d/cubes, 3d/model, 3d/orbit, animation-lab, godot-to-zinc, lantern-post, leapmotion, marble, pinball3d, tokyo, museum-table (its 3D view), blender-library, blender-world | none | `zinc:3d` (Render3D, and `Three.parse` for glTF) has no browser backend, and a side that draws is never bridged: a WebGL 2 backend of zinc:3d is the missing piece |
| webgl-cube, webgl-studio, scripting/bench | bridge | `zinc:script` runs on the machine: no GL context there for three.js, and every call is an HTTP round trip (the bench does not end); an engine in the page is the missing piece |
| esp32-wifi, esp32-espnow, esp32-ble/esp32 | none | board programs (`zinc:wifi`, `zinc:espnow`, `zinc:ble` exist in the ESP32 firmware only); the simulator in the page (ZN-863.04) |
| carnet-nbe | none | the web's esbuild pre-bundle applies the `exports` of its `@nbe/*` packages (it imports `src/` paths) and does not know `loro-crdt` is a plugin module; `zinc run` resolves both |
| js-gsap, js-p5, js-phaser, js-spline | page | they load a browser library by a path of the project or `~/.zinc/cache/test-libs` (the point of these demos is Zinc running those libraries natively) |
| remarkable/notes, native-module | none | native modules of a device (RmppRefresh) or of the demo itself that no plugin provides |
| carnet | page | needs its sync server on port 7311 (`zinc run app/carnet-sync`), as on the desktop |
| ipod-web, modules-showcase, service/sensor-hub | bridge | run here; they failed only because their port (8686, 8787, 3000) was taken by another program on the test machine |
| video/quad, video/bounce | by design | take video files on the command line |

Fixed in this pass: pocket-hero (PocketJS host tags), ui/forms (an `export function` inside a template), canvas/sketch (zinc:canvas on screen), n3ds-platformer (`"assets": dir`),
music and music-tree (UDP, Sonos over the bridge), notify-relay (`autostart.get`), hardware (missing sensors), platformer (built assets), hero (its video from `/__project/`).
