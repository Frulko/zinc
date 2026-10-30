// Everything that talks to the devices and the network, outside React: the camera and the microphone (getUserMedia through zinc:camera and
// zinc:microphone), the peer connections (zinc:webrtc), the speaker (zinc:audio) and the numbers of the stats overlay. The screen (App.tsx)
// reads these fields and re-renders when changed() calls it back; the video canvases read them every frame without a re-render.
//   - "This window": you and an echo peer in this program. Your camera and microphone go to the echo peer, which sends what it receives
//     straight back: the big picture went through the encoder, the network stack and the decoder twice. No network needed.
//   - "Room": one peer here, the other in another copy of the app, paired by room name through webrtc-chat's signalling server
//     (zinc run examples/webrtc-chat/signal-server.ts).
import { RTCPeerConnection, RTCTrackEvent, RTCStats, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCRtpSender, RemoteVideo, RemoteAudio, CallQuality, setLowDataMode } from 'zinc:webrtc';
import { devices, CameraDevice, Camera, requestPermission as askCamera } from 'zinc:camera';
import { Microphone, requestPermission as askMicrophone } from 'zinc:microphone';
import { stream, AudioStream } from 'zinc:audio';
import { pickScreen } from 'zinc:screen-capture/picker';
import { navigator, MediaStream, MediaStreamTrack, Event } from 'zinc:web';
import { WebSocket, MessageEvent as WsMessage } from 'zinc:socket';
import { env } from 'zinc:sys';

export type Stage = 'idle' | 'asking' | 'denied' | 'connecting' | 'live' | 'ended' | 'failed';
export type Mode = 'local' | 'room';

/** The numbers of the overlay, read once a second from getStats(). */
export class Numbers {
  sendKbps: number = 0; recvKbps: number = 0; fps: number = 0; width: number = 0; height: number = 0;
  rttMs: number = -1; lossPct: number = 0; codec: string = ''; audio: string = '';
  /** What the microphone's track alone sends. */
  audioKbps: number = 0;
}

export class Call {
  mode: Mode = env('CALL_MODE') === 'room' ? 'room' : 'local';
  stage: Stage = 'idle';
  why: string = '';
  cameras: CameraDevice[] = [];
  which: number = 0;
  micOn: boolean = true;
  camOn: boolean = true;
  sharing: boolean = false;       // the screen goes out instead of the camera
  speakerOn: boolean = false;     // off in this window: your own voice would come back through the speaker
  showStats: boolean = true;
  room: string = 'zinc';
  server: string = env('CALL_SIGNAL') !== '' ? env('CALL_SIGNAL') : 'ws://localhost:8787';
  numbers: Numbers = new Numbers();
  /** The call's health, a reading a second (the quality panel). */
  quality: CallQuality = new CallQuality(60);
  /** The ultra low data mode: Opus at 10 kbit/s with DTX and FEC, the video tiny. `autoLowData` turns it on after 5 poor seconds. */
  lowData: boolean = false;
  autoLowData: boolean = true;
  local: MediaStream | null = null;
  remoteVideo: MediaStreamTrack | null = null;
  remoteAudio: MediaStreamTrack | null = null;
  me: RTCPeerConnection | null = null;
  echo: RTCPeerConnection | null = null;   // "This window": the other side
  private socket: WebSocket | null = null;
  private speaker: AudioStream | null = null;
  private videoSender: RTCRtpSender | null = null;
  private lastSent: number = 0;
  private lastRecv: number = 0;
  private lastAudio: number = 0;
  private listeners: (() => void)[] = [];

  constructor() { setInterval((): void => { this.measure(); }, 1000); }
  onChange(f: () => void): void { this.listeners.push(f); }
  changed(): void { for (const f of this.listeners) f(); }
  log(s: string): void { if (env('CALL_LOG') === '1') console.log(s); }

