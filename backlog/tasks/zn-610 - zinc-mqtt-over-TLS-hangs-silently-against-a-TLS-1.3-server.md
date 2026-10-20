---
id: ZN-610
title: 'zinc:mqtt over TLS hangs silently against a TLS 1.3 server'
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
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/t0/tls.sh, MQTT step, on 2026-10-10: tests/mqtt_broker.py under Homebrew's Python 3.14.8 / OpenSSL 4.0.3 negotiates TLS 1.3 (openssl s_client: TLSv1.3, TLS_AES_256_GCM_SHA384, peer CN=good). `zinc run tests/golden/host/mqtt_tls.ts` then prints nothing and is killed by the 30 s timeout. The same run against Apple's Python 3.9 broker (LibreSSL, TLS 1.2) prints `[ 'secure/a=hello over tls' ]` at once. The HTTPS part of tls.sh passes. Find where the TLS 1.3 handshake or the first records stall in zinc:net / zinc:mqtt (key share groups and HelloRetryRequest, post-handshake NewSessionTicket on a non-blocking socket, record reads); a TLS failure must end with an error, never a silent hang.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tls.sh passes against a broker that only speaks TLS 1.3
- [ ] #2 a TLS handshake that cannot complete fails with an error within the connect timeout (regression test)
<!-- AC:END -->
