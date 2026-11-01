import * as storage from 'zinc:storage';
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
import { kit, col, setSkin, skinNames, window_, parchment, text, textC, labelButton, block, addHit, measure } from './kit';
import { ui, act, WIN_NONE, WIN_MENU, WIN_OPTIONS, WIN_MAIN, WIN_SAVES, WIN_NEW } from './state';
import { dateText } from './clock';
import { savePrefs } from './prefs';

// The menus: the main menu at launch (when a village is waiting), the game menu, the options, the save slots and the new-village form.
export const SLOTS = 3;
class Slot { used: boolean = false; name: string = ''; clock: string = ''; people: number = 0; seed: number = 0; size: number = 0; thumb: string = ''; image: i32 = -1; }
const slots: Slot[] = [];
for (let i = 0; i < SLOTS; i++) slots.push(new Slot());
let loadMode = true;                       // the slot window: choosing a slot to load, or to save into
const form = { seed: '', size: DEFAULT_SIZE, campaign: false, risks: false };

export function isModal(): boolean { return ui.window >= WIN_MENU && ui.window <= WIN_NEW; }
export function closeMenus(): boolean {
  if (!isModal()) return false;
  if (ui.editing) { ui.editing = false; stopTextInput(); }
  ui.window = ui.window === WIN_MENU || ui.window === WIN_MAIN || ui.back === WIN_NONE ? WIN_NONE : ui.back;
  return true;
}
export function openMenu(): void { ui.window = WIN_MENU; }
export function openNew(): void { ui.back = ui.window; form.seed = ''; ui.window = WIN_NEW; ui.editing = true; startTextInput(width() / 2 - 180, height() / 2, 360, 30); }
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
      s.name = String(d.name); s.clock = String(d.clock); s.people = d.people as number; s.seed = d.seed as number; s.size = d.size as number; s.thumb = String(d.thumb); s.used = true;
      if (s.image >= 0) { s.image = -1; }
    } catch (error) { s.used = false; }
  }
}
function saveSlot(i: number): void {
  const meta = { name: 'Hameau ' + (i + 1), clock: dateText(), people: population(), seed: world.seed, size: world.size, thumb: thumbnail() };
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
function modal(w: number, h: number, title: string): { x: number; y: number } {
  rrect(0, 0, width(), height(), 0, 0x000000, 130);
  block(0, 0, width(), height());
  const x = Math.floor((width() - w) / 2), y = Math.floor((height() - h) / 2);
  window_(x, y, w, h, title); block(x - 6, y - 6, w + 12, h + 12);
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
  const m = modal(280, 330, 'Menu du jeu');
  column(['Reprendre', 'Enregistrer', 'Charger', 'Options', 'Nouveau hameau', 'Quitter'], ['menu:resume', 'menu:save', 'menu:load', 'menu:options', 'menu:new', 'menu:quit'], m.x + 20, m.y + 36, 240, [true, true, true, true, true, true]);
}
function main(): void {
  const m = modal(320, 300, 'Hameau');
  textC(kit.big, m.x + 160, m.y + 32, 'HAMEAU', col('accent'));
  textC(kit.small, m.x + 160, m.y + 66, 'Un petit village à bâtir', col('muted'));
  column(['Continuer', 'Nouveau hameau', 'Charger', 'Options'], ['menu:resume', 'menu:new', 'menu:load', 'menu:options'], m.x + 30, m.y + 100, 260, [true, true, true, true]);
}
function saves(): void {
  const m = modal(460, 330, loadMode ? 'Charger un hameau' : 'Enregistrer le hameau');
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i], y = m.y + 34 + i * 88;
    parchment(m.x + 12, y, 436, 80);
    if (s.used) {
      drawThumb(s, m.x + 18, y + 6, 68);
      text(kit.body, m.x + 96, y + 8, s.name + ' · graine ' + s.seed, col('ink'));
      text(kit.small, m.x + 96, y + 30, s.clock + ' · ' + s.people + ' habitants', col('muted'));
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
  textC(kit.small, m.x + 210, m.y + 410, 'F2 : réglages du développeur', col('muted'));
  labelButton('menu:back', m.x + 12, m.y + 438, 100, 26, 'Retour');
}
function fresh(): void {
  const m = modal(420, 326, 'Nouveau hameau');
  text(kit.body, m.x + 24, m.y + 38, 'Graine (un nombre ou un mot, vide : au hasard)', col('ink'));
  parchment(m.x + 24, m.y + 62, 372, 30);
  text(kit.body, m.x + 32, m.y + 68, form.seed + (Math.floor(ui.time * 2) % 2 === 0 ? '_' : ''), col('ink'));
  text(kit.body, m.x + 24, m.y + 108, 'Taille de la carte', col('ink'));
  labelButton('new:smaller', m.x + 24, m.y + 132, 34, 28, '-'); labelButton('new:bigger', m.x + 126, m.y + 132, 34, 28, '+');
  textC(kit.body, m.x + 92, m.y + 137, form.size + ' × ' + form.size, col('ink'));
  toggle('new:campaign', 'Campagne (objectifs, colporteur, aventures)', form.campaign, m.x + 24, m.y + 172);
  toggle('new:risks', 'Risques (incendie, effondrement, vols)', form.risks, m.x + 24, m.y + 208);
  labelButton('new:create', m.x + 24, m.y + 266, 180, 32, 'Créer le hameau');
  labelButton('menu:back', m.x + 216, m.y + 266, 180, 32, 'Annuler');
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
  const request = form.seed === '' ? parseSeedRequest(String(randomSeed()) + '@' + form.size) : parseSeedRequest(form.seed.indexOf('@') < 0 ? form.seed + '@' + form.size : form.seed);
  ui.window = WIN_NONE; ui.editing = false; stopTextInput(); act.newVillage(request.seed, request.size, form.campaign, form.risks);
}
export function menuClick(id: string): boolean {
  if (id === 'menu:resume') { ui.window = WIN_NONE; return true; }
  if (id === 'menu:save') { refreshSlots(); loadMode = false; go(WIN_SAVES); return true; }
  if (id === 'menu:load') { refreshSlots(); loadMode = true; go(WIN_SAVES); return true; }
  if (id === 'menu:options') { go(WIN_OPTIONS); return true; }
  if (id === 'menu:new') { openNew(); return true; }
  if (id === 'menu:back') { closeMenus(); return true; }
  if (id === 'menu:quit') { act.quit(); return true; }
  if (id.startsWith('slot:load:')) { loadSlot(Number(id.slice(10))); return true; }
  if (id.startsWith('slot:save:')) { saveSlot(Number(id.slice(10))); closeMenus(); return true; }
  if (id === 'new:smaller') { form.size = Math.max(MIN_SIZE, form.size - 2); return true; }
  if (id === 'new:bigger') { form.size = Math.min(MAX_SIZE, form.size + 2); return true; }
  if (id === 'new:campaign') { form.campaign = !form.campaign; form.risks = form.campaign; return true; }      // the campaign brings its risks, which can then be switched off
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
  if (id === 'opt:fx') { settings.fx = !settings.fx; savePrefs(); return true; }
  if (id === 'opt:thoughts') { settings.thoughts = !settings.thoughts; savePrefs(); return true; }
  if (id === 'opt:unlimited') { world.unlimited = !world.unlimited; world.saveDirty = true; return true; }
  if (id === 'opt:appeal') { settings.appeal = !settings.appeal; return true; }
  if (id === 'opt:skin') { setSkin((kit.skin + 1) % skinNames().length); savePrefs(); return true; }
  return false;
}
