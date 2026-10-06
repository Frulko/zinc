---
id: ZN-086
title: 'zinc:mqtt client'
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
labels:
  - host-modules
  - size-M
milestone: m-14
dependencies:
  - ZN-082
ordinal: 40280
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
connect/publish/subscribe/disconnect with QoS 0 and 1, retain, will, keepalive over uv_tcp (and TLS once W-tls lands). Use an existing small client library (MQTT-C, MIT) rather than rewriting the protocol; the prototype's runtime/mod/mqtt.cpp is 115 lines and defines the API surface to keep.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 integration test against a local broker started by the test (mosquitto when present, else a tiny Python broker script kept in tests/); skip with exit 77 when neither is available
- [ ] #2 examples/service/sensor-hub passes the module step
<!-- AC:END -->
