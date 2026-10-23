import { shaderProgram, drawShader, shaderAvailable, rrect, border, stroke, font, drawText, textWidth } from 'zinc:gfx';
import { Sprite, registerTapZone, registerDragZone } from 'zinc:stage';
import { DURATION, state, spring, smooth } from '../state';
import { FRAGMENT } from '../shader';

const program = shaderProgram(FRAGMENT, 2);
const titleFont = font('sans-bold', 22);
const bodyFont = font('sans', 13);
const buttonFont = font('sans-bold', 13);
const uniforms: number[] = [];
for (let i = 0; i < 32; i++) uniforms.push(0);
const logoPoints: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

export class Reveal extends Sprite {
  grabX: number = 0;
  grabTime: number = 0;
  dragged: boolean = false;
  replay: () => void = (): void => { state.replay(); };
  toggle: () => void = (): void => { state.toggle(); };
  theme: () => void = (): void => { state.theme(); };
  scrub: (x: number, y: number, phase: i32) => void = (x: number, y: number, phase: i32): void => {
    if (phase === 0) {
      this.grabX = x;
      this.grabTime = state.time;
      this.dragged = false;
    } else if (phase === 1) {
      if (Math.abs(x - this.grabX) > 5) this.dragged = true;
      if (this.dragged) state.seek(this.grabTime + (x - this.grabX) * DURATION / Math.max(1, this.width));
    } else if (phase === 2 && !this.dragged) state.replay();
  };
  timeline: (x: number, y: number, phase: i32) => void = (x: number, y: number, phase: i32): void => {
    if (phase !== 3) state.seek((x - 24) / Math.max(1, this.width - 48) * DURATION);
  };

  button(label: string, x: number, y: number, w: number, action: () => void, color: u32): void {
    rrect(x, y, w, 44, 14, color, 255);
    drawText(buttonFont, x + (w - textWidth(buttonFont, label, 0)) / 2, y + 14, label, 0xffffff, 255, 0);
    registerTapZone(label, x, y, w, 44, action);
  }

  override onDraw(w: number, h: number): void {
    // Pointer actions run inside Stage.frame, after the caller chose its clear colour.
    rrect(0, 0, w, h, 0, state.dark ? 0x080a10 : 0xe9e9eb, 255);
    const foreground: u32 = state.dark ? 0xf6f7fb : 0x141a2b;
    const secondary: u32 = state.dark ? 0x9da6ba : 0x606879;
    const centerY = 68 + Math.max(0, h - 232) / 2;
    const side = Math.max(32, Math.min(w - 32, h - 232, 600));
    const left = (w - side) / 2;
    const top = centerY - side / 2;
    drawText(titleFont, 24, 22, 'Glass / Zinc', foreground, 255, 0);
    drawText(bodyFont, 24, 52, 'Glass Icon Reveal / Zanwei Guo', secondary, 255, 0);

    const grow = spring(state.time + 0.01, 0.34);
    const morph = spring(state.time - 0.22, 0.3);
    const zoom = spring(state.time, 0.7);
    const release = spring(state.time - 1.4, 0.5);
    const drop = 1 - smooth(0.05, 1, morph);
    const dark = state.dark ? 1 : 0;
    uniforms[0] = (0.2 + 0.8 * grow) * (1 + 0.12 * spring(state.time - 0.25, 1.5)) * (1 + 0.14 * release);
    uniforms[1] = 2 + 2.8 * morph;
    uniforms[2] = 1 - smooth(0.55, 1, release);
    uniforms[3] = smooth(0, 0.06, state.time) * (1 - smooth(0.45, 1, release));
    uniforms[4] = 0.7 * (1 + 1.6 * (1 - zoom)) * (1 - 0.045 * spring(state.time - 0.4, 1.6)) * (1 - 0.31 * spring(state.time - 1.35, 0.8));
    uniforms[5] = 0.015 * (1 - zoom);
    uniforms[6] = 0.05 * (1 - smooth(0.3, 0.95, grow));
    uniforms[7] = 1 - smooth(0.5, 0.95, grow);
    uniforms[8] = 0.15 * (1 - smooth(0.4, 0.95, grow));
    uniforms[9] = drop;
    uniforms[10] = 1 + 0.8 * drop;
    uniforms[11] = dark * (0.5 + 0.5 * drop);
    uniforms[12] = smooth(0.45, 0.8, grow) * (1 - smooth(0, 0.6, morph));
    uniforms[13] = 1 + 0.9 * Math.max(0, state.time - 0.18);
    uniforms[14] = smooth(0.18, 0.24, state.time) * Math.exp(-Math.max(0, state.time - 0.18) / 0.5);
    uniforms[15] = smooth(1.15, 1.35, state.time);
    uniforms[16] = (0.14 + 0.26 * drop) * uniforms[0];
    uniforms[17] = smooth(0.35, 1, morph);
    uniforms[18] = release;
    uniforms[19] = (0.14 + 0.26 * drop) * (1 - release);
    uniforms[20] = dark;

    if (shaderAvailable()) drawShader(program, left, top, side, side, uniforms);
    else {
      // shortcut: software-only screens show the motion without refraction; the optical effect needs a GPU display.
      const size = side * 0.56 * uniforms[0];
      const x = w / 2 - size / 2;
      const y = centerY - size / 2;
      rrect(x, y, size, size, size * (0.5 - 0.29 * morph), state.dark ? 0x18202f : 0xf4f5f8, Math.round(uniforms[3] * 220) as i32);
      border(x, y, size, size, size * (0.5 - 0.29 * morph), 1, 0xffffff, Math.round(uniforms[3] * 160) as i32);
      const half = side * 0.28 * Math.min(1.4, uniforms[4]);
      logoPoints[0] = w / 2 - half; logoPoints[1] = centerY - half;
      logoPoints[2] = w / 2 + half; logoPoints[3] = centerY - half;
      logoPoints[4] = w / 2 - half; logoPoints[5] = centerY + half;
      logoPoints[6] = w / 2 + half; logoPoints[7] = centerY + half;
      stroke(logoPoints, Math.max(2, half * 0.22), foreground, Math.round(255 * Math.max(uniforms[3], uniforms[15])) as i32, false);
    }
    registerDragZone('reveal', 0, 80, w, Math.max(1, h - 232), this.scrub);
    const hint = shaderAvailable() ? 'Drag to scrub / tap to replay' : 'Software preview (no refraction)';
    drawText(bodyFont, Math.max(16, (w - textWidth(bodyFont, hint, 0)) / 2), h - 142, hint, secondary, 255, 0);
    rrect(24, h - 114, w - 48, 4, 2, secondary, 70);
    rrect(24, h - 114, (w - 48) * state.time / DURATION, 4, 2, 0x6366f1, 255);
    registerDragZone('timeline', 16, h - 132, w - 32, 40, this.timeline);
    const buttonWidth = Math.max(1, (w - 64) / 3);
    this.button('Replay', 24, h - 88, buttonWidth, this.replay, 0x5755d9);
    this.button(state.playing ? 'Pause' : 'Play', 32 + buttonWidth, h - 88, buttonWidth, this.toggle, 0x394258);
    this.button(state.dark ? 'Light' : 'Dark', 40 + buttonWidth * 2, h - 88, buttonWidth, this.theme, 0x394258);
    if (w >= 420) drawText(bodyFont, 24, h - 26, 'SPACE play / R replay / D theme / arrows step', secondary, 255, 0);
  }
}
