# webrtc plugin (`zinc:webrtc`)

WebRTC with the Web's API: `RTCPeerConnection`, `RTCDataChannel`, `RTCRtpSender`, `RTCRtpReceiver`, `RTCRtpTransceiver`,
`RTCSessionDescription`, `RTCIceCandidate` and their events. Two programs (or a program and a browser) open a peer-to-peer connection and
send text, bytes, audio and video to each other, on a LAN with no server at all, or across the Internet through STUN and TURN. The stack is
[libdatachannel](https://github.com/paullouisageneau/libdatachannel) (ICE by libjuice, SCTP by usrsctp, DTLS by the engine's mbedTLS, SRTP
by libsrtp, the RTP packetizers and RTCP handlers), Opus (libopus) and VP8 (libvpx) for the codecs, H.264 through VideoToolbox on macOS,
vendored in `plugins/webrtc/vendor/` (versions and checksums in `PIN`) and built by the plugin build with the pinned zig. Why this stack and
these codecs: [the scoring](../reports/zinc-webrtc.md).

```ts
// On the Zinc engines the RTC names are globals (the compiler adds the import); on QuickJS: import { RTCPeerConnection } from 'zinc:webrtc'
const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
const chat = pc.createDataChannel('chat');                        // { ordered, maxRetransmits, maxPacketLifeTime, protocol, negotiated, id }
chat.onopen = () => chat.send('hello');
chat.onmessage = (e: MessageEvent) => console.log(e.data as string);
pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => { if (e.candidate !== null) signal.send(JSON.stringify((e.candidate as RTCIceCandidate).toJSON())); };
pc.onconnectionstatechange = () => console.log(pc.connectionState);
await pc.setLocalDescription(await pc.createOffer());
signal.send(JSON.stringify((pc.localDescription as RTCSessionDescription).toJSON()));   // the peer: setRemoteDescription, createAnswer, setLocalDescription...
```

Signalling (carrying the offer, the answer and the candidates from one peer to the other) is the program's job, as on the Web: a WebSocket
(`zinc:socket` has a client and a server), a QR code, copy and paste. `examples/webrtc-chat` shows three ways.

```ts
// a call: the camera and the microphone to the peer, the peer's tracks drawn and heard
import 'zinc:camera'; import 'zinc:microphone';
import { RemoteVideo, RemoteAudio } from 'zinc:webrtc';
import { stream } from 'zinc:audio';
const local = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
for (const t of local.getTracks()) pc.addTrack(t, local);
const speaker = stream(1, 48000);
pc.ontrack = (e: RTCTrackEvent) => {
  if (e.track.kind === 'video') video = e.track.camera as RemoteVideo;       // <Image source={video.image}> or gfx.drawImage(video.image, ...)
  else (e.track.microphone as RemoteAudio).onData((s: number[]) => speaker.write(s));
};
```

`examples/webrtc-call` is a whole call: preview, mute, camera picker, speaker, stats overlay.

## What is supported

| | |
|---|---|
| `new RTCPeerConnection({ iceServers, iceTransportPolicy })` | `iceServers`: `{ urls, username, credential }`, urls `stun:`, `turn:` (`?transport=udp` or `tcp`), `turns:`. Without servers (the default) only host candidates are gathered: enough on a LAN and for two peers in one process. `iceTransportPolicy: 'relay'`: TURN only. A URL libdatachannel cannot read: `SyntaxError` |
| `createOffer()`, `createAnswer()`, `setLocalDescription(desc?)`, `setRemoteDescription(desc)`, `addIceCandidate(c?)` | promises, as on the Web. `setLocalDescription` applies the description `createOffer`/`createAnswer` made (libdatachannel writes it again; what an edit changes in a media section is kept, below) or, with no argument, the one the state calls for. A description that cannot be read or applied rejects with `OperationError`; a call in the wrong state with `InvalidStateError` |
| trickle ICE | `onicecandidate` gives each candidate as it is found (`event.candidate`, `null` at the end); the peer adds them with `addIceCandidate` once it has the remote description |
| without trickle | wait for `iceGatheringState === 'complete'` (or the `null` candidate), then send `pc.localDescription`: it carries every candidate |
| states and events | `connectionState`, `iceConnectionState`, `iceGatheringState`, `signalingState` and their `on...change` events; `ondatachannel`; `ontrack`; `onnegotiationneeded` for the first channel and for each change of tracks or directions (once per turn, when stable, unless an offer made since holds it). `addEventListener` works for all of them |
| `createDataChannel(label, init)` | `ordered` (true), `maxRetransmits` or `maxPacketLifeTime` (a partially reliable channel; both: `TypeError`), `protocol`, `negotiated` with an `id`. A channel opened after the connection is up reaches the peer through `ondatachannel` (either side may open one) |
| `RTCDataChannel` | `send(string \| u8[] \| Blob)`, `label`, `id`, `ordered`, `maxRetransmits`, `maxPacketLifeTime`, `protocol`, `negotiated`, `readyState`, `bufferedAmount`, `bufferedAmountLowThreshold`, `binaryType`, `maxMessageSize` (Zinc's, not the Web's: 256 KiB between two Zinc peers), `close()`; events `open`, `message`, `close`, `error`, `bufferedamountlow` |
| binary messages | `event.data` is a `u8[]` (Zinc has no ArrayBuffer; a real `Uint8Array` on QuickJS), or a `Blob` with `binaryType = 'blob'`. A message is delivered whole: 200 KB in one `send` arrives as one message. A message larger than `maxMessageSize` is a `TypeError` |
| `getStats()` | a `Map` of three `RTCStats`: `peer-connection` (`dataChannelsOpened`, `dataChannelsClosed`), `transport` (`bytesSent`, `bytesReceived`, `messagesSent`, `messagesReceived` of the channels), `candidate-pair` (`localAddress`, `remoteAddress` in use) |
| `close()` | closes the connection and its channels: each channel fires `close`, the receivers' tracks end, the connection fires nothing more |

