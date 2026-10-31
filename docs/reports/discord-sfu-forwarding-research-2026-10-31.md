# Why Discord's SFU receives our Go Live video but does not forward it (research, 2026-10-31)

Question: our native sender (`plugins/discord-voice`, H.264, `aead_aes256_gcm_rtpsize`, DAVE) is received by the SFU (receiver reports show 0 loss, 3210 packets), yet the official web viewer gets no video RTP. Read-only research; no token, no identity spoofing.

Labels: **[DOC]** written in a document, **[SRC]** read in source code, **[GUESS]** inference of mine.

## Sources read

- **[A]** docs.discord.food, Voice Connections: <https://docs.discord.food/topics/voice-connections> (source: `discord-userdoccers/pages/topics/voice-connections.mdx`, master).
- **[A2]** docs.discord.food, Gateway Events (Create Stream op 18, Watch Stream op 20, Set Stream Paused op 22, Delete Stream op 19): <https://docs.discord.food/topics/gateway-events>.
- **[Y]** yapfast, a native Discord client that sends Go Live over the native voice protocol and is shown by the official client: `docs/discord/go-live.md` and `docs/discord/voice.md`, <https://github.com/yapfast/yapfast> (raw: `https://raw.githubusercontent.com/yapfast/yapfast/main/docs/discord/go-live.md`). The most valuable source found.
- **[D]** Discord-RE/Discord-video-stream (dank074), HEAD `33a44a6` (2026-10-28): `src/client/voice/BaseMediaConnection.ts`, `StreamConnection.ts`, `Streamer.ts`, `WebRtcWrapper.ts`, `SPSVUIRewriter.ts`. Commit `ff75210` "Implement DAVE + WebRTC transport" moved this library from raw UDP to WebRTC (README: "Discord is forced to adhere to spec"; no statement that UDP stopped working). Its last UDP version is `e4805fa`.
- Also: discord-stream-rs (WebRTC via webrtc-rs + davey), yapfast PR 40 (op 14 codec switching). Repo reports already written: `docs/reports/discord-video-fix-2026-10-31.md`, `discord-video-protocol.md` (this report builds on them; its defect 7 is promoted to hypothesis 1 below).
- Not found: no GitHub issue or forum post of dank074 / discord.js / libdave describing "viewer sees nothing though SFU receives"; no 2026 announcement of a protocol change. Searches for those returned nothing useful. Do not assume such an issue exists.

## Our current wire format (from `plugins/discord-voice/native/voice.host.cpp:734-750`)

RTP header `0x90`, PT 101 (H264, RTX 102 declared in Select Protocol), SSRC from Ready, one-byte extension profile `BE DE 00 01`, one element `0x52 00 00 00` = **ID 5, length 3 = playout-delay**, nothing else. No RID, no transport-wide-cc, no abs-send-time, no content-type. SR every 1 s. Audio on the screen connection: none. Speaking op 5 with flag 2 is sent (`index.ts:462`). Op 22 paused:false is sent (`examples/discord/src/call.ts:436`).

## Ranked hypotheses

### 1. The RTP header-extension IDs are wrong for the native protocol, and there is no RID extension (most likely)

**Evidence.**
- **[DOC]** [A] "Native RTP Header Extensions" table, quoted: 2 toffset, 3 abs-send-time, 4 urn:3gpp:video-orientation, **5 transport-wide-cc-extensions-01**, **6 playout-delay**, 7 video-content-type, 8 video-timing, 9 discord speaker, 10 sdes:mid, **11 sdes:rtp-stream-id**, 12 sdes:repaired-rtp-stream-id. Also: "Extension IDs are negotiated out of band by the Discord client and RTC worker", and for WebRTC "the numeric IDs ... are the IDs from SDP, not the native UDP IDs". Same page: "Discord expects [playout-delay] on video packets" and "Primary video packets use the negotiated video payload type and the primary stream RID extension." RID row: "RID for primary media packets, such as `100` or `50`".
- **[DOC] [Y]** go-live.md, header-extension section, quoted: "ID 5: transport-wide sequence number. ID 6: playout delay. ID 7: screen content type. ID 11: stream id `100`, which ties packets to the op 12 declaration. **Don't use the WebRTC SDP IDs. Using playout delay as ID 5 makes Discord's server drop every packet, and viewers time out with error 2012.**" This is a working native Go Live sender describing exactly our symptom class (we put playout-delay on ID 5; the server then parses a 3-byte element as transport-cc, which is 2 bytes) and says the fix.
- **[SRC]** [D] and the old UDP `BaseMediaPacketizer.ts:210` used ID 5 for playout-delay, but that was the SDP/WebRTC-style numbering; dank074 now uses libdatachannel, so the IDs come from an SDP and never hit this table. Our earlier report treated ID 5 as "proven by [B]", which is now doubtful: [B] predates the table.
- **[GUESS]** Why "received but not forwarded": the SFU counts and RRs packets at the transport layer (the RR shows our ssrc arrives), but its video pipeline cannot bind the packet to the announced simulcast layer (no RID 11) or fails parsing ID 5 as TWCC, so nothing is forwarded to subscribers. The ~31 packets the viewer got are probes/RTCP.

