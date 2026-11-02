import { polygon, rect, height } from 'zinc:gfx';
import { project } from '../pixel';
import { world, tileX, tileY, tileI, tileJ, tileAt, neighbor, heightAt, footprint, rectEdge } from '../world/world';
import { spanGap } from '../engine/services';
import { settings } from '../settings';
import { sx, sy } from '../cite/geom';
import { tileDiamond } from '../cite/draw';
import { economy } from '../world/economy';
import { HOUSE, TILE, TOOL_HOUSE, TOOL_ERASE, TERRAIN_GRASS } from '../constants';
import { appealTiles } from '../rules/appeal';
import { riskTiles, RISK_RUIN } from '../view/overlay';
import { foodKinds } from '../rules/housing';
import { kit, col, window_, winOrigin, parchment, button, text, addHit, measure } from './kit';
import { ui, mapView, viewport, columnX, STATUS_H } from './state';

// Map overlays: tiles tinted from the shared simulation data (appeal grid, house coverage, staffing, food), a legend, and the reach of a service building under the pointer.
const GOOD = 0x3f9a45, BAD = 0xc8452f, WARN = 0xd9a232, GOLD = 0xe0b13c;
export const OV_NONE = 0, OV_APPEAL = 1;
function serviceCount(): number { return economy.services.length; }
export function overlayNames(): string[] {
  const out: string[] = ['Aucun', 'Désirabilité'];
  for (const s of economy.services) out.push(s.label);
  out.push('Travail'); out.push('Vivres'); out.push('Risques');
  return out;
}
const labourIndex = (): number => 2 + serviceCount(), foodIndex = (): number => 3 + serviceCount(), riskIndex = (): number => 4 + serviceCount();
const FIRE = 0xd9532f, WEAR = 0xb98a2e, THEFT = 0x7a4fb0, RISK_COLORS: number[] = [FIRE, WEAR, THEFT, 0x30303a];

/** A tile as a tinted diamond on the map: on the corner heights in the Cité view (a slope tilts it), flat on the ground in the pixel view. */
export function tint(t: number, color: number, alpha: number): void {
  const vp = viewport();
  if (settings.view === 'cite') {
    const n = world.size, i = t % n, j = Math.floor(t / n), x = sx(i + .5, j + .5), y = sy(i + .5, j + .5, heightAt(t));
    if (x < vp.x - 80 || x > vp.x + vp.w + 80 || y < vp.y - 80 || y > vp.y + vp.h + 80) return;
    tileDiamond(t, color, alpha, false);
    return;
  }
  const cx = tileX(t), cy = tileY(t), h = TILE / 2, pts: number[] = [];
  const corners = [[cx - h, cy], [cx, cy - h], [cx + h, cy], [cx, cy + h]];
  for (const c of corners) {
    const p = project(c[0], c[1], 0);
    pts.push(mapView.x + (p.sx - mapView.cropX) * mapView.scale, mapView.y + (p.sy - mapView.cropY) * mapView.scale);
  }
  if (pts[0] < vp.x - 40 || pts[0] > vp.x + vp.w + 40 || pts[3] < vp.y - 40 || pts[3] > vp.y + vp.h + 40) return;
  polygon(pts, color, alpha);
}

const seen: number[] = [0, 0, 0];     // houses or workplaces the open overlay found good, short, bad (for the legend)
class Entry { color: number = 0; label: string = ''; }
function legendFor(o: number): Entry[] {
  const e = (c: number, l: string): Entry => { const x = new Entry(); x.color = c; x.label = l; return x; };
  if (o === OV_APPEAL) return [e(GOOD, 'Agréable (arbres, eau)'), e(BAD, 'Désagréable (industrie)')];
  if (o === labourIndex()) return [e(GOOD, 'Postes tenus : ' + seen[0]), e(WARN, 'Il manque des bras : ' + seen[1]), e(BAD, 'Personne n’y travaille : ' + seen[2])];
  if (o === riskIndex()) return [e(GOOD, 'Sûr'), e(FIRE, 'Feu qui couve'), e(WEAR, 'Bâtiment usé (effondrement)'), e(THEFT, 'Vol : rien ne garde la route'), e(RISK_COLORS[RISK_RUIN], 'Décombres')];
  if (o === foodIndex()) return [e(GOOD, 'Maisons nourries : ' + seen[0]), e(BAD, 'Sans nourriture : ' + seen[2])];
  return [e(GOOD, 'Maisons desservies : ' + seen[0]), e(BAD, 'Hors de portée : ' + seen[2])];
}