## Audio and video

| | |
|---|---|
| `addTrack(track, ...streams)` | sends a track of `getUserMedia` (zinc:camera, zinc:microphone), or a track received from another peer. A transceiver of its kind made by the peer's offer and not sending yet takes it, else a new `sendrecv` one. The same track twice: `InvalidAccessError`. Calls for a negotiation (`negotiationneeded`) |
| `addTransceiver(kind \| track, { direction, streams, sendEncodings })` | a media section: `direction` `sendrecv` (default), `sendonly`, `recvonly`, `inactive`; one encoding, or two with distinct `rid`s for video: simulcast for a media server (Galène), the second one smaller (`scaleResolutionDownBy` 2, 100 kbit/s by default), sent when the answer takes the rids (`a=simulcast:recv`), else the first goes out alone; more: `RangeError` |
| `removeTrack(sender)` | stops sending (the transceiver turns `recvonly` or `inactive`); the next negotiation tells the peer |
| `getTransceivers()`, `getSenders()`, `getReceivers()` | |
| `ontrack` | an `RTCTrackEvent` (`track`, `streams` with the peer's stream ids, `receiver`, `transceiver`) when a negotiation makes a transceiver receive |
| `RTCRtpSender` | `track`, `replaceTrack(track \| null)` (another camera, no negotiation; the other kind: `TypeError`), `getParameters()` / `setParameters()` with the encodings of `addTransceiver` (one by default): `maxBitrate` (bit/s), `maxFramerate`, `scaleResolutionDownBy`, `active`, `scalabilityMode` (`'L1T2'`: VP8 in two temporal layers, the default with simulcast; `'L1T1'`); `getStats()` gives one `outbound-rtp` per simulcast stream, with its `rid`; `setStreams()`, `getStats()`, `RTCRtpSender.getCapabilities(kind)` |
| `RTCRtpReceiver` | `track` (from the start; frames once the peer sends), `getParameters()`, `getStats()`, `RTCRtpReceiver.getCapabilities(kind)`; Zinc's `requestKeyFrame()` asks the peer for a key frame (a PLI) |
| `RTCRtpTransceiver` | `mid`, `direction` (setting it calls for a negotiation), `currentDirection`, `stop()`, `setCodecPreferences(codecs)` (an unknown codec: `InvalidModificationError`) |
| a muted track | `track.enabled = false` sends black frames or silence, as browsers do |
| the peer's video | `receiver.track.camera` is a `RemoteVideo`: `image` (a zinc:gfx runtime image: `<Image source={...}>`, `gfx.drawImage`), `width`, `height`, `frameIndex`, `onFrame(cb)`, `snapshot()` (RGBA) |
| the peer's audio | `receiver.track.microphone` is a `RemoteAudio`: `onData(cb)` gets 48 kHz mono blocks, `level()` their loudness; play them with `zinc:audio`'s `stream(1, 48000).write(samples)` (a 60 ms buffer that stays short when the clocks drift) |
| SDP | the media sections are written by this plugin; an edited offer or answer given to `setLocalDescription` keeps what it changes in a section: the codecs kept and their order, the direction, a `b=AS` / `b=TIAS` bandwidth |
| `getStats()` | adds `outbound-rtp` (`bytesSent`, `packetsSent` counted in 1200-byte fragments, `framesEncoded`, `keyFramesEncoded`, `framesPerSecond`, `frameWidth`, `frameHeight`, `pliCount`, `totalEncodeTime`, `targetBitrate`), `remote-inbound-rtp` (`roundTripTime`, `fractionLost`, `packetsLost`, `jitter` as the peer reports them), `inbound-rtp` (`bytesReceived`, `packetsReceived`, `packetsLost`, `jitter`, `framesDecoded`, `keyFramesDecoded`, `framesPerSecond`, `frameWidth`, `frameHeight`, `totalSamplesReceived`, `concealedSamples`, `framesDropped`, `pliCount`), `codec` (`mimeType`, `payloadType`, `clockRate`, `sdpFmtpLine`); the `candidate-pair` gets `currentRoundTripTime` and `availableOutgoingBitrate` (the peer's REMB, else what the encoders aim at) and the `transport` the media bytes |
| call quality (Zinc) | `new CallQuality()`, then `q.update(await pc.getStats())` every second: a `QualitySample` (`quality` `'good'` / `'fair'` / `'poor'`, `mos`, `lossPct`, `rttMs`, `jitterMs`, `sendKbps`, `recvKbps`, `availableKbps`, codecs, `framesDropped`), `q.history` (the last 60) and `q.poorFor` (poor readings in a row). The score is the E-model's MOS (ITU-T G.107, simplified as WebRTC monitors do) from the round trip, the jitter and the loss: 4.0 and over is good, 3.6 and over fair. `mosOf(rttMs, jitterMs, lossPct)` gives it alone. zinc:ui/kit's `CallStats` panel shows a reading live with sparklines |
| ultra low data mode (Zinc) | `setLowDataMode(pc, on, video = 'tiny')`: through `setParameters`, so the peer needs nothing; the audio goes out as Opus at 10 kbit/s (`LOW_DATA_AUDIO_BPS`) with DTX and in-band FEC, the video at a quarter of its size, 5 frames a second and 60 kbit/s at most, or not at all (`'off'`); off puts back the encodings the senders had. Turn it on by hand, or when `q.poorFor` reaches a few seconds |

**Codecs.** Opus (48 kHz, 20 ms frames, 32 kbit/s, in-band FEC) everywhere; an audio sender's `maxBitrate` sets its bit rate live, and at
16 kbit/s and under the encoder turns to voice, wideband, DTX (silence sends a frame every 400 ms; the 1-byte frames between are not sent)
and FEC for 15% loss. The receiver rebuilds a lost frame from the next packet's FEC. VP8 everywhere (libvpx, generic C: real time at 640x480 on
a desktop; a Pi 3 wants 320x240). H.264 constrained baseline (`profile-level-id=42e01f`, `packetization-mode=1`) where the machine has it
in hardware: VideoToolbox on macOS, negotiated first there; elsewhere it is not offered (no software H.264 is shipped: see the report).
`ZINC_WEBRTC_H264=0` leaves it out on a Mac too. Browsers (Chrome, Firefox, Safari) all take VP8, H.264 and Opus.

**What happens on the network.** Each transceiver has a worker thread: the camera's newest frame (taken from its runtime image on the
program's thread, no copy in Zinc) is converted to I420 (BT.601), encoded and handed to libdatachannel's packetizer, with sender reports,
answers to NACKs, and a key frame when the peer sends a PLI; the bit rate follows the size (about 900 kbit/s at 640x480, 30 fps), a REMB
from the peer and `maxBitrate`. Received packets are put back in order and into frames (a gap waits 100 ms for video, 60 ms for audio, then
counts as lost: video asks for a key frame, audio is concealed by Opus), decoded, and wait for the program's thread (the newest frame, a
second of audio at most). A peer's `packetsLost` in `remote-inbound-rtp` is what it reports: libdatachannel peers' count is approximate.

