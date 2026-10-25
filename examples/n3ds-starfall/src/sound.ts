// The sounds, on the world's events: three of Kenney's Digital Audio effects (assets/kenney). Without an audio output zinc:audio plays nothing.
import { load } from 'zinc:audio';

const bounce = load('kenney/phaseJump2.ogg'), caught = load('kenney/highUp.ogg'), lost = load('kenney/lowDown.ogg');
bounce.volume = 0.5;

export function playSounds(events: string[]): void {
  for (const e of events) {
    if (e === 'bounce') bounce.play();
    else if (e === 'caught' || e === 'level') caught.play();
    else if (e === 'lost' || e === 'meteor') lost.play();
  }
}
