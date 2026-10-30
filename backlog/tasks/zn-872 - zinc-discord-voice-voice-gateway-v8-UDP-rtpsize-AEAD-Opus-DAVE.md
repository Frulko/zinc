---
id: ZN-872
title: 'zinc:discord-voice: voice gateway v8, UDP, rtpsize AEAD, Opus, DAVE'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:54'
updated_date: '2026-10-30 19:08'
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
- [ ] #2 Mute, deafen and push-to-talk; speaking indicators for each person
- [ ] #3 DAVE: the call passes Discord's E2EE check (the lock in the official client)
- [ ] #4 Unit tests: RTP framing and both AEAD modes against recorded vectors
<!-- AC:END -->
