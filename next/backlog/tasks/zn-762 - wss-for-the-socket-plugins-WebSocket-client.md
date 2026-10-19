---
id: ZN-762
title: wss for the socket plugin's WebSocket client
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-19 21:50'
labels:
  - host-modules
  - size-S
milestone: m-14
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-19: the Atelier twin tray app (written in Zinc, macOS) connects to an Atelier server over wss://, and `new WebSocket` of plugins/socket speaks ws:// only (ZN-088: "Not done: TLS (wss)"). Wire the host's mbedTLS client (src/host/tls.h, the one https and MQTT over TLS use) into the libuv sockets of src/host/sock.cpp: a TLS client stream, the certificate verified against the system's roots as https does (ZINC_CA_FILE in tests), the host name as SNI; then `wss://` in the plugin's WebSocket uses it. No new crypto, ws:// unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zn::sock::connectTls (row HostSockConnectTls, zinc:__sock connectTls, Spec connectTls, zinc:socket connectTls) opens a TLS client stream with verification on; the open event follows the handshake, a certificate that does not verify is an error that rejects the connect
- [x] #2 new WebSocket('wss://host[:port]/path') connects over it (default port 443); ws:// unchanged
- [x] #3 tests/t0/tls.sh: a loopback wss echo (python TLS server, certificate of the test CA) round-trips a text and a binary message with a clean close, and the same server under an untrusted CA is refused (UNABLE_TO_VERIFY_LEAF_SIGNATURE); tests/t0/socket.sh and native_gen.sh still pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/host/sock.cpp: a client Sock may carry a tls::Conn (tls.h, the same openClient as https: VERIFY_REQUIRED against roots(), ZINC_CA_FILE, set_hostname = SNI and name check); connectTls = connectTcp + the conn; the ClientHello goes out on connect, the open event after the handshake, a handshake failure or an EOF before it is an error event (rejects the connect), then reads are decrypted, writes encrypted, end() sends close_notify before the FIN. Row HostSockConnectTls (si>i) appended at the end of ZN_RUNTIME (system row, net permission as connect), zinc:__sock connectTls, Spec connectTls (socket.next.ts; socket.sim.ts on node:tls; the prototype's socket.host.cpp returns -1 "not available on this engine"), zinc:socket connectTls, WebSocket wss: (default port 443). native_gen golden header updated. Test: tests/t0/tls.sh, wss section (tests/wss_echo.py, python ssl echo server with the test CA's certificate; trusted: text + binary echoed, close 1000 clean; untrusted CA: "tls UNABLE_TO_VERIFY_LEAF_SIGNATURE localhost:PORT" then close 1006). PASS tls, socket, native_gen (interpreter). Not done: wss in the network log (ZN-634), a TLS server (serveWebSocket stays ws://), the QuickJS engine (it installs no zinc:__sock rows, as before).
<!-- SECTION:NOTES:END -->
