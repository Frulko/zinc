# Zinc PDF

PDFs on the reMarkable Paper Pro, with pen notes. Black on white, large targets, page turns instead of scrolling: one e-ink refresh
per gesture. The pages are drawn by PDFium (`zinc:pdf`, `plugins/pdf`).

- **Documents**: the PDFs of `~/zinc-docs` (`/home/root/zinc-docs` on the tablet; `ZINC_PDF_DOCS` changes it). **Rescan** after copying
  new ones. The app opens again on the document, page and zoom you left.
- **Turning pages**: swipe up or left for the next page, down or right for the previous one; **Previous** and **Next**; the strip at
  the bottom is the whole document: put a finger on it and lift it on the page you want. On a desktop the wheel turns pages.
- **Zoom**: pinch with two fingers (the picture scales while the fingers move, then PDFium draws it sharp), or **−** and **+**; a swipe
  moves a zoomed page, **Next** goes one screen down it, then to the next page. Ctrl+wheel on a desktop.
- **Pen**: writes over the page. The ink is kept in page points, so it stays in place at any zoom, and saved per page beside the
  document, in `<name>.pdf.ink/p<page>.json` (zinc:ink strokes), on every page change, Documents, Accueil and Quitter. The Marker's
  eraser end erases, and so does the pen with **Eraser** on; **Undo** takes back the last stroke or erasure. On a desktop, **Pen** makes
  the mouse write.
- **Export**: writes `<name>.annotated.pdf` beside the document: a copy of the PDF with every page's notes as ink annotations, which
  any PDF viewer shows (and this app too: it appears in Documents).
- **Refresh**: a full refresh of the display, to clear the ghosting.

## Run it

```sh
plugins/pdf/vendor/fetch                  # once: PDFium for this machine (vendor/PIN)
zinc run app/pdf                          # the e-ink emulator at 1620x2160; PDFs in ~/zinc-docs
```

On the tablet (the engine of ZN-841 in `/home/root/zinc`, built by `tools/rmpp-engine` with `lib/libpdfium.so`), through the hub once the
app is published (`zinc publish app/pdf ...`, as `app/web/README.md` says), or by hand: `zinc pack app/pdf -o pdf.zapp`,
`scp pdf.zapp root@10.11.99.1:/home/root/zinc-apps/`, then on the tablet `/home/root/zinc/bin/zinc-tile /home/root/zinc-apps/pdf.zapp`
and reload AppLoad. Copy documents with `scp *.pdf root@10.11.99.1:/home/root/zinc-docs/`.

## Files

| Path | What |
| --- | --- |
| `~/zinc-docs/*.pdf` | the library |
| `~/zinc-docs/<name>.pdf.ink/p<n>.json` | the notes of page n, in points from the page's top left |
| `~/zinc-docs/<name>.annotated.pdf` | the export |
| zinc:storage `pdf:last`, `pdf:pos:<path>` | the document opened last, and each document's page, zoom and position |

`src/`: `main.tsx` (the shell), `state.ts` (the actions: library, open, turn, zoom, pan, ink, export), `pageview.ts` (the page view's
drawing and gestures, the page strip), `constants.ts`, `script.ts` (`ZINC_PDF_SCRIPT`, the test mode of `tests/t1/pdf_reader.sh`).
`icon.svg` (zinc.json `app.icon`, the tile's icon) is Lucide's `file-text` (lucide-static 1.47.0, ISC licence, https://lucide.dev/license).

## Credits

PDF pages are drawn by [PDFium](https://pdfium.googlesource.com/pdfium/) (Google, BSD-3-Clause and Apache 2.0), in
the prebuilt libraries of [pdfium-binaries](https://github.com/bblanchon/pdfium-binaries) (Benoît Blanchon). The other
projects Zinc uses on the reMarkable are listed in
[Credits and inspiration](../../docs/targets/remarkable-paper-pro.md#credits-and-inspiration).
