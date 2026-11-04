import { rect, width, setClipboardText } from 'zinc:gfx';
import { world, tileAt, tileI, tileJ } from '../world/world';
import { economy } from '../world/economy';
import { stateHash } from '../world/hash';
import { saveGame } from '../world/save';
import { stepWorld } from '../engine/simulate';
import { arrivalFactor } from '../rules/needs';
import { labourStats } from '../rules/labour';
import { networkCount, gateNetwork } from '../engine/network';
import { peaceReasons } from '../engine/crime';
import { levelLabel, level } from '../rules/difficulty';
import { settings } from '../settings';
import { SAVE_VERSION, TICK, DEER_GONE } from '../constants';
import { W, H, unproject } from '../pixel';
import { camera, ZOOM_VIEW, fit } from '../view/camera';
import { frameDirty } from '../view/frame';
import { bakeStats, bakeCount } from '../view/scenery';
import { fxStats } from '../view/fx';
import { audioStats, muted } from '../audio';
import { kit, col, window_, winOrigin, parchment, text, labelButton, block, hitAt, pointer } from './kit';
import { ui, viewport, mapView } from './state';
import { dateText } from './clock';

// The technical window (F3, or Options): off, a compact overlay in a corner, then the full window over the game. It reads the game, never changes the
// simulation, and costs nothing while off: the scene's hooks return at once and nothing is counted, sorted or formatted.
export const debug = { mode: 0 };           // 0 off, 1 compact overlay, 2 window
export const debugHooks = { devPanel: (): void => {}, rebake: (): void => {} };
const TABS = ['Perf', 'Moteur', 'Monde', 'Simul.', 'Rendu', 'Audio', 'Entrées'];
const WW = 600, WH = 470, FRAMES = 120;
let tab = 0, lastMark = 0, lastFrame = 0, report = '';
const lap: number[] = [0, 0, 0];             // smoothed ms: update, drawVillage, interface and upload
const frames: number[] = [];
let voicesAt = 0, voicesPerSecond = 0, voicesBase = 0;
let counted: string[] = [], countedAt = -9;

export function cycleDebug(): void { debug.mode = (debug.mode + 1) % 3; if (debug.mode === 0) frames.length = 0; }
export function openDebug(): void { debug.mode = 2; }
export function debugBegin(): void { if (debug.mode !== 0) lastMark = performance.now(); }
/** Adds the time since the last mark to slot 0 (update), 1 (the village picture) or 2 (interface and upload). */
export function debugLap(slot: number): void {
  if (debug.mode === 0) return;
  const now = performance.now();
  lap[slot] += (now - lastMark - lap[slot]) * .1; lastMark = now;
}

function p95(): number {
  if (frames.length === 0) return 0;
  const s = frames.slice().sort((a: number, b: number): number => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * .95))];
}
const ms = (v: number): string => (Math.round(v * 10) / 10) + ' ms';
const pair = (label: string, value: string): string => label + '|' + value;

