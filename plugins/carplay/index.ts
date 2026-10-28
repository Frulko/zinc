import { WebSocket, MessageEvent, OPEN_STATE } from 'zinc:socket';
import * as gfx from 'zinc:gfx';
import C from './native/carplay.spec';
import { AudioStream, stream } from 'zinc:audio';

class AudioTrack {
  decoder: i32 = -1;
  codec: i32 = 0;
  output: AudioStream;
  constructor(channels: i32, rate: i32) { this.output = stream(channels, rate); }
  close(): void { this.output.close(); if (this.decoder >= 0) C.close(this.decoder); }
}

/** Coordinates in the projected screen's pixels; id is a stable slot (0 or 1). */
export interface TouchContact { id: i32; x: number; y: number; down: boolean }
class Finger {
  source: i32 = -1;
  x: number = 0;
  y: number = 0;
  down: boolean = false;
}

interface ControlMessage { type: string; sessionActive?: boolean; micActive?: boolean }

/** One projected video surface. The backend supplies encoded media, Zinc owns decoding and input. */
export class Session {
  private socket: WebSocket | null = null;
  private decoder: i32 = -1;
  width: i32 = 0;
  height: i32 = 0;
  frames: i32 = 0;
  status: string = 'disconnected';
  error: string = '';
  private pressed: boolean = false;
  private fingers: Finger[] = [new Finger(), new Finger()];
  private night: boolean = false;
  private audio: Map<i32, AudioTrack> = new Map<i32, AudioTrack>();

  connect(url: string): void {
    this.close();
    this.status = 'connecting';
    const s = new WebSocket(url);
    this.socket = s;
    s.onopen = () => { this.status = 'waiting for iPhone'; this.setNightMode(this.night); };
    s.onmessage = (e: MessageEvent) => {
      if (e.binary) { this.receive(e.bytes); return; }
      try {
        const message = JSON.parse(e.data) as ControlMessage;
        if ((message.type === 'session' || message.type === 'hello') && message.sessionActive === true) this.setNightMode(this.night);
        if (message.type === 'session' && message.sessionActive === false) {
          this.release();
          for (const id of this.audio.keys()) this.stopAudio(id);
          this.status = 'waiting for iPhone';
        }
        if (message.type === 'mic' && message.micActive === true) this.error = 'Microphone uplink is not implemented yet';
      } catch (e) { this.error = 'Malformed receiver control message'; }
    };
    s.onerror = e => { this.error = e.message; };
    s.onclose = () => { this.status = 'disconnected'; for (const id of this.audio.keys()) this.stopAudio(id); this.release(); };
  }
  /** PlayPort binary media envelope, bounded before passing it to FFmpeg. */
  receive(b: u8[]): boolean {
    if (b.length < 2 || b.length > 8 * 1024 * 1024) return false;
    if (b[0] === 3) {
      if (b.length < 9 || b.length < 9 + b[8] || b[2] < 1 || b[2] > 3) return false;
      const rate = b[3] + b[4] * 256 + b[5] * 65536 + b[6] * 16777216;
      if (rate < 8000 || rate > 96000 || b[7] < 1 || b[7] > 2) return false;
      this.stopAudio(b[1]);
      const a = new AudioTrack(b[7], rate); a.codec = b[2];
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
      this.decoder = C.open(b[2], b.slice(11, b.length - 1));
      if (this.decoder < 0) { this.error = C.error(); return false; }
      this.width = w; this.height = h; this.status = 'waiting for video';
      return true;
    }
    if (b[0] === 2) {
      if (b.length <= 11 || this.decoder < 0) return false;
      if (!C.decode(this.decoder, b.slice(11))) { this.error = C.error(); return false; }
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
  home(): boolean { return this.send('{"type":"knob","knob":{"select":false,"home":true,"back":false,"x":0,"y":0,"wheel":0}}'); }
  siri(): boolean { return this.send('{"type":"siri"}'); }
  view(x: number, y: number, w: number, h: number): void {
    if (this.image < 0 || this.width <= 0 || this.height <= 0 || w <= 0 || h <= 0) return;
    const scale = Math.min(w / this.width, h / this.height);
    const dw = this.width * scale, dh = this.height * scale;
    const ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
    gfx.drawImage(this.image, ox, oy, dw, dh, 255, 0);
    const count = gfx.touchCount();
    if (count > 0 || this.fingers[0].source >= 0 || this.fingers[1].source >= 0) {
      const contacts: TouchContact[] = [];
      for (let slot = 0; slot < 2; slot++) {
        const f = this.fingers[slot];
        f.down = false;
        if (f.source >= 0) for (let i = 0; i < count; i++) if (gfx.touchId(i) === f.source) {
          f.x = (gfx.touchX(i) - ox) / scale; f.y = (gfx.touchY(i) - oy) / scale; f.down = true;
        }
      }
      for (let i = 0; i < count; i++) {
        const id = gfx.touchId(i), tx = gfx.touchX(i), ty = gfx.touchY(i);
        if (this.fingers[0].source === id || this.fingers[1].source === id || tx < ox || ty < oy || tx >= ox + dw || ty >= oy + dh) continue;
        for (const f of this.fingers) if (f.source < 0) {
          f.source = id; f.x = (tx - ox) / scale; f.y = (ty - oy) / scale; f.down = true; break;
        }
      }
      for (let slot = 0; slot < 2; slot++) {
        const f = this.fingers[slot];
        contacts.push({ id: slot, x: f.x, y: f.y, down: f.down });
      }
      this.touches(contacts);
      for (const f of this.fingers) if (!f.down) f.source = -1;
      this.pressed = false;
      return;
    }
    const px = gfx.pointerX(), py = gfx.pointerY(), down = gfx.pointerDown();
    const inside = px >= ox && py >= oy && px < ox + dw && py < oy + dh;
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
    for (const f of this.fingers) { f.source = -1; f.down = false; }
  }
  close(): void {
    const s = this.socket; this.socket = null;
    if (s !== null) { s.onclose = null; s.close(); }
    for (const id of this.audio.keys()) this.stopAudio(id);
    this.release(); this.status = 'disconnected';
  }
}
