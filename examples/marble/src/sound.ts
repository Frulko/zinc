// The sounds: a rolling loop whose pitch and level follow the ball's speed (assets/roll.wav), and Kenney's gem chime, fall,
// goal and game-over jingles (assets/kenney). Without an audio output zinc:audio plays nothing and every call still works.
import { load, Voice } from 'zinc:audio';
import { Course, Phase } from './course';

const gem = load('kenney/digital-audio/powerUp2.ogg'), fall = load('kenney/digital-audio/phaserDown2.ogg');
const goal = load('kenney/music-jingles/jingles_NES12.ogg'), over = load('kenney/music-jingles/jingles_NES07.ogg');
const roll = load('roll.wav');
gem.volume = 0.6;
let rolling: Voice | null = null;

export function playSounds(events: string[]): void {
  for (const e of events) {
    if (e === 'gem') gem.play();
    else if (e === 'fall') fall.play();
    else if (e === 'goal') goal.play();
    else if (e === 'over' || e === 'timeout') over.play();
  }
}

/** Once a frame: the rolling sound, silent in the air and when the game is not on. */
export function rollSound(course: Course): void {
  const b = course.ball;
  const on = course.phase === Phase.Play && b.onGround;
  const speed = b.speed();
  if (rolling === null) rolling = roll.voice(0, 0.5, 0, true);   // started away from rate 1: it follows the rate set later
  rolling.set(on ? Math.min(0.8, speed * 0.15) : 0, 0.6 + Math.min(1.4, speed * 0.12), 0);
}
