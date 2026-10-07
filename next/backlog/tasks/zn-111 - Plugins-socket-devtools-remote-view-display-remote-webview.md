---
id: ZN-111
title: 'Plugins: socket, devtools, remote-view, display-remote, webview'
status: Done
assignee: []
created_date: '2026-10-06 22:57'
updated_date: '2026-10-07 10:32'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-099
  - ZN-088
ordinal: 40530
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Link the socket natives (TCP/UDP/Unix, DNS, WebSocket) on libuv (decision D7), devtools (CDP server for `zinc dev`), remote-view/display-remote (frame streaming), webview (platform WKWebView/WebKitGTK; the headless fallback sim stays for CI).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 socket.ts loopback conformance passes; devtools scripted CDP client test; remote pair test (frame hashes equal)
- [x] #2 examples/remote/viewer and webview/hybrid run (webview with the fallback in CI)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. Already covered by earlier tasks, verified now: tests/t0/socket.sh (socket loopback + scripted CDP client on devtools.tsx), tests/t1/display_drivers.sh (remote pair, frame hashes equal), examples remote/viewer and webview/hybrid OK (webview uses the headless sim fallback, WKWebView stays macOS-only). No code change.
<!-- SECTION:NOTES:END -->
