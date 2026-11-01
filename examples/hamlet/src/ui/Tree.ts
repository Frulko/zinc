import { rect, line, clip, unclip, textWidth } from 'zinc:gfx';
import { world } from '../world/world';
import { economy, amountText, Goal, Condition } from '../world/economy';
import { HOUSE, TOOL_HOUSE } from '../constants';
import { isUnlocked, lockText } from '../rules/goals';
import { harvestLines } from '../rules/harvest';
import { buildingTip } from './BuildMenu';
import { drawBuilding, drawResource } from './icons';
import { kit, col, mix, window_, winOrigin, parchment, text, labelButton, glyphButton, block, addHit, pointer } from './kit';
import { ui, act, viewport, WIN_NONE, WIN_TREE } from './state';

// The tree window: the economy drawn as a graph, left to right, read from economy.json (nothing here lists a building).
// Tab 1, the goods: raw sources -> workshops -> goods -> houses and services. Tab 2, the progression: goals -> buildings they unlock -> house levels.
class TNode {
  kind: string = ''; id: number = 0; col: number = 0; row: number = 0; x: number = 0; y: number = 0; label: string = ''; sub: string = ''; tip: string = ''; border: number = 0; ink: number = 0; fill: number = 0;
}
class TEdge { from: number = 0; to: number = 0; red: boolean = false; }
const TABS = ['Ressources', 'Construction'];
const NW = 150, NH = 38, COLW = 190, ROWH = 48, PAD = 14;
const W = 880, H = 640;
let tab = 0, scrollX = 0, scrollY = 0, lastX = -1, lastY = -1, contentW = 0, contentH = 0;
let nodes: TNode[] = [], edges: TEdge[] = [];
let signature = '';

export function openTree(): void { ui.window = ui.window === WIN_TREE ? WIN_NONE : WIN_TREE; scrollX = 0; scrollY = 0; }
export function treeScroll(dx: number, dy: number): void { scrollX += dx; scrollY += dy; }
export function treeDrag(x: number, y: number): void { if (lastX >= 0) { scrollX += lastX - x; scrollY += lastY - y; } lastX = x; lastY = y; }

function node(kind: string, id: number, c: number, label: string): number {
  const n = new TNode(); n.kind = kind; n.id = id; n.col = c; n.label = label; nodes.push(n); return nodes.length - 1;
}
function link(from: number, to: number): void { const e = new TEdge(); e.from = from; e.to = to; edges.push(e); }
function fit(s: string, w: number): string {
  if (textWidth(kit.small, s, 0) <= w) return s;
  while (s.length > 1 && textWidth(kit.small, s + '…', 0) > w) s = s.slice(0, s.length - 1);
  return s + '…';
}
function count(type: number): number { let n = 0; for (const b of world.buildings) if (b.alive && b.type === type) n++; return n; }
function listText(amounts: number[]): string { const p: string[] = []; for (let k = 0; k < amounts.length; k++) if (amounts[k] > 0) p.push(economy.resources[k].label + ' ' + amounts[k]); return p.join(', '); }
function conditionText(c: Condition): string {
  if (c.kind === 'building') return economy.buildings[c.id].label + (c.count > 1 ? ' x' + c.count : '');
  if (c.kind === 'stock') return c.count + ' ' + economy.resources[c.id].label + ' en réserve';
  if (c.kind === 'population') return c.count + ' habitants';
  return c.count + ' maisons niveau ' + c.level;
}

