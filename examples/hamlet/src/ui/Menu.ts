import * as storage from 'zinc:storage';
import { openDebug } from './Debug';
import { width, height, rrect, createImage, updatePixels, drawImageRect, ImageFlag, KeyKind, startTextInput, stopTextInput } from 'zinc:gfx';
import { world, tileCount } from '../world/world';
import { economy } from '../world/economy';
import { snapshot, restore } from '../world/save';
import { parseSeedRequest, randomSeed } from '../world/seed';
import { population } from '../engine/villagers';
import { TERRAIN_WATER, TERRAIN_VOID, MIN_SIZE, MAX_SIZE, DEFAULT_SIZE } from '../constants';
import { settings } from '../settings';
import { rgb } from '../pixel';
import { muted, toggleSound, refreshVolume, sound } from '../audio';
import { kit, col, setSkin, skinNames, window_, winOrigin, parchment, text, textC, labelButton, block, addHit, measure, wrap } from './kit';
import { ui, act, WIN_NONE, WIN_MENU, WIN_OPTIONS, WIN_MAIN, WIN_SAVES, WIN_NEW, WIN_END } from './state';
import { dateText } from './clock';
import { savePrefs } from './prefs';
import { PRESETS } from '../gen/presets';
import { defaultLevel, levelLabel } from '../rules/difficulty';
import { TerrainParams, copyTerrainParams, terrain } from '../gen/terrain';
import { missions, missionOf, applyMission, Mission } from '../world/missions';
import { missionWon } from './prefs';
import { TILE, GATE_I, MOUNTAIN_LEVEL } from '../constants';

// The menus: the main menu at launch (when a village is waiting), the game menu, the options, the save slots and the new-village form.
export const SLOTS = 3;
class Slot { used: boolean = false; name: string = ''; clock: string = ''; difficulty: string = ''; people: number = 0; seed: number = 0; size: number = 0; thumb: string = ''; image: i32 = -1; }
const slots: Slot[] = [];
for (let i = 0; i < SLOTS; i++) slots.push(new Slot());
let loadMode = true;                       // the slot window: choosing a slot to load, or to save into
// The new-village form has two modes: the missions (0: a list, the briefing and the map of the selected one) and the sandbox (1: every option of the map, no goals, everything open).
const form = { mode: 1, mission: 0, seed: '', rand: 1, size: DEFAULT_SIZE, risks: false, preset: 0, difficulty: -1, unlimited: false, params: new TerrainParams() };

export function isModal(): boolean { return ui.window >= WIN_MENU && ui.window <= WIN_END; }
export function closeMenus(): boolean {
  if (!isModal()) return false;
  if (ui.editing) { ui.editing = false; stopTextInput(); }
  ui.window = ui.window === WIN_MENU || ui.window === WIN_MAIN || ui.window === WIN_END || ui.back === WIN_NONE ? WIN_NONE : ui.back;
  return true;
}
export function openMenu(): void { ui.window = WIN_MENU; }
/** Opens the new-village form (mode 0 the missions, 1 the sandbox, -1 as it was last): ready to start with Enter, with a fresh random seed. */
export function openNew(mode: number = -1): void {
  ui.back = ui.window; if (mode >= 0) form.mode = mode;
  form.seed = ''; form.rand = randomSeed(); form.params = copyTerrainParams(PRESETS[form.preset].params); previewKey = '';
  ui.window = WIN_NEW; ui.editing = true; startTextInput(width() / 2 - 180, height() / 2, 360, 30);
}
/** Starts a mission: its goals, knobs and start stock go to the economy first, then the village is generated from its map. */
export function startMission(id: string): void {
  const m = missionOf(id);
  if (m === null) return;
  applyMission(m.id); world.difficulty = m.difficulty;
  ui.window = WIN_NONE; ui.editing = false; stopTextInput();
  act.newVillage(m.seed, m.size, true, m.risks, copyTerrainParams(m.params));
  ui.campaign = true;                                     // the goals window opens with the briefing
}
function go(w: number): void { ui.back = ui.window; ui.window = w; }

