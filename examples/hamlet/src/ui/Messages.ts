import { sound } from '../audio';
import { world, tileX, tileY } from '../world/world';
import { computeHints, hintText } from '../rules/hints';
import { population } from '../engine/villagers';
import { scenarioWon } from '../rules/goals';
import { kit, col, parchment, text, wrap, addHit } from './kit';
import { ui, act } from './state';
import { focus } from '../view/focus';
import { selectBuilding } from './Info';

// The message log: typed events with the tile they happened on. A click on a message centres the camera there; urgent ones also raise a banner.
export const MSG_INFO = 0, MSG_WARN = 1, MSG_URGENT = 2;
export class Message { kind: number = 0; text: string = ''; tile: number = -1; read: boolean = false; }
export const log: Message[] = [];
export const banner = { text: '', until: 0, tile: -1 };
const known: string[] = [];
let lastPeople = 0, lastScan = -10, lastMilestone = 0, lastWon = -1;   // lastWon: -1 before the first scan (a won save does not cheer again at load)

export function post(kind: number, message: string, tile: number): void {
  for (let i = 0; i < log.length && i < 8; i++) if (log[i].text === message && log[i].tile === tile) return;   // the same event again: one line
  const m = new Message(); m.kind = kind; m.text = message; m.tile = tile; log.unshift(m);
  if (log.length > 40) log.pop();
  sound(kind === MSG_URGENT ? 'alarm' : kind === MSG_WARN ? 'notify' : 'tick', .6);
  if (kind === MSG_URGENT) { banner.text = message; banner.until = ui.time + 6; banner.tile = tile; }
}
export function unread(): number { let n = 0; for (const m of log) if (!m.read) n++; return n; }
/** The simulation's events, once a second: new severe hints and the village growing. */
export function scanEvents(): void {
  for (const line of world.news) { post(MSG_INFO, line, -1); if (line.startsWith('Objectif atteint')) sound('bell', .6); }   // goals, peddler, expeditions: said once, then cleared
  world.news = [];
  for (const a of world.alerts) {                                 // risks: fire and collapse are urgent (banner, alarm) and have their own sound
    post(a.kind === 'fire' || a.kind === 'collapse' ? MSG_URGENT : a.kind === 'theft' ? MSG_WARN : MSG_INFO, a.text, a.tile);
    if (a.kind === 'fire' || a.kind === 'collapse') sound(a.kind, .9);
  }
  world.alerts = [];
  const won = world.progression && scenarioWon() ? 1 : 0;
  if (won === 1 && lastWon === 0) { post(MSG_URGENT, 'Victoire ! Le hameau est devenu un village prospère : tous les objectifs sont atteints.', world.gate); sound('fanfare', .9); }
  lastWon = won;
  if (world.time - lastScan < 1 && world.time >= lastScan) return;
  lastScan = world.time;
  const hints = computeHints(), now: string[] = [];
  for (const h of hints) {
    const key = h.reason + '@' + h.tile; now.push(key);
    if (h.severity >= 2 && known.indexOf(key) < 0 && h.kind !== 'build_next') post(h.severity >= 3 ? MSG_URGENT : MSG_WARN, hintText(h), h.tile);
  }
  known.length = 0; for (const k of now) known.push(k);
  const people = population();
  if (people >= lastMilestone + 4 && people > lastPeople) { lastMilestone = people - (people % 4); post(MSG_INFO, 'Le hameau compte ' + people + ' habitants.', world.gate); }
  lastPeople = people;
}
export function openMessage(i: number): void {
  const m = log[i];
  if (m === undefined) return;
  m.read = true;
  if (m.tile >= 0) pointAt(m.tile);
}
let lastId = '', lastAt = -9;
/** Centres the camera on the tile and bobs an arrow over it; a second click within half a second opens the building's window. */
function pointAt(tile: number): void {
  act.jump(tileX(tile), tileY(tile));
  focus.tile = tile; focus.since = ui.time;
  if (world.build[tile] >= 0 && world.buildings[world.build[tile]].alive) { if (doubled('tile:' + tile)) selectBuilding(world.build[tile]); }
}
function doubled(id: string): boolean {
  const twice = id === lastId && ui.time - lastAt < .5;
  lastId = id; lastAt = ui.time;
  return twice;
}
/** The first unread message (the blinking button jumps to it). */
export function openNewest(): void {
  for (let i = 0; i < log.length; i++) if (!log[i].read) { openMessage(i); return; }
  if (log.length > 0) openMessage(0);
}
export function messageClick(id: string): boolean {
  if (id === 'msg:new') { openNewest(); return true; }
  if (id === 'msg:banner') { if (banner.tile >= 0) pointAt(banner.tile); banner.until = 0; return true; }
  if (!id.startsWith('msg:')) return false;
  openMessage(Number(id.slice(4))); return true;
}
/** The scroll of the column. */
export function drawMessages(x: number, y: number, w: number, h: number): void {
  parchment(x, y, w, h);
  const blink = unread() > 0 && Math.floor(ui.time * 2) % 2 === 0;
  text(kit.small, x + 8, y + 5, 'Messages', blink ? col('accent') : col('muted'));
  let py = y + 24;
  for (let i = 0; i < log.length && py < y + h - kit.lineH; i++) {
    const m = log[i], lines = wrap(m.text, w - 24), color = m.kind === MSG_URGENT ? col('bad') : m.kind === MSG_WARN ? col('warn') : col('ink');
    if (py + lines.length * kit.lineH > y + h - 4) break;
    if (!m.read) text(kit.small, x + 6, py, '•', col('accent'));
    for (let j = 0; j < lines.length; j++) text(kit.small, x + 16, py + j * kit.lineH, lines[j], color);
    addHit('msg:' + i, x + 2, py - 2, w - 4, lines.length * kit.lineH + 4, m.tile >= 0 ? 'Aller sur le lieu' : '');
    py += lines.length * kit.lineH + 6;
  }
}
/** The banner of an urgent event, under the top bar. */
export function drawBanner(cx: number, y: number): void {
  if (ui.time >= banner.until) return;
  const lines = wrap(banner.text, 420), bw = 450, bh = lines.length * kit.lineH + 14;
  parchment(cx - bw / 2, y, bw, bh);
  for (let j = 0; j < lines.length; j++) text(kit.body, cx - bw / 2 + 12, y + 7 + j * kit.lineH, lines[j], col('bad'));
  addHit('msg:banner', cx - bw / 2, y, bw, bh, 'Aller sur le lieu');
}