/** Tab 1: the chains of goods. A building sits one column right of the goods it takes; a good one column right of its makers. */
function buildGoods(): void {
  const nb = economy.buildings.length, nr = economy.resources.length, bc: number[] = [], rc: number[] = [];
  const takes = (b: number, k: number): boolean => economy.buildings[b].inputs[k] > 0 || (economy.buildings[b].housing !== null && (economy.buildings[b].housing!.eats.indexOf(k) >= 0 || economy.buildings[b].housing!.uses.indexOf(k) >= 0));
  for (let b = 0; b < nb; b++) bc.push(0);
  for (let k = 0; k < nr; k++) rc.push(1);
  for (let pass = 0; pass < 2 * (nb + nr); pass++) {   // the passes also end on a cycle of recipes: columns stop growing at the cap
    for (let b = 0; b < nb; b++) for (let k = 0; k < nr; k++) if (takes(b, k)) bc[b] = Math.min(2 * nb, Math.max(bc[b], rc[k] + 1));
    for (let b = 0; b < nb; b++) for (let k = 0; k < nr; k++) if (economy.buildings[b].outputs[k] > 0) rc[k] = Math.min(2 * nb, Math.max(rc[k], bc[b] + 1));
  }
  let last = 0;
  for (let b = 0; b < nb; b++) last = Math.max(last, bc[b]);
  const bn: number[] = [], rn: number[] = [];
  for (let k = 0; k < nr; k++) rn.push(node('res', k, rc[k], economy.resources[k].label));
  for (let b = 0; b < nb; b++) {
    const d = economy.buildings[b]; let any = d.housing !== null;
    for (let k = 0; k < nr; k++) if (d.inputs[k] > 0 || d.outputs[k] > 0) any = true;
    bn.push(node('bld', b, any ? bc[b] : last, d.short));   // stores and services take no goods: they close the graph
  }
  for (let b = 0; b < nb; b++) for (let k = 0; k < nr; k++) {
    if (economy.buildings[b].outputs[k] > 0) link(bn[b], rn[k]);
    if (takes(b, k)) link(rn[k], bn[b]);
  }
}
/** Tab 2: what unlocks what. Free buildings, then each goal one column right of the goals it requires, its buildings after it, the house levels last. */
function buildProgress(): void {
  const ng = economy.goals.length, depth: number[] = [], gn: number[] = [], bn: number[] = [];
  for (let g = 0; g < ng; g++) { let d = 0; for (const r of economy.goals[g].requires) d = Math.max(d, depth[r] + 1); depth.push(d); }   // requires only names earlier goals
  const gate: number[] = economy.buildings.map((_d: any): number => -1);
  for (let g = 0; g < ng; g++) for (const t of economy.goals[g].unlock) gate[t] = Math.max(gate[t], 2 * depth[g] + 2);
  let last = 0;
  for (let b = 0; b < gate.length; b++) last = Math.max(last, gate[b]);
  for (let g = 0; g < ng; g++) gn.push(node('goal', g, 2 * depth[g] + 1, economy.goals[g].title));
  for (let b = 0; b < economy.buildings.length; b++) bn.push(node('bld', b, gate[b] < 0 ? 0 : gate[b], economy.buildings[b].short));
  for (let g = 0; g < ng; g++) {
    for (const r of economy.goals[g].requires) link(gn[r], gn[g]);
    for (const t of economy.goals[g].unlock) link(gn[g], bn[t]);
  }
  for (let b = 0; b < economy.buildings.length; b++) {
    const h = economy.buildings[b].housing;
    if (h === null) continue;
    for (let i = 0; i < h.levels.length; i++) {
      const lv = node('level', b * 100 + i, last + 2, h.levels[i].label); link(i === 0 ? bn[b] : nodes.length - 2, lv);
      for (const s of h.levels[i].services) for (let o = 0; o < economy.buildings.length; o++) { const sd = economy.buildings[o].service; if (sd !== null && sd.service === s) link(bn[o], lv); }
    }
  }
}

/** Rows: each column ordered by the mean row of what feeds it (two sweeps keep the lines short), then the pixel places. */
function place(): void {
  let cols = 0;
  for (const n of nodes) cols = Math.max(cols, n.col + 1);
  const byCol: number[][] = [];
  for (let c = 0; c < cols; c++) byCol.push([]);
  nodes.forEach((n: TNode, i: number): void => { byCol[n.col].push(i); n.row = byCol[n.col].length - 1; });
  for (let sweep = 0; sweep < 2; sweep++) for (let c = 1; c < cols; c++) {
    const key: number[] = nodes.map((_n: TNode): number => 0);
    for (const i of byCol[c]) {
      let sum = 0, k = 0;
      for (const e of edges) if (e.to === i) { sum += nodes[e.from].row; k++; }
      key[i] = k === 0 ? nodes[i].row : sum / k;
    }
    byCol[c].sort((a: number, b: number): number => key[a] - key[b] || a - b);
    byCol[c].forEach((i: number, r: number): void => { nodes[i].row = r; });
  }
  let rows = 1;
  for (const c of byCol) rows = Math.max(rows, c.length);
  for (const c of byCol) for (const i of c) { nodes[i].x = nodes[i].col * COLW; nodes[i].y = (nodes[i].row + (rows - c.length) / 2) * ROWH; }
  contentW = cols * COLW - (COLW - NW); contentH = (rows - 1) * ROWH + NH;
}

