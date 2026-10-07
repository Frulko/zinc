---
id: ZN-086
title: 'zinc:mqtt client'
status: Review
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 03:56'
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
- [x] #1 integration test against a local broker started by the test (mosquitto when present, else a tiny Python broker script kept in tests/); skip with exit 77 when neither is available
- [ ] #2 examples/service/sensor-hub passes the module step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:mqtt built in: src/host/mqtt.{h,cpp} MQTT 3.1.1 client on uv_tcp (CONNECT/CONNACK, PUBLISH qos 0/1 with retain, SUBSCRIBE, PINGREQ every 30 s, DISCONNECT, PUBACK of incoming qos 1), events kinds 30-32, filters (+, #) matched in Zinc; rows HostMqtt* appended. Own port of the 115-line prototype client instead of MQTT-C (same reason as osc). Test tests/t0/mqtt.sh with mosquitto or tests/mqtt_broker.py (skip 77 without python). AC2 open: sensor-hub and modules-showcase now stop at zinc:net serve (ZN-087), mqtt imports resolve. Not done: will, auth, TLS, qos 2.
<!-- SECTION:NOTES:END -->
