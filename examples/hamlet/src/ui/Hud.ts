import { width, height, rect, Cursor } from 'zinc:gfx';
import { world } from '../world/world';
import { economy } from '../world/economy';
import { population } from '../engine/villagers';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, TOOL_NONE } from '../constants';
import { resourceShown } from '../hud';
import { drawResource, drawGlyph, drawBuilding } from './icons';
import { kit, col, slab, well, block, button, text, textR, textC, measure, glyphButton, labelButton, addHit, parchment, BTN_PRESSED } from './kit';
import { ui, act, TOP_H, STATUS_H, COL_W, COL_FOLDED, SPEEDS, columnX, viewport } from './state';
import { drawMinimap } from './Minimap';
import { categories, flyAnchor, buildClick } from './BuildMenu';
import { drawMessages, unread, messageClick } from './Messages';
import { dateText, SEASONS, season } from './clock';

// The frame of the game: the top bar (what the village holds, its date, the speed) and the control column on the right (overview map, tools, messages).
const SLOTS = 128;
const prev: number[] = Array.from({ length: SLOTS }, (): number => -1), flashUntil: number[] = Array.from({ length: SLOTS }, (): number => 0), flashSign: number[] = Array.from({ length: SLOTS }, (): number => 0);
function flash(key: number, value: number): number {
  if (prev[key] < 0) prev[key] = value;
  if (value !== prev[key]) { flashSign[key] = value > prev[key] ? 1 : -1; flashUntil[key] = ui.time + .7; prev[key] = value; }
  return ui.time < flashUntil[key] ? flashSign[key] : 0;
}
function flashColor(sign: number): number { return sign > 0 ? col('good') : sign < 0 ? col('bad') : col('barText'); }

export function topBar(): void {
  const w = width();
  slab(0, 0, w, TOP_H); block(0, 0, w, TOP_H);
  let x = 8;
  for (let k = 0; k < economy.resources.length; k++) {
    if (!resourceShown(k)) continue;
    const n = world.stock[k], label = String(n), cw = 30 + Math.max(measure('000'), measure(label));
    well(x, 5, cw, 24);
    drawResource(k, x + 4, 7, 18);
    text(kit.body, x + 26, 8, label, flashColor(flash(k, n)));
    addHit('top:res', x, 5, cw, 24, economy.resources[k].label + '\nEn entrepôt : ' + n);
    x += cw + 5;
  }
  const people = population(), pw = 30 + Math.max(measure('000'), measure(String(people)));
  well(x, 5, pw, 24); drawGlyph('person', x + 4, 7, 18);
  text(kit.body, x + 26, 8, String(people), flashColor(flash(100, people)));
  addHit('top:pop', x, 5, pw, 24, 'Habitants');
  // right side: speed buttons, then the date and the season
  let r = w - 8;
  const glyphs = ['play', 'play', 'fast', 'fastest'];
  r -= 30; glyphButton('speed:pause', r, 4, 30, 26, 'pause', 'Pause [P]', true, ui.paused);
  for (let i = SPEEDS.length - 1; i >= 0; i--) {
    r -= 32; glyphButton('speed:' + i, r, 4, 30, 26, i === 0 ? 'left' : glyphs[i], 'Vitesse ×' + SPEEDS[i], true, !ui.paused && ui.speed === i);
  }
  const date = dateText(), season_ = SEASONS[season()], dw = measure(date) + 16;
  r -= dw + 8;
  well(r, 5, dw, 24); textC(kit.body, r + dw / 2, 8, date, col('barText'));
  addHit('top:date', r, 5, dw, 24, season_);
  const sw = measure(season_) + 16; r -= sw + 4;
  well(r, 5, sw, 24); textC(kit.body, r + sw / 2, 8, season_, col('gold'));
}

/** The tools of the column, in the order of the file: road, the buildings, demolish. */
export function toolList(): number[] {
  const out: number[] = [TOOL_ROAD], types: number[] = [];
  for (let type = 0; type < economy.buildings.length; type++) if (economy.buildings[type].gather !== 'shore' || world.hasWater) types.push(type);
  types.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order);
  for (const type of types) out.push(TOOL_HOUSE + type);
  out.push(TOOL_ERASE);
  return out;
}
export function toolName(tool: number): string {
  return tool === TOOL_ROAD ? 'Route' : tool === TOOL_ERASE ? 'Démolir' : tool >= TOOL_HOUSE ? economy.buildings[tool - TOOL_HOUSE].short : '';
}