// ---- slots ----
const THUMB_COLORS: number[] = [rgb(95, 122, 63), rgb(74, 127, 166), rgb(216, 200, 152), rgb(217, 105, 74), rgb(224, 176, 74), rgb(47, 90, 48), rgb(40, 41, 46)];
function thumbnail(): string {
  let out = '';
  for (let t = 0; t < tileCount(); t++) {
    const id = world.build[t];
    out += world.terrain[t] === TERRAIN_VOID ? '6' : world.terrain[t] === TERRAIN_WATER ? '1' : world.road[t] !== 0 ? '2' : id >= 0 ? (economy.buildings[world.buildings[id].type].housing !== null ? '3' : '4') : world.tree[t] !== 0 ? '5' : '0';
  }
  return out;
}
function refreshSlots(): void {
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i]; s.used = false;
    let meta = '';
    try { meta = storage.get('hamlet:slot:' + i + ':meta'); } catch (error) { meta = ''; }
    if (meta === '') continue;
    try {
      const d: any = JSON.parse(meta);
      s.name = String(d.name); s.clock = String(d.clock); s.people = d.people as number; s.seed = d.seed as number; s.size = d.size as number; s.difficulty = d.difficulty === undefined ? '' : String(d.difficulty); s.thumb = String(d.thumb); s.used = true;
      if (s.image >= 0) { s.image = -1; }
    } catch (error) { s.used = false; }
  }
}
function saveSlot(i: number): void {
  const meta = { name: 'Hameau ' + (i + 1), clock: dateText(), people: population(), seed: world.seed, size: world.size, difficulty: levelLabel(), thumb: thumbnail() };
  try { storage.set('hamlet:slot:' + i, snapshot()); storage.set('hamlet:slot:' + i + ':meta', JSON.stringify(meta)); act.say('Hameau enregistré dans l’emplacement ' + (i + 1) + '.'); }
  catch (error) { act.say('L’enregistrement a échoué.'); }
  refreshSlots();
}
function loadSlot(i: number): void {
  let data = '';
  try { data = storage.get('hamlet:slot:' + i); } catch (error) { data = ''; }
  if (data === '' || !restore(data)) { act.say('Cet emplacement ne peut pas être chargé.'); return; }
  act.loaded(); ui.window = WIN_NONE; act.say('Hameau chargé : emplacement ' + (i + 1) + '.');
}
function drawThumb(s: Slot, x: number, y: number, size: number): void {
  if (s.image < 0) {
    const n = s.size, px: u32[] = [];
    for (let t = 0; t < n * n; t++) px.push(THUMB_COLORS[Number(s.thumb.charAt(t))]);
    s.image = createImage(n, n); updatePixels(s.image, px, true);
  }
  drawImageRect(s.image, 0, 0, s.size, s.size, x, y, size, size, 255, ImageFlag.Nearest);
}