**Exact change to test (one experiment, all three at once, since each is documented).** In `videoPacket` header: extension body of 4-byte words with these one-byte elements, in this order:
`0x51 <tcc_seq_hi> <tcc_seq_lo>` (ID 5, 2-byte transport-wide seq, incrementing per video packet, `00 00` pad not needed),
`0x62 00 00 00` (ID 6, playout-delay min 0 / max 0 as now),
`0xB2 '1' '0' '0'` (ID 11, length-1 = 2, ASCII "100", the rid of op 12).
Pad with zeros to a 4-byte multiple and set the length word accordingly (here: 2+... = 3+4+4 = 11 bytes, pad to 12, length 3). Optionally also ID 7 (content type `0x71 01`, 1 = screen) as [Y] does. For RTX packets (`voice.host.cpp:610`): ID 12 (repaired-rtp-stream-id, `0xC2 '1' '0' '0'`) instead of ID 11. Keep the 4-byte header and body as AAD/encrypted exactly as today (rtpsize). The existing `DISCORD_VIDEO_EXT` switch idea in `discord-video-fix` defect 7 covers only part of this; do all of it. Verify: the viewer's `inbound-rtp` appears, "error 2012" is the failure a wrong ID produces per [Y].

### 2. No stream audio on the screen connection (the sound track, speaking flag 2) [partly documented]

- **[DOC]** [A]: "If the stream includes application or system audio, send that audio on the stream RTC connection as Opus ... mark this with the SOUNDSHARE speaking flag". [Y]: "Opus at 64 kbit/s, 20 ms frames ... Op 5 marks it as shared sound (speaking flag 2). Send nothing while no application is playing." So audio is optional by docs; Yapfast sends nothing when silent.
- **[SRC]** [D] `StreamConnection.setSpeaking` sends `speaking: 2` with `ssrc: audioSsrc` and `delay: 0`; `BaseMediaConnection.setSpeaking` sends 1.
- **[GUESS]** Low probability that missing audio blocks video, because Yapfast omits audio when silent. Cheap to test second: send a short Opus silence/DAVE-encrypted frame stream (or one frame per 20 ms) on `audio_ssrc` while streaming, with sender reports for the audio SSRC. We already send op 5 flag 2.

### 3. Sender Report content or cadence: SR for the video SSRC must exist and carry the RTP timestamp matching the video clock

- **[DOC]** [A]: "Clients should send an RTCP Sender Report roughly every 5 seconds for each sent media SSRC." [Y] sends one every second and logs `lsr` echoes from receiver reports.
- **[GUESS]** A Chrome viewer needs SR (NTP to RTP mapping) only for A/V sync, not to start; the SFU rewrites. Verify ours: the SR for the screen connection must be for the video SSRC (`voice.host.cpp:627` says it does after the first frame), its RTP timestamp field must equal the last video RTP timestamp scaled by elapsed time, packet and octet counts must match what we sent (note the `sentBytes` counts the encrypted body). Check an RR from the server shows `lsr` non-zero for our video SSRC (that proves the server parsed our SR).

### 4. Codec choice: op 4 `video_codec` / op 14 Session Update and viewers that cannot decode our codec

