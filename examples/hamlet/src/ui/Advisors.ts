import { line, rect } from 'zinc:gfx';
import { world } from '../world/world';
import { economy, Housing } from '../world/economy';
import { population } from '../engine/villagers';
import { housingReport, levelCount, buildAdvice, providersOf } from '../rules/housing';
import { normalizePriority, movePriority } from '../rules/labour';
import { summary, foodStock } from '../hud';
import { HOUSE, BS_OFF_NET, BS_FULL } from '../constants';
import { drawResource, drawBuilding } from './icons';
import { kit, col, window_, winOrigin, parchment, text, textC, wrap, meter, labelButton, glyphButton, well } from './kit';
import { ui, viewport } from './state';
import { arrivalFactor, leavingToday, houseNeeds, servicesOffered, villageWord } from '../rules/needs';
import { monthIndex, year } from './clock';
import { peaceText } from '../engine/crime';

// The advisors, in the manner of Augustus: one page per question (work, housing, food and stores, services, safety, people). Every page reads the live world and every problem line says what to build.
const TABS = ['Travail', 'Logement', 'Vivres', 'Services', 'Sécurité', 'Habitants'];
const history: number[] = [];                 // one population sample per game month (the last 36 are drawn)
let lastMonth = -1;
export function sampleHistory(): void {
  const m = monthIndex();
  if (m === lastMonth) return;
  lastMonth = m; history.push(population());
  if (history.length > 36) history.shift();
}
export function openAdvisor(tab: number): void { ui.advisor = tab; ui.advisors = !ui.advisors; }

const W = 580, H = 500, TW = W - 44;
export function drawAdvisors(): void {
  if (!ui.advisors) return;
  const vp = viewport(), o = winOrigin('advisors', vp.x + Math.floor((vp.w - W) / 2), vp.y + Math.max(8, Math.floor((vp.h - H) / 2)), W, H), x = o.x, y = o.y;
  window_(x, y, W, H, 'Conseillers', 'advisors', (): void => { ui.advisors = false; });
  for (let i = 0; i < TABS.length; i++) labelButton('adv:tab:' + i, x + 10 + i * 92, y + 30, 88, 26, TABS[i], '', true, ui.advisor === i);
  parchment(x + 10, y + 62, W - 20, H - 72);
  const px = x + 22, py = y + 72;
  if (ui.advisor === 0) labour(px, py, y + H); else if (ui.advisor === 1) housing(px, py); else if (ui.advisor === 2) food(px, py); else if (ui.advisor === 3) services(px, py, false); else if (ui.advisor === 4) services(px, py, true); else people(px, py, y + H);
}
/** A sentence, wrapped; returns the next y. */
function say(x: number, y: number, s: string, color: number, small: boolean = false): number {
  const f = small ? kit.small : kit.body;
  for (const l of wrap(s, TW, f)) { text(f, x, y, l, color); y += small ? 16 : 20; }
  return y;
}

