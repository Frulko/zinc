# discord-voice plugin (`zinc:discord-voice`)

A Discord voice connection: what a program needs once it has joined a voice channel or a DM call on the main gateway. Sources:
`plugins/discord-voice/`; the protocol is in `docs/reports/discord-client-research.md` (section 4); `examples/discord` uses it.

```ts
import { VoiceConnection, inputDevices, outputDevices } from 'zinc:discord-voice';
import { CallQuality } from 'zinc:webrtc/quality';

// after op 4 on the main gateway: VOICE_STATE_UPDATE gave session_id, VOICE_SERVER_UPDATE gave token and endpoint
const call = new VoiceConnection({ endpoint, token, serverId: guildId, channelId, userId, sessionId });
call.onState = (s) => console.log(s, call.e2ee ? 'end-to-end encrypted' : '');   // connecting, connected, reconnecting, closed
call.onSpeaking = (who) => console.log('speaking', who);                          // user ids, 'me' while we send
call.setMute(true); call.setDeaf(false); call.setPushToTalk(true); call.hold(true);
call.setDevices(inputDevices()[0].id, '');   // a microphone and the default speakers ('': the system's default), switched live
call.setVolumes(1.0, 1.5, 0.01);              // input gain, output gain, voice activity threshold (RMS 0..1; nothing is sent under it)
call.setUserVolume('101', 0.5);               // one user at half volume
call.level();                                 // the microphone's RMS now, sent or not: a meter
call.onVideo = () => console.log([...call.cameras.keys()]);   // who sends a camera (op 12)
call.watch(new Map([['101', [512, 288]]]));    // decode only 101's camera, at most 512x288 (op 15 asks the server for it, 0 for the rest)
call.videoImage('101');                        // its newest frame as a runtime image (<Image image={...}>)
call.setCamera(true); cam.onFrame(() => call.sendImage(cam.image));   // our zinc:camera, then op 4 self_video on the main gateway
const q = new CallQuality();                   // from 'zinc:webrtc/quality'
setInterval(() => { q.update(call.getStats()); if (q.poorFor >= 5) call.setLowDataMode(true); }, 1000);
call.close();   // then op 4 with a null channel
```