function perf(): string[] {
  const avg = frames.length === 0 ? 0 : frames.reduce((a: number, b: number): number => a + b, 0) / frames.length;
  let px = 0;
  for (let k = 0; k < frameDirty.spans.length; k += 3) px += frameDirty.spans[k + 2] - frameDirty.spans[k + 1] + 1;
  return [pair('FPS', String(avg > 0 ? Math.round(1000 / avg) : 0)), pair('Image', ms(avg)), pair('p95 sur ' + FRAMES + ' images', ms(p95())),
    pair('Mise à jour', ms(lap[0])), pair('Dessin du village', ms(lap[1])), pair('Interface et envoi', ms(lap[2])),
    pair('Surface salie', String(frameDirty.full ? 100 : Math.round(px * 1000 / (W * H)) / 10) + ' %'), pair('Octets envoyés', frameDirty.full ? 'tout' : String(px * 4)), pair('Dernier rebake', ms(bakeStats.lastMs))];
}
function engine(): string[] {
  return [pair('Moteur', 'zinc run (non détectable ici)'), pair('Fenêtre', width() + ' x ' + viewport().h), pair('Zoom', camera.level + ' (ZOOM_VIEW ' + ZOOM_VIEW[camera.level] + ')'),
    pair('Tampon', W + ' x ' + H), pair('Échelle', fit.s0 + ' (affichage ' + (Math.round(mapView.scale * 100) / 100) + ')'), pair('Caméra', Math.round(camera.x) + ', ' + Math.round(camera.y))];
}
/** Counts that loop over every tile or building, refreshed twice a second. */
function counts(): string[] {
  if (ui.time - countedAt < .5 && counted.length > 0) return counted;
  countedAt = ui.time;
  const byType: number[] = [];
  for (let k = 0; k < economy.buildings.length; k++) byType.push(0);
  let burning = 0, trees = 0, roads = 0, claimed = 0, fire = 0, damage = 0, crime = 0;
  for (const b of world.buildings) if (b.alive) { byType[b.type]++; if (b.burn > 0) burning++; fire = Math.max(fire, b.fire); damage = Math.max(damage, b.damage); crime = Math.max(crime, b.crime); }
  for (let t = 0; t < world.tree.length; t++) { if (world.tree[t] > 0) trees++; if (world.road[t] !== 0) roads++; if (world.claimed[t] !== 0) claimed++; }
  const kinds: string[] = [];
  for (let k = 0; k < byType.length; k++) if (byType[k] > 0) kinds.push(economy.buildings[k].label + ' ' + byType[k]);
  let deer = 0; for (const d of world.deer) if (d.state !== DEER_GONE) deer++;
  counted = [pair('Habitants', String(world.people.length)), pair('Cerfs (emplacements)', world.deer.length + ' dont ' + deer + ' actifs'), pair('Arbres', String(trees)), pair('Routes', String(roads)),
    pair('Ruines qui brûlent', String(burning)), pair('Tuiles réservées', String(claimed)), pair('Bâtiments', kinds.join(', ')),
    pair('Risques max feu/usure/vol', fire + ' / ' + damage + ' / ' + crime)];
  return counted;
}
function worldTab(): string[] {
  return [pair('Graine', String(world.seed)), pair('Taille', world.size + ' x ' + world.size), pair('Paysage', 'eau ' + world.params.waterAmount + ', rivière ' + (world.params.river ? 'oui' : 'non') + ', forêt ' + world.params.forestDensity + ', roche ' + world.params.rockDensity + ', biome ' + world.params.biome), pair('Tick', String(world.tick)), pair('Date', dateText()),
    pair('Révision', String(world.revision)), pair('Hash d’état', stateHash().toString(16)), pair('Version de sauvegarde', SAVE_VERSION),
    pair('Dernière sauvegarde', Math.round(world.time - world.lastSave) + ' s' + (world.saveDirty ? ' (modifié depuis)' : '')),
    pair('Difficulté', levelLabel() + (world.difficulty >= 0 ? ' (arrivées ' + level().arrival + ' %, appétit ' + level().eat + ' %, risques ' + level().risk + ' %)' : '')), pair('Campagne / risques', (world.progression ? 'oui' : 'non') + ' / ' + (world.risks ? 'oui' : 'non')),
    pair('Effets vivants', fxStats.events + ' évén., fumée ' + fxStats.smoke + ', lueurs ' + fxStats.glow)].concat(counts());
}
function labourText(): string { const l = labourStats(); return 'réserve ' + l.pool + ', places ' + l.jobs + ', tenues ' + l.filled + ', sans emploi ' + l.unemployed + ', places vides ' + l.shortage; }
function simulation(): string[] {
  let working = 0, idle = 0;
  for (const p of world.people) { if (p.job >= 0) working++; else idle++; }
  const lines = [pair('Vitesse', String(settings.simSpeed)), pair('Tick par seconde', String(Math.round(1 / TICK))), pair('Pause', ui.paused ? 'oui' : 'non'),
    pair('Postes tenus / sans poste', working + ' / ' + idle), pair('Main-d’œuvre', labourText()), pair('Réseaux routiers', networkCount() + ' (celui de l’entrée : ' + gateNetwork() + ')'), pair('Chômage', world.jobless + ' %'), pair('Humeur du village', String(world.mood)), pair('Paix', world.risks ? world.crime.peace + ' % (' + peaceReasons().join(', ') + ') · voleurs ' + world.crime.outlaws.length + ' · ' + world.crime.robbed + ' vols, ' + world.crime.caught + ' arrêtés, ' + world.crime.riots + ' émeutes' : 'sans risques'), pair('Difficulté', levelLabel()),
    pair('Arrivées', arrivalFactor(world.mood) === 0 ? 'personne ne vient' : 'facteur ' + arrivalFactor(world.mood) + (world.waitingForFood ? ', attend de la nourriture' : ''))];
  for (let k = 0; k < economy.resources.length; k++) if (world.stock[k] > 0) lines.push(pair('Stock ' + economy.resources[k].label, String(world.stock[k])));
  return lines;
}
function rendering(): string[] {
  return [pair('Atlas des acteurs', settings.atlas ? 'actif' : 'coupé'), pair('Bakes complets / partiels', bakeStats.full + ' / ' + bakeStats.partial), pair('Compteur de bake', String(bakeCount)),
    pair('Dernier bake', ms(bakeStats.lastMs)), pair('Effets / ombres / contours', (settings.fx ? 'oui' : 'non') + ' / ' + (settings.shadows ? 'oui' : 'non') + ' / ' + (settings.edges ? 'oui' : 'non')),
    pair('Flèches / bulles', (settings.hints ? 'oui' : 'non') + ' / ' + (settings.thoughts ? 'oui' : 'non'))];
}
function audio(): string[] {
  return [pair('Muet', muted ? 'oui' : 'non'), pair('Ambiance', audioStats.ambience), pair('Volumes ambiance / bruitages', settings.ambienceVolume + ' / ' + settings.sfxVolume),
    pair('Voix par seconde', String(voicesPerSecond)), pair('Dernier son', audioStats.last)];
}
/** The tile under the pointer, in the map's own terms. */
let lastTile = -1;
function hovered(): number {
  if (hitAt(pointer.x, pointer.y) !== null) return -1;
  const p = unproject((pointer.x - mapView.x) / mapView.scale + mapView.cropX, (pointer.y - mapView.y) / mapView.scale + mapView.cropY);
  return tileAt(p.x, p.y);
}
function input(): string[] {
  const over = hovered(); if (over >= 0) lastTile = over;
  const t = lastTile, hit = hitAt(pointer.x, pointer.y), lines = [pair('Pointeur', pointer.x + ', ' + pointer.y), pair('Sous le pointeur', hit === null ? 'la carte' : hit.id === '' ? 'une fenêtre' : hit.id)];
  if (t < 0) { lines.push(pair('Tuile', 'aucune')); return lines; }
  lines.push(pair('Tuile (la dernière survolée)', t + ' (' + tileI(t) + ', ' + tileJ(t) + ')'), pair('Terrain', String(world.terrain[t])), pair('Route', String(world.road[t])), pair('Arbre', String(world.tree[t])),
    pair('Roche / filon', world.rock[t] + ' / ' + world.lode[t]), pair('Décor', String(world.deco[t])), pair('Bâtiment', world.build[t] >= 0 ? world.build[t] + ' ' + economy.buildings[world.buildings[world.build[t]].type].label : 'aucun'),
    pair('Réservée', String(world.claimed[t])), pair('Désirabilité', world.appeal.length > t ? String(world.appeal[t]) : '—'));
  return lines;
}
function tabLines(k: number): string[] {
  return k === 0 ? perf() : k === 1 ? engine() : k === 2 ? worldTab() : k === 3 ? simulation() : k === 4 ? rendering() : k === 5 ? audio() : input();
}
function reportText(): string {
  const out: string[] = ['Hamlet debug, tick ' + world.tick];
  for (let k = 0; k < TABS.length; k++) { out.push('[' + TABS[k] + ']'); for (const l of tabLines(k)) out.push(l.replace('|', ': ')); }
  return out.join('\n');
}