  get camera(): Camera | null { const l = this.local; if (l === null) return null; const v = l.getVideoTracks(); return v.length > 0 ? v[0].camera as Camera : null; }
  /** What goes out as video: the camera's track, or the screen's while sharing. */
  get localVideo(): MediaStreamTrack | null { const l = this.local; if (l === null) return null; const v = l.getVideoTracks(); return v.length > 0 ? v[0] : null; }
  get microphone(): Microphone | null { const l = this.local; if (l === null) return null; const a = l.getAudioTracks(); return a.length > 0 ? a[0].microphone as Microphone : null; }
  /** Your microphone's loudness, 0..1 (0 while muted). */
  micLevel(): number { const m = this.microphone; return m === null || !this.micOn ? 0 : m.level(); }
  /** The other side's loudness, 0..1. */
  peerLevel(): number { const t = this.remoteAudio; return t === null ? 0 : (t.microphone as RemoteAudio).level(); }
  /** The image of the other side's video (-1 before its first frame), and its frame count. */
  peerImage(): number { const t = this.remoteVideo; return t === null ? -1 : (t.camera as RemoteVideo).image; }
  peerFrames(): number { const t = this.remoteVideo; return t === null ? -1 : (t.camera as RemoteVideo).frameIndex; }
  peerWidth(): number { const t = this.remoteVideo; return t === null ? 0 : (t.camera as RemoteVideo).width; }
  peerHeight(): number { const t = this.remoteVideo; return t === null ? 0 : (t.camera as RemoteVideo).height; }

  setMode(m: Mode): void { if (m !== this.mode) { this.hangUp(); this.mode = m; this.changed(); } }

  /** Call: asks for the camera and the microphone (once; a background run never asks), opens them, then connects. */
  async start(): Promise<void> {
    if (this.stage === 'connecting' || this.stage === 'live') return;
    this.stage = 'asking'; this.why = ''; this.changed();
    const cam = await askCamera(), mic = await askMicrophone();
    if (cam !== 'granted' || mic !== 'granted') {
      this.stage = 'denied';
      this.why = `${cam !== 'granted' ? 'Camera' : 'Microphone'} access is ${cam === 'denied' || mic === 'denied' ? 'off' : 'not given'}: turn it on for the app that started this one in System Settings › Privacy & Security.`;
      this.changed();
      return;
    }
    try {
      this.cameras = await devices();
      if (this.local === null) await this.openDevices();
    } catch (e) { this.fail((e as Error).message); return; }
    this.stage = 'connecting'; this.changed();
    try {
      if (this.mode === 'local') await this.connectHere(); else this.joinRoom();
    } catch (e) { this.fail((e as Error).message); }
  }
  private async openDevices(): Promise<void> {
    const id = this.which < this.cameras.length ? this.cameras[this.which].id : '';
    this.local = await navigator.mediaDevices.getUserMedia({ video: id === '' ? { width: 640, height: 480, frameRate: 30 } : { width: 640, height: 480, frameRate: 30, deviceId: id }, audio: true });
    this.applyMute();
    this.log(`devices: ${(this.local as MediaStream).getTracks().map((t: MediaStreamTrack) => `${t.kind} ${t.label}`).join(', ')}`);
  }
  private fail(why: string): void { this.why = why; this.stage = 'failed'; this.log(`failed: ${why}`); this.changed(); }

  private newPeer(): RTCPeerConnection {
    const pc = new RTCPeerConnection();
    pc.onconnectionstatechange = (): void => {
      this.log(`${pc === this.me ? 'you' : 'echo'} ${pc.connectionState}`);
      if (pc === this.me && pc.connectionState === 'connected') { this.stage = 'live'; this.changed(); }
      if (pc === this.me && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) this.fail(`The connection is ${pc.connectionState}.`);
    };
    return pc;
  }
  private sendTracks(pc: RTCPeerConnection): void {
    const l = this.local as MediaStream;
    for (const t of l.getTracks()) {
      const s = pc.addTrack(t, l);
      if (t.kind === 'video') this.videoSender = s;
    }
  }
  private receive(pc: RTCPeerConnection): void {
    pc.ontrack = (e: RTCTrackEvent): void => {
      this.log(`you receive ${e.track.kind}`);
      if (e.track.kind === 'video') this.remoteVideo = e.track;
      else { this.remoteAudio = e.track; (e.track.microphone as RemoteAudio).onData((s: number[]) => { const sp = this.speaker; if (sp !== null && this.speakerOn) sp.write(s); }); }
      this.changed();
    };
  }

