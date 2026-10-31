// zinc:webrtc native side: libdatachannel (vendor/, its C API) under handles. Peer connections and data channels are ids of libdatachannel;
// everything they report (candidates, states, messages) arrives on libdatachannel's threads and is queued, and index.ts takes the queue
// on a timer with next(), so no callback ever runs on another thread than the program's. Fields are separated by \u001f.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** A peer connection. `iceServers`: STUN and TURN URLs, one per line ("stun:host:port", "turn:user:password@host:port?transport=udp");
   *  `relay`: only relayed candidates (iceTransportPolicy 'relay'). Its id, or -1 (see error()). */
  create(iceServers: string, relay: boolean): i32;
  /** Why the last call failed, '' when it did not. */
  error(): string;
  /** The next event, '' when there is none: kind, id, then its fields, the text last (it may hold \u001f). Kinds: cand (mid, candidate),
   *  state (0 new, 1 connecting, 2 connected, 3 disconnected, 4 failed, 5 closed), ice (0 new, 1 checking, 2 connected, 3 completed,
   *  4 failed, 5 disconnected, 6 closed), gather (0 new, 1 gathering, 2 complete), signal (0 stable, 1 have-local-offer,
   *  2 have-remote-offer, 3 have-local-pranswer, 4 have-remote-pranswer), channel (the new channel's id: a channel the peer opened),
   *  open, close, error (text), text (the message), binary (bytes(): the message), low (bufferedamountlow). */
  next(): string;
  /** The bytes of the last binary event next() returned. */
  bytes(): u8[];
  /** An offer or an answer for the current state, without applying it; '' on failure (see error()). */
  createOffer(pc: i32): string;
  createAnswer(pc: i32): string;
  /** Applies a local description of that type ('offer', 'answer'; '' for the one the state calls for). libdatachannel writes it again:
   *  from `sdp` (the program's, maybe edited; '' for none) each media section gives its codecs and their order, its direction and its
   *  b=AS / b=TIAS bandwidth to its transceiver first. */
  setLocalDescription(pc: i32, type: string, sdp: string): boolean;
  setRemoteDescription(pc: i32, sdp: string, type: string): boolean;
  /** A remote candidate ("candidate:..." or "a=candidate:..."), with the mid of its media section ('' for the first). */
  addIceCandidate(pc: i32, candidate: string, mid: string): boolean;
  /** type \u001f sdp of the current local / remote description, '' when there is none; the local one holds the candidates gathered so far. */
  localDescription(pc: i32): string;
  remoteDescription(pc: i32): string;
  /** A data channel; maxRetransmits and maxPacketLifeTime -1 when not set (reliable), id -1 to let the stack pick (negotiated needs one). */
  createDataChannel(pc: i32, label: string, protocol: string, ordered: boolean, maxRetransmits: i32, maxPacketLifeTime: i32, negotiated: boolean, id: i32): i32;
  /** label \u001f protocol \u001f stream id \u001f ordered (0/1) \u001f maxRetransmits \u001f maxPacketLifeTime (-1 when not set) of a channel. */
  channelInfo(dc: i32): string;
  sendText(dc: i32, text: string): boolean;
  sendBytes(dc: i32, data: u8[]): boolean;
  /** Bytes queued to send. */
  bufferedAmount(dc: i32): i32;
  setBufferedAmountLowThreshold(dc: i32, bytes: i32): void;
  /** The largest message the peer accepts. */
  maxMessageSize(dc: i32): i32;
  closeChannel(dc: i32): void;
  /** Closes the connection and its channels; their close events follow, then the id is freed. */
  close(pc: i32): void;
  /** local address \u001f remote address of the selected candidate pair, bytes sent \u001f bytes received \u001f messages sent \u001f
   *  messages received of the connection's channels. */
  stats(pc: i32): string;

  // ---- media: a transceiver is one media section (audio or video), its id the libdatachannel track's. Codecs: VP8 and Opus everywhere,
  // H.264 constrained baseline where the machine has it in hardware (VideoToolbox on macOS).
  /** The codecs of a kind ('audio', 'video') in the default order: mimeType \u001f clockRate \u001f channels \u001f sdpFmtpLine records (\u001e). */
  capabilities(kind: string): string;
  /** A new transceiver of a kind with a direction ('sendrecv', 'sendonly', 'recvonly', 'inactive'); its id, or -1 (see error()). */
  addTransceiver(pc: i32, kind: string, direction: string): i32;
  /** The transceivers of a connection (a remote offer adds some): id \u001f mid \u001f kind \u001f direction \u001f currentDirection \u001f
   *  ontrack due (1: the peer started sending; reported once) \u001f remote stream id \u001f remote track id \u001f send mimeType \u001f
   *  receive mimeType records (\u001e). */
  transceivers(pc: i32): string;
  setDirection(tx: i32, direction: string): void;
  /** mimeTypes in order of preference, comma-separated ('video/VP8,video/H264'), '' for the default; false for one this build lacks. */
  setCodecPreferences(tx: i32, mimeTypes: string): boolean;
  /** The msid of what the transceiver sends: stream ids (comma-separated) and the track id, '' when it sends no track. */
  setSender(tx: i32, streams: string, track: string): void;
  /** maxBitrate (bit/s, 0: chosen from the size), maxFramerate (0: the source's), scaleResolutionDownBy (1 or more), active. */
  setEncoding(tx: i32, maxBitrate: f64, maxFramerate: f64, scaleDown: f64, active: boolean): void;
  /** Simulcast and temporal layers (VP8): rids 'h,l' (the two encodings' rids, '' for one encoding), layers 2 for two temporal layers
   *  (L1T2), and the second encoding's maxBitrate (0: 100 kbit/s), maxFramerate, scaleResolutionDownBy and active. */
  setSimulcast(tx: i32, rids: string, layers: i32, maxBitrate: f64, maxFramerate: f64, scaleDown: f64, active: boolean): void;
  stopTransceiver(tx: i32): void;
  /** Sends the frame a runtime image of zinc:gfx holds (a camera's image), black when not enabled; false when the image cannot be read
   *  (a program without the rasterizer: sendPixels). */
  sendImage(tx: i32, image: i32, enabled: boolean): boolean;
  /** Sends an RGBA frame of w x h (a camera's snapshot()). */
  sendPixels(tx: i32, rgba: u8[], w: i32, h: i32, enabled: boolean): void;
  /** Sends samples (-1..1, channels interleaved) at a rate; silence when not enabled. */
  sendAudio(tx: i32, samples: f64[], rate: i32, channels: i32, enabled: boolean): void;
  /** Takes the newest decoded frame of the peer into the transceiver's image: the index of that frame, -1 before the first. */
  remoteFrame(tx: i32): i32;
  /** The runtime image with the peer's video (-1 before the first frame, or without the rasterizer). */
  remoteImage(tx: i32): i32;
  /** [width, height] of the peer's newest frame. */
  remoteSize(tx: i32): f64[];
  /** The peer's newest frame as RGBA bytes. */
  remoteSnapshot(tx: i32): u8[];
  /** The peer's audio decoded since the last call: 48 kHz, mono, -1..1. */
  remoteAudio(tx: i32): f64[];
  /** Asks the peer for a key frame (an RTCP PLI). */
  requestKeyframe(tx: i32): void;
  /** The counters of a transceiver: name=value fields (\u001f), read by getStats(). */
  txStats(tx: i32): string;
}
export default requireNative<Spec>('WebRTC');
