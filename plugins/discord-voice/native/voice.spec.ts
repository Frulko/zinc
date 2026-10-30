// zinc:discord-voice native side: the media of a Discord voice connection, on its own thread. index.ts speaks the voice gateway (JSON over
// zinc:socket) and hands this side what it learns: the UDP endpoint and SSRC (Ready), then the mode and key (Session Description). From
// there one worker owns the UDP socket, the encryption, Opus, the jitter buffers, the mix and the audio devices; index.ts polls speaking()
// on a timer. Records use \u001e between items and \u001f between fields.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Opens UDP to the voice server and sends IP discovery for `ssrc`; a handle, or -1 (see error()). */
  connect(host: string, port: i32, ssrc: u32): i32;
  /** Why the last call failed, '' when it did not. */
  error(): string;
  /** "address\u001fport" as the voice server saw us (IP discovery), '' until it answered. */
  discovered(h: i32): string;
  /** The encryption modes this side has, best first, separated by \u001f (aead_aes256_gcm_rtpsize, aead_xchacha20_poly1305_rtpsize). */
  modes(): string;
  /** Starts the media with Session Description's mode and 32-byte key: capture, encode and send; receive, decode and play. False (see
   *  error()) for a mode it does not know or a key that is not 32 bytes. The fake microphone (ZINC_FAKE_MICROPHONE=1, a 440 Hz tone)
   *  and no output device in that case: what the tests use. audio false: a Go Live connection, video only (no device is opened, the voice
   *  packets are dropped). */
  start(h: i32, mode: string, key: u8[], audio: boolean): boolean;
  /** mute: send nothing; deaf: play nothing; ptt: push-to-talk mode, then `held` says when to send (else the voice activity decides). */
  controls(h: i32, mute: boolean, deaf: boolean, ptt: boolean, held: boolean): void;
  /** The microphones (output false) or the speakers (true) as records "id\u001fname": ids as zinc:microphone's devices() writes them.
   *  With the fake microphone (ZINC_FAKE_MICROPHONE=1, where no device is opened) "Zinc Fake Microphone" and "Zinc Fake Speakers". */
  devices(output: boolean): string;
  /** The microphone and the speakers to use ('' the system's default; one that is gone falls back to it); during a call, at once. */
  setDevices(h: i32, input: string, output: string): void;
  /** Gains of the microphone (before the voice activity) and of the whole output (1: as is, 2: twice), and the voice activity threshold:
   *  the RMS level 0..1 under which nothing is sent. */
  setAudio(h: i32, inputGain: f64, outputGain: f64, threshold: f64): void;
  /** One user's gain in the mix (1: as is). */
  setUserVolume(h: i32, user: string, gain: f64): void;
  /** The microphone's level now (RMS 0..1, after its gain), sent or not: a meter reads it. */
  level(h: i32): f64;
  /** The SSRC <-> user binding of the voice gateway's Speaking (op 5), so a stream can be told apart before it is heard. */
  bind(h: i32, ssrc: u32, user: string): void;
  /** Who is heard now: records "user or ssrc\u001flevel 0..1"; "me" is us while we send. */
  speaking(h: i32): string;
  /** [packets sent, packets received, decryption failures, frames decoded, frames mixed into the output, late or lost packets] */
  stats(h: i32): f64[];
  /** Video, H.264 (VideoToolbox; none elsewhere yet): our camera's or screen's stream, its SSRC from Ready's `streams` (0: we send no
   *  video), the encoder's bitrate in bit/s (0: from the frame's size) and frame rate. */
  videoSend(h: i32, ssrc: u32, bitrate: i32, fps: i32): void;
  /** The newest frame of a runtime image (a zinc:camera Camera's) to encode and send on the media thread; false when it cannot be read. */
  sendImage(h: i32, image: i32): boolean;
  /** Decodes the camera of the stream `ssrc` (someone's, from op 12) at most width x height pixels (the decoder scales it); 0 x 0 stops
   *  decoding it: its packets are dropped unopened and its image freed. */
  watch(h: i32, ssrc: u32, user: string, width: i32, height: i32): void;
  /** The runtime image of the newest decoded frame of `ssrc`, moved to that frame now (no copy); -1 before the first. */
  videoImage(h: i32, ssrc: u32): i32;
  /** [video frames encoded, video packets sent, video frames decoded, key frames asked of the others (PLI), key frames they asked of us] */
  videoStats(h: i32): f64[];
  /** Stops the media and closes the socket and the devices. */
  close(h: i32): void;

  /** DAVE (end-to-end encryption, libdave): the highest protocol version this side speaks (Identify's max_dave_protocol_version). */
  daveVersion(): i32;
  /** Starts (or restarts, at epoch 1) the MLS group of the call at `version` for our user: our key package (op 26); [] for version 0 (the
   *  call is not end-to-end encrypted: frames pass as they are). From the first group on, no frame is sent before a key ratchet is set. */
  daveInit(h: i32, version: i32, channelId: string, userId: string): u8[];
  /** Op 25: the voice gateway's external sender. */
  daveExternalSender(h: i32, bytes: u8[]): void;
  /** Op 27: proposals (the operation byte first); our commit and welcome to send as op 28, [] when there is none. `recognized`: the user
   *  ids expected in the call (\u001f between), the others are refused. */
  daveProposals(h: i32, bytes: u8[], recognized: string): u8[];
  /** Op 29 (without the transition id): 1 applied, 0 ignored, -1 failed (send op 31 and start again). */
  daveCommit(h: i32, bytes: u8[]): i32;
  /** Op 30 (without the transition id): 1 joined, -1 failed. */
  daveWelcome(h: i32, bytes: u8[], recognized: string): i32;
  /** Op 22 (or a transition of id 0, at once): the new keys take over, or plain frames for version 0. */
  daveExecute(h: i32, version: i32): void;
  /** "version\u001fkeyed (1/0)\u001fframes not encrypted\u001fframes not decrypted\u001flast failure" (the failure is cleared). */
  daveState(h: i32): string;

  /** RTP framing and the transport encryption, for the tests: the 12-byte RTP header of a voice packet. */
  header(seq: i32, timestamp: u32, ssrc: u32): u8[];
  /** `header` + the encrypted payload + its tag + the 4-byte nonce counter, as the client sends it. [] for an unknown mode or key. */
  seal(mode: string, key: u8[], header: u8[], counter: u32, payload: u8[]): u8[];
  /** The payload of a received packet (its RTP header extension skipped), [] when it does not authenticate. */
  unseal(mode: string, key: u8[], packet: u8[]): u8[];
}
export default requireNative<Spec>('DiscordVoice');
