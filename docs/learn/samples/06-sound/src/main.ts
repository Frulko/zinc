import { tone } from 'zinc:audio';
import { onFrame, clear, rrect, font, drawText, textWidth, width, height, pointerX, pointerDown, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const HERTZ = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.3];   // how fast the air shakes, per second
const COLORS: u32[] = [0x5746e0, 0x2563c9, 0x0e7c86, 0x2f8f57, 0xb7791f, 0xcf3a2b, 0xb5357d, 0x5746e0];

const notes = HERTZ.map((hz: number) => tone(hz, 0.5, 'triangle'));   // made once, played many times
const glow: number[] = HERTZ.map((hz: number) => 0);                   // 1 just after a note, then fades to 0
const label = font('sans-bold', 22);
let wasDown = false;

function play(i: number): void {
  notes[i].play();
  glow[i] = 1;
  console.log(`play ${NAMES[i]} (${HERTZ[i]} Hz)`);
}

onFrame((dt: number) => {
  const bar = width() / NAMES.length;

  if (pointerDown() && !wasDown) play(Math.min(NAMES.length - 1, Math.floor(pointerX() / bar)));
  wasDown = pointerDown();

  for (let k = 0; k < keyCount(); k++) {   // the keys 1 to 8 play too
    const n = parseInt(keyName(k));
    if (keyKind(k) === KeyKind.Down && n >= 1 && n <= 8) play(n - 1);
  }

  clear(0x1c1b20);
  for (let i = 0; i < NAMES.length; i++) {
    glow[i] = Math.max(0, glow[i] - dt * 2);
    const tall = height() * 0.6 + glow[i] * 40;
    rrect(i * bar + 6, height() - tall - 12, bar - 12, tall, 12, COLORS[i], Math.round(140 + 115 * glow[i]));
    drawText(label, i * bar + (bar - textWidth(label, NAMES[i], 0)) / 2, height() - 50, NAMES[i], 0xffffff, 255, 0);
  }
});