- **[DOC]** [A] Session Update: the server picks "the one with the lowest priority" codec that all clients decode, otherwise "the client's highest priority encode codec", fallback H264. [Y] (op 4's `video_codec` is "Discord's choice of codec that every viewer decodes") and PR 40: "switches the stream with op 14 when a viewer who can't decode it starts watching".
- **[GUESS]** We offer only H264 (PT 101, RTX 102, encode and decode true), so the choice is H264 and the viewer's SDP says PT 102 H264 (+RTX 103), consistent. Low probability, but log op 4's `video_codec` and any server op 14; if it says something other than H264 we must send that. Also confirm the stream connection's Select Protocol includes `experiments` echo `fixed_keyframe_interval` only if wanted (see 6).

### 5. Key frames, and a viewer starting later

- **[DOC]** [A]: on resume "send `active: true` and prefer sending a keyframe as soon as possible"; op 15 from the server asks the sender to adapt. [Y]: keyframe at least every 3 s and "whenever RTCP asks"; [D]: key frame about every second, "Failure to do so will result in a glitchy stream".
- **[GUESS]** We already emit a key frame each second with nal types [1,5,6,7,8] and SPS/PPS before IDR, so this is probably fine; but verify SPS/PPS/IDR are in one frame and that the DAVE-encrypted key frame reaches the SFU with the NAL headers in the clear (libdave does this for H264: unencrypted NAL headers and SPS/PPS, 4-byte start codes). Our NAL splitter scans `00 00 01` in the encrypted frame (`voice.host.cpp:726-735`); libdave retries encryption until the ciphertext has no start-code pattern (`encryptor.cpp:118-127`, `MAX_CIPHERTEXT_VALIDATION_RETRIES`), so splitting is safe; just confirm the trailer (supplemental data + `FA FA`) lands in the last NAL's packet and nothing is stripped.

### 6. Transport-wide-cc feedback loop and bandwidth estimation (needs hypothesis 1 first)

- **[DOC]** [A]: "Video clients should additionally parse RTCP transport feedback and Generic NACK"; [Y]: follows REMB when it falls below the cap. The server sends BWE feedback only if we put a transport-cc sequence number (ID 5 in the native table) on packets.
- **[GUESS]** Without TWCC the SFU might treat the sender as unmeasured and hold forwarding, or not; nobody documents it. It is covered by hypothesis 1 (ID 5 TWCC). Parse and log the server's RTCP (PT 205 FMT 15 transport feedback, PT 206 FMT 15 REMB) to see whether it responds once the extension is present.

### 7. Smaller or less likely

- **Pacing and packet size.** [Y]: "After a frame's first 8 packets, send 4 per millisecond"; [D] uses a pacer (`PacingHandler(10*1000*1000, 2)`). Bursting a whole 720p key frame is probably fine given 0 loss at the SFU.
- **Stream preview thumbnail.** [Y]: `POST /streams/{stream key}/preview`, JPEG 512x288 as data URI, "once the picture isn't black after connect, then every 5 minutes". [GUESS]: affects the stream card in the UI, not the forwarding; but a viewer UI that waits for a thumbnail could stay "loading". Cheap to add later.
- **Op 12 shape.** Ours follows [D] and [A] (type from Ready, rid "100", quality 100, `max_bitrate`, `max_resolution` fixed). [A]: "Send at least one Video payload before sending or receiving video" (done) and the `streams[].ssrc` must match Ready. `max_bitrate` 2211840 is lower than dank074's 10 Mbit/s and Yapfast's 3.5 Mbit/s cap; unlikely to matter, but if the SFU uses `max_bitrate` as a ceiling for its allocation, an actual send rate above 2.2 Mbit/s would be policed. Check our encoder bitrate stays under it.
- **Gateway flow.** Identify `streams` offered `{type:'screen'}`, DAVE group id `rtc_server_id - 1` (done), op 22 `paused:false` after STREAM_CREATE (done; [Y] does the same). The viewer (web) path watching: op 20 then its op 15 `{ssrc:100}`; we see op 15 for our ssrc at 100, so the SFU believes a subscriber wants it.
- **RTX/NACK.** Implemented (PT 102 on `rtx_ssrc`). The SFU forwards NACKs from the viewer only if we answer; no sign it gates forwarding.
- **Profile of the H.264 stream.** Chrome's SDP `profile-level-id` negotiation is done by the SFU; dank074 rewrites the SPS VUI (`max_num_reorder_frames = 0`, `bitstream_restriction`) for low-latency decode on viewers (`SPSVUIRewriter.ts`; header comment links WebRTC `sps_vui_rewriter.cc`). That affects viewer decode latency, not SFU forwarding; add it later if the viewer receives packets but shows nothing.

## Order of experiments (cheapest first, one change per run with `DISCORD_LOG=1`)

1. Header extensions as in hypothesis 1 (TWCC ID 5 with a sequence number, playout-delay ID 6, RID ID 11 "100", RTX ID 12). Expected: viewer `inbound-rtp` appears.
2. If not: Opus on `audio_ssrc` with speaking 2 (hypothesis 2).
3. If not: log the server's RTCP and op 4/op 14 `video_codec` (hypotheses 4 and 6); check the SR's `lsr` echo in the RR (hypothesis 3).
4. Compare packet by packet with [Y]'s documented parameters (3 s key frames, paced bursts, SR 1 s).

## Documented versus guessed, in one line each

- Documented: native extension ID table; RID 11 on primary video packets; `type: screen` is offered and the server reports `video`; SOUNDSHARE for stream audio; SR about every 5 s; op 15 semantics; op 22 owner pause; op 14 codec choice; and (by a working client, not by Discord) that playout-delay on ID 5 makes the server drop every packet.
- Guessed: everything about why the SFU receives but does not forward (the SFU's internals are not documented anywhere I found).

Legitimate protocol only: nothing here needs a token, super-properties, a user agent, Nitro or a captcha.
