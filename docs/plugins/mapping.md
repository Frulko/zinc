# zinc:mapping

Video mapping on the GPU: layers of video, images or generated content, each warped onto a physical surface (corner
pin, mesh warp), masked, edge-blended and colour-corrected in shaders, and controlled over OSC. Plugin:
`plugins/mapping/` (module `zinc:mapping`). It draws through [display-gl](display-gl.md), so the project needs
`"display": "gl"`. Example: `examples/video/mapper/` with its editor.

```ts
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import { Player, EXTENSIONS } from 'zinc:video';

const p = new Player(640, 360);
p.addFolder('media', EXTENSIONS);
p.play();
if (!mapping.load('mapping.json')) {                   // previous setup, else a fresh one
  const l = mapping.addLayer('pattern', 'facade');     // test card until the video has a frame
  mapping.set(l, 'corners', [0.1, 0.1, 0.9, 0.05, 0.95, 0.9, 0.05, 0.95]);
}
mapping.listen(9000);                                  // OSC server: the whole address space below
gfx.onFrame(() => { if (p.image >= 0) mapping.setImage(0, p.image); gfx.clear(0); });
```

API: `command(address, numbers, strings)`, `addLayer(source, name)`, `set(layer, key, numbers)`,
`setImage(layer, imageId)`, `layerCount()`, `toJson()`, `layerJson(layer)`, `info()`, `playsMedia()`, `fromJson(json)`,
`save(path)`, `load(path)`, `listen(port)`, `isFileName(name)`.

## Support matrix

| target | status | notes |
|---|---|---|
| macos | supported, verified | driven over OSC and through the editor, screenshots before/after (warp, masks, colour, blend, video layer, save/load) |
| android | supported, verified on Android 4.4 (RK3128, Mali-400) with the patch of `docs/reports/hardware/toumei-c800-api19.sh` | plays `/layer/<n>/media` itself (`MediaPlayer` into a texture: hardware decoding, sound); newer devices not tried |
| rpi1 on Pi 4 / 5 (32-bit OS) | builds in docker; **not run on hardware** | GLES 2 on Mesa v3d; 1080p output with a few layers is the expected sweet spot |
| rpi1 on Pi 3B+ | builds; **not run on hardware** | Mesa vc4 (VideoCore IV): keep to 720p/1080p30 and 2–3 layers; video uploads (`glTexSubImage2D` of every new frame) are the bottleneck, decode small (`new Player(640, 360)`) |
| rpi1 on Pi 1 / Zero | not supported | same GPU, but the ARMv6 CPU cannot feed texture uploads and decoding at the same time |
| linux | not supported | display-gl has no linux backend wired (the KMS one would work) |
| esp32, ps1, ps2, wasm | no | no GL |
| sim | accepted and ignored | commands return true, nothing is drawn |

## Coordinates

Everything is normalized. **Output**: (0,0) top-left to (1,1) bottom-right of the screen, whatever its resolution.
**Surface**: a layer's own unit square (the source image spans it); masks, crop and edge blend live there, so they
follow the warp. Per vertex: surface → mesh warp → corner pin → transform → output.

## OSC address space

UDP port given to `listen` (9000 in the example). Numbers may be `i`, `f` or `d`; strings `s`.
`<n>` is the layer index (0 = bottom, drawn first).

| address | arguments | effect |
|---|---|---|
| `/add` | `[source] [name]` | appends a layer (max 16); source `pattern` (test card), `solid`, `gradient`, `image` |
| `/remove` | `n` | deletes layer n |
| `/clear` | | deletes every layer |
| `/move` | `from to` | changes draw order |
| `/select` | `n` (−1: none) | shows the calibration grid on layer n |
| `/master` | 0..1 | over every layer's volume; the program keeps it, it is not saved with the setup |
| `/save`, `/load` | `[path]` (default `mapping.json`) | whole setup as JSON (`zinc:fs`) |
| `/sync` | `host port` | replies to host:port with `/state/info {json}` then `/state/layer i {json}` per layer |
| `/layer/<n>/media` | `file` (empty: none) | Android: plays a file of the media folder, with its sound. Elsewhere it is stored, and the program plays it (`playsMedia()`) |
| `/layer/<n>/fit` | `stretch`, `contain`, `cover`, `width`, `height` | how the media takes the layer's zone: `width` or `height` makes that side of the picture span the zone, the other one is cut or leaves bars |
| `/layer/<n>/frame` | `x y zoom` | what the fit shows: where the picture slides along each axis (`-1` start, `0` middle, `1` end) and a zoom (default `0 0 1`) |
| `/layer/<n>/card` | `id` (−1: none) | shows a runtime image instead of the source and the media, without changing them (a calibration card); not saved |
| `/layer/<n>/inputRect` | `x y w h` | the part of the source shown, 0..1 |
| `/layer/<n>/volume`, `loop` | 0..1, `0/1` | the media's sound and looping |
| `/layer/<n>/name` | `s` | |
| `/layer/<n>/visible` | `0/1` | |
| `/layer/<n>/source` | `kind [imageId]` | `image` shows `image` (any runtime image id: video player, camera, `gfx.createImage`; or a baked asset); a missing image shows the test card |
| `/layer/<n>/image` | `id` | image id used by `source image` |
| `/layer/<n>/color`, `color2` | `r g b` (0..1) | solid colour / gradient ends / test-card tint |
| `/layer/<n>/angle` | degrees | gradient direction (0: left→right, 90: top→bottom) |
| `/layer/<n>/corners` | `x0 y0 x1 y1 x2 y2 x3 y3` | corner pin, output space, order TL TR BR BL |
| `/layer/<n>/corner` | `i x y` | one corner |
| `/layer/<n>/mesh` | `cols rows [x y ...]` | mesh warp grid (2..16 each); without points the current warp is resampled |
| `/layer/<n>/point` | `i j x y` | one mesh control point (column i, row j), pre-corner-pin space |
| `/layer/<n>/meshreset` | | flat mesh |
| `/layer/<n>/position` | `x y` | offset in output units |
| `/layer/<n>/scale`, `rotation` | `s`, degrees | about the quad centre (aspect-corrected) |
| `/layer/<n>/opacity` | 0..1 | |
| `/layer/<n>/blend` | `normal`, `add`, `multiply`, `screen` | |
| `/layer/<n>/brightness` | −1..1 (0) | |
| `/layer/<n>/contrast`, `saturation` | (1) | |
| `/layer/<n>/hue` | degrees (0) | |
| `/layer/<n>/gamma` | (1) | > 1 brightens mid-tones |
| `/layer/<n>/gain` | `r g b` (1 1 1) | |
| `/layer/<n>/crop` | `x0 y0 x1 y1 [feather]` | surface-space rectangle, feathered inwards |
| `/layer/<n>/edge` | `left right top bottom [gamma]` | edge-blend ramp widths in surface units; gamma = projector gamma (2.2) |
| `/layer/<n>/source` | `pattern`, `solid`, `gradient`, `image` or `none` | what a layer shows without a media; `none` shows nothing, a selected layer then shows the test pattern under its frame |
| `/layer/<n>/inset` | `left right top bottom` | what each side hides outright, in surface units; its edge ramp starts after it: a hard cut then a gradient, to hide light that spills past a real edge |
| `/layer/<n>/edgedir` | `left right top bottom` | which way each side's `edge` gradient goes from the edge: `0` inside (default), `1` outside, past the surface, where it continues the source, `2` both; outside, `inset` brings the gradient's far end back toward the edge |
| `/layer/<n>/mask/<k>` | `feather invert x0 y0 x1 y1 ...` | polygon mask k (0..3, 3..32 points, surface space); invert 0 = show inside, 1 = hide inside; fewer than 3 points removes it |
| `/layer/<n>/maskimage` | `id` (−1: none) | multiplies by the image's luminance (updates with the image) |
| `/layer/<n>/grid` | `0/1` | calibration grid (mesh lines + border) |
| `/layer/<n>/reset` | | defaults, keeps the name |

