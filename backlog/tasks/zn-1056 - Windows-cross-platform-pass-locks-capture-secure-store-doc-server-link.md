---
id: ZN-1056
title: 'Windows cross-platform pass: locks, capture, secure store, doc server, link'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - windows
  - cross
  - size-M
  - parked
milestone: m-12
dependencies: []
ordinal: 1048000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Everything the Mac work left as a Windows check or backend (after ZN-714 gives a Windows build).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- mapper: zinc:link has no Windows target, so a Windows mapper or client neither announces nor browses (address and page code still work); add it with `src/net/dnssd.cpp` on Winsock.
- ZN-918: check that `zn_webp_dec` links in the AOT and export builds on Windows and the cross targets (`tests/t0/webp_bytes.sh` runs AOT on the Mac only).
- ZN-892/893: zinc:net server, WebSocket and ACME on Linux and Windows (net_limits, net_ws, net_acme with a Pebble for that OS).
- ZN-875: zinc:screen-capture/picker and app icons on the Linux and Windows backends.
- ZN-874: screen capture on Linux (PipeWire portal) and Windows (Windows.Graphics.Capture) behind plugins/screen-capture/native/backend.h.
- ZN-856: `zinc doc --serve` on Windows (the Winsock path is built, never run) and on Linux.
- ZN-825/ZN-826: verify the C offscreen host/linker on Windows, then a real iOS SwiftUI/UIView lifecycle and input integration; only macOS native windows were proved.
- Inspector discovery folder on Windows: uses `HOME`; needs `USERPROFILE`.
- ZN-876: zinc:secure-store backends for Linux (libsecret) and Windows (Credential Manager); until then the non-Apple branch of securestore.abi.c refuses — run tests/t0/secure_store.sh's no-keychain path (isAvailableAsync false, calls reject) on Linux and Windows.
- ZN-996: lock the app update trial on Windows (LockFileEx); there, a second launch still rolls a running trial back.
- ZN-998: FileLock has no Windows implementation (LockFileEx): concurrent tool installs and plugin builds still race there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 FileLock and the app update trial use LockFileEx; zinc:secure-store uses Credential Manager; the Inspector discovery folder uses USERPROFILE
- [ ] #2 zinc:link announces and browses through Winsock dnssd; zinc doc --serve, zinc:net server, WebSocket and ACME run on Windows
- [ ] #3 Screen capture through Windows.Graphics.Capture; zn_webp_dec links in AOT and export builds; the C offscreen host/linker runs
- [ ] #4 Each result recorded; failures become fixes in the same task
<!-- AC:END -->
