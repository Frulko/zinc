---
id: ZN-897
title: >-
  webrtc-call: Galène protocol client (join by link, publish, receive, ICE
  restart)
status: Backlog
assignee: []
created_date: '2026-10-30 22:58'
updated_date: '2026-11-10 07:20'
labels:
  - net
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-895
ordinal: 15600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/galene.ts in examples/webrtc-call speaks Galène protocol v2 on zinc:socket WebSocket and zinc:webrtc: .status, handshake, join with token, one PeerConnection per stream (publish camera and screen, answer down streams), request per tile (video for the speaker, video-low for thumbnails, audio only for hidden tiles), ping every 10 s, reconnect with backoff, renegotiate with ICE restart on ICE failure; a grid of remote tiles. The app takes a link (CALL_LINK or a field). zinc:webrtc gains restartIce() where it is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Zinc app and Chrome (Galène web client, tools/cdp.py) see and hear each other through a local Galène
- [ ] #2 Three participants (2 Zinc, 1 Chrome) with request-driven layers; hiding a tile stops its video bytes (stats)
- [ ] #3 Killing the network for 5 s (K1 profile or interface down) recovers media without rejoining
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10 worker checkpoint (work/897). The coordinator redirected the team to core engine work and froze further call/UI/backend expansion. This task stays Backlog: AC2 and AC3 remain open. AC1 has automated synthetic-media evidence below; no physical camera, microphone, speaker or hearing claim.

Implemented: examples/webrtc-call/src/galene.ts speaks the pinned Galène 1.2.1 protocol v2 using the existing zinc:socket, WebRTC and media providers. It discovers .status, accepts server fragment/group/app links, restricts the token-bearing WebSocket to the invite host and transport, negotiates version2, probes bound tokens and supplies a display name only when the server asks need-username, maintains users, publishes one sendonly PC per camera/screen stream with VP8 h/l simulcast and Opus, answers downstream offers, queues trickled ICE until SDP, requests speaker/thumbnail/audio-only streams, sends10s pings, retries signalling with bounded backoff, and cancels owned resources with generation checks. Existing Call owns capture/screen tracks and retains local/P2P modes. Quiet link/name fields and per-stream tiles expose actual receive byte counters. Camera and screen publish separately. No new dependency, public plugin API, committed app/demo test, benchmark or suite.

Native root fix: quitting original CALL_DEMO=shot with live echo peers exposed a post-exit mutex crash twice (local.log/local-repeat.log; original HEAD copy passed once, so no deterministic baseline claim). HostWebRTC had no finish cleanup. Its existing Tx joins and rtcCleanup now run from one persistent at_finish hook registered with call_once. An atomic Idle/Running/Stopping lifecycle stops callbacks before registry teardown, rejects illegal transitions, joins workers without holding registry locks, deletes live/dying PCs, waits for WebRTC cleanup, clears events/registries and returns Idle for the next run. Old monotonic peer/channel handles cannot enqueue callbacks into a new run. No runtime/IR/UI/HAL/main change. Regression tests/data/webrtc_shutdown.ts leaves actual decoded media/peers open and must exit normally (tests/t0/webrtc_shutdown.sh; affected mapping added).

Primary research (no substitute protocol guessed): https://github.com/jech/galene/blob/galene-1.2.1/galene-protocol.md and pinned static/protocol.js plus rtpconn/webclient.go. Source archive SHA256230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a, already verified by896. Native backend pinned libdatachannel bdc5ff28e9d3b863144c94a677ecf5bf043aaf15/libjuice1.7.4. Upstream ICE restart issues https://github.com/paullouisageneau/libdatachannel/issues/545 and https://github.com/paullouisageneau/libjuice/issues/130 remain open; vendored agent.c refuses changed credentials. A fake restartIce method or membership rejoin is not recovery and was not added.

Libnice feasibility, SCRATCH ONLY: official0.1.24 source https://libnice.freedesktop.org/releases/libnice-0.1.24.tar.gz SHA256cfb5e8e778534f2f5b3c6f4958a1eb057c6b95c537c0f100817a537cf5d64fcc, MPL1.1 OR LGPL2.1+. Existing primary docs https://libnice.freedesktop.org/libnice/NiceAgent.html document nice_agent_restart_stream for local/remote restarts. Static scratch build used existing installed GLib/GIO/GThread2.90.1 and OpenSSL4.1.0, optional GStreamer/GUPnP disabled. Meson1.9.1 wheel was extracted only under .logs (SHA256f824ab770c041a202f532f69e114c971918ed2daff7ea56583d80642564598d0); no package/system install or vendoring. Actual libdatachannel libnice branch plus four scratch source overrides changed both ICE ufrags while preserving exact same PC, ICE, DTLS and Track objects and delivered valid Opus RTP12→24. Log/source .logs/897/native/restart.log, restart.cpp, prepare.py, build.py; executable SHA256ac8fe3be769507f6dbe11a056247853e433b155474739aedcf98962dea6d8d6f. Local candidate addresses were reused/re-signalled with new credentials on the same network: no real interface change, loss recovery, Galène restart interoperability or packaging proof. Scratch archive600056B and executable2857528B dynamically use installed dependencies; these are artifact sizes, not portable dependency footprint or performance results.

