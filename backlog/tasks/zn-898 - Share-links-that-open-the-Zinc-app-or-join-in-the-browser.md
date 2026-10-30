---
id: ZN-898
title: Share links that open the Zinc app or join in the browser
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
labels:
  - net
  - ui
  - size-S
milestone: m-28
dependencies:
  - ZN-896
  - ZN-897
ordinal: 592460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
join.html (static overlay) reads #<room>/<token> and offers Open in the Zinc app (zinc-call://host/room?token=) or Join in the browser (/group/<room>/?token=), remembering the choice; webrtc-call registers the zinc-call scheme (macOS Info.plist, iOS) and joins from an opened URL. Universal links (paid Apple team) and /.well-known through Galène go to later.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening a zinc-call:// URL starts or focuses webrtc-call and joins the room
- [ ] #2 join.html in headless Chrome forwards to Galène's client with the token
- [ ] #3 The link printed by the call server uses join.html; documented in the README
<!-- AC:END -->
