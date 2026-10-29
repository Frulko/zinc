# Audit: zinc:pdf (plugins/pdf)

## What it is
Open a PDF, draw its pages into runtime images at any scale, add pen (ink) annotations and save an annotated copy. Runs on PDFium.

## Targets and status
plugin.json: macos, linux only (no rmpp or windows entry, though the reMarkable bundle ships libpdfium via `tools/rmpp-engine`). Verified on the Mac: `tests/t0/pdf.sh`, `tests/t1/pdf_reader.sh`. Not run on the tablet. PDFium is a prebuilt, fetched by `plugins/pdf/vendor/fetch`, loaded with dlopen; desktop packages do not ship it (later.md ZN-844); x86_64, Windows, armv7 archives not pinned; highlighter /CA without /AP unchecked in Preview/Acrobat/Firefox.

## What the docs have
- [x] Overview, requirements/library setup, quick start, coordinates, threading, test (plugins/pdf/README.md, not under docs/)
- [ ] docs/plugins/pdf.md (no page in the docs site; docs/targets/remarkable-paper-pro.md has a paragraph)
- [ ] API reference complete: `pageCount`, `addInk` alpha, `imageHash`, `status()` partly
- [x] Example code; [x] runnable: `app/pdf`
- [ ] Screenshot/GIF; [ ] tutorial; [~] commands (`vendor/fetch macos-arm64`)
- [ ] Troubleshooting (PDFium missing, password errors, the loader search order is documented but not as a checklist)

## What is missing
1. Move/link README into docs/plugins/pdf.md (the doc comment of index.ts points at the README).
2. Screenshot of `app/pdf` showing a page with ink (ZINC_SHOT=... zinc run app/pdf) and of `plugins/pdf/tests/sample.pdf` rendered.
3. Complete API table: `open(path, password)`, `status()`, `imageHash`, `PdfDocument.pageCount/pageSize/render/addInk(alpha)/save/close`, `PageSize`.
4. Tutorial: "a PDF page on screen, then zoom": fetch PDFium, open, render visible rectangle, pan/zoom, annotate, save.
5. Troubleshooting: "PDFium missing" (`pdf.status()`), `vendor/fetch` per platform, `ZINC_PDFIUM`, password, huge-image warning.
6. Document that packaged desktop apps need the library shipped (current gap) and how.
7. Licence note (PDFium BSD-3/Apache-2.0, MuPDF rejected as AGPL) as a visible section.
8. Check annotated PDFs in Preview/Acrobat/Firefox (owner/hardware) and note result.
9. (hardware) 1620x2160 render time on the tablet.

## Wrong or stale
- README says the library loads "on a reMarkable"; plugin.json has no rmpp target (docs and manifest disagree on where it builds).
- `pdf.status()` shown only as one clause; no example.

## Suggested pages
PDF plugin overview; API reference (generated); Install PDFium (fetch, search path, packaging); Tutorial: view and annotate a PDF; Coordinates and scale; Example: Zinc PDF reader (app/pdf); Troubleshooting; Licences.
