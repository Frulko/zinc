# imageio plugin (`zinc:imageio`)

Image files on disk, for a photo manager, a file browser or an image viewer: what a picture is (its size as shown, orientation, EXIF)
from its header alone, and thumbnails and downscaled pictures as runtime images of `zinc:gfx`, decoded by worker threads and turned
upright. Sources: `plugins/imageio/`. For the phone's or the Mac's photo library (PhotoKit), see [zinc:photos](photos.md).

```ts
import { info, thumbnail, load, frames, cancel } from 'zinc:imageio';
import { destroyImage } from 'zinc:gfx';

const i = info('/Users/me/Pictures/IMG_0042.HEIC');   // null when it is not an image
// { width: 3024, height: 4032, orientation: 6, format: 'heic', date: '2024-05-01T12:34:56', make: 'Apple', model: 'iPhone 15',
//   lens: '...', iso: 50, exposureTime: 0.008, fNumber: 1.6, focalLength: 6.1, location: { latitude: 48.85, longitude: 2.29 }, ... }
const t = await thumbnail(path, 256);   // a runtime image: <Image image={t} />, gfx.drawImage; destroyImage(t) when done
const big = await load(path, 1920, 1080);   // fitted in the box, for a viewer
const gif = await frames(path, 160, 160);   // { images, delays (ms), width, height }: play them, destroy them when hidden
cancel(path);                               // a grid cell scrolled away: its waiting request is dropped
```

| API | |
|---|---|
| `info(path): ImageInfo \| null` | Synchronous, header only (nothing is decoded). `width`, `height` as shown (orientation 5 to 8 swap them), `pixelWidth`, `pixelHeight` as stored, `orientation` (EXIF, 1 to 8), `format` (`jpeg` `png` `heic` `webp` `gif` `tiff` `bmp` `avif` `raw`, or the system's type name), `fileSize`, `date` (when it was taken, ISO 8601 in the camera's local time, `''` when unknown), `make`, `model`, `lens`, `iso`, `exposureTime` (seconds), `fNumber`, `focalLength` (mm), `location` (`{ latitude, longitude }` or `null`). Strings are `''` and numbers `0` when the file does not say. |
| `thumbnail(path, maxSide = 256): Promise<number>` | The picture fitted in a square of `maxSide`, upright, as a new runtime image. Kept in the thumbnail cache. |
| `load(path, maxWidth = 0, maxHeight = 0): Promise<number>` | The picture fitted in the box, never enlarged, upright; `0, 0` is the whole picture, 4096 pixels at most. Not cached. |
| `frames(path, maxWidth = 0, maxHeight = 0, most = 300): Promise<Frames>` | An animation's frames, each whole (its disposal done) and fitted in the box, as runtime images of one size: `{ images, delays, width, height }`, delays in ms (under 20 ms counts as 100 ms, as browsers do). Animated GIF everywhere; APNG and animated WebP with ImageIO (macOS, iOS), their first frame elsewhere; a still picture is one frame. Every frame is kept: decode at the size shown, while it is shown, and destroy the images after. |
| `cancel(path)` | Drops the requests for `path` that have not started; they reject with `Error('cancelled')`. |
| `thumbnailCacheDir()`, `setCacheDir(dir)` | Where thumbnails are kept: `<app data>/cache/thumbnails` (`zinc:sys` `dataDir()`); `''` turns the cache off. |

**Off the program's thread.** Up to four worker threads (fewer on a smaller machine) decode, downscale and turn the pictures; the newest
request is taken first, so the cells a grid has just scrolled to come before the ones it left. The program's thread only copies a finished
thumbnail into its runtime image. Measured on the development Mac (M1 Pro): 24 thumbnails of 24 MP JPEGs in 0.54 s with ImageIO, the
program's timers never late by more than 4 ms; from the cache, 10 ms for all 24.

**The thumbnail cache.** One file per picture and size, named by a hash of the path, the file's size and its modification time (to the
nanosecond): a picture edited or replaced gets a new thumbnail, and a second run shows the grid at once. JPEG (PNG when the picture has
transparency), written to a temporary name and renamed, so two runs never read half a file. Nothing removes old entries yet: delete the
folder to reclaim it.

**Formats.** macOS and iOS read with ImageIO: JPEG, PNG, HEIC/HEIF, AVIF, WebP, GIF, TIFF, BMP and the camera RAW formats the system knows,
decoding only the resolution asked for (a 50 MP picture costs what its thumbnail does), in sRGB. Elsewhere the portable reader: stb_image
(PNG, JPEG, GIF, BMP), libwebp (the copy zinc links) and [TinyEXIF](https://github.com/cdcseacave/TinyEXIF) 1.2.0 for the metadata
(vendored in `plugins/imageio/vendor`, MIT): it decodes the whole picture, then downscales it (stb_image_resize2, in linear light).

**Deterministic runs.** With `ZINC_DETERMINISTIC=1` the portable reader goes first (the same pixels on every machine; ImageIO still reads
what it cannot, such as HEIC), and every requested picture is ready at the first poll after the request, so the frame a thumbnail appears
on does not depend on the machine. `ZINC_IMAGEIO=system` or `portable` picks the first reader in any run.

**Every engine.** The native side never calls into the program: `index.ts` polls the finished jobs on a timer while some are waiting, so
the same code runs on the interpreter, AOT and QuickJS (`zinc run --engine quickjs`).

Tests: `tests/t1/imageio.sh` (fixtures in `tests/data/imageio`: a JPEG stored on its side with EXIF and GPS, a PNG, a WebP turned over, a
HEIC, a text file) runs one session with the portable reader, with ImageIO and on QuickJS, checks the drawn pixels and the cache.

To move pictures, `zinc:fs` `copyFile` keeps the modification time (then `remove` the original; `rename` throws `EXDEV` across disks), and
`zinc:system/opener` `trash(path)` sends one to the system's trash.
