import { PixelGame } from '../game';
import { configureRenderer, unproject, COS, S } from '../renderer';
import { sound, setAmbience } from '../audio';
import { bakeHarbor } from './scenery';
import { drawHarbor } from './life';
import { game, advanceGame, startRound, setAim, throwParcel, DECK_HEIGHT } from './state';
import { interactWithAnimal, animalReaction } from './animals';

export class HarborGame extends PixelGame {
  private aiming: boolean = false;
  private outcomeAt: number = -1;
  constructor() {
    super('harbor', 'LE DERNIER BATEAU', 'Glisser pour viser, relâcher pour lancer · Flèches / Espace · Cliquez sur les animaux');
    this.cropX = 30; this.cropY = 45; this.cropWidth = 300; this.cropHeight = 210;
  }
  override init(): void {
    configureRenderer(22, 1.3, -.12);
    bakeHarbor();
    game.time = 0; game.elapsed = 0; game.phase = 'ready';
    game.remaining = 5; game.delivered = 0; game.cargo.length = 0; game.projectile = null;
    game.outcome = null; game.discovery = null;
    animalReaction.catUntil = 0; animalReaction.gullUntil = 0; animalReaction.fishUntil = 0;
    this.outcomeAt = -1;
    setAmbience('harbor');
  }
  override reset(): void { this.aiming = false; startRound(); }
  override update(dt: number): void {
    advanceGame(dt);
    const outcome = game.outcome;
    if (outcome !== null && outcome.at !== this.outcomeAt) {
      this.outcomeAt = outcome.at;
      sound(outcome.kind, .8);
      if (outcome.kind === 'splash') { animalReaction.gullUntil = game.time + 3; animalReaction.fishUntil = game.time + 1.1; }
      if (outcome.kind === 'delivered') animalReaction.catUntil = game.time + 1;
    }
    this.actionLabel = game.phase === 'ready' ? 'JOUER [ENTRÉE]' : game.phase === 'over' ? 'REJOUER [ENTRÉE]' : '';
    this.score = game.phase === 'ready' ? '5 colis · 45 secondes avant le départ' : 'LIVRÉS '+game.delivered+'/5 · À LANCER '+game.remaining+' · '+Math.max(0,Math.ceil(45-game.elapsed))+' s';
    this.status = 'Visez là où le pont jaune sera à l’arrivée du colis.';
    if (game.phase === 'flight') this.status = 'Le colis vole… la barque continue d’avancer !';
    if (game.phase === 'feedback') this.status = game.outcome!.kind === 'delivered' ? 'Livré ! Le marin vous remercie.' : 'Plouf ! Visez un peu plus en avant.';
    if (game.phase === 'over') this.status = game.delivered === 5 ? 'Tout le courrier est à bord !' : game.delivered+' colis livrés. Une autre tournée ?';
    if (game.discovery !== null && game.discovery!.until > game.time) {
      const name = game.discovery!.name;
      this.status = name === 'cat' ? 'Mistral surveille les colis.' : name === 'gull' ? 'La mouette inspecte la rivière.' : 'Un poisson bondit hors de l’eau.';
    }
  }
  override draw(): void { drawHarbor(); }
  private aim(x: number, y: number): void {
    const point = unproject(x, y + DECK_HEIGHT * COS * S);
    setAim(point.x, point.y);
  }
  override pointer(x: number, y: number, phase: i32): void {
    if (phase === 0) {
      const animal = interactWithAnimal({ x, y });
      if (animal !== null) {
        game.discovery = { name: animal, until: game.time + 2.5 };
        sound(animal, .5); return;
      }
      if (game.phase !== 'aim') return;
      this.aiming = true; game.aiming = true; this.aim(x, y);
    } else if (phase === 1 && this.aiming) this.aim(x, y);
    else if (phase === 2 && this.aiming) {
      this.aiming = false; game.aiming = false; this.aim(x, y);
      if (throwParcel()) sound('throw', .7);
    } else if (phase === 3) { this.aiming = false; game.aiming = false; }
  }
  override key(name: string, down: boolean): void {
    if (!down) return;
    if (name === 'Enter' && (game.phase === 'ready' || game.phase === 'over')) this.reset();
    else if (name === ' ' && game.phase === 'aim') { if (throwParcel()) sound('throw', .7); }
    else if (name === 'ArrowRight') setAim(game.aim.x + .3, game.aim.y - .3);
    else if (name === 'ArrowLeft') setAim(game.aim.x - .3, game.aim.y + .3);
    else if (name === 'ArrowUp') setAim(game.aim.x - .3, game.aim.y - .3);
    else if (name === 'ArrowDown') setAim(game.aim.x + .3, game.aim.y + .3);
  }
}
