import { game } from './state.js';
let audio = null;

export function unlockAudio() {
  if (!audio && typeof AudioContext === 'function') audio = new AudioContext();
  if (audio && audio.state === 'suspended') audio.resume();
}

function note(frequency, at, duration, volume, type = 'sine') {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + .02);
}

export function playSound(kind) {
  if (!audio || game.muted) return;
  const now = audio.currentTime;
  if (kind === 'delivered') {
    note(523, now, .15, .07, 'triangle');
    note(659, now + .08, .18, .06, 'triangle');
    note(784, now + .16, .24, .05, 'triangle');
  } else if (kind === 'splash') {
    note(95, now, .32, .09);
    note(240, now + .04, .13, .035);
    note(380, now + .11, .08, .02);
  } else if (kind === 'bump') {
    note(150, now, .15, .065, 'triangle');
  } else if (kind === 'cat') {
    note(330, now, .14, .025, 'triangle');
    note(440, now + .1, .25, .018, 'triangle');
  } else if (kind === 'gull') {
    note(1100, now, .1, .012);
    note(850, now + .09, .15, .012);
  } else if (kind === 'throw') {
    note(200, now, .14, .035, 'triangle');
  } else if (kind === 'over') {
    note(game.delivered >= 3 ? 392 : 220, now, .3, .05, 'triangle');
    note(game.delivered >= 3 ? 523 : 196, now + .18, .4, .04, 'triangle');
  }
}