**Browsers.** `tools/webrtc-interop` (the T2 test `webrtc_interop`) runs a Zinc program against headless Chrome with the fake devices on
both sides: audio and video both ways, Zinc offering and Chrome offering, VP8 first and H.264 first. Zinc's offers ask for the DTLS client
role (`a=setup:active`): mbedTLS cannot be the server for Chrome, whose ClientHello arrives in several fragments.

## Not supported (yet)

- Spatial SVC and more than two simulcast streams, simulcast with H.264; a Zinc peer with audio and video does not take the unsignalled streams of a simulcast offer (send simulcast to a media server only), screen sharing
  (`getDisplayMedia`), insertable streams and encoded transforms, DTMF, transport-cc and send-side bandwidth estimation (the bit rate
  follows REMB and `maxBitrate`), RTX and FEC for video (a loss costs a key frame), header extensions (abs-send-time, MID).
- H.264 on Linux and the Pi (V4L2 M2M), Windows (Media Foundation) and Android (MediaCodec), AV1 and VP9: see `backlog/later.md`.
- `restartIce`, `setConfiguration`, `RTCCertificate` (the certificate is a fresh ECDSA one per connection), `RTCError.errorDetail`.
- The browser target (wasm): the page's own `RTCPeerConnection` would be the way, not this plugin.
- Windows and Android: no build yet. iOS builds from the macOS sources (H.264 through VideoToolbox, VP8 through libvpx's generic C).

## STUN and TURN

Two peers on the same LAN need no server: their host candidates reach each other. Across NATs, a STUN server lets each peer learn its public
address (`stun:stun.l.google.com:19302` is a free public one; host your own with coturn for a school or a workshop). When both sides are
behind symmetric NATs or a firewall that drops UDP, only a TURN server (coturn, or a hosted one) relays the traffic:
`{ urls: 'turn:turn.example.org:3478', username: 'u', credential: 'p' }`; `turns:` runs it over TLS on port 443, which passes most
firewalls. A relayed connection costs the server's bandwidth.

## Privacy

Host candidates carry the machine's addresses: its LAN address and, so that two peers in one process connect without a network,
`127.0.0.1`. A program sends them to whoever it signals with, as a browser does (browsers hide the LAN address behind an mDNS name; this
plugin does not). With a STUN server the peer also learns the public address. Signal only with peers you trust, or use
`iceTransportPolicy: 'relay'` so that only the TURN server's address is shared. Nothing is sent before the program creates a connection.

## How it runs

libdatachannel runs on its own threads (the ICE agent of libjuice, the SCTP stack, a thread pool). Its callbacks only append to a queue;
`index.ts` takes the queue every 5 ms on the program's thread, while a connection or a channel lives, and fires the events there: no
callback ever runs on another thread. The connections are deleted two seconds after they close. The DTLS layer is the engine's mbedTLS 4
(built with threading and DTLS-SRTP for it): the plugin compiles against its headers and resolves it in the zinc that loads it, or in the
program when it is compiled ahead of time, so there is one TLS stack in the process. `ZINC_WEBRTC_LOG=1` prints libdatachannel's log.

On QuickJS a program that never draws runs its timers on a virtual clock: the queue is then polled as fast as the loop turns, and a
`setTimeout` used as a time limit fires early. A program that draws (`onFrame`, a UI) runs in real time on every engine.

## Size

The plugin's prebuilt libraries add about 3.7 MB to the CLI archive (compressed; 2.2 MB before the media: the codecs and SRTP add 1.5 MB)
and about 5 MB to a program compiled with it (3.5 MB before). The first build from source takes about two minutes (335 files, measured
2026-10-16 on the development Mac); prebuilt libraries skip it.

## Tests

`tests/t1/webrtc.sh`: two connections in one process with no ICE server (no network, no server, nothing left listening) on the
interpreter, QuickJS and a compiled program, against `tests/golden/host/webrtc_loopback.out`: trickle and whole descriptions, text
and bytes both ways in order, an unordered channel, a channel the answerer opens, 200 KB in one message, close events on both sides, the
errors; and the RTC names as globals. `tests/t1/webrtc_media.sh`: audio and video between two connections in one process with the
fake camera and microphone, on the interpreter (H.264 first on a Mac), with VP8 only, on QuickJS and compiled
(`tests/golden/host/webrtc_media.ts`: the picture by PSNR, the rate, a PLI, the tone by Goertzel, disabled tracks, replaceTrack,
setParameters, the stats, removeTrack and directions, setCodecPreferences, an edited SDP, close). `tests/t1/webrtc_chat.sh` and
`webrtc_call.sh` run the demos; `tests/t1/webrtc_quality.sh` checks the quality score and the low data mode's bit rates
(`tests/golden/host/webrtc_quality.ts`); `tests/t2/webrtc_interop.sh` runs against headless Chrome.
