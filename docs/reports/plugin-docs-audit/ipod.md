# zinc:ipod documentation audit

## What it is
Manage a classic iPod (Classic, Nano, Mini, Video, Shuffle) from a Zinc app: find it, list and edit tracks, playlists and covers, add music safely, back up, and eject. Built on libgpod.

## Targets and status
plugin.json: macos, linux, rpi1; `requires: fs`; system libs glib, libplist, taglib, libusb. Doc: macOS developed with a real iPod and a fake folder; Linux/Pi packages listed but not proven (backlog ZN-851); Windows planned.

## What the docs have
- [x] overview, [x] example, [x] "What it does for you" table (detailed, accurate), [x] install per OS, [x] testing without an iPod (env vars), [x] licence note (LGPL relink)
- [x] runnable example `examples/ipod` (README, layout of src/) and tests `ipod`, `ipod_plugin`, `ipod_demo` (the page names only `tests/t0/ipod.sh`)
- [ ] API reference table (only prose in the feature table; no signatures, no `Device`/`Track`/`TrackInput`/`Snapshot`/`Check` field lists; only the types file has them)
- [ ] screenshots or GIF (none in `docs/img`, none in `examples/ipod`)
- [ ] step-by-step tutorial; [ ] troubleshooting; [ ] mount/unmount guide

## What is missing (priority)
1. Screenshots of `examples/ipod` (devices, overview with the drawn iPod, albums, songs, specs; light and dark): `IPOD_DEMO_MOUNT=<fake folder> ZINC_SHOT=... zinc run examples/ipod`; the test builds a fake iPod on a disk image, reuse it.
2. Mount/unmount (the owner asks for it in the demo): document and show the flow. `detect()` returns `usb` connections that are not mounted, and `eject(mountpoint)` exists, but there is **no mount call** in the API and the demo never calls `eject` (grep: none in `examples/ipod/src`). A `mount(device)` (`diskutil mount` / `udisksctl mount`) plus an Eject button and a "put it in disk mode" guide are missing. (owner) to confirm API shape.
3. API reference: one table per function with types and errors (`open(mountpoint, init, model, name)`, `add`/`addWith` result `AddResult`, `update` fields, progress phases of `onProgress`).
4. Tutorial "Copy an album to your iPod": detect, open, add with progress, cover, playlist, eject; safety story (restore points).
5. Troubleshooting: iPod not detected (not in disk mode, "Restore" mode, HFS+ read-only on Linux, Finder/Music app holding it), Nano 6G/7G checksum, FLAC refused, TagLib 1 no embedded cover.
6. Real-device status table: which models were tested on hardware (Classic only?) (hardware/owner), Linux and Pi proof.
7. Update `examples/ipod/README.md`: it says "never writes" and omits the music player (`services/player.ts` uses `zinc:audio`'s `openMusic`), photos and notes pages added in the latest commit.
8. Document ids/ratings conventions and `ZINC_IPOD_*` variables in one reference table.

## Wrong or stale
- `examples/ipod/README.md` describes only a read-only viewer; the demo now plays music (`zinc:audio`), shows photos and notes (commit e271fb59).
- Doc says `<Image image={...} />` for covers: correct (unlike camera.md). 
- Page cites only `tests/t0/ipod.sh`; `tests/t1/ipod_plugin.sh` and `ipod_demo.sh` exist.
- Targets sentence omits that Windows/Linux/Pi are unproven (backlog ZN-851).

## Suggested pages
- iPod: overview and quick start
- iPod: tutorial, put music on an iPod
- iPod: connecting, mounting and ejecting safely
- iPod: API reference (generated)
- iPod: tags, covers and formats
- iPod: backups, restore points and repair
- iPod: install and licences (LGPL)
- iPod: testing without an iPod
- iPod: examples (iPod viewer with screenshots)
- iPod: troubleshooting by model