// ---- drawing ----
export function modal(w: number, h: number, title: string): { x: number; y: number } {
  rrect(0, 0, width(), height(), 0, 0x000000, 130);
  block(0, 0, width(), height());
  const o = winOrigin('modal', Math.floor((width() - w) / 2), Math.floor((height() - h) / 2), w, h), x = o.x, y = o.y;
  window_(x, y, w, h, title, 'modal', ui.window === WIN_MAIN ? null : (): void => { closeMenus(); });
  return { x, y };
}
export function drawMenus(): void {
  if (ui.window === WIN_MENU) menu(); else if (ui.window === WIN_MAIN) main(); else if (ui.window === WIN_OPTIONS) options();
  else if (ui.window === WIN_SAVES) saves(); else if (ui.window === WIN_NEW) fresh();
}
function column(items: string[], ids: string[], x: number, y: number, w: number, enabled: boolean[]): number {
  for (let i = 0; i < items.length; i++) labelButton(ids[i], x, y + i * 38, w, 32, items[i], '', enabled[i]);
  return y + items.length * 38;
}
function menu(): void {
  const m = modal(280, 370, 'Menu du jeu');
  column(['Reprendre', 'Enregistrer', 'Charger', 'Options', 'Missions', 'Bac à sable', 'Quitter'], ['menu:resume', 'menu:save', 'menu:load', 'menu:options', 'menu:missions', 'menu:new', 'menu:quit'], m.x + 20, m.y + 36, 240, [true, true, true, true, true, true, true]);
}
function main(): void {
  const m = modal(320, 340, 'Hameau');
  textC(kit.big, m.x + 160, m.y + 32, 'HAMEAU', col('accent'));
  textC(kit.small, m.x + 160, m.y + 66, 'Un petit village à bâtir', col('muted'));
  column(['Continuer', 'Missions', 'Bac à sable', 'Charger', 'Options'], ['menu:resume', 'menu:missions', 'menu:new', 'menu:load', 'menu:options'], m.x + 30, m.y + 100, 260, [true, true, true, true, true]);
}
function saves(): void {
  const m = modal(460, 330, loadMode ? 'Charger un hameau' : 'Enregistrer le hameau');
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i], y = m.y + 34 + i * 88;
    parchment(m.x + 12, y, 436, 80);
    if (s.used) {
      drawThumb(s, m.x + 18, y + 6, 68);
      text(kit.body, m.x + 96, y + 8, s.name + ' · graine ' + s.seed, col('ink'));
      text(kit.small, m.x + 96, y + 30, s.clock + ' · ' + s.people + ' habitants' + (s.difficulty === '' ? '' : ' · ' + s.difficulty), col('muted'));
    } else text(kit.body, m.x + 96, y + 30, 'Emplacement vide', col('muted'));
    if (loadMode) labelButton('slot:load:' + i, m.x + 330, y + 22, 106, 32, 'Charger', '', s.used);
    else labelButton('slot:save:' + i, m.x + 330, y + 22, 106, 32, 'Enregistrer');
  }
  labelButton('menu:back', m.x + 12, m.y + 304 - 6, 100, 26, 'Retour');
}
function toggle(id: string, label: string, on: boolean, x: number, y: number): void {
  labelButton(id, x, y, 56, 26, on ? 'Oui' : 'Non', '', true, on);
  text(kit.body, x + 66, y + 5, label, col('ink'));
}
function volume(id: string, label: string, v: number, x: number, y: number): void {
  labelButton(id + ':down', x, y, 26, 26, '-', 'Moins fort');
  textC(kit.body, x + 56, y + 5, Math.round(v * 100) + '%', col('ink'));
  labelButton(id + ':up', x + 86, y, 26, 26, '+', 'Plus fort');
  text(kit.body, x + 126, y + 5, label, col('ink'));
}
function options(): void {
  const m = modal(420, 472, 'Options');
  parchment(m.x + 12, m.y + 34, 396, 392);
  const x = m.x + 24;
  toggle('opt:sound', 'Son', !muted, x, m.y + 46);
  toggle('opt:edge', 'Défilement au bord de l’écran', settings.edgePan, x, m.y + 82);
  toggle('opt:hints', 'Flèches d’aide sur les bâtiments', settings.hints, x, m.y + 118);
  toggle('opt:thoughts', 'Bulles d’humeur sur les habitants', settings.thoughts, x, m.y + 154);
  toggle('opt:unlimited', 'Arbres et gibier sans limite', world.unlimited, x, m.y + 190);
  labelButton('opt:skin', x, m.y + 226, 120, 26, skinNames()[kit.skin], 'Changer le style de l’interface');
  text(kit.body, x + 130, m.y + 231, 'Style de l’interface', col('ink'));
  toggle('opt:appeal', 'Désirabilité sur la carte [V]', settings.appeal, x, m.y + 262);
  toggle('opt:fx', 'Effets de travail, fumée et lumières', settings.fx, x, m.y + 298);
  volume('vol:ambience', 'Volume de l’ambiance', settings.ambienceVolume, x, m.y + 334);
  volume('vol:sfx', 'Volume des bruitages', settings.sfxVolume, x, m.y + 370);
  labelButton('opt:debug', x, m.y + 402, 210, 26, 'Informations techniques', 'Fenêtre technique [F3]');
  text(kit.small, x + 222, m.y + 408, 'F2 : réglages du développeur', col('muted'));
  labelButton('menu:back', m.x + 12, m.y + 438, 100, 26, 'Retour');
}
// The map preview: the generator's layers of the selected seed, sampled to PREVIEW cells (water, shaded land, forest, rock, the gate), recomputed only when the request changes.
const PREVIEW = 128;
let previewKey = '', previewImage = -1;
function paintPreview(seed: number, size: number, params: TerrainParams): void {
  const p = copyTerrainParams(params);
  p.tile = TILE; p.clearI = GATE_I; p.clearJ = Math.floor(size / 2); p.clearR = 2;
  const l = terrain(seed, size, size, p), px: u32[] = [];
  for (let c = 0; c < PREVIEW * PREVIEW; c++) {
    const i = Math.floor((c % PREVIEW) * size / PREVIEW), j = Math.floor(Math.floor(c / PREVIEW) * size / PREVIEW), t = j * size + i;
    if (l.outside[t] === 1) { px.push(rgb(40, 41, 46)); continue; }
    if (l.water[t] === 1) { px.push(rgb(74, 127, 166)); continue; }
    const lv = l.level[t], nw = i > 0 && j > 0 ? l.level[t - size - 1] : lv, shade = (lv - nw) * 12;
    let r = 95 + lv * 4, g = 122 + lv * 2, b = 63 + lv * 3;
    if (l.forest[t] !== 0) { r = 47; g = 90 + lv * 2; b = 48; }
    if (lv >= MOUNTAIN_LEVEL) { r = 120 + lv * 8; g = 118 + lv * 8; b = 114 + lv * 8; }
    else if (l.rock[t] !== 0) { r = 138; g = 136; b = 128; }
    px.push(rgb(Math.max(0, Math.min(255, r + shade)), Math.max(0, Math.min(255, g + shade)), Math.max(0, Math.min(255, b + shade))));
  }
  const gx = Math.floor(GATE_I * PREVIEW / size), gy = Math.floor(PREVIEW / 2);
  for (let dy = -2; dy <= 2; dy++) for (let dx = 0; dx <= 4; dx++) if (gx + dx < PREVIEW) px[(gy + dy) * PREVIEW + gx + dx] = rgb(217, 105, 74);
  if (previewImage < 0) previewImage = createImage(PREVIEW, PREVIEW);
  updatePixels(previewImage, px, true);
}
function preview(seed: number, size: number, params: TerrainParams, x: number, y: number, side: number): void {
  const key = seed + '|' + size + '|' + [params.waterAmount, params.river ? 1 : 0, params.forestDensity, params.rockDensity, params.biome, params.coast, params.outcrop, params.flowers, params.biomes, params.relief].join(',');
  if (key !== previewKey) { previewKey = key; paintPreview(seed, size, params); }
  parchment(x - 4, y - 4, side + 8, side + 8);
  drawImageRect(previewImage, 0, 0, PREVIEW, PREVIEW, x, y, side, side, 255, ImageFlag.Nearest);
}
/** The seed and size the sandbox form stands for: the typed text (a number or a word, "name@size"), else the random seed shown in the preview. */
function request(): { seed: number; size: number } {
  if (form.seed === '') return { seed: form.rand, size: form.size };
  return parseSeedRequest(form.seed.indexOf('@') < 0 ? form.seed + '@' + form.size : form.seed);
}
function stepper(id: string, label: string, value: string, x: number, y: number): void {
  labelButton(id + ':down', x, y, 26, 26, '-'); textC(kit.body, x + 56, y + 5, value, col('ink')); labelButton(id + ':up', x + 86, y, 26, 26, '+');
  text(kit.body, x + 126, y + 5, label, col('ink'));
}
const pct = (v: number): string => Math.round(v * 100) + ' %';
function fresh(): void {
  const m = modal(640, 560, 'Nouveau hameau');
  labelButton('new:mode:0', m.x + 20, m.y + 34, 150, 28, 'Missions', 'Des scénarios avec un but, un exposé et des objectifs', true, form.mode === 0);
  labelButton('new:mode:1', m.x + 176, m.y + 34, 150, 28, 'Bac à sable', 'Tous les réglages de la carte, pas d’objectifs, tout est ouvert', true, form.mode === 1);
  if (form.mode === 0) missionForm(m.x, m.y); else sandboxForm(m.x, m.y);
  labelButton('new:create', m.x + 20, m.y + 512, 220, 32, form.mode === 0 ? 'Commencer la mission' : 'Créer le hameau');
  labelButton('menu:back', m.x + 252, m.y + 512, 140, 32, 'Annuler');
}
function missionForm(x: number, y: number): void {
  for (let k = 0; k < missions.length; k++) labelButton('new:mission:' + k, x + 20, y + 76 + k * 50, 220, 44, (k + 1) + '. ' + missions[k].title + (missionWon(missions[k].id) ? ' (réussie)' : ''), '', true, k === form.mission);
  const m: Mission = missions[form.mission];
  preview(m.seed, m.size, m.params, x + 268, y + 80, 160);
  const fx = x + 448, lines = ['Carte ' + m.size + ' × ' + m.size, 'Paysage : ' + PRESETS[m.preset].label, 'Difficulté : ' + economy.difficulties[m.difficulty].label, m.goals.length + ' objectifs', m.limitYears > 0 ? 'Limite : ' + m.limitYears + ' ans' : 'Sans limite de temps', m.risks ? 'Incendies et vols' : 'Sans risques'];
  for (let i = 0; i < lines.length; i++) text(i === 0 ? kit.body : kit.small, fx, y + 82 + i * 22, lines[i], col(i === 0 ? 'ink' : 'muted'));
  parchment(x + 256, y + 260, 360, 236);
  let cy = y + 270;
  for (const l of wrap(m.briefing, 336)) { text(kit.small, x + 268, cy, l, col('ink')); cy += kit.lineH - 2; }
  cy += 8; text(kit.small, x + 268, cy, 'Objectifs :', col('muted')); cy += kit.lineH - 2;
  for (let k = 0; k < m.goals.length; k++) { text(kit.small, x + 280, cy, (k + 1) + '. ' + m.goals[k].title, col('muted')); cy += kit.lineH - 2; }
}
function sandboxForm(x: number, y: number): void {
  const lx = x + 20, rx = x + 340;
  text(kit.body, lx, y + 76, 'Graine (un nombre ou un mot, vide : au hasard)', col('ink'));
  parchment(lx, y + 98, 200, 28);
  text(kit.body, lx + 8, y + 103, form.seed + (Math.floor(ui.time * 2) % 2 === 0 ? '_' : ''), col('ink'));
  labelButton('new:dice', lx + 208, y + 98, 80, 28, 'Hasard', 'Une autre graine');
  text(kit.body, lx, y + 138, 'Taille de la carte', col('ink'));
  labelButton('new:smaller', lx, y + 160, 34, 28, '-'); labelButton('new:bigger', lx + 102, y + 160, 34, 28, '+');
  textC(kit.body, lx + 68, y + 165, form.size + ' × ' + form.size, col('ink'));
  text(kit.body, lx, y + 202, 'Paysage', col('ink'));
  for (let k = 0; k < PRESETS.length; k++) labelButton('new:preset:' + k, lx + (k % 3) * 98, y + 224 + Math.floor(k / 3) * 30, 92, 26, PRESETS[k].label, '', true, k === form.preset);
  const p = form.params;
  stepper('new:water', 'Lacs', pct(p.waterAmount / 2), lx, y + 324);
  stepper('new:forest', 'Forêt', pct(p.forestDensity), lx, y + 356);
  stepper('new:rock', 'Roche', pct(p.rockDensity), lx, y + 388);
  stepper('new:relief', 'Relief', pct(p.relief), lx, y + 420);
  toggle('new:river', 'Rivière', p.river, lx, y + 456);
  const r = request();
  preview(r.seed, r.size, form.params, rx + 50, y + 80, 190);
  textC(kit.small, rx + 145, y + 282, 'graine ' + r.seed + ' · ' + r.size + ' × ' + r.size, col('muted'));
  toggle('new:unlimited', 'Ressources infinies', form.unlimited, rx, y + 312);
  toggle('new:risks', 'Risques (incendie, vols)', form.risks, rx, y + 348);
  text(kit.body, rx, y + 392, 'Départ', col('ink'));
  labelButton('new:level:-1', rx, y + 416, 62, 26, 'Libre', 'Le stock de départ du bac à sable', true, form.difficulty === -1);
  for (let k = 0; k < economy.difficulties.length; k++) labelButton('new:level:' + k, rx + 68 + k * 76, y + 416, 70, 26, economy.difficulties[k].label, economy.difficulties[k].hint, true, k === form.difficulty);
}

