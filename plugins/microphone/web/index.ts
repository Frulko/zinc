// zinc:microphone in the browser (docs/targets/web.md, "Plugins"): the API of index.ts over getUserMedia and Web Audio. The samples arrive in blocks of about
// 20 ms from an AudioWorklet (a ScriptProcessor where the browser has no worklets), and a level for a meter is the RMS of the last block.
// Every audio MediaStreamTrack also gets `.microphone` (zinc:webrtc's RemoteAudio: the peer's voice is read like a local one).
const g: any = globalThis;
const Z = g.__zincWeb;

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export interface MicrophoneDevice { id: string; name: string }
export interface MicrophoneOptions { sampleRate?: number; channels?: number }

let state: PermissionStatus = 'undetermined';
function need(): void { Z.require('getUserMedia', 'a microphone needs getUserMedia, which browsers offer on https pages and on localhost only'); Z.require('audio', 'Web Audio'); }

export function permissionStatus(): PermissionStatus { return state; }
export async function requestPermission(): Promise<PermissionStatus> {
  need();
  try {
    const s: MediaStream = await g.navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    state = 'granted';
  } catch (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) state = 'denied'; else throw e; }
  return state;
}
export async function devices(): Promise<MicrophoneDevice[]> {
  need();
  const all: MediaDeviceInfo[] = await g.navigator.mediaDevices.enumerateDevices();
  return all.filter((d: MediaDeviceInfo) => d.kind === 'audioinput').map((d: MediaDeviceInfo, i: number) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}` }));
}

const WORKLET = `class P extends AudioWorkletProcessor { process(inputs) { const c = inputs[0]; if (c && c.length) { const n = c[0].length, out = new Float32Array(n * c.length); for (let i = 0; i < n; i++) for (let k = 0; k < c.length; k++) out[i * c.length + k] = c[k][i]; this.port.postMessage(out, [out.buffer]); } return true; } } registerProcessor('zinc-mic', P);`;
const loaded = new WeakSet<object>();

export class Microphone {
  readonly id: string;
  readonly sampleRate: number;
  channels: number;
  private ctx: AudioContext;
  private stream: MediaStream;
  private own: boolean;
  private node: any = null;
  private src: any;
  private cbs: ((samples: number[], frameIndex: number) => void)[] = [];
  private frames: number = 0;
  private lvl: number = 0;
  private pending: number[] = [];
  private closed: boolean = false;

  static async open(id: string = '', o: MicrophoneOptions = {}): Promise<Microphone> {
    need();
    const audio: any = { channelCount: o.channels || 1, echoCancellation: true, noiseSuppression: true };
    if (o.sampleRate) audio.sampleRate = o.sampleRate;
    if (id !== '') audio.deviceId = { exact: id };
    let s: MediaStream;
    try { s = await g.navigator.mediaDevices.getUserMedia({ audio }); } catch (e) { if (e && e.name === 'NotAllowedError') state = 'denied'; throw new Error(e && e.message ? e.message : String(e)); }
    state = 'granted';
    const m = new Microphone(s, id || s.getAudioTracks()[0].getSettings().deviceId || '', true, o.sampleRate || 0);
    await m.start();
    return m;
  }
  /** A microphone over an audio track the page already has: a local one, or the voice of a peer (RemoteAudio). */
  static ofTrack(track: MediaStreamTrack): Microphone {
    const m = new Microphone(new MediaStream([track]), track.getSettings().deviceId || '', false, 0);
    m.start();
    return m;
  }
  private constructor(stream: MediaStream, id: string, own: boolean, rate: number) {
    this.id = id; this.stream = stream; this.own = own;
    this.ctx = rate > 0 ? new (g.AudioContext || g.webkitAudioContext)({ sampleRate: rate }) : new (g.AudioContext || g.webkitAudioContext)();
    this.sampleRate = this.ctx.sampleRate;
    this.channels = stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings().channelCount || 1;
    this.src = this.ctx.createMediaStreamSource(stream);
    Z.onUserGesture(() => this.ctx.resume());
    this.ctx.resume().catch(() => {});
  }
  private async start(): Promise<void> {
    const block = Math.round(this.sampleRate * 0.02) * this.channels;
    const feed = (data: Float32Array): void => {
      if (this.closed) return;
      for (let i = 0; i < data.length; i++) this.pending.push(data[i]);
      while (this.pending.length >= block) this.deliver(this.pending.splice(0, block));
    };
    if (this.ctx.audioWorklet && typeof g.AudioWorkletNode === 'function') {
      if (!loaded.has(this.ctx)) { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })); await this.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url); loaded.add(this.ctx); }
      const n: any = new g.AudioWorkletNode(this.ctx, 'zinc-mic', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: this.channels, channelCountMode: 'explicit' });
      n.port.onmessage = (e: MessageEvent) => feed(e.data);
      this.src.connect(n);
      this.node = n;
    } else {
      const n: any = this.ctx.createScriptProcessor(1024, this.channels, 1);
      n.onaudioprocess = (e: any) => { const c = e.inputBuffer.numberOfChannels, len = e.inputBuffer.length, out = new Float32Array(len * c); for (let k = 0; k < c; k++) { const ch = e.inputBuffer.getChannelData(k); for (let i = 0; i < len; i++) out[i * c + k] = ch[i]; } feed(out); };
      this.src.connect(n); n.connect(this.ctx.destination);
      this.node = n;
    }
  }
  private deliver(samples: number[]): void {
    let sum = 0;
    for (const v of samples) sum += v * v;
    this.lvl = Math.min(1, Math.sqrt(sum / samples.length));
    const first = this.frames;
    this.frames += samples.length / this.channels;
    for (const cb of this.cbs.slice()) cb(samples, first);
  }
  onData(cb: (samples: number[], frameIndex: number) => void): void { this.cbs.push(cb); }
  level(): number { return this.closed ? 0 : this.lvl; }
  get frameIndex(): number { return this.frames; }
  get isOpen(): boolean { return !this.closed; }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.node) { try { this.src.disconnect(this.node); } catch {} if (this.node.port) this.node.port.onmessage = null; }
    if (this.own) this.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.ctx.close().catch(() => {});
    this.cbs = [];
  }
}

const mics = new WeakMap<object, Microphone>();
const proto: any = g.MediaStreamTrack && g.MediaStreamTrack.prototype;
if (proto && !Object.getOwnPropertyDescriptor(proto, 'microphone')) {
  Object.defineProperty(proto, 'microphone', {
    configurable: true,
    get(): Microphone | null {
      const t: any = this;
      if (t.kind !== 'audio') return null;
      let m = mics.get(t);
      if (m === undefined) { m = Microphone.ofTrack(t); mics.set(t, m); }
      return m;
    },
  });
}
