import { rect } from 'zinc:gfx';
import { world } from '../world/world';
import { guideSteps, GuideStep } from '../rules/hints';
import { kit, col, parchment, text, wrap, labelButton } from './kit';
import { ui, act, viewport } from './state';
import { savePrefs } from './prefs';

// The guided start: a card at the corner of the map that walks a new player through the first four steps (road, house, lumber hut, well), fed by the hint system. Dismissible for good.
const W = 300;
let steps: GuideStep[] = [], at = -100, revision = -1;
function current(): GuideStep[] {
  if (revision === world.revision && ui.time - at < .5 && ui.time >= at) return steps;
  revision = world.revision; at = ui.time; steps = guideSteps();
  return steps;
}
/** The step the card shows now, or null when the guide is dismissed or finished. */
export function guideStep(): GuideStep | null {
  if (!ui.guide) return null;
  for (const s of current()) if (!s.done) return s;
  return null;
}
export function drawGuide(): void {
  const s = guideStep();
  if (s === null) return;
  const all = current(), n = all.indexOf(s), lines = wrap(s.text, W - 24), h = 62 + lines.length * kit.lineH + 30, vp = viewport(), x = vp.x + 12, y = vp.y + 12;
  parchment(x, y, W, h);
  text(kit.small, x + 12, y + 8, 'Premiers pas · ' + (n + 1) + ' sur ' + all.length, col('muted'));
  for (let i = 0; i < all.length; i++) rect(x + W - 16 - (all.length - i) * 14, y + 11, 10, 10, all[i].done ? col('good') : i === n ? col('accent') : col('stoneDark'));
  text(kit.big, x + 12, y + 24, s.title, col('accent'));
  for (let i = 0; i < lines.length; i++) text(kit.body, x + 12, y + 56 + i * kit.lineH, lines[i], col('ink'));
  labelButton('guide:tool', x + 12, y + h - 32, 130, 24, 'Choisir l’outil', 'Prend l’outil de cette étape');
  labelButton('guide:skip', x + W - 112, y + h - 32, 100, 24, 'Passer', 'Cacher ce guide pour de bon');
}
export function guideClick(id: string): boolean {
  if (id === 'guide:tool') { const s = guideStep(); if (s !== null) act.setTool(s.tool); return true; }
  if (id === 'guide:skip') { ui.guide = false; savePrefs(); return true; }
  return false;
}