/** Called once per drawn frame, last of the game's own drawing: samples the frame time, then draws the overlay or the window. */
export function drawDebug(): void {
  if (debug.mode === 0) return;
  debugLap(2);
  const now = performance.now();
  if (lastFrame > 0) { frames.push(now - lastFrame); if (frames.length > FRAMES) frames.shift(); }
  lastFrame = now;
  if (now - voicesAt >= 1000) { voicesPerSecond = audioStats.voices - voicesBase; voicesBase = audioStats.voices; voicesAt = now; }
  const vp = viewport();
  if (debug.mode === 1) {
    const avg = frames.length === 0 ? 0 : frames.reduce((a: number, b: number): number => a + b, 0) / frames.length;
    const lines = ['FPS ' + (avg > 0 ? Math.round(1000 / avg) : 0) + '  ' + ms(avg) + '  p95 ' + ms(p95()), 'tick ' + world.tick + '  habitants ' + world.people.length + '  zoom ' + camera.level,
      'maj ' + ms(lap[0]) + '  village ' + ms(lap[1]) + '  ui ' + ms(lap[2])], t = hovered();
    if (t >= 0) lines.push('tuile ' + tileI(t) + ',' + tileJ(t) + ' terrain ' + world.terrain[t] + ' bât ' + world.build[t]);
    const x = vp.x + 8, y = vp.y + 8, w = 300, h = 12 + lines.length * 14;
    parchment(x, y, w, h); block(x, y, w, h);
    for (let i = 0; i < lines.length; i++) text(kit.small, x + 8, y + 6 + i * 14, lines[i], col('ink'));
  }
}
/** The full window (mode 2), drawn with the other windows. */
export function drawDebugWindow(): void {
  if (debug.mode !== 2) return;
  const vp = viewport();
  const o = winOrigin('debug', vp.x + Math.floor((vp.w - WW) / 2), vp.y + Math.max(8, Math.floor((vp.h - WH) / 2)), WW, WH), x = o.x, y = o.y;
  window_(x, y, WW, WH, 'Informations techniques [F3]', 'debug', (): void => { debug.mode = 0; frames.length = 0; });
  for (let i = 0; i < TABS.length; i++) labelButton('dbg:tab:' + i, x + 8 + i * 82, y + 28, 78, 24, TABS[i], '', true, tab === i);
  parchment(x + 8, y + 56, WW - 16, WH - 110);
  const lines = tabLines(tab);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].split('|');
    text(kit.small, x + 18, y + 62 + i * 14, kv[0], col('muted')); text(kit.small, x + 230, y + 62 + i * 14, kv[1], col('ink'));
  }
  if (tab === 0) {                          // the last frames as bars: the tallest is the slowest
    const gx = x + 18, gy = y + WH - 70, top = Math.max(33, p95() * 1.5);
    rect(gx, gy - 40, FRAMES * 4, 40, col('bar'));
    for (let i = 0; i < frames.length; i++) { const bar = Math.max(1, Math.min(40, Math.round(frames[i] / top * 40))); rect(gx + i * 4, gy - bar, 3, bar, frames[i] > 33 ? col('accent') : col('good')); }
  }
  const by = y + WH - 46, labels = ['Copier', 'Sauver', 'Rebake', 'Effets', 'Flèches', 'Bulles', 'Pas', 'Réglages [F2]'];
  for (let i = 0; i < labels.length; i++) {
    const on = i === 3 ? settings.fx : i === 4 ? settings.hints : i === 5 ? settings.thoughts : false;
    labelButton('dbg:' + i, x + 8 + i * 70, by, i === 7 ? 96 : 66, 26, labels[i], i === 6 ? 'Un tick, en pause' : '', i !== 6 || ui.paused, on);
  }
  if (report !== '') text(kit.small, x + 12, y + WH - 14, report, col('muted'));
}

export function debugClick(id: string): boolean {
  if (!id.startsWith('dbg:')) return false;
  const k = id.slice(4);
  if (k.startsWith('tab:')) tab = Number(k.slice(4));
  else if (k === '0') { const t = reportText(); console.log(t); setClipboardText(t); report = 'Rapport copié (' + t.length + ' caractères) et écrit dans la console.'; }
  else if (k === '1') { saveGame(); report = 'Sauvegardé.'; }
  else if (k === '2') { world.revision++; debugHooks.rebake(); report = 'Rebake demandé.'; }
  else if (k === '3') settings.fx = !settings.fx;
  else if (k === '4') settings.hints = !settings.hints;
  else if (k === '5') settings.thoughts = !settings.thoughts;
  else if (k === '6') { stepWorld(); report = 'Un tick : ' + world.tick; }
  else if (k === '7') debugHooks.devPanel();
  return true;
}
