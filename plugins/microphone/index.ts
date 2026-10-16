// zinc:microphone — microphones (docs/plugins/microphone.md): list them, open one at a rate and a channel count, receive its samples in
// blocks and a level for a meter. The native side (native/microphone.spec.ts) captures on miniaudio's thread; this file calls read() on a
// timer and runs the onData handlers. Without a microphone, or with ZINC_FAKE_MICROPHONE=1, or in a deterministic run, the microphone is
// "Zinc Fake Microphone": a tone whose loudness steps every 20 ms, the same samples for the same frame index on every machine.
// navigator.mediaDevices.getUserMedia({ audio: true }) (zinc:web) opens microphones through this module once a program imports it.
import S from './native/microphone.spec';
import { MediaStreamTrack, MediaTrackSettings, setMicrophoneBridge } from 'zinc:web';

const RS = '\u001e', FS = '\u001f';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export interface MicrophoneDevice { id: string; name: string }
export interface MicrophoneOptions { sampleRate?: number; channels?: number }

const status = (s: i32): PermissionStatus => s === 1 ? 'granted' : s === 2 ? 'denied' : 'undetermined';

/** Where access stands now, without asking. */
export function permissionStatus(): PermissionStatus { return status(S.permission(false)); }

/** Asks for the microphone: macOS shows its question once per app and resolves when the person answers (or after a minute,
 *  'undetermined'); a background run (ZINC_BACKGROUND=1) never asks. Elsewhere 'granted'. 'denied' too when zinc.json "permissions" lack
 *  "microphone" in an exported app. */
export function requestPermission(): Promise<PermissionStatus> {
  const first = S.permission(true);
  if (first !== 0) return Promise.resolve(status(first));   // 3: undetermined, not asked (a background run)
  return new Promise<PermissionStatus>((resolve: (s: PermissionStatus) => void) => {
    let tries = 0, t: i32 = -1;
    t = setInterval(() => {
      const s = S.permission(false);
      if (s === 0 && ++tries < 600) return;
      clearInterval(t);
      resolve(status(s));
    }, 100);
  });
}

/** The microphones of the machine ([] when there is none and ZINC_FAKE_MICROPHONE=0; else the fake microphone stands in). Rejects when
 *  zinc.json "permissions" refuse "microphone". */
export function devices(): Promise<MicrophoneDevice[]> {
  const s = S.devices(), e = S.error();
  if (e !== '') return Promise.reject(new Error(e));
  const out: MicrophoneDevice[] = [];
  for (const r of s.split(RS)) {
    if (r === '') continue;
    const f = r.split(FS);
    out.push({ id: f[0], name: f[1] });
  }
  return Promise.resolve(out);
}

export class Microphone {
  /** Frames per second and channels of the samples (the asked ones: miniaudio converts what the device has). */
  readonly sampleRate: number;
  readonly channels: number;
  readonly id: string;
  private h: i32;
  private timer: i32 = -1;
  private frames: number = 0;
  private cbs: ((samples: number[], frameIndex: number) => void)[] = [];

  /** Opens a microphone (an id of devices(), '' or nothing for the first one). Defaults: 48000 Hz, one channel. Rejects with the reason
   *  (no such microphone, access not granted: requestPermission() first, zinc.json "permissions"). */
  static open(id: string = '', o: MicrophoneOptions = {}): Promise<Microphone> {
    const h = S.open(id, o.sampleRate ?? 0, o.channels ?? 0);
    if (h < 0) return Promise.reject(new Error(S.error()));
    return Promise.resolve(new Microphone(h, id));
  }
  private constructor(h: i32, id: string) {
    const f = S.format(h);
    this.h = h; this.id = id;
    this.sampleRate = f[0]; this.channels = f[1];
    this.timer = setInterval(() => this.tick(), f[2]);
  }
  private tick(): void {
    if (this.h < 0) return;
    const s = S.read(this.h);
    if (s.length === 0) return;
    const first = this.frames;
    this.frames += s.length / this.channels;
    for (const cb of this.cbs.slice()) cb(s, first);
  }
  /** Each block of samples as it arrives (about every 20 ms), channels interleaved, -1..1, with the index of its first frame since open
   *  (frameIndex / sampleRate is its time in seconds). */
  onData(cb: (samples: number[], frameIndex: number) => void): void { this.cbs.push(cb); }
  /** Loudness of the last block: its RMS, 0 (silence) to 1. A meter reads it each frame. */
  level(): number { return this.h < 0 ? 0 : S.level(this.h); }
  /** Frames received so far. */
  get frameIndex(): number { return this.frames; }
  get isOpen(): boolean { return this.h >= 0; }
  /** Stops the capture. */
  close(): void {
    if (this.h < 0) return;
    clearInterval(this.timer);
    S.close(this.h);
    this.h = -1; this.cbs = [];
  }
}

// navigator.mediaDevices (zinc:web): getUserMedia({ audio }) and enumerateDevices come here once this module is loaded.
class Bridge {
  async devices(): Promise<string[]> {
    const out: string[] = [];
    for (const d of await devices()) out.push(d.id + FS + d.name);
    return out;
  }
  async open(id: string, rate: i32, channels: i32): Promise<MediaStreamTrack> {
    const mic = await Microphone.open(id, { sampleRate: rate, channels: channels });
    const name = (await devices()).find((d: MicrophoneDevice) => d.id === mic.id);
    const s = new MediaTrackSettings();
    s.deviceId = mic.id; s.sampleRate = mic.sampleRate; s.channelCount = mic.channels;
    return new MediaStreamTrack(name === undefined ? mic.id : name.name, s, mic, () => mic.close(), () => -1, 'audio');
  }
}
setMicrophoneBridge(new Bridge());
