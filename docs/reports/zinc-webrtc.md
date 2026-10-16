# WebRTC and the microphone in Zinc (2026-10-16)

Owner's order: the microphone and WebRTC data channels first, audio and video tracks next (below, 2026-10-16). What we need: a single `zinc` binary plus
prebuilt plugins (no developer tools on a teacher's or an artist's machine), hardware down to a Raspberry Pi, licences that allow
vendoring, a small archive. Plugins build with the pinned zig and no system library (`next/src/tc/plugin_build.cpp`, `docs/plugins.md`).

## WebRTC stack: the options

Scores 1-5, weights of `next/RULES.md` section 4 (fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability
x1, effort x1; 70 at most).

| option | fit | perf | size | maint | licence | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **libdatachannel** (C++17, MPL-2.0) + libjuice (C, MPL-2.0) + usrsctp (C, BSD) + the engine's mbedTLS | 5 | 4 | 4 | 4 | 4 | 5 | 4 | **60** |
| libpeer (C, MIT; mbedTLS, usrsctp, libsrtp, cJSON; aimed at ESP32) | 3 | 4 | 5 | 3 | 5 | 3 | 3 | 53 |
| a WebSocket relay only (zinc:socket, no WebRTC) | 1 | 3 | 5 | 5 | 5 | 5 | 5 | 52 |
| libwebrtc (Google, BSD; GN, depot_tools, its own clang and BoringSSL) | 3 | 5 | 1 | 1 | 4 | 3 | 1 | 40 |
| Pion (Go, MIT) as a c-shared library | 2 | 3 | 2 | 3 | 5 | 3 | 2 | 40 |
| webrtc-rs (Rust, MIT/Apache) | 2 | 3 | 2 | 2 | 5 | 3 | 2 | 38 |

