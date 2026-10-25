---
id: ZN-844
title: 'reMarkable content apps: TRMNL-style dashboard, Markdown and Notion, PDF'
status: In Progress
assignee: []
created_date: '2026-10-25 19:27'
updated_date: '2026-10-25 22:58'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies:
  - ZN-843
ordinal: 553460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hub step 4 (owner 2026-10-25), published through the hub. (1) A TRMNL-style dashboard: a server renders a page (HTML through headless Chrome, or a Zinc program headless) to an image at the tablet's size, dithered for its colour e-ink; the tablet fetches it on a timer and shows it. (2) Markdown reader with md4c (MIT), and Notion pages through its API (token), offline. (3) PDF reader with PDFium (BSD; MuPDF is AGPL) and an ink layer to annotate. Libraries vendored with licence and pinned version.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the dashboard app shows a server-rendered page and refreshes it on a timer
- [ ] #2 the Markdown app reads .md files and a Notion page
- [ ] #3 the PDF app opens a PDF, turns pages and saves ink annotations
- [ ] #4 each app is published through the hub and installed from it on the tablet
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Part 1, server-rendered pages (owner 2026-10-25: a web reader with a relay on the Mac): app/web-relay + app/web, test tests/t1/web_relay.sh (8.7 s, PASS).
- Rendering: headless Chrome over CDP from Zinc (zinc:process starts it with --remote-debugging-port=0, zinc:socket's WebSocket drives one tab), not a WKWebView capture in plugins/webview. Why: the relay is headless, with no window and no AppKit run loop, which WKWebView needs to load and draw; Chrome renders beyond the viewport (captureBeyondViewport), gives the link boxes by Runtime.evaluate, grey by Emulation.setEmulatedVisionDeficiency achromatopsia, and runs the same on Linux; tools/cdp.py already uses it. Reversible: the relay's HTTP stays if the renderer changes.
- Relay: GET /render (size + link map in tablet px, layout at w/dpr CSS px, dpr 2), GET /shot (PNG of any page rectangle at a zoom: page k at zoom 1, or the zoomed view), POST /export (page + the tablet's ink SVG as one PNG), Bearer token in <data>/relay.token (mode 600), http(s) only (file:// refused). Grey by default, colour by setting; no dithering (the panel's driver dithers).
- Tablet app: URL bar + keyboard, back, bookmarks, page turns (swipe, buttons, wheel), tap follows a link through the map (16 px slack), pinch (touchCount: display-rmpp already passes up to 10 fingers with ids from AppLoad and evdev, no driver work), +/- zoom, ink in page px saved per URL (ink/<sha256>.json + .txt), export PNG through the relay, Refresh = refreshDisplay(). Desktop: Pen toggle makes the mouse write, Ctrl+wheel zooms.
- Proven: relay PNG sizes (page 1620x1800, zoom 3 of 540x600 -> 1620x1800), link map (2 http links, mailto skipped), 401 without token, 502 on file://, the reader headless: open, next/prev, pen stroke saved in page px of page 2, link followed by a tap, back, export 1620x5962 PNG, bookmark, ink reloaded and drawn at zoom 2 (ZINC_SHOT checked by eye). zinc pack app/web OK; zinc publish to a local app/hub-server stored dev.zinc.web 0.1.0 (with a test key added to a copy of zinc.json: the real app needs the owner's update.publicKey).
- Not proven: pinch and the pen on the tablet itself (needs the tablet); a real site through the relay (the test is offline).
- Worked around in the relay: 'finally' is skipped after 'return await' in an async function (reproduced); a zinc:net Reply body cannot carry binary bytes (PNG written to a file and read back with fs.readText, as the hub does for .zapp); the HTTP server answers 408 after 10 s per connection, so the page-load wait is 7 s.

Part 1b, timed dashboard (TRMNL-style) in app/web, test tests/t1/web_relay.sh (13 s, PASS):
- Bookmarks, Dashboard: page 1 of a bookmarked page full screen under RemarkableBar, rendered again every 5/15/30/60 min (footer buttons; ZINC_WEB_DASH_MS for tests), a deadline checked every second so a new period or a late wake-up renders at once; tap = render now; Reader leaves the mode. The picture is swapped only when the PNG's SHA-256 changed, then refreshDisplay() (display-rmpp sends the full refresh once the partial of the new picture is out). Last update time at the bottom. Mode and period in web.conf (dash=, every=) with the rest of the app's state rather than zinc:storage: one file, one ZINC_WEB_DIR for tests; a reopen comes back to the dashboard.
- Widget: RemarkableApp widget 810x540, the top of the same picture scaled by 1/2, kept fresh by the same timer (the timer is module-level, the widget only draws).
- Relay: /shot&fresh=1 reloads the tab (Page.reload ignoreCache) in the running Chrome: no relaunch, no stale cached tab. No dithering (the driver dithers), grey.
- Timers while minimized/widget: no driver change needed: rm_present returns after rin::wait_input(8 ms) while hidden or as widget, so the loop and the program's timers keep running (read in plugins/display-rmpp/rmpp.cpp; not run on the tablet).
- Proven (headless): render 1 new picture, the page changes, render 2 (one period later) new picture, render 3 unchanged (no swap); web.conf keeps dash=; the widget draws (810x506 canvas, the top 1620x1012); ZINC_SHOT of the widget and of the dashboard checked by eye. zinc pack app/web OK.
- Not proven: on the tablet (timer while minimized/widget for real, the full refresh after the swap, tablet sleep: a suspended tablet does not run timers).
- Hub publication still needs the owner's key: zinc update-keygen > web.key; add "update": {"url": "<hub>", "publicKey": "<public= line of web.key>"} to app/web/zinc.json; zinc publish app/web --key "$(sed -n 's/^seed=//p' web.key)" --hub http://<hub>:8787 --token "$(cat hub-data/publisher.token)".
Part 3, PDF (app/pdf + plugins/pdf), tests/t0/pdf.sh (PASS, 1 s) and tests/t1/pdf_reader.sh (PASS, 3 s).
- Library: PDFium chromium/8100 prebuilt by bblanchon/pdfium-binaries (BSD-3/Apache; MuPDF is AGPL), not built here (gn/depot_tools). plugins/pdf/vendor/fetch downloads the pinned archives (vendor/PIN, SHA-256 each) into vendor/pdfium/<platform>/ (git-ignored, 7-8 MB libraries); the four public headers it calls are committed. linux-arm64 libpdfium.so: GLIBC_2.17 at most, NEEDED libc/libm/libpthread/libgcc_s/ld-linux only (libc++ inside): fits OS 3.x (glibc 2.35/2.39).
- Plugin: native code loads PDFium with dlopen at the first open (ZINC_PDFIUM, the loader's path = the bundle's lib/ through zinc-app's LD_LIBRARY_PATH, <exe>/../lib, vendor/pdfium of ZINC_ROOT / checkout / package), so it builds anywhere, cross builds of tools/package included, and nothing is linked into zinc. API: open(path, password), pageCount, pageSize, render(page, scale, x, y, w, h, img) straight into a runtime image (BGRx = 0x00RRGGBB), addInk (FPDFAnnot ink, page points mapped with FPDF_DeviceToPage), save (FPDF_SaveAsCopy), close; imageHash for tests. One thread, FPDF_InitLibrary once, a page loaded per call.
- App: library of ~/zinc-docs (ZINC_PDF_DOCS), page fitted and centred, swipe/Previous/Next, a page strip (jump on lift), pinch and +/- zoom (the visible rectangle rendered at the zoom, never a big image), pen ink per page in points in <name>.pdf.ink/p<n>.json, Eraser tool + the Marker's eraser end, Undo, Export = <name>.annotated.pdf with real /Ink annotations (checked: reopened by PDFium, drawn), last document/page/zoom in zinc:storage, RemarkableBar (Accueil/Quitter save first). zinc.json: rmpp, refresh_mode fast, dev.zinc.pdf, Lucide file-text icon. tools/rmpp-engine puts libpdfium.so in lib/ and its licences in PDFIUM-LICENSES/ (rmpp_engine test PASS).
- Proven headless on the Mac: page count/size, render hash, ink drawn and kept after save, error texts; the app: open, next/prev, last page, stroke on page 2 in page points (matches the logged scale and origin within 0.15 pt), export with /Ink, second run back on page 2 with its stroke, eraser removes it, undo restores it; ZINC_SHOT checked by eye (page 2 with the stroke, zoom 200%, library).
- Not proven: the tablet run (pen, pinch, PDFium speed on the A53), the linux-aarch64 cross build of the plugin by tools/package and libpdfium.so loading on the tablet.
Part 2, Markdown and Notion (app/markdown 'Zinc Read', plugins/markdown, test tests/t1/markdown_reader.sh, 6 s, PASS):
- Parser: md4c 0.6.0 (MIT, 2026-09-17) vendored in plugins/markdown/vendor/md4c with PIN (sha256 of the archive and each file; entity.c/h kept to decode &name;), as a plugin carries its C (sqlite, quirc). zinc:markdown: native/markdown.host.cpp writes md4c's callbacks as one record string (one boundary crossing per document), index.ts rebuilds the tree (Node: blocks, spans, texts; H level, LI task + taskOffset, TD align, LINK/IMG href); setTask(src, offset, done) flips the one byte of the mark. Dialect: CommonMark + GitHub tables, task lists, strikethrough, autolinks. docs/plugins/markdown.md.
- Reader: its own paged layout on a Canvas (layout.ts): lines on fixed pages of the view's size, a heading never ends a page; items are drawn with zinc:gfx text (sans, sans-bold, mono: no italic face, emphasis is drawn upright), tables with equal columns and alignment, code shaded, quotes barred, PNG pictures by relative path, link and task-box hit boxes. Why not zinc:ui views: exact pages and hit boxes for e-paper, and the ink in document pixels. Swipe/buttons/wheel turn pages, Contents jumps, links open .md (relative) and #anchors (GitHub slugs), Back, A-/A+ (26..54 px, keeps the place by fraction), ink per document and text size (ink/<sha256 of path@px>.json, document pixels), state in zinc:storage (read.doc, read.page, read.font: the store is shared by every app, so the keys are prefixed). RemarkableApp + RemarkableBar (Accueil saves the ink).
- Notion: Settings take the integration secret and a page link (read.conf mode 600, a 'pages' list Sync refreshes); GET /pages/{id} for the title, GET /blocks/{id}/children paginated (page_size 100, start_cursor), nested children up to depth 8, 429 retried after Retry-After; Notion-Version 2026-03-11 (the current version per developers.notion.com, checked through Context7). Converted: paragraph, heading_1..4, bulleted/numbered/to_do (nested), toggle, quote, callout, code, divider, table rows, equation, image (link), bookmark/embed/link_preview, child_page (named), column_list/column/synced_block (content). Saved as <docs>/notion/<slug>-<id8>.md. ZINC_NOTION_API points the test at a fake server (tests/t1/markdown_reader_notion.py).
- Proven (headless on the Mac, ZINC_SHOT checked by eye): library scan, 2 pages at 34 px, 7 headings with pages, contents jump to the Tasks page, a task ticked writes '[x]' and nothing else, link to other.md, back, #tasks anchor, pen stroke saved in document pixels, A+ gives 3 pages, state restored by zinc:storage; Notion: wrong token refused (401 message), page imported over two pages of children with nested list, table, code, to-dos, quote, numbered list, the 429 retried, read.conf mode 600, the .md opened and paged. zinc pack app/markdown -o markdown.zapp OK (12 files).
- Not proven: the tablet (no ssh here; the engine bundle needs the markdown plugin prebuilt: tools/rmpp-engine), a real Notion workspace over HTTPS from the tablet, the pen and swipes on the panel.
- Known, unrelated: tests/t0/plugin_manifest fails on develop already (microphone and webrtc list ios but plugins-table.txt does not); zinc:markdown was added to tests/data/plugins-added-table.txt.
- Pack: zinc pack app/markdown -o markdown.zapp; on the tablet /home/root/zinc/bin/zinc-tile /home/root/zinc-apps/markdown.zapp (or publish through the hub with the owner's update key).
<!-- SECTION:NOTES:END -->
