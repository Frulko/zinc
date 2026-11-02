import { Cursor } from 'zinc:gfx';
import { world, tileIndex, Building } from '../world/world';
import { edgeTiles } from '../engine/network';
import { economy } from '../world/economy';
import { housingReport } from '../rules/housing';
import { sourceOf, harvestLines } from '../rules/harvest';
import { applyTool } from '../rules/build';
import { orderOf, setOrder } from '../rules/storage';
import { normalizePriority } from '../rules/labour';
import { resourceShown, summary } from '../hud';
import { doesText, needsText } from './BuildMenu';
import {
  TOOL_ERASE, ORDER_ACCEPT, BS_ISOLATED, BS_OFF_NET, BS_WAITING, BS_FULL, BS_NO_SOURCE, BS_WORKING, ROLE_NAMES,
  ST_SLEEP, ST_HOME, ST_FREE, ST_IDLE, ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_CHOP, ST_TO_SITE, ST_STALK, ST_AIM, ST_SHOT, ST_TO_BODY, ST_PICK, ST_WALK_IN, ST_TO_SHORE, ST_FISH, ST_WORK, ST_FETCH, ST_BRING, ST_ROAM, ST_ROAM_BACK,
} from '../constants';
import { drawBuilding, drawResource, drawGlyph } from './icons';
import { kit, col, winRaise, window_, winOrigin, text, textR, wrap, meter, labelButton, glyphButton, block, addHit } from './kit';
import { ui, act, viewport } from './state';
import { thoughtOf, houseNeeds, servicesOffered, FEEL_WORDS, FEEL_CONTENT, FEEL_SOSO } from '../rules/needs';
import { sleepsIndoors } from '../engine/routine';

// The information windows: click a building or a person (with no tool in hand) and read the live simulation, in words.
const ROLE_LABELS: string[] = ['Colon', 'Habitant', 'Bûcheron', 'Chasseur', 'Pêcheur', 'Scieur', 'Fumeur', 'Porteur', 'Fermier', 'Meunier', 'Boulanger', 'Marchand', 'Porteur d’eau'];
export function roleLabel(role: number): string { return role >= 0 && role < ROLE_LABELS.length ? ROLE_LABELS[role] : (role >= 0 && role < ROLE_NAMES.length ? ROLE_NAMES[role] : '?'); }
function stateText(state: number): string {
  if (state === ST_SLEEP) return 'Dort';
  if (state === ST_HOME) return 'Rentre se coucher';
  if (state === ST_FREE) return 'Va flâner au marché';
  if (state === ST_IDLE) return 'Se repose';
  if (state === ST_STROLL) return 'Se promène';
  if (state === ST_GO_WORK) return 'Va au travail';
  if (state === ST_SEEK) return 'Cherche du travail';
  if (state === ST_TO_TREE) return 'Va vers un arbre';
  if (state === ST_CHOP) return 'Abat un arbre';
  if (state === ST_TO_SITE) return 'Rentre à son atelier';
  if (state === ST_STALK || state === ST_AIM || state === ST_SHOT) return 'Chasse';
  if (state === ST_TO_BODY || state === ST_PICK) return 'Rapporte le gibier';
  if (state === ST_WALK_IN) return 'Arrive au hameau';
  if (state === ST_TO_SHORE || state === ST_FISH) return 'Pêche';
  if (state === ST_WORK) return 'Travaille';
  if (state === ST_FETCH) return 'Va chercher une charge';
  if (state === ST_BRING) return 'Porte une charge';
  if (state === ST_ROAM || state === ST_ROAM_BACK) return 'Fait sa tournée';
  return 'Occupé';
}

