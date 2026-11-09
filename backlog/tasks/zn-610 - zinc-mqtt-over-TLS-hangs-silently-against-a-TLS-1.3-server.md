---
id: ZN-610
title: mqtt over TLS 1.3 and the handshake timeout test
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 07:27'
updated_date: '2026-11-09 02:49'
labels:
  - net
  - tls
  - bug
  - size-M
milestone: m-14
dependencies: []
priority: high
ordinal: 9500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Run tests/golden/host/mqtt_tls.ts against a TLS 1.3-only node broker; add a stalled handshake test that errors within the connect timeout.

**What is left (review 2026-10-25):** Run mqtt_tls.ts against a TLS 1.3-only broker (node, as tls.sh does for wss); add a regression test that a stalled handshake errors within the connect timeout. Already there: commit 6a6b23b6 fix(tls): deliver TLS 1.3 records that arrive behind a session ticket (root cause of a silent hang after the handshake); tests/t0/tls.sh now has TLS 1.2 and 1.3 wss.

tests/t0/tls.sh, MQTT step, on 2026-10-10: tests/mqtt_broker.py under Homebrew's Python 3.14.8 / OpenSSL 4.0.3 negotiates TLS 1.3 (openssl s_client: TLSv1.3, TLS_AES_256_GCM_SHA384, peer CN=good). `zinc run tests/golden/host/mqtt_tls.ts` then prints nothing and is killed by the 30 s timeout. The same run against Apple's Python 3.9 broker (LibreSSL, TLS 1.2) prints `[ 'secure/a=hello over tls' ]` at once. The HTTPS part of tls.sh passes. Find where the TLS 1.3 handshake or the first records stall in zinc:net / zinc:mqtt (key share groups and HelloRetryRequest, post-handshake NewSessionTicket on a non-blocking socket, record reads); a TLS failure must end with an error, never a silent hang.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tls.sh passes against a broker that only speaks TLS 1.3
- [x] #2 a TLS handshake that cannot complete fails with an error within the connect timeout (regression test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Likely fixed by the NewSessionTicket fix (CHANGELOG names MQTT over TLS). Left: run tests/golden/host/mqtt_tls.ts against a TLS 1.3-only broker and add the test for a handshake that cannot complete failing within the connect timeout (AC2). Evidence: commit 6a6b23b6 fix(tls): deliver TLS 1.3 records that arrive behind a session ticket (root cause of a silent hang after the handshake); tests/t0/tls.sh now has TLS 1.2 and 1.3 wss
Review 2026-11-07: done-partly. Likely fixed; the TLS 1.3-only MQTT run and the stalled-handshake timeout test remain. Evidence: commit 6a6b23b6; tests/t0/tls.sh TLS 1.2/1.3 wss

Worked 2026-11-09 (worktree agent).
Root cause of the hang: Python/OpenSSL TLS 1.3 sends its NewSessionTickets right behind the handshake, in the same read as the CONNACK. mbedTLS kept the ticket pending and answered WANT_READ without taking a byte; tls::read took that for 'no more bytes', so the CONNACK stayed in the buffer until more bytes came, which never happened (the broker waits for the client): connect() never resolved. Fixed by 6a6b23b6 (read again while bytes are taken or a message is pending). Proven: with that loop removed, mqtt_tls.ts against the node TLS 1.3-only broker is killed by the timeout; with it, it passes at once on the interpreter, --native and --engine quickjs.
AC1: tls.sh runs mqtt_tls.ts against tests/mqtt_tls_broker.mjs (node, minVersion = maxVersion) at TLS 1.2 and TLS 1.3; the python TLS step and mqtt_broker.py's TLS mode are gone.
AC2: zinc:mqtt had no deadline at all, so a broker that accepted and never answered hung forever. MqttClient.connectTimeoutMs (default 30000, 0 none) is one deadline for TCP + TLS + CONNACK, as curl's CURLOPT_CONNECTTIMEOUT; the error names the phase (connect timed out, TLS handshake timed out, no CONNACK from the broker). The client lifecycle is now one Phase enum changed by to() (Connecting, Securing, Greeting, Connected, Dead) instead of connected/dead bools, and fail() reports once. New row host.mqttConnect (appended; rows are only added). tls.sh: mute broker + mqtt_stall.ts with a 1 s deadline must print 'mqtt: TLS handshake timed out' within 5 s.
Found on the way: zinc:mqtt never worked on --engine quickjs (its rows were not installed: isSysTailRow lacked them); fixed.
Research: mbedTLS 3.6 known issues https://github.com/Mbed-TLS/mbedtls/issues/9223 (psa_crypto_init, TLS 1.3 forces server auth); RECEIVED_NEW_SESSION_TICKET is non-fatal, signalled only with mbedtls_ssl_conf_tls13_enable_signal_new_session_tickets in later 3.6 (ChangeLog 72064b2); FFmpeg treats it as EAGAIN https://ffmpeg.org/pipermail/ffmpeg-devel/2024-May/327532.html; curl's connect timeout covers every handshake https://curl.se/libcurl/c/CURLOPT_CONNECTTIMEOUT.html; Node handshakeTimeout 120 s https://r2.nodejs.org/docs/v21.0.0/api/tls.html; related TLS 1.3 reports https://github.com/Mbed-TLS/mbedtls/issues/9072, https://github.com/espressif/esp-aws-iot/issues/179.
Proposed tests: tests/run --only tls (about 10 s, under 100 MB; runs MQTT over TLS 1.2/1.3 and the stalled handshake), tests/run --only mqtt (seconds).
<!-- SECTION:NOTES:END -->
