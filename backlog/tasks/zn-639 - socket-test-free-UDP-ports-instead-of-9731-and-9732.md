---
id: ZN-639
title: 'socket test: free UDP ports instead of 9731 and 9732'
status: Done
assignee: []
created_date: '2026-10-10 17:01'
updated_date: '2026-11-09 04:28'
labels:
  - devtools
  - test
  - size-S
milestone: m-20
dependencies: []
ordinal: 10100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/golden/host/socket.ts binds the fixed UDP ports 9731 and 9732, so two trees (the loop and a parallel worktree) cannot run socket.sh at once; the TCP and inspector ports already come from tests/free_ports.py (ZN-633). (Follow-up of ZN-633, D63.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 socket.sh passes when started twice at the same time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-11-09). tests/golden/host/socket.ts binds its two UDP sockets on port 0 (ephemeral, chosen by the system, read back with getsockname as Datagram.port) and sends to a.port/b.port; the output prints whether the ports are set, differ and match instead of their numbers. Decision: port 0 rather than tests/free_ports.py: free_ports.py probes TCP ports and closes them before zinc rebinds (a race), while port 0 cannot collide and needs no env plumbing; the TCP listeners of socket.ts already use port 0, free_ports.py stays for the inspector port, which comes from the environment. Why the fixed ports were worse than a clean failure: zinc:socket binds UDP with UV_UDP_REUSEADDR, which libuv turns into SO_REUSEPORT on macOS and the BSDs, so two runs both bind 9731 and the datagrams go to one of them (https://gitlab.isc.org/isc-projects/bind9/-/issues/2137, https://www.baeldung.com/linux/socket-options-difference).
Proof: tests/run --only socket started twice at the same time: PASS, PASS.
<!-- SECTION:NOTES:END -->
