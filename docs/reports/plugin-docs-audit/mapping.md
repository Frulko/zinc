# zinc:mapping audit (score 4/5)

## What it is
GPU video mapping for artists: layers (video, image, test card) warped onto surfaces by corner pins or meshes, masked, edge-blended, colour-corrected, controlled over OSC and a web editor.

## Targets and status
- plugin.json: macos, rpi1, linux (native `mapping.host.cpp`, `mapping.rpi1.cpp`). Needs `"display": "gl"`.
- Doc table: macos verified; Pi 3B+/4/5 builds, not run on hardware; Pi 1/Zero no; linux "not supported" (while the manifest lists linux).
- Test: `tests/t1/mapper.sh`.

## What the docs have
- [x] overview, [x] quick start, [x] support matrix, [x] coordinates, [x] full OSC address table, [x] rendering notes, [x] companion with security notes, [x] "Not done"
- [x] runnable `examples/video/mapper` (README with run commands, `docs/img/video-mapper.png`), companion (`server.mjs`, `demo.mjs`)
- [ ] API table (only a one-line list), [ ] more screenshots (warp, mesh, masks, edge blend), [ ] tutorial, [ ] hardware note for projectors

## What is missing
1. Screenshots of the editor and of the output: companion in a browser with a warped layer, mesh, mask and edge blend (2 projectors). (owner)
2. A tutorial "Map a video onto a building facade" in 7 steps: run the mapper, open the companion, drag four corners, mesh-tune, mask a window, save `mapping.json`, reload.
3. A tutorial "Two projectors, one wall" (edge blend with gamma 2.2). (hardware)
4. A function table for `command`, `addLayer`, `set`, `setImage`, `layerCount`, `toJson`, `fromJson`, `save`, `load`, `listen` with argument types and return values (booleans).
5. Pi run on real hardware, with a measured fps note for 720p/1080p. (hardware)
6. Mention OSC clients (Chataigne screenshot exists: `docs/img/chataigne.png`; TouchOSC) as a control recipe.
7. Linux row: reconcile manifest vs doc.

## Wrong or stale
- Manifest lists `linux`, doc says linux not supported; one of them is wrong.
- No name or signature contradiction with `index.ts` found.

## Suggested pages
Overview; Quick start; API reference (generated); OSC address space (table, generated from the doc's spec if possible); Coordinates; Tutorial: facade mapping; Tutorial: two projectors with edge blend; Companion editor; Rendering notes; Example: mapper; Raspberry Pi setup.
