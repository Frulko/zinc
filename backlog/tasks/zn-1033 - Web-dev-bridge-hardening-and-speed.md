---
id: ZN-1033
title: Web dev bridge hardening and speed
status: Backlog
assignee: []
created_date: '2026-11-07 16:37'
labels:
  - web
  - security
  - size-M
milestone: m-14
dependencies: []
ordinal: 12600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `zinc dev` web bridge binds 0.0.0.0 (zinc:net `serve` has no `host` option), allows any 127.0.0.1 origin, serves dotfiles from `/__project/`, sends bytes as JSON number arrays (one `__host_fsByte` call per byte), keeps a page-local copy of a sqlite machine path, and logs `ERR_EMPTY_RESPONSE` once per reload. Add `host` to `serve`, bind 127.0.0.1, restrict CORS to the page origin, hide dotfiles, send base64, route sqlite through the bridge.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Web dev bridge: zinc:net `serve`/`serveAsync` take a `host` option so the bridge binds 127.0.0.1 instead of 0.0.0.0 (others are refused with 403 today, but the port is open on the LAN).
- Web dev bridge: `Access-Control-Allow-Origin` only the dev page's own origin (today any http://127.0.0.1:*); `/__project/` serves dotfiles such as `.env`.
- Web dev bridge: bytes travel as JSON number arrays and `__fs.load` reads one byte per `__host_fsByte` call (~4x the size in sync XHR); send base64 or binary.
- Web dev: zinc:sqlite keeps a page-local copy (localStorage) of a machine path under `zinc dev`; route it through the bridge in dev.
- Web dev: the old page's pending `/wait` logs `net::ERR_EMPTY_RESPONSE` once per reload (the bridge restarts before the page unloads).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the bridge listens on 127.0.0.1 only; a request from another origin gets 403
- [ ] #2 `/__project/.env` is refused
- [ ] #3 `__fs.load` of 4 MB takes one request in base64
- [ ] #4 `serve({host})` exists with a test
<!-- AC:END -->
