import C from './native/carplay.spec';
import M from '../microphone/native/microphone.spec';
import * as sys from 'zinc:sys';

/** Reuses Zinc's native capture and permissions; owns every handle and timer it starts. */
export class MicrophoneUplink {
  private encoder: i32 = -1;
  private capture: i32 = -1;
  private timer: i32 = -1;
  private pending: number[] = [];
  constructor(private send: (bytes: u8[]) => void, private onError: (text: string) => void) {}

  start(codec: string, rate: i32, channels: i32, samplesPerPacket: i32, bitrate: i32): void {
    this.stop();
    if (codec !== 'lpcm' && codec !== 'opus') { this.onError('Unsupported microphone codec'); return; }
    this.encoder = C.micOpen(codec === 'opus' ? 1 : 0, rate, channels, samplesPerPacket, bitrate);
    if (this.encoder < 0) { this.onError(C.error()); return; }
    const permission = M.permission(true);
    if (permission === 1) { this.begin(rate, channels, samplesPerPacket); return; }
    if (permission !== 0) { this.fail(M.error() || 'Microphone permission denied or unavailable in background'); return; }
    let tries: i32 = 0;
    this.timer = setInterval(() => {
      const status = M.permission(false);
      if (status === 0 && ++tries < 600) return;
      clearInterval(this.timer); this.timer = -1;
      if (status === 1) this.begin(rate, channels, samplesPerPacket);
      else this.fail('Microphone permission denied or timed out');
    }, 100);
  }
  private begin(rate: i32, channels: i32, samplesPerPacket: i32): void {
    const devices = M.devices();
    if (devices === '') { this.fail(M.error() || 'No microphone is available'); return; }
    const id = devices.split('\u001f')[0];
    if (id === 'zinc:fake-microphone' && sys.env('ZINC_FAKE_MICROPHONE') !== '1') {
      this.fail('No real microphone is available'); return;
    }
    this.capture = M.open(id, rate, channels);
    if (this.capture < 0) { this.fail(M.error()); return; }
    const count = samplesPerPacket * channels;
    this.timer = setInterval(() => {
      this.pending = this.pending.concat(M.read(this.capture));
      while (this.pending.length >= count) {
        const bytes = C.micEncode(this.encoder, this.pending.slice(0, count));
        this.pending = this.pending.slice(count);
        if (bytes.length === 0) { this.fail(C.error()); return; }
        try { this.send(bytes); }
        catch (e) { this.fail('Microphone transport send failed'); return; }
        if (this.capture < 0) return;
      }
    }, 20);
  }
  private fail(message: string): void { this.stop(); this.onError(message); }
  stop(): void {
    if (this.timer >= 0) clearInterval(this.timer);
    if (this.capture >= 0) M.close(this.capture);
    if (this.encoder >= 0) C.micClose(this.encoder);
    this.timer = -1; this.capture = -1; this.encoder = -1; this.pending = [];
  }
}
