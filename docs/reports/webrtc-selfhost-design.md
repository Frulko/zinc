# Self-hosted calls: a server, share links and calls that survive bad networks (2026-10-30)

The owner wants the webrtc demo to be "ultra complete": a self-hostable, heavily optimised call server that holds up on bad connections, and a
share link so people can talk between Zinc apps, the web and iOS. Two more questions came in during the work: can it reach Google Meet's or
Infomaniak kMeet's (Jitsi) quality, and how does Zinc's server side compare with Node and Bun.

This report is research and design only. No code, no task and no commit was made. The tasks at the end are ready for `tools/tasks-import`.
Scores use `RULES.md` §4 (fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1; 70 at most).

## 1. Decision in one paragraph

**Use a hybrid. Galène is the media server (MIT, Go on Pion 4, v1.2.1 of 2026-09-08). Zinc owns everything around it:** a `call-server` Zinc
app that installs, configures and supervises the pinned Galène binary, creates rooms and signed, short-lived invite links through Galène's
admin API, gets the Let's Encrypt certificate and prints the link and a QR code. Galène answers on its own HTTPS port, so the Zinc server is
not on the media or signalling path. Every browser joins with Galène's own web client, a plain page that needs no install. Zinc apps
(desktop, iOS, the Pi) join through a small client of Galène's documented JSON protocol, written on `zinc:socket` and `zinc:webrtc`. Most of
the work for bad networks is in **our native client**, which today has none of libwebrtc's receive-side machinery: it sends no NACK, its
bandwidth estimate is a fixed number, it never decodes Opus FEC and its jitter buffer is fixed. Ten WebRTC tasks close the gaps in order,
behind a network-impairment harness that measures them. Three server tasks put real numbers on `zinc:net` against Node and Bun and fix what
they find.

## 2. What Zinc has today (read from the tree)

| Piece | State | Where |
|---|---|---|
| WebRTC stack | libdatachannel bdc5ff28, libjuice 1.7.4, usrsctp, libsrtp 2.8.1 (built-in crypto), the engine's mbedTLS 4 | `plugins/webrtc/vendor/PIN`, D131 |
| Codecs | Opus 1.6.1 (float), VP8 with libvpx 1.17 generic C, H.264 through VideoToolbox | `native/media.cpp`, `native/videotoolbox.cpp` |
| Signalling | `examples/webrtc-chat/signal-server.ts`: a WebSocket room relay for 2 peers, P2P only | |
| Screen | `zinc:screen-capture` (ScreenCaptureKit), `getDisplayMedia` (ZN-874, Done) | `plugins/screen-capture` |
| Stats | `getStats()`: inbound, outbound and remote-inbound RTP, shown as an overlay in the demo | `webrtc.host.cpp:1095+` |
| Web build | `zinc:webrtc/web` is the browser's own RTCPeerConnection, so the same app runs as a page | `plugins/webrtc/web/index.ts` |
| HTTP server | `zinc:net` `serve`/`serveAsync`: libuv + llhttp, HTTP/1.1, optional TLS (mbedTLS) | `src/host/http.cpp` |
| WebSocket server | `zinc:socket` `serveWebSocket`: RFC 6455 framing written in Zinc on a plain TCP `listen`, no TLS | `plugins/socket/index.ts:483` |
| Process, QR | `zinc:process`, `zinc:qrcode` | `plugins/` |

**Defects and gaps found while reading. Each one matters on a bad network:**

1. **The receiver never sends NACK.** libdatachannel's `RtcpReceivingSession` sends RR, REMB, PLI and FIR, and nothing generates NACKs. A
   lost video packet waits for the 100 ms reassembly gap and then costs a PLI and a whole keyframe. The sending side does answer NACKs
   (`rtcChainRtcpNackResponder(…, 512)`).
2. **Opus FEC is encoded and never decoded.** `opusDecode` always passes `decode_fec = 0` (`media.cpp:184`). `OPUS_SET_PACKET_LOSS_PERC` is
   fixed at 5 and does not follow measured loss. DTX is off.
3. **The bandwidth estimate a Zinc receiver reports is not an estimate.** The REMB it sends comes from `requestBitrate` with a fixed value.
   The sender follows the peer's REMB down to a 50 kbit/s floor (`videoBitrate`). It never lowers resolution or frame rate, so on a thin link
   the picture turns to blocks instead of shrinking.
4. **The VP8 packetizer writes a 1-byte descriptor** (no PictureID, TL0PICIDX or TID), and it **sets the N bit (non-reference) on every
   delta frame** (`vp8rtppacketizer.cpp`). A middlebox that trusts N may drop frames that later frames need. Without TID, an SFU cannot drop
   temporal layers.
5. **No simulcast** (`setParameters` refuses more than one encoding), **no `restartIce`**, **no echo cancellation** (the demo keeps the
   speaker off).
6. **Jitter buffer**: fixed, 60 ms for audio and 100 ms for video. Plain Opus PLC on gaps. No time stretching, so it cannot grow or shrink
   without a click.
7. **`zinc:net` server**: at most 32 connections at once for the whole process (`kConnCap`). `Connection: close` after every response, so
   there is no keep-alive and every HTTPS request pays a full TLS handshake. The idle timer is 10 s per block, so a client that sends one
   byte every 9 s holds its slot forever. No per-IP limit, no rate limit, the body is buffered whole (64 MB cap). The WebSocket server has
   no maximum payload: a client that announces a 2^63-byte frame makes it buffer without limit. It has no TLS (`wss://`).

## 3. Server architecture: the options

### 3.1 Topology

| Topology | Good at | Bad at |
|---|---|---|
| Mesh (P2P, the demo today) | 1:1 on a LAN, no server bandwidth, lowest latency | each sender uploads N-1 copies. Nothing in the middle repairs loss or picks layers per receiver, so one weak receiver drags every sender down |
| **SFU** (forward, no transcoding) | per-receiver layer choice (simulcast/SVC), NACK answered from the server's cache over the short leg, one upload per sender | needs a server and its bandwidth |
| MCU (mix and transcode) | one stream down for very weak clients | CPU per room, adds latency, breaks E2EE. Nobody self-hosts one on a Pi |

The SFU is the answer for "holds on bad connections": the server repairs loss on the short leg, and each receiver gets the layer its own
link can carry. P2P stays as the LAN mode the demo already has.

### 3.2 SFU candidates

