# zinc:pdf

PDF documents on [PDFium](https://pdfium.googlesource.com/pdfium/) (BSD-3-Clause / Apache-2.0), the engine of Chrome's PDF viewer:
open a file, read its pages' sizes, draw a page (or the part of it on screen) into a runtime image at any scale, add ink annotations,
save a copy. MuPDF was not taken: it is AGPL.

```ts
import * as pdf from 'zinc:pdf';
import { drawImage } from 'zinc:gfx';

const doc = pdf.open('/home/root/zinc-docs/paper.pdf');      // throws: not a PDF, wrong password, PDFium missing
const size = doc.pageSize(0);                                  // points (1/72 in)
const s = 1620 / size.width;                                   // pixels a point: the page as wide as the screen
let img = doc.render(0, s, 0, 0, 1620, 2100);                  // the rectangle (0, 0, 1620, 2100) of the page at scale s
img = doc.render(1, s, 0, 0, 1620, 2100, img);                 // next page into the same image
drawImage(img, 0, 0, 1620, 2100, 255, 0);
doc.addInk(0, [50, 100, 200, 150, 350, 100], 0x000000, 1.5);  // points from the page's top left, colour, width in points
doc.save('/home/root/zinc-docs/paper.annotated.pdf');          // the annotations are real /Ink annotations: any viewer shows them
doc.close();
```

- **Coordinates**: page units are points with the origin at the top left of the page as it is shown (its `/Rotate` and crop box
  applied); `addInk` maps them to the PDF's own space through PDFium (`FPDF_DeviceToPage`).
- **Rendering** draws white, then the page and its annotations (`FPDF_ANNOT`), straight into the runtime image's pixels (PDFium's BGRx
  is the image's 0x00RRGGBB). Draw only what is on screen: a zoomed page is the visible rectangle at a larger scale, never a huge image.
- **Threads and lifetimes**: PDFium is not thread-safe; every call comes from the program's thread. `FPDF_InitLibrary` runs once, at the
  first `open`; a page is loaded for the length of one call; `close()` frees the document. `pdf.status()` is `''` when PDFium is there.

## The library

PDFium is not built here (it needs Chromium's gn and depot_tools): the plugin uses the prebuilt libraries of
[bblanchon/pdfium-binaries](https://github.com/bblanchon/pdfium-binaries), pinned in `vendor/PIN` (release `chromium/8100`, SHA-256 of
each archive). `vendor/fetch [macos-arm64|linux-arm64]` downloads and checks them into `vendor/pdfium/<platform>/` (not committed);
`vendor/include/` keeps the four public headers the plugin calls. The native code (`native/pdf.host.cpp`) loads the library with
`dlopen` at the first `open`, so the plugin compiles anywhere, cross builds included, and looks in order at `$ZINC_PDFIUM`,
`libpdfium.so`/`.dylib` on the loader's path, `<zinc>/../lib/`, and `plugins/pdf/vendor/pdfium/<platform>/lib/` of `$ZINC_ROOT`, of
the checkout and of a package's `share/zinc`.

The Linux arm64 library needs GLIBC_2.17 at most and only libc, libm, libpthread, libgcc_s (libc++ is inside): it loads on a reMarkable
(OS 3.x, glibc 2.35 or 2.39). `tools/rmpp-engine` puts it in the tablet bundle's `lib/`. Other platforms (x86_64, Windows, armv7) have
archives of the same release: add their lines to `vendor/PIN` and `vendor/fetch`.

Test: `tests/t0/pdf.sh`, over `plugins/pdf/tests/sample.pdf` (three pages, written by `tests/make-sample.py`).
