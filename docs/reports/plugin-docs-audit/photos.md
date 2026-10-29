# zinc:photos documentation audit

## What it is
Read and save pictures in the phone or Mac photo library (PhotoKit): albums, newest-first assets, thumbnails and full pictures as images, saving to an album. A folder of images stands in anywhere else.

## Targets and status
plugin.json: macos, ios (PhotoKit), linux and windows (fake library only). Doc: ios/macos PhotoKit; others fake folder via `ZINC_FAKE_PHOTOS`. No claim of real-device verification either way.

## What the docs have
- [x] overview, [x] example, [x] API table (complete vs exports incl. `presentLimitedLibraryPicker`), [x] backends, [x] fake library, [x] permissions text and plist keys, [x] test `photos` named
- [x] runnable example `examples/photos` with README
- [ ] screenshots/GIF (none in docs/img or examples/photos)
- [ ] tutorial; [ ] troubleshooting; [ ] "verified where" statement (no verified/untested line at all)

## What is missing (priority)
1. Screenshot of `examples/photos` on the fake library: `ZINC_FAKE_PHOTOS=<folder> ZINC_SHOT=photos.png zinc run examples/photos`, plus a limited-access screenshot (`ZINC_FAKE_PHOTOS_ACCESS=limited`).
2. A "Verified here" section like camera.md: what ran on a real Mac library, what only on the fake one, iOS simulator status. (owner/hardware for a real library)
3. Tutorial "A photo grid in 30 lines": permission, albums, paged `assets`, thumbnails, free images with `gfx.destroyImage`, tied to a 20-line quick start with the fake folder (so it runs anywhere).
4. Memory note: how many thumbnails to keep, destroy on scroll, iCloud downloads (slow first load).
5. Troubleshooting: denied/limited flows, missing usage string makes the plugin answer `denied`, Zinc Go uses its own usage texts, macOS Settings path.
6. Document `Asset.location`/`date` use in a recipe (map pin from photos with zinc:map).
7. Saving recipe: `camera.encodePng()` then `saveImage` (link camera.md).

## Wrong or stale
- None found against `index.ts`. Doc table says linux/windows use the fake library, consistent with plugin.json. Only doubt: example `savePixels(rgba, 256, 256, 'Zinc')` uses an undefined `rgba` (fine as a sketch, say so).

## Suggested pages
- Photos: overview and quick start (works with a fake folder)
- Photos: tutorial, a photo grid
- Photos: API reference (generated)
- Photos: permissions, limited access and Info.plist keys
- Photos: the fake library and testing
- Photos: saving pictures (camera to library)
- Photos: examples (photos app with screenshots)
- Photos: troubleshooting
