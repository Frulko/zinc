# photos plugin (`zinc:photos`)

The photo library of a phone or a Mac (PhotoKit): ask for access, list the albums and their assets newest first, load a thumbnail or a
whole picture as a runtime image of `zinc:gfx`, save a picture to the library or to an album. Sources: `plugins/photos/`. A complete app
on it: [`examples/photos`](../../examples/photos/README.md).

```ts
import { requestPermission, albums, assets, loadThumbnail, savePixels } from 'zinc:photos';

if (await requestPermission() === 'denied') throw new Error('no access to the photo library');
const list = await albums();                                // Album[] { id, title, kind: 'smart' | 'user', count }, Recents first
const page = await assets(list[0].id, { limit: 60 });       // Asset[] { id, date, width, height, mediaType, location }
const thumb = await loadThumbnail(page[0].id, 200);         // a runtime image: gfx.drawImage it, gfx.destroyImage it when done
await savePixels(rgba, 256, 256, 'Zinc');                   // a new asset in the album Zinc (made when missing)
```

| API | |
|---|---|
| `requestPermission(level?)` | `'readWrite'` (default) or `'addOnly'`; resolves `granted`, `limited` (iOS 14 and later: the person shared some pictures), `denied` or `undetermined` (no answer within a minute) |
| `permissionStatus(level?)` | the same, without asking |
| `presentLimitedLibraryPicker()` | iOS: the system's sheet where the person changes a limited selection; resolves `true` when it closes (list again then), `false` where there is none |
| `albums()` | Recents, the smart albums that hold something (Favorites, Screenshots, Selfies, Videos...), then the person's albums; rejects without access |
| `assets(albumId, { offset, limit })` | `''` for the whole library; newest first, 100 by default; `date` in ms since 1970, `mediaType` `image` `video` `audio` `unknown`, `location` `{ latitude, longitude }` or `null` |
| `loadImage(id, maxWidth?, maxHeight?)` | the picture fitted in the box, never enlarged; no box: the whole picture, 4096 pixels at most; a picture kept in iCloud is downloaded |
| `loadThumbnail(id, size?)` | `loadImage(id, size, size)`, 256 by default |
| `saveImage(bytes, album?)` | the bytes of a PNG or JPEG file (`camera.toPng()`, a download); resolves with the new asset's id |
| `savePixels(rgba, width, height, album?)` | RGBA pixels, saved as a PNG |

Saving to the library alone needs `addOnly`; an album needs `readWrite`. To let the person pick a few pictures without any permission,
`zinc:system/dialog`'s `open()` with image filters shows the system's photo picker on iOS (`PHPickerViewController`, out of process).

## Backends

| target | how |
|---|---|
| ios | PhotoKit (`native/photos.ios.mm`, the macOS file under `TARGET_OS_IPHONE`): `PHImageManager` for pictures (drawn upright off the main thread), `PHAssetCreationRequest` for saves, `presentLimitedLibraryPickerFromViewController` |
| macos | the same file: PhotoKit on macOS 11 and later; no limited level |
| linux, windows, `ZINC_FAKE_PHOTOS`, a deterministic run | the fake library below |

Loads and saves finish on PhotoKit's queues; the plugin fills a job there and the program's thread polls it (`index.ts`), so no callback
runs Zinc code.

**The fake library**: `ZINC_FAKE_PHOTOS=<folder>`. Its PNG and JPEG files are the assets (dated by their modification time), each
subfolder a user album, Recents all of them, Screenshots the files whose name starts with `Screenshot`. A save writes `IMG_0001.png` into
the folder or the album's subfolder. `ZINC_FAKE_PHOTOS_ACCESS=granted|limited|denied|undetermined` is the fake person's answer
(`undetermined` turns into `granted` at the first request). `tests/t1/photos.sh` runs a session on it.

## Permissions

`zinc.json` `"permissions": ["photos"]` (read and save) or `["photos-add"]` (save only). The iOS export writes `NSPhotoLibraryUsageDescription`
(for `photos`) and `NSPhotoLibraryAddUsageDescription`, with the text of `"permissionStrings": {"photos": "..."}`; the macOS export also
adds the entitlement `com.apple.security.personal-information.photos-library`. Without the usage text in the Info.plist the plugin answers
`denied` instead of asking (iOS would end the app). Zinc Go links the plugin; a project run in it uses Zinc Go's usage texts.