| Option | fit | perf | size | maint | licence/supply | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **(c) Hybrid: Zinc control plane + Galène** | 5 | 4 | 4 | 4 | 4 | 4 | 4 | **59** |
| (c') Hybrid: Zinc control plane + LiveKit | 4 | 5 | 3 | 3 | 5 | 4 | 2 | 55 |
| Mesh only (today's P2P + TURN) | 3 | 2 | 5 | 5 | 5 | 5 | 5 | 55 |
| (b) LiveKit binary, its own protocol and SDKs | 3 | 5 | 3 | 4 | 5 | 4 | 2 | 54 |
| SRS (C++, MIT; streaming first, WHIP/WHEP) | 2 | 4 | 4 | 3 | 5 | 3 | 2 | 47 |
| mediasoup (ISC; Node library + C++ worker) | 2 | 5 | 2 | 3 | 5 | 3 | 1 | 45 |
| (a) An SFU written in Zinc on libdatachannel | 3 | 2 | 5 | 2 | 4 | 4 | 1 | 42 |
| Janus (C, GPL-3.0; glib, libnice, libwebsockets…) | 3 | 4 | 3 | 3 | 2 | 3 | 2 | 42 |
| Jitsi Videobridge + Jicofo + Prosody (JVM) | 2 | 4 | 1 | 2 | 5 | 2 | 2 | 38 |
| Pion ion-sfu (archived) | 2 | 3 | 4 | 1 | 1 | 4 | 2 | 33 |

Why each scored as it did:

- **Galène** ([galene.org](https://galene.org/), [CHANGES](https://github.com/jech/galene/blob/master/CHANGES)): MIT. One static Go binary
  (`CGO_ENABLED=0`, cross-builds to linux/arm64 and arm with `GOOS`/`GOARCH`), no database.
  - Media: simulcast (two layers, rid or one stream per m-line), SVC for VP8 and VP9, preliminary AV1. NACK in both directions with a
    packet cache. PLI and FIR.
  - Network: a built-in TURN server (UDP and TCP on 1194, IPv4). ICE restarts. UDP multiplexing on one port.
  - Rooms and access: token auth (stateful tokens, JWT and RSA, hierarchical and global tokens) and **invite links**
    (`/group/<g>/?token=…`, `galenectl create-token -duration`). An admin HTTP API (`/galene-api/v0/`, Basic or bearer, `admin`
    permission). A full web client (chat, screen share, file transfer, mic/camera test).
  - Signalling: **a documented, stable JSON protocol over WebSocket**
    ([galene-protocol.md](https://github.com/jech/galene/blob/master/galene-protocol.md)).
  - Cost, as published: about 20 meeting participants per core, a 100-student lecture on a quarter of a core.
  - Weak points:
    - Congestion control is simpler than libwebrtc's. Downstream uses the receivers' REMB plus a loss-based AIMD (`rtpconn.go`
      `updateRate`: ×1.05 under 2 % loss, ×(1−loss/2) above 10 %). There is **no transport-cc**; upstream control is "partial".
    - No RED, no FlexFEC, no E2EE, no TURN over TLS.
    - One main maintainer (Juliusz Chroboczek, IRIF). That is the supply risk scored above.
    - No prebuilt binaries: we build them.
- **LiveKit** (Apache-2.0, Go/Pion, v1.13.11 of 2026-10-25): the most complete on bad networks. Simulcast, VP9/AV1 SVC, dynacast,
  adaptive stream, RED, transport-cc BWE, and an embedded TURN over TLS
  ([deployment](https://docs.livekit.io/home/self-hosting/deployment/)). Prebuilt binaries: linux arm64 17.6 MB and armv7 18.1 MB (tar.gz,
  GitHub release assets).
  - Signalling is protobuf. A Zinc client would need a protobuf codec and LiveKit's two-PeerConnection model (publisher and subscriber).
  - There is no web client in the box (LiveKit Meet is a Next.js app), and invite links need our own token service (JWT HS256).
  - It needs TLS termination in front or a separate TURN domain, and recommends Redis.
  - More moving parts for the same result on 2 to 20 people.
- **An SFU in Zinc** would have to write simulcast switching (PictureID and TL0PICIDX rewriting), per-receiver BWE, a NACK cache, keyframe
  handling and a TURN server. That is a large network-protocol component nobody has proven, and libdatachannel's own `media-sfu` example is
  a bare relay. RULES §3 says no.
- **mediasoup** is a library that needs Node.js and our own signalling. **Janus** is GPL-3.0 with many system libraries. **Jitsi** is a
  JVM stack of three services (too heavy for a Pi). **ion-sfu** is archived.

**Choice: (c) with Galène, 59.** It has the fewest moving parts. JSON is native to Zinc. The browser side is done. Invite links exist. It
runs on a Pi. **Revisit for LiveKit** if one of these happens: we need TURN over TLS on 443 out of the box, multi-node scale, or RED and
transport-cc on the server; or Galène's maintenance stops. The Zinc client is the only part that would change, and its own resilience work
(§6) carries over unchanged.

### 3.3 TURN

| Option | fit | perf | size | maint | licence | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **Galène's built-in TURN (pion/turn v5)**, UDP+TCP 1194 | 5 | 4 | 5 | 4 | 5 | 4 | 5 | **62** |
| coturn (C, BSD-3) for TURN over TLS on 443, optional | 4 | 5 | 4 | 4 | 5 | 3 | 3 | 57 |
| libjuice's `juice_server` (already vendored, MPL-2.0) | 2 | 4 | 5 | 4 | 4 | 5 | 2 | 48 |
| eturnal (Erlang, Apache-2.0) | 3 | 4 | 2 | 3 | 5 | 3 | 3 | 45 |

The built-in TURN covers UDP-blocked networks (TCP 1194). Its credentials are per process and go only to joined clients. It sets no peer
filter, so anyone holding an invite can use it as a relay to any host. Fix that (§5) before a public deploy. A network that allows nothing
but TLS on 443 needs coturn on a second address with `use-auth-secret`; Galène's `ice-servers.json` already takes
`"credentialType": "hmac-sha1"` for that. libjuice's server relays UDP only: we would be writing the TCP and TLS parts.

## 4. The architecture

```
                 https://call.example.org           (one domain, Let's Encrypt)
  Browser ──────► :443  Galène (HTTPS + /ws + /galene-api + static/)  ◄── Zinc app (desktop, iOS, Pi)
  (Galène's           │      media: UDP mux port (e.g. 10000), TURN :1194 udp+tcp
   web client)        │
                      ▲ admin API on localhost, Basic auth, secrets in data/ (0600)
              call-server (Zinc app, zinc:net + zinc:process + zinc:qrcode)
              - fetches the pinned galene binary (zinc toolchain, sha256)
              - writes data/config.json, groups/*.json, ice-servers.json, static/ overlay (join.html)
              - serves :80 for ACME HTTP-01 and the redirect to 443
              - `link <room> [--hours 24]` → POST …/.tokens → prints the URL and a QR code
              - restarts galene on exit, renews the certificate, logs to journald
```

- **Galène owns the public port.** HTTPS, the WebSocket, media and TURN are all its own: they are proven and fast (Go net/http + gorilla
  websocket), and our `zinc:net` limits (§8) stay off the hot path.
- **Zinc owns setup and links.** The setup is what people get wrong (certificates, ports, TURN, groups), and the links are what the owner
  asked for.
- **The browser client is Galène's.** It already does simulcast send, screen share, chat and device tests, and it runs in every browser,
  Safari on iOS included. The same `webrtc-call` app exported with `--target web` and speaking the Galène protocol is a later option (one
  line in `later.md`), not v1.
- **Zinc apps speak Galène's protocol directly.** The client is about 400 lines of Zinc in `examples/webrtc-call/src/galene.ts`, on
  `zinc:socket` `WebSocket` and `zinc:webrtc`.

## 5. Protocol, links and security

### 5.1 Signalling (Galène protocol v2, as the Zinc client uses it)

| Direction | Message | Use |
|---|---|---|
| C→S | `GET <group>/.status` (HTTP) | the group's `endpoint` (wss URL), `authServer`, `authPortal` |
| C→S | `{type:"handshake", version:["2"], id}` | open; the server answers with the chosen version |
| both | `ping` / `pong` | keepalive (answer within 30 s); the Zinc client sends one every 10 s and treats a 15 s silence as a lost link |
| C→S | `{type:"join", kind:"join", group, username?, token}` | join with the invite token (or a username and password) |
| S→C | `{type:"joined", kind, permissions, rtcConfiguration}` | the ICE servers (TURN credentials) come here |
| S→C | `{type:"user", kind:"add"/"change"/"delete"}` | the participants list |
| C→S | `{type:"request", request:{camera:["audio","video-low"], "":["audio","video"]}}` | what to receive: the receiver picks layers; thumbnails ask `video-low`, unseen tiles ask audio only |
| C→S | `{type:"offer", id, label:"camera"/"screenshare", sdp}` | publish one up stream; **one PeerConnection per stream**, Zinc is the offerer |
| S→C | `{type:"offer", id, label, username, sdp}` | a down stream; Zinc answers |
| both | `answer`, `ice` (trickle) | |
| C→S | `{type:"renegotiate", id}` | asks for a new offer **with an ICE restart** (network change, ICE failed) |
| C→S | `requestStream` | change the tracks of one down stream |
| both | `close` (offerer), `abort` (answerer) | end a stream |
| both | `chat`, `usermessage`, `useraction`, `groupaction` | chat, kicks, mute, lock |

DTLS roles work with mbedTLS. Zinc offers `a=setup:active` (it is the DTLS client, as today). As the answerer to Pion's `actpass` it
answers `active`, so Zinc is always the client, and the fragmented-ClientHello problem with Chrome's PQ key share never comes up. In a
group, ask for **VP8 and Opus** (`"codecs":["vp8","opus"]`, Galène's default). VideoToolbox H.264 stays for P2P.

### 5.2 Share links and deep links

- **The link**: `https://call.example.org/group/<room>/?token=<t>`, Galène's own invite format. It works in any browser with no install.
- **The token**: a stateful Galène token created by the call server with `POST /galene-api/v0/.groups/<room>/.tokens/`. It carries an
  expiry (default 24 h, `--hours`), the `present` permission, and optionally a username and a use count. `/revoke` or `DELETE` kills it.
  Room ids are 10 random base32 characters (50 bits), so a room cannot be guessed even without its token. The token is the secret.
- **Opening the app**: `static/join.html` (our overlay in Galène's `-static` directory, no server code). The link
  `https://call.example.org/join.html#<room>/<t>` offers **Open in the Zinc app** (`zinc-call://call.example.org/<room>?token=<t>`) and
  **Join in the browser** (the Galène link). Once the app is installed, the join page remembers the choice (localStorage). The fragment never
  reaches the server's logs.
- **iOS**: the custom scheme works now through SDL's dropped URLs (`zinc-next-ios.md`). Universal links need the Associated Domains
  entitlement, which needs a paid Apple team, so that part waits for the owner. Galène refuses paths with `/.`, so `/.well-known/apple-app-site-association`
  also needs a one-line upstream change or the Zinc server on another port: a `later.md` line.

### 5.3 Security

- **TLS everywhere**: a Let's Encrypt certificate for Galène's port 443 (the call server renews it at 30 days and restarts Galène, which
  reads `data/cert.pem` at start). No plain HTTP except the ACME challenge and the redirect.
- **The owner's authority**: an `admin` user in Galène's `data/config.json` with a 32-byte random password, kept in `data/` (0600) and
  used only by the call server over `https://127.0.0.1`. An `op` user per room for moderation in the web UI. `allowAdminOrigin` unset, so
  no browser origin may call the admin API.
- **Links**: they expire and can be revoked, and room names cannot be guessed.
- **TURN**: credentials only for joined clients. **Restrict relayed peers to the server's own addresses.** pion/turn has a
  `PermissionHandler` that Galène does not set: propose it upstream, and until then add a firewall egress rule from the relay port range,
  which the call server prints. With coturn: `use-auth-secret`, `denied-peer-ip` for the private ranges, `no-multicast-peers`.
- **Abuse**: Galène has DoS hardening (1.1) and token checks. The call server sets the group's `max-clients` (default 25) and `autokick`.
  A per-IP join rate limit needs a proxy: a `later.md` line.
- **End-to-end encryption, not v1.** The server is the user's own machine, and that is the trust model of self-hosting. The plan after v1:
  - SFrame (RFC 9605) per room, keyed from a secret in the link's **fragment** (`#k=…`, never sent to the server), so the SFU forwards
    what it cannot read.
  - In the Zinc client, SFrame sits between the encoder and the packetizer (mbedTLS AES-GCM through PSA; the VP8 descriptor and the first
    bytes stay clear so the SFU can still switch layers, as Jitsi does). In the browser, it uses `RTCRtpScriptTransform` (Safari 15.4+,
    Firefox 117+, Chrome).
  - That needs a change to Galène's web client.
  - MLS (RFC 9420) for rotating keys when people leave is what Discord's DAVE does (libdave, MIT, on mlspp). It comes after SFrame.

## 6. Bad networks, layer by layer

### 6.1 Target numbers

What it costs to carry audio. Per packet: IPv4 20 + UDP 8 + RTP 12 + SRTP tag 10 + header extensions ≈ 8, so **≈ 58 bytes**.

| ptime | packets/s | overhead | + Opus | on the wire |
|---|---|---|---|---|
| 20 ms | 50 | 23.2 kbit/s | 12 kbit/s | ≈ 35 kbit/s |
| 40 ms | 25 | 11.6 kbit/s | 10 kbit/s | ≈ 22 kbit/s |
| **60 ms** | 16.7 | **7.7 kbit/s** | **10 kbit/s + FEC** | **≈ 18-20 kbit/s** |

So "usable at 20 kbit/s" requires **ptime 60 ms when the estimate is low**. At 20 ms the headers alone eat the budget. TURN over TCP adds
about 3 kbit/s at 60 ms.

| Condition (measured with the harness of task K1) | Target |
|---|---|
| Audio, 20 kbit/s cap, 10 % random loss, 100 ms RTT | continuous speech; concealed ≤ 3 % of samples after FEC; no gap > 120 ms |
| Audio, 20 % loss in bursts of 3 packets | concealed ≤ 6 % (FEC + deep PLC); with DRED between two Zinc clients ≤ 3 % |
| Audio latency, 100 ms RTT, 30 ms jitter | mouth to ear ≤ 250 ms; jitter buffer settles at 2 × p95 jitter, clamped 40 to 300 ms |
| Video, link drops 2 Mbit/s → 300 kbit/s | sender under the new rate in ≤ 2 s; audio never stops; 320x180 or 640x360 at 15 fps |
| Video, ramp back up | full rate in ≤ 10 s |
| Video, 5 % random loss | no freeze > 500 ms; ≤ 1 PLI per second; NACK repairs most loss (keyframes rare) |
| Below 60 kbit/s total | video paused (receiver asks audio only), audio kept |
| Network change (Wi-Fi → 4G) | media back in ≤ 3 s through ICE restart (`renegotiate`), no rejoin |
| Server | a 6-person 360p meeting on a Pi 4; idle RSS < 50 MB (to measure in K3) |

### 6.2 The layers

| Layer | Mechanism | Today | After the tasks |
|---|---|---|---|
| Path | ICE: host, srflx, relay; TURN over UDP and TCP 1194; TURN over TLS 443 (coturn, optional) | STUN/TURN in libjuice | + Galène TURN, + coturn guide (K3) |
| Path | ICE restart on failure or network change | none | `renegotiate` + libdatachannel's new local description (K4) |
| Repair | NACK: receiver asks, sender (or SFU cache) resends | answers only | generates NACKs (K7a); Galène caches and resends on the short leg |
| Repair | PLI/FIR on a broken frame, rate limited | PLI after 100 ms gap | PLI only when NACK gives up (K7a) |
| Audio | Opus in-band FEC (LBRR) | encoded, never decoded | decoded on loss; `PACKET_LOSS_PERC` follows RR loss (K6a) |
| Audio | Opus DTX, ptime 20/40/60 by estimate, 6-32 kbit/s | fixed 32 kbit/s, 20 ms | ZN-891's low-data mode + automatic switch (K6a) |
| Audio | Deep PLC and DRED (Opus 1.6, `--enable-deep-plc`, `--enable-dred`; models ≈ 600 kB) | plain PLC | deep PLC everywhere; DRED between Zinc clients, which carries through the SFU untouched (K6a) |
| Audio | Adaptive jitter buffer with time stretching (Sonic, Apache-2.0) | fixed 60 ms | target from measured jitter, accelerate or stretch (K6b) |
| Audio | Echo cancellation, noise suppression, AGC | none | Apple VoiceProcessingIO on macOS/iOS (K8); webrtc-audio-processing elsewhere (cross pass) |
| Rate | Receiver-side estimate (inter-arrival delay + loss) → REMB | fixed REMB | libwebrtc's single-stream remote estimator, ported (K7a) |
| Rate | Sender: min(REMB, loss-based), resolution and frame-rate ladder | bitrate only | ladder 720p30 → 360p30 → 360p15 → 180p15 → 90p7 → off (K7a) |
| Layers | VP8 temporal layers (TID), PictureID; rid simulcast (2 layers) to Galène | none | own VP8 descriptor, libvpx `ts_number_layers` 2, two encoders (K7b) |
| Layers | Receiver chooses: `video-low` for thumbnails, audio only for unseen tiles (adaptive stream) | — | the Galène client's `request` (K4) |
| Measure | getStats, quality score, panel | stats overlay | ZN-891, then the scores the harness asserts |

## 7. Can it reach Google Meet or kMeet quality?

Both rely on libwebrtc in the client: Chrome, or `react-native-webrtc` for Jitsi's mobile apps. Meet's server is Google's SFU with VP9/AV1
SVC. kMeet is Infomaniak's hosted Jitsi Meet, whose videobridge does simulcast, VP9 and AV1 SVC (full SVC by default since 2024,
[Jitsi](https://jitsi.org/blog/av1-and-more-how-does-jitsi-meet-pick-video-codecs/)), last-N (forward only the N most recent speakers'
video), and P2P for 1:1.

| What makes their quality | Zinc native client today | Our browser client gets, free | Piece to close the gap (licence, size, effort) |
|---|---|---|---|
| SFU with simulcast/SVC layer switching | none (P2P) | Galène's client sends simulcast; Galène switches | Galène (MIT); Zinc rid simulcast + VP8 TID (K7b, M). VP9/AV1 SVC encoding: libvpx VP9 SVC is in the tree but CPU-heavy, so later |
| Dynacast / last-N / adaptive stream | none | partly (Galène's client requests per tile) | `request` per tile (K4). Galène never stops a publisher's unused layer (a `later.md` line) |
| GCC with transport-cc | follows REMB only; its own REMB is fixed | Chrome's GCC, **but Galène negotiates no transport-cc**, so even Chrome falls back to REMB + loss there | port libwebrtc's `remote_bitrate_estimator` single-stream (BSD-3, ≈ 1.5 k lines, M) (K7a). transport-cc on both sides would need Galène changes: later |
| NetEQ jitter buffer, PLC, time stretching | fixed 60 ms, plain PLC, FEC unused | NetEQ | Opus FEC decode + deep PLC (Opus 1.6, BSD, + ≈ 1 MB measured later) (K6a); adaptive buffer + Sonic (Apache-2.0, 1 C file, ≈ 40 kB) (K6b). Vendoring NetEQ itself (BSD, but abseil + rtc_base, several MB, L) is rejected for now |
| AEC3, noise suppression, AGC2 | none (speaker off) | Chrome: AEC3/NS/AGC2; Safari: the system's | Apple VoiceProcessingIO, 0 bytes (K8, S-M); webrtc-audio-processing 2.1 (BSD-3, freedesktop, meson + abseil, ≈ 1-2 MB, M) for Linux/Windows/Android in the cross pass; RNNoise (BSD-3) for ML denoising later |
| Opus RED (RFC 2198) | none | Chrome supports it, Galène does not offer it | in-band FEC + DRED cover it between Zinc clients; RED needs Galène to offer `red/48000/2`: later |
| Opus FEC, DTX | FEC sent at a fixed 5 %, DTX off | yes | K6a |
| NACK/RTX | answers NACKs, never sends them | yes | NACK generator (RFC 4585, ≈ 200 lines in the plugin) (K7a) |
| ULPFEC / FlexFEC | none | libwebrtc has them; Galène does not offer them | not needed at RTT < 200 ms with NACK; later |
| Adaptive resolution and frame rate | bitrate only | libwebrtc's quality scaler | ladder in the plugin (K7a) |
| Hardware codecs | VideoToolbox H.264 (P2P) | browser's | VP8 in the SFU; V4L2/MediaCodec in the cross pass |

**An honest target.**

- **The browser client on Galène reaches "good Jitsi" quality**: it runs libwebrtc, and Galène does the SFU work. What is left is Galène's
  simpler congestion control: REMB + loss rather than transport-cc, and no RED. That is close to what Meet was around 2017 to 2018 and is
  fine for 2 to 20 people.
- **The Zinc native client is well below that today.** On a lossy link it freezes (no NACK), turns to blocks (no resolution ladder),
  clicks (FEC unused, fixed buffer), and needs a headset (no AEC).
- **After K6a, K6b, K7a, K7b and K8 it should reach the browser client's level on Galène** for 1:1 and small groups. Audio can do better
  than the browser between two Zinc clients thanks to DRED.
- **Real Meet parity is out of reach without vendoring large parts of libwebrtc** or moving the SFU to one with transport-cc and RED
  (LiveKit). The remaining gaps are NetEQ-grade jitter handling, transport-cc GCC with probing, and SVC encoding.
- **The biggest gaps, in order of what users hear and see:**
  1. no echo cancellation;
  2. no NACK (freezes);
  3. FEC never decoded and a fixed jitter buffer (clicks under loss);
  4. no receiver estimate or resolution ladder (blocky video).

## 8. Zinc's server side against Node and Bun

**What the call server needs from `zinc:net`, after the decision above:** little. Galène serves the public traffic. Zinc serves the ACME
challenge on :80 and makes localhost calls to the admin API. The gaps below therefore matter for every other Zinc server (the `service`
template, `app/hub-server`, a future `zinc:link` relay), not for the call path. **One correction to the brief: there is a WebSocket server,
`serveWebSocket` in `zinc:socket`**, written in Zinc on a plain TCP listener.

| Need | Node (libuv + llhttp + OpenSSL) | Bun (uSockets/uWebSockets + BoringSSL) | zinc:net today | To close it |
|---|---|---|---|---|
| Keep-alive, pipelining | yes | yes | **no: closes after each reply** | keep the connection, reset llhttp (K10) |
| Connections | OS limits; `server.maxConnections` | OS limits | **32 for the whole process** | configurable, default 10 000 (K10) |
| Header limits | 16 KB (`--max-http-header-size`) | yes | 16 KB → 431 | keep |
| Slowloris | `headersTimeout` 60 s, `requestTimeout` 300 s | idle timeout | 10 s idle per block (one byte resets it) | a total deadline for the headers (10 s) and the body (K10) |
| Body | streamed | streamed | buffered, 64 MB cap | per-server `maxBody` option, default 1 MB (K10); streaming later |
| Per-IP limits, rate limits | none built in (middleware) | none built in | none | per-IP connection cap + token bucket option (K10) |
| WebSocket server | `ws` package (JS) | built in (C++, pub/sub) | Zinc framing, no TLS, **no max payload** | wslay (MIT, C, by nghttp2's author, Autobahn-tested) behind llhttp's upgrade, `maxPayload` 1 MB, wss through the same TLS (K10) |
| TLS | OpenSSL | BoringSSL | mbedTLS 4 (one stack, D131) | keep mbedTLS. uWebSockets is rejected: it supports only OpenSSL, BoringSSL or WolfSSL, which would be a second TLS stack |
| ACME | packages (greenlock, acme-client) | packages | none | ACME client in `zinc:net` on mbedTLS (K11) |
| HTTP/2 | nghttp2 | yes | no | nghttp2 (MIT) only if a measured need appears; not for signalling (`later.md`) |

**Published numbers** ([bun.com](https://bun.com/), Linux, EPYC 9R14 64 vCPU):

- Express hello over HTTPS: Bun 1.4 48 243 req/s, Node 26.7 25 181.
- WebSocket chat: Bun 159 379 msg/s (send) and 4.17 M (publish), Node with `ws` 123 486.

**How uWebSockets gets its speed**
([uWebSockets](https://github.com/uNetworking/uWebSockets)):

- **corking**: writes are batched into one syscall per loop turn;
- **no allocation per request**, with its own parser;
- **one loop per core** on a shared port;
- **raw epoll/kqueue**.

Zinc can take the first three ideas on libuv: `uv_try_write`/writev batching, pooled connection objects, and `SO_REUSEPORT` workers later.
It cannot take uWebSockets itself without a second TLS stack.

**Benchmark plan (K9).** Bun and oha are local developer tools: installing them with brew is not a release step.

- **Tool**: `tools/bench-http` drives [oha](https://github.com/hatoo/oha) (MIT, Rust; `brew install oha`) against the same handlers in
  Zinc (`zinc:net`, AOT and interpreter), Node 24 (`node:http`) and Bun (`Bun.serve`) on the development Mac, alone (no build running, as
  AGENTS.md asks).
- **Cases**:
  1. hello (text, 13 bytes);
  2. JSON (1 KB `JSON.stringify`);
  3. a static 1 MB file (`file:`, Range);
  4. TLS hello (self-signed, `-k`);
  5. WebSocket echo (Bun's `bench/websocket-server` client, MIT, 32 clients);
  6. each with keep-alive and with `--disable-keepalive`.
- **Settings**: `-c 50 -z 10s`. Report req/s, p50, p99, errors, and RSS from `tools/resmon`.
- **Output**: the numbers go in `docs/reports/zinc-next-perf.md`, and the JSON in `docs/reports/bench/`.
- **Prediction, to be checked by K9**: today Zinc fails the keep-alive cases (`-c 50` is more than 32 slots: refused connections) and pays
  a handshake per request in the TLS case. After K10, Zinc's AOT should sit near Node on hello and JSON (the same libuv and llhttp).

## 9. Deploy: Pi, VPS, no Docker

```sh
# on the machine (a VPS with Debian/Ubuntu, or a Pi with the Zinc image), with a DNS name pointing at it
zinc run examples/webrtc-call/server -- setup --domain call.example.org --email me@example.org
#   fetches galene (pinned, sha256), writes data/ groups/ static/, gets the certificate, prints the systemd unit and the ufw lines
sudo cp call-server.service /etc/systemd/system/ && sudo systemctl enable --now call-server   # printed by setup, run by the owner
zinc run examples/webrtc-call/server -- link family --hours 48          # prints the link and a QR code
```

- **Ports**: 80/tcp (ACME, redirect), 443/tcp (HTTPS, WSS), 1194/udp+tcp (TURN), and one UDP port for media (Galène's UDP mux, e.g.
  10000).
- **The unit**: it runs as a `zinc` user with `AmbientCapabilities=CAP_NET_BIND_SERVICE` for 80 and 443, and `LimitNOFILE=65536`.
- **From the Mac**: `zinc device deploy examples/webrtc-call/server` to a paired machine running `zinc agent` does the same.
- **A Pi at home**: the same, plus three port forwards on the router and a dynamic DNS name. Without a domain, browsers warn on Galène's
  self-signed certificate. Zinc apps can pin its SHA-256 from the link (`#fp=`): a `later.md` line.
- **Size**: one `zinc`, one `galene` (to measure: a stripped `CGO_ENABLED=0` build; the build was not allowed in this session), a `data/`
  directory. No Docker, no database, no Node, no Redis.

## 10. Tasks

Thirteen tasks: ten for calls (K1-K8, with K6 and K7 in two parts each) and three for the server (K9-K11). Each task is one session on the
Mac. Cross-target checks go to `later.md`. The backlog is frozen, so the commit that adds them carries
`New-task: owner self-hosted calls with share links, Meet-level quality and the Zinc server against Node and Bun (2026-10-30)`. ZN-891
(stats panel, low-data mode) stays as it is: K6a builds on it.

| Key | Title | Module | Size | Depends |
|---|---|---|---|---|
| K1 | zinc:webrtc network impairment harness (loss, bursts, rate cap, delay, jitter) | plugins/webrtc, tests | S | — |
| K2 | Galène as a pinned tool: built, checksummed, installed by `zinc toolchain` | src/tc, tools | M | — |
| K3 | examples/webrtc-call/server: a call server that sets up and supervises Galène | examples, zinc:net, zinc:process | M | K2 |
| K4 | Galène protocol client in webrtc-call: join by link, publish, receive, ICE restart | examples/webrtc-call, zinc:webrtc | M | K2 |
| K5 | Share links that open the Zinc app or the browser | examples/webrtc-call, iOS shell | S | K3, K4 |
| K6a | Opus resilience: FEC decoded, loss-driven FEC, DTX, ptime 60, deep PLC and DRED | plugins/webrtc | M | K1, ZN-891 |
| K6b | Adaptive audio jitter buffer with time stretching (Sonic) | plugins/webrtc | M | K6a |
| K7a | NACK generation, receiver bandwidth estimate (REMB), resolution and frame-rate ladder | plugins/webrtc | M | K1 |
| K7b | VP8 temporal layers, full payload descriptor, rid simulcast for the SFU | plugins/webrtc | M | K7a, K4 |
| K8 | Echo cancellation, noise suppression and AGC on macOS/iOS (VoiceProcessingIO) | plugins/microphone, plugins/audio | M | — |
| K9 | tools/bench-http: zinc:net against Node and Bun with oha | tools, docs | S | — |
| K10 | zinc:net server: keep-alive, limits, slowloris deadline, native WebSocket with wss | src/host, plugins/socket | M | K9 |
| K11 | ACME (Let's Encrypt) certificates in zinc:net | src/host, lib | M | — |

Ready to import (`tools/tasks-import webrtc-selfhost.json`). The milestone and ordinal are left to the coordinator:

```json
{
  "tasks": [
    {"key": "rtc-impair", "title": "zinc:webrtc: network impairment harness for calls on bad links", "size": "S", "labels": ["media", "net"],
     "description": "Every resilience target of docs/reports/webrtc-selfhost-design.md §6.1 needs a repeatable bad network without root (no dummynet). ZINC_WEBRTC_IMPAIR='loss=10,burst=3,rate=20k,delay=50,jitter=30,seed=1' applies seeded loss, Gilbert-Elliott bursts, a token-bucket rate cap, delay and jitter to the outgoing SRTP/SRTCP packets of the native plugin (the loopback and real peers). A test script runs the webrtc-call echo for 20 s under a profile and prints getStats numbers (concealedSamples, packetsLost, freezes, bitrate) as one JSON line.",
     "ac": ["ZINC_WEBRTC_IMPAIR applies loss, bursts, rate cap, delay and jitter to sent packets, seeded and repeatable", "tests/t1/webrtc_impair.sh runs the echo call under 3 profiles (clean, 10% loss at 20 kbit/s, 2 Mbit/s to 300 kbit/s step) and prints the stats as JSON", "The baseline numbers of today's plugin are written in docs/reports/zinc-next-perf.md"]},
    {"key": "galene-tool", "title": "Galène media server as a pinned tool of zinc toolchain", "size": "M", "labels": ["net", "media", "toolchain"],
     "description": "D-record: Galène (MIT, Go/Pion) is the SFU of self-hosted calls (webrtc-selfhost-design.md §3). Upstream ships no binaries: tools/build-galene builds a pinned tag (galene-1.2.1) with the pinned Go, CGO_ENABLED=0 -ldflags='-s -w', for darwin-arm64, linux-arm64, linux-armv7, linux-amd64, with sha256 and LICENCE; zinc toolchain knows the tool (URL of the Zinc release asset, checksum) and installs it under ZINC_HOME. Publishing the assets is the owner's step (exact command in the notes).",
     "ac": ["tools/build-galene builds the four targets reproducibly and prints their sha256 and sizes", "zinc toolchain install galene installs and verifies it from a local file URL in the test (no network in tests)", "Binary sizes and idle RSS on the Mac recorded; decision record written with the scores of §3.2"]},
    {"key": "call-server", "title": "examples/webrtc-call/server: one-command self-hosted call server", "size": "M", "labels": ["net", "media"], "deps": ["galene-tool"],
     "description": "A Zinc service app that sets up, supervises and administers Galène: setup --domain writes data/config.json (admin user, random secret, 0600), groups/<room>.json (vp8+opus, max-clients, autokick), ice-servers.json (optional coturn with hmac-sha1), a static/ overlay with join.html; starts galene with -http :443 -turn :1194 -udp-range <one port> through zinc:process and restarts it on exit; link <room> [--hours] creates a token through /galene-api/v0/.groups/<room>/.tokens/ and prints the URL and a QR code (zinc:qrcode); prints the systemd unit (CAP_NET_BIND_SERVICE) and firewall lines; a TURN egress rule limited to the server's own addresses.",
     "ac": ["setup then run on the Mac serves a working group: Galène's web client in headless Chrome joins with a printed link", "link creates an expiring token; an expired or revoked token is refused", "Galène is restarted when it dies; the call server stops it on exit (no process left)", "README: Pi and VPS deploy, ports, systemd, coturn for TURN over TLS 443"]},
    {"key": "galene-client", "title": "webrtc-call: Galène protocol client (join by link, publish, receive, ICE restart)", "size": "M", "labels": ["net", "media"], "deps": ["galene-tool"],
     "description": "src/galene.ts in examples/webrtc-call speaks Galène protocol v2 on zinc:socket WebSocket and zinc:webrtc: .status, handshake, join with token, one PeerConnection per stream (publish camera and screen, answer down streams), request per tile (video for the speaker, video-low for thumbnails, audio only for hidden tiles), ping every 10 s, reconnect with backoff, renegotiate with ICE restart on ICE failure; a grid of remote tiles. The app takes a link (CALL_LINK or a field). zinc:webrtc gains restartIce() where it is missing.",
     "ac": ["A Zinc app and Chrome (Galène web client, tools/cdp.py) see and hear each other through a local Galène", "Three participants (2 Zinc, 1 Chrome) with request-driven layers; hiding a tile stops its video bytes (stats)", "Killing the network for 5 s (K1 profile or interface down) recovers media without rejoining"]},
    {"key": "call-links", "title": "Share links that open the Zinc app or join in the browser", "size": "S", "labels": ["net", "ui"], "deps": ["call-server", "galene-client"],
     "description": "join.html (static overlay) reads #<room>/<token> and offers Open in the Zinc app (zinc-call://host/room?token=) or Join in the browser (/group/<room>/?token=), remembering the choice; webrtc-call registers the zinc-call scheme (macOS Info.plist, iOS) and joins from an opened URL. Universal links (paid Apple team) and /.well-known through Galène go to later.md.",
     "ac": ["Opening a zinc-call:// URL starts or focuses webrtc-call and joins the room", "join.html in headless Chrome forwards to Galène's client with the token", "The link printed by the call server uses join.html; documented in the README"]},
    {"key": "opus-resilience", "title": "zinc:webrtc: Opus FEC decoding, loss-driven FEC, DTX, 60 ms packets, deep PLC and DRED", "size": "M", "labels": ["media", "perf"], "deps": ["rtc-impair", "ZN-891"],
     "description": "On a missing packet with the next one present, decode with decode_fec=1; OPUS_SET_PACKET_LOSS_PERC follows the loss of receiver reports; DTX on in the low-data mode; ptime 20/40/60 chosen from the estimate (a=maxptime honoured); libopus built with --enable-deep-plc and --enable-dred (Opus 1.6 models), DRED negotiated only between Zinc peers; size cost measured.",
     "ac": ["Under 10% random loss at 20 kbit/s (K1) concealed samples <= 3% and no gap > 120 ms", "Under 20% loss in bursts of 3, concealed <= 6%, <= 3% with DRED between two Zinc clients", "Audio stays under 20 kbit/s on the wire in the low-data mode (stats); plugin size delta recorded"]},
    {"key": "jitter-buffer", "title": "zinc:webrtc: adaptive audio jitter buffer with time stretching", "size": "M", "labels": ["media"], "deps": ["opus-resilience"],
     "description": "Replace the fixed 60 ms audio buffer: target = 2 x p95 inter-arrival jitter, clamped 40 to 300 ms; shrink and grow by time-scaling speech with Sonic (Apache-2.0, vendored under plugins/webrtc/vendor with PIN) instead of dropping or inserting silence; jitterBufferDelay and jitterBufferTargetDelay in getStats.",
     "ac": ["With 30 ms jitter the buffer settles near 60-80 ms; with none it returns to 40 ms within 10 s", "No click or gap when it resizes (no zero runs in the decoded output, test)", "Mouth-to-ear <= 250 ms at 100 ms RTT and 30 ms jitter, measured with the loopback"]},
    {"key": "video-bwe", "title": "zinc:webrtc: NACK generation, receiver bandwidth estimate and resolution ladder", "size": "M", "labels": ["media", "net", "perf"], "deps": ["rtc-impair"],
     "description": "The receiver sends generic NACKs (RFC 4585) for gaps, retries with RTT, gives up into PLI; a receiver-side estimate ported from libwebrtc's single-stream remote bitrate estimator (inter-arrival, trendline/overuse detector, AIMD; BSD-3, files listed in PIN) drives the REMB it sends instead of a fixed value; the sender uses min(REMB, loss-based) and a ladder (720p30, 360p30, 360p15, 180p15, 90p7, off) with hysteresis; libdatachannel's VP8 N bit on delta frames is not trusted.",
     "ac": ["At 5% loss: no freeze > 500 ms and <= 1 PLI per second (stats)", "On a 2 Mbit/s to 300 kbit/s step the sender is under the cap in <= 2 s and back to full rate in <= 10 s after it lifts", "The resolution and frame rate follow the ladder (stats frameWidth, framesPerSecond)"]},
    {"key": "vp8-layers", "title": "zinc:webrtc: VP8 temporal layers, full payload descriptor, rid simulcast", "size": "M", "labels": ["media"], "deps": ["video-bwe", "galene-client"],
     "description": "Our VP8 packetizer writes PictureID (15 bit), TL0PICIDX, TID and Y (RFC 7741) and a correct N bit; libvpx with ts_number_layers 2; setParameters takes two encodings (rid h and l, the low one ~100 kbit/s at quarter size) sent with the rid header extension (RtpPacketizationConfig ridId), as Galène expects.",
     "ac": ["Galène forwards the low layer to a client that requests video-low (stats show the smaller size)", "Chrome decodes the stream with the new descriptor (tools/webrtc-interop)", "Encode cost of the two layers on the Mac recorded in the perf log"]},
    {"key": "voice-processing", "title": "Echo cancellation, noise suppression and AGC on macOS and iOS", "size": "M", "labels": ["media", "audio"],
     "description": "zinc:microphone gets echoCancellation/noiseSuppression/autoGainControl constraints (getUserMedia) backed by Apple's VoiceProcessingIO audio unit, with playback of zinc:audio's call stream routed through it so the reference signal is right; webrtc-call turns the speaker on by default in room calls. Linux/Windows/Android (webrtc-audio-processing 2.1, BSD-3) go to the cross-platform pass line.",
     "ac": ["With echoCancellation the far side hears no echo of its own voice from the Mac's speakers (scripted: play a known signal, measure its level in the sent audio, >= 25 dB down)", "Constraints off gives today's raw capture", "Documented in docs/plugins/microphone.md"]},
    {"key": "http-bench", "title": "tools/bench-http: zinc:net against Node and Bun", "size": "S", "labels": ["perf", "net"],
     "description": "Same handlers in Zinc (AOT, interpreter), Node 24 and Bun: hello, 1 KB JSON, 1 MB static file, TLS hello, WebSocket echo (Bun's bench client, 32 clients), each with and without keep-alive; oha -c 50 -z 10s; req/s, p50, p99, errors, RSS (tools/resmon); JSON in docs/reports/bench/, numbers in zinc-next-perf.md. Run alone on a quiet machine.",
     "ac": ["tools/bench-http runs the five cases on the three runtimes and writes one JSON", "The baseline is in docs/reports/zinc-next-perf.md with the machine and versions"]},
    {"key": "net-server-hardening", "title": "zinc:net server: keep-alive, limits, slowloris deadline, native WebSocket with wss", "size": "M", "labels": ["net", "perf", "security"], "deps": ["http-bench"],
     "description": "Keep-alive and pipelining (llhttp reset, Connection header honoured); connection cap configurable (default 10000) and per-IP cap; a header deadline (10 s total) and a body deadline; maxBody per server (default 1 MB); write batching per loop turn; a WebSocket server in C++ behind llhttp's upgrade with wslay (MIT, vendored), maxPayload (1 MB default) and wss through the same mbedTLS; zinc:socket serveWebSocket moves onto it with the same API.",
     "ac": ["bench-http: no errors at -c 50 with keep-alive; numbers before and after in the perf log", "Regression tests: 33+ concurrent connections, a 1-byte-every-9-s client is cut at 10 s, a frame above maxPayload closes with 1009", "wss:// echo works with a browser (headless Chrome) and webrtc-chat's signal server runs unchanged"]},
    {"key": "acme", "title": "Let's Encrypt certificates in zinc:net (ACME HTTP-01)", "size": "M", "labels": ["net", "security"],
     "description": "RFC 8555 client in zinc:net on mbedTLS (P-256 account key, ES256 JWS, CSR with x509write_csr): net.certificate({domains, email, dir, staging}) answers HTTP-01 on :80 through serve(), stores account and certificate in dir (0600), renews 30 days before expiry and calls back; tested against Pebble (Let's Encrypt's test server, MPL-2.0) run locally, never the real CA in tests.",
     "ac": ["A certificate is issued by a local Pebble and serve() uses it", "Renewal happens when fewer than 30 days remain (clock injected in the test)", "The call server's setup uses it; docs in docs/guide for any zinc:net server"]}
  ]
}
```

Lines for `backlog/later.md` (for the coordinator):

- Self-hosted calls: SFrame E2EE with the key in the link fragment (Zinc client between encoder and packetizer, browser via
  RTCRtpScriptTransform in Galène's client), then MLS key rotation.
- Self-hosted calls: webrtc-call exported with `--target web` speaking the Galène protocol as an alternative browser client.
- Self-hosted calls: universal links on iOS (Associated Domains, paid team) and `/.well-known` through Galène (upstream patch).
- Self-hosted calls: upstream to Galène: a TURN `PermissionHandler` limited to its own addresses; offering `red/48000/2`; stopping unused
  simulcast layers (dynacast).
- Self-hosted calls: certificate pinning (`#fp=`) for a Pi without a domain.
- Self-hosted calls: per-IP join rate limit in front of Galène.
- Cross-platform pass: webrtc-audio-processing 2.1 for AEC/NS/AGC on Linux, Windows and Android; Galène on a Pi 3 and Pi 4 (6-person 360p
  meeting, RSS).
- zinc:net: HTTP/2 through nghttp2 only if a measured need appears; streaming request bodies.
- zinc:webrtc: transport-cc feedback and send-side GCC if the SFU moves to LiveKit; VP9/AV1 SVC encoding.
- Objective audio quality (ViSQOL, Apache-2.0) in the impairment harness instead of concealment counts.

## 11. Sources

Checked in this session:

- Galène: [galene.org](https://galene.org/), [README](https://github.com/jech/galene/blob/master/README.md),
  [protocol](https://github.com/jech/galene/blob/master/galene-protocol.md), [admin API](https://github.com/jech/galene/blob/master/galene-api.md),
  [install](https://github.com/jech/galene/blob/master/galene-install.md), [CHANGES](https://github.com/jech/galene/blob/master/CHANGES) (1.2.1,
  2026-09-08), [1.0 announcement](https://lists.galene.org/galene/87ee7uoeff.wl-jch@irif.fr/T/). The source was read at master for its
  RTCP feedback (`group/group.go`: goog-remb, nack, pli, fir), its rate control (`rtpconn/rtpconn.go` `updateRate`), its TURN
  (`turnserver/turnserver.go`) and its routes (`webserver/webserver.go`).
- Galène with coturn (`hmac-sha1`): [openSUSE package ice-servers.json](https://build.opensuse.org/projects/openSUSE/packages/galene/files/ice-servers.json?expand=0).
- LiveKit: [deployment](https://docs.livekit.io/home/self-hosting/deployment/); the release assets of v1.13.11 (GitHub API, 2026-10-30).
- Opus 1.6: [opus-codec.org/demo/opus-1.6](https://opus-codec.org/demo/opus-1.6) (DRED models 600 kB, deep PLC, OSCE/BWE);
  [Gentoo bug 926174](https://bugs.gentoo.org/926174) (the build flags of 1.5 and their size).
- webrtc-audio-processing: [freedesktop GitLab](https://gitlab.freedesktop.org/pulseaudio/webrtc-audio-processing) (tags v2.1 of
  2025-01-22, v2.0).
- Jitsi: [AV1 and more: how does Jitsi Meet pick video codecs?](https://jitsi.org/blog/av1-and-more-how-does-jitsi-meet-pick-video-codecs/).
- Bun's benchmark: [bun.com](https://bun.com/). uWebSockets: [GitHub](https://github.com/uNetworking/uWebSockets).

From knowledge, not checked again in this session (verify while working the task):

- mediasoup ISC; Janus GPL-3.0; Jitsi Videobridge Apache-2.0; ion-sfu archived; SRS MIT; coturn BSD-3; eturnal Apache-2.0.
- Sonic (Apache-2.0, github.com/waywardgeek/sonic); wslay (MIT, github.com/tatsuhiro-t/wslay); nghttp2 (MIT); oha (MIT); RNNoise (BSD-3);
  Pebble (MPL-2.0); libdave (MIT).
- RFCs 2198 (RED), 4585 (NACK, PLI), 7741 (VP8 RTP), 8555 (ACME), 8851/8853 (rid, simulcast), 9420 (MLS), 9605 (SFrame); and
  draft-ietf-rmcat-gcc-02 (GCC).