The saved JSON uses the same vocabulary: `{"version":1,"layers":[{"corners":[...],"mask/0":[...],...}]}`, one key
per `/layer/<n>/<key>` command with its arguments, so a file can be edited by hand and replayed as OSC. Keys unknown
to an older version are ignored. Image ids are saved as numbers: they refer to the same player/image when the program
creates its images in the same order (the example does).

Incoming OSC datagrams are limited to 2048 bytes (`zinc:osc`), so a 16×16 mesh cannot be sent in one `/mesh`
message: send `/mesh cols rows` then `/point` per point.

## Rendering

- **Geometry**: the mesh is a Catmull-Rom surface through the control points (a cubic Bézier patch per cell whose
  handles come from the neighbours), tessellated on the CPU into 32×32 quads only when it changes. Corner pin
  (square→quad homography), transform and NDC are one 3×3 matrix applied in the vertex shader with `w`, so the GPU
  interpolates texture coordinates perspective-correctly.
- **Masks**: polygons (signed distance to the outline, smoothstep over the feather), crop, edge blending
  (`smoothstep^(1/gamma)`, so two overlapping projectors sum to constant light) and the image mask are rendered into
  a 512×512 mask texture per layer, only when one of them changes; drawing a layer then costs one texture fetch.
- **Colour**: gains, hue rotation, saturation, contrast and brightness are affine, combined on the CPU into one 4×4
  matrix, then gamma. Output is premultiplied; blend modes are GL blend functions.
- **Sources**: one program per source kind (`#define SRC`), compiled on first use. Runtime images are uploaded only
  when `image_version` changes.
- **UI**: the program's `zinc:gfx` frame is the overlay; `gfx.clear(0)` leaves it transparent (display-gl key colour).

## Editor

`examples/video/mapper/editor/` is a Zinc app, exported for the web and served by the mapper itself (`src/services/web.ts`), and it
runs natively as well (`zinc run examples/video/mapper/editor -- --app <url>`). Corner pins and deformation grid, masks, crop and edge
blend, colour and transform, media upload, columns, calibration, and a three.js view of the room. Its HTTP API needs the token printed
in the address (`?token=...`, header `x-zinc-token`), which also keeps other pages open in the same browser from driving the app:
`/state`, `/osc` (`[[address, ...args], ...]`), `/media`, `/media/<name>`, `/show`, `/scenes`, `/scenes/<name>` (`GET` its file, `POST` saves
the scene on now, or imports the file in its body, `DELETE`), `/scenes/<name>/load` and `/new-scene`. More commands exist on that route and
on OSC, handled by the program: `/column n`, `/cell column layer`, `/stop [layer]`, `/hud 0|1`, `/volume v`, `/mute 0|1`, `/card kind [target]`.

The app's OSC port has no authentication (UDP senders can be spoofed): `listen(port)` binds every interface unless
`ZINC_BIND=127.0.0.1` restricts it. Over OSC, `/save` and `/load` take a
plain file name in the working directory (`show.json`, no directories), and `/sync` answers at most 10 times per second.
`save(path)` / `load(path)` from the program itself accept any path.

## Not done

- Per-layer content transform; soft edge on the mesh border (use crop feather).
- Masks are 8-bit: very wide, very soft edge blends can band.
- Multiple outputs/projectors from one program; output colour calibration (LUT).
- Sound on a computer: the program's `zinc:video` players show the picture only.
- Several devices in sync: studied in `docs/reports/mapper-fleet-sync.md`, not built.
