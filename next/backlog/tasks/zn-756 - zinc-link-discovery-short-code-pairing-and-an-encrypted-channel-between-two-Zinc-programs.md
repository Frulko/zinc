---
id: ZN-756
title: >-
  zinc:link: discovery, short-code pairing and an encrypted channel between two
  Zinc programs
status: Backlog
assignee: []
created_date: '2026-10-17 08:46'
labels:
  - mobile
  - net
  - size-L
milestone: m-26
dependencies: []
ordinal: 196150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17 (notification relay, "imagine un plugin"): a plugin for two Zinc programs to find each other, pair once with a code and talk over an authenticated, encrypted channel, on the model of zinc agent (mDNS _zinclink._tcp, TLS EC J-PAKE with the code, pinned keys after), on macOS and Android first (Linux, iOS later), with an address typed by hand when the network blocks discovery and a WebRTC relay across networks (zinc:webrtc) as the next step. Design and API: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two desktop programs advertise, browse, pair with the code, reconnect without it after a restart, exchange JSON and bytes (a T0/T1 test on loopback)
- [ ] #2 the Nexus 7 advertises and the Mac finds it, pairs and exchanges messages (or the address typed by hand when discovery is blocked)
- [ ] #3 a decision record: discovery on Android (MulticastLock or NsdManager), the key storage, what WebRTC adds
<!-- AC:END -->
