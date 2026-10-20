// Sound: zinc:audio makes a tone from a frequency and a length. Eight bars are eight notes of a scale; a press on a
// bar plays its note. (The import line is what "Add Library" writes.)
import * as audio from 'zinc:audio';
import { onFrame, clear, rrect, pointerX, pointerY, pointerDown, width, height } from 'zinc:gfx';

const HZ = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];   // C D E G A, then C D E an octave up
const NAMES = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
const COLORS = [0x5746e0, 0x2563c9, 0x0e7c86, 0x2f8f57, 0xb7791f, 0xcf3a2b, 0xb5357d, 0x5746e0];
const notes = HZ.map((hz: number) => audio.tone(hz, 0.4, 'triangle'));
const glow: number[] = HZ.map((hz: number) => 0);   // how lit each bar is, 1 right after its note
let was = false;

onFrame((dt: number) => {
  const bar = width() / HZ.length;
  if (pointerDown() && !was) {
    const i = Math.max(0, Math.min(HZ.length - 1, Math.floor(pointerX() / bar)));
    notes[i].play();
    glow[i] = 1;
    console.log(`${NAMES[i]}  ${HZ[i]} Hz`);
  }
  was = pointerDown();

  clear(0x1c1b20);
  for (let i = 0; i < HZ.length; i++) {
    glow[i] = Math.max(0, glow[i] - dt * 2);
    const tall = height() * (0.35 + 0.06 * i) + glow[i] * 30;
    rrect(i * bar + 6, height() - tall - 12, bar - 12, tall, 12, COLORS[i], Math.round(150 + 105 * glow[i]));
  }
});
