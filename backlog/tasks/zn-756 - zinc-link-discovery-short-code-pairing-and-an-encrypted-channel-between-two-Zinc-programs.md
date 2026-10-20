---
id: ZN-756
title: >-
  zinc:link: discovery, short-code pairing and an encrypted channel between two
  Zinc programs
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-17 08:46'
updated_date: '2026-10-17 12:10'
labels:
  - mobile
  - net
  - size-L
milestone: m-26
dependencies: []
ordinal: 196150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17 (notification relay, "imagine un plugin"): a plugin for two Zinc programs to find each other, pair once with a code and talk over an authenticated, encrypted channel, on the model of zinc agent (mDNS _zinclink._tcp, TLS EC J-PAKE with the code, pinned keys after), on macOS and Android first (Linux, iOS later), with an address typed by hand when the network blocks discovery and a WebRTC relay across networks (zinc:webrtc) as the next step. Design and API: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 two desktop programs advertise, browse, pair with the code, reconnect without it after a restart, exchange JSON and bytes (a T0/T1 test on loopback)
- [x] #2 the Nexus 7 advertises and the Mac finds it, pairs and exchanges messages (or the address typed by hand when discovery is blocked)
- [x] #3 a decision record: discovery on Android (MulticastLock or NsdManager), the key storage, what WebRTC adds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent). Done: plugins/link (zinc:link), docs/plugins/link.md (API, examples for ZN-757/758, protocol, Android, proof, the WebRTC plan).