- **libdatachannel**: data channels and RTP tracks, a C API that hides its exceptions, ICE with STUN/TURN through libjuice (whose own
  HMAC-SHA1 and CRC32 need no crypto library), DTLS through OpenSSL, GnuTLS or mbedTLS, SCTP through usrsctp; libsrtp only for media
  (`NO_MEDIA`). Used in production (OBS's WHIP output, game engines), interoperates with browsers. MPL-2.0 is file-level: vendored files stay
  unmodified and their source ships with the plugin. Its mbedTLS 4 support (PR #1599, PSA Crypto) is on master only: we pin commit
  bdc5ff28 (after v0.24.6), the first with it.
- **libpeer** is the path for an ESP32 later (it is built for one), but it has one peer connection and a smaller API.
- **libwebrtc** has everything (media, congestion control, echo cancellation) and cannot be built with the pinned zig: tens of MB and its
  own toolchain. **Pion** and **webrtc-rs** need a Go or a Rust toolchain and ship a runtime in a plugin.
- The WebSocket relay is not WebRTC (no peer-to-peer, no browser interop, a server always), but it is the signalling of the demo.

**Decision**: libdatachannel with libjuice and usrsctp, against the engine's mbedTLS, built with `RTC_ENABLE_MEDIA=0` (1 since the media tracks, below) and
`RTC_ENABLE_WEBSOCKET=0` (`zinc:socket` has WebSockets). Revisit when libdatachannel releases a version with mbedTLS 4 (move the pin to
the tag), or for an ESP32 build (libpeer).

## How it fits the plugin build (checked)

- **TLS**: one stack. The engine vendors mbedTLS 4.0.0; libdatachannel compiles against it unchanged. Three options are turned on in the
  engine's configuration: `MBEDTLS_THREADING_C` and `MBEDTLS_THREADING_PTHREAD` (libdatachannel calls PSA from its threads and refuses to
  build without them) and `MBEDTLS_SSL_DTLS_SRTP` (it sets the SRTP profiles even for data channels). The plugin resolves the mbedTLS
  symbols in the zinc that loads it (or in the program, compiled ahead of time, which links the engine's library); the engine keeps the
  certificate writer (`x509write_crt`, nothing else calls it) in its binary (`src/host/tls.cpp`). No OpenSSL, no second TLS copy.
- **Build**: 74 files (31 C++ of libdatachannel, 21 C of libjuice, 22 C of usrsctp) as vendored sources of the plugin, with a new manifest
  key, `vendorFlags`, for `-frtti -fexceptions -fthreadsafe-statics`: libdatachannel needs RTTI (`dynamic_cast`) and exceptions, the
  plugin's own code is built against zrt without RTTI and could not take them. `-g0`: zig adds DWARF by default, which made the archive
  35 MB. Measured on the development Mac (arm64): about a minute for the first build, 2 s after.
- **Size** (measured): the plugin library 3.5 MB (1.0 MB compressed), the archive for compiled programs 3.9 MB (1.1 MB); about 2.2 MB more
  in the CLI archive with the prebuilt libraries. With the media (below): 3.7 MB compressed.
- **Pi and Linux**: the Linux defines are written (usrsctp's `HAVE_*` checks differ from macOS's), not built yet (cross-platform pass).

## Audio capture

miniaudio is vendored already (`plugins/audio/vendor`, playback): `zinc:microphone` captures with it (Core Audio, PulseAudio, ALSA),
compiling the same `miniaudio_impl.c`. macOS's privacy question goes through AVFoundation, never from a background run.

## Audio and video tracks (2026-10-16)

The owner's order: a full WebRTC plugin, audio and video tracks included. Checked against the sources themselves, not memory: the tree of
the pinned libdatachannel commit, the release tags of libsrtp, opus and libvpx (GitHub API, 2026-10-16: libsrtp v2.8.1 of 2026-09-21,
opus v1.6.1, libvpx v1.17.0, openh264 v2.6.0), and runs against headless Chrome.

### libdatachannel's media side (commit bdc5ff28)

- **Packetizers and depacketizers**: H.264, H.265, AV1, VP8, VP9 (`vp8rtppacketizer.cpp`, `vp9rtppacketizer.cpp`...) and the audio ones
  (`AudioRtpPacketizer<48000>` for Opus and AAC, `<8000>` for PCMU, PCMA, G.722); all reachable from the C API (`rtcSetVP8Packetizer`...).
- **RTCP**: `RtcpSrReporter` (sender reports, every second), `RtcpNackResponder` (answers the peer's NACKs from a packet store),
  `PliHandler` (PLI and FIR from the peer: a callback), `RembHandler` (the peer's REMB: a callback), `PacingHandler`, and
  `RtcpReceivingSession` (receiver reports, REMB, PLI or FIR on `rtcRequestKeyframe`, RTX unwrapping). No transport-cc and no send-side
  bandwidth estimation: a sender follows REMB or a fixed rate.
- **Found by using it**: the C API's setters *replace* a track's handler chain (`setMediaHandler`), so a packetizer and a depacketizer
  cannot both sit on a sendrecv track through it; the plugin keeps the packetizer and the RTCP handlers and puts received RTP packets back
  into frames itself (`native/media.cpp`; the reassembly is also the jitter buffer: 100 ms for a video gap, 60 ms for audio). The order of
  the chain matters: the receiving session consumes RTCP, so it is chained first (processed last on the way in) and the PLI and REMB
  handlers see the packets. The connection-level `MediaInterceptor` moves each message out of its list without putting the list back (a
  null message reaches the tracks and crashes): the plugin returns a copy, which leaves the original in place. A receiver report from
  libdatachannel carries a jitter of 0 and a DLSR of 0 (the round trip is still right: it answers each SR at once); its loss count can be off.
- **DTLS against Chrome**: mbedTLS refuses a fragmented ClientHello ("The requested feature is not available"), and Chrome's ClientHello
  (with its post-quantum key share) comes in fragments, so a libdatachannel peer on mbedTLS cannot be Chrome's DTLS server. Zinc's offers
  say `a=setup:active` (RFC 5763 lets the answer settle the roles), which makes Zinc the client in both directions.

### SRTP

| option | fit | perf | size | maint | licence | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **libsrtp 2.8.1, built-in crypto** (AES-ICM, HMAC-SHA1) | 5 | 4 | 5 | 4 | 5 | 5 | 5 | **65** |
| libsrtp with its OpenSSL engine (AES-NI, GCM) | 4 | 5 | 2 | 3 | 3 | 3 | 3 | 49 |
| libsrtp with its mbedTLS engine | 1 | 4 | 5 | 2 | 5 | 5 | 1 | 40 |

libdatachannel with mbedTLS negotiates only `SRTP_AES128_CM_HMAC_SHA1_80`, which the built-in crypto implements; libsrtp's mbedTLS engine
calls `mbedtls_aes_*`, which mbedTLS 4 no longer exports (PSA only), and OpenSSL would be a second TLS stack. BSD-3-Clause, 18 C files.

### Codecs

| video | fit | perf | size | maint | licence | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **H.264 through VideoToolbox** (macOS, iOS later) | 4 | 5 | 5 | 4 | 5 | 1 | 4 | **60** |
| **VP8 through libvpx 1.17**, generic C | 5 | 3 | 4 | 4 | 5 | 5 | 4 | **59** |
| H.264 through V4L2 M2M (Pi 1 to 4, `/dev/video11`) | 4 | 5 | 5 | 3 | 5 | 1 | 2 | 56 |
| VP9 through libvpx | 3 | 2 | 3 | 4 | 5 | 5 | 3 | 47 |
| H.264 through OpenH264 (Cisco's binary, downloaded at run time) | 3 | 3 | 4 | 3 | 2 | 3 | 2 | 41 |
| AV1 (libaom or SVT-AV1 to encode, dav1d to decode) | 2 | 1 | 1 | 3 | 5 | 3 | 2 | 32 |

| audio | fit | perf | size | maint | licence | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **Opus through libopus 1.6.1**, floating point | 5 | 5 | 4 | 5 | 5 | 5 | 5 | **68** |
| G.711 (PCMU), no library | 2 | 5 | 5 | 5 | 5 | 5 | 5 | 58 |

- **Interop**: every browser must take VP8 and H.264 constrained baseline (RFC 7742) and Opus (RFC 7874); Chrome, Firefox and Safari do.
  Checked against headless Chrome both ways (`tools/webrtc-interop`).
- **H.264 and patents**: Apple's encoder and decoder come with the system, so H.264 on a Mac costs nothing. In software the only free road
  is Cisco's OpenH264 *binary*: Cisco pays the MPEG LA (now Via LA) royalties only for a copy the end user's machine downloads from Cisco
  itself; a binary we ship, or OpenH264 built from source, is ours to license. That would be a second download path per platform at run
  time (with none for some of our targets), so software H.264 is not shipped: a peer that only has H.264 in software talks VP8.
- **VP8 cost**: libvpx's generic C build (no SIMD: one set of 81 files for every target) at speed -8, measured on the development Mac (Apple
  M1 Pro, the fake camera, 2026-10-16): 3.1 ms per 640x480 frame, 8.0 ms at 1280x720, 30 fps sent and decoded; H.264 through VideoToolbox
  4.6 and 9.6 ms (with our NV12 conversion and a synchronous wait). The fake camera's picture is easy to code: a real one costs more. A Pi 3
  has about a tenth of that: 320x240 there, V4L2 later.
- **Colours**: VideoToolbox's own BGRA conversion and its decoder's do not agree on a matrix (the bars came back off by up to 20 levels);
  the plugin converts to NV12 itself with the same BT.601 code as the VP8 path and writes BT.601 in the stream's VUI.

**Decision**: Opus and VP8 everywhere (royalty-free, every browser), H.264 in hardware first where the machine has it (VideoToolbox on
macOS now; V4L2 M2M on the Pi, MediaCodec and Media Foundation in the cross-platform pass), no software H.264; behind `VideoEncoder` and
`VideoDecoder` (`native/media.h`), two backends each. libsrtp's built-in crypto. Revisit: a browser that drops VP8, or a hardware encoder on
Linux desktops (VA-API).

### Size: one plugin

Measured with the prebuilt libraries `tools/package` ships (`zinc plugin-build webrtc --prebuild`, tar.gz): 2.18 MB for the data channels
alone, 3.73 MB with the media (+1.55 MB; the dylib 3.5 -> 5.0 MB, vendor.a 3.9 -> 6.0 MB). The CLI archive was 27.1 MB of a 35 MB budget, so
it stays near 28.7 MB: the codecs stay in `zinc:webrtc`, and no `zinc:webrtc-media` plugin is split out (it would also need its own copy of
libdatachannel). The first build from source: 335 files, about two minutes.

### What runs where

Each transceiver has a worker thread that encodes, sends, reassembles and decodes; the program's thread only copies the camera's newest
frame (from its runtime image, no copy in Zinc) or the microphone's samples in, and the decoded frame or samples out, on the same 5 ms timer
as the data channels' events; no native callback calls into the engine. The peer's audio plays through `zinc:audio`'s `stream()`: a ring
buffer that starts at 60 ms, plays silence on an underrun and drops what is beyond 180 ms when the writer's clock runs ahead of the device's.
