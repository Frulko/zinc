// midi: the keys A S D F G H J K play the notes C D E F G A B C, as MIDI. The notes leave through a virtual port named 'Zinc keys': open
// GarageBand, Ableton Live, a synthesizer app or any MIDI monitor and it is there among the inputs, no cable. MIDI_OUT="name of a port" sends to
// an instrument instead (the names are printed when the program starts). A MIDI keyboard plugged in lights the same keys on the screen.
import { onFrame, clear, rect, text, width, height, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { inputs, outputs, openInput, openOutput, createOutput, MidiInput, MidiOutput } from 'zinc:midi';

const KEYS = 'asdfghjk';
const NOTES: i32[] = [60, 62, 64, 65, 67, 69, 71, 72];   // C4 to C5, the white keys
const held: boolean[] = NOTES.map((n: i32) => false);
let status = '';

console.log('midi: outputs', JSON.stringify(outputs().filter((n: string) => n !== 'Zinc keys')));
let out: MidiOutput | null = null;
try {
  out = env('MIDI_OUT') !== '' ? openOutput(env('MIDI_OUT')) : createOutput('Zinc keys');
  status = env('MIDI_OUT') !== '' ? `playing on ${env('MIDI_OUT')}` : "playing on the virtual port 'Zinc keys'";
} catch (e) {
  status = (e as Error).message;
}
console.log('midi:', status);

// a keyboard or a controller, when there is one: its notes light the keys
let keyboard: MidiInput | null = null;
const others = inputs().filter((n: string) => n !== 'Zinc keys');
if (others.length > 0) {
  try {
    keyboard = openInput(others[0]);
    keyboard.onNote((note: i32, velocity: i32, channel: i32) => { const i = NOTES.indexOf(note); if (i >= 0) held[i] = velocity > 0; });
  } catch (e) { keyboard = null; }
}

function play(i: i32, down: boolean): void {
  if (held[i] === down) return;
  held[i] = down;
  const o = out;
  if (o === null) return;
  if (down) o.noteOn(NOTES[i]); else o.noteOff(NOTES[i]);
  console.log(down ? 'midi: note on' : 'midi: note off', NOTES[i]);
}

onFrame((dt: number) => {
  for (let k = 0; k < keyCount(); k++) {
    const i = KEYS.indexOf(keyName(k).toLowerCase());
    if (i >= 0 && keyName(k).length === 1 && keyKind(k) !== KeyKind.Repeat && keyKind(k) !== KeyKind.Text) play(i, keyKind(k) === KeyKind.Down);
  }
  clear(0x101820);
  const w = (width() - 16) / NOTES.length, top = 48;
  for (let i = 0; i < NOTES.length; i++) {
    rect(8 + i * w, top, w - 4, height() - top - 8, held[i] ? 0xffb000 : 0xe8e8e8);
    text(8 + i * w + w / 2 - 6, height() - 28, KEYS[i].toUpperCase(), 0x101820, 1);
  }
  text(8, 8, status, 0x8090a0, 1);
  text(8, 20, keyboard === null ? 'press A S D F G H J K' : `A S D F G H J K, or play ${others[0]}`, 0x8090a0, 1);
});
