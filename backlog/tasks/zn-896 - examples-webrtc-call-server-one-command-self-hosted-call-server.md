---
id: ZN-896
title: 'examples/webrtc-call/server: one-command self-hosted call server'
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-895
ordinal: 590460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Zinc service app that sets up, supervises and administers Galène: setup --domain writes data/config.json (admin user, random secret, 0600), groups/<room>.json (vp8+opus, max-clients, autokick), ice-servers.json (optional coturn with hmac-sha1), a static/ overlay with join.html; starts galene with -http :443 -turn :1194 -udp-range <one port> through zinc:process and restarts it on exit; link <room> [--hours] creates a token through /galene-api/v0/.groups/<room>/.tokens/ and prints the URL and a QR code (zinc:qrcode); prints the systemd unit (CAP_NET_BIND_SERVICE) and firewall lines; a TURN egress rule limited to the server's own addresses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 setup then run on the Mac serves a working group: Galène's web client in headless Chrome joins with a printed link
- [ ] #2 link creates an expiring token; an expired or revoked token is refused
- [ ] #3 Galène is restarted when it dies; the call server stops it on exit (no process left)
- [ ] #4 README: Pi and VPS deploy, ports, systemd, coturn for TURN over TLS 443
<!-- AC:END -->
