# WebRTC and the microphone in Zinc (2026-10-16)

Owner's order: the microphone and WebRTC data channels first, audio and video tracks later. What we need: a single `zinc` binary plus
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

**Decision**: libdatachannel with libjuice and usrsctp, against the engine's mbedTLS, built with `RTC_ENABLE_MEDIA=0` and
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
  in the CLI archive with the prebuilt libraries. libsrtp is not built: data channels do not need it.
- **Pi and Linux**: the Linux defines are written (usrsctp's `HAVE_*` checks differ from macOS's), not built yet (cross-platform pass).

## Audio, now and later

- **Capture**: miniaudio is vendored already (`plugins/audio/vendor`, playback): `zinc:microphone` captures with it (Core Audio, PulseAudio,
  ALSA), compiling the same `miniaudio_impl.c`. macOS's privacy question goes through AVFoundation, never from a background run.
- **Opus** (libopus, BSD, about 300 KB of code, plain C, builds with zig) is the codec every WebRTC peer speaks: the audio tracks need it.

## Video, later

- macOS: VideoToolbox (hardware H.264, nothing to vendor). Pi: V4L2 M2M (`/dev/video11`, the bcm2835 codec: hardware H.264 on a Pi 1 to 4).
- libvpx (VP8, BSD): the software fallback every browser takes; heavy for a Pi 1 (VP8 at 320x240 at best), right for a desktop.
- Order: H.264 in hardware first where there is some, VP8 in software for the rest; both need libsrtp (BSD) and `RTC_ENABLE_MEDIA=1`.
