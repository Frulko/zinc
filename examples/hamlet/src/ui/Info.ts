import { Cursor } from 'zinc:gfx';
import { world, tileX, tileY, tileIndex } from '../world/world';
import { economy } from '../world/economy';
import { housingReport } from '../rules/housing';
import { sourceOf, harvestLines } from '../rules/harvest';
import { applyTool } from '../rules/build';
import {
  TOOL_ERASE, BS_ISOLATED, BS_WAITING, BS_FULL, BS_WORKING, ROLE_NAMES,
  ST_IDLE, ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_CHOP, ST_TO_SITE, ST_STALK, ST_AIM, ST_SHOT, ST_TO_BODY, ST_PICK, ST_WALK_IN, ST_TO_SHORE, ST_FISH, ST_WORK, ST_FETCH, ST_BRING, ST_ROAM, ST_ROAM_BACK,
} from '../constants';
import { drawBuilding, drawResource, drawGlyph } from './icons';
import { kit, col, window_, text, textR, wrap, meter, labelButton, glyphButton, block, addHit } from './kit';
import { ui, act, WIN_NONE, WIN_INFO, viewport } from './state';

// The information windows: click a building or a person (with no tool in hand) and read the live simulation, in words.
const ROLE_LABELS: string[] = ['Colon', 'Habitant', 'Bûcheron', 'Chasseur', 'Pêcheur', 'Scieur', 'Fumeur', 'Porteur', 'Fermier', 'Meunier', 'Boulanger', 'Marchand', 'Porteur d’eau'];
export function roleLabel(role: number): string { return role >= 0 && role < ROLE_LABELS.length ? ROLE_LABELS[role] : (role >= 0 && role < ROLE_NAMES.length ? ROLE_NAMES[role] : '?'); }
function stateText(state: number): string {
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

export function selectBuilding(id: number): void { ui.selKind = 1; ui.selId = id; ui.window = WIN_INFO; }
export function selectPerson(id: number): void { ui.selKind = 2; ui.selId = id; ui.window = WIN_INFO; }
export function closeInfo(): void { if (ui.window === WIN_INFO) ui.window = WIN_NONE; ui.selKind = 0; ui.selId = -1; }
/** The building on a tile, or the person nearest the ground point (within a body's reach); opens its window. False when there is nothing there. */
export function pickAt(gx: number, gy: number, tile: number): boolean {
  let best = -1, bestD = 1.1;
  for (let i = 0; i < world.people.length; i++) {
    const p = world.people[i], d = Math.sqrt((p.x - gx) * (p.x - gx) + (p.y - gy) * (p.y - gy));
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) { selectPerson(best); return true; }
  if (tile >= 0 && world.build[tile] >= 0) { selectBuilding(world.build[tile]); return true; }
  return false;
}

/** Why a workplace does not produce, in a sentence ('' when it works). */
export function whyIdle(id: number): string {
  const b = world.buildings[id], def = economy.buildings[b.type];
  if (def.needsRoad && !def.store && b.state === BS_ISOLATED) return 'Inactif : aucune route ne le relie à un entrepôt.';
  if (def.workers > 0 && b.workers === 0) return 'Inactif : personne n’y travaille.';
  if (b.state === BS_WAITING && b.waitFor >= 0) return 'Attend : ' + economy.resources[b.waitFor].label.toLowerCase() + '.';
  if (b.state === BS_FULL) return 'Plein : posez un entrepôt au bord de la route.';
  if (def.workers > 0 && b.workers < def.workers) return 'Il manque ' + (def.workers - b.workers) + ' ouvrier(s).';
  if (b.state === BS_WORKING) return 'Au travail.';
  return def.workers > 0 ? 'Au repos.' : '';
}

const WIN_W = 330;
let infoX = -1, infoY = -1, grabDX = 0, grabDY = 0, grabbed = false;   // where the window was dragged to (-1: its default place)
function origin(): { x: number; y: number } {
  const vp = viewport();
  return infoX < 0 ? { x: vp.x + 22, y: vp.y + 22 } : { x: infoX, y: infoY };
}
/** Dragging the window by its title bar. */
export function infoDragStart(x: number, y: number): void { const o = origin(); grabDX = x - o.x; grabDY = y - o.y; grabbed = true; }
export function infoDragging(): boolean { return grabbed; }
export function infoDragMove(x: number, y: number): void {
  if (!grabbed) return;
  const vp = viewport();
  infoX = Math.max(vp.x, Math.min(vp.x + vp.w - WIN_W, x - grabDX)); infoY = Math.max(vp.y, Math.min(vp.y + vp.h - 40, y - grabDY));
}
export function infoDragEnd(): void { grabbed = false; }
export function drawInfo(): void {
  if (ui.window !== WIN_INFO) return;
  const o = origin(), x = o.x, y = o.y;
  if (ui.selKind === 1) building(x, y);
  else if (ui.selKind === 2) person(x, y);
}
function building(x: number, y: number): void {
  const b = world.buildings[ui.selId];
  if (b === undefined || !b.alive) { closeInfo(); return; }
  const def = economy.buildings[b.type], lh = kit.lineH;
  let h = 130;
  const why = whyIdle(ui.selId), whyLines = wrap(why, WIN_W - 24);
  const report = def.housing !== null ? wrap(housingReport(b).text, WIN_W - 24) : [];
  const stocks: number[] = [];
  for (let k = 0; k < economy.resources.length; k++) if (b.stock[k] > 0) stocks.push(k);
  h += whyLines.length * lh + report.length * lh + gather.length * lh + (gather.length > 0 ? 6 : 0) + stocks.length * 20 + (def.workers > 0 ? 24 : 0) + 40;
  window_(x, y, WIN_W, h, def.label); block(x - 6, y - 6, WIN_W + 12, h + 12); addHit('info:drag', x, y, WIN_W - 28, 24, 'Glisser pour déplacer', Cursor.Grab);
  glyphButton('info:close', x + WIN_W - 24, y + 2, 20, 18, 'close', 'Fermer [Échap]');
  const src = sourceOf(def), gather = src >= 0 ? harvestLines(src, def) : [];
  drawBuilding(b.type, x + 8, y + 30, 64);
  text(kit.body, x + 82, y + 32, def.hint !== '' ? '' : '', col('ink'));
  let py = y + 34;
  if (def.workers > 0) { text(kit.small, x + 82, py, 'Ouvriers ' + b.workers + ' / ' + def.workers, col('ink')); meter(x + 82, py + lh, WIN_W - 98, 12, b.workers / def.workers, col('good')); py += lh + 16; }
  if (def.housing !== null) { text(kit.small, x + 82, py, 'Habitants ' + b.residents + ' / ' + housingReport(b).capacity, col('ink')); py += lh + 4; }
  py = Math.max(py, y + 100);
  for (const line of whyLines) { text(kit.body, x + 12, py, line, why.startsWith('Inactif') || why.startsWith('Plein') || why.startsWith('Il manque') ? col('bad') : col('ink')); py += lh; }
  for (const line of report) { text(kit.small, x + 12, py, line, col('muted')); py += lh; }
  if (stocks.length > 0) { py += 4; text(kit.small, x + 12, py, 'Réserve', col('muted')); py += lh; }
  for (const k of stocks) { drawResource(k, x + 12, py, 16); text(kit.body, x + 34, py + 1, economy.resources[k].label + ' : ' + b.stock[k], col('ink')); py += 20; }
  if (!b.fixed) labelButton('info:demolish', x + 12, y + h - 34, 110, 26, 'Démolir', 'Rendre la case au hameau');
}
function person(x: number, y: number): void {
  if (gather.length > 0) { py += 4; for (const line of gather) { text(kit.small, x + 12, py, line, col('muted')); py += lh; } }
  const p = world.people[ui.selId];
  if (p === undefined) { closeInfo(); return; }
  const lh = kit.lineH, home = p.home >= 0 ? world.buildings[p.home] : undefined, job = p.job >= 0 ? world.buildings[p.job] : undefined;
  window_(x, y, WIN_W, 150, roleLabel(p.role)); block(x - 6, y - 6, WIN_W + 12, 162); addHit('info:drag', x, y, WIN_W - 28, 24, 'Glisser pour déplacer', Cursor.Grab);
  glyphButton('info:close', x + WIN_W - 24, y + 2, 20, 18, 'close', 'Fermer [Échap]');
  drawGlyph('person', x + 12, y + 32, 36);
  text(kit.body, x + 60, y + 32, stateText(p.state), col('ink'));
  text(kit.small, x + 60, y + 32 + lh, job !== undefined ? 'Travaille : ' + economy.buildings[job.type].label : 'Sans travail', col('muted'));
  text(kit.small, x + 60, y + 32 + 2 * lh, home !== undefined ? 'Habite : ' + economy.buildings[home.type].label : '', col('muted'));
  if (p.carry > 0 && p.load > 0) { drawResource(p.carry - 1, x + 12, y + 100, 16); text(kit.body, x + 34, y + 101, 'Porte ' + p.load + ' ' + economy.resources[p.carry - 1].label.toLowerCase(), col('ink')); }
  labelButton('info:goto', x + 12, y + 118, 120, 24, 'Suivre', 'Centrer la carte sur lui');
}
export function infoClick(id: string): boolean {
  if (id === 'info:close') { closeInfo(); return true; }
  if (id === 'info:goto') { const p = world.people[ui.selId]; if (p !== undefined) act.jump(p.x, p.y); return true; }
  if (id === 'info:demolish') {
    const b = world.buildings[ui.selId];
    if (b !== undefined && b.alive) { applyTool(TOOL_ERASE, tileIndex(b.i, b.j)); closeInfo(); }
    return true;
  }
  return false;
}
