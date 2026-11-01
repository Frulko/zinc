import { line, rect } from 'zinc:gfx';
import { world } from '../world/world';
import { economy, Housing } from '../world/economy';
import { population } from '../engine/villagers';
import { housingReport, levelCount } from '../rules/housing';
import { normalizePriority, movePriority } from '../rules/labour';
import { HOUSE } from '../constants';
import { drawResource, drawBuilding } from './icons';
import { kit, col, window_, parchment, text, textR, textC, meter, labelButton, glyphButton, block, well } from './kit';
import { ui, viewport, WIN_NONE, WIN_ADVISOR } from './state';
import { FEEL_WORDS, FEEL_CONTENT, houseNeeds, servicesOffered, villageWord, arrivalFactor, leavingToday } from '../rules/needs';
import { monthIndex, year } from './clock';

// The advisors: labour, food, housing and a population chart, each reading the live world. Labour is also where the player orders who is staffed first.
const TABS = ['Travail', 'Vivres', 'Logement', 'Humeur', 'Population'];
const history: number[] = [];                 // one population sample per game month (the last 36 are drawn)
let lastMonth = -1;
export function sampleHistory(): void {
  const m = monthIndex();
  if (m === lastMonth) return;
  lastMonth = m; history.push(population());
  if (history.length > 36) history.shift();
}
export function openAdvisor(tab: number): void { ui.advisor = tab; ui.window = ui.window === WIN_ADVISOR && ui.advisor === tab ? WIN_NONE : WIN_ADVISOR; }