export function selectBuilding(id: number): void { ui.selKind = 1; ui.selId = id; ui.info = true; winRaise('info'); }
export function selectPerson(id: number): void { ui.selKind = 2; ui.selId = id; ui.info = true; winRaise('info'); }
export function closeInfo(): void { ui.info = false; ui.selKind = 0; ui.selId = -1; }
/** The building on a tile, or the person nearest the ground point (within a body's reach); opens its window. False when there is nothing there. */
export function pickAt(gx: number, gy: number, tile: number): boolean {
  let best = -1, bestD = 1.1;
  for (let i = 0; i < world.people.length; i++) {
    const p = world.people[i], d = Math.sqrt((p.x - gx) * (p.x - gx) + (p.y - gy) * (p.y - gy));
    if (d < bestD && !sleepsIndoors(p)) { bestD = d; best = i; }
  }
  if (best >= 0) { selectPerson(best); return true; }
  if (tile >= 0 && world.build[tile] >= 0) { selectBuilding(world.build[tile]); return true; }
  return false;
}

function roadBeside(b: Building): boolean { return edgeTiles(b).some((v: number): boolean => world.road[v] !== 0); }
/** Why a building does not produce, in one plain sentence ('' when it works): the first thing that is wrong, with what to do. */
export function whyIdle(id: number): string {
  const b = world.buildings[id], def = economy.buildings[b.type];
  if (def.needsRoad && !roadBeside(b)) return 'Inactif : aucune route à côté. Posez une route contre ce bâtiment.';
  if (b.state === BS_OFF_NET) return 'Inactif : sa route ne mène pas à l’entrée du hameau. Reliez-la à la porte.';
  if (def.needsRoad && !def.store && b.state === BS_ISOLATED) return 'Inactif : aucune route ne le relie à un entrepôt. Posez un entrepôt au bord de la route.';
  if (def.workers > 0 && b.workers === 0) return summary().labour.unemployed > 0 ? 'Inactif : personne n’y travaille. Donnez-lui la priorité (flèches ci-dessous).' : 'Inactif : personne n’y travaille, tous les habitants ont déjà un poste. Posez une maison.';
  if (b.state === BS_WAITING && b.waitFor >= 0) return 'Attend : ' + economy.resources[b.waitFor].label.toLowerCase() + (world.stock[b.waitFor] > 0 ? ' (en route, le porteur arrive).' : ' : aucun entrepôt n’en a. Posez de quoi en produire.');
  if (b.state === BS_NO_SOURCE) return def.gather === 'tree' ? 'Plus d’arbre à portée : abattez ceux qui ferment la route (gomme) ou prolongez la route.' : 'Rien à portée : rapprochez ce bâtiment de sa ressource.';
  if (b.state === BS_FULL) return 'Plein : posez un entrepôt au bord de la route, ou videz celui d’à côté.';
  if (def.workers > 0 && b.workers < def.workers) return 'Il manque ' + (def.workers - b.workers) + ' ouvrier(s) : il produit plus lentement.';
  if (b.state === BS_WORKING) return 'Au travail.';
  return def.workers > 0 ? 'Au repos.' : '';
}

/** Where a building stands against fire, wear and theft, in a sentence ('' when the village has no risks or the building none). */
function riskText(b: Building): string {
  const r = economy.risk, def = economy.buildings[b.type];
  if (!world.risks) return '';
  if (b.type === r.ruin) return b.burn > 0 ? 'En flammes : le feu gagne les voisins.' : 'Décombres : démolissez-les pour libérer la case.';
  if (def.risk === null) return '';
  const level = (v: number, at: number): string => v < at * .35 ? 'faible' : v < at * .7 ? 'moyen' : 'élevé';
  return 'Risque : incendie ' + level(b.fire, r.fireAt) + ', usure ' + level(b.damage, r.collapseAt) + (def.risk.crime > 0 ? ', vols ' + level(b.crime, r.crimeAt) : '') + '.';
}

