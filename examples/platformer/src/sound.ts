// The sounds, played on the world's events: four effects and two jingles from Kenney's audio packs (assets/kenney) and a
// music loop. Without an audio output (a headless run) zinc:audio plays nothing and every call still works.
import { load } from 'zinc:audio';
import { Phase } from './world';

const jump = load('kenney/digital-audio/phaseJump2.ogg'), coin = load('kenney/digital-audio/highUp.ogg');
const hurt = load('kenney/digital-audio/lowDown.ogg'), stomp = load('kenney/impact-sounds/impactSoft_heavy_000.ogg');
const goal = load('kenney/music-jingles/jingles_NES12.ogg'), over = load('kenney/music-jingles/jingles_NES07.ogg');
const music = load('music.wav');
music.loop = true;
music.volume = 0.5;
coin.volume = 0.6;
let playing = false;

export function playSounds(events: string[], phase: Phase): void {
  for (const e of events) {
    if (e === 'jump') jump.play();
    else if (e === 'coin') coin.play();
    else if (e === 'stomp') stomp.play();
    else if (e === 'hurt' || e === 'fall') hurt.play();
    else if (e === 'goal') goal.play();
    else if (e === 'over') over.play();
  }
  const want = phase === Phase.Play;   // the music plays during the game: a pause or the end stops it
  if (want && !playing) music.play();
  else if (!want && playing) music.stop();
  playing = want;
}
