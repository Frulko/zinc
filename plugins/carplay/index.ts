import { WebSocket, MessageEvent, OPEN_STATE } from 'zinc:socket';
import * as gfx from 'zinc:gfx';
import { URL } from 'zinc:web';
import C from './native/carplay.spec';
import { AudioStream, stream } from 'zinc:audio';
import { MicrophoneUplink } from './microphone';
import { SecondaryScreen } from './secondary';

class AudioTrack {
  decoder: i32 = -1;
  codec: i32 = 0;
  output: AudioStream;
  constructor(channels: i32, rate: i32, wirelessMedia: boolean) {
    this.output = wirelessMedia ? stream(channels, rate, 500, 900) : stream(channels, rate);
  }
  close(): void { this.output.close(); if (this.decoder >= 0) C.close(this.decoder); }
}

/** Coordinates in the projected screen's pixels; id is a stable slot (0 or 1). */
export interface TouchContact { id: i32; x: number; y: number; down: boolean }
class Finger {
  source: i32 = 0;
  assigned: boolean = false;
  x: number = 0;
  y: number = 0;
  down: boolean = false;
}

export interface HudSnapshot {
  active: boolean; road: string; instruction: string; distance: number; remaining: number;
  distanceKnown: boolean; remainingKnown: boolean; remainingSeconds?: number;
  destination: string; source: string; sourceSupportsGuidance?: boolean;
  routePackets: number; mediaPackets: number;
  maneuver: i32; title: string; artist: string; album?: string; mediaApp?: string;
  artworkId?: i32; durationMs?: number; elapsedMs?: number; playbackStatus?: i32; stale: boolean;
}
export interface DebugGpsSnapshot {
  enabled: boolean; subscribed: boolean; requested?: i32[]; lat?: number; lon?: number; points: i32;
  seconds: number; duration: number; playing: boolean; sent?: number; lastSentMillis?: number;
}
export interface Iap2Capability {
  id: i32; name: string; feature: string; direction: string; schema: string; samplePayload: string;
  declared: boolean; tx: number; rx: number; sensitive: boolean;
}
export interface Iap2InspectorSnapshot {
  connected: boolean; tracing: boolean; catalog: Iap2Capability[]; subscriptions: i32[];
}
export interface UltraStatus {
  phoneOffersVehicleState: boolean; phoneOffersUiSync: boolean;
  vehicleStateEnabled: boolean; uiSyncEnabled: boolean;
}
export interface UltraVehicleSnapshot { rpm: i32; fuelPct: i32; climateOn: boolean; targetCelsius: number; }
export interface UltraUiChoice { command: number; layoutId?: string; paletteId?: string; preference?: i32; }
export interface PairedDevice { id: string; bluetooth: boolean; airPlay: boolean; }
export interface PairingsSnapshot { devices: PairedDevice[]; bluetoothAvailable: boolean; }
export interface ServerLiveSnapshot {
  deviceName: string; wireless: boolean; sessionActive: boolean; phoneName?: string | null;
  phoneModel?: string | null; batteryPercent?: i32 | null;
  iap2Connected: boolean; gpsSubscribed: boolean; ultraTheme: boolean;
  clusterEnabled: boolean; autoInvite: boolean; uptimeSeconds: number;
}
interface ControlMessage {
  message?: string; iap2?: Iap2InspectorSnapshot; hud?: HudSnapshot; gps?: DebugGpsSnapshot; clusterEnabled?: boolean; ultra?: UltraStatus; ultraVehicle?: UltraVehicleSnapshot; uiChoice?: UltraUiChoice;
  pairings?: PairingsSnapshot; server?: ServerLiveSnapshot;
  type: string; sessionActive?: boolean; micActive?: boolean; micCodec?: string;
  micRate?: i32; micChannels?: i32; micSamplesPerPacket?: i32; micBitrate?: i32;
}