Built: plugins/link/index.ts (the API: init, advertise, browse, openPairing/closePairing, onPairing, onPaired, pair(peer | {host, port}, code): Promise<Peer>, connect(peer): Channel with send(JSON), sendBytes(kind, bytes), onOpen/onMessage/onBytes/onClose, close(), reconnecting 1 s..30 s while paired; onConnection; peers, forget, addresses, id) over native/link.host.cpp (non-blocking sockets on the program's thread, events pulled by index.ts on a 10 ms timer while something is open: no thread, no native callback). Protocol of zinc agent: DNS-SD _zinclink._tcp (TXT id, svc, name, pair, v), a line in clear ZNL1 pair|sess, TLS 1.2 EC J-PAKE with the code (three tries, five minutes, one peer), TLS 1.3 PSK+ECDHE with the paired key, frames J/B/P (ping 15 s, silent 45 s ends). Store $ZINC_HOME/link/<app>.keys, 0600.
Shared with the agent, not duplicated: src/net/dnssd.{h,cpp} (the agent's src/agent/mdns.cpp, made a Responder and a Browser a loop polls plus the blocking browse/announce the agent keeps; mdns.cpp is now its 30-line adapter), src/net/frame.h (frame/takeFrame, used by wire.cpp), src/host/tls.{h,cpp} with ZN_TLS_NS: the plugin compiles tls.cpp in as zn::linktls (zinc does not export zn:: C++ to plugins, tools/zinc-unexported.txt, and the copy must not collide with the engine's in a zinc build or an Android app).

Proof:
- tests/t1/link.sh PASS (9.3 s): wrong code at a typed address refused and counted, found by DNS-SD with pairing open, paired, JSON and bytes both ways, restart without code (stored keys), advertiser restarted on another port under the open channel: reconnects by itself (found again by discovery) and talks again; key files 0600. Smoke: --interp advertiser with the native client paired and exchanged.
- Mac (M1 Pro, 192.168.2.71) and Nexus 7 2012 (Android 7.1.2, 192.168.2.241), tests/data/link/app exported armeabi-v7a: found in 63 ms, wrong code refused (tablet: pairing try 1), paired (J-PAKE about 0.4 s on the Tegra 3), JSON and bytes both ways; app restarted with LINK_PAIR=0: session with the stored key; restarted again under the open channel: reconnected in 4 s, talked again. Test app uninstalled after, music brought back to the front (it was still running).
- Tests run: agent, agent_apps, plugin_manifest (tests/data/plugins-table.txt gets the zinc:link row), export_android, tls: PASS.

Decision text (criterion 3: the record, for the coordinator to number in docs/reports/zinc-next-decisions.md; a worktree writes no decision number):
D-next: zinc:link: discovery on Android, the key storage, what WebRTC adds (ZN-756).
Question 1: how an Android app answers mDNS questions. Options: (a) a WifiManager.MulticastLock held while the activity is resumed, with the desktop's C++ responder (src/net/dnssd.cpp); (b) NsdManager (registerService/discoverServices/resolveService) in Java behind JNI callbacks. Scores (fit x3, perf x3, size x2, maint x2, licence x2, port x1, effort x1): (a) 5,4,5,5,5,5,5 = 69; (b) 3,4,4,2,5,2,2 = 50. (b) is a second implementation (Java, callbacks across JNI, which the glue only carries as void callbacks), NSD on Android 7 resolves one service at a time (FAILURE_ALREADY_ACTIVE) and goes through the system's mdnsd; (a) is one code path tested on the desktop. Measured on the Nexus 7 (2026-10-17): found in 63 ms with no lock held (dumpsys wifi: "Multicast Locks held:" empty, screen on) and with the lock held; this device filters multicast only with the screen off, when SDL blocks the app's loop anyway. Choice (a): plugins/link/native/android/LinkLife.java (a ZincLifecycle class: acquire onResume, release onPause; ZINC_LINK_NO_LOCK=1 in zinc.env turns it off for the measure), permission CHANGE_WIFI_MULTICAST_STATE (and INTERNET, commented out in the SDL template). Revisit if a phone needs discovery while its app is in the background (then NsdManager registers with the system daemon).
Question 2: where the long-term keys live. Options: (a) a file of the plugin, $ZINC_HOME/link/<app>.keys, 0600, directory 0700 (the agent's model); (b) zinc:storage (storage.kv: shared by every program on a desktop, written 0644). (b) leaks the keys to other programs and users; (a) chosen; init({ store }) names another file. Revisit with the system keychains (Keychain, Android Keystore) when an app is signed and sandboxed.
Question 3: what WebRTC adds: the same frames over a zinc:webrtc data channel when the two are not on one network, with a signalling relay (a WebSocket room named by a hash of the code, then of the key, so it learns neither) and the same TLS (J-PAKE with the code, PSK with the key) inside the data channel, because the relay and DTLS's self-signed certificates are not trusted. Not built (docs/plugins/link.md "Across networks").

later.md lines (for the coordinator):
- Cross-platform pass: ZN-756: zinc:link on Linux (built, never compiled there: dnssd beside avahi on port 5353, getifaddrs, MSG_NOSIGNAL) and two Linux machines pairing.
- Cross-platform pass: ZN-756: zinc:link on iOS: raw multicast needs Apple's com.apple.developer.networking.multicast entitlement; use dns_sd.h (DNSServiceRegister/Browse, in libSystem) behind dnssd.h, NSLocalNetworkUsageDescription and NSBonjourServices (_zinclink._tcp) in Info.plist.
- ZN-756: zinc:link across networks through zinc:webrtc (the plan in docs/plugins/link.md): a signalling relay, the TLS of the pairing and of the sessions inside the data channel.
- ZN-756: the QuickJS engine's timer loop (src/qjs/qjs.cpp timerLoop) jumps its virtual clock to the next timer without waiting or polling the native modules, so a program that waits on the network (zinc:link, zinc:socket) ends before an answer on --engine quickjs outside a frame loop; and native callbacks are refused there.
- ZN-756: zinc:link sends to a peer that stopped reading block nothing (non-blocking) but its out buffer grows without bound: a high-water mark and Channel.bufferedAmount when a program streams large bytes.
- ZN-756: the plugin cache key hashes every file beside a source, so plugins/link rebuilds (3 files, about 1 s) after any change in src/host/: a per-plugin list of the headers it includes would be exact.
<!-- SECTION:NOTES:END -->