- **Targets.** macos and linux. It `requires` `net` and `threads`; the program asks for the microphone itself (`zinc:microphone`'s
  `requestPermission()`, `"microphone"` in zinc.json's permissions).
- **Voice gateway v8.** Identify, heartbeats with `seq_ack`, Ready, Select Protocol, Session Description, Speaking (sent when we start
  and stop sending), clients connecting and leaving, Resume after a dropped socket (the media keeps flowing over UDP).
- **Media**, on a native thread per connection: UDP with IP discovery, RTP, the `aead_aes256_gcm_rtpsize` (the engine's mbedTLS) and
  `aead_xchacha20_poly1305_rtpsize` (Monocypher) modes, Opus 48 kHz stereo 20 ms (the libopus of `plugins/webrtc`), voice activity with a
  300 ms hold, five silence frames after speech, a jitter buffer per speaker (two frames before it plays, eight at most), the mix, capture
  and playback through miniaudio. No echo cancellation: use headphones.
- **DAVE**, Discord's end-to-end encryption (mandatory since March 2026): libdave (MIT) on mlspp (BSD-2) and a vendored BoringSSL,
  `plugins/discord-voice/vendor/PIN`. The connection runs the protocol's ops 21 to 31; each Opus frame is encrypted by the group's key
  before the transport encryption, and no frame leaves while the group has no key. `e2ee` is the lock of the official client.
- **Video**, H.264 on the same UDP socket and keys (the desktop client's `udp` protocol; no WebRTC): Identify announces a camera stream,
  Ready grants its SSRC, op 12 describes ours before its first packet and tells us the others', op 15 asks for the shown streams only
  (quality 50 for a small tile, 100 from 640x360). A second native thread per connection encodes our frames (VideoToolbox, about
  0.1 bit per pixel, single NAL units and FU-A, the playout-delay extension) and decodes only the watched streams, scaled by VideoToolbox
  to their size, into buffers handed to the image without copies; DAVE encrypts and decrypts each video frame as it does audio. A key
  frame is asked (RTCP PLI) after a loss or when a stream starts showing, at most once a second, and a PLI from the server makes our next
  frame a key frame. macOS only for now (`plugins/webrtc/native/videotoolbox.cpp`); elsewhere no stream decodes and nothing is sent.
- **Quality.** Each second the native side sends an RTCP sender report for our streams with a receiver report block per stream it
  receives (RFC 3550: loss, interarrival jitter, the last sender report's time) and reads the server's blocks on ours. `getStats()` gives
  them as zinc:webrtc's `getStats()` does (`outbound-rtp`, `remote-inbound-rtp` with `fractionLost`, `jitter`, `roundTripTime`,
  `inbound-rtp` with `framesDropped`, `candidate-pair`, `codec`; ids carry the SSRC so two connections' reports merge), so
  `CallQuality` and zinc:ui/kit's `CallStats` read it. A video report over 10% lost lowers the encoder's bitrate by half the loss (not
  under 50 kbit/s); under 2% it climbs back 8% a report. `setLowDataMode(true)`: Opus at 10 kbit/s with DTX, voice, wideband and FEC for
  15% loss (the encoder settings of zinc:webrtc's low data mode), a camera at a quarter of its size, 5 fps and 60 kbit/s, a Go Live
  stream at half its size, 5 fps and 150 kbit/s. Whether Discord's servers answer our sender reports has not been checked on a real call.
- **Diagnostic.** `DISCORD_LOG=1` sends to the connection's `log`: every voice gateway message in and out but the heartbeats
  (`voice-gw[video]` for the call, `voice-gw[screen]` for a Go Live connection) with `token`, `session_id`, `secret_key` and the IP
  addresses replaced by `<redacted>` (DAVE's binary MLS messages: opcode and size only), and every 5 s the counters of each stream
  (`voice-rtp[...]`): sent (packets, bytes, bitrate, key frames, NAL types), received per SSRC (packets, bytes, lost, jitter, key
  frames, NAL types, transport decryption, DAVE and decoder failures), packets of other payload types (RTX, a codec we do not take) and
  DAVE's state. `examples/discord` prints it on standard output. The protocol it is checked against: `docs/reports/discord-video-protocol.md`.
- **Tests.** `ZINC_FAKE_MICROPHONE=1`: a 440 Hz tone and no audio device; `inputDevices()` and `outputDevices()` give "Zinc Fake Microphone" and "Zinc Fake Speakers". `rtpHeader`, `seal` and `unseal` give the framing and the transport
  encryption alone (`tests/golden/host/discord_voice_rtp.ts`, vectors recorded with Node by `plugins/discord-voice/tests/vectors.mjs`);
  `tests/t1/discord_voice.sh` runs a call against the fake Discord of `examples/discord/tests`.
- **Not yet.** Packet reordering and loss concealment (Opus PLC/FEC), RTX and NACK, REMB and transport-wide congestion control, simulcast layers of our camera, VP8/AV1,
  DAVE's verification codes (pairwise fingerprints).
- **Go Live experiments (ZN-921).** All off by default; the connect line `voice video variant: ...` (DISCORD_LOG=1) names the active ones, and
  the main gateway logs `stream op 22 sent paused ...` and `stream update paused <flag> viewers <n>`. Our video packets carry the native
  extension ids of docs.discord.food (transport-wide sequence number 5, playout-delay 6, content type 7, stream id "100" 11, repaired
  stream id 12 on RTX); `DISCORD_VIDEO_EXT` changes them: `legacy` (playout-delay alone on id 5, the old layout), `none`, or a list such as
  `-rid,-ct`, `pd=5`, `abs=2` (`twcc|pd|ct|rid|abs`, a `-` removes one). `DISCORD_VIDEO_PT=<n>` the H.264 payload type (RTX is n+1),
  `DISCORD_VIDEO_CODECS=h264,vp8` also declares VP8 (never encoded), `DISCORD_VIDEO_ACTIVE=false|late` op 12's `active` (`late`: false,
  then true a second later), `DISCORD_VIDEO_TYPE=screen` the type op 12 carries (Ready's `video` by default). Select Protocol carries a
  random `rtc_connection_id`. `tests/t0/discord_voice_dave.sh` proves our encrypted frames open with a second DAVE member's decryptor.
