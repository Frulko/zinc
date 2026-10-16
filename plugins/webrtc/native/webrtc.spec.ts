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
  /** Applies a local description of that type ('offer', 'answer'; '' for the one the state calls for). */
  setLocalDescription(pc: i32, type: string): boolean;
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
}
export default requireNative<Spec>('WebRTC');
