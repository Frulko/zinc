---
id: ZN-844
title: 'reMarkable content apps: TRMNL-style dashboard, Markdown and Notion, PDF'
status: Backlog
assignee: []
created_date: '2026-10-25 19:27'
updated_date: '2026-10-25 19:28'
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
