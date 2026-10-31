# Discord video and Go Live against real Discord: what is still wrong (2026-10-31)

The owner, in a real call with a real person on the official client: voice works, but camera video and Go Live never show (watching
"loads forever"), and the call drops after a while. ZN-909 already sends op 12 and op 5 at Ready and fixed the playout-delay element;
that was not enough. This report compares, step by step, `plugins/discord-voice/index.ts`, `plugins/discord-voice/native/voice.host.cpp`
and `examples/discord/src/call.ts` with the official protocol docs and with code that works against the official client. No token was
used, and nothing here imitates the official client (no super-properties, user agent or fingerprint, no Nitro spoofing).

## Sources (read for this report)

- **[A]** docs.discord.food, Voice Connections, source `discord-userdoccers/pages/topics/voice-connections.mdx` (master, fetched
  2026-10-31): <https://docs.discord.food/topics/voice-connections>. Sections cited: *RTCP and RTX*, *Quality of Service*,
  *Native RTP Header Extensions*, *Video RTP*, *Receiving Video*, *Simulcasting*, *Streams*, *Session Updates*, *Heartbeating*.
- **[A2]** the same docs, Gateway Events (Streams, Create/Watch Stream), and Opcodes and Close Codes (voice close codes).
- **[B]** dank074/Discord-video-stream at `e4805fa` (the last UDP version, the parent of `ff75210`, "Implement DAVE + WebRTC
  transport"): `src/media/newApi.ts:265` (`-force_key_frames expr:gte(t,n_forced*1)`), `src/client/voice/MediaUdp.ts:112`
  (`handleIncoming` ignores every received packet: no RTCP feedback is read at all), `src/client/packet/BaseMediaPacketizer.ts:210`
  (playout delay, ID 5).
- **[B']** the same at HEAD `33a44a6` (WebRTC and DAVE through `@snazzah/davey`): `src/media/newApi.ts:67, 862` (key frames about every
  second), `src/client/voice/StreamConnection.ts:20` (DAVE group = `rtc_server_id - 1`), `src/client/Streamer.ts:137-162` (STREAM_CREATE
  and STREAM_SERVER_UPDATE handled in either order), `src/client/voice/BaseMediaConnection.ts:163` (resume only on 4015 or < 4000).
- **[C]** discord/libdave, as vendored in `plugins/discord-voice/vendor/libdave/cpp/src`: `mls/session.cpp:480-532` (`ReplaceState`
  returns a *change map*, not the roster), `bindings_capi.cpp:59-69, 276-289` (the C API hands out that change map),
  `codec_utils.cpp:77, 206, 270` (H.264/H.265 frames are rewritten with 4-byte start codes before encryption).
- **[D]** discord/dave-protocol `protocol.md` (via [A]'s *End-to-End Encryption*: transitions, epochs, per-sender key ratchets).

## What matches (not causes)

Checked and consistent with [A] and [B]: Identify (`video`, `streams` with `screen` for Go Live, `max_dave_protocol_version`); Ready
SSRCs; Select Protocol codecs (H.264 101/102 only, so the server makes the others send H.264 to us, [A] *Supported Codecs*); op 12 and
op 5 before media; op 12 shape; rtpsize AEAD for RTP (fixed header + CSRCs + 4-byte extension preamble as AAD) and RTCP (8-byte header
as AAD); FU-A/single-NAL packetization, MTU, marker bit, 90 kHz clock; the NAL split before packetization; 4-byte start codes on receive
(matches [C]'s rewrite, so DAVE's unencrypted ranges line up); STAP-A on receive; the stream connection's `server_id = rtc_server_id`,
main voice `session_id`, DAVE group `rtc_server_id - 1`; heartbeats with `seq_ack` (JSON `seq` and the binary 2-byte sequence);
proposals passed to libdave with their leading operation byte (libdave's C++ reads it itself: `session.cpp:160`).

## Defects, ranked

### 1. Our video almost never carries a key frame the viewer can use (camera and Go Live, sending side)

**Where.** `voice.host.cpp:651` (a key frame only when `keyMs > 0` elapsed, or on `forceKey`), `:663` (a frame DAVE cannot encrypt yet
is dropped, and the `key` flag consumed in `videoLoop` at `:759` is lost with it), `:552` (only PLI, PSFB FMT 1, sets `forceKey`; FIR,
PSFB FMT 4, is ignored), `index.ts:299` (the server's op 15 to us is ignored), `index.ts:344` (`keyframe_interval` is only honoured if
the server sends it).

**What we do.** One key frame when the camera or Go Live starts (`videoSend` sets `forceKey`, `:980`), then P-frames forever unless an
RTCP PLI comes back. With DAVE, which every call has used since March 2026 ([A] *End-to-End Encryption*), that first key frame is
normally produced *before* our encryptor has a key ratchet (the group is still being made: Welcome/Commit and op 22 come later), so it
is dropped at `:663` (`unencrypted-held` in the diagnostic), and the first frames that do leave are P-frames. Go Live is worse: the
stream connection starts sending as soon as it is up, and a viewer only subscribes later (op 20, then its op 15), long after the one key
frame. `keyframe_interval` is absent from Session Description unless the client opts in to the `fixed_keyframe_interval` experiment that
Ready lists and Select Protocol echoes ([A] *Example Ready*, *Example Select Protocol*); we never echo it, so `keyMs` stays 0.

**What working clients do.** [B] forced a key frame every second (`newApi.ts:265`) and read *no* RTCP at all (`MediaUdp.ts:112`): its
viewers on the official client were fed only by that cadence. [B'] still does it over WebRTC ("keyframes every ~1s", `newApi.ts:862`,
and the doc comment at `:67`: "keyframe every 1s ... Failure to do so will result in a glitchy stream"). [A] *Video*: "When resuming,
send active: true and prefer sending a keyframe as soon as possible"; [A] *Simulcasting*: server-sent wants are "dynamic encoder input".
Whether the SFU relays a viewer's PLI to a UDP sender, and as PLI or FIR, is not documented anywhere; we bet everything on it.

**Change.**
- `voice.host.cpp` `sendVideo`: when `daveEncryptorEncrypt` fails, set `forceKey = true` under `vmu` before returning, so the next frame
  is a key frame again; and in `daveExecute` (`:1164`) set `forceKey = true` when our encryptor gets its (new) key ratchet.
- Default cadence when `keyMs == 0`: a key frame at least every 1000 ms (the value [B]/[B'] use); keep `keyframe_interval` when the server
  gives one. The bitrate cost at 720p30 is small with VideoToolbox; make it 2000 ms in low data mode if needed.
- `Conn::rtcp` (`:552`): also force a key frame on PSFB FMT 4 (FIR), and count NACK (RTPFB FMT 1), FIR and PLI separately for the
  diagnostic.
- `index.ts:299`: on op 15 from the server, if the value for our `videoSsrc` (or `any`) goes from 0 (or absent) to > 0, call a new native
  `S.keyFrame(h)` that sets `forceKey`.
- Optional and legitimate (a field the docs define, not identity): echo `experiments: ['fixed_keyframe_interval']` in Select Protocol when
  Ready lists it, and read `keyframe_interval` from op 14 Session Update too (today op 14 falls into `voice op 14`, `index.ts:304`).

**Log lines that confirm it** (`DISCORD_LOG=1`): `voice-rtp[video] out video ssrc … frames N … keys 1` with `keys` stuck at 1 (or 0)
while `frames` grows; `pli-in 0`; the totals line `dave v1 keyed 1 unencrypted-held K` with K > 0 right after `voice camera on` / `go
live`; no `keyframe_interval` in the redacted `voice-gw[…] in {"op":4,…}`; `voice-gw[…] in {"op":15,…}` lines naming our SSRC going to
100 with nothing following. After the fix `keys` must grow about once a second.

### 2. Receiving a camera: we request a lower simulcast layer, then drop its packets (receive side)

**Where.** `index.ts:203` (`quality` 50 for a tile smaller than 640x360), `index.ts:370-380` (`video()` keeps only `d.video_ssrc`),
`index.ts:205` and `voice.host.cpp:528-531` (one `Watch` per that single SSRC; any other SSRC is dropped before decryption),
`call.ts:288, 297` (tiles are `TILE_W x TILE_H` = 256x144 points, 512x288 px on Retina, so every unfocused tile asks 50).

**What we do.** op 15 `{"<video_ssrc>": 50, "pixelCounts": {...}}` for every tile, and decode only packets whose SSRC equals the top-level
`video_ssrc`.

**What the reference says.** [A] *Simulcasting*: "Camera video commonly offers two layers: one full-size stream at quality 100, and
another reduced-quality stream at 50"; wants pick the layer. [A] *Receiving Video*: "Each stream `ssrc` maps primary video RTP for that
user ... `rid` and `quality` identify the simulcast layer", and "The SFU may still send packets during transitions, so receivers should
tolerate short overlap between old and new layer choices". So asking 50 makes the SFU forward the rid-50 layer, under that layer's own
SSRC, which `watches` does not hold: the packets land in `rx` (counted) and are thrown away. For a Go Live stream (one layer, quality 100)
asking 50 is at best a hint and at worst "no layer qualifies".

**Change.**
- `index.ts` `video()`: keep, per user, every `streams[].ssrc` with its `quality` (and `rtx_ssrc`), not only `video_ssrc`; `S.bind` each
  one to the user.
- `watch()`: register the same user under every layer SSRC (native `watch()` takes an alias: several SSRCs pointing at one `Watch`, each
  with its own `Reassembler`, and a PLI on the layer that just started). Until then, the one-line safe fix: ask **100** for every shown
  stream (`index.ts:203`) so the SFU forwards the layer whose SSRC we watch, and add `"any": 0` so unnamed layers stay off.
- A Go Live watching connection always asks 100 for the streamer's SSRC.

**Log lines.** The redacted `voice-gw[video] in {"op":12,…"streams":[{"ssrc":A,…"quality":100},{"ssrc":B,…"quality":50}]…}` with two
SSRCs for the person; then `voice-rtp[video] in video ssrc B user <their id or empty> bytes … packets …` growing while the row for A shows
`packets 0`, or `decoded 0` on A. `pli out` grows every second (we keep asking A for a key frame that never comes on A).

### 3. DAVE: after any group change, existing members keep the old key (voice and video both)

**Where.** `voice.host.cpp:1143` (`daveCommit`: `c->roster = rosterOf(...)`), `:1160` (`daveWelcome`, the same), `:1172-1180`
(`daveExecute` gives a new key ratchet only to the users of `c->roster`, plus us).

**What we do.** We treat the commit/welcome result as the roster. It is not: libdave returns a *change map*: the members added since the
last epoch (with their key) and the members removed (with an empty key) ([C] `session.cpp:496-532`, `bindings_capi.cpp:59-69`). So in
`daveExecute` only newcomers get the new epoch's key ratchet; everybody already in the group keeps the previous epoch's decryptor. The
first Welcome works (the change map is then everyone), which is why a fresh 1:1 call has voice. From the second epoch on (a third person
joins or leaves, someone reconnects, a second viewer joins a Go Live, our own invalid-commit rejoin), every frame of the members who did not
change fails to decrypt as soon as they send under the new epoch's key (op 22): our decryptor for them only holds the old one. Audio
from them goes silent and their video and stream stop.

**What working clients do.** Each epoch, every participant of the group gets `GetKeyRatchet(userId)` and its decryptor is moved to it
([D]: per-sender keys derive from each epoch's exporter secret; [A] *MLS Group Changes*: "a new key ratchet after a group participant
change"). davey ([B']) does this inside the session for all members.

**Change.** Keep a full roster in `Conn`: on a commit or welcome result, add the ids whose signature is non-empty
(`daveCommitResultGetRosterMemberSignature` / `daveWelcomeResultGetRosterMemberSignature`, length > 0) and remove the others; or simpler,
in `daveExecute` iterate over `roster ∪ users-known-from-op-11 ∪ the decryptors already created` and call `daveSessionGetKeyRatchet` for
each (it returns null for non-members). Never assign the change map to `c->roster`.

**Log lines.** `voice dave commit applied` (or `welcome applied`) for a second epoch, then right after its op 22 the totals line
`… dave v1 keyed 1 unencrypted-held 0 undecryptable U` with U climbing, and `in video ssrc … dave-fail` climbing while `packets` still
grows; libdave's own `dave: … (decryptor.cpp:…)` warnings on stderr.

### 4. Go Live watching: STREAM_SERVER_UPDATE before STREAM_CREATE is lost, and a server change is not followed

**Where.** `call.ts:403-404`.

**What we do.** STREAM_SERVER_UPDATE is ignored unless STREAM_CREATE already set `l.rtc`; it is never replayed, so the watch stays at
"loading" forever. A null `endpoint` (the stream server going away, [A2] *Stream Server Update*) is ignored, and a later update for the
same key closes the old connection only if `l.rtc` is set.

**What working clients do.** [B'] `Streamer.ts:137-162`: STREAM_CREATE stores `rtc_server_id` and the session, STREAM_SERVER_UPDATE stores
endpoint and token, and the connection starts when both are present, in either order (`BaseMediaConnection.start()`). [A2]: "you must
wait for the Gateway to respond with two events", no order promised.

**Change.** Keep `endpoint` and `token` on `Live`; on either event, call `streamConnect` when `rtc` and `endpoint` are both set. On a null
endpoint, close `l.conn` and wait for the next update. Log both events (stream key and order only, no token).

**Log lines.** None today: add `stream create <key>` / `stream server update <key>` lines; the bug shows as a server update logged before
the create and no `voice-gw[screen] out {"op":0,…}` afterwards.

### 5. The call drops "after a while": close codes and resume

**Where.** `index.ts:29` (`FINAL`), `index.ts:432-441` (`closed()`), `index.ts:304` (op 3 from the server is not answered).

**What we do.** We try to resume after *any* code not in `[4004, 4006, 4009, 4014, 4016]`: also after 4017 (E2EE required), 4020 (bad
request), 4021 (rate limited, "Should not reconnect"), 4022 (call ended / server changed, "Should not reconnect") and 4001/4002/4003/4005
([A2] *Voice Close Event Codes*). Each failed resume closes again, and the session finally ends as `voice gateway closed (4006)`. And a
4006 or 4009 after a real network blip ends the call, where a fresh Identify on the same token (still valid from VOICE_SERVER_UPDATE) would
have kept it. op 3 sent by the server ("request a heartbeat ... should immediately send", [A] *Heartbeating*) is only logged.

**What working clients do.** [B'] `BaseMediaConnection.ts:163`: resume only on 4015 or any code below 4000, otherwise stop.

**Change.** Resume only on `code < 4000 || code === 4015 || code === 4013` (4013 WebRTC crashed: try resuming, [A2]); on 4006/4009 after a
resume attempt, open a new socket and Identify again (new Ready, new UDP), once; stop on everything else and show the code. Answer op 3
with a heartbeat at once. Also check the main gateway: a fresh IDENTIFY (not a RESUME) gives a new session id, Discord ends the old voice
state, and `call.ts:494-498` then drops the call (`Voice disconnected: …` follows a `stage reconnecting` / `session:` line of the main
gateway).

**Log lines.** `voice gateway closed (<code>), resuming` followed by another close, or `Voice disconnected: voice gateway closed (<code>)`
in the app log; the code says which branch. A main gateway `stage reconnecting` then `stage ready` (not `RESUMED`) just before it points at
the main session instead.

### 6. NACK is never answered; RTX is never sent or read

**Where.** `voice.host.cpp:552-553` (RTPFB 205 is skipped), `:377-380` (RTX packets of others counted and dropped).

**What the reference says.** [A] *RTCP and RTX* and *Quality of Service*: "Video clients should also handle RTCP Generic NACK feedback.
When the server reports missing video packets, retransmit them as RTX packets", RTX on `rtx_ssrc` with the negotiated RTX payload type
(102) and the 2-byte original sequence first. Without it, every lost packet of a key frame costs a whole key frame (and with defect 1, it
cost the stream). Lower than 1-3 because [B] never did it and worked.

**Change.** Keep the last ~500 ms of sent video packets (plaintext payload + sequence) in a ring; on NACK (PT 205, FMT 1: PID + BLP), send
each still held as RTX: header PT 102, `rtx_ssrc`, its own sequence, payload = original sequence (2 bytes) + original payload, same
extension, sealed like any packet. On receive, map PT 102 on a stream's `rtx_ssrc` back to its primary SSRC and original sequence before
`Reassembler::push`.

**Log lines.** With the new counter of defect 1: `nack-in N` growing on `out video`, and `other payload type 102 ssrc <their rtx>` rows.

### 7. Header extension IDs (to A/B, not proven)

**Where.** `voice.host.cpp:684, 690` (`BE DE 00 01`, element `0x52 00 00 00`: ID 5, playout delay).

[A] *Native RTP Header Extensions* (newer than [B]) gives the native UDP map as ID 5 = transport-wide-cc and ID 6 = playout-delay
("Discord expects this on video packets"), and says primary video packets carry the RID (`rtp-stream-id`, ID 11) of their stream. [B]
used ID 5 for playout delay and no RID, and was shown by the official client for years, so this is a second-order suspect: our element
may be read as a malformed transport-cc. **Change, as an experiment** behind `DISCORD_VIDEO_EXT=6`: element `0x62 00 00 00` and, as a second
step, add `0xB2 '1' '0' '0'` (ID 11, length-1 = 2, "100") with the length word set to 2. Keep whichever makes the official client show
our camera.

**Log lines.** None on our side; the difference is whether the official client shows us once defect 1 is fixed.

### 8. Smaller things seen on the way

- A Go Live *watching* connection sends a Sender Report for an SSRC that never sends (`voice.host.cpp:620`); [A] *Stream Media
  Connections*: "do not attempt to send media to streams you are viewing". Send a Receiver Report (PT 201, the same blocks) instead.
- [A] *RTCP and RTX* suggests a Sender Report about every 5 s per sent SSRC; ours every second is harmless.
- op 24 with `epoch > 1` (a protocol version change) is ignored (`index.ts:303`); op 14 Session Update is ignored (`index.ts:304`).
- `video()` maps no RTX SSRC to the user, so `other payload type` rows show no user.

## How to read the owner's log

`DISCORD_LOG=1 build/zinc --background run examples/discord > discord-call.log 2>&1`, join, camera on both sides, Go Live both ways,
watch theirs, wait two minutes. In order of the list above: `keys` on our `out video` rows (1), the op 12 `streams` of the other person
and which `in video ssrc` rows grow (2), `dave-fail`/`undecryptable` after a second `commit applied` (3), the stream event order (4, needs
the new line), the close codes (5). Diagnostic additions worth making with the fixes: NACK/FIR/PLI counters in, a `stream create` /
`stream server update` line, and the op 15 we *receive* already shows in `voice-gw[…] in`.
