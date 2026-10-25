---
id: ZN-844
title: 'reMarkable content apps: TRMNL-style dashboard, Markdown and Notion, PDF'
status: In Progress
assignee: []
created_date: '2026-10-25 19:27'
updated_date: '2026-10-25 22:34'
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
- [ ] #1 the dashboard app shows a server-rendered page and refreshes it on a timer
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
<!-- SECTION:NOTES:END -->
