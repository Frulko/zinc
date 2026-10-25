---
id: ZN-842
title: 'Hub server: a Zinc server that distributes signed apps'
status: Backlog
assignee: []
created_date: '2026-10-25 19:26'
labels:
  - packaging
  - size-L
milestone: m-19
dependencies: []
ordinal: 551460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hub step 2 (owner 2026-10-25). app/hub-server: a headless Zinc program (owner: a Zinc server, not Node), zinc:net's HTTP server, URL and port configurable, run with zinc run on a Mac, a Pi or any Linux box; the signing primitives the engine already has (Ed25519 of zinc sign, SHA-256) exposed to it where missing. Stores what zinc publish makes (the .zapp and the Ed25519-signed channel manifest of the app's own key) and serves a catalog signed with the server's Ed25519 key. Pairing: the server prints a short code, a device that enters it gets the server's public key and its own access token (private apps). A small admin page lists apps, versions and paired devices and retracts a version. The server is not trusted for the payload: devices check the app's signature, the catalog's signature, the SHA-256 and refuse older versions. docs/reports/zinc-app-ota-updates.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the server serves GET /catalog.json (signed), the manifests and the .zapp of every app and channel, only to a paired device token
- [ ] #2 POST /publish with the publisher token stores a new version; zinc publish --hub <url> --token <t> sends it
- [ ] #3 pairing by code gives a device token and the server key; the admin page lists apps, versions and devices and retracts a version
- [ ] #4 a test starts the server, publishes two versions, pairs a client, verifies the catalog and an app signature, and refuses a tampered .zapp, an older version and a wrong token
<!-- AC:END -->