function labour(x: number, y: number, bottom: number): void {
  const l = summary().labour;
  text(kit.body, x, y, 'Habitants ' + population() + ' · bras disponibles ' + l.pool + ' · postes tenus ' + l.filled + ' / ' + l.jobs, col('ink'));
  let ny = y + 24;
  if (l.unemployed > 0) ny = say(x, ny, l.unemployed + ' habitant(s) sans travail : posez un atelier (cabane de bûcheron, ferme, scierie...) au bord d’une route reliée à la porte.', col('warn'));
  else if (l.shortage > 0) ny = say(x, ny, l.shortage + ' poste(s) vide(s) : il manque des bras, posez des maisons au bord d’une route reliée.', col('bad'));
  else ny = say(x, ny, 'Tout le monde a du travail et tous les postes sont tenus.', col('good'));
  let off = 0;
  for (const b of world.buildings) if (b.alive && b.state === BS_OFF_NET) off++;
  if (off > 0) ny = say(x, ny, off + ' bâtiment(s) hors du réseau : leur route n’atteint pas la porte, ils ne donnent aucun travail.', col('bad'));
  text(kit.small, x, ny + 2, 'Les bras vont d’abord au premier de la liste : montez ce qui compte le plus.', col('muted'));
  const full = normalizePriority(), order = full.filter((type: number): boolean => built(type)), top = ny + 26, pitch = Math.min(26, (bottom - 40 - top) / Math.max(1, order.length));
  for (let i = 0; i < order.length; i++) {
    const type = order[i], d = economy.buildings[type], ry = top + i * pitch;
    let n = 0, staff = 0;
    for (const b of world.buildings) if (b.alive && b.type === type) { n++; staff += b.workers; }
    drawBuilding(type, x, ry - 6, Math.min(26, pitch));
    text(kit.small, x + 32, ry, (i + 1) + '. ' + d.label + ' ×' + n, col('ink'));
    meter(x + 250, ry + 1, 140, Math.min(14, pitch - 3), staff / (n * d.workers), staff < n * d.workers ? col('warn') : col('good'));
    text(kit.small, x + 398, ry, staff + ' / ' + n * d.workers, col('ink'));
    glyphButton('prio:up:' + type, x + 450, ry - 4, 26, Math.min(20, pitch - 2), 'left', 'Servir en premier', i > 0);
    glyphButton('prio:down:' + type, x + 480, ry - 4, 26, Math.min(20, pitch - 2), 'right', 'Servir plus tard', i < order.length - 1);
  }
  if (order.length === 0) text(kit.small, x, top, 'Posez des ateliers : ils apparaîtront ici.', col('muted'));
  else text(kit.small, x, bottom - 30, full.length - order.length + ' autre(s) métier(s) pas encore posés suivent dans l’ordre.', col('muted'));
}
function built(type: number): boolean { for (const b of world.buildings) if (b.alive && b.type === type) return true; return false; }
/** Moves a trade one place among the trades that stand (the ones not yet built do not show, so they are stepped over). */
function movePlaced(type: number, dir: number): void {
  const full = normalizePriority();
  let at = full.indexOf(type) + dir;
  while (at >= 0 && at < full.length && !built(full[at])) at += dir;
  if (at < 0 || at >= full.length) return;
  movePriority(type, at - full.indexOf(type));
}

class Row { label: string = ''; houses: number = 0; people: number = 0; missing: string[] = []; counts: number[] = []; }
let rows: Row[] = [], rowsAt = -100, rowsRev = -1;
/** Per house level: its houses and what keeps them from the next level, counted (refreshed once a second). */
function housingRows(): Row[] {
  if (rowsRev === world.revision && ui.time - rowsAt < 1 && ui.time >= rowsAt) return rows;
  rowsAt = ui.time; rowsRev = world.revision;
  const h = economy.buildings[HOUSE].housing as Housing;
  rows = [];
  for (let i = 0; i < levelCount(); i++) { const r = new Row(); r.label = h.levels[i].label; rows.push(r); }
  for (const b of world.buildings) {
    if (!b.alive || b.type !== HOUSE) continue;
    const rep = housingReport(b), r = rows[rep.level];
    r.houses++; r.people += rep.residents;
    for (const q of rep.missing) { const at = r.missing.indexOf(q.id); if (at < 0) { r.missing.push(q.id); r.counts.push(1); } else r.counts[at]++; }
  }
  return rows;
}
function housing(x: number, y: number): void {
  const rs = housingRows();
  let houses = 0;
  for (const r of rs) houses += r.houses;
  text(kit.body, x, y, houses + ' maison(s) · ' + population() + ' habitants', col('ink'));
  if (houses === 0) { say(x, y + 26, 'Aucune maison : tracez une route depuis la porte du hameau et posez une maison à son bord.', col('warn')); return; }
  let ry = y + 28;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    text(kit.body, x, ry, r.label, col('ink'));
    meter(x + 130, ry + 3, 150, 14, r.houses / houses, col('gold'));
    text(kit.small, x + 290, ry + 3, r.houses + ' maison(s) · ' + r.people + ' hab.', col('ink'));
    ry += 22;
    if (i === rs.length - 1) { if (r.houses > 0) { text(kit.small, x + 12, ry, 'Niveau maximal.', col('good')); ry += 18; } continue; }
    if (r.houses > 0 && r.missing.length === 0) { text(kit.small, x + 12, ry, 'Elles s’agrandissent bientôt.', col('good')); ry += 18; }
    for (let m = 0; m < r.missing.length; m++) {
      const id = r.missing[m], k = economy.serviceOf(id), what = id === 'food' ? 'nourriture' : id === 'appeal' ? 'quartier plus agréable' : k >= 0 ? economy.services[k].label.toLowerCase() : id;
      ry = say(x + 12, ry, '• ' + r.counts[m] + ' maison(s) sans ' + what + ' : ' + buildAdvice(id), col('warn'), true);
    }
    ry += 4;
  }
}

