// Pure, bounded geometry and input contracts for the Extended family.
export function clampExtended(value: number, min: number = 0, max: number = 1): number { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }
export function fileRejection(path: string, accept: string, size: number, maxBytes: number, isFile: boolean): string {
  if (!isFile) return 'Choose a file, not a directory';
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) return 'File exceeds the size limit';
  const extensions = accept.toLowerCase().split(';').map((s: string) => s.trim().replace('.', '')).filter((s: string) => s.length > 0);
  const name = path.toLowerCase(), dot = name.lastIndexOf('.');
  if (extensions.length > 0 && extensions.indexOf(name.slice(dot + 1)) < 0) return 'File type is not accepted';
  return '';
}
export interface SignaturePoint { x: number; y: number; width: number }
export interface SignatureStroke { points: SignaturePoint[] }
export enum SignaturePhase { Idle, Drawing, Disposed }
export class SignatureSession {
  state: SignaturePhase = SignaturePhase.Idle;
  strokes: SignatureStroke[] = []; lastTime: number = 0; count: i32 = 0;
  transition(next: SignaturePhase): boolean {
    if (this.state === SignaturePhase.Disposed || next === SignaturePhase.Drawing && this.state !== SignaturePhase.Idle) return false;
    this.state = next; return true;
  }
  begin(value: SignatureStroke[], x: number, y: number, at: number): boolean {
    if (!this.transition(SignaturePhase.Drawing)) return false;
    this.strokes = []; this.count = 0;
    for (const stroke of value.slice(0, 256)) {
      const points = stroke.points.slice(0, 8192 - this.count);
      this.strokes.push({ points: points }); this.count += points.length;
      if (this.count >= 8192) break;
    }
    if (this.count >= 8192 || this.strokes.length >= 256) { this.transition(SignaturePhase.Idle); return false; }
    this.strokes.push({ points: [{ x: clampExtended(x), y: clampExtended(y), width: 2.5 }] }); this.count++; this.lastTime = at; return true;
  }
  append(x: number, y: number, at: number): boolean {
    if (this.state !== SignaturePhase.Drawing || this.count >= 8192) return false;
    const stroke = this.strokes[this.strokes.length - 1], points = stroke.points, last = points[points.length - 1];
    const px = clampExtended(x), py = clampExtended(y), distance = Math.hypot(px - last.x, py - last.y);
    if (distance < 0.0005) return false;
    const speed = distance / Math.max(1, at - this.lastTime);
    // Append a new array: previous callback values remain caller-owned snapshots.
    this.strokes = this.strokes.slice();
    this.strokes[this.strokes.length - 1] = { points: points.concat([{ x: px, y: py, width: clampExtended(2.8 - speed * 700, 1, 2.8) }]) };
    this.count++; this.lastTime = at; return true;
  }
  end(): void { if (this.state === SignaturePhase.Drawing) this.transition(SignaturePhase.Idle); }
  dispose(): void { this.transition(SignaturePhase.Disposed); this.strokes = []; }
}
export function counterText(value: number, decimals: i32 = 0, grouping: boolean = true): string {
  const fixed = (Number.isFinite(value) ? value : 0).toFixed(clampExtended(decimals, 0, 6));
  if (!grouping || fixed.indexOf('e') >= 0) return fixed;
  const parts = fixed.split('.'), sign = parts[0].startsWith('-') ? '-' : '', digits = parts[0].slice(sign.length);
  let result = ''; for (let i = 0; i < digits.length; i++) { if (i > 0 && (digits.length - i) % 3 === 0) result += ','; result += digits[i]; }
  return sign + result + (parts.length > 1 ? '.' + parts[1] : '');
}
export function waveformPeaks(peaks: number[], columns: i32): number[] {
  const count = Math.floor(clampExtended(columns, 0, 512)), length = Math.min(peaks.length, 65536), result: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * length / count), end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * length / count)));
    let peak = 0; for (let j = start; j < end; j++) peak = Math.max(peak, clampExtended(Math.abs(peaks[j])));
    result.push(peak);
  }
  return result;
}
export function mediaTime(seconds: number): string {
  const value = Math.floor(clampExtended(seconds, 0, 359999)), s = value % 60;
  return Math.floor(value / 60) + ':' + (s < 10 ? '0' : '') + s;
}
export function seekKey(key: string, value: number, step: number = 0.01): number {
  if (key === 'Home') return 0; if (key === 'End') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampExtended(value - step);
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampExtended(value + step);
  if (key === 'PageDown') return clampExtended(value - step * 10);
  if (key === 'PageUp') return clampExtended(value + step * 10);
  return clampExtended(value);
}
