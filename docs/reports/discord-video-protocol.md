# Discord video over the voice UDP: our side against the references (ZN-909)

The owner's real call (2026-10-30): the camera and Go Live of a person on the official client did not load, built until then against the
fake Discord only (ZN-873, ZN-875). No real account is used here; this compares `plugins/discord-voice` (`index.ts`,
`native/voice.host.cpp`) and `examples/discord/src/call.ts` with the documented protocol and with code that interoperates with the
official client, fixes what a reference contradicts, and adds the diagnostic the owner can send back (`DISCORD_LOG=1`).

## Sources

- **[A]** docs.discord.food, Voice Connections (https://docs.discord.food/topics/voice-connections; source
  `discord-userdoccers/pages/topics/voice-connections.mdx`) and Gateway Events (Go Live).
- **[B]** dank074/Discord-video-stream at the parent of `ff75210` (2025-12-12, "Implement DAVE + WebRTC transport"): its last UDP
  version, which the official client showed for years (`src/client/voice/BaseMediaConnection.ts`, `StreamConnection.ts`,
  `src/client/packet/BaseMediaPacketizer.ts`, `VideoPacketizerAnnexB.ts`, `src/media/newApi.ts`). **[B']** the same at HEAD (WebRTC
  with DAVE).
- **[C]** discord/libdave `cpp/src/codec_utils.cpp`, `encryptor.cpp`, `common.h` (vendored in `plugins/discord-voice/vendor/libdave`).
- **[D]** discord/dave-protocol `protocol.md`.
- **[E]** discord.js `packages/voice` (`receive/VoiceReceiver.ts`, `networking/Networking.ts`).
- **[W]** WebRTC `common_video/h264/h264_common.cc` (`FindNaluIndices`) and the playout-delay extension
  (https://webrtc.googlesource.com/src/+/refs/heads/main/docs/native-code/rtp-hdrext/playout-delay).

## Comparison

| Item | Reference | Ours before | Verdict |
|---|---|---|---|
| Identify (op 0) `video`, `streams` | `video:true`, `streams:[{type,rid,quality}]`; camera `video`, Go Live may offer `screen` [A]; [B] `screen` on both | `video` / `screen`, rid 100, quality 100 | matches |
| Select Protocol codecs | `{name,type,priority,payload_type,rtx_payload_type,encode,decode}`; [B] opus 120, H264 101/102 [A, B] | the same | matches (we offer H.264 only, so the server picks it) |
| Ready `streams` | `[{type:"video",ssrc,rtx_ssrc,rid,quality,active}]`, rtx = ssrc+1 when missing [A] | read, type ignored | type now kept (below) |
| Session Description | `video_codec`, `keyframe_interval` (ms), `secret_key`, `mode`, `dave_protocol_version` [A] | `keyframe_interval` ignored | **fixed**: honoured (a key frame at least that often; 0 = on PLI only) |
| **Video (op 12) before any media** | "You must send at least one Video payload before sending or receiving video data, or you will be disconnected with an Invalid SSRC error" [A]; [B] sends `{audio_ssrc, video_ssrc:0, rtx_ssrc:0, streams:[]}` right after Ready | only when our camera starts: a viewer with no camera (and every Go Live watching connection) never sent one | **fixed**: sent at Ready on every connection |
| **Speaking (op 5) before any media** | "You must send at least one Speaking payload before sending or receiving data, or you will be disconnected with an Invalid SSRC error" [A] | only when our voice activity starts: a silent or muted user, and every Go Live connection (no audio), never sent one | **fixed**: `speaking:0` at Ready on every connection; a Go Live connection sends `speaking:2` (soundshare) while it streams and 0 after, as [B] `StreamConnection.setSpeaking` |
| op 12 stream `type` | Ready reports the stream as `video`, Go Live included [A]; [B] sends `type:"video"` on the stream connection | `screen` on Go Live | **fixed**: Ready's type |
| op 12 shape | `{audio_ssrc,video_ssrc,rtx_ssrc,streams:[{type,rid:"100",ssrc,active:true,quality:100,rtx_ssrc,max_bitrate,max_framerate,max_resolution:{type:"fixed",width,height}}]}`; stop: `video_ssrc:0, rtx_ssrc:0, streams:[]` [B, A] | the same | matches |
| Media Sink Wants (op 15) | `{"<ssrc>":0..100, "any":0..100, "pixelCounts":{"<ssrc>":n}}`, primary SSRCs only [A]; [B] sends none | per SSRC + `pixelCounts`, no `any` | matches (every known stream is named; `any` only covers the unnamed) |
| RTP video header | negotiated PT, 90 kHz, marker on the last packet of a frame [A, B] | the same | matches |
| **Playout-delay extension** | one-byte profile `BE DE 00 01`, element `0x52 00 00 00`: ID 5, length-1 = 2, min/max delay 12 bits each = 3 bytes [B, W]. [A]'s native table names ID 6 for playout delay and 5 for transport-cc, "negotiated out of band" | `0x51 00 00 00`: a 2-byte element, which WebRTC's parser rejects (it wants 3) | **fixed** to [B]'s bytes. The ID stays 5, the value [B] used with the official client; [A]'s 6 is unproven (see Open) |
| rtpsize AEAD | AAD = fixed header + CSRCs + the 4-byte extension preamble; extension elements encrypted with the payload; 4-byte BE counter appended, nonce zero-padded [A note 3, B, E] | the same | matches |
| RTP padding (P bit) | RFC 3550 5.1; the official client pads probes | padding left in the payload | **fixed**: stripped after decryption |
| H.264 packetization | mode 1, single NAL or FU-A (`0x1C|nri`, S/E bits, original header dropped), SPS/PPS as single NALs before each IDR, same timestamp; MTU 1200 [B] | the same (MTU 1100), SPS/PPS from VideoToolbox's format description on each key frame, no AUD, Constrained Baseline, no B-frames | matches |
| NAL split before packetization | a 4-byte start code takes exactly one zero from the unit before it [W] | every trailing zero stripped: a DAVE-encrypted unit ending in 0x00 would lose bytes and fail its tag | **fixed** to [W] |
| DAVE on video | the whole Annex B frame before packetization; 4-byte start codes; slice/IDR keep header + first_mb/sps/pps ids clear, other NALs whole; footer tag(8) + ULEB128 nonce + ranges + size + `FAFA`; libdave retries a nonce when the ciphertext holds a start code [C, D]; receive: reassemble Annex B with 4-byte start codes, then decrypt [A, C] | the same (libdave itself; SSRC assigned to H.264) | matches |
| RTCP | same socket and keys; header clear as AAD (8 bytes for SR, [B]); server sends RR 201, RTPFB 205, PSFB 206 [A] | 8-byte AAD both ways, SR each second, PLI out, PLI in → key frame | matches; PLI over UDP not shown by any reference (unproven) |
| RTX | PT 102 on `rtx_ssrc`, 2-byte OSN first [A] | not read | not a cause of a black tile (we ask PLI on loss); counted in the diagnostic |
| Receiving | map SSRC → user from op 12 (`video_ssrc`, `streams[].ssrc`); decrypt, strip extensions, reorder, depacketize, DAVE, decode [A] | the same | matches |
| Colour | not found in any source; [B'] writes `video_signal_type_present_flag=0` | BT.601 limited, written in our VUI | unchanged, unproven |
| Go Live | op 18/19/20/22, STREAM_CREATE `rtc_server_id`, STREAM_SERVER_UPDATE; stream connection `server_id = rtc_server_id`, main session id, DAVE group `rtc_server_id - 1` [A, B, B'] | the same | matches |

The two Invalid SSRC rules are the likeliest cause of what the owner saw: a call where we only watch never told the server which SSRC
is ours for video or speaking, and a Go Live watching connection never sent either, so the server could refuse to forward media to it.

## The diagnostic

`DISCORD_LOG=1 build/zinc --background run examples/discord` prints, besides the app's own log:

- `voice-gw[video] in|out {...}`: each voice gateway message but the heartbeats (`[screen]` for a Go Live connection), with `token`,
  `session_id`, `secret_key` and the IP addresses (`ip`, `address`) replaced by `"<redacted>"` (`redact()` in `index.ts`); DAVE's
  binary MLS messages as their opcode and size only.
- `voice-rtp[...]` every 5 s: the totals (voice packets, transport decryption failures, video frames, PLIs both ways, DAVE version,
  keyed, frames held without a key, frames DAVE could not open), then per SSRC: what we send (bytes, packets, target bitrate, frames,
  size, key frames, NAL types) and the server's report on it; what we receive (user, packets, bytes, lost, jitter, and for a watched
  video stream frames decoded and dropped, key frames, NAL types, transport, DAVE and decoder failures); and packets of any other
  payload type (RTX, a codec we did not offer).

How the redaction was checked: the scripted call against the fake Discord runs with `DISCORD_LOG=1`, and `tests/t1/discord_voice.sh`
fails if the log holds the fake's voice token, its session id or any run of its secret key, or lacks a redacted field.

## Open (needs the owner's real call)

- The playout-delay ID (5 as [B], or 6 as [A]'s table). If the log shows our camera's packets reaching the server (no close) but the
  official client shows nothing, try 6.
- Whether Discord's server relays PLIs over UDP; `keyframe_interval` from Session Description now bounds the wait for a key frame.
- The colour matrix of the official client's H.264 (601 vs 709); the log does not show it, a frame does.