/** Colours, counts and tooltips: the live part, redone every frame (the shape only when the data or the tab changes). */
function paint(): void {
  for (const n of nodes) {
    n.border = col('stoneDark'); n.ink = col('ink'); n.fill = col('parchment'); n.sub = ''; n.tip = '';
    if (n.kind === 'res') {
      const r = economy.resources[n.id], have = world.stock[n.id];
      n.sub = String(have) + ' en réserve'; n.ink = have > 0 ? col('ink') : col('muted'); n.border = have > 0 ? col('good') : col('stoneDark');
      let makers = '', users = '';
      for (const d of economy.buildings) { if (d.outputs[n.id] > 0) makers += (makers === '' ? '' : ', ') + d.label; if (d.inputs[n.id] > 0 || d.cost[n.id] > 0) users += (users === '' ? '' : ', ') + d.label; }
      n.tip = r.label + '\nEn réserve : ' + have + (r.price > 0 ? '\nValeur : ' + r.price : '') + (makers !== '' ? '\nFabriqué par : ' + makers : '') + (users !== '' ? '\nUtilisé par : ' + users : '') + harvestLines(n.id, null).map((l: string): string => '\n' + l).join('');
    } else if (n.kind === 'bld') {
      const d = economy.buildings[n.id], built = count(n.id), locked = !isUnlocked(n.id);
      n.sub = locked ? lockText(n.id).replace('Se débloque avec l’objectif : ', 'Objectif : ') : built > 0 ? 'x' + built + (d.workers > 0 ? '  ' + d.workers + ' ouvriers' : '') : amountText(d.cost, null);
      n.border = locked ? col('muted') : built > 0 ? col('good') : col('gold'); n.ink = locked ? col('muted') : col('ink'); if (locked) n.fill = mix(col('parchment'), col('parchmentDark'), .7);
      for (let k = 0; k < economy.resources.length; k++) if (built > 0 && d.inputs[k] > 0 && world.stock[k] === 0) n.border = col('bad');
      n.tip = buildingTip(n.id) + (locked ? '' : '\nCliquez pour la choisir.');
    } else if (n.kind === 'goal') {
      const g: Goal = economy.goals[n.id], done = world.goals[n.id] === 1;
      n.sub = done ? 'accompli' : g.requires.every((r: number): boolean => world.goals[r] === 1) ? 'en cours' : 'plus tard';
      n.border = done ? col('good') : n.sub === 'en cours' ? col('gold') : col('muted'); n.ink = done || n.sub === 'en cours' ? col('ink') : col('muted');
      n.tip = g.title + '\n' + g.text + g.when.map((c: Condition): string => '\n- ' + conditionText(c)).join('') + (g.unlock.length > 0 ? '\nDébloque : ' + g.unlock.map((t: number): string => economy.buildings[t].label).join(', ') : '') + (g.give.some((v: number): boolean => v > 0) ? '\nOffre : ' + listText(g.give) : '');
    } else {
      const b = Math.floor(n.id / 100), i = n.id % 100, h = economy.buildings[b].housing!, lv = h.levels[i];
      let here = 0;
      for (const x of world.buildings) if (x.alive && x.type === b && x.level === i) here++;
      n.sub = 'x' + here + '  ' + lv.capacity + ' habitants'; n.border = here > 0 ? col('good') : col('stoneDark');
      n.tip = lv.label + '\nLoge ' + lv.capacity + ' habitants' + (lv.foods > 0 ? '\nVivres différentes : ' + lv.foods : '') + (lv.appeal > 0 ? '\nDésirabilité : ' + lv.appeal : '') + (lv.services.length > 0 ? '\nServices : ' + lv.services.map((s: number): string => economy.services[s].label).join(', ') : '') + '\nMaisons de ce niveau : ' + here;
    }
  }
  for (const e of edges) {
    const f = nodes[e.from], t = nodes[e.to];
    e.red = f.kind === 'res' && t.kind === 'bld' && world.stock[f.id] === 0 && count(t.id) > 0;
  }
}
/** A leftover the player cannot place (the ruin) is no part of the economy's tree. */
function prune(): void {
  const keep = nodes.map((n: TNode): boolean => !(n.kind === 'bld' && !economy.buildings[n.id].buildable)), remap: number[] = [];
  let k = 0;
  for (let i = 0; i < nodes.length; i++) remap.push(keep[i] ? k++ : -1);
  edges = edges.filter((e: TEdge): boolean => keep[e.from] && keep[e.to]);
  for (const e of edges) { e.from = remap[e.from]; e.to = remap[e.to]; }
  nodes = nodes.filter((_n: TNode, i: number): boolean => keep[i]);
}
function rebuild(): void {
  const sig = tab + ':' + economy.buildings.length + ':' + economy.resources.length + ':' + economy.goals.length;
  if (sig === signature) return;
  signature = sig; nodes = []; edges = [];
  if (tab === 0) buildGoods(); else buildProgress();
  prune(); place(); scrollX = 0; scrollY = 0;
}