export function column(): void {
  const x = columnX(), h = height(), w = width() - x;
  slab(x, TOP_H, w, h - TOP_H); block(x, TOP_H, w, h - TOP_H);
  glyphButton('col:fold', ui.collapsed ? x + 1 : x - 14, TOP_H + 8, 14, 40, ui.collapsed ? 'left' : 'right', ui.collapsed ? 'Montrer le panneau' : 'Replier le panneau');
  if (ui.collapsed) return;
  const pad = 12, inner = COL_W - 2 * pad;
  drawMinimap(x + pad, TOP_H + pad, inner);
  addHit('map', x + pad, TOP_H + pad, inner, inner, '', Cursor.Crosshair);
  let y = TOP_H + pad + inner + 8;
  // the four windows: advisors, overlays, messages, game menu
  const gw = (inner - 9) / 4, glyphs = ['advisor', 'eye', 'scroll', 'gear'], ids = ['win:advisor', 'win:overlay', 'msg:new', 'win:menu'];
  const tips = ['Conseillers [F]', 'Calques de la carte [O]', 'Dernier message', 'Menu du jeu [Échap]'];
  for (let i = 0; i < 4; i++) glyphButton(ids[i], x + pad + i * (gw + 3), y, gw, 28, glyphs[i], tips[i], true, (i === 1 && ui.overlay > 0) || (i === 2 && unread() > 0 && Math.floor(ui.time * 2) % 2 === 0));
  y += 34;
  // categories and the direct tools: two columns
  const cats = categories(), bw = (inner - 6) / 2, items: string[] = [], labels: string[] = [], glyphs2: string[] = [];
  items.push('tool:' + TOOL_ROAD); labels.push('Route'); glyphs2.push('road');
  for (let i = 0; i < cats.length; i++) { items.push('cat:' + i); labels.push(cats[i].label); glyphs2.push(cats[i].glyph); }
  items.push('tool:' + TOOL_ERASE); labels.push('Démolir'); glyphs2.push('erase');
  items.push('tool:' + TOOL_NONE); labels.push('Info'); glyphs2.push('eye');
  for (let i = 0; i < items.length; i++) {
    const bx = x + pad + (i % 2) * (bw + 6), by = y + Math.floor(i / 2) * 32, id = items[i];
    const selected = id.startsWith('tool:') ? ui.tool === Number(id.slice(5)) : ui.category === Number(id.slice(4));
    button(id, bx, by, bw, 28, labels[i] === 'Info' ? 'Cliquer un bâtiment ou un habitant pour le voir' : '', true, selected);
    drawGlyph(glyphs2[i], bx + 5, by + 5, 18);
    text(kit.small, bx + 27, by + 7, labels[i], col('barText'));
    if (id.startsWith('cat:') && Number(id.slice(4)) === ui.category) flyAnchor.y = by;
    if (id.startsWith('cat:') && ui.category < 0) { /* anchor set on open */ }
  }
  y += Math.ceil(items.length / 2) * 32 + 6;
  drawMessages(x + pad, y, inner, h - y - 12);
}

export function statusStrip(text_: string, color: number): void {
  const vp = viewport(), y = height() - STATUS_H;
  slab(0, y, vp.w, STATUS_H); block(0, y, vp.w, STATUS_H);
  text(kit.body, 12, y + 5, text_, color === 0 ? col('barText') : color);
}

/** A click on a widget of the frame (the id the widget registered). */
export function hudClick(id: string): void {
  if (buildClick(id) || messageClick(id)) return;
  if (id.startsWith('tool:')) { act.setTool(Number(id.slice(5))); ui.category = -1; return; }
  if (id.startsWith('cat:')) { const i = Number(id.slice(4)); ui.category = ui.category === i ? -1 : i; return; }
  if (id === 'col:fold') { ui.collapsed = !ui.collapsed; act.rebake(); return; }
  if (id === 'speed:pause') { act.togglePause(); return; }
  if (id.startsWith('speed:')) { act.setSpeed(Number(id.slice(6))); if (ui.paused) act.togglePause(); return; }
}
