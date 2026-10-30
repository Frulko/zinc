---
id: ZN-872
title: 'zinc:discord-voice: voice gateway v8, UDP, rtpsize AEAD, Opus, DAVE'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-30 14:54'
updated_date: '2026-10-30 19:13'
labels:
  - net
  - media
  - size-L
milestone: m-28
dependencies:
  - ZN-866
ordinal: 140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 3: voice state update and VOICE_SERVER_UPDATE, voice gateway v8, IP discovery, aead_aes256_gcm_rtpsize (mbedTLS) and aead_xchacha20_poly1305_rtpsize (Monocypher), Opus 48 kHz 20 ms, speaking, jitter buffer and mixer, resume. DAVE is mandatory since March 2026: vendor libdave (MIT) and mlspp (BSD-2) through libdave's C API; pick and record the crypto backend (BoringSSL vs OpenSSL vs an mbedTLS provider for mlspp) as a decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Joining a voice channel and a DM call: the other people hear us and we hear them
- [x] #2 Mute, deafen and push-to-talk; speaking indicators for each person
- [ ] #3 DAVE: the call passes Discord's E2EE check (the lock in the official client)
- [x] #4 Unit tests: RTP framing and both AEAD modes against recorded vectors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-10-30):
- New plugin `zinc:discord-voice` (plugins/discord-voice): index.ts speaks the voice gateway v8 (Identify with max_dave_protocol_version, Hello, heartbeats with seq_ack, Ready, Select Protocol, Session Description, Speaking, op 11/13, Resume) and DAVE's state machine (ops 21-31, binary frames with the v8 sequence number); native/voice.host.cpp has one worker thread per connection: UDP + IP discovery, RTP, aead_aes256_gcm_rtpsize (engine mbedTLS through PSA) and aead_xchacha20_poly1305_rtpsize (Monocypher 4.0.2 in its own namespace), Opus 48 kHz stereo 20 ms (libopus of plugins/webrtc, compiled from its vendor dir), VAD with 300 ms hold, 5 silence frames, a jitter buffer per SSRC (2 frames to start, 8 max), the mix, miniaudio capture and playback, mute/deafen/PTT, and libdave's encryptor/decryptors around each frame (nothing leaves while DAVE has no key).
- DAVE stack vendored in plugins/discord-voice/vendor (PIN): libdave 6396c90a, mlspp 1cc50a12, BoringSSL 0.20261020.0 (libcrypto, OPENSSL_NO_ASM), nlohmann/json 3.12.0. The plugin builds in 72 s once (431 sources), then cached.
- App (examples/discord): call.ts (voice states, VOICE_SERVER_UPDATE, CALL_CREATE/UPDATE/DELETE, ring for a DM), op 4 in gateway.ts, ChannelList: a voice channel joins on press and lists who is in it (name bright and green ring while speaking), DM rows have a call button, a call bar (state, "End-to-end encrypted", PTT toggle, hang up), mute and deafen in the user panel; F8 is push-to-talk; zinc.json asks "microphone".
- Engine gap fixed: a component returning null (React and Solid) was refused (Z0103 'null | i32' to 'i32'): check.cpp's thunkable() now wraps a function returning T where one returning a union with T is expected, react.ts/solid.ts accept a null render. Test tests/t0/jsx_null_component.sh (interpreter, QuickJS, AOT).

Decision (RULES.md §4) - the crypto backend of mlspp/libdave. Scores fit x3, perf x3, size x2, maint x2, licence x2, portability x1, effort x1:
- BoringSSL vendored, OPENSSL_NO_ASM: 5,4,4,4,5,4,5 = 62. libdave's default backend (Discord's own clients), plain source list (gen/sources.json), tagged releases, builds with clang in 24 s, 2.6 MB archive, symbols (EVP_*, CRYPTO_*) never meet mbedTLS's (mbedtls_*, psa_*).
- System OpenSSL 3 (Homebrew/distro): 2,5,5,3,5,2,4 = 53. An install step (refused: the first run must need nothing), no headers on macOS.
- An mbedTLS provider for mlspp's hpke: 4,4,5,1,5,5,1 = 52. One crypto stack, but a port of hpke's OpenSSL calls and libdave's cryptor that we would own (crypto code of our own).
- OpenSSL 3 vendored: 4,4,2,2,5,3,2 = 47. Perl Configure, generated headers per platform.
Chosen: BoringSSL. Revisit if mlspp gains an mbedTLS backend, or the plugin's size matters on a small target (then BORINGSSL_PREFIX or -fvisibility=hidden).

Tests (real output):
- tests/golden/host/discord_voice_rtp.ts (in tests/t1/discord_voice.sh): RTP header, seal/open in both modes, a received packet with a header extension, a flipped header bit, a flipped payload bit, a wrong key, an unknown mode: all ok against vectors recorded with Node's OpenSSL (plugins/discord-voice/tests/vectors.mjs, HChaCha20 checked against draft-irtf-cfrg-xchacha 2.2.1).
- tests/t1/discord_voice.sh: the app against the fake Discord (voice gateway v8 + UDP on 127.0.0.1, the fake opens our packets with the session key and sends them back as Grace): connected aead_aes256_gcm_rtpsize, speaking Ada and Grace, 25 frames heard with 0 failures, muted (silent, op 4 self_mute), PTT not held (silent) and held (speaking), deafened (op 4 self_deaf), left (op 4 null), DM call rings (POST /call/ring) and asks DAVE v1: our key package (op 26, binary) goes out and 0 packets leave without a key. 4 s; stable over 5 runs.
- tests/t1/discord.sh: only the last frame's hash changes (mute and deafen buttons in the user panel): re-recorded.

Not done:
- #1 and #3 need the owner's account (Review). Run: `DISCORD_LOG=1 build/zinc run examples/discord`, log in, open a server, press a voice channel (the speaker icon) with someone in it who uses the official client; check both hear each other with headphones, then the call bar says "Voice Connected · End-to-end encrypted" and the official client shows the lock on the call; then call a DM friend with the phone by their name. The log lines "voice ..." and "voice dave ..." (commit applied, end-to-end encrypted true) say where it stops if it does; stderr "dave: ..." lines are libdave's warnings.
- The green speaking ring does not show: an engine gap in zinc:ui's layout, a View's border takes no layout space when the View sizes to its children (`<View className="rounded-full border-2 border-[#23a55a]"><Avatar/></View>`: the child covers the border, which is drawn inside the box; padding insets correctly). lib/std/ui.ts is shared core and another agent works in it now, so it was not fixed here: it is the next task (New-task: blocks discord_voice ring). The speaking name turns bright, which shows who speaks meanwhile.

Lines for backlog/later.md:
- ZN-872: Opus loss concealment and FEC, and reordering in the jitter buffer: the first real calls over Wi-Fi will show if gaps are audible.
- ZN-872: DAVE verification codes (daveSessionGetPairwiseFingerprint) in the call bar, as the official client shows them.
- ZN-872: READY_SUPPLEMENTAL's voice_states (capability bit 5 is not asked): who is already in voice channels at start shows only after a VOICE_STATE_UPDATE.
- ZN-872 (Cross-platform pass): the discord-voice plugin on Linux (ALSA/PulseAudio through miniaudio, BoringSSL without asm) and the zig cross build of its 431 sources.
<!-- SECTION:NOTES:END -->
