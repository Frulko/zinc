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
- [x] #3 tests/t0/tls.sh: a loopback wss echo (node TLS server, certificate of the test CA, TLS 1.2 then 1.3) round-trips a greeting, a text and a binary message with a clean close, and the same server under an untrusted CA is refused (UNABLE_TO_VERIFY_LEAF_SIGNATURE); tests/t0/socket.sh and native_gen.sh still pass
- [x] #4 a TLS 1.3 server's first bytes that arrive in one read behind its session tickets are delivered at once (tests/t0/tls.sh, tls_first.ts), and a write after a pending ticket does not fail
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/host/sock.cpp: a client Sock may carry a tls::Conn (tls.h, the same openClient as https: VERIFY_REQUIRED against roots(), ZINC_CA_FILE, set_hostname = SNI and name check); connectTls = connectTcp + the conn; the ClientHello goes out on connect, the open event after the handshake, a handshake failure or an EOF before it is an error event (rejects the connect), then reads are decrypted, writes encrypted, end() sends close_notify before the FIN. Row HostSockConnectTls (si>i) appended at the end of ZN_RUNTIME (system row, net permission as connect), zinc:__sock connectTls, Spec connectTls (socket.next.ts; socket.sim.ts on node:tls; the prototype's socket.host.cpp returns -1 "not available on this engine"), zinc:socket connectTls, WebSocket wss: (default port 443). native_gen golden header updated. Test: tests/t0/tls.sh, wss section (tests/wss_echo.py, python ssl echo server with the test CA's certificate; trusted: text + binary echoed, close 1000 clean; untrusted CA: "tls UNABLE_TO_VERIFY_LEAF_SIGNATURE localhost:PORT" then close 1006). PASS tls, socket, native_gen (interpreter). Not done: wss in the network log (ZN-634), a TLS server (serveWebSocket stays ws://), the QuickJS engine (it installs no zinc:__sock rows, as before).

Fix after the Atelier twin app's end-to-end run (2026-10-19): wss failed against TLS 1.3 servers (Node's default). The first test server was python3 on LibreSSL 2.8.3, which has no TLS 1.3, so only TLS 1.2 was ever tested. Root cause in src/host/tls.cpp (every TLS caller: sock, http, mqtt, agent): on a TLS 1.3 NewSessionTicket mbedTLS 4 keeps the message, answers MBEDTLS_ERR_SSL_WANT_READ, and processes it on the next call (ssl_msg.c ssl_tls13_handle_hs_message_post_handshake). tls::read took that WANT_READ to mean "no more bytes", so the records fed behind a ticket (the 101 reply, the first message) waited for more bytes from the network. And mbedtls_ssl_write's handshake step returns MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET when it processes a pending ticket, which tls::write took for a failure (write false for good, no event). Fix: read() reads again while the call took bytes and more are fed, and once when the handshake is not over (a pending ticket); write() goes on after RECEIVED_NEW_SESSION_TICKET. Test: the server is now node (tests/wss_echo.mjs, TLS 1.2 and 1.3 forced, the WebSocket greets first), plus tls_first.ts: the server writes one line 50 ms after the handshake, the client holds its loop for 300 ms (ZINC_REALTIME) so tickets and line come in one read. The old tls.cpp fails it every time on TLS 1.3 (ssl_read WANT_READ with in=335 left; the line never comes), the new one passes. PASS tls (3 runs), socket, native_gen, agent. Lead, not checked: the tls12 workaround of http.cpp (api.spotify.com and upload.wikimedia.org "close mbedTLS's TLS 1.3 sessions after the request") may have been this bug, since a response behind a ticket stalled the same way. The write fix is reasoned from the mbedTLS source; no test drives it deterministically. Not run: the Atelier twin app's own e2e (its tests/e2e.ts does not compile against its src right now, someone else's work in progress); plugins/link compiles its own copy of tls.cpp and was not rebuilt.
<!-- SECTION:NOTES:END -->