export function drawTree(): void {
  if (ui.window !== WIN_TREE) return;
  if (pointer.down !== 'tree:pan') { lastX = -1; lastY = -1; }
  rebuild(); paint();
  const vp = viewport(), w = Math.min(W, vp.w - 16), h = Math.min(H, vp.h - 16), o = winOrigin('tree', vp.x + Math.floor((vp.w - w) / 2), vp.y + Math.max(8, Math.floor((vp.h - h) / 2)), w, h), x = o.x, y = o.y;
  window_(x, y, w, h, 'Arbre de l’économie', 'tree', (): void => { ui.window = WIN_NONE; });
  for (let i = 0; i < TABS.length; i++) labelButton('tree:tab:' + i, x + 10 + i * 128, y + 30, 122, 26, TABS[i], '', true, tab === i);
  const cx = x + 10, cy = y + 62, cw = w - 20, ch = h - 72 - 22;
  parchment(cx, cy, cw, ch);
  text(kit.small, cx + 2, cy + ch + 5, tab === 0 ? 'Vert : en stock ou bâti. Rouge : un intrant manque. Gris : verrouillé. Glisser pour se déplacer.' : 'Vert : accompli ou bâti. Doré : à faire. Gris : plus tard. Glisser pour se déplacer.', col('muted'));
  scrollX = Math.max(0, Math.min(scrollX, contentW + 2 * PAD - cw)); scrollY = Math.max(0, Math.min(scrollY, contentH + 2 * PAD - ch));
  addHit('tree:pan', cx, cy, cw, ch, '', 0);
  const ox = cx + PAD - scrollX, oy = cy + PAD - scrollY;
  clip(cx + 2, cy + 2, cw - 4, ch - 4);
  for (const e of edges) {
    const f = nodes[e.from], t = nodes[e.to], c = e.red ? col('bad') : mix(col('parchment'), col('ink'), .45);
    line(ox + f.x + NW, oy + f.y + NH / 2, ox + t.x, oy + t.y + NH / 2, c); line(ox + f.x + NW, oy + f.y + NH / 2 + 1, ox + t.x, oy + t.y + NH / 2 + 1, c);
  }
  for (const n of nodes) {
    const nx = ox + n.x, ny = oy + n.y;
    if (nx + NW < cx || nx > cx + cw || ny + NH < cy || ny > cy + ch) continue;
    rect(nx, ny, NW, NH, n.border); rect(nx + 2, ny + 2, NW - 4, NH - 4, n.fill);
    const iw = n.kind === 'bld' || n.kind === 'res' ? 28 : 0;
    if (n.kind === 'bld') drawBuilding(n.id, nx + 4, ny + 5, 28); else if (n.kind === 'res') drawResource(n.id, nx + 8, ny + 10, 18);
    text(kit.small, nx + 6 + iw, ny + 5, fit(n.label, NW - 12 - iw), n.ink);
    text(kit.small, nx + 6 + iw, ny + 20, fit(n.sub, NW - 12 - iw), col('muted'));
    const hx = Math.max(nx, cx), hy = Math.max(ny, cy), hw = Math.min(nx + NW, cx + cw) - hx, hh = Math.min(ny + NH, cy + ch) - hy;
    addHit('tree:n:' + nodes.indexOf(n), hx, hy, hw, hh, n.tip);
  }
  unclip();
}
export function treeClick(id: string): boolean {
  if (id === 'tree:pan') return true;
  if (id.startsWith('tree:tab:')) { tab = Number(id.slice(9)); signature = ''; return true; }
  if (id.startsWith('tree:n:')) {
    const n = nodes[Number(id.slice(7))];
    if (n.kind === 'bld' && isUnlocked(n.id)) { act.setTool(TOOL_HOUSE + n.id); ui.window = WIN_NONE; }
    return true;
  }
  return false;
}