Remaining native plan within THIS task (no new followup task): a portable pinned libnice/GLib/crypto dependency/build/package plan first. Its existing USE_NICE branch needs true restart exposure through IceTransport/PeerConnection/CAPI/spec/facade/web, changed-remote-credential detection, candidate/gathering reset and preserving DTLS/tracks through ICE failed/disconnected. Existing K1 hooks target libjuice; an owned-connection libnice impairment path is needed before AC3. Do not switch to system-dependent builds or implement ICE ourselves. Production backend remains libjuice; the app explicitly reports restart unavailable instead of silently rejoining for media failure.

Proofs (all bounded/queued through absolute tools/work-run; one Zinc plus one owned Galène child/one headless Chrome only):
- Frozen compiler .worktrees/1119/build/zinc SHA25638e22ed7035d08782e9293b57987ab76d4f95b3227bcd8e47b1b4131e018c6ab, source1b8ecadb5; ZINC_ROOT this tree, adjacent AOT libraries retained. No engine rebuild. Actual Galène darwin-arm64 binary SHA2569c3d77bc35fead52d80db1e7a7488e6d8c1dc48db168eb9f6a260cbc2a86d0a4 (verified896 mirror, not published).
- Actual production App/Call + Supervisor/admin modules in ONE scratch Zinc app and Chrome1.2.1 web client: interpreter, AOT and QuickJS exchange actual synthetic VP8/Opus, decoded frames/samples and increasing receive byte counters on both sides. Each flow ~25s. Logs .logs/897/ui-flow.log, quickjs-flow.log, aot-flow.log; native logs quickjs-native.log/aot-native.log; screenshots quickjs-live.png/aot-live.png inspected. Hiding tile settles to exactly unchanged videoBytes over3s while audio samples increase, then full video request resumes bytes/frames. Fake-screen picker publishes a second decoded Chrome video stream while camera stays live. Browser optional tasks-vision/favicon404 and teardown-only unknown-stream/socket-close warnings disclosed; no physical seeing/hearing claim. AC1 checked on this automated media evidence; AC2 specifically needs2Zinc+Chrome and remains unchecked.
- .logs/897/auth.log: invite validation, token join, owned server kill→supervisor restart→signalling backoff/rejoin, revoked token terminal refusal, close/no reconnect/empty resources after2.1s. ~7s; this proves signalling rejoin, NOT media ICE recovery.
- Exact tests/run --tier t0 --only webrtc_shutdown PASS (shutdown-t0.log). Direct native actual-provider+runtime probe PASS: persistent finisher registered once across24factory calls, active media worker joined, double cleanup, restart/new monotonic handle, stale callbacks refused and illegal transition rejected (.logs/897/shutdown-native/probe.log, main.cpp/build.py). Probe binary SHA25647cf48ae4f91f5d048ca7a5411083ae09a079e878a71eb2604b5b1a3feda9175. ~0.3s runtime; native source compile only, no engine build.
- Unmodified original CALL_DEMO=shot code now exits0 with actual decoded echo after2.8s, no mutex failure (local-final.log). One final7s normal Galène interpreter media flow after native fix exits0 with both ends' live decoded media and cleanup (galene-final.log/flow.log).
- zinc check examples/webrtc-call passed; whitespace/affected JSON valid. Usage: n/a.

No proof-owned Zinc, Galène, browser, server or media helper remains. No push/publication, native libnice production change, interface/firewall change, full build, T1/T2/demo/suite/pixel/benchmark/conformance/fuzz/CI run. The read-only compiler auto-built its changed native plugin cache under work-run; no compiler mutation.

Proposed tests (owner chooses):
- Run2Zinc+Chrome through pinned Galène, assert speaker/thumbnail/audio-only routing and hidden video bytes, ~45s, estimated<1GB total; AC2 remains open because simultaneous Zinc was not authorized.
- After true native restart is implemented, isolate5s network loss to owned media connection using its impairment provider; assert same membership/PC/DTLS/tracks recover AV, ~20s, estimated<500MB; AC3 open.
- TLS/TURN/remote Pi/OptiPlex, keyboard/touch/physical capture/playback and longer reconnect/resource churn, ~1–2min per target, memory unmeasured.

Proposed later line: ZN-897: validate Galène/native-client TLS/TURN and remote hardware after portable ICE-restart integration; current local synthetic proof must not imply physical or cross-platform readiness.
<!-- SECTION:NOTES:END -->
