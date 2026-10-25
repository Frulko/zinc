// Three generated tones (zinc:audio, on every console): a shot, a splat, a round won. Silent when headless.
import { tone } from 'zinc:audio';

const shot = tone(660, 0.05, 'square');
const splat = tone(140, 0.18, 'sawtooth');
const win = tone(880, 0.4, 'triangle');

/** The sounds of what the last step did (World.events: 'fire id', 'hit by id', 'win id'), for the local player's ears. */
export function playEvents(events: string[], me: i32): void {
  for (const e of events) {
    if (e.startsWith('fire ')) { if (parseInt(e.slice(5)) === me) shot.play(); }
    else if (e.startsWith('hit ')) splat.play();
    else if (e.startsWith('win ')) win.play();
  }
}
