# webrtc plugin (`zinc:webrtc`)

WebRTC data channels, with the Web's API: `RTCPeerConnection`, `RTCDataChannel`, `RTCSessionDescription`, `RTCIceCandidate`,
`RTCPeerConnectionIceEvent`, `RTCDataChannelEvent`. Two programs (or a program and a browser) open a peer-to-peer connection and send text
and bytes to each other, on a LAN with no server at all, or across the Internet through STUN and TURN. The stack is
[libdatachannel](https://github.com/paullouisageneau/libdatachannel) (ICE by libjuice, SCTP by usrsctp, DTLS by the engine's mbedTLS),
vendored in `plugins/webrtc/vendor/` (versions and checksums in `PIN`) and built by the plugin build with the pinned zig. Why this stack:
[the scoring](../reports/zinc-webrtc.md). Audio and video tracks are not there yet (below).

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

## What is supported

| | |
|---|---|
| `new RTCPeerConnection({ iceServers, iceTransportPolicy })` | `iceServers`: `{ urls, username, credential }`, urls `stun:`, `turn:` (`?transport=udp` or `tcp`), `turns:`. Without servers (the default) only host candidates are gathered: enough on a LAN and for two peers in one process. `iceTransportPolicy: 'relay'`: TURN only. A URL libdatachannel cannot read: `SyntaxError` |
| `createOffer()`, `createAnswer()`, `setLocalDescription(desc?)`, `setRemoteDescription(desc)`, `addIceCandidate(c?)` | promises, as on the Web. `setLocalDescription` applies the description `createOffer`/`createAnswer` made (its `sdp` is not read: SDP munging is not supported) or, with no argument, the one the state calls for. A description that cannot be read or applied rejects with `OperationError`; a call in the wrong state with `InvalidStateError` |
| trickle ICE | `onicecandidate` gives each candidate as it is found (`event.candidate`, `null` at the end); the peer adds them with `addIceCandidate` once it has the remote description |
| without trickle | wait for `iceGatheringState === 'complete'` (or the `null` candidate), then send `pc.localDescription`: it carries every candidate |
| states and events | `connectionState`, `iceConnectionState`, `iceGatheringState`, `signalingState` and their `on...change` events; `ondatachannel`; `onnegotiationneeded` once, for the first channel. `addEventListener` works for all of them |
| `createDataChannel(label, init)` | `ordered` (true), `maxRetransmits` or `maxPacketLifeTime` (a partially reliable channel; both: `TypeError`), `protocol`, `negotiated` with an `id`. A channel opened after the connection is up reaches the peer through `ondatachannel` (either side may open one) |
| `RTCDataChannel` | `send(string \| u8[] \| Blob)`, `label`, `id`, `ordered`, `maxRetransmits`, `maxPacketLifeTime`, `protocol`, `negotiated`, `readyState`, `bufferedAmount`, `bufferedAmountLowThreshold`, `binaryType`, `maxMessageSize` (Zinc's, not the Web's: 256 KiB between two Zinc peers), `close()`; events `open`, `message`, `close`, `error`, `bufferedamountlow` |
| binary messages | `event.data` is a `u8[]` (Zinc has no ArrayBuffer; a real `Uint8Array` on QuickJS), or a `Blob` with `binaryType = 'blob'`. A message is delivered whole: 200 KB in one `send` arrives as one message. A message larger than `maxMessageSize` is a `TypeError` |
| `getStats()` | a `Map` of three `RTCStats`: `peer-connection` (`dataChannelsOpened`, `dataChannelsClosed`), `transport` (`bytesSent`, `bytesReceived`, `messagesSent`, `messagesReceived` of the channels), `candidate-pair` (`localAddress`, `remoteAddress` in use) |
| `close()` | closes the connection and its channels: each channel fires `close`, the connection fires nothing more |

## Not supported (yet)

- **Audio and video tracks**: `addTrack`, `ontrack`, transceivers, `getUserMedia` streams sent to a peer. The plan (Opus through libopus,
  VP8 through libvpx, H.264 in hardware on macOS and the Pi) is in `next/backlog/later.md`. `zinc:microphone` captures audio already.
- Simulcast, SVC, `restartIce`, `setConfiguration`, `RTCCertificate` (the certificate is a fresh ECDSA one per connection), `getStats`
  beyond the counters above (no round-trip time: the demo measures it with a ping), DTMF, `RTCError.errorDetail`.
- The browser target (wasm): the page's own `RTCPeerConnection` would be the way, not this plugin.
- Windows, Android and iOS: no build yet (Android export: libdatachannel's `vendorFlags` are not passed to the app's CMake).

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

The plugin adds about 2.2 MB to the CLI archive (compressed: the library 1.0 MB, the archive for compiled programs 1.1 MB) and about
3.5 MB to a program compiled with it. The first build from source takes about a minute (74 files); prebuilt libraries skip it.

## Tests

`next/tests/t1/webrtc.sh`: two connections in one process with no ICE server (no network, no server, nothing left listening) on the
interpreter, QuickJS and a compiled program, against `next/tests/golden/host/webrtc_loopback.out`: trickle and whole descriptions, text
and bytes both ways in order, an unordered channel, a channel the answerer opens, 200 KB in one message, close events on both sides, the
errors; and the RTC names as globals. `next/tests/t1/webrtc_chat.sh` runs the demo.