export function drawOverlay(): void {
  const o = ui.overlay;
  if (o === OV_NONE) return;
  if (o === OV_APPEAL) {
    for (const a of appealTiles()) tint(a[0], a[1] > 0 ? GOOD : BAD, Math.min(150, 40 + Math.abs(a[1]) * 18));
  } else if (o === riskIndex()) {
    for (const m of riskTiles()) tint(m[0], m[1] === 0 ? GOOD : RISK_COLORS[m[2]], m[1] === 0 ? 70 : m[1] === 1 ? 110 : 170);
    for (const p of world.crime.outlaws) { const t = tileAt(p.x, p.y); if (t >= 0) tint(t, 0xe02020, 190); }
  } else {
    seen[0] = 0; seen[1] = 0; seen[2] = 0;
    if (o >= 2 && o < 2 + serviceCount()) {                  // the ground a standing service building reaches (a walker's reach is the houses it served, tinted below)
      for (const b of world.buildings) {
        const def = economy.buildings[b.type];
        if (!b.alive || def.service === null || def.service.service !== o - 2 || def.service.walker) continue;
        const r = def.service.radius;
        for (let j = Math.max(0, b.j - r); j <= Math.min(world.size - 1, b.j + b.h - 1 + r); j++) for (let i = Math.max(0, b.i - r); i <= Math.min(world.size - 1, b.i + b.w - 1 + r); i++) {
          const t = j * world.size + i, dx = spanGap(i, 1, b.i, b.w), dy = spanGap(j, 1, b.j, b.h);
          if (dx * dx + dy * dy <= r * r && world.terrain[t] === TERRAIN_GRASS) tint(t, GOLD, 55);
        }
      }
    }
    for (const b of world.buildings) {
      if (!b.alive) continue;
      const def = economy.buildings[b.type];
      if (o === labourIndex()) { if (def.workers > 0 && !b.fixed) { const s = b.workers >= def.workers ? 0 : b.workers > 0 ? 1 : 2; seen[s]++; for (const u of footprint(b)) tint(u, s === 0 ? GOOD : s === 1 ? WARN : BAD, 150); } }
      else if (b.type === HOUSE) {
        const ok = o === foodIndex() ? foodKinds(b) > 0 : b.cover[o - 2] > 0;
        seen[ok ? 0 : 2]++; for (const u of footprint(b)) tint(u, ok ? GOOD : BAD, 150);
      }
    }
  }
}
export function drawLegend(): void {
  const o = ui.overlay;
  if (o === OV_NONE) return;
  const legend = legendFor(o), vp = viewport(), w = 230, h = 30 + legend.length * 20, x = vp.x + 12, y = vp.y + vp.h - h - 10;
  parchment(x, y, w, h);
  text(kit.small, x + 8, y + 5, overlayNames()[o], col('accent'));
  for (let i = 0; i < legend.length; i++) { rect(x + 8, y + 26 + i * 20, 12, 12, legend[i].color); text(kit.small, x + 28, y + 25 + i * 20, legend[i].label, col('ink')); }
}

/** The reach of the service building in hand, on the tile under the pointer. */
export function drawReach(tool: number, hover: number): void {
  if (hover < 0 || tool < TOOL_HOUSE || tool >= TOOL_ERASE) return;
  const def = economy.buildings[tool - TOOL_HOUSE];
  if (def.service === null) return;
  const i0 = tileI(hover), j0 = tileJ(hover);
  if (!def.service.walker) {
    const r = def.service.radius;
    for (let t = 0; t < world.size * world.size; t++) {
      const dx = spanGap(tileI(t), 1, i0, def.w), dy = spanGap(tileJ(t), 1, j0, def.h);
      if (dx * dx + dy * dy <= r * r && world.terrain[t] === TERRAIN_GRASS) tint(t, GOLD, 70);
    }
    return;
  }
  // a walker: the roads it can reach within its round, and the tiles beside them
  const seen: number[] = [], depth: number[] = [];
  for (const v of rectEdge(i0, j0, def.w, def.h)) if (world.road[v] && seen.indexOf(v) < 0) { seen.push(v); depth.push(1); }
  for (let k = 0; k < seen.length; k++) {
    if (depth[k] >= def.service.range) continue;
    for (let d = 0; d < 4; d++) { const v = neighbor(seen[k], d); if (v >= 0 && world.road[v] && seen.indexOf(v) < 0) { seen.push(v); depth.push(depth[k] + 1); } }
  }
  for (const t of seen) { tint(t, GOLD, 90); for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && !world.road[v] && world.terrain[v] === TERRAIN_GRASS) tint(v, GOLD, 45); } }
}

/** The overlay chooser, level with its button. */
export function drawOverlayMenu(): void {
  if (!ui.overlayMenu) return;
  const names = overlayNames(), w = 190, h = names.length * 30 + 38, o = winOrigin('overlays', columnX() - w - 10, Math.min(height() - h - STATUS_H - 10, 120), w, h), x = o.x, y = o.y;
  window_(x, y, w, h, 'Calques', 'overlays', (): void => { ui.overlayMenu = false; });
  for (let i = 0; i < names.length; i++) {
    button('ov:' + i, x + 8, y + 32 + i * 30, w - 16, 26, '', true, ui.overlay === i);
    text(kit.body, x + 16, y + 35 + i * 30, names[i], col('barText'));
  }
}
export function overlayClick(id: string): boolean {
  if (id === 'win:overlay') { ui.overlayMenu = !ui.overlayMenu; return true; }
  if (!id.startsWith('ov:')) return false;
  ui.overlay = Number(id.slice(3)); ui.overlayMenu = false; return true;
}
