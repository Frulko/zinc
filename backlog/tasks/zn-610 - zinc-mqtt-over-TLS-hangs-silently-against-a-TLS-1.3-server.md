---
id: ZN-610
title: 'mqtt over TLS 1.3 and the handshake timeout test'
status: Backlog
assignee: []
created_date: '2026-10-10 07:27'
labels:
  - net
  - tls
  - bug
  - size-M
milestone: m-14
dependencies: []
priority: high
ordinal: 16900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Run mqtt_tls.ts against a TLS 1.3-only broker (node, as tls.sh does for wss); add a regression test that a stalled handshake errors within the connect timeout. Already there: commit 6a6b23b6 fix(tls): deliver TLS 1.3 records that arrive behind a session ticket (root cause of a silent hang after the handshake); tests/t0/tls.sh now has TLS 1.2 and 1.3 wss.

tests/t0/tls.sh, MQTT step, on 2026-10-10: tests/mqtt_broker.py under Homebrew's Python 3.14.8 / OpenSSL 4.0.3 negotiates TLS 1.3 (openssl s_client: TLSv1.3, TLS_AES_256_GCM_SHA384, peer CN=good). `zinc run tests/golden/host/mqtt_tls.ts` then prints nothing and is killed by the 30 s timeout. The same run against Apple's Python 3.9 broker (LibreSSL, TLS 1.2) prints `[ 'secure/a=hello over tls' ]` at once. The HTTPS part of tls.sh passes. Find where the TLS 1.3 handshake or the first records stall in zinc:net / zinc:mqtt (key share groups and HelloRetryRequest, post-handshake NewSessionTicket on a non-blocking socket, record reads); a TLS failure must end with an error, never a silent hang.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tls.sh passes against a broker that only speaks TLS 1.3
- [ ] #2 a TLS handshake that cannot complete fails with an error within the connect timeout (regression test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Likely fixed by the NewSessionTicket fix (CHANGELOG names MQTT over TLS). Left: run tests/golden/host/mqtt_tls.ts against a TLS 1.3-only broker and add the test for a handshake that cannot complete failing within the connect timeout (AC2). Evidence: commit 6a6b23b6 fix(tls): deliver TLS 1.3 records that arrive behind a session ticket (root cause of a silent hang after the handshake); tests/t0/tls.sh now has TLS 1.2 and 1.3 wss
<!-- SECTION:NOTES:END -->
