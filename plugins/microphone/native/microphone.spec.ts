// zinc:microphone native side: microphones are handles and nothing blocks. A device captures on miniaudio's thread into a ring buffer;
// index.ts calls read() on a timer and gets what came in since. Records use \u001e between items and \u001f between fields.
// microphone.host.cpp is the whole of it (miniaudio, the fake microphone); microphone.macos.mm adds the privacy question of macOS.
// microphone.sim.ts is the fake microphone alone, in Zinc.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** 0 undetermined, 1 granted, 2 denied (macOS privacy settings, or zinc.json "permissions"). `ask`: show the system's question when
   *  undetermined; it is answered later, so call again with false. 3: undetermined and not asked, in a background run (ZINC_BACKGROUND). */
  permission(ask: boolean): i32;
  /** The microphones: id, name records; the fake microphone when there is none or ZINC_FAKE_MICROPHONE=1. */
  devices(): string;
  /** Why the last devices() or open() failed, '' when it did not. */
  error(): string;
  /** Opens a microphone at `rate` frames per second (0: 48000) with `channels` (0: 1); a handle, or -1 (see error()). */
  open(id: string, rate: i32, channels: i32): i32;
  /** [frames per second, channels, how often to call read() in ms] of an open microphone. */
  format(h: i32): f64[];
  /** The samples captured since the last call, channels interleaved, -1..1; [] when none. The fake microphone makes one 20 ms block per call. */
  read(h: i32): f64[];
  /** Voice processing of an open microphone from its next block (native/voice.cpp, SpeexDSP): 1 echo cancellation, 2 noise suppression,
   *  4 gain control, or'ed; 0 turns it off. The processed blocks come 10 ms late. */
  processing(h: i32, what: i32): void;
  /** The far end for the echo canceller: what the speakers play, mono at `rate`, in order (about every 20 ms). */
  reference(h: i32, samples: f64[], rate: i32): void;
  /** RMS of the last block read() returned, 0..1. */
  level(h: i32): f64;
  close(h: i32): void;
}
export default requireNative<Spec>('Microphone');