function food(x: number, y: number): void {
  const h = economy.buildings[HOUSE].housing as Housing;
  let ny = say(x, y, world.waitingForFood ? 'De nouveaux venus attendent de la nourriture : posez une ferme, une pêche ou une chasse, et un entrepôt.' : foodStock() > 0 ? 'Les habitants sont nourris.' : 'Plus aucune nourriture en réserve.', world.waitingForFood || foodStock() === 0 ? col('bad') : col('good'));
  text(kit.small, x, ny, 'Ce que mangent les maisons (réserves des entrepôts) :', col('muted')); ny += 20;
  for (let i = 0; i < h.eats.length; i++) {
    const k = h.eats[i], ry = ny + i * 28;
    let makers = 0;
    for (const b of world.buildings) if (b.alive && economy.buildings[b.type].outputs[k] > 0) makers++;
    drawResource(k, x, ry - 2, 22);
    text(kit.body, x + 30, ry, economy.resources[k].label, col('ink'));
    meter(x + 170, ry + 2, 150, 14, world.stock[k] / 40, world.stock[k] > 3 ? col('good') : col('bad'));
    text(kit.small, x + 330, ry + 2, String(world.stock[k]) + (makers === 0 ? ' · aucun producteur' : ' · ' + makers + ' producteur(s)'), makers === 0 ? col('bad') : col('ink'));
  }
  ny += h.eats.length * 28 + 10;
  let stores = 0, held = 0, cap = 0, full = 0;
  for (const b of world.buildings) {
    if (!b.alive) continue;
    const d = economy.buildings[b.type];
    if (d.store && b.state !== BS_OFF_NET) { stores++; for (let k = 0; k < economy.resources.length; k++) { held += b.stock[k]; cap += d.stockCap; } }
    if (b.state === BS_FULL) full++;
  }
  text(kit.body, x, ny, 'Entrepôts : ' + stores, col('ink'));
  if (stores > 0) { meter(x + 170, ny + 2, 150, 14, cap === 0 ? 0 : held / cap, held > cap * .85 ? col('bad') : col('good')); text(kit.small, x + 330, ny + 2, held + ' / ' + cap + ' places', col('ink')); }
  ny += 24;
  if (stores === 0) say(x, ny, 'Aucun entrepôt relié : posez un entrepôt au bord de la route, sinon rien n’est rangé ni distribué.', col('bad'));
  else if (full > 0) say(x, ny, full + ' bâtiment(s) n’ont plus de place pour leur production : posez un second entrepôt près d’eux, ou réglez les ordres du premier (cliquez-le).', col('warn'));
  else say(x, ny, 'Cliquez un entrepôt pour choisir ce qu’il accepte, refuse ou va chercher.', col('muted'), true);
}

/** Coverage of the services: `safety` the risk ones (fire, repairs, watch), else water, market and the like. */
function services(x: number, y: number, safety: boolean): void {
  let ny = y;
  if (safety) ny = say(x, ny, world.risks ? peaceText() : 'Ce hameau est sans risques : ni feu, ni usure, ni voleurs.', world.risks && world.crime.peace < 50 ? col('bad') : col('ink'));
  for (let k = 0; k < economy.services.length; k++) {
    const s = economy.services[k];
    if ((s.risk !== '') !== safety || (safety && !world.risks)) continue;
    let covered = 0, houses = 0, built = 0;
    for (const b of world.buildings) {
      if (!b.alive) continue;
      const d = economy.buildings[b.type];
      if (b.type === HOUSE && b.residents > 0) { houses++; if (b.cover[k] > 0) covered++; }
      if (d.service !== null && d.service.service === k) built++;
    }
    text(kit.body, x, ny, s.label, col('ink'));
    meter(x + 130, ny + 3, 160, 14, houses === 0 ? 0 : covered / houses, covered === houses ? col('good') : col('warn'));
    text(kit.small, x + 300, ny + 3, covered + ' / ' + houses + ' maisons · ' + built + ' bâtiment(s)', col('ink'));
    ny += 22;
    const adv = built === 0 ? 'posez : ' + providersOf(k).join(' ou ').toLowerCase() + ' (aucun n’existe encore)' : covered < houses ? (houses - covered) + ' maison(s) hors de portée : prolongez la route ou posez-en un second près d’elles' : '';
    if (adv !== '') ny = say(x + 12, ny, '• ' + adv, built === 0 ? col('bad') : col('warn'), true);
    ny += 6;
  }
}