// ---- input ----
/** Typed text and editing keys while the new-village form is open. */
export function typeKey(kind: KeyKind, name: string): void {
  if (kind === KeyKind.Text) { if (form.seed.length < 24) form.seed += name; }
  else if (name === 'Backspace') form.seed = form.seed.slice(0, -1);
  else if (name === 'Enter') create();
  else if (name === 'Escape') closeMenus();
}
function create(): void {
  if (form.mode === 0) { startMission(missions[form.mission].id); return; }
  const r = request();
  applyMission(''); world.difficulty = form.difficulty;      // the sandbox keeps economy.json's goals, locks and knobs; the difficulty is read by generate(): the start of the village
  ui.window = WIN_NONE; ui.editing = false; stopTextInput();
  act.newVillage(r.seed, r.size, false, form.risks, copyTerrainParams(form.params));
  world.unlimited = form.unlimited; world.saveDirty = true;
}
/** The steppers of the sandbox map: water, forest, rock and relief, a tenth at a time (water a quarter of the lake scale). */
function tune(id: string): boolean {
  const up = id.endsWith(':up'), p = form.params, key = id.slice(4, id.lastIndexOf(':'));
  const move = (v: number, step: number, top: number): number => Math.round(Math.max(0, Math.min(top, v + (up ? step : -step))) * 100) / 100;
  if (key === 'water') p.waterAmount = move(p.waterAmount, .25, 2);
  else if (key === 'forest') p.forestDensity = move(p.forestDensity, .1, 1);
  else if (key === 'rock') p.rockDensity = move(p.rockDensity, .1, 1);
  else if (key === 'relief') p.relief = move(p.relief, .1, 1);
  else return false;
  return true;
}
export function menuClick(id: string): boolean {
  if (id === 'menu:resume') { ui.window = WIN_NONE; return true; }
  if (id === 'menu:save') { refreshSlots(); loadMode = false; go(WIN_SAVES); return true; }
  if (id === 'menu:load') { refreshSlots(); loadMode = true; go(WIN_SAVES); return true; }
  if (id === 'menu:options') { go(WIN_OPTIONS); return true; }
  if (id === 'menu:new') { openNew(1); return true; }
  if (id === 'menu:missions') { openNew(0); return true; }
  if (id === 'menu:back') { closeMenus(); return true; }
  if (id === 'menu:quit') { act.quit(); return true; }
  if (id.startsWith('slot:load:')) { loadSlot(Number(id.slice(10))); return true; }
  if (id.startsWith('slot:save:')) { saveSlot(Number(id.slice(10))); closeMenus(); return true; }
  if (id === 'new:smaller') { form.size = Math.max(MIN_SIZE, form.size - (form.size > 128 ? 32 : form.size > 32 ? 8 : 2)); return true; }
  if (id === 'new:bigger') { form.size = Math.min(MAX_SIZE, form.size + (form.size >= 128 ? 32 : form.size >= 32 ? 8 : 2)); return true; }
  if (id === 'new:dice') { form.seed = ''; form.rand = randomSeed(); return true; }
  if (id.startsWith('new:mode:')) { form.mode = Number(id.slice(9)); return true; }
  if (id.startsWith('new:mission:')) { form.mission = Number(id.slice(12)); return true; }
  if (id.startsWith('new:') && (id.endsWith(':up') || id.endsWith(':down'))) return tune(id);
  if (id.startsWith('new:level:')) { form.difficulty = Number(id.slice(10)); return true; }
  if (id.startsWith('new:preset:')) { form.preset = Number(id.slice(11)); form.params = copyTerrainParams(PRESETS[form.preset].params); return true; }
  if (id === 'new:river') { form.params.river = !form.params.river; return true; }
  if (id === 'new:unlimited') { form.unlimited = !form.unlimited; return true; }
  if (id === 'new:risks') { form.risks = !form.risks; return true; }
  if (id === 'new:create') { create(); return true; }
  if (id.startsWith('vol:')) {
    const step = id.endsWith(':up') ? .1 : -.1, v = Math.round(Math.max(0, Math.min(1, (id.startsWith('vol:ambience') ? settings.ambienceVolume : settings.sfxVolume) + step)) * 10) / 10;
    if (id.startsWith('vol:ambience')) { settings.ambienceVolume = v; refreshVolume(); } else { settings.sfxVolume = v; sound('coin', .5); }
    savePrefs(); return true;
  }
  if (id === 'opt:sound') { toggleSound(); savePrefs(); return true; }
  if (id === 'opt:edge') { settings.edgePan = !settings.edgePan; savePrefs(); return true; }
  if (id === 'opt:hints') { settings.hints = !settings.hints; savePrefs(); return true; }
  if (id === 'opt:debug') { closeMenus(); openDebug(); return true; }
  if (id === 'opt:fx') { settings.fx = !settings.fx; savePrefs(); return true; }
  if (id === 'opt:thoughts') { settings.thoughts = !settings.thoughts; savePrefs(); return true; }
  if (id === 'opt:unlimited') { world.unlimited = !world.unlimited; world.saveDirty = true; return true; }
  if (id === 'opt:appeal') { settings.appeal = !settings.appeal; return true; }
  if (id === 'opt:skin') { setSkin((kit.skin + 1) % skinNames().length); savePrefs(); return true; }
  return false;
}