/** One projected video surface. The backend supplies encoded media, Zinc owns decoding and input. */
export class Session {
  simulateTwoContacts: boolean = false;
  nativeTouchEnabled: boolean = true;
  nativeContactCount: i32 = 0;
  nativeContactPeak: i32 = 0;
  readonly secondary: SecondaryScreen = new SecondaryScreen();
  readonly debugLog: string[] = [];
  private lastDebugMessage: string = '';
  private debugRepeats: i32 = 0;
  hud: HudSnapshot | null = null;
  gps: DebugGpsSnapshot | null = null;
  clusterEnabled: boolean = false;
  iap2: Iap2InspectorSnapshot | null = null;
  ultra: UltraStatus | null = null;
  ultraVehicle: UltraVehicleSnapshot | null = null;
  uiChoice: UltraUiChoice | null = null;
  pairings: PairingsSnapshot | null = null;
  serverInfo: ServerLiveSnapshot | null = null;
  pairingError: string = '';
  pollServer(): boolean { return this.send('{"type":"serverStatus"}'); }
  pollPairings(): boolean { return this.send('{"type":"pairings"}'); }
  forgetPairing(id: string): boolean { this.pairingError = ''; return this.send(JSON.stringify({ type: 'forgetPairing', deviceId: id })); }
  resumePairing(): boolean { return this.send('{"type":"resumePairing"}'); }
  readonly iap2Log: string[] = [];
  onIap2Trace: ((text: string) => void) | null = null;
  iap2Error: string = '';
  pollIap2(): boolean { return this.send('{"type":"iap2Status"}'); }
  traceIap2(enabled: boolean): boolean { return this.send(JSON.stringify({ type: 'iap2Trace', traceEnabled: enabled })); }
  sendIap2(id: i32, payload: string): boolean { this.iap2Error = ''; return this.send(JSON.stringify({ type: 'iap2Send', messageId: id, payloadHex: payload })); }

  private cover: i32 = -1;
  private coverId: i32 = -1;
  artworkImage(): i32 { return this.hud !== null && !this.hud.stale && this.hud.artworkId === this.coverId ? this.cover : -1; }
  private clearArtwork(): void { if (this.cover >= 0) gfx.destroyImage(this.cover); this.cover = -1; this.coverId = -1; }
  private socket: WebSocket | null = null;
  private decoder: i32 = -1;
  private url: string = '';
  private retry: i32 = -1;
  private retryMs: i32 = 500;
  width: i32 = 0;
  height: i32 = 0;
  frames: i32 = 0;
  status: string = 'disconnected';
  error: string = '';
  private pressed: boolean = false;
  private fingers: Finger[] = [new Finger(), new Finger()];
  private night: boolean = false;
  private audio: Map<i32, AudioTrack> = new Map<i32, AudioTrack>();
  private microphone: MicrophoneUplink = new MicrophoneUplink((bytes: u8[]) => {
    const s = this.socket;
    if (s === null || !s.sendBytes(bytes)) throw new Error('Microphone transport closed');
  }, (text: string) => { this.error = text; });