function people(x: number, y: number, bottom: number): void {
  const total = world.people.length, offered = servicesOffered(), arrive = arrivalFactor(world.mood), leaving = leavingToday(world.mood, total);
  text(kit.body, x, y, 'Humeur : ' + world.mood + ' % · ' + villageWord(world.mood) + ' · ' + world.jobless + ' % sans travail', world.mood >= 50 ? col('ink') : col('bad'));
  let ny = say(x, y + 22, leaving > 0 ? 'Des habitants quittent le hameau.' : arrive === 0 ? 'Personne ne vient tant que le hameau est mécontent.' : arrive < 1 ? 'Les nouveaux venus arrivent vite.' : arrive === 1 ? 'Les nouveaux venus arrivent à un rythme normal.' : 'Les nouveaux venus se font attendre.', leaving > 0 || arrive === 0 ? col('bad') : col('muted'), true);
  const lacks: string[] = [], lackN: number[] = [];
  for (const b of world.buildings) {
    if (!b.alive || b.type !== HOUSE || b.residents === 0) continue;
    const l = houseNeeds(b, offered).lack;
    if (l === '') continue;
    const at = lacks.indexOf(l); if (at < 0) { lacks.push(l); lackN.push(1); } else lackN[at]++;
  }
  for (let i = 0; i < lacks.length; i++) {
    const k = lacks[i] === 'food' || lacks[i] === 'jobs' || lacks[i] === 'appeal' ? -1 : economy.serviceOf(lacks[i]);
    const label = lacks[i] === 'food' ? 'la nourriture' : lacks[i] === 'jobs' ? 'le chômage' : lacks[i] === 'appeal' ? 'un quartier triste' : k >= 0 ? economy.services[k].label.toLowerCase() : lacks[i];
    ny = say(x, ny, '• ' + lackN[i] + ' maison(s) pèsent sur l’humeur : ' + label, col('warn'), true);
  }
  chart(x, ny + 6, bottom - 24);
}
function chart(x: number, y: number, bottom: number): void {
  text(kit.body, x, y, 'Population · ' + population() + ' habitants · An ' + year(), col('ink'));
  const cy = y + 26, cw = W - 64, ch = Math.max(100, bottom - cy);
  well(x, cy, cw, ch);
  if (history.length < 2) { textC(kit.small, x + cw / 2, cy + ch / 2 - 6, 'Le graphique se remplit mois après mois.', col('barText')); return; }
  let top = 4;
  for (const v of history) top = Math.max(top, v);
  top = Math.ceil(top / 4) * 4;
  for (let g = 1; g <= 4; g++) { const gy = cy + ch - 6 - (ch - 12) * g / 4; rect(x + 4, gy, cw - 8, 1, col('stoneDark')); text(kit.small, x + 8, gy - 14, String(top * g / 4), col('muted')); }
  const step = (cw - 16) / 35;
  for (let i = 1; i < history.length; i++) {
    const x0 = x + 8 + (i - 1) * step, x1 = x + 8 + i * step, y0 = cy + ch - 6 - (ch - 12) * history[i - 1] / top, y1 = cy + ch - 6 - (ch - 12) * history[i] / top;
    line(x0, y0, x1, y1, col('gold')); line(x0, y0 + 1, x1, y1 + 1, col('gold'));
  }
}
export function advisorClick(id: string): boolean {
  if (id.startsWith('adv:tab:')) { ui.advisor = Number(id.slice(8)); return true; }
  if (id.startsWith('prio:up:')) { movePlaced(Number(id.slice(8)), -1); return true; }
  if (id.startsWith('prio:down:')) { movePlaced(Number(id.slice(10)), 1); return true; }
  return false;
}