const W = 540, H = 460;
export function drawAdvisors(): void {
  if (ui.window !== WIN_ADVISOR) return;
  const vp = viewport(), x = vp.x + Math.floor((vp.w - W) / 2), y = vp.y + Math.max(8, Math.floor((vp.h - H) / 2));
  window_(x, y, W, H, 'Conseillers'); block(x - 6, y - 6, W + 12, H + 12);
  glyphButton('adv:close', x + W - 24, y + 2, 20, 18, 'close', 'Fermer [Échap]');
  for (let i = 0; i < TABS.length; i++) labelButton('adv:tab:' + i, x + 10 + i * 104, y + 30, 100, 26, TABS[i], '', true, ui.advisor === i);
  parchment(x + 10, y + 62, W - 20, H - 72);
  if (ui.advisor === 0) labour(x + 22, y + 72); else if (ui.advisor === 1) food(x + 22, y + 72); else if (ui.advisor === 2) housing(x + 22, y + 72); else if (ui.advisor === 3) mood(x + 22, y + 72); else chart(x + 22, y + 72);
}
function labour(x: number, y: number): void {
  let jobs = 0, filled = 0, idle = 0;
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE) { jobs += economy.buildings[b.type].workers; filled += b.workers; }
  for (const p of world.people) if (p.job < 0 && p.role <= 1) idle++;
  text(kit.body, x, y, 'Habitants : ' + population() + '   Postes : ' + filled + ' / ' + jobs + '   Sans emploi : ' + idle, col('ink'));
  text(kit.small, x, y + 22, 'Les bras sont donnés dans l’ordre ci-dessous : montez ce qui compte le plus.', col('muted'));
  const order = normalizePriority(), pitch = Math.min(30, (H - 150) / Math.max(1, order.length));
  for (let i = 0; i < order.length; i++) {
    const type = order[i], d = economy.buildings[type], ry = y + 48 + i * pitch;
    let count = 0, staff = 0;
    for (const b of world.buildings) if (b.alive && b.type === type) { count++; staff += b.workers; }
    drawBuilding(type, x, ry - 4, 28);
    text(kit.small, x + 34, ry + 2, (i + 1) + '. ' + d.label + (count > 0 ? ' ×' + count : ''), count > 0 ? col('ink') : col('muted'));
    meter(x + 230, ry, 140, 16, count === 0 ? 0 : staff / (count * d.workers), staff < count * d.workers ? col('warn') : col('good'));
    text(kit.small, x + 378, ry + 2, staff + ' / ' + count * d.workers, col('ink'));
    glyphButton('prio:up:' + type, x + 440, ry - 2, 26, 20, 'left', 'Servir en premier', i > 0);
    glyphButton('prio:down:' + type, x + 470, ry - 2, 26, 20, 'right', 'Servir plus tard', i < order.length - 1);
  }
}
function food(x: number, y: number): void {
  const h = economy.buildings[HOUSE].housing as Housing;
  text(kit.body, x, y, world.waitingForFood ? 'De nouveaux venus attendent de la nourriture.' : 'Les habitants sont nourris.', world.waitingForFood ? col('bad') : col('good'));
  text(kit.small, x, y + 22, 'Réserves des entrepôts de ce que les maisons mangent :', col('muted'));
  for (let i = 0; i < h.eats.length; i++) {
    const k = h.eats[i], ry = y + 50 + i * 32;
    let makers = 0;
    for (const b of world.buildings) if (b.alive && economy.buildings[b.type].outputs[k] > 0) makers++;
    drawResource(k, x, ry - 2, 22);
    text(kit.body, x + 30, ry, economy.resources[k].label, col('ink'));
    meter(x + 190, ry, 180, 16, world.stock[k] / 40, world.stock[k] > 3 ? col('good') : col('bad'));
    text(kit.small, x + 380, ry + 1, String(world.stock[k]) + (makers === 0 ? ' · aucun producteur' : ' · ' + makers + ' producteur(s)'), makers === 0 ? col('bad') : col('ink'));
  }
}
function housing(x: number, y: number): void {
  const levels = levelCount(), counts: number[] = [], people: number[] = [], need: string[] = [], needN: number[] = [];
  for (let i = 0; i < levels; i++) { counts.push(0); people.push(0); }
  let risk = 0, houses = 0;
  for (const b of world.buildings) {
    if (!b.alive || b.type !== HOUSE) continue;
    houses++;
    const r = housingReport(b);
    counts[r.level]++; people[r.level] += r.residents;
    if (r.atRisk) risk++;
    for (const q of r.missing) { const at = need.indexOf(q.id); if (at < 0) { need.push(q.id); needN.push(1); } else needN[at]++; }
  }
  const h = economy.buildings[HOUSE].housing as Housing;
  text(kit.body, x, y, houses + ' maison(s) · ' + population() + ' habitants' + (risk > 0 ? ' · ' + risk + ' vont reculer' : ''), risk > 0 ? col('bad') : col('ink'));
  for (let i = 0; i < levels; i++) {
    const ry = y + 34 + i * 26;
    text(kit.body, x, ry, h.levels[i].label, col('ink'));
    meter(x + 190, ry + 2, 150, 14, houses === 0 ? 0 : counts[i] / houses, col('gold'));
    text(kit.small, x + 350, ry + 2, counts[i] + ' maison(s) · ' + people[i] + ' hab.', col('ink'));
  }
  let ry = y + 44 + levels * 26;
  text(kit.small, x, ry, need.length === 0 ? 'Rien ne retient les maisons de s’agrandir.' : 'Ce qui retient les maisons :', col('muted')); ry += 22;
  for (let i = 0; i < need.length; i++) {
    const k = economy.serviceOf(need[i]), label = need[i] === 'food' ? 'la nourriture' : need[i] === 'appeal' ? 'un quartier plus agréable' : k >= 0 ? economy.services[k].label.toLowerCase() : need[i];
    text(kit.body, x, ry, '• ' + needN[i] + ' maison(s) : ' + label, col('warn')); ry += 22;
  }
}
function mood(x: number, y: number): void {
  const total = world.people.length, counts: number[] = FEEL_WORDS.map((_w: string): number => 0), lacks: string[] = [], lackN: number[] = [], offered = servicesOffered();
  for (const p of world.people) counts[p.feel]++;
  for (const b of world.buildings) {
    if (!b.alive || b.type !== HOUSE || b.residents === 0) continue;
    const l = houseNeeds(b, offered).lack;
    if (l === '') continue;
    const at = lacks.indexOf(l); if (at < 0) { lacks.push(l); lackN.push(1); } else lackN[at]++;
  }
  text(kit.body, x, y, 'Humeur du hameau : ' + world.mood + ' % · ' + villageWord(world.mood) + ' · ' + world.jobless + ' % sans travail', world.mood >= 50 ? col('ink') : col('bad'));
  const arrive = arrivalFactor(world.mood), leaving = leavingToday(world.mood, total);
  text(kit.small, x, y + 22, leaving > 0 ? 'Des habitants quittent le hameau.' : arrive === 0 ? 'Personne ne vient s’installer tant que le hameau est mécontent.' : arrive < 1 ? 'Les nouveaux venus arrivent vite.' : arrive === 1 ? 'Les nouveaux venus arrivent à un rythme normal.' : 'Les nouveaux venus se font attendre.', leaving > 0 || arrive === 0 ? col('bad') : col('muted'));
  for (let i = 0; i < FEEL_WORDS.length; i++) {
    const ry = y + 52 + i * 26;
    text(kit.body, x, ry, FEEL_WORDS[i], i <= 1 ? col('ink') : col('warn'));
    meter(x + 190, ry + 2, 150, 14, total === 0 ? 0 : counts[i] / total, i === FEEL_CONTENT ? col('good') : i <= 1 ? col('gold') : col('warn'));
    text(kit.small, x + 350, ry + 2, counts[i] + ' habitant(s)', col('ink'));
  }
  let ry = y + 62 + FEEL_WORDS.length * 26;
  text(kit.small, x, ry, lacks.length === 0 ? 'Aucune maison ne se plaint d’un manque.' : 'Ce qui pèse sur les maisons :', col('muted')); ry += 22;
  for (let i = 0; i < lacks.length; i++) {
    const k = lacks[i] === 'food' || lacks[i] === 'jobs' || lacks[i] === 'appeal' ? -1 : economy.serviceOf(lacks[i]);
    const label = lacks[i] === 'food' ? 'la nourriture' : lacks[i] === 'jobs' ? 'le chômage' : lacks[i] === 'appeal' ? 'un quartier triste' : k >= 0 ? economy.services[k].label.toLowerCase() : lacks[i];
    text(kit.body, x, ry, '• ' + lackN[i] + ' maison(s) : ' + label, col('warn')); ry += 22;
  }
}
function chart(x: number, y: number): void {
  text(kit.body, x, y, 'Population · ' + population() + ' habitants · An ' + year(), col('ink'));
  const cx = x, cy = y + 34, cw = W - 64, ch = 250;
  well(cx, cy, cw, ch);
  if (history.length < 2) { textC(kit.small, cx + cw / 2, cy + ch / 2 - 6, 'Le graphique se remplit mois après mois.', col('barText')); return; }
  let top = 4;
  for (const v of history) top = Math.max(top, v);
  top = Math.ceil(top / 4) * 4;
  for (let g = 1; g <= 4; g++) { const gy = cy + ch - 6 - (ch - 12) * g / 4; rect(cx + 4, gy, cw - 8, 1, col('stoneDark')); text(kit.small, cx + 8, gy - 14, String(top * g / 4), col('muted')); }
  const step = (cw - 16) / 35;
  for (let i = 1; i < history.length; i++) {
    const x0 = cx + 8 + (i - 1) * step, x1 = cx + 8 + i * step, y0 = cy + ch - 6 - (ch - 12) * history[i - 1] / top, y1 = cy + ch - 6 - (ch - 12) * history[i] / top;
    line(x0, y0, x1, y1, col('gold')); line(x0, y0 + 1, x1, y1 + 1, col('gold'));
  }
  text(kit.small, x, cy + ch + 8, 'Un point par mois, les trois dernières années.', col('muted'));
}
export function advisorClick(id: string): boolean {
  if (id === 'adv:close') { ui.window = WIN_NONE; return true; }
  if (id.startsWith('adv:tab:')) { ui.advisor = Number(id.slice(8)); return true; }
  if (id.startsWith('prio:up:')) { movePriority(Number(id.slice(8)), -1); return true; }
  if (id.startsWith('prio:down:')) { movePriority(Number(id.slice(10)), 1); return true; }
  return false;
}