const WIN_W = 400;
function origin(h: number): { x: number; y: number } { const vp = viewport(); return winOrigin('info', vp.x + 22, vp.y + 22, WIN_W, h); }
export function drawInfo(): void {
  if (!ui.info) return;
  if (ui.selKind === 1) building();
  else if (ui.selKind === 2) person();
}
const ORDER_LABELS: string[] = ['Accepte', 'Refuse', 'Cherche'], ORDER_TIPS: string[] = ['Accepte : les charrettes y apportent ce bien et il est distribué.', 'Refuse : personne n’y apporte ce bien (ce qu’il garde reste distribué).', 'Va chercher : il prend ce bien et le garde, ses porteurs le cherchent dans les autres entrepôts.'];
function building(): void {
  const b = world.buildings[ui.selId];
  if (b === undefined || !b.alive) { closeInfo(); return; }
  const def = economy.buildings[b.type], lh = kit.lineH, iw = WIN_W - 24;
  const why = def.housing !== null ? '' : whyIdle(ui.selId), whyLines = wrap(why, iw);
  const does = wrap(doesText(def), iw, kit.small), need = needsText(def), needLines = need === '' ? [] : wrap('Il lui faut : ' + need + '.', iw, kit.small);
  const report = (def.housing !== null ? wrap(housingReport(b).text, iw) : []).concat(wrap(riskText(b), iw));
  const src = sourceOf(def), gather = src >= 0 ? harvestLines(src, def) : [];
  const stocks: number[] = [], shown: number[] = [];
  for (let k = 0; k < economy.resources.length; k++) { if (b.stock[k] > 0) stocks.push(k); if (def.store && resourceShown(k)) shown.push(k); }
  const orders = def.store ? Math.ceil(shown.length / 2) * 22 + 22 : 0, prio = def.workers > 0 && !b.fixed ? 30 : 0;
  const h = 96 + (does.length + needLines.length) * lh + whyLines.length * lh + report.length * lh + gather.length * lh + (gather.length > 0 ? 6 : 0) + (def.store ? orders : stocks.length * 20 + (stocks.length > 0 ? lh + 4 : 0)) + (def.workers > 0 ? 24 : 0) + prio + 44;
  const o = origin(h), x = o.x, y = o.y;
  window_(x, y, WIN_W, h, def.label, 'info', closeInfo);
  drawBuilding(b.type, x + 8, y + 30, 56);
  let py = y + 34;
  if (def.workers > 0) { text(kit.small, x + 74, py, 'Ouvriers ' + b.workers + ' / ' + def.workers, col('ink')); meter(x + 74, py + lh, WIN_W - 90, 12, b.workers / def.workers, col('good')); py += lh + 16; }
  if (def.housing !== null) { text(kit.small, x + 74, py, 'Habitants ' + b.residents + ' / ' + housingReport(b).capacity, col('ink')); py += lh + 4; }
  py = Math.max(py, y + 92);
  for (const line of does) { text(kit.small, x + 12, py, line, col('ink')); py += lh; }
  for (const line of needLines) { text(kit.small, x + 12, py, line, col('muted')); py += lh; }
  py += 4;
  const bad = why.startsWith('Inactif') || why.startsWith('Plein') || why.startsWith('Il manque') || why.startsWith('Attend') || why.startsWith('Plus') || why.startsWith('Rien');
  for (const line of whyLines) { text(kit.body, x + 12, py, line, bad ? col('bad') : col('good')); py += lh; }
  for (const line of report) { text(kit.small, x + 12, py, line, col('muted')); py += lh; }
  if (gather.length > 0) { py += 4; for (const line of gather) { text(kit.small, x + 12, py, line, col('muted')); py += lh; } }
  if (def.store) {
    py += 6; text(kit.small, x + 12, py, 'Ordres de l’entrepôt', col('accent')); py += lh + 2;
    for (let n = 0; n < shown.length; n++) {
      const k = shown[n], order = orderOf(b, k), cx = x + 12 + (n % 2) * (iw / 2 + 2), cy = py + Math.floor(n / 2) * 22;
      drawResource(k, cx, cy, 16);
      text(kit.small, cx + 20, cy + 2, economy.resources[k].label + ' ' + b.stock[k], col('ink'));
      labelButton('ord:' + k, cx + iw / 2 - 78, cy - 2, 74, 20, ORDER_LABELS[order], ORDER_TIPS[order] + '\nCliquez pour changer.', true, order !== ORDER_ACCEPT);
    }
    py += Math.ceil(shown.length / 2) * 22;
  } else if (stocks.length > 0) {
    py += 4; text(kit.small, x + 12, py, 'Réserve', col('muted')); py += lh;
    for (const k of stocks) { drawResource(k, x + 12, py, 16); text(kit.body, x + 34, py + 1, economy.resources[k].label + ' : ' + b.stock[k], col('ink')); py += 20; }
  }
  if (prio > 0) {
    const order = normalizePriority(), at = order.indexOf(b.type);
    text(kit.small, x + 12, y + h - 66, 'Priorité des bras : ' + (at + 1) + ' sur ' + order.length, col('muted'));
    glyphButton('prio:up:' + b.type, x + 170, y + h - 70, 26, 20, 'left', 'Servir en premier');
    glyphButton('prio:down:' + b.type, x + 200, y + h - 70, 26, 20, 'right', 'Servir plus tard');
  }
  if (!b.fixed) labelButton('info:demolish', x + 12, y + h - 34, 110, 26, 'Démolir', 'Rendre la case au hameau');
}
function person(): void {
  const p = world.people[ui.selId];
  if (p === undefined) { closeInfo(); return; }
  const lh = kit.lineH, home = p.home >= 0 ? world.buildings[p.home] : undefined, job = p.job >= 0 ? world.buildings[p.job] : undefined;
  const house = p.home >= 0 ? world.buildings[p.home] : undefined, thought = wrap('« ' + thoughtOf(p.feel, house !== undefined ? houseNeeds(house, servicesOffered()).lack : '') + ' »', WIN_W - 24), H = 190 + thought.length * lh;
  const o = origin(H), x = o.x, y = o.y;
  window_(x, y, WIN_W, H, roleLabel(p.role), 'info', closeInfo);
  drawGlyph('person', x + 12, y + 32, 36);
  text(kit.body, x + 60, y + 32, stateText(p.state), col('ink'));
  text(kit.small, x + 60, y + 32 + lh, job !== undefined ? 'Travaille : ' + economy.buildings[job.type].label : 'Sans travail', col('muted'));
  text(kit.small, x + 60, y + 32 + 2 * lh, home !== undefined ? 'Habite : ' + economy.buildings[home.type].label : '', col('muted'));
  text(kit.small, x + 12, y + 100, 'Humeur ' + Math.round(p.mood) + ' · ' + FEEL_WORDS[p.feel], p.feel === FEEL_CONTENT || p.feel === FEEL_SOSO ? col('ink') : col('bad'));
  meter(x + 12, y + 100 + lh, WIN_W - 24, 12, p.mood / 100, p.mood >= 50 ? col('good') : p.mood >= 30 ? col('warn') : col('bad'));
  text(kit.small, x + 12, y + 100 + lh + 16, 'Fatigue ' + Math.round(p.fatigue) + ' %' + (p.fun > 0 ? ' · a flâné au marché' : ''), col('muted'));
  let ty = y + 100 + 2 * lh + 20;
  for (const line of thought) { text(kit.body, x + 12, ty, line, col('ink')); ty += lh; }
  if (p.carry > 0 && p.load > 0) { drawResource(p.carry - 1, x + 12, ty + 2, 16); text(kit.body, x + 34, ty + 3, 'Porte ' + p.load + ' ' + economy.resources[p.carry - 1].label.toLowerCase(), col('ink')); }
  labelButton('info:goto', x + 12, y + H - 32, 120, 24, 'Suivre', 'Centrer la carte sur lui');
}
export function infoClick(id: string): boolean {
  if (id.startsWith('ord:')) { const b = world.buildings[ui.selId]; if (b !== undefined && b.alive) { const k = Number(id.slice(4)); setOrder(ui.selId, k, (orderOf(b, k) + 1) % 3); } return true; }
  if (id === 'info:goto') { const p = world.people[ui.selId]; if (p !== undefined) act.jump(p.x, p.y); return true; }
  if (id === 'info:demolish') {
    const b = world.buildings[ui.selId];
    if (b !== undefined && b.alive) { applyTool(TOOL_ERASE, tileIndex(b.i, b.j)); closeInfo(); }
    return true;
  }
  return false;
}
