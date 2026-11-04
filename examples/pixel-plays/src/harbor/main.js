import { view, toCanvas } from '../view.js';
import { unproject, COS, S } from '../renderer.js';
import { bakeHarbor } from './scenery.js';
import { drawHarbor } from './life.js';
import { game, DECK_HEIGHT, advanceGame, startRound, setAim, throwParcel, togglePause } from './state.js';
import { presentHarbor, toolbarActionAt } from './view.js';
import { interactWithAnimal, animalReaction } from './animals.js';
import { unlockAudio, playSound } from './audio.js';

bakeHarbor();
view.focus();
let pointer = null;

function launch() {
  if (throwParcel()) playSound('throw');
}
function aimAt(point) {
  const target = unproject(point.x, point.y + DECK_HEIGHT * COS * S);
  setAim(target.x, target.y);
}
function inScene(point) {
  return point.x >= 0 && point.x < 360 && point.y >= 0 && point.y < 280;
}
function reset() {
  pointer = null;
  startRound();
}

view.addEventListener('keydown', event => {
  unlockAudio();
  const key = event.key.toLowerCase();
  if (key === 'p' || key === 'escape') { pointer = null; togglePause(); return; }
  if (key === 'm') { game.muted = !game.muted; game.revision++; return; }
  if (game.paused) return;
  if (key === 'r' || key === 'enter' && (game.phase === 'ready' || game.phase === 'over')) {
    reset();
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    if (game.phase === 'ready' || game.phase === 'over') reset();
    else if (!event.repeat) launch();
    return;
  }
  if (game.phase !== 'aim') return;
  const step = .3;
  if (event.key === 'ArrowRight') setAim(game.aim.x + step, game.aim.y - step);
  else if (event.key === 'ArrowLeft') setAim(game.aim.x - step, game.aim.y + step);
  else if (event.key === 'ArrowUp') setAim(game.aim.x - step, game.aim.y - step);
  else if (event.key === 'ArrowDown') setAim(game.aim.x + step, game.aim.y + step);
  else return;
  event.preventDefault();
});

view.addEventListener('pointerdown', event => {
  view.focus();
  unlockAudio();
  const action = toolbarActionAt(event.clientX, event.clientY);
  if (action === 'sound') { game.muted = !game.muted; game.revision++; return; }
  if (action === 'pause') { pointer = null; togglePause(); return; }
  if (action === 'start') { reset(); return; }
  if (game.paused || pointer !== null) return;
  const point = toCanvas(event);
  if (!inScene(point)) return;
  const animal = interactWithAnimal(point);
  if (animal) {
    game.discovery = { name: animal, until: game.time + 2.5 };
    playSound(animal);
    return;
  }
  if (game.phase !== 'aim') return;
  pointer = event.pointerId;
  view.setPointerCapture(pointer);
  game.aiming = true;
  aimAt(point);
});
view.addEventListener('pointermove', event => {
  if (pointer !== event.pointerId || game.paused) return;
  aimAt(toCanvas(event));
});
view.addEventListener('pointerup', event => {
  if (pointer !== event.pointerId) return;
  pointer = null;
  game.aiming = false;
  if (game.paused) return;
  aimAt(toCanvas(event));
  launch();
});
view.addEventListener('pointercancel', () => {
  pointer = null;
  game.aiming = false;
  game.revision++;
});

let last = performance.now(), lastPose = -1, lastPresentation = '', lastOutcome = null, lastPhase = '';
function frame(now) {
  advanceGame((now - last) / 1000);
  last = now;
  if (game.outcome !== lastOutcome && game.outcome) {
    playSound(game.outcome.kind);
    if (game.outcome.kind === 'splash') {
      animalReaction.gullUntil = game.time + 3;
      animalReaction.fishUntil = game.time + 1.1;
    } else if (game.outcome.kind === 'delivered') {
      animalReaction.catUntil = game.time + 1;
    }
  }
  if (game.phase === 'over' && lastPhase !== 'over') playSound('over');
  lastOutcome = game.outcome;
  lastPhase = game.phase;
  const pose = Math.floor(game.time * 24);
  const presentation = game.paused + ':' + innerWidth + ':' + innerHeight + ':' + game.revision;
  if (pose !== lastPose || presentation !== lastPresentation) {
    drawHarbor();
    presentHarbor();
    lastPose = pose;
    lastPresentation = presentation;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
console.log('last-boat: 5 parcels / 45 seconds; drag to aim and release; Enter start, arrows/Space, P pause, M sound');
