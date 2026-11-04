import { PixelGame } from '../game';
import { sound, setAmbience } from '../audio';
import { readBest, saveBest } from '../scores';
import { bakeScene } from './scenery';
import { drawLaunch, stepEffects, resetEffects } from './render';
import { rocket, startCount, resetRocket, pressFire, advanceRocket, MISSES } from './state';

export class RocketGame extends PixelGame {
  private lastPhase: string = '';
  private lastCount: number = -1;
  private lastMisses: number = 0;
  constructor() {
    super('rocket', 'OBJECTIF LUNE', 'Entrée : compte à rebours · Espace ou clic : allumer quand l’aiguille est dans le vert · S : jour / nuit · R : recommencer');
    this.seasonNames = ['JOUR', 'NUIT'];
    this.selectedSeason = 0;
    this.cropX = 15; this.cropY = 28; this.cropWidth = 330; this.cropHeight = 226;
  }
  override init(): void {
    bakeScene(this.selectedSeason === 1);
    rocket.best = readBest('rocket');
    resetRocket(); resetEffects();
    this.lastPhase = ''; this.lastCount = -1; this.lastMisses = 0;
    setAmbience('pit');
  }
  override season(index: i32): void {
    this.selectedSeason = index < 0 ? (this.selectedSeason + 1) % 2 : Math.min(1, index) as i32;
    bakeScene(this.selectedSeason === 1);
    sound('chime', .5);
  }
  override reset(): void { startCount(); resetEffects(); }
  override update(dt: number): void {
    advanceRocket(dt);
    stepEffects(dt);
    if (rocket.phase !== this.lastPhase) this.enter(rocket.phase);
    this.lastPhase = rocket.phase;
    if (rocket.phase === 'count' && rocket.count !== this.lastCount) { this.lastCount = rocket.count; sound('beep', .5); }
    if (rocket.misses !== this.lastMisses) {
      this.lastMisses = rocket.misses;
      if (rocket.misses > 0) { sound('screech', .7); sound('thud', .8); }
    }
    this.words();
  }
  private enter(phase: string): void {
    if (phase === 'count') { this.lastCount = -1; this.lastMisses = 0; sound('whoosh', .5); }
    else if (phase === 'window') sound('chime', .9);
    else if (phase === 'ignition') { sound('rumble', 1); if (rocket.newBest) saveBest('rocket', rocket.best); }
    else if (phase === 'flight') sound('roar', .9);
    else if (phase === 'over') sound(!rocket.launched ? 'thud' : rocket.newBest ? 'point' : 'chime', .8);
  }
  private words(): void {
    const best = rocket.best > 0 ? ' · MEILLEURE SYNCHRO ' + rocket.best + ' %' : '';
    const ph = rocket.phase;
    this.actionLabel = ph === 'ready' ? 'COMPTE À REBOURS [ENTRÉE]' : ph === 'over' ? 'NOUVEAU TIR [ENTRÉE]' : '';
    if (ph === 'ready') {
      this.score = 'La fusée est sur son pas de tir' + best;
      this.status = 'Lancez le compte à rebours, puis Espace quand l’aiguille est dans la zone verte.';
    } else if (ph === 'count') {
      this.score = 'COMPTE À REBOURS · T-' + rocket.count + best;
      this.status = 'Patience : la fenêtre de tir s’ouvre à zéro.';
    } else if (ph === 'window') {
      this.score = 'FENÊTRE DE TIR · ' + (rocket.misses > 0 ? 'ÉCHECS ' + rocket.misses + '/' + MISSES : 'ALLUMAGE PRÊT') + best;
      this.status = rocket.time - rocket.flash < 1.6 ? 'Raté' + (rocket.message === 'close' ? ' de peu' : '') + ' : les moteurs toussent. Encore !' : 'ESPACE quand l’aiguille est dans la zone verte !';
    } else if (ph === 'ignition') {
      this.score = 'ALLUMAGE · SYNCHRO ' + rocket.sync + ' %' + best;
      this.status = 'Les moteurs montent en puissance…';
    } else if (ph === 'flight' || ph === 'gone') {
      this.score = 'ALTITUDE ' + Math.round(rocket.z * 14) + ' m · SYNCHRO ' + rocket.sync + ' %';
      this.status = 'Décollage ! Objectif Lune !';
    } else if (rocket.launched) {
      this.score = 'SYNCHRO ' + rocket.sync + ' %' + best;
      this.status = rocket.newBest ? 'Nouveau record de synchro !' : rocket.sync >= 90 ? 'Tonnerre de Brest, quelle synchro ! Encore un tir ?' : 'Tir réussi. Visez le centre du vert pour faire mieux.';
    } else {
      this.score = 'TIR ANNULÉ' + best;
      this.status = 'Fenêtre de tir manquée : la fusée reste au sol. Encore un essai ?';
    }
  }
  override draw(): void { drawLaunch(); }
  private fire(): void { pressFire(); }
  override pointer(x: number, y: number, phase: i32): void { if (phase === 0) this.fire(); }
  override key(name: string, down: boolean): void {
    if (!down) return;
    if (name === 'Enter' && (rocket.phase === 'ready' || rocket.phase === 'over')) this.reset();
    else if (name === ' ') {
      if (rocket.phase === 'window') this.fire();
      else if (rocket.phase === 'ready' || rocket.phase === 'over') this.reset();
    }
  }
}
