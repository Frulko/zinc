import { PixelGame } from '../game';
import { configureRenderer } from '../renderer';
import { sound, setAmbience } from '../audio';
import { readBest, saveBest } from '../scores';
import { bakePit } from './scenery';
import { drawPit, stepEffects } from './render';
import { pit, startRun, resetPit, setBrake, pressGo, advancePit, stageOf, JACK_UP, PERFECT } from './state';

const fixed = (seconds: number): string => seconds.toFixed(2).replace('.', ',') + ' s';

export class PitStopGame extends PixelGame {
  private lastPhase: string = '';
  private lastStages: number[] = [0, 0, 0, 0];
  private lastRoar: number = -1;
  constructor() {
    super('pitstop', 'ARRÊT AU STAND', 'Espace ou clic maintenu : freiner · Relâcher : lâcher la pédale · Vert : Espace pour repartir · R : recommencer');
    this.cropX = 15; this.cropY = 28; this.cropWidth = 330; this.cropHeight = 226;
  }
  override init(): void {
    configureRenderer(14, 1.3, -.12);
    bakePit();
    pit.best = readBest('pitstop') / 1000;
    resetPit();
    this.lastPhase = ''; this.lastStages = [0, 0, 0, 0]; this.lastRoar = -1;
    setAmbience('pit');
  }
  override reset(): void { startRun(); }
  override update(dt: number): void {
    advancePit(dt);
    stepEffects(dt);
    if (pit.phase !== this.lastPhase) this.enter(pit.phase);
    this.lastPhase = pit.phase;
    if (pit.phase === 'service' || pit.phase === 'release') {
      for (let i = 0; i < 4; i++) {
        const stage = stageOf(i, pit.service).stage;
        if (stage !== this.lastStages[i]) {
          if (stage === 1 || stage === 4) sound('gun', .9);
          else if (stage === 2 || stage === 3) sound('wood', .6);
          this.lastStages[i] = stage;
        }
      }
    }
    if (pit.phase === 'approach' && pit.pressure > .5 && pit.speed > 3 && pit.time - this.lastRoar > .5) { sound('screech', .6); this.lastRoar = pit.time; }
    this.words();
  }
  private enter(phase: string): void {
    if (phase === 'approach') { this.lastStages = [0, 0, 0, 0]; sound('whoosh', .8); }
    else if (phase === 'service') { sound('thud', 1); }
    else if (phase === 'release') sound('beep', 1);
    else if (phase === 'launch') sound('roar', .9);
    else if (phase === 'over') {
      if (pit.newBest) saveBest('pitstop', Math.round(pit.best * 1000));
      sound(pit.newBest ? 'point' : 'chime', .8);
    }
  }
  private words(): void {
    const best = pit.best > 0 ? ' · MEILLEUR ' + fixed(pit.best) : '';
    this.actionLabel = pit.phase === 'ready' ? 'LA VOITURE ARRIVE [ENTRÉE]' : pit.phase === 'over' ? 'REVENIR AU STAND [ENTRÉE]' : '';
    if (pit.phase === 'ready') {
      this.score = 'Arrêtez la voiture sur la ligne, puis lancez-la au feu vert' + best;
      this.status = 'Maintenez Espace pour freiner : ralentissez avant la zone, le pilote se cale sur la marque.';
    } else if (pit.phase === 'approach') {
      this.score = 'VITESSE ' + Math.round(pit.speed * 7) + ' km/h' + best;
      this.status = pit.pressure > .1 ? 'Freinez, puis relâchez pour ajuster : visez la marque.' : 'Relâchez la pédale pour ne pas vous arrêter trop tôt.';
    } else if (pit.phase === 'service') {
      const off = Math.abs(pit.offset0);
      this.score = 'ARRÊT ' + fixed(pit.service) + (pit.penalty > 0 ? ' · +' + fixed(pit.penalty) : '') + best;
      this.status = pit.message === 'early' ? 'Trop tôt ! Une seconde de pénalité : attendez le feu vert.' : off <= PERFECT ? 'Pile sur la marque. L’équipe change les quatre roues…' : (pit.offset0 > 0 ? 'Un peu long' : 'Un peu court') + ' (+' + fixed(Math.min(2.5, (off - PERFECT) * .3)) + '). L’équipe change les quatre roues…';
      if (pit.service < JACK_UP) this.status = 'Les crics montent la voiture.';
    } else if (pit.phase === 'release') {
      this.score = 'ARRÊT ' + fixed(pit.service) + (pit.penalty > 0 ? ' · +' + fixed(pit.penalty) : '') + best;
      this.status = 'FEU VERT : Espace ou clic pour repartir !';
    } else if (pit.phase === 'launch') {
      this.score = 'ARRÊT ' + fixed(pit.goAt + pit.penalty) + best;
      this.status = 'Réaction ' + fixed(Math.max(0, pit.reaction)) + '. La voiture repart !';
    } else {
      this.score = 'ARRÊT ' + fixed(pit.result) + best;
      this.status = pit.newBest ? 'Nouveau record du stand !' : 'Réaction ' + fixed(Math.max(0, pit.reaction)) + (pit.penalty > 0 ? ', pénalités ' + fixed(pit.penalty) : ', sans pénalité') + '. Encore ?';
    }
  }
  override draw(): void { drawPit(); }
  override pointer(x: number, y: number, phase: i32): void {
    if (phase === 0) {
      if (pit.phase === 'approach') setBrake(true);
      else if (pit.phase === 'service' || pit.phase === 'release') { if (pressGo()) sound('whoosh', .5); }
    } else if (phase === 2 || phase === 3) setBrake(false);
  }
  override key(name: string, down: boolean): void {
    if (name === 'Enter' && down && (pit.phase === 'ready' || pit.phase === 'over')) { this.reset(); return; }
    if (name === ' ') {
      if (pit.phase === 'approach') setBrake(down);
      else if (down && (pit.phase === 'service' || pit.phase === 'release')) pressGo();
      else if (down && pit.phase === 'over') this.reset();
    }
  }
}
