import { world } from '../world/world';
import { economy } from '../world/economy';
import { population } from '../engine/villagers';
import { scenarioWon } from '../rules/goals';
import { TICK } from '../constants';
import { sound } from '../audio';
import { kit, col, textC, text, labelButton, parchment } from './kit';
import { ui, act, WIN_NONE, WIN_END } from './state';
import { modal, openNew, menuClick, startMission } from './Menu';
import { currentMission, missionLoss, missions } from '../world/missions';
import { markMissionWon } from './prefs';
import { MONTH_SECONDS } from './clock';

// The two endings, as modal Sierra-style windows: the victory (the campaign's final goal is reached: keep playing free, or start a new hamlet) and the defeat (the
// village that once held ten people is empty: start again, or load). The simulation already stands still behind a modal.
const DEFEAT_FROM = 10;
let wonSeen = -1, peak = 0, lost = false, defeat = false, failed = false, reason = '';

/** A village was loaded or created: the next check only looks, it announces nothing about what was already there. */
export function resetEnding(): void { wonSeen = -1; peak = 0; lost = false; failed = false; if (ui.window === WIN_END) ui.window = WIN_NONE; }
/** Once a second: opens the window the first time the scenario is won, or the population falls to nothing. */
export function checkEnding(): void {
  const people = population(), won = world.progression && scenarioWon() ? 1 : 0;
  peak = Math.max(peak, people);
  if (people > 0) lost = false;
  const why = world.progression ? missionLoss(won === 1) : '';
  if (wonSeen >= 0 && won === 1 && wonSeen === 0) { markMissionWon(world.mission); open(false, ''); sound('fanfare', .9); }
  else if (why !== '' && !failed && wonSeen >= 0) { failed = true; open(true, why); sound('alarm', .8); }
  else if (peak >= DEFEAT_FROM && people === 0 && !lost) { lost = true; open(true, 'Tous les habitants sont partis.'); sound('alarm', .8); }
  wonSeen = won;
}
function open(isDefeat: boolean, why: string): void { defeat = isDefeat; reason = why; ui.window = WIN_END; ui.category = -1; act.rebake(); }       // rebake: the window layer redraws
/** The mission after the current one in the campaign, '' when there is none. */
function nextMission(): string { for (let k = 0; k + 1 < missions.length; k++) if (missions[k].id === world.mission) return missions[k + 1].id; return ''; }

function days(): number { return Math.floor(world.tick * TICK / MONTH_SECONDS * 30); }
function goalsDone(): number { let n = 0; for (let k = 0; k < economy.goals.length; k++) if (world.goals[k] === 1) n++; return n; }
function buildings(): number { let n = 0; for (const b of world.buildings) if (b.alive) n++; return n; }

export function drawEnding(): void {
  if (ui.window !== WIN_END) return;
  const mission = currentMission(), next = nextMission();
  const m = modal(380, 300, defeat ? 'Fin de partie' : 'Victoire');
  textC(kit.big, m.x + 190, m.y + 34, defeat ? (mission === null ? 'Le hameau est désert' : 'Mission échouée') : mission === null ? 'Victoire !' : 'Mission réussie !', col(defeat ? 'bad' : 'accent'));
  const note = defeat ? reason : mission === null ? 'Le hameau est devenu un village prospère.' : mission.title;
  textC(kit.small, m.x + 190, m.y + 66, note, col('muted'));
  parchment(m.x + 30, m.y + 90, 320, 100);
  const rows = [['Jours', String(days())], ['Habitants', defeat && population() === 0 ? 'plus aucun (record ' + peak + ')' : String(population())], ['Bâtiments', String(buildings())], ['Objectifs', goalsDone() + ' / ' + economy.goals.length]];
  for (let i = 0; i < rows.length; i++) { text(kit.body, m.x + 46, m.y + 100 + i * 22, rows[i][0], col('muted')); text(kit.body, m.x + 186, m.y + 100 + i * 22, rows[i][1], col('ink')); }
  if (defeat) { labelButton('end:retry', m.x + 30, m.y + 214, 154, 32, 'Recommencer'); labelButton('end:load', m.x + 196, m.y + 214, 154, 32, 'Charger'); }
  else if (next !== '') { labelButton('end:next', m.x + 30, m.y + 214, 154, 32, 'Mission suivante'); labelButton('end:continue', m.x + 196, m.y + 214, 154, 32, 'Continuer', 'Rester dans le hameau, en mode libre'); }
  else { labelButton('end:continue', m.x + 30, m.y + 214, 154, 32, 'Continuer', 'Rester dans le hameau, en mode libre'); labelButton('end:new', m.x + 196, m.y + 214, 154, 32, mission === null ? 'Nouveau hameau' : 'Missions'); }
}
export function endingClick(id: string): boolean {
  if (!id.startsWith('end:')) return false;
  ui.window = WIN_NONE;
  if (id === 'end:continue') { world.progression = false; world.saveDirty = true; act.say('Mode libre : tous les bâtiments sont ouverts.'); }
  else if (id === 'end:next') startMission(nextMission());
  else if (id === 'end:new') openNew(world.mission === '' ? 1 : 0);
  else if (id === 'end:retry') act.newVillage(world.seed, world.size, world.progression, world.risks, world.params);
  else if (id === 'end:load') menuClick('menu:load');
  return true;
}