  // ---- "This window": you -> echo -> you
  private async connectHere(): Promise<void> {
    const me = this.newPeer(), echo = this.newPeer();
    this.me = me; this.echo = echo;
    this.speaker = stream(1, 48000);
    me.onicecandidate = (e: RTCPeerConnectionIceEvent): void => { if (e.candidate !== null) echo.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
    echo.onicecandidate = (e: RTCPeerConnectionIceEvent): void => { if (e.candidate !== null) me.addIceCandidate((e.candidate as RTCIceCandidate).toJSON()); };
    echo.ontrack = (e: RTCTrackEvent): void => { if (e.streams.length > 0) echo.addTrack(e.track, e.streams[0]); else echo.addTrack(e.track); };   // what arrives goes straight back
    this.sendTracks(me);
    this.receive(me);
    const offer = await me.createOffer();
    await me.setLocalDescription(offer);
    await echo.setRemoteDescription(offer);
    const answer = await echo.createAnswer();
    await echo.setLocalDescription(answer);
    await me.setRemoteDescription(answer);
  }

  // ---- "Room": the signalling server relays the offer, the answer and the candidates (webrtc-chat's messages)
  private joinRoom(): void {
    const ws = new WebSocket(this.server + '/' + encodeURIComponent(this.room));
    this.socket = ws;
    const me = this.newPeer();
    this.me = me;
    this.speaker = stream(1, 48000);
    this.sendTracks(me);
    this.receive(me);
    me.onicecandidate = (e: RTCPeerConnectionIceEvent): void => {
      if (e.candidate === null) return;
      const c = e.candidate as RTCIceCandidate;
      ws.send(JSON.stringify({ type: 'candidate', candidate: c.candidate, sdpMid: c.sdpMid ?? '0' }));
    };
    ws.onerror = (): void => { this.fail(`No signalling server at ${this.server} (start it with: zinc run examples/webrtc-chat/signal-server.ts)`); };
    ws.onmessage = (e: WsMessage): void => {
      const o: any = JSON.parse(e.data);
      const type = o.type as string;
      this.log(`room: ${type}`);
      if (type === 'waiting') { this.why = `In room "${this.room}": waiting for the other side.`; this.changed(); }
      else if (type === 'full') this.fail(`Room "${this.room}" already has two people.`);
      else if (type === 'left') { this.why = 'The other side left.'; this.hangUp(); }
      else if (type === 'joined' && (o.offer as boolean)) this.offerTo(me, ws);
      else if (type === 'offer') this.answerTo(me, ws, o.sdp as string);
      else if (type === 'answer') me.setRemoteDescription({ type: 'answer', sdp: o.sdp as string });
      else if (type === 'candidate') me.addIceCandidate({ candidate: o.candidate as string, sdpMid: o.sdpMid as string });
    };
  }

  private async offerTo(me: RTCPeerConnection, ws: WebSocket): Promise<void> {
    const d = await me.createOffer();
    await me.setLocalDescription(d);
    ws.send(JSON.stringify({ type: 'offer', sdp: d.sdp ?? '' }));
  }
  private async answerTo(me: RTCPeerConnection, ws: WebSocket, sdp: string): Promise<void> {
    await me.setRemoteDescription({ type: 'offer', sdp: sdp });
    const d = await me.createAnswer();
    await me.setLocalDescription(d);
    ws.send(JSON.stringify({ type: 'answer', sdp: d.sdp ?? '' }));
  }

  hangUp(): void {
    for (const pc of [this.me, this.echo]) if (pc !== null) (pc as RTCPeerConnection).close();
    this.me = null; this.echo = null; this.videoSender = null;
    const ws = this.socket;
    if (ws !== null) { ws.close(); this.socket = null; }
    const sp = this.speaker;
    if (sp !== null) { sp.close(); this.speaker = null; }
    this.remoteVideo = null; this.remoteAudio = null;
    this.numbers = new Numbers(); this.lastSent = 0; this.lastRecv = 0; this.lastAudio = 0;
    this.quality.reset(); this.lowData = false;
    if (this.stage === 'live' || this.stage === 'connecting') this.stage = 'ended';
    this.log('hung up');
    this.changed();
  }
  /** Closes everything, the camera and the microphone too (the app quits). */
  close(): void {
    this.hangUp();
    const l = this.local;
    if (l !== null) for (const t of l.getTracks()) t.stop();
    this.local = null;
  }

  // ---- the buttons
  private applyMute(): void {
    const l = this.local;
    if (l === null) return;
    for (const t of l.getAudioTracks()) t.enabled = this.micOn;    // the peer hears silence
    for (const t of l.getVideoTracks()) t.enabled = this.camOn;    // the peer sees black
  }
  toggleMic(): void { this.micOn = !this.micOn; this.applyMute(); this.log(`microphone ${this.micOn ? 'on' : 'off'}`); this.changed(); }
  toggleCamera(): void { this.camOn = !this.camOn; this.applyMute(); this.log(`camera ${this.camOn ? 'on' : 'off'}`); this.changed(); }
  toggleSpeaker(): void { this.speakerOn = !this.speakerOn; this.log(`speaker ${this.speakerOn ? 'on' : 'off'}`); this.changed(); }
  toggleStats(): void { this.showStats = !this.showStats; this.changed(); }
  /** The ultra low data mode by hand; switching it off by hand also stops the automatic switch for this call. */
  async toggleLowData(): Promise<void> {
    if (this.lowData) this.autoLowData = false;
    await this.setLowData(!this.lowData, 'by hand');
  }
  private async setLowData(on: boolean, why: string): Promise<void> {
    const pc = this.me;
    this.lowData = on;
    if (pc !== null) await setLowDataMode(pc as RTCPeerConnection, on);
    this.log(`low data ${on ? 'on' : 'off'} (${why})`);
    this.changed();
  }
  /** The camera picker: another camera (or the same one, opened again) replaces the one sent, without a new negotiation (replaceTrack). */
  async pickCamera(i: number): Promise<void> {
    this.which = i;
    if (this.local === null) { this.changed(); return; }
    const d = this.cameras[i];
    const fresh = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30, deviceId: d.id } });
    this.sharing = false;
    await this.sendVideo(fresh.getVideoTracks()[0]);
    this.log(`camera ${d.name}`);
  }
  /** Screen sharing: the share dialog (zinc:screen-capture/picker: a screen or a window, its quality), then that source replaces the camera
   *  (replaceTrack, no new negotiation); pressed again, the camera comes back. macOS asks once for screen recording; refused, the reason and
   *  where to allow it are shown. */
  async toggleShare(): Promise<void> {
    if (this.local === null) return;
    if (this.sharing) { await this.pickCamera(this.which); return; }
    try {
      const c = await pickScreen({ frameRate: 15 });
      if (c === null || this.local === null) return;
      const track = (await navigator.mediaDevices.getDisplayMedia({ video: { deviceId: c.sourceId, width: c.width, height: c.height, frameRate: c.frameRate, cursor: c.cursor ? 'always' : 'never' } })).getVideoTracks()[0];
      track.addEventListener('ended', (_e: Event): void => { if (this.sharing) this.pickCamera(this.which); });   // the shared screen went away
      this.why = '';
      this.sharing = true;
      await this.sendVideo(track);
      this.log(`sharing ${track.getSettings().width}x${track.getSettings().height}`);
    } catch (e) { this.why = (e as Error).message; this.log(`share failed: ${this.why}`); this.changed(); }
  }
  // a new video track goes out in place of the one sent (the old one stops)
  private async sendVideo(track: MediaStreamTrack): Promise<void> {
    const l = this.local as MediaStream;
    track.enabled = this.camOn;
    const s = this.videoSender;
    if (s !== null) await (s as RTCRtpSender).replaceTrack(track);
    for (const old of l.getVideoTracks()) { l.removeTrack(old); old.stop(); }
    l.addTrack(track);
    this.changed();
  }

  // ---- the overlay's numbers: bit rates from the byte counts a second apart
  private async measure(): Promise<void> {
    const pc = this.me;
    if (pc === null || this.stage !== 'live') return;
    const all = await (pc as RTCPeerConnection).getStats();
    const n = new Numbers();
    let sent = 0, recv = 0, audio = 0;
    all.forEach((s: RTCStats): void => {
      if (s.type === 'outbound-rtp') { sent += s.bytesSent; if (s.kind === 'audio') audio += s.bytesSent; }
      else if (s.type === 'inbound-rtp') {
        recv += s.bytesReceived;
        if (s.kind === 'video') { n.fps = s.framesPerSecond; n.width = s.frameWidth; n.height = s.frameHeight; n.lossPct = s.packetsReceived > 0 ? 100 * s.packetsLost / (s.packetsReceived + s.packetsLost) : 0; }
      } else if (s.type === 'remote-inbound-rtp' && s.kind === 'video' && s.roundTripTime > 0) n.rttMs = s.roundTripTime * 1000;
      else if (s.type === 'codec') { if (s.mimeType.startsWith('video/')) n.codec = s.mimeType.substring(6); else n.audio = s.mimeType.substring(6); }
    });
    n.sendKbps = this.lastSent > 0 ? Math.max(0, (sent - this.lastSent) * 8 / 1000) : 0;
    n.recvKbps = this.lastRecv > 0 ? Math.max(0, (recv - this.lastRecv) * 8 / 1000) : 0;
    n.audioKbps = this.lastAudio > 0 ? Math.max(0, (audio - this.lastAudio) * 8 / 1000) : 0;
    this.lastSent = sent; this.lastRecv = recv; this.lastAudio = audio;
    this.numbers = n;
    this.quality.update(all);
    if (this.autoLowData && !this.lowData && this.quality.poorFor >= 5) await this.setLowData(true, 'the call stayed poor');
    this.changed();
  }
}

export const call = new Call();
