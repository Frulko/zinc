---
id: ZN-842
title: 'Hub server: a Zinc server that distributes signed apps'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 19:26'
updated_date: '2026-10-25 19:49'
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
- [x] #1 the server serves GET /catalog.json (signed), the manifests and the .zapp of every app and channel, only to a paired device token
- [x] #2 POST /publish with the publisher token stores a new version; zinc publish --hub <url> --token <t> sends it
- [x] #3 pairing by code gives a device token and the server key; the admin page lists apps, versions and devices and retracts a version
- [x] #4 a test starts the server, publishes two versions, pairs a client, verifies the catalog and an app signature, and refuses a tampered .zapp, an older version and a wrong token
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built app/hub-server (headless Zinc, zinc:net serveAsync): zinc run app/hub-server -- --port 8787 --data <dir>. Data dir: hub.key (Ed25519 seed, 600), publisher.token (600), devices.txt (SHA-256 of each device token, name, time), apps/<id>/key (app key, recorded by its first publish: trust on first publish under the publisher token), apps/<id>/<file>.zapp, apps/<id>/<channel>/<version>.manifest and <version>.retracted.
Routes: POST /pair (form code, name; 6-digit code printed at start, new code after each pairing and after 5 wrong tries) -> {serverKey, token}; GET /catalog.json and /catalog.json.sig (detached Ed25519 hex by the hub key, made together and cached until a publish or retract; checkable with zinc verify --key); GET /apps/<id>/<channel>.manifest and /apps/<id>/<file>.zapp (device token, only a package a current unretracted manifest names); POST /publish (publisher token; body = signed manifest + .zapp, X-Manifest-Length, X-App-Key; checks the app signature, the SHA-256, newer than every version of the channel incl. retracted, no same-name file with other content); GET /admin?token= (apps, versions, devices, pairing code) and POST /admin/retract.
zinc publish --hub <url> --token <t>: publishes as before, then POSTs through curl (token in a 600 header file, not argv).
Engine: Ed25519 for zinc:subtle (importKey raw/raw-private seed, generateKeyPair, sign, verify) as ops ed25519-public/sign/verify of zn::crypto::run, in src/host/ed25519.cpp: Monocypher 4.0.2 (already vendored) compiled in its own C++ namespace (MONOCYPHER_CPP_NAMESPACE), so the host does not depend on zn_tc and no link line changes; works without TLS. RFC 8032 test 2 added to tests/golden/host/subtle.ts. zinc:net: Request.rawBody, the request body byte for byte (the event payload; body stays UTF-8-repaired, which broke binary uploads); server request body cap 1 MiB -> 64 MiB.
Tests: tests/run --only hub_server, crypto, net, host, modules, app_update, update_sign: all PASS. hub_server ~2 s.
Later: per-server body cap option in zinc:net (64 MiB x 32 connections is the ceiling); zinc update-app/device client that sends the device token and checks catalog.json.sig (hub step 3); the hub on --engine quickjs (raw byte strings unproven there); a device can be forgotten from the admin page; HTTPS (serveAsync tls option) for a hub outside the LAN; cross-platform pass: run the hub on a Pi / reMarkable.
<!-- SECTION:NOTES:END -->
