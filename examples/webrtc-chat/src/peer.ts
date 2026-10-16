// One side of the call: an RTCPeerConnection with two data channels, 'chat' (text, pings) and 'file' (bytes), and the signals the screen
// shows. The offerer opens the channels; the answerer gets them through ondatachannel. On 'chat', the first letter says what a message is:
// m a chat line, p a ping and q its pong (round-trip time), f a file header (name, size, checksum), d the file's end.
import { createSignal } from 'zinc:ui/solid';
import { RTCPeerConnection, RTCDataChannel, RTCIceCandidate, RTCIceServer, RTCSessionDescription, RTCSessionDescriptionInit, RTCPeerConnectionIceEvent, RTCDataChannelEvent } from 'zinc:webrtc';
import { MessageEvent } from 'zinc:web';

export const CHUNK = 16 * 1024;

export class Line {
  from: string; text: string; mine: boolean;
  constructor(from: string, text: string, mine: boolean) { this.from = from; this.text = text; this.mine = mine; }
}

/** A sample "file" of n bytes: what "Send a file" sends when no path is given. */
export function sample(n: i32): u8[] {
  const b: u8[] = [];
  for (let i = 0; i < n; i++) b.push((i * 31 + (i >> 9)) & 255);
  return b;
}
export function checksum(b: u8[]): i32 {
  let h = 0;
  for (let i = 0; i < b.length; i++) h = (Math.imul(h, 31) + b[i]) | 0;
  return h;
}
function now(): number { return performance.now(); }
function kb(n: number): string { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
function describe(c: RTCIceCandidate): string { return `${c.type} ${c.protocol} ${c.address}:${c.port}`; }

export class Peer {
  readonly name: string;
  pc: RTCPeerConnection;
  chat: RTCDataChannel | null = null;
  file: RTCDataChannel | null = null;
  /** Called with each message the other side must get (trickle candidates as JSON); null: no trickle, the descriptions carry them. */
  onSignal: ((json: string) => void) | null = null;
  /** Called with lines for the log of the scripted session (WEBRTC_DEMO_LOG=1). */
  onLog: (line: string) => void = (s: string) => {};
  readonly state: () => string; private setState: (s: string) => void;
  readonly ice: () => string; private setIce: (s: string) => void;
  readonly candidates: () => string[]; private setCandidates: (c: string[]) => void;
  readonly lines: () => Line[]; private setLines: (l: Line[]) => void;
  readonly rtt: () => number; private setRtt: (ms: number) => void;
  readonly transfer: () => string; private setTransfer: (s: string) => void;
  readonly progress: () => number; private setProgress: (p: number) => void;
  private incoming: u8[] = [];
  private expect: number = 0; private expectSum: i32 = 0; private expectName: string = '';
  private started: number = 0;
  private pinger: i32 = -1;

  constructor(name: string, iceServers: RTCIceServer[]) {
    this.name = name;
    const [st, sst] = createSignal<string>('new'); this.state = st; this.setState = sst;
    const [ic, sic] = createSignal<string>('new'); this.ice = ic; this.setIce = sic;
    const [ca, sca] = createSignal<string[]>([]); this.candidates = ca; this.setCandidates = sca;
    const [li, sli] = createSignal<Line[]>([]); this.lines = li; this.setLines = sli;
    const [rt, srt] = createSignal<number>(-1); this.rtt = rt; this.setRtt = srt;
    const [tr, str] = createSignal<string>(''); this.transfer = tr; this.setTransfer = str;
    const [pr, spr] = createSignal<number>(0); this.progress = pr; this.setProgress = spr;
    this.pc = new RTCPeerConnection({ iceServers: iceServers });
    this.pc.onconnectionstatechange = () => {
      this.setState(this.pc.connectionState);
      this.onLog(`${this.name} ${this.pc.connectionState}`);
      if (this.pc.connectionState === 'connected' && this.pinger < 0) this.pinger = setInterval(() => this.ping(), 1000);
    };
    this.pc.oniceconnectionstatechange = () => { this.setIce(this.pc.iceConnectionState); };
    this.pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate === null) return;
      const c = e.candidate as RTCIceCandidate;
      this.setCandidates(this.candidates().concat([describe(c)]));
      const out = this.onSignal;
      if (out !== null) out(JSON.stringify({ type: 'candidate', candidate: c.candidate, sdpMid: c.sdpMid ?? '0' }));
    };
    this.pc.ondatachannel = (e: RTCDataChannelEvent) => { this.attach(e.channel); };
  }

  /** The offer as JSON ({ type, sdp }); without trickle it waits for every candidate. */
  async offer(): Promise<string> {
    this.attach(this.pc.createDataChannel('chat'));
    this.attach(this.pc.createDataChannel('file'));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return await this.described();
  }
  /** Takes the other side's offer and gives the answer as JSON. */
  async answer(offer: string): Promise<string> {
    await this.pc.setRemoteDescription(parseDescription(offer));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return await this.described();
  }
  async accept(answer: string): Promise<void> { await this.pc.setRemoteDescription(parseDescription(answer)); }
  /** A trickled candidate from the other side (the JSON onSignal gave there). */
  async candidate(json: string): Promise<void> {
    const o: any = JSON.parse(json);
    await this.pc.addIceCandidate({ candidate: o.candidate as string, sdpMid: o.sdpMid as string });
  }
  private async described(): Promise<string> {
    if (this.onSignal === null) await until(() => this.pc.iceGatheringState === 'complete');
    const d = this.pc.localDescription as RTCSessionDescription;
    return JSON.stringify({ type: d.type, sdp: d.sdp });
  }

  get open(): boolean { const c = this.chat; return c !== null && (c as RTCDataChannel).readyState === 'open'; }
  say(text: string): void {
    if (text === '' || !this.open) return;
    (this.chat as RTCDataChannel).send('m' + text);
    this.add(new Line(this.name, text, true));
  }
  /** Sends `bytes` as `name`: a header on 'chat', 16 KB chunks on 'file' as fast as the channel drains, then the end. */
  sendFile(name: string, bytes: u8[]): void {
    const f = this.file;
    if (!this.open || f === null) return;
    const ch = f as RTCDataChannel;
    (this.chat as RTCDataChannel).send('f' + JSON.stringify({ name: name, size: bytes.length, sum: checksum(bytes) }));
    let at = 0;
    const t0 = now();
    ch.bufferedAmountLowThreshold = 256 * 1024;
    const pump = () => {
      while (at < bytes.length && ch.bufferedAmount < 1024 * 1024) {
        ch.send(bytes.slice(at, Math.min(at + CHUNK, bytes.length)));
        at += CHUNK;
      }
      this.setProgress(Math.min(1, at / bytes.length));
      if (at < bytes.length) return;
      ch.onbufferedamountlow = null;
      (this.chat as RTCDataChannel).send('d');
      const s = (now() - t0) / 1000;
      this.setTransfer(`sent ${name}, ${kb(bytes.length)}` + (s > 0.001 ? ` at ${kb(bytes.length / s)}/s` : ''));
    };
    ch.onbufferedamountlow = () => pump();
    this.setTransfer(`sending ${name}...`);
    pump();
  }
  close(): void {
    if (this.pinger >= 0) { clearInterval(this.pinger); this.pinger = -1; }
    this.pc.close();
    this.setState('closed');
  }

  private add(l: Line): void { this.setLines(this.lines().concat([l])); }
  private ping(): void { if (this.open) (this.chat as RTCDataChannel).send('p' + now()); }
  private attach(ch: RTCDataChannel): void {
    if (ch.label === 'file') {
      this.file = ch;
      ch.onmessage = (e: MessageEvent) => {
        const b = e.data as u8[];
        if (this.incoming.length === 0) this.started = now();
        this.incoming = this.incoming.concat(b);
        if (this.expect > 0) this.setProgress(Math.min(1, this.incoming.length / this.expect));
      };
      return;
    }
    this.chat = ch;
    ch.onopen = () => { this.onLog(`${this.name} chat open`); };
    ch.onclose = () => { this.onLog(`${this.name} chat closed`); };
    ch.onmessage = (e: MessageEvent) => {
      const s = e.data as string, kind = s.substring(0, 1), rest = s.substring(1);
      if (kind === 'm') { this.add(new Line('peer', rest, false)); this.onLog(`${this.name} got "${rest}"`); }
      else if (kind === 'p') ch.send('q' + rest);
      else if (kind === 'q') this.setRtt(now() - parseFloat(rest));
      else if (kind === 'f') {
        const o: any = JSON.parse(rest);
        this.expectName = o.name as string; this.expect = o.size as number; this.expectSum = o.sum as i32;
        this.incoming = []; this.setProgress(0);
        this.setTransfer(`receiving ${this.expectName}...`);
      } else if (kind === 'd') this.finish();
    };
  }
  // 'd' comes on 'chat' and may pass the last chunks of 'file' (two channels): wait for them
  private finish(): void {
    if (this.incoming.length < this.expect) { setTimeout(() => this.finish(), 5); return; }
    const s = (now() - this.started) / 1000, ok = checksum(this.incoming) === this.expectSum;
    this.setProgress(1);
    this.setTransfer(`received ${this.expectName}, ${kb(this.incoming.length)}, ${ok ? 'checksum ok' : 'CHECKSUM WRONG'}` + (s > 0.001 ? `, ${kb(this.incoming.length / s)}/s` : ''));
    this.onLog(`${this.name} received ${this.expectName} ${this.incoming.length} bytes ${ok ? 'ok' : 'wrong'}`);
    this.incoming = []; this.expect = 0;
  }
}

/** { type, sdp } from the JSON of the other side (pasted text may have spaces and line breaks around it). */
export function parseDescription(json: string): RTCSessionDescriptionInit {
  const o: any = JSON.parse(json.trim());
  return { type: o.type as string, sdp: o.sdp as string };
}
export function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