  connect(url: string): void {
    this.close();
    try {
      const target = new URL(url);
      if ((target.protocol !== 'ws:' && target.protocol !== 'wss:') || target.hostname === '') throw new Error('invalid receiver');
    } catch (e) { this.error = 'Use a valid ws:// or wss:// receiver URL'; return; }
    this.url = url; this.error = ''; this.frames = 0; this.retryMs = 500;
    this.dial();
  }
  private dial(): void {
    this.retry = -1;
    this.status = 'connecting';
    const s = new WebSocket(this.url);
    this.socket = s;
    s.onopen = () => { if (this.socket !== s) return; this.error = ''; this.retryMs = 500; this.status = 'waiting for iPhone'; this.setNightMode(this.night); };
    s.onmessage = (e: MessageEvent) => {
      if (this.socket !== s) return;
      if (e.binary) { this.receive(e.bytes); return; }
      try {
        const message = JSON.parse(e.data) as ControlMessage;
        if ((message.type === 'session' || message.type === 'hello') && message.sessionActive === true) this.setNightMode(this.night);
        if (message.type === 'session' && message.sessionActive !== true) {
          this.ultra = null; this.ultraVehicle = null; this.uiChoice = null;
          this.microphone.stop();
          if (this.hud !== null) this.hud.stale = true;
          this.clearArtwork();
          this.secondary.close();
          this.release();
          for (const id of this.audio.keys()) this.stopAudio(id);
          this.status = 'waiting for iPhone';
        }
        if (message.type === 'iap2Status') {
          if (message.iap2 !== undefined) this.iap2 = message.iap2;
          if (message.message !== undefined) this.iap2Error = message.message;
        }
        if (message.type === 'serverStatus' && message.server !== undefined) this.serverInfo = message.server;
        if (message.type === 'pairings') {
          if (message.pairings !== undefined) this.pairings = message.pairings;
          this.pairingError = message.message ?? '';
        }
        if (message.type === 'ultraStatus' && message.ultra !== undefined) this.ultra = message.ultra;
        if (message.type === 'ultraVehicle' && message.ultraVehicle !== undefined) this.ultraVehicle = message.ultraVehicle;
        if (message.type === 'ultraUiChoice' && message.uiChoice !== undefined) this.uiChoice = message.uiChoice;
        if (message.type === 'iap2Trace' && message.message !== undefined) {
          this.iap2Log.push(message.message.slice(0, 8192));
          if (this.iap2Log.length > 128) this.iap2Log.shift();
          const trace = this.onIap2Trace;
          if (trace !== null) { try { trace(message.message); } catch (e) { this.iap2Error = 'Trace listener failed'; } }
        }
        if (message.type === 'debug') {
          if (message.clusterEnabled !== undefined) this.clusterEnabled = message.clusterEnabled;
          if (message.gps !== undefined) this.gps = message.gps;
          if (message.hud !== undefined) this.hud = message.hud;
          if (message.message !== undefined) {
            const line = message.message.slice(0, 240);
            if (line === this.lastDebugMessage && this.debugLog.length > 0) {
              this.debugRepeats++;
              this.debugLog[this.debugLog.length - 1] = `${line} ×${this.debugRepeats}`;
            } else {
              this.lastDebugMessage = line; this.debugRepeats = 1; this.debugLog.push(line);
              if (this.debugLog.length > 64) this.debugLog.shift();
            }
          }
        }
        if (message.type === 'mic') {
          if (message.micActive === true) this.microphone.start(message.micCodec ?? 'lpcm', message.micRate ?? 16000, message.micChannels ?? 1, message.micSamplesPerPacket ?? 320, message.micBitrate ?? 0);
          else this.microphone.stop();
        }
      } catch (e) { this.error = 'Malformed receiver control message'; }
    };
    s.onerror = e => { if (this.socket === s) this.error = 'Receiver unavailable: check backend, URL and access token'; };
    s.onclose = e => {
      if (this.socket !== s) return;
      this.socket = null;
      this.serverInfo = null; this.pairings = null;
      if (this.iap2 !== null) this.iap2.connected = false;
      this.ultra = null; this.ultraVehicle = null; this.uiChoice = null;
      if (this.hud !== null) this.hud.stale = true;
      this.clearArtwork();
      this.secondary.close();
      this.microphone.stop();
      for (const id of this.audio.keys()) this.stopAudio(id);
      this.release();
      if (e.code === 1008) { this.status = 'receiver refused connection'; this.error = 'Receiver refused access: check the local token'; return; }
      this.status = 'reconnecting';
      this.retry = setTimeout(() => this.dial(), this.retryMs);
      this.retryMs = Math.min(8000, this.retryMs * 2);
    };
  }
  /** PlayPort binary media envelope, bounded before passing it to FFmpeg. */
  receive(b: u8[]): boolean {
    if (b.length < 2 || b.length > 8 * 1024 * 1024) return false;
    if (b[0] === 7) {
      if (b.length > 2 * 1024 * 1024 + 2) return false;
      this.clearArtwork();
      this.coverId = b[1];
      if (b.length > 2) this.cover = gfx.imageFromBytes(b.slice(2));
      return b.length === 2 || this.cover >= 0;
    }
    if (b[0] === 3) {
      if (b.length < 9 || b.length < 9 + b[8] || b[2] < 1 || b[2] > 3) return false;
      const rate = b[3] + b[4] * 256 + b[5] * 65536 + b[6] * 16777216;
      if (rate < 8000 || rate > 96000 || b[7] < 1 || b[7] > 2) return false;
      this.stopAudio(b[1]);
      const a = new AudioTrack(b[7], rate, b[1] === 102); a.codec = b[2];
      if (b[2] !== 3) {
        a.decoder = C.audioOpen(b[2], rate, b[7], b.slice(9 + b[8]));
        if (a.decoder < 0) { a.close(); this.error = C.error(); return false; }
      }
      this.audio.set(b[1], a); return true;
    }
    if (b[0] === 4) {
      const a = this.audio.get(b[1]);
      if (a === undefined || b.length <= 10 || b.length > 65546) return false;
      if (a.codec !== 3) a.output.write(C.audioDecode(a.decoder, b.slice(10)));
      else {
        if ((b.length - 10) % (2 * a.output.channels) !== 0) return false;
        const samples: number[] = [];
        for (let i = 10; i < b.length; i += 2) {
          const v = b[i] + b[i + 1] * 256;
          samples.push((v >= 32768 ? v - 65536 : v) / 32768);
        }
        a.output.write(samples);
      }
      return true;
    }
    if (b[0] === 6) { if (b.length !== 2) return false; this.stopAudio(b[1]); return true; }
    if (b[1] === 111) return this.secondary.receive(b);
    if (b[1] !== 110) return false;
    if (b[0] === 5) {
      if (b.length !== 3 || b[2] > 1) return false;
      if (b[2] === 0) { this.release(); this.status = 'waiting for video'; }
      return true;
    } // main CarPlay stream; cluster has an independent decoder
    if (b[0] === 1) {
      if (b.length < 11 || (b[2] !== 1 && b[2] !== 2)) return false;
      const w = b[3] + b[4] * 256 + b[5] * 65536 + b[6] * 16777216;
      const h = b[7] + b[8] * 256 + b[9] * 65536 + b[10] * 16777216;
      if (w <= 0 || h <= 0 || w > 4096 || h > 4096) return false;
      this.release();
      // Upstream Wire.kt leaves one trailing zero in VIDEO_CONFIG's allocated buffer.
      this.decoder = C.open(b[2], w, h, b.slice(11, b.length - 1));
      if (this.decoder < 0) { this.error = C.error(); return false; }
      this.width = w; this.height = h; this.status = 'waiting for video';
      return true;
    }
    if (b[0] === 2) {
      if (b.length <= 11 || this.decoder < 0) return false;
      if (!C.decode(this.decoder, b.slice(11))) { this.error = C.error(); return false; }
      const image = this.image;
      if (image >= 0) { this.width = gfx.imageWidth(image); this.height = gfx.imageHeight(image); }
      this.frames++; this.status = this.image >= 0 ? 'streaming' : 'waiting for video'; return true;
    }
    return false;
  }
  get image(): i32 { return this.decoder < 0 ? -1 : C.image(this.decoder); }
  send(message: string): boolean {
    const s = this.socket;
    return s !== null && s.readyState === OPEN_STATE && s.send(message);
  }
  /** Full two-slot report. Missing slots are released; ordering cannot swap fingers. */
  touches(contacts: TouchContact[]): boolean {
    if (this.width <= 0 || this.height <= 0 || contacts.length > 2) return false;
    const slots: TouchContact[] = [{ id: 0, x: 0, y: 0, down: false }, { id: 1, x: 0, y: 0, down: false }];
    let mask = 0;
    for (const c of contacts) {
      if ((c.id !== 0 && c.id !== 1) || (mask & (1 << c.id)) !== 0 || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return false;
      mask |= 1 << c.id;
      slots[c.id] = { id: c.id, x: Math.max(0, Math.min(1, c.x / this.width)), y: Math.max(0, Math.min(1, c.y / this.height)), down: c.down };
    }
    return this.send(JSON.stringify({ type: 'touch', contacts: slots }));
  }
  touch(x: number, y: number, down: boolean): boolean { return this.touches([{ id: 0, x: x, y: y, down: down }]); }
  /** Also remembered before connection and reapplied when a phone session starts. */
  setNightMode(night: boolean): boolean {
    this.night = night;
    return this.send(JSON.stringify({ type: 'night', night: night }));
  }
  get nightMode(): boolean { return this.night; }
  /** Arrow keys flick the knob; Enter selects, Escape goes back. */
  key(key: string): boolean {
    if (key === 's' || key === 'S') return this.siri();
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Enter' && key !== 'Escape' && key !== 'Backspace' && key !== 'Home') return false;
    return this.send(JSON.stringify({ type: 'knob', knob: { select: key === 'Enter', home: key === 'Home', back: key === 'Escape' || key === 'Backspace', x: key === 'ArrowLeft' ? -127 : key === 'ArrowRight' ? 127 : 0, y: key === 'ArrowUp' ? -127 : key === 'ArrowDown' ? 127 : 0, wheel: 0 } }));
  }
  home(): boolean { return this.send('{"type":"knob","knob":{"select":false,"home":true,"back":false,"x":0,"y":0,"wheel":0}}'); }
  showCluster(): boolean { return this.send('{"type":"cluster"}'); }
  setUltraGauge(iid: i32, value: i32): boolean {
    return this.ultra !== null && this.ultra.vehicleStateEnabled && this.send(JSON.stringify({ type: 'ultraGauge', gaugeId: iid, gaugeValue: value }));
  }
  setUltraClimate(on: boolean, targetCelsius: number): boolean {
    if (this.ultra === null || !this.ultra.vehicleStateEnabled || !Number.isFinite(targetCelsius) || targetCelsius < 16 || targetCelsius > 30) return false;
    return this.send(JSON.stringify({ type: 'ultraGauge', gaugeId: 514, gaugeBool: on })) &&
      this.send(JSON.stringify({ type: 'ultraGauge', gaugeId: 520, gaugeNumber: targetCelsius }));
  }
  debugGps(latitude: number, longitude: number, speed: number = 0, course: number = 0): boolean {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isFinite(speed) || speed < 0 || !Number.isFinite(course) || course < 0 || course >= 360) return false;
    return this.send(JSON.stringify({ type: 'debugGps', lat: latitude, lon: longitude, speed: speed, course: course, gpsEnabled: true }));
  }
  stopDebugGps(): boolean { return this.send('{"type":"debugGps","gpsEnabled":false}'); }
  loadGpx(text: string): boolean { return text.length <= 1048576 && this.send(JSON.stringify({ type: 'debugGpx', gpx: text })); }
  pollDebug(): boolean { return this.send('{"type":"debugGpsStatus"}'); }
  playGps(playing: boolean): boolean { return this.send(JSON.stringify({ type: 'debugGpsPlay', playing: playing })); }
  seekGps(seconds: number): boolean { return Number.isFinite(seconds) && seconds >= 0 && this.send(JSON.stringify({ type: 'debugGpsSeek', seekSeconds: seconds })); }
  siri(): boolean { return this.send('{"type":"siri"}'); }
  setNativeTouchEnabled(enabled: boolean): void {
    if (this.nativeTouchEnabled === enabled) return;
    this.touches([]);
    for (const finger of this.fingers) { finger.assigned = false; finger.down = false; }
    this.pressed = false;
    this.nativeTouchEnabled = enabled;
  }
  view(x: number, y: number, w: number, h: number): void {
    this.nativeContactCount = gfx.touchCount();
    this.nativeContactPeak = Math.max(this.nativeContactPeak, this.nativeContactCount);
    if (this.image < 0 || this.width <= 0 || this.height <= 0 || w <= 0 || h <= 0) return;
    const scale = Math.min(w / this.width, h / this.height);
    const dw = this.width * scale, dh = this.height * scale;
    const ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
    gfx.drawImage(this.image, ox, oy, dw, dh, 255, 0);
    const count = this.nativeTouchEnabled ? gfx.touchCount() : 0;
    if (count > 0 || this.fingers[0].assigned || this.fingers[1].assigned) {
      const contacts: TouchContact[] = [];
      for (let slot = 0; slot < 2; slot++) {
        const f = this.fingers[slot];
        f.down = false;
        if (f.assigned) for (let i = 0; i < count; i++) if (gfx.touchId(i) === f.source) {
          f.x = (gfx.touchX(i) - ox) / scale; f.y = (gfx.touchY(i) - oy) / scale; f.down = true;
        }
      }
      for (let i = 0; i < count; i++) {
        const id = gfx.touchId(i), tx = gfx.touchX(i), ty = gfx.touchY(i);
        if ((this.fingers[0].assigned && this.fingers[0].source === id) || (this.fingers[1].assigned && this.fingers[1].source === id) || tx < ox || ty < oy || tx >= ox + dw || ty >= oy + dh) continue;
        for (const f of this.fingers) if (!f.assigned) {
          f.source = id; f.assigned = true; f.x = (tx - ox) / scale; f.y = (ty - oy) / scale; f.down = true; break;
        }
      }
      for (let slot = 0; slot < 2; slot++) {
        const f = this.fingers[slot];
        contacts.push({ id: slot, x: f.x, y: f.y, down: f.down });
      }
      this.touches(contacts);
      for (const f of this.fingers) if (!f.down) f.assigned = false;
      this.pressed = false;
      return;
    }
    const px = gfx.pointerX(), py = gfx.pointerY(), down = gfx.pointerDown();
    const inside = px >= ox && py >= oy && px < ox + dw && py < oy + dh;
    if (this.simulateTwoContacts && ((down && inside) || (!down && this.pressed))) {
      const tx = (px - ox) / scale, ty = (py - oy) / scale;
      this.touches([{ id: 0, x: tx, y: ty, down: down }, { id: 1, x: this.width - tx, y: this.height - ty, down: down }]);
      this.pressed = down; return;
    }
    if (down && inside) { this.touch((px - ox) / scale, (py - oy) / scale, true); this.pressed = true; }
    if (!down && this.pressed) { this.touch((px - ox) / scale, (py - oy) / scale, false); this.pressed = false; }
  }
  private stopAudio(id: i32): void {
    const a = this.audio.get(id);
    if (a !== undefined) { a.close(); this.audio.delete(id); }
  }
  private release(): void {
    if (this.decoder >= 0) C.close(this.decoder);
    this.decoder = -1; this.width = 0; this.height = 0; this.pressed = false;
    for (const f of this.fingers) { f.assigned = false; f.down = false; }
  }
  close(): void {
    this.serverInfo = null; this.pairings = null;
    if (this.iap2 !== null) this.iap2.connected = false;
    this.ultra = null; this.ultraVehicle = null; this.uiChoice = null;
    if (this.hud !== null) this.hud.stale = true;
    this.clearArtwork();
    this.secondary.close();
    this.microphone.stop();
    this.url = '';
    if (this.retry >= 0) { clearTimeout(this.retry); this.retry = -1; }
    const s = this.socket; this.socket = null;
    if (s !== null) { s.onopen = null; s.onmessage = null; s.onerror = null; s.onclose = null; s.close(); }
    for (const id of this.audio.keys()) this.stopAudio(id);
    this.release(); this.status = 'disconnected';
  }
}
